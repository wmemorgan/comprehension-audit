# Scoring Methodology

## Philosophy

### Why eight dimensions instead of one score

A single composite score obscures more than it reveals. Two respondents can achieve identical overall scores through very different capability profiles — one might articulate tradeoffs with precision while showing no awareness of blast radius; another might demonstrate strong failure mode thinking with a vague sense of purpose. The eight-dimension breakdown makes those differences visible and actionable. Downstream routing logic can use the full breakdown, not just the band assignment.

The eight dimensions were selected to cover the full span of AI project comprehension: from initial framing (purpose, scope) through architectural decision-making (tradeoffs, intentionality) to operational risk awareness (failure modes, blast radius) and reflective learning (depth of retrospection, judgment about when to override AI). Together they distinguish shallow familiarity from genuine operational ownership.

### Why dual-run LLM evaluation

LLMs at temperature 0.0 are not perfectly deterministic in practice. Edge-case responses — ones that sit near a rubric boundary — can score differently across calls. Running the judge twice and averaging the results reduces the effect of single-run variance on the final score. If both runs agree within one point on every dimension, the merged score reflects a stable judgment. Where they disagree by more than one point, the divergence is logged for inspection; the average is still used, but the flag surfaces responses where the rubric may be ambiguous.

### Why L1–L5 bands instead of percentiles

Percentile rankings are population-relative: they tell you where a respondent sits among other respondents, not what they can do. Bands are criterion-referenced: each band is defined by observable capability thresholds, independent of who else has taken the audit. This makes band assignment interpretable without a reference population, stable over time as the user base changes, and directly actionable for routing decisions.

---

## The Eight Dimensions

All dimensions are scored on a 1–5 integer scale by the LLM judge. Raw scores are normalized and weighted to compute the overall score.

### 1. Clarity of Purpose

**Measures:** Whether the respondent can state the project's intended outcome with precision and specificity.

**Source question:** Q1

**Weight:** 0.20 (highest single weight)

**Low score (1–2):** Purpose is absent, circular ("we're building AI to do AI things"), or stated only in generic terms with no reference to outcomes or stakeholders.

**High score (4–5):** Purpose is stated with measurable outcomes, named stakeholders, and explicit success criteria. At 5, there is evidence of alignment across stakeholder groups, not just an individual definition.

**Judge indicators:** Named business function, specific metric or threshold, reference to who benefits and how, explicit definition of done.

---

### 2. Boundary Definition

**Measures:** Whether the respondent has articulated what the project does and does not include — explicit scope boundaries.

**Source question:** Q1

**Weight:** 0.15

**Low score (1–2):** No boundaries mentioned, or only vague references ("it covers most things"). No exclusions named.

**High score (4–5):** Clear inclusions and exclusions stated. At 5, edge cases and boundary conditions are addressed — the respondent has thought about what happens at the margins.

**Judge indicators:** Explicit "in scope / out of scope" framing, named exclusions, handling of ambiguous cases, evidence the respondent has had to defend the scope to others.

---

### 3. Tradeoff Articulation

**Measures:** Whether the respondent can name alternatives that were considered and articulate what was gained and given up by the chosen approach.

**Source question:** Q2

**Weight:** 0.25 (the single highest-weight dimension)

**Low score (1–2):** No alternatives mentioned, or one alternative named without analysis. "We evaluated X but went with Y" with no reasoning.

**High score (4–5):** Two or more alternatives described with substantive tradeoffs — capability, fit, risk, cost, or organizational constraints. At 5, the respondent explicitly names what the chosen approach gives up, not just what it gains. The response demonstrates that the decision was made with an understanding of its costs.

**Judge indicators:** Named alternatives (not generic "we considered other options"), specific tradeoff dimensions (not just "it was faster"), acknowledgment of what was sacrificed.

---

### 4. Architectural Intentionality

**Measures:** Whether the respondent can explain the architectural decisions behind the project with stated design principles or constraints.

**Source question:** Q2

**Weight:** 0.15

**Low score (1–2):** Technology choices mentioned without rationale ("we used X"). No design principles or constraints articulated.

