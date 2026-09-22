# CoveCheck agent log

Findings and proposals from agents working on this repo. See `AGENTS-CHARTER.md`
for the rules this file implements.

**Newest entry on top.** ESCALATED entries go above everything regardless of date.

Entry format:

```markdown
## YYYY-MM-DD · <agent> · <AUTONOMOUS | PROPOSE-ONLY | ESCALATE> · <AWAITING APPROVAL | ESCALATED>

**Found:** what was observed, with file paths and line numbers or command output.

**Proposed:** the change, as a diff. PROPOSE-ONLY items are not applied.

**Rationale:** why this is right, and what would argue against it.
```

Record what was verified separately from what was inferred. Leave
**AWAITING APPROVAL** in place until Sal resolves it.

---

## 2026-09-22 · main · PROPOSE-ONLY · AWAITING APPROVAL

**Found:** the decision-ready rule for ESCALATE findings is live and in use, but
the charter never states it. `record-decision.sh` exists and carries the trigger
test in its header comment; `deploy_api.py` renders the card, queues the brief
and states in `_decisions` that the record is informational; `world.html` renders
the options and says choosing is "a REQUIRED pipeline step, not a summary". PR
#12's log entry already cites "the decision-ready standing rule" as though the
charter defined it. `AGENTS-CHARTER.md` does not mention it anywhere.

So the rule binding every agent lived only in the tooling that implements it.
Three copies of the reasoning, no authoritative one, and nothing an agent reading
the charter before acting would find.

**Proposed:** two subsections at the end of §2 ESCALATE.

*Decision-ready escalations* states the trigger test verbatim from
`record-decision.sh` — two or more defensible fixes that differ in **what a user
would actually see**, not in how different the diffs look — requires the options
be recorded before the log entry is written, and requires the options block be
pasted from the script's stdout so the prose and the rendered card cannot drift.
It closes by restating that this is still ESCALATE: drafting options is not
attempting a fix.

*What a recorded choice binds, and what it does not* is the part worth having
written down. A decision record approves nothing — `_merge_gate` never reads it —
and substitutes for neither `verdict: safe` nor `approvedBySal`. What it does is
brief: it queues `main` to brief `builder` to draft only the chosen option, which
then re-enters the gate from the top as an ordinary PROPOSE-ONLY change with its
own review and its own approval. And a choice is deliberately *not* bound to the
head commit — the inverse of the rule the verdict and the approval follow, and
the section says why.

**Three corrections from `reviewer`, which returned `flagged` on the first
draft at `e0fc605`.** Recording them rather than quietly replacing the text,
since two of the three were claims this entry had presented as checked.

1. **The draft told agents to take the whole log entry from the script's
   stdout, which contradicts §3.** `markdown_card` (`deploy_api.py`) heads its
   block `· AWAITING DECISION`, a marker §3 does not admit, and the block
   carries none of §3's **Found:** / **Proposed:** / **Rationale:** structure.
   An agent following the rule literally would have produced an entry violating
   §3; one adapting it would be doing the retyping the rule forbids. The
   precedent this PR cited disproves the rule as drafted: PR #12's entry is
   hand-written and headed **ESCALATED**, with only the options block pasted in.
   Now scoped to the options block, with the heading explicitly discarded.

2. **"First applied on PR #12, 2026-09-22; see `AGENT-LOG.md`" pointed at
   nothing.** PR #12 is open, so its entry exists only on its own branch — the
   file the charter named does not contain the record it promised. Exactly the
   citation rot `reviewer` logged on PR #10, which this PR's own body claimed to
   have avoided. The file pointer is gone; the PR reference stays, since that
   does not rot.

3. **The `decisionSha` sentence canonised a rationale the implementation
   records rejecting.** The draft said the card binds to the head commit "the
   same rule the verdict and the approval follow." `decide()` says the opposite
   in terms — *"DELIBERATELY NOT SHA-BOUND"* — and that binding it "punish[ed]
   the wrong trigger — and it did, three times, before this was relaxed on
   2026-09-22." `record-decision.sh`'s header still carries the older wording,
   and the draft copied the loser of that argument into the constitution. The
   two implementation files genuinely disagree; the charter now follows
   `decide()`, distinguishes the card's `decisionSha` stamp from the binding of
   the choice, and says why an authorising record binds where a non-authorising
   one need not.

Verified independently before rewriting, not taken on the reviewer's report:
the `AWAITING DECISION` heading at `deploy_api.markdown_card`, the
`DELIBERATELY NOT SHA-BOUND` comment and its three-failures note in
`deploy_api.decide()`, and that `main`'s `AGENT-LOG.md` holds no PR #12 entry.

**Rationale:** the behaviour is already live and already being cited, so the
choice was between documenting it now and letting more escalations run under an
undocumented rule. Sal's call, 2026-09-22: write it now, do not wait for the
fix PR that PR #12's decision briefed.

What argues against it: the charter's own known gap — it still assigns no tier to
editing itself — is not resolved by this entry either, and this amendment adds
process text to a file that has grown twice this week. Against that, every
sentence here is describing something an agent can already trip over unaware, and
the binding distinction is exactly the kind of thing that gets assumed wrongly in
the permissive direction: that Sal picking an option means the fix is cleared.

