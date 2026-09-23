#!/usr/bin/env python3
"""Regression coverage: a fix PR closes the escalation report it answers -- and
closes nothing else.

Run it:

    python3 scripts/test_escalation_autoclose.py [path/to/deploy_api.py]

With no argument it tests `~/agent-worlds/deploy_api.py`, the live file. Pass a
path to test a candidate copy before that file is touched -- which is how this
was run while the change was still PROPOSE-ONLY and unapplied.

WHY THIS LIVES HERE AND IS NOT PART OF `npm test`. The behaviour under test is
in `deploy_api.py`, which sits outside this repository and outside git entirely,
so there is nothing for vitest to import. Wiring it into `npm test` would make
the suite fail on any clone that has no `~/agent-worlds`, which is worse than it
being run deliberately. It is stdlib-only and takes no setup, and the charter
rule it covers (S2, "Closing the escalation report") is what a reviewer checks
against a fix PR by eye.

NOTHING HERE TOUCHES THE NETWORK. `is_escalation_report()` is pure by design so
the rule can be tested offline, and the one function that does fetch
(`escalation_report_now`) is stubbed in the seam tests. A test that needed
GitHub to be up would get skipped on a bad day, and a skipped safety test reads
as a passing one.

It fails loudly -- non-zero exit, named reason -- rather than skipping, so
"nothing ran" can never read as "everything passed".
"""

import json
import os
import sys
import tempfile
import importlib.machinery
import importlib.util

DEFAULT_TARGET = os.path.join(os.path.expanduser("~"), "agent-worlds", "deploy_api.py")

_failures = []
_passes = 0


def check(name, condition, detail=""):
    global _passes
    if condition:
        _passes += 1
        print("  ok   %s" % name)
    else:
        _failures.append((name, detail))
        print("  FAIL %s%s" % (name, ("\n         " + detail) if detail else ""))


def load(path):
    if not os.path.exists(path):
        sys.exit("FATAL: no deploy_api.py at %s -- nothing was tested." % path)
    # Explicit SourceFileLoader so the target can be any path -- a candidate
    # copy under review will not always be named *.py, and inferring the loader
    # from the extension would turn "wrong filename" into a crash that looks
    # like a test failure.
    loader = importlib.machinery.SourceFileLoader("deploy_api_under_test", path)
    spec = importlib.util.spec_from_loader(loader.name, loader)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def pr(number=19, title="ESCALATED: something is wrong on the live site",
       body="**ESCALATE** -- the live site is showing a wrong verdict.",
       state="OPEN", files=("AGENT-LOG.md",)):
    """A `gh pr view --json number,title,body,state,files` payload."""
    return {"number": number, "title": title, "body": body, "state": state,
            "files": None if files is None else [{"path": p} for p in files]}


