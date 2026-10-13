# Architecture

## System Overview

The Comprehension Audit is a serverless evaluation pipeline that accepts free-text responses to four diagnostic questions, runs them through a dual-pass LLM judge, scores across eight weighted dimensions, assigns a maturity band (L1–L5), and routes results to configurable downstream integrations.

The four questions probe distinct aspects of AI project comprehension:

- **Q1** — Purpose and scope clarity
- **Q2** — Architecture and tradeoff reasoning
- **Q3** — Failure mode and blast radius awareness
- **Q4** — Reflection depth and AI override judgment

Each question maps to specific scoring dimensions. The LLM judge evaluates all four responses in a single prompt, scored on a 1–5 integer scale per dimension.

## Module Map

```
AuditInput (q1, q2, q3, q4, email)
    │
    ▼
Sanitization
  - HTML-escape user text before LLM prompt construction
  - Validate email format and reject disposable domains
  - Enforce response length bounds (200–4000 chars per question)
    │
    ▼
Judge (LLM, dual-run, temperature 0.0)
  - Run 1: independent LLM evaluation → raw dimension scores
  - Run 2: independent LLM evaluation → raw dimension scores
  - Merge: average across runs; log disagreements where |diff| > 1
    │
    ▼
Scoring
  - Weighted average of normalized dimension scores
  - Assign maturity band (L1–L5) based on overall score
    │
    ▼
    ┌─────────────────────────────────────┐
    │                                     │
    ▼                 ▼                   ▼
BandRouter        EmailProvider     PipelineWebhook
(required)        (optional)        (optional)
```

`BandRouter` is the only required integration. The default implementation (`ConsoleRouter`) logs the result; replace it with a custom router to trigger band-specific sequences. `EmailProvider` and `PipelineWebhook` are both optional and degrade gracefully when absent.

## Judge Module

**Location:** `src/judge/index.ts`

The judge sends the four sanitized responses to an LLM endpoint in a structured system prompt that defines the 8-dimension rubric and mandates JSON-only output. It runs twice independently and merges the results.

**Temperature:** `0.0` for all calls. Determinism is the goal; the dual-run exists to catch non-deterministic drift at the edges of the model's scoring distribution, not to explore variation.

**Disagreement handling:** If the absolute difference between run 1 and run 2 for any dimension exceeds 1 point, the disagreement is logged but the simple average is still used. This provides observability without blocking the pipeline.

**Retry logic:** If a run fails (network error, malformed JSON, out-of-range score), it retries once after a 2-second delay. If the retry also fails, the exception propagates to the caller.

**Output validation:** Every dimension score must be an integer in [1, 5]. If the LLM returns a non-integer, a float, or a value outside range, the run is rejected as invalid before the merge step.

## Scoring Module

**Location:** `src/scoring/index.ts`

Each raw dimension score (1–5) is normalized to a 0–1 scale (`score / 5.0`), multiplied by its weight, and summed. The sum is then divided by the total weight (which equals 1.0) to produce `raw_score` in [0, 1].

```
raw_score = Σ (dimension_score / 5.0 × weight) / Σ weights
```

`raw_score` is rounded to three decimal places. The maturity band is assigned based on fixed thresholds (see `SCORING_METHODOLOGY.md`).

The module also computes `dimension_breakdown` — each dimension's fractional contribution to the overall score — which the frontend uses to render the radar chart. `strongest_dimension` and `weakest_dimension` are derived from this breakdown.

## Integration Layer

**Location:** `src/integration/`

Integrations are typed via three interfaces in `src/types.ts`:

```typescript
interface BandRouter {
  route(result: ScoringResult): Promise<void>;
}

interface EmailProvider {
  upsertContact(contact: ContactData): Promise<void>;
  checkSubmissionLimit?(email: string): Promise<{ limited: boolean; message?: string }>;
}

interface PipelineWebhook {
  notify(result: ScoringResult, metadata: WebhookMetadata): Promise<void>;
}
```