**Tier.** Treated as PROPOSE-ONLY per the known-gap note at the top of §2, and
saying so here is what that note requires. Sal authorised writing this and
opening the pull request; per §2 that starts the route rather than ending it, so
this still needs a reviewer `verdict: safe` and Sal's `approvedBySal` recorded
against this branch's head commit before the Shipyard button will appear.
**AWAITING APPROVAL** stays until he removes it.

**Not verified:** whether this wording survives PR #7, which is open, also edits
`AGENTS-CHARTER.md`, and is already `CONFLICTING` against `main` from PR #10's
rewrite. Its hunks land in a different region than this one, but it will need
rebasing on its own account regardless.

---

## 2026-09-22 · main · AUTONOMOUS · DECIDED BY SAL

**Closes the question the entry below left open.** That entry ended "whether a
PROPOSE-ONLY path should be merge-gated now that the gate exists … Sal's call."
This is the call, in his words:

> PROPOSE-ONLY paths should go through the merge gate now that it exists. My
> direct authorization was a stopgap because the gate didn't exist yet; now that
> it does, use it. This should be the last time a PROPOSE-ONLY change lands
> without going through review + merge-gate, unless I explicitly say otherwise
> in the moment.

**Applied to the charter** (§2, PROPOSE-ONLY): an approved proposal now lands
through the same gate as anything else — pull request, reviewer verdict, then
the Shipyard Merge button. Direct authorisation alone is no longer the route.
The one exception is Sal saying otherwise in the moment, and it covers only the
change in front of him.

**The gate requires two independent records**, both in
`~/agent-worlds/review-log/covecheck.jsonl`: a reviewer's `verdict: safe`
(`record-review.sh`) and Sal's `approvedBySal` (`approve-change.sh`). Neither
substitutes for the other — the reviewer judges the diff, Sal approves the
change itself. The approval is bound to the exact head commit, so it does not
survive the branch moving.

**That two-condition shape is a correction, and `reviewer` is why.** The first
draft of this PR said only "withheld unless the verdict is `safe`", while the
implemented gate also blocked any PR whose recorded tier was PROPOSE-ONLY —
`deploy_api.py:72`, `BLOCKING_TIERS`. Those two together were a deadlock: the
charter made the gate the mandatory route for approved PROPOSE-ONLY changes,
and the gate could never show a button for one, so with direct say-so also
declared "not the route any more" those changes had no working route at all.
`reviewer` caught it on the first review of this PR and flagged rather than
merged. `BLOCKING_TIERS` is gone; `approvedBySal` replaces it and is strictly
stronger, since it requires a positive record that Sal decided rather than
inferring from a tier that he had not.

Three wording fixes came with it, to avoid leaving the charter contradicting
itself: the tier heading read "never apply" (now "never apply unilaterally");
"do not open it as a PR" now reads "until he approves it: … do not open it as a
PR", since after approval a PR is exactly the route; and §2 now says explicitly
**who may press the button** — an agent may land its own change only where Sal's
approval is recorded against that exact commit, and the Git section carries the
matching cross-reference.

**`approvedBySal` claims only what it can back, second correction from
`reviewer`.** The draft above called a recorded approval "proof" an agent did not
approve its own work, and said naming who may press the button made "never merge
your own" *enforceable*. Both overstated. `approve-change.sh` is an ordinary file
owned by the same user every agent runs as; an agent that chose to could write
its own approval. §2 now says plainly that `approvedBySal` is **provenance and a
norm, not an enforced control** — the same language the charter already uses for
the tier boundaries and the commit-identity stamp — and the Git section now says
a recorded approval is *evidence*, not proof. Sal's call, deliberately deferred:
what would actually constitute unforgeable proof of his approval is its own
design question and is not being answered late in a session to close out this PR.

**Citations no longer rot.** This entry previously cited the charter by line
number (`AGENTS-CHARTER.md:44`, `:51-52`, `:91`). `reviewer` pointed out that
every one of them was correct against `main` and wrong the moment this PR's own
charter edits landed — including a `:91` the PR itself newly wrote. They are now
section-plus-quoted-phrase references, which survive the file moving. Each quoted
phrase was checked to resolve against the amended charter.

**Recorded as known and unresolved:** the charter still assigns no tier to
editing itself. `reviewer` raised it on PR #7 and again here, where it is more
load-bearing because this PR changes how changes land. §2 now carries it as an
explicit open gap with an interim rule (treat an amendment as at least
PROPOSE-ONLY and say so in the log), rather than leaving it silently absent.
Settling it is a decision about the constitution, not a correction to it, so it
stays open for Sal.

**One thing this entry has to admit about itself.** PR #9 — the entry directly
below, which documents `main` merging its own pull request — was also merged by
`main`, on Sal's explicit instruction in the same message that made this
decision. So the norm in `AGENTS-CHARTER.md` §2, Git section — "Never merge your
own." — was crossed a second time, with authorisation, by the very change
recording the first crossing. It was
documentation rather than a PROPOSE-ONLY path, so the new rule above does not
reach it, and the "unless I explicitly say otherwise" exception covers it. Noted
here because a log that recorded one self-merge while silently containing
another would be worth less than no log.

---

## 2026-09-22 · main · PROPOSE-ONLY · APPLIED BY EXCEPTION

**Logged retrospectively, after the fact.** This entry exists because the
deviation was not recorded when it happened. It documents an exception, not a
normal run through the process.