def test_escalation_report_rule(api):
    """The rule itself: what counts as an escalation report, and what does not.

    This is the safety property. Everything else in this file is plumbing around
    it. A false positive here closes a pull request somebody meant to merge.
    """
    print("\nis_escalation_report() -- the rule")

    ok, _ = api.is_escalation_report(pr())
    check("a declared, log-only, open PR IS a report", ok)

    # Real controls, taken from this repository's actual history rather than
    # invented. #19 and #12 are the two genuine escalation reports; every other
    # shape below is a pull request somebody did or would merge.
    ok, why = api.is_escalation_report(pr(
        number=12, title='ESCALATED: live site labels a best-of-day verdict "conditions now"',
        body="## ESCALATED -- the live site is labelling a best-of-day verdict"))
    check("#12's real shape IS a report", ok, why)

    ok, why = api.is_escalation_report(pr(
        number=26,
        title="PROPOSE-ONLY: close the escalation report automatically when its fix merges",
        body="**PROPOSE-ONLY -- AWAITING APPROVAL. Do not merge.**",
        files=("AGENTS-CHARTER.md", "scripts/test_escalation_autoclose.py")))
    check("this very PR is NOT a report", not ok, why)

    # THE MARKER IS CASE-SENSITIVE, AND THAT HAS TO BE TESTED BY SOMETHING THAT
    # WOULD ACTUALLY CHANGE. An earlier version of this test used the word
    # "escalation", which never matches `\bESCALATED?\b` in either case -- so it
    # passed against a deliberately case-insensitive mutant and proved nothing.
    # Lowercase "escalated" is the discriminating case: prose that MENTIONS an
    # escalation is not a pull request that DECLARES one.
    ok, why = api.is_escalation_report(pr(
        title="docs: record that #19 was escalated and then fixed",
        body="An ordinary log entry about an escalated finding."))
    check("lowercase `escalated` in prose does NOT declare one", not ok, why)

    # PR #26's real title, which contains the word "escalation". Kept as a
    # separate, weaker assertion: it is a true statement about a real PR, but it
    # is not what proves the case-sensitivity above.
    ok, why = api.is_escalation_report(pr(
        title="close the escalation report automatically when its fix merges",
        body="An ordinary change that talks about escalation a lot."))
    check("the noun `escalation` in a title does NOT declare one", not ok, why)

    # Ordinary log-keeping PRs. These MERGED, and they touch only AGENT-LOG.md
    # -- so the file rule alone would pass them. Five real ones exist (#17, #15,
    # #11, #9, #3), which is why the declaration is required as well.
    ok, why = api.is_escalation_report(pr(
        number=17, title="docs: record that PR #12 was closed unmerged, and why",
        body="Log entry only.", state="MERGED"))
    check("a merged log-only docs PR is NOT a report", not ok, why)

    ok, why = api.is_escalation_report(pr(
        number=17, title="docs: record that PR #12 was closed unmerged, and why",
        body="Log entry only.", state="OPEN"))
    check("an OPEN log-only docs PR is still NOT a report (no declaration)",
          not ok, why)

    # The declaration alone is not enough either: a PR can say ESCALATE and still
    # carry a diff somebody means to land.
    ok, why = api.is_escalation_report(pr(
        title="ESCALATED: and also here is the fix",
        files=("AGENT-LOG.md", "lib/engine/assess.ts")))
    check("a declared PR that changes engine code is NOT a report", not ok, why)

    ok, why = api.is_escalation_report(pr(state="MERGED"))
    check("a MERGED PR is never a report", not ok, why)

    # Unreadable input must be False, never True. "I could not check" and "I
    # checked and it is fine" are different answers and are never collapsed.
    ok, why = api.is_escalation_report(pr(files=None))
    check("an unreadable file list is NOT a report", not ok, why)
    ok, why = api.is_escalation_report(pr(files=()))
    check("an empty diff is NOT a report", not ok, why)
    ok, why = api.is_escalation_report(None)
    check("missing PR data is NOT a report", not ok, why)

    # A failed fetch must degrade to False, not raise and not pass.
    cfg = dict(api.PROJECTS["covecheck"], gh="no-such-owner/no-such-repo-xyzzy")
    api_run = api._run
    try:
        api._run = lambda argv, cwd=None, timeout=None: (1, "", "could not resolve to a Repository")
        ok, why = api.escalation_report_now(cfg, 19)
        check("a failed GitHub read is NOT a report", not ok, why)
        api._run = lambda argv, cwd=None, timeout=None: (0, "{not json", "")
        ok, why = api.escalation_report_now(cfg, 19)
        check("an unreadable GitHub response is NOT a report", not ok, why)
    finally:
        api._run = api_run