**BandRouter** (required) — receives the full `ScoringResult` and triggers band-specific follow-up logic. The included `ConsoleRouter` logs the result to stdout. Implement `BandRouter` and inject it via `PipelineConfig` to route to a marketing automation sequence, a CRM, or any band-specific workflow.

**EmailProvider** (optional) — exposes `upsertContact` for writing the scored result back to a contact record, and optionally `checkSubmissionLimit` for rate-limiting by email address. The reference implementation targets Brevo's transactional API; any provider conforming to the interface can be substituted.

**PipelineWebhook** (optional) — fires a POST to a configurable URL with the full result and submission metadata. The reference implementation (`HttpWebhook`) includes a `submissionId` (SHA-256 of email + timestamp, truncated to 12 hex chars) and an optional `reportUrl`.

All three integrations are injected through `PipelineConfig` at the call-site in the Netlify function handler, making them testable in isolation without mocking the HTTP layer.

## Security Model

**Input sanitization:** All four response fields are HTML-escaped (`<` → `&lt;`, `>` → `&gt;`) before inclusion in the LLM prompt. This neutralizes the most common prompt injection vector for HTML-embedded instructions.

**Email validation:** The email field is validated against a basic RFC-compliant regex and checked against a static blocklist of known disposable email domains. Submissions from disposable addresses are rejected before any LLM call is made.

**Length bounds:** Each response field is rejected if shorter than 200 characters or longer than 4000 characters. The lower bound prevents gaming with minimal input; the upper bound limits prompt token consumption.

**CORS:** Responses include configurable `Access-Control-Allow-Origin` headers. The allowed origin is set via the `ALLOWED_ORIGIN` environment variable; it defaults to `*` when unset (appropriate for development, not for production deployments).

**Rate limiting:** If an `EmailProvider` with `checkSubmissionLimit` is configured, the function checks submission frequency before invoking the LLM judge. Rate limit responses return HTTP 429 with a descriptive message.

## Deployment

The audit endpoint runs as a single Netlify Function at `/.netlify/functions/audit-submit`, exposed via a redirect rule at `/api/audit-submit`.

**Environment variables:**

| Variable | Required | Description |
|---|---|---|
| `LLM_API_KEY` | Yes | API key for the LLM provider |
| `LLM_MODEL` | No | Model identifier (default: `claude-sonnet-4-6`) |
| `EMAIL_API_KEY` | No | API key for the email provider |
| `EMAIL_LIST_IDS` | No | Comma-separated list IDs for contact upsert |
| `PIPELINE_WEBHOOK_URL` | No | Webhook endpoint for pipeline notifications |
| `REPORT_BASE_URL` | No | Base URL prepended to per-submission report links |
| `PUBLIC_AUDIT_API_URL` | No | Frontend API path (default: `/api/audit-submit`) |
| `ALLOWED_ORIGIN` | No | CORS allowed origin (default: `*`) |

**Local development:**

```bash
npm install
cp .env.example .env  # fill in LLM_API_KEY at minimum
netlify dev           # starts function server + frontend proxy
```

The frontend dev server proxies `/api/audit-submit` to the local Netlify Functions runtime. No separate function process is needed.

**Build:**

```bash
npm run build
```

Netlify bundles functions with esbuild. TypeScript is compiled as part of the build step.

## Calibration

Calibration examples live in `examples/calibration/{L1,L2,L3,L4,L5}/`. Each file is a JSON object with four pre-written responses, pre-scored dimension values, an expected overall score, and a rationale.

To validate scoring consistency:

```bash
npx ts-node scripts/validate-calibration.ts
```

The script runs each example's expected dimension scores through `computeScores`, compares the computed overall score to the expected value, and reports any example where the delta exceeds ±3 points or the assigned band does not match.

To add new examples: create a JSON file in the appropriate band subdirectory following the schema in `src/calibration/index.ts` (`CalibrationExample`). The set should maintain at least four examples per band.
