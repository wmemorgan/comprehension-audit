# Input Sanitization — Why It's Built This Way

## What This Module Does

The sanitization module validates and normalizes raw HTTP request bodies before they reach the judge. It checks that each of the four response fields is a string within defined length bounds, that the email address is well-formed, and that the email domain isn't from a known disposable address provider. It also escapes `<` and `>` characters in user-supplied text to prevent XML injection into the LLM prompt. It returns a typed `AuditInput` alongside any validation errors — the caller decides what to do with them.

## The Decision

The primary threat model here is prompt injection. The judge module embeds user text directly into an XML-structured message sent to an LLM. If user text contains unescaped angle brackets, a submitted answer could close the current XML tag and open a new one — introducing structure that the model parses as part of the prompt format rather than as user content. The `sanitizeText` function is three lines specifically because the attack surface is that narrow: `<` and `>` are the only characters that break the XML framing. Escaping them to `&lt;` and `&gt;` is sufficient, and doing more would be over-engineering a defense that doesn't fit the actual threat.

I chose not to strip or encode other characters because the judge prompt processes these as natural language inputs. Unicode characters, special punctuation, quoted strings — those are all legitimate content. Aggressive normalization would degrade the quality of text reaching the model and potentially change what the model scores. The constraint is: don't break the prompt structure. The sanitization does exactly that, nothing more.

Length bounds — 200 characters minimum, 4000 maximum — serve two distinct purposes. The minimum is a quality gate. A response below 200 characters to a question asking someone to explain their project's trade-off analysis is trivially short; there's not enough text for the judge to score meaningfully. I could have let those submissions through and watched the LLM return low scores, but rejecting them at the boundary gives clearer feedback and avoids burning API budget on inputs that will score low regardless.

The maximum of 4000 characters is a defense against context stuffing. The judge prompt is already large — a detailed eight-dimension rubric with five-level anchors. Allowing arbitrarily long responses risks pushing the total prompt context near the model's processing limits and could, in theory, be exploited to dilute the rubric with adversarial content. The 4000-character ceiling keeps each field at a size where the rubric remains dominant and the response stays processable within the 500-token output cap.

The disposable email blocklist is a static `Set` of nine domains rather than a DNS-based verification service. The choice was deliberate. A DNS lookup adds latency to every submission, introduces a new failure mode (what happens if the DNS check times out?), and requires either a third-party service subscription or maintaining DNS infrastructure. The static list covers the most common disposable providers and is fast, offline, and predictable. It's not comprehensive — determined users can use providers not on the list — but this is a light signal for intent, not a hard security gate. If someone is motivated enough to use an obscure provider, I'm not going to stop them with a blocklist anyway. The point is to filter casual disposable use.

## What I Considered

**Regular expression-based injection detection** — patterns like `ignore previous instructions`, `you are now`, or other common jailbreak prefixes. I considered this and chose not to implement it. The failure mode for a rule-based injection detector is that it's a moving target: new injection techniques appear faster than you can write rules for them. More importantly, the actual defense against prompt injection in this system isn't pattern matching — it's structural. User content is placed in clearly delimited XML tags with a system prompt that gives the model explicit scoring instructions. The model's job isn't open-ended text generation where injection payloads would have leverage; it's producing a fixed JSON structure from a rubric. That structural isolation is a stronger defense than keyword filtering.

**Schema validation via a library** (Zod, Joi, or similar). A structured validation library would provide more declarative validation rules and better composability. I chose to write the validation by hand for this module because the input schema is small and stable — four strings and an email — and the validation requirements are simple enough that adding a library dependency just for this creates more surface area than it resolves. If the input schema grew or became more complex, I'd reconsider.

**Server-side rate limiting in this module.** Gating submissions per IP or per email at the validation layer was tempting. I left it out because sanitization and rate limiting are different concerns — one is about data integrity, the other is about traffic management — and mixing them in this module would make both harder to test and reason about.

**Semantic length validation** — reject responses that are technically long enough but show signs of padding (repetitive content, lorem ipsum, copy-pasted text). This would require either heuristics or an LLM call to detect, which adds cost and complexity before the submission has even reached the judge. I decided the judge's rubric is the right place to penalize low-quality text, not the validation layer.

## Trade-offs I Accepted

The disposable email list is frozen at nine domains. It will age. New disposable providers will emerge and won't be caught. Maintaining it requires periodic manual updates with no automated signal for when it's gone stale. This is a known gap I accepted in exchange for simplicity and zero external dependencies.

The email regex — `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` — is deliberately permissive. It accepts many strings that aren't valid email addresses by RFC 5322 standards, and it rejects very few. A stricter regex would be longer, harder to reason about, and would still miss cases. The real email validation for delivery reliability happens when a confirmation email is sent, not at submission time. The regex here is just a format check — catching obvious non-emails like empty strings or inputs missing an `@`.

There's no input normalization beyond length enforcement and character escaping. Trailing whitespace, mixed case in email domains, Unicode normalization — none of these are handled. This means that `USER@GMAIL.COM` and `user@gmail.com` would pass through as distinct values. For the current use case, this is fine. The email is used for contact, not as a deduplication key, and the response text is passed to the model as-is.

Validation errors are collected and returned as an array, not thrown as exceptions. This design means the caller can return all errors in a single response rather than surfacing them one at a time. The trade-off is that the calling code needs to explicitly check the errors array — if it forgets, an invalid input could propagate. In practice the API handler treats non-empty errors as a rejection, but there's no type-level enforcement of that.

## If I Were Building This Again

I'd add a shared constant for `MIN_RESPONSE_LENGTH` and `MAX_RESPONSE_LENGTH` that the judge module could reference when constructing its user message — e.g., logging the truncation boundary or informing the rubric about response length expectations. Right now the bounds are set here and the judge module has no visibility into them.

I'd also make the disposable domain set configurable at startup — loaded from an environment variable or config file — rather than hardcoded. Not because I expect it to change frequently, but because being able to add domains without a code deploy is the right operational posture for a list that's inherently incomplete and time-bounded.

The email validation surface (format check + disposable domain check) could grow if the product adds email-verified authentication. If that happens, the permissive regex and static blocklist become inadequate fast. I'd want to flag that as a known future seam when onboarding anyone to this module.