**High score (4–5):** Architecture described with explicit design principles (e.g., statelessness, separation of concerns, latency budget). At 5, there is also a sense of how the architecture is expected to evolve — constraints are acknowledged and a plausible evolution path is sketched.

**Judge indicators:** Named design principles, constraints that shaped decisions, reference to future evolution or known limitations of the current design.

---

### 5. Failure Mode Awareness

**Measures:** Whether the respondent has thought through how the project can fail and what mitigations are in place.

**Source question:** Q3

**Weight:** 0.15

**Low score (1–2):** No failure modes identified, or one generic failure ("it could go down") with no mitigation.

**High score (4–5):** Multiple specific failure modes named with concrete mitigation strategies. At 5, the response also addresses monitoring (how failures are detected) and recovery (how the system returns to a healthy state), not just prevention.

**Judge indicators:** Named failure categories (not just "it might fail"), specific mitigations tied to specific failure modes, evidence of having observed or planned for actual failures.

---

### 6. Blast Radius Articulation

**Measures:** Whether the respondent understands the downstream impact of a failure — what systems, users, or processes would be affected.

**Source question:** Q3

**Weight:** 0.10

**Low score (1–2):** No acknowledgment of impact beyond the immediate system, or only a vague "things could go wrong."

**High score (4–5):** The respondent can map the failure's propagation — which systems depend on this one, which users are affected, what processes break. At 5, there is also a containment strategy: circuit breakers, feature flags, rollback procedures, or progressive rollout that limits the blast radius before full deployment.

**Judge indicators:** Named dependent systems or user groups, quantified or bounded scope of impact, explicit containment or rollback strategy.

---

### 7. Reflection Depth

**Measures:** Whether the respondent has extracted durable lessons from the project — not just acknowledgment that things were hard, but specific learning that changed their approach.

**Source question:** Q4

**Weight:** 0.10

**Low score (1–2):** No reflection, or surface-level ("it was challenging but we learned a lot"). No specific lesson named.

**High score (4–5):** Specific lessons named with context about why they were surprising or non-obvious. At 5, the reflection shows systemic thinking — the lesson connects to a change in methodology, process, or mental model, not just a one-time fix.

**Judge indicators:** A named lesson with a "this surprised me because..." structure, evidence the lesson changed subsequent behavior, connection between past failure and current practice.

---

### 8. AI Override Evidence

**Measures:** Whether the respondent has demonstrated judgment about when to accept and when to reject AI-generated output.

**Source question:** Q4

**Weight:** 0.05

**Low score (1–2):** No evidence of ever questioning AI output, or a single passing mention ("I checked its work") with no example.

**High score (4–5):** A concrete example where the respondent identified a problem with AI output and overrode it, with reasoning. At 5, there is a pattern or framework — the respondent has developed heuristics for when to trust, when to verify, and when to discard AI suggestions.

**Judge indicators:** Named instance of override with stated reason, description of what signal prompted skepticism, generalized approach to AI output validation.

---

## Overall Score Computation

Each dimension score (1–5) is first normalized to a [0, 1] scale:

```
normalized_score = dimension_score / 5.0
```

The normalized scores are weighted and summed:

```
weighted_sum = Σ (normalized_score_i × weight_i)
```

Since weights sum to 1.0, the overall `raw_score` equals the weighted sum directly:

```
raw_score = weighted_sum  ∈ [0.0, 1.0]
```

`raw_score` is rounded to three decimal places. For display purposes, multiply by 100 to express as a percentage (0–100).

**Dimension weights summary:**

| Dimension | Weight |
|---|---|
| Tradeoff Articulation | 0.25 |
| Clarity of Purpose | 0.20 |
| Boundary Definition | 0.15 |
| Architectural Intentionality | 0.15 |
| Failure Mode Awareness | 0.15 |
| Blast Radius Articulation | 0.10 |
| Reflection Depth | 0.10 |
| AI Override Evidence | 0.05 |
| **Total** | **1.00** |

---

## L1–L5 Band Thresholds

