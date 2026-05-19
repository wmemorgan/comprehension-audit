# Email Provider Abstraction — Why It's Built This Way

## What This Module Does

This module provides the concrete implementation of the `EmailProvider` interface for Brevo, a transactional email and CRM platform. It does two things: `upsertContact` writes or updates a contact record in Brevo with submission attributes and list enrollment, and `checkSubmissionLimit` reads that same contact record to determine whether the submitter has already completed the audit within the last 30 days. The `EmailProvider` and `ContactData` types are re-exported from this module, making the interface available to callers who don't need to know which provider backs it.

## The Decision

The fundamental decision was to build email provider integration behind an interface rather than calling Brevo's API directly from the submission handler. The `EmailProvider` interface is what the rest of the application depends on. `BrevoProvider` is one implementation of it. This means the application is coupled to a contract ("give me a method that takes a contact and returns a promise"), not to a vendor.

I chose Brevo specifically for a few compounding reasons. The free tier is generous enough to carry meaningful submission volume without requiring a paid plan upfront. The REST API is well-documented and unsurprising — standard JSON request/response, clear status codes, sensible contact attribute model. The `updateEnabled: true` flag on contact upsert is a single parameter that converts what would otherwise be a create-or-update conditional into a single idempotent API call: if the contact exists, update it; if not, create it. That reduces the contact write path to one network round-trip regardless of submission history.

The rate limiting strategy deserves particular attention. Rather than maintaining a separate submission log or a Redis key with a TTL, I store the submission timestamp as a contact attribute — `LITMUS_SUBMITTED_AT` — in Brevo itself. The `checkSubmissionLimit` method retrieves the contact by email and reads that attribute. If the contact doesn't exist (404), they haven't submitted before. If the attribute is absent, same conclusion. If it's present and within 30 days, they're rate-limited. This means the CRM is the system of record for both contact data and submission history. There's no second datastore to keep in sync, no cache invalidation, no drift between what the CRM knows and what the rate limiter knows.

## What I Considered

**SendGrid**: A reasonable alternative with strong deliverability and a well-known API. The contacts API is functional but less ergonomic for this pattern — SendGrid is primarily built around email sending, and its CRM/contact features feel secondary. The cost structure also doesn't favor the use case: at low submission volumes, Brevo's free tier is simply more generous.

**Mailchimp**: Strong list management with a long track record, but Mailchimp's API has historically been awkward for contact upserts at the individual level. The "audiences" model requires you to know which list you're writing to upfront, and the merge field system for custom attributes adds ceremony. Brevo's contact attributes API is flatter and easier to reason about for this pattern.

**A custom database table**: Storing submission records in a database gives you full control — you can query by date, add indexes, run analytics. The cost is infrastructure: a database to provision, migrate, secure, and pay for. For a tool that already uses Brevo for email delivery, the CRM-backed approach avoids adding a runtime dependency. If submission volume ever grows to the point where Brevo lookups are a bottleneck, migrating the rate limit check to a dedicated store is a well-scoped refactor.

**Segment or a CDP**: Segment would give you a clean abstraction over multiple downstream destinations — CRM, analytics, email, etc. It's the right tool when you have complex fan-out requirements across many systems. For a tool with a single email provider and a simple contact model, it's overkill, and it introduces a new per-event cost and an additional failure mode.

## Trade-offs I Accepted

Error handling in `upsertContact` is silent by design. Network errors and unexpected status codes are logged to stderr and then the method returns. Submissions that fail to upsert a contact proceed anyway — the audit result is still scored and returned to the user, they just don't land in the CRM list. I accepted this trade-off because a Brevo API error should never block the user from getting their audit result. The alternative — throwing and surfacing the error — would turn a CRM outage into a submission failure, which is the wrong priority ordering.

The 429 rate limit handling from Brevo's side is similarly silent: if Brevo rate-limits the `upsertContact` call itself, the contact update is dropped and logged. There's no retry logic. At submission volumes low enough to stay on the free tier, this shouldn't trigger, but it's a gap that would need addressing at scale.

The 30-day cooldown window is hardcoded in `checkSubmissionLimit`. This is the obvious refactoring opportunity I didn't take — it should be a constructor parameter or a configuration value. It works correctly as-is, but changing the cooldown window requires a code change and a redeploy.

## If I Were Building This Again

The cooldown period belongs in the constructor, not hardcoded. `new BrevoProvider(apiKey, { cooldownDays: 30 })` makes the policy explicit and testable without mocking `Date.now()` to specific values.

I'd also add retry logic with exponential backoff for `upsertContact` — at minimum, one retry after a short delay for network errors and 5xx responses. A single transient error silently dropping a contact from the list is the kind of data loss that only shows up weeks later when someone investigates why a submission cohort looks smaller than expected.

Finally, I'd separate the "create/update contact record" responsibility from the "enroll in list" responsibility. Right now, `ContactData.listIds` mixes two concerns: what attributes to store on the contact and which lists to add them to. These have different change frequencies and different error profiles. A future implementation might want to update attributes without changing list enrollment, or vice versa.
