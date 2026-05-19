# Dual-Run LLM Evaluation — Why It's Built This Way

## What This Module Does

The judge module takes a sanitized four-question audit submission and returns per-dimension scores across eight evaluation criteria. It does this by calling an LLM twice with the same prompt at temperature 0.0, then merging the two result sets into a single authoritative score — logging any dimensions where the two runs disagreed by more than one point.

## The Decision

The core choice here is dual-run evaluation rather than single-run. The reason isn't that I distrust the model — it's that I don't trust a single evaluation to be the right one. Even at temperature 0.0, LLM outputs for a task this subjective aren't perfectly stable across calls. Internal batching effects, slight prompt-processing variations, and the inherent ambiguity in rubric language all introduce noise. Running twice and averaging doesn't eliminate that noise, but it does produce a more stable central estimate than any single pass would.

The disagreement tracking is equally important. When two independent runs score the same dimension more than one point apart, that's a signal that the rubric is under-specified for that input, the input itself is ambiguous, or the dimension has an edge case I haven't accounted for. I log those disagreements rather than silently absorbing them. This makes the system auditable — if a batch of submissions produces repeated disagreements on `tradeoff_articulation`, I know exactly where to refine the rubric.

Temperature 0.0 is non-negotiable for a scoring task. The goal is a consistent, deterministic evaluation of whether a response meets a rubric. I don't want the model to be creative. I want it to be precise. Higher temperatures introduce variance that would make the dual-run comparison meaningless — you'd just be measuring sampling noise, not genuine scoring uncertainty.

The model defaults to `claude-sonnet-4-6` but is configurable via the `LLM_MODEL` environment variable. I chose Sonnet rather than a smaller model because the system prompt is instruction-dense: an eight-dimension rubric, five-level anchors per dimension, and strict JSON output requirements. Smaller models handle that kind of structured instruction-following less reliably. I chose Sonnet rather than Opus because `max_tokens: 500` bounds the output — the entire response is a compact JSON object, not a long generation. Sonnet is fast enough and accurate enough at this output size that the cost/capability trade-off favors it over Opus for a synchronous API call.

Structured output parsing was a deliberate choice over asking the model to explain its scores. The output contract is exactly eight integer fields in a specific range. I validate each one: is it a number, is it an integer, is it between 1 and 5? If any field fails validation, the whole call throws and the retry logic takes over. This is strict by design. A malformed response that passes silently would produce corrupted scores downstream with no trace of where they went wrong.

The user message uses XML-structured wrapping — `<visitor_response question="1">` — to delimit the four input fields clearly. This isn't decoration. The model processes the full input as a single message, and without structural separation, the boundary between responses is implicit. XML tags make the structure explicit and reduce the chance that a response which mentions other question themes confuses the scoring for a given dimension.

The 30-second timeout and single retry with a 2-second delay are pragmatic rather than sophisticated. This runs in an HTTP request context. If the LLM API call takes more than 30 seconds, the upstream request has already timed out and the result is useless. The retry covers transient network errors without introducing meaningful latency in the non-failure case.

## What I Considered

**Single-run with a confidence field.** Ask the model to return scores plus a self-reported confidence level per dimension. I rejected this because it conflates two different problems: getting the score right and getting the model to accurately self-assess confidence. Self-reported confidence from LLMs is notoriously unreliable and would require its own calibration pass. Two independent runs are a more direct empirical check.

**Multi-model ensemble** — run one model and a different provider's model, then reconcile. Technically interesting, but it introduces operational complexity (two API keys, two error paths, two model-specific prompt formats) and a hard interpretability problem: when models disagree, who's right? At least with dual-run on the same model, the merge strategy (simple average) is defensible and the disagreement signal is clean.

**Fine-tuned classifier.** Build a labeled dataset of responses and train a classifier to produce dimension scores. This would be faster and cheaper at inference time. I ruled it out because it requires a labeled training set I don't have, and because the rubric needs to evolve. A fine-tuned model is a snapshot of a particular rubric version — updating the scoring criteria means retraining. A prompted model updates as soon as the system prompt changes.

**Rule-based scoring without LLM.** Keyword matching, response length heuristics, structural features. I considered this only as a fallback strategy (see the fallback module), not as a primary path. The dimensions being scored — tradeoff articulation, architectural intentionality, blast radius awareness — don't reduce to keyword presence. They require something closer to reading comprehension.

## Trade-offs I Accepted

Two API calls per submission means 2x inference cost and roughly 2x latency on the happy path. At the current scale this is acceptable; at high throughput it becomes a cost driver worth revisiting.

The retry strategy is minimal: one retry per run, 2-second flat delay. I'm not using exponential backoff with jitter, which would be the right choice for a system under sustained API rate-limit pressure. This was a deliberate simplicity choice — the system is not yet at the scale where it needs sophisticated retry logic, and adding it prematurely would complicate the error path without clear benefit today.

The whole system depends on a single LLM provider. If that API has an outage, the judge module fails entirely and the fallback path activates. There's no multi-provider redundancy.

Prompt engineering brittleness is real. The rubric is embedded in the system prompt as a long string. If a future model update changes how Sonnet processes instruction-dense prompts, scoring behavior could shift without any code change. The dual-run disagreement logs would surface this, but only after it had already affected live scores.

## If I Were Building This Again

I'd instrument the disagreement rate as a first-class metric and alert on it. Right now disagreements are logged to stderr and forgotten. A rising disagreement rate on a specific dimension is the earliest signal that the rubric needs refinement or that a model update has changed scoring behavior — and that's worth a dashboard, not a log line.

I'd also separate the retry logic into a dedicated utility with proper exponential backoff and configurable max attempts. The current two-line retry is fine for now but will need replacement the moment this runs under any real load, and extracting it before that happens is cheaper than extracting it under pressure.

The XML wrapping in the user message works, but I'd prefer the Anthropic Messages API to eventually support a first-class structured input format so the prompt structure isn't load-bearing. That's not a change I can make today, but it's the architectural pressure point I'd watch.
