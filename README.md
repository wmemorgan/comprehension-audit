# Comprehension Audit

> LLM-powered diagnostic that scores organizational AI comprehension
> across 8 dimensions and assigns L1–L5 maturity bands.

[![CI](https://github.com/wmemorgan/comprehension-audit/actions/workflows/ci.yml/badge.svg)](https://github.com/wmemorgan/comprehension-audit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)

---

## What It Does

Takes four free-text responses to diagnostic questions about an AI project, runs them through a dual-pass LLM evaluation at temperature 0.0, scores across eight weighted dimensions, and assigns a maturity band (L1–L5). Results are routed to configurable downstream integrations via a typed interface layer — band router, email provider, and webhook are all swappable without touching core scoring logic.

## Architecture

```
Input → Sanitization → Judge (dual-run LLM) → Scoring → Band Assignment
                                                               │
                                           ┌───────────────────┼───────────────────┐
                                           ▼                   ▼                   ▼
                                      BandRouter         EmailProvider       PipelineWebhook
                                      (required)          (optional)          (optional)
```

`BandRouter` is the only required integration — defaults to `ConsoleRouter`. `EmailProvider` and `PipelineWebhook` degrade gracefully when absent.

## Quick Start

```bash
git clone https://github.com/wmemorgan/comprehension-audit.git
cd comprehension-audit
cp .env.example .env
# Add your Anthropic API key to .env
npm install
npm run dev
```

Open `http://localhost:8888/comprehension-audit`

## The 8 Dimensions

| Dimension | Weight | What It Measures |
|-----------|--------|------------------|
| Tradeoff Articulation | 0.25 | Named alternatives considered; what was gained and explicitly given up |
| Clarity of Purpose | 0.20 | Intended outcome stated with measurable precision and named stakeholders |
| Boundary Definition | 0.15 | Explicit inclusions, exclusions, and edge case handling |
| Architectural Intentionality | 0.15 | Design principles and constraints behind architectural choices |
| Failure Mode Awareness | 0.15 | Specific failure modes with concrete mitigations, monitoring, and recovery paths |
| Blast Radius Articulation | 0.10 | Downstream impact of a failure — affected systems, users, and containment strategy |
| Reflection Depth | 0.10 | Durable lessons that changed subsequent behavior, not just acknowledgment of difficulty |
| AI Override Evidence | 0.05 | Demonstrated judgment about when to accept and when to reject AI-generated output |

## Scoring & Maturity Bands

| Band | Score | Description |
|------|-------|-------------|
| L5 | ≥ 85% | Comprehensive operational ownership: measurable outcomes, explicit tradeoffs, full failure/blast-radius awareness, systematic AI judgment |
| L4 | 70–84% | Strong comprehension across most dimensions; isolated gaps (e.g., blast radius or AI override underdeveloped) |
| L3 | 50–69% | Functional comprehension; purpose and architecture clear but tradeoffs are surface-level or failure thinking is incomplete |
| L2 | 30–49% | Partial comprehension; some dimensions articulated but major gaps remain |
| L1 | < 30% | Minimal comprehension; familiarity with the project's existence without operational understanding |

Bands are criterion-referenced against fixed thresholds — not relative to other submissions.

## Integration Layer

The pipeline uses a typed interface architecture. Swap implementations to connect your own infrastructure without modifying core scoring logic.

### BandRouter (required)

Routes each scored result to a downstream action or sequence.

```typescript
import type { BandRouter, ScoringResult } from './src/types';
import { createAuditPipeline } from './src';

class SlackRouter implements BandRouter {
  async route(result: ScoringResult): Promise<void> {
    await postToSlack(`#audit-results`, `Band: ${result.maturity_band} | Score: ${result.raw_score}`);
  }
}

const pipeline = createAuditPipeline({ bandRouter: new SlackRouter() });
```

The default `ConsoleRouter` logs to stdout — useful for local development without any external dependencies.

### EmailProvider (optional)

Upserts contacts and checks submission rate limits via an email platform.

```typescript
import { BrevoProvider } from './src/integration/email-provider';

const pipeline = createAuditPipeline({
  emailProvider: new BrevoProvider(process.env.EMAIL_API_KEY!),
});
```

Omit to skip all email integration. The pipeline proceeds without it.

### PipelineWebhook (optional)

Fires a POST request to an external endpoint after scoring completes.

```typescript
import { HttpWebhook } from './src/integration/pipeline-webhook';

const pipeline = createAuditPipeline({
  pipelineWebhook: new HttpWebhook(process.env.PIPELINE_WEBHOOK_URL!),
});
```

## Project Structure

```
src/
  index.ts                              Pipeline factory
  types.ts                              Shared TypeScript interfaces
  judge/index.ts                        Dual-run LLM evaluation
  scoring/index.ts                      8-dimension weighted scoring
  sanitization/index.ts                 Input validation & injection detection
  fallback/index.ts                     Graceful degradation
  security/index.ts                     CORS & rate limiting
  calibration/index.ts                  Calibration data loader
  integration/
    band-router/index.ts                BandRouter interface + ConsoleRouter
    email-provider/index.ts             EmailProvider interface + BrevoProvider
    pipeline-webhook/index.ts           PipelineWebhook interface + HttpWebhook
  frontend/
    ComprehensionAudit.tsx              React diagnostic UI
    RadarChart.tsx                      8-dimension SVG radar chart
  pages/
    comprehension-audit.astro           Diagnostic page at /comprehension-audit
docs/
  ARCHITECTURE.md                       System architecture
  SCORING_METHODOLOGY.md                Scoring algorithm details
examples/calibration/                   25 calibration examples (L1–L5)
scripts/validate-calibration.ts         Calibration validator
```

## Calibration

`examples/calibration/` contains 25 examples (5 per band) representing qualitatively distinct response patterns within each maturity level. Run validation to confirm the scoring engine produces expected results:

```bash
npm run validate-calibration
```

An example passes if its computed overall score is within ±3 points of the declared expected and the assigned band matches. Add new examples as JSON files following the `CalibrationExample` interface in `src/calibration/index.ts`.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LLM_API_KEY` | Yes | Anthropic API key |
| `LLM_MODEL` | Yes | Claude model ID (e.g., `claude-sonnet-4-20250514`) |
| `EMAIL_API_KEY` | No | Brevo API key; omit to skip email integration |
| `EMAIL_LIST_IDS` | No | Comma-separated Brevo list IDs for band-specific sequences |
| `PIPELINE_WEBHOOK_URL` | No | Webhook endpoint for post-scoring notifications |
| `REPORT_BASE_URL` | No | Base URL for per-submission report links |
| `PUBLIC_AUDIT_API_URL` | No | Frontend API endpoint (default: `/api/audit-submit`) |
| `ALLOWED_ORIGIN` | No | CORS allowed origin (default: `*`) |

## Tech Stack

- **Runtime:** Node.js + TypeScript (strict mode)
- **Frontend:** React + Tailwind CSS
- **LLM:** Anthropic Claude (configurable model)
- **Deployment:** Netlify Functions
- **Framework:** Astro

## Documentation

- [Architecture Guide](docs/ARCHITECTURE.md)
- [Scoring Methodology](docs/SCORING_METHODOLOGY.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

MIT — see [LICENSE](LICENSE) for details.
