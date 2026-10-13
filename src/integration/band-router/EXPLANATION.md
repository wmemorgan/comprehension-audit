# Band Router — Why It's Built This Way

## What This Module Does

This module defines the contract between the scoring engine and whatever downstream system needs to act on a score. It re-exports the `BandRouter` interface and provides `ConsoleRouter` as the default implementation — a zero-dependency router that logs the scoring result to stdout. In production, you swap in a real implementation; in local development, `ConsoleRouter` gives you enough signal to verify the pipeline is working without needing a CRM or automation platform configured.

## The Decision

The core architectural decision was to express band routing as an interface, not as a function signature or a configuration block. The `BandRouter` interface has exactly one method: `route(result: ScoringResult): Promise<void>`. Any class that implements that method can be passed to `createAuditPipeline()` and will receive scoring results.

This matters because band routing is a hot-swap concern. The scoring logic — computing a maturity band from a set of dimension answers — doesn't change based on where the result goes. What changes is the downstream destination: maybe it's a CRM automation sequence, maybe it's a Slack notification, maybe it's a webhook to a pipeline tracker. These are operational concerns, not scoring concerns, and they evolve at different rates than the algorithm. Conflating them in the same code path would mean touching the scoring logic every time you add a new routing destination.

The interface enforces this separation explicitly. The scoring engine calls `router.route(result)` and stops caring. It doesn't know if the router is writing to a database, triggering an email sequence, or — in the case of `ConsoleRouter` — printing four lines to stdout. That ignorance is intentional and valuable.

`ConsoleRouter`'s implementation is deliberately verbose for a logger. It logs the maturity band, the raw score, and both the strongest and weakest dimension labels — resolving them through `DIMENSION_LABELS` so you see human-readable names rather than dimension keys. The final line says "Would route to sequence for band X," which makes it clear this is a simulation. It reads like a dry-run output, which is exactly what it is.

## What I Considered

**A switch statement in the main handler**: The most obvious alternative — just put the routing logic inline and branch on the band. This works until you have two routing destinations, at which point you're modifying the handler file every time you add a case. It also makes unit testing the routing logic indistinguishable from testing the handler. I rejected this because the coupling is wrong: the handler's job is to orchestrate, not to know the specifics of downstream systems.

**An enum-driven strategy registry**: Define an enum of routing strategies and a map from enum values to implementations. This is more structured than a switch statement but has the same core problem — adding a new strategy requires modifying a central registry file. With the interface approach, you can add a new router by creating a new class in a new file, with zero changes to existing code.

**An event emitter pattern**: Emit a `band.scored` event and let multiple listeners subscribe. This is more powerful — you could route to three destinations simultaneously — but it introduces async coordination problems. Did all listeners complete? Did any fail? Which failure should block the result? An interface with a single `route` method keeps the responsibility clear: one router, one invocation, one outcome.

**Configuration-driven routing (JSON)**: Define routing rules in a config file. Flexible for non-engineers, but you immediately lose TypeScript's type safety on the routing logic. I'd have to validate the config at runtime and write fallback handling for malformed rules. The interface approach pushes that complexity to compile time.

## Trade-offs I Accepted

The `BandRouter` interface is intentionally minimal — it gives you no way to introspect routing decisions from the outside. You can't ask a router "what sequences are you enrolled contacts in?" or "what did you do with the last three band-5 results?" For observability, you're dependent on whatever the implementation logs. For this tool, that's fine; the audit pipeline is a simple linear flow. In a more complex system where routing decisions needed to feed back into business logic, you'd want a richer return type.

`ConsoleRouter` always resolves successfully. It has no error path. This means it masks a category of potential failures from the caller — if a production router throws, you'd want that propagated so the pipeline can handle it. The ConsoleRouter's silent success is appropriate for a default-development implementation, but it means the interface's async contract isn't stress-tested by the default.

## If I Were Building This Again

I'd add a `name` property to the `BandRouter` interface — a simple string identifier for the router implementation. Right now, all routers look the same in logs. If you're debugging why a result didn't trigger the expected sequence, knowing which router class handled it (and confirming it was the one you configured) would save meaningful investigation time.

I'd also ship a `NullRouter` alongside `ConsoleRouter` — a router that does nothing, produces no output, and resolves immediately. That's the right tool for test isolation: when you're testing the scoring logic, you don't want console noise from the router, and you don't want to assert on log output. `ConsoleRouter` is for development; `NullRouter` is for tests. The distinction is worth making explicit in the module.

Finally, the `route` method's `Promise<void>` return type leaves error handling entirely to the implementation. I'd consider whether a standardized error type — returned as a resolved value rather than a rejection — would make error handling more predictable across different router implementations.
