# Proposal: watchdog checks for the v2 conditions report

**Status:** awaiting Sal. The watchdog's checks live in the `covecheck-watchdog`
cron job in openclaw (`~/.openclaw/state/openclaw.sqlite`, table `cron_jobs`;
readable backup `~/agent-worlds/covecheck-watchdog-automation.bak.json`), not in
this repo, so this PR does not change them. **That job is currently disabled
(`enabled = 0`)** — nothing below runs until it is re-enabled.

What this PR adds for the watchdog to use:

- `lib/sources.live.ts` — fails loudly if the Health Dept. advisories, UV, or
  48 h rain sources are unreachable or empty. Run:
  `npx vitest run --config vitest.live.config.mts lib/sources.live.ts`
- `GET https://www.covecheck.com/api/status` — public JSON: `sources`,
  `waterQuality` (`clear | advisory | unknown`, with nearby advisories), and
  `jellyfish.windowStartsTomorrow`.
- `GET https://www.covecheck.com/api/reports/calibration` with
  `Authorization: Bearer $CALIBRATION_TOKEN` — calibration findings from visit reports.
- `AGENTS-CHARTER.md` — two new ESCALATE triggers (water quality, box jellyfish).

## Proposed additions to the cron prompt

Replace the "four upstream data sources" check and the verdict-label check with:

> **Site.** `https://www.covecheck.com/` returns 200 and contains "What are you
> heading out for?" (the v2 page no longer shows a verdict label by default).
>
> **Sources.** Run `npx vitest run --config vitest.live.config.mts lib/sources.live.ts`
> and `npm run diagnose`. Any failure is a finding. Also `curl -s
> https://www.covecheck.com/api/status`: `sources.failures` must be empty and
> `sources.uv`, `sources.rainHistory`, `sources.waterQuality` must all be `ok`.
> A `waterQuality.status` of `unknown` means the Health Dept. source is
> unreachable — log it (AUTONOMOUS) every run it persists.
>
> **ESCALATE** (charter list) when:
> - `waterQuality.status` is `advisory` and any `waterQuality.nearby[].postedUtc`
>   is within the last 3 hours (it went from clear to advisory since the last run);
> - `jellyfish.windowStartsTomorrow` is `true` (check once, on the evening run).
>
> **Calibration findings.** Once a day, fetch `/api/reports/calibration` (token in
> the watchdog's environment). For each finding not already in AGENT-LOG.md, add
> a PROPOSE-ONLY entry: what the forecast said vs what was reported, how many
> reports agree, and 2–3 decision-ready options (e.g. "lower `clearDayFt` 40 → 30",
> "raise `ftLostPerSwellFt` 7 → 9", "no change until 5 more reports") with one
> recommended default and why. Never change a threshold yourself.

## Setup Sal needs to do

1. Vercel → Storage → add **Upstash Redis** (Marketplace, free tier) to the
   `covecheck` project. It sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`. Until
   then `/api/reports` answers 503 and the form says reports aren't being saved.
2. Add `CALIBRATION_TOKEN` (any long random string) to the project env and the
   watchdog's environment.
3. Paste the prompt changes above into the cron job and re-enable it.
