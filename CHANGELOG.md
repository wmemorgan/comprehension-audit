# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- The `/api/audit-submit` function returned every response as HTTP 200 with the real response
  nested in the body. It now returns the pipeline's status code, headers, and JSON body
  directly, so validation errors return 400 and rate limits return 429. Invalid JSON returns 400.
- The diagnostic UI now shows the API's `error` message for a rejected submission.
- `npm run dev` binds Astro to IPv4 so the Netlify CLI detects the dev server on every OS.
- `npm run lint` now works: ESLint 10 with a flat config and `typescript-eslint`, run in CI.
- Documentation now matches the code: the band list IDs are `BREVO_LIST_ID_LOW`,
  `BREVO_LIST_ID_MID`, and `BREVO_LIST_ID_HIGH`, and `LLM_MODEL` is optional (default
  `claude-sonnet-4-6`).

### Added

- `SECURITY.md` with private vulnerability reporting.
- Node.js 22 or later is required (`engines`, `.nvmrc`). CI runs on Node 22 and 24.

## [1.0.0] — 2026-10-13

Initial public release.

### Added

- Four-question diagnostic UI (React, Astro, Tailwind CSS) at `/comprehension-audit`, with an
  8-dimension SVG radar chart.
- Dual-run LLM judge (Anthropic Claude, temperature 0.0) that scores eight weighted dimensions.
- Weighted scoring and criterion-referenced L1–L5 maturity bands.
- Input sanitization (length bounds and injection detection), CORS, and rate limiting.
- Graceful fallback to a neutral L3 result when scoring fails.
- Typed integration layer: `BandRouter` (default `ConsoleRouter`), optional `EmailProvider`
  (`BrevoProvider`), and optional `PipelineWebhook` (`HttpWebhook`).
- Netlify Function endpoint at `/api/audit-submit`.
- 25 calibration examples (5 per band) and `npm run validate-calibration`.

[Unreleased]: https://github.com/wmemorgan/comprehension-audit/compare/4f8942f...main
[1.0.0]: https://github.com/wmemorgan/comprehension-audit/tree/4f8942f