def test_instruction_unit(api):
    """The instruction: closing syntax only where the target was established."""
    print("\nescalation_autoclose_instruction()")

    # GENERAL, not shaped around #19. The bug this fixes was found on #19, and
    # the fix must hold for any escalation PR number.
    for number in (19, 1, 7, 12, 2456):
        text = api.escalation_autoclose_instruction(number, established=True)
        check("established PR #%d gets a closing keyword" % number,
              text is not None and ("Closes #%d" % number) in text,
              "got: %r" % (text,))

    # THE SAFETY HOLE THIS CLOSED. An unestablished target must get no closing
    # keyword of any kind -- not `Closes`, not `Fixes`, not `Resolves`. It still
    # gets the plain back-link, which is exactly what existed before any of this.
    text = api.escalation_autoclose_instruction(26, established=False,
                                                why="it is not a report")
    for kw in ("Closes #26", "Fixes #26", "Resolves #26"):
        check("unestablished PR #26 gets no `%s`" % kw, kw not in text,
              "got: %r" % (text,))
    check("unestablished PR #26 still gets the plain back-link",
          "Link the new PR back to #26" in text, "got: %r" % (text,))
    check("unestablished PR #26 is told WHY the line is missing",
          "it is not a report" in text, "got: %r" % (text,))

    # Default must be the safe one. If a future caller forgets the argument, it
    # must fail closed rather than emit closing syntax.
    check("the default is no closing keyword",
          "Closes #31" not in api.escalation_autoclose_instruction(31),
          "got: %r" % (api.escalation_autoclose_instruction(31),))

    # It must name THAT PR and no other. A fix closing the wrong pull request is
    # the failure mode that would be worst here, so this is asserted directly
    # rather than inferred from the presence of the right one.
    text = api.escalation_autoclose_instruction(19, established=True)
    for other in (18, 20, 191, 9):
        check("PR #19's instruction does not reference #%d" % other,
              ("#%d" % other) not in text,
              "instruction leaked another PR number: %r" % text)

    # The request-card branch is deliberately untouched: no PR exists yet, so
    # there is nothing to close and no number that could be honestly emitted.
    for req in ("req-1790141-a3f2", "req-0000000-0000"):
        check("request card %s gets no closing keyword" % req,
              api.escalation_autoclose_instruction(req, established=True) is None,
              "got: %r" % (api.escalation_autoclose_instruction(req),))


def _wire(api, tmp, established, why="checked"):
    """Point the module at scratch paths and stub both network calls."""
    decision_path = os.path.join(tmp, "decisions.jsonl")
    queue_path = os.path.join(tmp, "task-queue.jsonl")
    api.PROJECTS["covecheck"] = dict(api.PROJECTS["covecheck"],
                                     decision=decision_path, queue=queue_path)
    # _pr_now's result is informational on this path (chosenSha), so a stub is
    # faithful. escalation_report_now is the one under test, so its verdict is
    # driven explicitly rather than left to whatever GitHub says today.
    api._pr_now = lambda cfg, number: ({"headRefOid": "d" * 40}, None)
    api.escalation_report_now = lambda cfg, number: (established, why)
    return decision_path, queue_path


def _card(**kw):
    base = {
        "pr": 19,
        "title": "live site shows `great` for wind above this beach's ceilings",
        "options": [
            {"id": "A", "name": "gate the verdict", "changes": "c", "userSees": "u",
             "tradeoff": "t"},
            {"id": "B", "name": "say it out loud", "changes": "c", "userSees": "u",
             "tradeoff": "t", "why": "smaller blast radius"},
        ],
    }
    base.update(kw)
    return base


