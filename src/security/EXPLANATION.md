# CORS and Rate Limiting — Why It's Built This Way

## What This Module Does

This module owns the security perimeter for every HTTP response the audit API produces. It handles three responsibilities: constructing CORS headers that control which origins can call the API, building normalized response objects in a format the serverless host expects, and enforcing per-email submission rate limits by delegating to whatever email provider is configured. It also generates the submission IDs used to construct report URLs.

## The Decision

The central architectural choice was to enforce rate limiting through the email provider rather than through dedicated infrastructure. When a submission arrives, `checkRateLimit` calls `emailProvider.checkSubmissionLimit(email)`, which looks up the contact's record in the CRM and inspects whether they've submitted within the last 30 days. If no provider is configured, or the provider doesn't implement `checkSubmissionLimit`, the function returns `{ limited: false }` immediately — rate limiting degrades gracefully rather than blocking.

I chose this approach because the alternative infrastructure options all introduce operational overhead that isn't justified at this scale. The CRM already stores contact history per submission; making it the system of record for rate limiting means there's no second datastore to keep in sync. One submission either writes a contact record or it doesn't — and the rate limit check is a read of that same record. There's no cache invalidation problem, no TTL drift between a Redis key and the actual record.

The CORS configuration is intentionally narrow. Only `POST` and `OPTIONS` are allowed — `GET` is excluded because this API has no safe GET endpoints. The only allowed header is `Content-Type`, which blocks custom header injection attempts without a WAF. The origin is resolved in priority order: explicit argument, then `ALLOWED_ORIGIN` env var, then `'*'`. Production always sets the env var; the wildcard fallback exists for local development and CI environments where the origin isn't known at config time.

The `buildResponse` function takes pre-built CORS headers as an argument rather than calling `buildCorsHeaders` internally. This is a deliberate composition choice: the caller assembles the headers, including any extras (like `Cache-Control`), and passes the complete set to the response builder. This keeps `buildResponse` as a pure transformation with no hidden state dependency.

## What I Considered

**Cloudflare rate limiting or WAF rules**: These would push enforcement to the edge, which is faster and cheaper per-request. The problem is they lock you to a specific CDN and require managing Cloudflare-specific configuration alongside your application code. For a tool designed to run on any serverless host, that's the wrong coupling.

**Redis or a managed KV store (Upstash, Vercel KV)**: A dedicated rate limit store gives you strong guarantees and easy TTL management. But it's another infrastructure dependency to provision, secure, and pay for. At submission volumes where this tool operates, the CRM-backed approach is sufficient, and it avoids split-brain between "rate limit store says yes" and "CRM record says no."

**IP-based throttling**: IP addresses are unreliable signals on modern networks — mobile users rotate IPs, corporate proxies share a single egress IP across hundreds of employees, and VPNs make the address meaningless. Email is a more stable identifier for an individual submitter.

**API key gating**: Would add a meaningful authentication layer, but also a key management problem. The audit tool is designed to accept public submissions without friction; adding API key distribution defeats the purpose.

## Trade-offs I Accepted

The wildcard CORS fallback is a footgun. If someone deploys this without setting `ALLOWED_ORIGIN`, any origin can call the API. I accepted this because the serverless function itself validates and processes the input — there's no CORS-only secret to steal — but a production deployment without the env var is misconfigured. A startup validation check that errors loudly on missing `ALLOWED_ORIGIN` in non-development environments would be a better guard than a fallback to `'*'`.

Rate limiting fails open. If the Brevo API is unavailable during a submission, `checkSubmissionLimit` catches the network error and returns `{ limited: false }`. This means a Brevo outage unlocks duplicate submissions. I accepted this trade-off deliberately: blocking all submissions because a third-party CRM is temporarily unreachable is worse than allowing a small number of duplicates. The duplicates are detectable after the fact from the audit log.

`generateSubmissionId` can collide if two submissions from the same email arrive within the same millisecond. The docstring is explicit about this. A SHA-256 of `email + ISO timestamp` is not cryptographically unique at millisecond granularity; it's a stable fingerprint for the common case. For report URL construction, where the failure mode is a hash pointing to someone else's report (which would require a simultaneous same-millisecond same-email submission), this is an acceptable risk.

## If I Were Building This Again

I'd add a startup check that validates `ALLOWED_ORIGIN` is set in non-local environments and fails fast rather than silently falling back to `'*'`. Silent security misconfigurations are the ones that get deployed to production.

I'd also make the submission ID generation injectable — passing a clock function as an argument rather than calling `new Date()` internally. That would make `generateSubmissionId` fully deterministic in tests, removing any timing dependency from the test suite.

The rate limit check and the contact upsert are two separate Brevo API calls on the hot path of every submission. If submission volume grows, I'd evaluate collapsing these into a single check-and-upsert by inspecting the contact record returned from the initial GET — the rate limit data is already in that response. It wouldn't change the external behavior but would halve the CRM API call count per submission.