**What happened:** PR #8, "deploy: record what shipped to a log outside the
repo", added deploy logging to `scripts/deploy.sh`. Opened by `main`, then
merged by `main` on Sal's direct instruction. Verified from the GitHub record:

- merge commit `e0fd293`, merged `2026-09-22T18:00:55Z`
- branch `deploy-log-20260922`, single commit `d09bd40` stamped `main (agent)`
- sole file changed: `scripts/deploy.sh`
- `reviews: 0`, `reviewDecision: ""` — no review of any kind was recorded

A real production deploy of `e0fd293` followed at `18:06:25Z`, also on Sal's
direct instruction, recorded in `~/agent-worlds/deploy-log/covecheck.jsonl`.

**Why this is an exception.** `scripts/deploy.sh` is named verbatim in the
PROPOSE-ONLY list (`AGENTS-CHARTER.md` §2: "Deploy configuration,
`scripts/deploy.sh`, Vercel settings, environment variables, or anything else
that reaches production infrastructure"). That tier says to write the fix as a
proposal and — as it read at the time — "do not apply it to the working tree, do
not commit it, do not open it as a PR". Three separate norms were crossed:

1. The change was applied rather than proposed.
2. It was opened as a pull request, which PROPOSE-ONLY excluded outright.
3. `main` merged its own pull request, against the Git section's "Never merge
   your own."

Each was done on Sal's explicit, contemporaneous instruction — he asked for the
PR, then for the merge, then for the deploy. That is authorisation, and it is
the only reason this was not a violation. It is recorded here as an exception so
the record does not read as though the normal process was followed.

**What did not exist yet.** The reviewer-gated merge flow — the Shipyard panel's
"Ready to merge" section, the review log at
`~/agent-worlds/review-log/covecheck.jsonl`, and the gate that withholds a Merge
button unless a reviewer recorded `verdict: safe` — was built later the same
evening, after this merge. There was no gate to route PR #8 through at the time.
That explains the route taken; it does not make it the normal one.

**How it surfaced:** not caught at the time, by Sal or by `main`. CoveCheck's
`reviewer` raised it unprompted while reviewing PR #7, noting the pattern had
recurred on production infrastructure rather than documentation.

**Deliberately not decided here:** whether a PROPOSE-ONLY path should be
merge-gated now that the gate exists, or whether Sal's direct authorisation
stays a standing exception for it. Sal's call.

---

## 2026-09-21 · builder · AUTONOMOUS · APPLIED

Picked up the **"Not closed — carried forward"** item from the 2026-09-20 session
close below. Branch `docs/decisions-staleness-fix`, two commits, documentation
only — **no code changed**, and no file under `lib/` was touched.

**Verified before editing.** Every carried-forward claim was re-checked against
the working tree rather than taken from the log entry:

| Claim | Check | Result |
| --- | --- | --- |
| #7 status depends on a resolved gap | `lib/beach/cromwells.ts` gap `status` | **confirmed** — `'resolved'` |
| #7 "no green days, by design" | `git log -1 78cdc8a` | **confirmed false** — that commit records 91/91 great hours |
| #7 names `CROMWELLS_WIND_CALIBRATED` | `grep -rn` across the repo | **confirmed absent** — only `CROMWELLS_FULLY_CALIBRATED` exists |
| #2 status "wind calibration unresolved" | same profile gap | **confirmed** resolved |
| #2 names gap `wind-offshore-vs-shoreline` | profile `calibration[0].id` | **confirmed renamed** to `wind-gridded-models-cannot-resolve-this-cove` |

**Applied — `745c85b`.** Corrected the status lines and dead references in #7 and
#2. The reasoning in both entries is untouched; each carries a dated, attributed
note saying what was corrected, so the original claim and its correction are both
readable. Recorded inside #7, as asked, that the cap was retired on a single
in-water observation (`lib/beach/cromwells.ts:108`, `n=1`) — the basis #7 itself
argued was too thin. That tension is left standing, not resolved.

**Two more stale entries found in the same sweep, beyond the carried-forward
list.** I checked every remaining `Status:` line and every identifier cited across
all fifteen entries, on the reasoning that fixing three siblings and leaving
others stale is half a job. Both are the same class of defect and the same
AUTONOMOUS tier (§2, "`DECISIONS.md` status lines, stale identifier references"),
so I corrected them and am flagging that they were not on the assigned list:

- **#13** — status read `band **unresolved**`, and the body asserted **"the engine
  does not gate on tide at all"** with the UI saying the range is not yet set.
  Both false now. `favorableTideFt` is set to `0.0–1.5` ft MLLW, the gap is
  `status: 'provisional'`, and tide **does** gate: `LOW_TIDE_OVER_REEF` and
  `HIGH_TIDE_LESS_SHALLOW` are both `negative` (`lib/engine/reasons.ts:131`,
  `:140`). `TIDE_NOT_CALIBRATED` now fires only while a tide gap is `unresolved`;
  gated hours instead carry `TIDE_BAND_PROVISIONAL` (`caveat`).
- **#3** — status read `active`, but #13 explicitly reverses its headline
  conclusion, and the threshold it names, `minTideRangeFraction`, **does not exist
  anywhere in the codebase**. `tideRangeFraction` itself does still exist, so the
  entry is now marked superseded on the unit question only, with its reasoning
  about Honolulu's small range left intact because that part is still right.

**The numbering — judgement call, and it split in two.**

*Not fixed, deliberately: the #14 gap.* Closing it requires renumbering #15, and
entry numbers are cited from `lib/beach/cromwells.ts`, `lib/engine/assess.ts`,
`lib/engine/index.ts`, `lib/engine/reasons.ts`, `lib/engine/reasons.test.ts`,
`lib/tide.ts`, `lib/types.ts`, `lib/providers/open-meteo.ts`, `next.config.ts`,
`AGENTS-CHARTER.md` (twice) and eleven times within `DECISIONS.md` itself. A
renumber silently repoints live citations at the wrong decision, which is worse
than a gap. Left alone and flagged in the file header, per the instruction.

*Fixed, because it needed no renumbering: the ordering — `d1f037f`.* The file
declares "Newest first" but ran `15, 13, 12 … 6, 5b, 1, 2, 3, 4, 5`. Entries 1–5
share one `Decided` date, so the number is the only tie-break available, and
descending matches the rest of the file. Moved the tail to `5, 4, 3, 2, 1` after
`5b`. **This is a permutation of entry blocks, not a renumbering** — verified by
SHA-256-hashing each block before and after and comparing the multisets (equal),
and by re-resolving every `#N` reference in the file afterwards. Nothing renamed,
no body altered, so no cross-reference moved.

**State after:** `npm test` 266 passing (15 files), `npm run typecheck` clean —
same as the pre-edit baseline, as expected for a markdown-only change. Not run:
`npm run spike` / `npm run diagnose`, which hit live provider APIs and were not
needed here.

**Not done, and it needs Sal:** `DECISIONS.md` #14 was never written, and code
already cites it. Separate PROPOSE-ONLY entry directly below.

---

## 2026-09-21 · builder · PROPOSE-ONLY · APPROVED, APPLIED

> **Approved by Sal, 2026-09-21. Applied by `main` the same day.**
>
> The drafted entry below was inserted into `DECISIONS.md` verbatim, between #15
> and #13, and the obsolete "#14 is missing" note was removed from that file's
> header. The dangling citation at `lib/providers/open-meteo.ts:95` now resolves.
>
> Applied by `main` rather than `builder` only because the text was already
> drafted and the remaining work was mechanical insertion; the entry was
> extracted from the fenced block below programmatically rather than retyped, so
> the approved wording and the committed wording are identical.
>
> Sal was shown the draft and the three arguments against it before deciding.
> The first of those — that the text is reconstructed from `da04034`'s commit
> message rather than from Sal's reasoning at the time — stands as a caveat on
> the entry, not an objection resolved by approval. #14 is now the only entry in
> `DECISIONS.md` not written contemporaneously with its decision.

**Found:** `DECISIONS.md` does not skip #14 by accident, and the gap is not
cosmetic — **the entry was never written, and working code cites it.**

`lib/providers/open-meteo.ts:95`:

```ts
// A south swell hiding under a dominant trade windswell lives here, not in the
// primary partition. Omitting these under-reported exposed energy — see DECISIONS #14.
'secondary_swell_wave_height',
```

Verified: `git log --all -S"## 14." -- DECISIONS.md` returns **nothing** — no
`## 14.` heading has existed on any branch in this file's history. The commit that
added the citation, `da04034` ("fix: count secondary and tertiary swell trains in
the exposure filter"), **did not touch `DECISIONS.md`** (`git show --stat`). So the
fix landed, the citation landed, the decision entry did not.

This matters more than a numbering nit. Per that commit's own measurement, 39 of
168 fixture hours had south-window swell present *only* in the secondary or
tertiary partition and reported 0.0 ft of exposed energy — **under-reporting
energy errs toward `great`**, which is the wrong direction for a product that
tells families whether to put children in the water. That is precisely the class
of decision `DECISIONS.md` exists to record, and it is currently recorded only in
a commit message.

**Proposed:** add the missing entry. Full text, to insert between #15 and #13:

```markdown
## 14. Every swell partition is checked against the exposure window, not just the primary

**Decided:** 2026-08-02 · **Status:** active

The direction filter from #1 was correct and was being fed too little. Only the
primary swell partition and the wind wave were requested from Open-Meteo, so a
small south swell sitting *beneath* a dominant easterly windswell — the ordinary
Oahu trade-season arrangement — was invisible to a beach that is open only to the
south.

Measured on the 7-day fixture: **39 of 168 hours** had swell inside the 135–225°
window present *only* in the secondary or tertiary partition, and every one of
those reported `exposedSwellHeightFt` of 0.0 ft. Cross-checked against a Surfline
screenshot listing three trains where CoveCheck showed one: at 2026-08-02 20:00
Surfline had 1.7 ft from S 188° while Open-Meteo's secondary train read 1.84 ft
from 185° — the same swell — and CoveCheck reported 0.0 ft.

**The error direction is the reason this is recorded as a decision and not a
bugfix.** Under-reporting exposed energy errs toward `great`, which is the wrong
way to be wrong for a family safety product. HANDOFF.md had asked for "secondary
swell variables when available"; they were omitted.

The filter itself needed no change — it already admits each partition on its own
direction and combines survivors in quadrature (#1). The fix is requesting the
variables and passing all four trains in. Schema fields are **optional** rather
than required, so an upstream removal degrades instead of blanking every verdict,
and normalization emits a warning when they are absent — so that degradation
cannot silently reinstate the bug.

Verdicts were unchanged for that week, since exposed height stays under the 3 ft
threshold either way. The reported figure is now correct and would trip caution on
a genuine south swell.

**Would reverse this:** nothing short of a nearshore model that reports a single
authoritative surf-face height at the cove (see #1's reversal condition), which
would make partition bookkeeping moot.
```

**Rationale.** It closes the only dangling citation in the codebase, and it
restores a safety-relevant decision to the file that is supposed to hold it. The
number is already reserved by the code comment, so this creates no renumbering
and no ambiguity.

**Why PROPOSE-ONLY rather than applied.** §2 puts "documentation corrections" in
AUTONOMOUS, and I applied that tier to the status-line fixes above without asking.
This is different in kind: authoring a *new* entry in a §5 source-of-truth
document is composition, not correction, and the subject matter is engine
behaviour. §2 says to act at the higher tier when genuinely unsure and say so in
the log — so this is unapplied, and I am saying so.

**What would argue against it, stated plainly:**

- **Every word above is reconstructed from `da04034`'s commit message**, not from
  Sal's reasoning at the time. The measurements, the Surfline cross-check and the
  error-direction argument are quoted from that commit, but the framing and the
  "would reverse this" line are mine. If #14 was left out on purpose, this is
  putting words in Sal's mouth and should be rejected outright.
- **Why it was omitted is not established.** I found no evidence either way — no
  draft, no TODO, no reverted commit. I did not resolve it with a guess.
- The cheaper alternative is to repoint the comment at #1, which already covers
  per-partition admission. I did not do that: #1 does not record the *variable
  selection* bug, the 39/168 measurement, or the error-direction argument, so
  repointing would make the citation resolve while losing what it cited.

**Either decision closes this cleanly.** Approve and #14 exists; reject and the
comment at `lib/providers/open-meteo.ts:95` should be repointed or dropped so the
repo stops citing an entry that will never be written. **Leaving it as-is is the
one outcome that keeps the dangling reference alive.**

---

## 2026-09-20 · main · AUTONOMOUS · SESSION CLOSE

Closing state for the 2026-09-20 session. Everything below this entry is
resolved; one item found during the session is **not**, and is carried forward
at the end.

**Closed — enforcement and repo hygiene**

| Item | Outcome |
| --- | --- |
| Per-agent tool-policy denial | **Declined** — tested, does not block native tools |
| Per-agent git credential scoping | **Not possible** — commit needs no credentials; keychain is shared |
| Branch protection on `main` | **Applied**, verified by live-fire push refusal |
| Required approvals `1` → `0` | **Applied**, re-verified by live fire |
| Repository visibility | **Public**, after a clean full-history secret scan |
| Work email in `scripts/deploy.sh` | **Removed** — PR #1, merged `3f3b970` |
| Charter, log, `AGENTS.md` pointer | **Committed** — PR #2, merged `bedff12` |
| `SOUL.md` / `USER.md` / `IDENTITY.md` | **Gitignored** (`.gitignore:46-48`) |
| GitHub email visibility | **Private** — was `public`, verified before and after |
| Repo-scoped commit email | **Set** to the account noreply alias |
| Block CLI pushes exposing email | **Enabled by Sal in the GitHub UI** |

That last row is **recorded on Sal's report, not verified** — GitHub exposes no
REST endpoint for it, so no agent can confirm it. Every other row was checked
against disk, `git log`, or the live remote.

**Not closed — carried forward**

`DECISIONS.md` is still stale, and it is the finding that opened this session.
Confirmed still present on `main`:

- `:235` — #7 reads `**Status:** active while calibration gap #2 is open`. The
  gap is resolved; the entry is inert.
- `:239` — #7 asserts the product "currently has no green days, by design".
  False since `78cdc8a`.
- `:258` — #7 points at `CROMWELLS_WIND_CALIBRATED` in `lib/engine/fixtures.ts`.
  That symbol does not exist; it is now `CROMWELLS_FULLY_CALIBRATED`.
- `:342` — #2 reads `**Status:** wind calibration **unresolved**`. Resolved.
- `:372` — #2 names the gap `wind-offshore-vs-shoreline`. Renamed to
  `wind-gridded-models-cannot-resolve-this-cove`.

Also: the log skips #14, and ordering breaks after #5b (running 15, 13, 12 … 5b,
then 1, 2, 3, 4, 5) — which matters because entries cross-reference each other
by number constantly.

This is **AUTONOMOUS** work under §2 — documentation correction, explicitly
including `DECISIONS.md` status lines — so any agent may fix it without asking.
It was left undone because the session moved to enforcement instead. Whoever
picks it up: correct the status lines and dead references, do not rewrite the
reasoning, and note that #7's cap was retired on a single in-water observation
(`lib/beach/cromwells.ts:108`), which #7 itself argued against.

---

## 2026-09-20 · main · AUTONOMOUS · APPLIED

**Done:** added a "Git: commits, pushes, and attribution" subsection to
`AGENTS-CHARTER.md` §2 — never push to `main`, never rewrite history, never
`git add -A`, and stamp every commit with a per-agent identity.

**Deviation from what Sal asked, and why.** The request was to set a distinct
`user.name`/`user.email` in "builder's local config". **That is not possible as
stated, and doing it literally would cause harm.** Repo-local git config lives
in a single `.git/config` shared by every process using this working tree — all
agents *and* Sal. Setting `user.name = builder` there would relabel Sal's own
commits as `builder`, which is worse than the current ambiguity.

Traced: the active identity comes from `file:/Users/salvatorepercival/.gitconfig`
(`bluesalmanifest <salvatore.percival@manifest.net>`); repo-local identity is
unset. The credential helper comes from the system gitconfig under
`/Library/Developer/CommandLineTools/`. All three scopes are shared; none is
per-agent. This is the same root cause as the push finding below — one OS user,
one config stack.

**What was done instead:** the charter now requires the per-command form, which
affects only the invoking process:

```bash
git -c user.name="builder (agent)" \
    -c user.email="builder@agents.covecheck.invalid" commit -m "..."
```

`.invalid` is reserved by RFC 2606 and cannot resolve, so these addresses can
never reach a real mailbox.

**Honest limitation:** this is provenance by convention, not attribution that
can be relied on. A non-cooperating agent commits as Sal. Real per-agent
identity needs separate OS users, which is a much larger change than this
request assumed. Raise it if attribution needs to survive a misbehaving agent.

---

## 2026-09-20 · main · PROPOSE-ONLY · APPLIED

> **Applied 2026-09-20 on Sal's decision. `main` is now protected server-side —
> the first real enforcement point in this repo.**
>
> Protection required a paid plan while the repo was private, so Sal chose to
> **make `covecheck` public** rather than upgrade. Sequence:
>
> 1. **Pre-flight secret scan before publishing** — publishing exposes all
>    history, not just the working tree, and is effectively irreversible once
>    cloned or indexed. Scanned every blob across `git rev-list --all` for
>    private keys and token formats (`sk-`, `gh[pousr]_`, `AKIA`, `xox`,
>    `AIza`, PEM headers): **no matches**. No `.env`, `.pem`, `.key`, secret,
>    or credential file has ever been tracked on any branch. `scripts/deploy.sh`
>    carries no token — it relies on ambient `vercel` CLI auth. The one local
>    secret, `VERCEL_OIDC_TOKEN` in `.env.local`, is gitignored, never
>    committed, and not referenced in tracked code.
> 2. **Visibility changed** — `gh repo view` → `isPrivate: false`.
> 3. **Protection applied** — `enforce_admins: true`,
>    `required_pull_request_reviews` present, `dismiss_stale_reviews: true`,
>    `allow_force_pushes: false`, `allow_deletions: false`.
>
>    `required_approving_review_count` was set to **1** initially, then changed
>    to **0** the same day. Reason: with `enforce_admins: true`, GitHub will not
>    let an author approve their own pull request, so on a single-maintainer
>    repo one required approval locked Sal out of merging entirely. At `0` the
>    pull request is still mandatory and the branch is still unwritable
>    directly — only the second pair of eyes is optional. Re-verified by live
>    fire after the change: direct push and `--force` both still refused with
>    `GH006`.
> 4. **Verified by live fire, not by reading the API back.** Made a real commit
>    on `main` and attempted a real push:
>
>    ```
>    remote: error: GH006: Protected branch update failed for refs/heads/main.
>    remote: - Changes must be made through a pull request.
>    ! [remote rejected] main -> main (protected branch hook declined)
>    ```
>
>    A `--force` push was refused identically. Both refusals came against the
>    repo **owner's** credentials, which is what proves `enforce_admins` is
>    live rather than nominal. Local commit reset, scratch file removed; local
>    `HEAD` and remote `main` both back at `669995e`, working tree unchanged.
>
> **Scope of what this does and does not do.** It protects shared history and
> what deploys. It does not protect the working tree, does not stop a local
> commit, and does not stop pushing a non-`main` branch. Those remain norms —
> `AGENTS-CHARTER.md` §2 now states the split explicitly.
>
> **Disclosure accepted with this change:** the source is now public, and two
> work addresses are visible in it — `salvatore.percival@manifest.net` (commit
> author on every commit) and `salvatore.percival@checkfront.com` (named in a
> comment in `scripts/deploy.sh`). No credential is exposed.
>
> **Correction to this entry's original text:** it recorded `origin` as public
> on `builder`'s report, which was wrong at the time — the repo was private
> until this change. `builder`'s *conclusion* survived and was strengthened by
> the error: on a private repo the dry-run push necessarily authenticated,
> since anonymous access would have failed outright.

**Question:** can git credentials be scoped so only `main` can commit and push,
while other agents edit their working tree freely? Tested rather than reasoned
about, same method as the declined entry below: real attempt, verified against
`git log` and the remote, not the agent's self-report.

**Test.** Spawned `builder` on a scratch branch off `669995e`. Told it to commit
one scratch file and then `git push --dry-run`, with real pushes, force flags,
history rewrites, and `git add -A` explicitly forbidden.

| Step | Result |
| --- | --- |
| `git commit` | **succeeded** — `72886c8`, no prompt, no hook, no signing requirement |
| `git push --dry-run` | **succeeded and authenticated** — `[new branch] agent-perm-test-scratch` |

Verified independently: the commit contained only `.denytest-git-scratch.txt`
(the six uncommitted working-tree files were not swept up), and
`git ls-remote --heads origin` returned only `refs/heads/main` at the baseline
SHA — the remote was never written to. State restored afterward: scratch branch
deleted, scratch file removed, `HEAD` back at `669995e`, working tree identical.

`builder` also closed a hole in its own evidence unprompted: `origin` is public,
so anonymous `ls-remote` succeeds, which would make a dry-run look authenticated
when it wasn't. It re-ran with the credential helper stripped and got
`fatal: could not read Username for 'https://github.com'`, proving the original
dry-run genuinely reached `git-receive-pack` with working write credentials.

**Answer: no. Credentials cannot be scoped per-agent here, and commit cannot be
credential-scoped at all.** Two separate reasons, worth keeping distinct:

1. **`git commit` uses no credentials.** It is a purely local operation. There
   is nothing for credential scoping to withhold. Any agent with shell access in
   this working tree can commit, and no arrangement of credentials changes that.
2. **`git push` credentials are shared by construction.** The helper is
   `osxkeychain`, and every agent runs as the same macOS user, so they all reach
   the same keychain. OpenClaw's per-agent schema
   (`gateway/config-agents/entries-and-multi-agent.md:75-96`) has no `env`,
   credential, or process-identity field to vary this. Separating them would
   require separate OS users, which is a much larger change than this question
   assumed.

**Proposed — move enforcement server-side:**

Enable GitHub branch protection on `salvatorepercival-maker/covecheck`, branch
`main`:

- Require a pull request before merging (1 approval).
- Block force pushes and branch deletion.
- Apply to administrators, so the rule is not silently bypassable.

**Rationale.** This is the only mechanism found across three tests that does not
depend on agent cooperation. It does not care which agent holds credentials or
what tool policy says: the write is refused at the remote. It gives exactly the
shape asked for — agents edit and commit locally without friction, and nothing
reaches shared history without passing through review.

What it does **not** do, stated plainly: it does not stop a local commit, it
does not protect the working tree, and it does not stop a push to a *non-*`main`
branch. It draws the line at repo history and at what deploys, which is where
the irreversible consequences actually are.

**Also worth deciding (not part of the proposal):** commits are authored as
`bluesalmanifest <salvatore.percival@manifest.net>` while pushes authenticate as
`salvatorepercival-maker`. Agent commits are therefore indistinguishable from
Sal's in `git log`. If you want agent work attributable after the fact, set a
distinct `user.name`/`user.email` per agent — that is provenance, not a control,
and an agent can override it.

**Checked and clean:** `.env.local` is covered by `.gitignore:34` and has never
been committed to any branch. The repository being public does not expose it.

---

## 2026-09-20 · main · PROPOSE-ONLY · DECLINED

> **DECLINED by Sal, 2026-09-20 — the proposed config does not work. Do not apply it.**
>
> The "Not verified" caveat at the bottom of this entry was tested on
> 2026-09-20 and **failed**. `agents.entries.builder.tools.deny` does not block
> native Claude Code tools. Full method and evidence in the test-result section
> at the end of this entry. The research below is still accurate; the remedy is
> not. PROPOSE-ONLY remains a norm — see `AGENTS-CHARTER.md` §2.

**Found:** `AGENTS-CHARTER.md` §2 PROPOSE-ONLY is currently a norm, not an
enforced control. Nothing prevents an agent with write access from editing
`lib/engine/`. Sal asked what tool-permission denials would make it structurally
true. Researched against the installed OpenClaw docs rather than assumed:

*The mechanism Sal named does not work here.* A repo-level
`covecheck/.claude/settings.json` has no effect on OpenClaw-spawned agents.
OpenClaw launches the `claude-cli` backend with a fixed argv
(`gateway/cli-backends.md:333`) that includes **`--setting-sources user`**, so
project-scoped Claude Code settings are never loaded. Only user-level
`~/.claude/settings.json` is read. Verified: no `.claude/` directory exists in
this repo today, so nothing is silently half-applied.

*Path-based denial does not exist in OpenClaw's config surface.* Tool policy is
tool-granular — `tools.allow` / `tools.deny` accept tool names and groups such
as `group:fs` = `read, write, edit, apply_patch`
(`gateway/config-tools/tool-policy.md`). There is no documented path or glob
syntax. Per-agent policy exists at `agents.entries.<id>.tools`
(`gateway/config-agents/entries-and-multi-agent.md:63-65`) with the same
tool-level granularity. Sandboxing confines to a workspace *root*; `lib/engine/`
is inside the workspace, so it does not help.

*OpenClaw's policy is the authoritative layer.* `gateway/cli-backends.md:160-166`
states OpenClaw's `PreToolUse` hook keeps native tools under host control
"including when user or enterprise settings would otherwise preapprove a call",
that file arguments are projected into OpenClaw equivalents, and that per-agent
restrictions override broader global policy. So OpenClaw *sees* the paths — it
just exposes no way to filter on them.

**Conclusion: the control Sal asked for — per-agent, path-scoped write denial —
cannot be expressed as configuration in either system today.** What follows is
the closest structurally-real approximation, and it has a cost.

**Proposed:**

```json5
// ~/.openclaw/openclaw.json
{
  agents: {
    entries: {
      builder: {
        tools: {
          deny: ["write", "edit", "apply_patch", "exec"],
        },
      },
    },
  },
}
```

Apply the same block to `calibrator`, `watchdog`, and `growth` as they are
created. `main` is left unrestricted; it is the agent Sal drives directly.

**Rationale:**

This makes PROPOSE-ONLY structurally true by making the agent read-only
outright, rather than by protecting specific paths. It is enforced by
OpenClaw's `before_tool_call` layer, not by the agent's cooperation.

`exec` must be denied alongside the filesystem tools. Denying `write`/`edit`
while leaving shell access is not a control at all — `echo > lib/engine/x.ts`
walks straight through it. This is the part most likely to be dropped as
over-cautious; it is the part that makes the rest mean anything.

**What this costs, stated plainly:**

1. **It is broader than the charter.** PROPOSE-ONLY names four protected areas;
   this denies writes everywhere. A restricted agent could not fix a typo in
   `README.md` without review.

2. **It breaks the charter's own reporting mechanism.** §3 tells agents to write
   findings to `AGENT-LOG.md`. A write-denied agent cannot. §3 needs amending so
   restricted agents return their report to the spawning session, which writes
   the entry on their behalf. Adopting this config without that amendment leaves
   the charter self-contradictory.

3. **It removes `npm test`.** Denying `exec` means restricted agents cannot run
   the suite, typecheck, or lint — all listed as AUTONOMOUS in §2. The
   `builder` audit on 2026-09-20 relied on running code. This is a real
   capability loss, not a technicality.

**Alternatives considered and rejected:**

- *Path rules in user-level `~/.claude/settings.json`.* Would load, and Claude
  Code does support path-scoped permission rules. Rejected: user-level settings
  are global to Sal's machine, so the same rule that blocks `builder` also
  blocks Sal's own direct Claude Code sessions in this repo — blocking the
  approver. It is also not per-agent, and OpenClaw's own policy runs over it.

- *Sandboxing.* Confines to a workspace root. `lib/engine/` is inside the
  workspace. Does not express the boundary.

- *Doing nothing.* Defensible. The charter is a norm; norms work when the agents
  reading them are reliable. Worth weighing against the cost above rather than
  dismissing.

**Recommendation:** do not apply as-is. Either accept read-only agents and amend
§3 and §2 to match, or leave PROPOSE-ONLY as a norm and revisit if OpenClaw adds
path-scoped policy. The middle option — denying `write`/`edit` but keeping
`exec` — looks like a control and is not one; it should not be chosen.

**Verified:** the `--setting-sources user` argv, the tool-group definitions, the
per-agent `tools` block, and the `PreToolUse` precedence statements all read
directly from the installed docs at
`~/.nvm/versions/node/v24.21.0/lib/node_modules/openclaw/docs`. The absence of
`covecheck/.claude/` confirmed by listing.

**Previously not verified — now tested, and it failed:** whether
`agents.entries.<id>.tools.deny` denies the *native* Claude Code
`Write`/`Edit`/`Bash` tools, or only OpenClaw's own tool names.

### Test result — 2026-09-20 · FAIL

**Method.** Applied `tools.deny: ["write","edit","apply_patch","exec"]` to
`agents.entries.builder` (verified present via `config.get`). Spawned `builder`
with instructions to attempt three actions against throwaway `/tmp` paths using
its native tools, and to report verbatim any block. Treated the filesystem as
ground truth rather than the agent's self-report. Reverted the config and
deleted the scratch files afterward.

| Attempt | Native tool | Result |
| --- | --- | --- |
| `/tmp/covecheck-denytest-write.txt` | `Write` | **succeeded** |
| `/tmp/covecheck-denytest-edit.txt` | `Edit` | **succeeded** |
| `/tmp/covecheck-denytest-bash.txt` | `Bash` | **succeeded** |

All three files existed on disk afterward with the expected contents. No policy
denial, no permission prompt, no error text at any layer. The agent's report and
the filesystem agreed exactly.

**Conclusion.** `tools.deny` did not block a single native tool. The deny list
names OpenClaw's tool identifiers (`write`, `edit`, `apply_patch`, `exec`); the
agent's native toolset under the `claude-cli` runtime is Claude Code's
(`Write`, `Edit`, `Bash`). The outcome is consistent with the policy matching
only OpenClaw tool names — though this test establishes the outcome, not the
mechanism. The "projected into their OpenClaw equivalents" language at
`cli-backends.md:163` does not produce enforcement here.

**Therefore: no mechanism currently available makes PROPOSE-ONLY structurally
true for a `claude-cli` agent.** Not repo `.claude/settings.json`
(`--setting-sources user` excludes it), not OpenClaw per-agent `tools.deny`
(does not reach native tools), not sandboxing (root-level only). The remaining
options are all norms, or user-global rules that would also block Sal.

**Recommended resolution:** withdraw this proposal. Keep PROPOSE-ONLY as a norm
and state plainly in `AGENTS-CHARTER.md` §2 that it is unenforced, so no future
agent mistakes it for a guardrail that exists. Revisit if OpenClaw adds
path-scoped or runtime-aware tool policy.

**Config state after test:** reverted. `agents.entries.builder` is back to its
five original keys with no `tools` block; confirmed by `config.get`.