| Band | Raw Score Range | Score (%) | Description |
|---|---|---|---|
| L5 | ≥ 0.850 | 85–100 | Comprehensive operational ownership with measurable outcomes, explicit tradeoff reasoning, full failure/blast-radius awareness, and systematic AI judgment |
| L4 | 0.700–0.849 | 70–84 | Strong comprehension across most dimensions; may have isolated gaps (e.g., blast radius or AI override evidence underdeveloped) |
| L3 | 0.500–0.699 | 50–69 | Functional comprehension; purpose and architecture are clear, but tradeoff reasoning is surface-level or failure thinking is incomplete |
| L2 | 0.300–0.499 | 30–49 | Partial comprehension; some dimensions articulated but major gaps remain — typically weak on tradeoffs, failure modes, or reflection |
| L1 | < 0.300 | 0–29 | Minimal comprehension; responses indicate familiarity with the project's existence but not operational understanding |

Bands are assigned deterministically from `raw_score` using fixed thresholds. There is no interpolation or population-relative adjustment.

---

## Dual-Run Reliability

The judge is called twice for every submission, with the same prompt and input, at `temperature: 0.0`.

**Merge rule:** For each dimension, the merged score is the simple average of run 1 and run 2, rounded to the nearest integer:

```
merged_score = round((run1_score + run2_score) / 2)
```

**Disagreement threshold:** If `|run1_score - run2_score| > 1` for any dimension, the dimension is flagged as a disagreement and logged. The average is still used — the flag is informational, not a blocker.

**Interpretation:** A high disagreement rate across submissions indicates that the rubric boundary for a particular dimension may be ambiguous for certain response types. Review flagged submissions to identify rubric refinement opportunities.

**Failure handling:** If either run fails (API error, JSON parse failure, out-of-range score), the run is retried once after 2 seconds. If the retry fails, the exception propagates. There is no silent fallback to a single run — a single-run result would undermine the reliability guarantee the dual-run is designed to provide.

---

## Calibration Process

Calibration examples are stored in `examples/calibration/{L1,L2,L3,L4,L5}/` as JSON files conforming to the `CalibrationExample` interface:

```typescript
{
  band: 'L1' | 'L2' | 'L3' | 'L4' | 'L5';
  input: {
    responses: [string, string, string, string];  // q1, q2, q3, q4
  };
  expected_scores: {
    overall: number;          // 0–100
    dimensions: Record<string, number>;  // 1–5 per dimension
  };
  rationale: string;
}
```

The validation script (`scripts/validate-calibration.ts`) runs each example's `expected_scores.dimensions` through `computeScores` and compares the computed overall score to `expected_scores.overall`. An example passes if:

1. The absolute difference between computed and expected overall score is ≤ 3 points.
2. The assigned band matches the example's declared band.

**Acceptable tolerance:** ±3 points on the 0–100 scale. This accommodates integer rounding across the weighted average without masking genuine scoring errors.

**Recommended set size:** At least 4 examples per band (20 minimum). Each example should represent a qualitatively distinct response pattern within the band — not just variations of the same response.

---

## Limitations and Known Edge Cases

**Non-English responses:** The rubric and judge prompt are written in English. Non-English responses may score inconsistently due to translation ambiguity in the judge's reasoning, particularly for nuanced dimensions like `tradeoff_articulation` and `reflection_depth`.

**Very short but high-quality responses:** The 200-character minimum per question rejects responses that are short but substantive. Respondents who write with economy may be filtered before reaching the judge.

**Question misinterpretation:** Respondents who misread a question and answer a different one will produce scores that don't reflect their actual comprehension. Q3 (failure modes) is most commonly misread as a general risk question rather than a failure-specific one.

**Rehearsed responses:** The rubric rewards certain structural patterns (named alternatives, explicit exclusions, specific failure modes). Respondents who have seen the rubric can score higher by mimicking the pattern without substantive underlying knowledge. The calibration set includes examples designed to distinguish structural mimicry from genuine comprehension, but the judge cannot fully resolve this.

**AI override evidence saturation:** `ai_override_evidence` carries the lowest weight (0.05) because it is the dimension most susceptible to gaming — a single fabricated anecdote scores at 4. The low weight limits its impact on the overall score.

**Disagreement rate as a signal:** A `disagreements` array with multiple entries does not invalidate the result, but it is a useful diagnostic. If a specific dimension disagrees across many submissions, the rubric language for that dimension likely has a boundary ambiguity that should be addressed.
