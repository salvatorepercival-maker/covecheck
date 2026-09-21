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
