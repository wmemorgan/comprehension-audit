# Pipeline Webhook — Why It's Built This Way

## What This Module Does

This module delivers scored audit results to a downstream pipeline tracker via HTTP POST. It exports the `PipelineWebhook` interface and the `HttpWebhook` implementation, which fires a JSON payload containing both the scoring result and submission metadata to a configured URL. The call includes a 10-second timeout and full error isolation: any failure — network error, timeout, non-2xx response — is caught, logged, and discarded. The caller never sees the error.

## The Decision

The core design decision was that webhook notification must never be on the critical path for the user's response. After the audit is scored, the user should get their result immediately. Whether a downstream pipeline tracker successfully ingested that result is operationally important, but it is not the user's problem, and it should not determine whether they see their report.

This drives every detail of the implementation. `HttpWebhook.notify` is designed to be called without awaiting its resolution in a blocking way — it's invoked after the response has been committed, or in a context where its promise is explicitly not awaited to gate the reply. The method itself is `async`, which is correct for internal structure (the `fetch` call is inherently async), but the contract implicit in `PipelineWebhook.notify` is that callers treat it as fire-and-forget.

The `AbortController` with a 10-second timeout prevents the notify call from hanging indefinitely if the downstream endpoint is slow or unresponsive. Without this, a webhook call to a degraded endpoint could hold a serverless function invocation open for the platform's maximum execution time — potentially minutes — burning compute and holding locks. The `clearTimeout(timeout)` in the `finally` block prevents a timer leak in the case where `fetch` resolves before the 10-second deadline; without it, the timeout would fire after a successful response and attempt to abort a completed request.

Sending both `result` and `metadata` in the payload gives downstream systems everything they need to act without querying back. The `ScoringResult` contains the maturity band, raw score, and dimension analysis; `WebhookMetadata` contains the submission context — who submitted, when, and with what identifiers. A downstream automation platform receiving this payload can branch on band, personalize on attributes, and log with full provenance, all from a single event.

## What I Considered

**Making the webhook call synchronous (awaited on the critical path)**: The simplest implementation. `await webhook.notify(result, metadata)` before returning the response to the user. I rejected this because it directly transfers downstream latency into user latency. If the pipeline tracker takes 800ms to respond, every submission takes 800ms longer. If it's unavailable, every submission fails. The user's experience should not be hostage to a side-effect system.

**A message queue (SQS, Google Pub/Sub, similar)**: Durable, retryable, and decoupled. A failed delivery gets retried automatically; there's a dead-letter queue for forensics; the downstream system can scale consumption independently. This is the right architecture when you need guaranteed delivery and can tolerate the operational overhead. For a tool that aims to run with minimal infrastructure — a single serverless function and a CRM — adding a managed queue service is a dependency and a cost center that isn't yet justified.

**Database write + background worker**: Write the scoring result to a database immediately, then have a background job deliver it to downstream systems. More durable than fire-and-forget, less infrastructure than a full message queue. Requires a database, a worker runtime, and a job scheduling mechanism. Same answer: right at scale, too much for current requirements.

**Retry logic in `HttpWebhook`**: Add exponential backoff within the `notify` method — if the first attempt fails, wait and try again. The problem with this approach is that retries belong in the transport layer, not in the fire-and-forget invocation path. If `notify` retries internally, it's no longer truly non-blocking from the caller's perspective — a 3-retry sequence with backoff could take 30+ seconds. Retries are more appropriate in a queue consumer or a dedicated retry worker that operates outside the request lifecycle.

## Trade-offs I Accepted

Fire-and-forget means lost events. If the HTTP call fails — network error, timeout, 5xx from the downstream endpoint — the notification is gone. There is no retry, no dead-letter queue, no replay mechanism. The pipeline tracker will have a gap in its record for that submission. I accepted this trade-off because the alternative (guaranteed delivery) requires infrastructure that isn't warranted at current scale. The audit result itself is correct and delivered to the user; the gap is in the pipeline's analytics, not in the user's experience. This is a deliberate durability tradeoff, not an oversight.

The 10-second timeout is arbitrary. It's long enough that healthy endpoints should always respond in time, and short enough that a hung endpoint doesn't tie up the function for unreasonably long. But it's not configurable — if a downstream system is legitimately slow (batch processing, heavy database writes), 10 seconds may be too short. I hardcoded it rather than make it a constructor parameter because the right answer in that scenario is to fix the downstream system, not to extend the timeout.

Errors are logged to stderr (`console.error` / `console.warn`) but not to any structured log store. In a production system, you'd want these failures to be queryable — "how many webhook notifications failed in the last 24 hours, and for which submission IDs?" With only stderr logging, that analysis requires grepping log files rather than running a query.

## If I Were Building This Again

The timeout value belongs in the constructor. `new HttpWebhook(url, { timeoutMs: 10_000 })` makes the policy explicit and lets different deployment contexts tune it without a code change. The default would stay at 10 seconds, but the knob exists.

I'd also pass the `submission_id` (or equivalent identifier from `WebhookMetadata`) into every error log line. Right now, a `console.error('[PipelineWebhook] Notification failed:', error)` tells you something went wrong but not which submission was affected. With a submission ID in the log, you can cross-reference against the audit results table and determine exactly what the pipeline tracker missed.

Finally, I'd seriously evaluate a lightweight retry — one retry after 2 seconds for network errors and 5xx responses, with no retry for 4xx (which indicates a request problem, not a transient failure). That single retry would recover the majority of transient failures without meaningfully affecting the non-blocking contract, since the retry fires in the background and the user response is already committed.
