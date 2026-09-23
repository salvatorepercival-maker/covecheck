#!/usr/bin/env python3
"""Regression coverage: a fix PR must close the escalation report it answers.

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


def test_instruction_unit(api):
    """The instruction itself: general, PR-keyed only, names the right PR."""
    print("\nescalation_autoclose_instruction()")

    # GENERAL, not shaped around #19. The bug this fixes was found on #19, and
    # the fix must hold for any escalation PR number.
    for number in (19, 1, 7, 12, 2456):
        text = api.escalation_autoclose_instruction(number)
        check("PR #%d gets a closing keyword" % number,
              text is not None and ("Closes #%d" % number) in text,
              "got: %r" % (text,))

    # It must name THAT PR and no other. A fix closing the wrong pull request is
    # the failure mode that would be worst here, so this is asserted directly
    # rather than inferred from the presence of the right one.
    text = api.escalation_autoclose_instruction(19)
    for other in (18, 20, 191, 9):
        check("PR #19's instruction does not reference #%d" % other,
              ("#%d" % other) not in text,
              "instruction leaked another PR number: %r" % text)

    # The request-card branch is deliberately untouched: no PR exists yet, so
    # there is nothing to close and no number that could be honestly emitted.
    for req in ("req-1790141-a3f2", "req-0000000-0000"):
        check("request card %s gets no closing keyword" % req,
              api.escalation_autoclose_instruction(req) is None,
              "got: %r" % (api.escalation_autoclose_instruction(req),))


def test_brief_wiring(api):
    """The seam: decide() must actually put the keyword in the brief it sends.

    The unit test above can pass while nothing calls it, which would leave the
    manual close exactly where it was. This drives decide() end to end and reads
    the brief that reaches `main`.
    """
    print("\ndecide() -> the brief main receives")

    tmp = tempfile.mkdtemp(prefix="autoclose-test-")
    decision_path = os.path.join(tmp, "decisions.jsonl")
    queue_path = os.path.join(tmp, "task-queue.jsonl")

    card = {
        "pr": 19,
        "title": "live site shows `great` for wind above this beach's ceilings",
        "options": [
            {"id": "A", "name": "gate the verdict", "changes": "c", "userSees": "u",
             "tradeoff": "t"},
            {"id": "B", "name": "say it out loud", "changes": "c", "userSees": "u",
             "tradeoff": "t", "why": "smaller blast radius"},
        ],
    }
    with open(decision_path, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(card) + "\n")

    # Point the module at scratch paths and stop it reaching GitHub. _pr_now is
    # the only network call on this path; its result is informational here
    # (chosenSha), so a stub is faithful.
    api.PROJECTS["covecheck"] = dict(api.PROJECTS["covecheck"],
                                     decision=decision_path, queue=queue_path)
    api._pr_now = lambda cfg, number: ({"headRefOid": "d" * 40}, None)

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
        fh.write(json.dumps(dict(card, pr=None, requestId=req)) + "\n")
    code, body = api.decide("covecheck", req, "B", source="auto")
    check("decide() succeeded for a request card", code == 200 and body.get("ok"),
          "code=%s body=%s" % (code, body))
    rbrief = json.loads(open(queue_path, encoding="utf-8").read().strip().splitlines()[-1])["text"]
    check("a request card's brief carries no closing keyword",
          "Closes #" not in rbrief, "brief was:\n%s" % rbrief)
    check("a request card is still told to report its PR number back",
          "report its number back" in rbrief, "brief was:\n%s" % rbrief)


def main():
    target = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_TARGET
    print("testing: %s" % target)
    api = load(target)

    if not hasattr(api, "escalation_autoclose_instruction"):
        sys.exit("FATAL: %s has no escalation_autoclose_instruction() -- the "
                 "change under test is not applied there." % target)

    test_instruction_unit(api)
    test_brief_wiring(api)

    print("\n%d passed, %d failed" % (_passes, len(_failures)))
    if _failures:
        sys.exit(1)


if __name__ == "__main__":
    main()
