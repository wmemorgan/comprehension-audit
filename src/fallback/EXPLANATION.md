# Graceful Degradation — Why It's Built This Way

## What This Module Does

The fallback module generates a synthetic `ScoringResult` when the judge module fails — specifically, when both LLM runs throw errors after their retries. It assigns a uniform score of 3 across all eight dimensions, producing a normalized raw score of 0.60 and a fixed `L3` maturity band. The result shape is identical to what the real scoring path produces, so the API response remains well-formed regardless of whether the judge succeeded.

## The Decision

The core decision was to return a neutral mid-band result rather than fail the HTTP request. The alternative — propagating the LLM error to the caller and returning a 503 — would mean that every time the AI provider has an outage, every in-flight audit submission gets an error response. Users lose their work, or at minimum experience a frustrating failure at the moment of submission. A service that accepts a structured, four-question written submission should not let its LLM dependency become a single point of visible failure.

I chose a uniform score of 3 — the midpoint of the 1–5 scale — as the fallback value for specific reasons. A score of 1 would misrepresent the submission by assigning the lowest possible rating to someone whose actual work might be excellent. A score of 5 would inflate their result. A score of 3 is neutral: it says "we couldn't evaluate this" rather than "this is bad" or "this is great." It maps to L3, which is the middle maturity band, not an extreme.

The `L3` band is hardcoded rather than computed, even though running the scoring computation on all-3 inputs would produce the same result. This is a deliberate explicitness choice. When I read this module, I want it to be unambiguous that the intent is to return L3 — not that L3 is an emergent consequence of the chosen fallback score. The hardcoded band makes the intent legible without requiring the reader to trace through the band threshold logic to confirm they'd arrive at the same place.

The fallback does run the full contribution calculation — it still populates `dimension_breakdown`, `strongest_dimension`, and `weakest_dimension`. This was a conscious trade-off. Technically I could skip all of that and return null or empty values for those fields. But doing so would require the API route handler (and any downstream consumers) to handle two different response shapes: the real shape and the degraded shape. That defensive branching spreads across the codebase. It's cheaper, in structural terms, to return a complete but synthetic result and let the calling code handle it uniformly.

The `_input` parameter — the original audit submission — is accepted but unused. I kept it in the signature because the caller shouldn't need to know whether fallback was triggered in order to decide which function to call. If the handler signature were `generateFallbackResult()` with no parameters, the call sites would need to conditionally pass or not pass the input, creating the kind of asymmetry that leaks implementation details into calling code.

## What I Considered

**Hard failure — propagate the LLM error as an HTTP 503.** Clear, honest, and forces the caller to handle the error explicitly. I rejected it because the operational cost is high: every API outage from the LLM provider becomes a user-visible failure at the point of submission, which is a particularly bad time to lose someone's work. A neutral fallback is a better trade for a system where submissions are typed, structured responses.

**Storing the submission for async re-scoring.** Accept the submission, return a "pending" result, and queue a re-score job that runs when the LLM is available again. This is the right answer at scale. I didn't implement it because it requires a job queue, persistent storage for pending submissions, and a mechanism for delivering the updated result to the user — which is a significant infrastructure addition. The fallback is explicitly a simpler version of this idea: it degrades gracefully now and preserves the option to add async re-scoring later without breaking the API contract.

**Caching a prior successful evaluation for this user.** If a previous submission from the same email exists, return that result. Rejected immediately — a cached result from an earlier submission says nothing about the quality of the current one. It would produce a score that's both incorrect and confidently wrong.

**Returning a minimum viable score of 1 across all dimensions.** Simpler to implement and clearly communicates that evaluation failed. The problem is that it misrepresents the submission. Someone who wrote substantive, thoughtful responses gets a "score" of L1 not because of what they wrote but because of infrastructure conditions they had no control over. That's not something I'm willing to do to someone who put effort into the audit.

## Trade-offs I Accepted

The fallback result is indistinguishable from a real L3 result in the API response. There's no `is_fallback: true` flag in `ScoringResult`. This means the user doesn't know they got a synthetic score, and neither does any downstream system reading the result. This was intentional — flagging the fallback in the result type would require every consumer to handle the flag, and the whole point of the fallback is to return something that looks normal. But it does mean the fallback is invisible to analytics. If 5% of results in a reporting period were fallbacks, you'd never know from the score data alone.

Uniform score of 3 means the `strongest_dimension` and `weakest_dimension` output from the contribution calculation is essentially arbitrary — when all contributions are equal, the "strongest" and "weakest" are determined by which key the reduce happens to return first, and that order is not guaranteed by the spec. The values will be stable on a given runtime, but they're meaningless. This is a known artifact of applying a function designed for varied inputs to completely uniform data.

The fallback score of 3 is hardcoded as a local constant in the function, not as a shared export. If the judge module's rubric scale ever changes — for example, expanding from 1–5 to 1–10 — the fallback score would need to be updated manually. There's no compile-time check that catches this drift.

## If I Were Building This Again

I'd add a `scored_by` field to `ScoringResult` with values like `'llm'` or `'fallback'`. Not to change how consumers display the result (the neutral presentation is still correct), but to enable filtering in analytics pipelines. Right now there's no way to answer "what percentage of submissions received a fallback result last week?" without adding instrumentation at the call site. That metric matters for understanding LLM API reliability and for deciding when the async re-scoring investment becomes worth making.

I'd also think harder about what `_input` being unused actually means. The fact that the fallback doesn't use the input at all is both a feature (it can't make wrong inferences from the content) and a hint that the architecture might eventually want to do something smarter — like a lightweight heuristic score based on response length alone as a slightly better neutral estimate than pure uniform 3. Whether that's worth the complexity is debatable, but the unused parameter is the right hook to have in place if that decision changes.

The calculation of `strongest_dimension` and `weakest_dimension` on uniform scores should probably be short-circuited with a `null` or an empty string to be honest about what those fields mean in fallback context. Returning `strongest_dimension: 'clarity_of_purpose'` when all dimensions scored identically is technically computed correctly but semantically misleading.