def test_brief_wiring(api):
    """The seam: decide() must actually put the keyword in the brief it sends.

    The unit tests above can pass while nothing calls them, which would leave the
    manual close exactly where it was. This drives decide() end to end and reads
    the brief that reaches `main`.
    """
    print("\ndecide() -> the brief main receives")

    tmp = tempfile.mkdtemp(prefix="autoclose-test-")
    decision_path, queue_path = _wire(api, tmp, established=True)
    with open(decision_path, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(_card()) + "\n")

    code, body = api.decide("covecheck", 19, "B", source="auto")
    check("decide() succeeded", code == 200 and body.get("ok"),
          "code=%s body=%s" % (code, body))

    if not os.path.exists(queue_path):
        check("a brief was queued for main", False, "no queue file written")
        return
    brief = json.loads(open(queue_path, encoding="utf-8").read().strip().splitlines()[-1])["text"]

    check("the brief carries `Closes #19`", "Closes #19" in brief,
          "brief was:\n%s" % brief)
    check("the brief says DESCRIPTION, not commit message",
          "DESCRIPTION" in brief, "brief was:\n%s" % brief)
    check("the brief still forbids merging", "do not merge it" in brief,
          "the PROPOSE-ONLY instruction was lost")
    check("the brief still names the reviewer gate",
          "approvedBySal" in brief and "reviewer verdict" in brief,
          "the merge-gate instruction was lost")

    # The request-card branch, through the same entry point, must be unchanged:
    # it reports its PR number back for migration and carries no closing keyword.
    req = "req-1790141-a3f2"
    with open(decision_path, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(_card(pr=None, requestId=req)) + "\n")
    code, body = api.decide("covecheck", req, "B", source="auto")
    check("decide() succeeded for a request card", code == 200 and body.get("ok"),
          "code=%s body=%s" % (code, body))
    rbrief = json.loads(open(queue_path, encoding="utf-8").read().strip().splitlines()[-1])["text"]
    check("a request card's brief carries no closing keyword",
          "Closes #" not in rbrief, "brief was:\n%s" % rbrief)
    check("a request card is still told to report its PR number back",
          "report its number back" in rbrief, "brief was:\n%s" % rbrief)


def test_brief_refuses_unestablished(api):
    """THE REGRESSION TEST FOR THE SAFETY HOLE.

    A card keyed to a pull request that is not an escalation report must produce
    a brief with no closing syntax in it. Before this, `decide()` emitted
    `Closes #N` unconditionally, so a card recorded against a PR somebody meant
    to merge would have produced a fix that silently closed it.

    The escalation path must still WORK -- degrade, not refuse. This is the
    ESCALATE path, and a GitHub hiccup must not be able to strand a safety
    finding, so the brief still goes out and still says what is missing.
    """
    print("\ndecide() -> an unestablished target gets NO closing syntax")

    tmp = tempfile.mkdtemp(prefix="autoclose-unestab-")
    decision_path, queue_path = _wire(api, tmp, established=False,
                                      why="it is MERGED, so it was a change that landed")
    with open(decision_path, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(_card(pr=20)) + "\n")

    code, body = api.decide("covecheck", 20, "B", source="auto")
    check("decide() still dispatches rather than stranding the escalation",
          code == 200 and body.get("ok"), "code=%s body=%s" % (code, body))

    brief = json.loads(open(queue_path, encoding="utf-8").read().strip().splitlines()[-1])["text"]
    for kw in ("Closes #20", "Fixes #20", "Resolves #20"):
        check("the brief carries no `%s`" % kw, kw not in brief,
              "brief was:\n%s" % brief)
    check("the brief still links back to #20", "Link the new PR back to #20" in brief,
          "brief was:\n%s" % brief)
    check("the brief says why no closing line was emitted",
          "it is MERGED" in brief, "brief was:\n%s" % brief)
    check("the brief still forbids merging", "do not merge it" in brief,
          "the PROPOSE-ONLY instruction was lost on the degraded path")


def main():
    target = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_TARGET
    print("testing: %s" % target)
    api = load(target)

    for name in ("escalation_autoclose_instruction", "is_escalation_report",
                 "escalation_report_now"):
        if not hasattr(api, name):
            sys.exit("FATAL: %s has no %s() -- the change under test is not "
                     "applied there." % (target, name))

    test_escalation_report_rule(api)
    test_instruction_unit(api)
    test_brief_wiring(api)
    test_brief_refuses_unestablished(api)

    print("\n%d passed, %d failed" % (_passes, len(_failures)))
    if _failures:
        sys.exit(1)


if __name__ == "__main__":
    main()
