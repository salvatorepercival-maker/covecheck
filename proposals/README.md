# Proposed changes to files outside this repository

Some of the machinery agents work under does not live here. `deploy_api.py`, the
town server, and the `*-decision.sh` / `*-review.sh` scripts all sit in
`~/agent-worlds/`, which is **not a git repository at all** — no history, no
branches, nothing to open a pull request against.

That is a problem for PROPOSE-ONLY work (`AGENTS-CHARTER.md` §2), because a
proposal there has nowhere to be reviewed. Previously such a change was written
as a loose `PROPOSED-*.patch` beside the file and applied once Sal agreed, which
means the diff never passed a reviewer and left no record of what was approved.

**So a change to one of those files is proposed as a patch file here**, in the
pull request that carries its charter change and its tests. The reviewer reads
the diff in the PR like any other. Merging the PR does **not** apply it —
nothing in this repository can — so applying it to `~/agent-worlds/` stays a
separate, deliberate step after approval.

Name them `YYYY-MM-DD-<subject>-<target-file>.patch`. Each applies with:

```bash
git apply --check ~/covecheck/proposals/<name>.patch   # verify first
patch -p1 -d ~/agent-worlds < ~/covecheck/proposals/<name>.patch
```

A patch that has been applied is kept, not deleted: it is the record of what the
out-of-repo file was changed to and which pull request reviewed it.
