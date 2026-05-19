# 8-Dimension Weighted Scoring — Why It's Built This Way

## What This Module Does

The scoring module takes the merged per-dimension scores from the judge and produces a normalized `ScoringResult`: a raw score in [0, 1], a maturity band (L1–L5), a weighted contribution breakdown for every dimension, and the strongest and weakest dimensions by weighted contribution. It's a pure transform — no I/O, no side effects, entirely deterministic given the same judge output.

## The Decision

Eight dimensions wasn't an arbitrary number. Each dimension maps to one of four audit questions: questions 1 and 2 each drive two dimensions, questions 3 and 4 each drive two dimensions. The structure is deliberate — you can't score `tradeoff_articulation` from question 1 or `clarity_of_purpose` from question 2, because those responses are specifically eliciting different kinds of thinking. The dimensions had to be grounded in observable evidence in the submission, not inferred from tone or length.

The weights are the most important design decision in this module. `tradeoff_articulation` is weighted at 0.25 — the highest of any dimension — because it's the strongest discriminator between genuine architectural thinking and surface-level compliance. Someone can write a clear, well-bounded project description (high `clarity_of_purpose`, high `boundary_definition`) without demonstrating any judgment about why they made the choices they made. But explaining what you considered, what you gave up, and why the chosen approach was worth its costs requires a fundamentally different cognitive mode. That's what I'm trying to measure, and the weight reflects that.

`ai_override_evidence` sits at 0.05 — present but not decisive. It matters whether someone can identify a case where they pushed back on an AI-generated suggestion, but it's a weak signal compared to tradeoff analysis. A score of 5 on this dimension when everything else is mediocre tells you something narrow; it doesn't tell you the person thinks well. The 0.05 weight keeps it in the model without letting a single great anecdote paper over structural weaknesses elsewhere.

The L1–L5 band thresholds (0.30, 0.50, 0.70, 0.85) are not evenly spaced, and that's intentional. The gap between L4 and L5 is 0.15, while the gaps between the lower bands are 0.20. L5 should be hard to reach — it represents consistent high performance across all eight dimensions, not just excellence in one or two. If I'd used a linear 0.20 increment throughout, L5 would trigger at 0.80, which felt too low for what L5 is supposed to represent. The top band earns a tighter gate.

The normalization step divides the weighted sum by `TOTAL_WEIGHT` rather than by 1.0 directly. In the current configuration, `TOTAL_WEIGHT` is exactly 1.0 because the weights were designed to sum to 1.0. The divide-by-`TOTAL_WEIGHT` step is defensive — if a future version adds or adjusts dimensions and the weights temporarily don't sum to exactly 1.0 due to floating-point arithmetic or mid-refactor state, the score stays bounded and interpretable instead of silently inflating or deflating. It costs nothing and prevents a class of subtle bugs.

Per-dimension contributions are computed and returned alongside the raw score, not just the overall number. This was a UX decision as much as a technical one. A single score of 0.68 is not actionable. Knowing that `tradeoff_articulation` contributed 0.042 out of a possible 0.25 — and that this is the weakest dimension — tells someone exactly what to work on. The module surfaces both `strongest_dimension` and `weakest_dimension` by weighted contribution so downstream consumers don't have to re-derive it.

## What I Considered

**Unweighted average across all eight dimensions.** Simpler, easier to explain. I rejected it because not all dimensions are equally diagnostic. An unweighted average would let a submission with exceptional reflection depth and clear purpose definitions mask weak tradeoff articulation — which is the core capability the audit is trying to surface. Weights are how you encode what matters.

**A different weight structure — purpose-first rather than tradeoff-first.** I considered leading with `clarity_of_purpose` at 0.25 and dropping `tradeoff_articulation` to 0.15, on the theory that you can't evaluate tradeoffs on a project you haven't understood. I rejected this because the audit questions are designed to elicit the right information first — by the time someone reaches Q2, purpose and scope are already established. The scoring should reward what's hard, not what's foundational. Clear purpose is a prerequisite, not the ceiling.

**Fuzzy bands with interpolated labels.** Rather than hard L-band cutoffs, return a continuous score and let the UI display it. This would eliminate the arbitrary threshold problem — there's no principled reason L3 ends at 0.69 rather than 0.68. I chose discrete bands anyway because they're more actionable for the people receiving results. "You're in L3" is a label that travels well across contexts; "your normalized score is 0.683" doesn't. The thresholds are somewhat arbitrary, but the discrete bins they produce are genuinely useful.

**Percentile ranking against a reference population.** Show not an absolute score but where this submission falls relative to others. This would require a corpus I don't yet have and would make early results meaningless until enough data accumulated. Absolute scoring with a published rubric is interpretable from day one.

## Trade-offs I Accepted

The weights are fixed in code. Adjusting them requires a code change, a deploy, and a decision about whether to re-score historical submissions. There's no configuration surface that would let someone experiment with weight variations without touching the source. That's a deliberate rigidity — weights that drift based on whoever-last-edited-the-config are weights that no longer mean anything. The cost is that the system is inflexible; the benefit is that the score has a stable meaning over time.

`strongest_dimension` and `weakest_dimension` are determined by weighted contribution, not raw score. This means a dimension that scores 4 with a weight of 0.05 can appear weaker than a dimension that scores 3 with a weight of 0.25 — the latter contributes more to the overall picture even though it's a lower raw score. This is the right behavior analytically, but it can be counterintuitive to explain. A user who scored 4 on `ai_override_evidence` and 3 on `tradeoff_articulation` may be surprised to see tradeoff identified as their strongest dimension.

The band hardcoded to `'L3'` in the fallback module is consistent with what this module would produce from all-3 scores (0.60 raw score → L3 band), but this module doesn't enforce or validate that. It's an implicit contract between two modules. If someone changes the L3 threshold without updating the fallback, the fallback and the real path could diverge in their band assignments. This should be an explicit constant shared between the two modules rather than an implicit coincidence.

## If I Were Building This Again

I'd externalize the weight configuration into a typed, versioned schema — not because I want the weights to change frequently, but because every time they do change I want a clear audit trail of what changed, when, and why. Embedding weights in code means the change history lives in git commit messages, which is better than nothing but not as explicit as a named configuration version.

I'd also expose a `score_version` field in `ScoringResult` — a hash or identifier of the weight configuration used. Without it, there's no reliable way to compare scores produced under different weight configurations, which matters when you're trying to understand whether a cohort's scores improved because people got better or because the weights shifted.

The strongest/weakest logic is a one-liner reduce over contributions, but it silently picks one winner when there's a tie. In a real system I'd want this to return a list and let the presentation layer handle ties explicitly rather than producing a deterministic-but-arbitrary single answer.
