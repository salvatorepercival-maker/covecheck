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

Name them `YYYY-MM-DD-<subject>.patch`, and let **one** patch carry every file a
change touches. Splitting one change across two patch files invites applying one
and not the other, which can leave `~/agent-worlds/` in a state neither version
was tested in — a script calling a function the module has not got yet, for
instance.

Each applies with:

```bash
patch -p1 -d ~/agent-worlds --dry-run < ~/covecheck/proposals/<name>.patch  # verify
patch -p1 -d ~/agent-worlds          < ~/covecheck/proposals/<name>.patch  # apply
```

`-d ~/agent-worlds` is not optional and is not decoration: the paths in these
patches are relative to that directory, so running the command from anywhere
else either fails or patches the wrong tree.

**Applying is not deploying.** `town-server.py` imports `deploy_api` once, at
start, and holds it in memory. A correctly applied patch changes nothing a user
or an agent can reach until that process is restarted:

```bash
pkill -f 'town-server.py'
cd ~/agent-worlds && nohup python3 town-server.py 8777 \
    >> ~/Library/Logs/covecheck-town-server.log 2>&1 &
```

It is started by hand, not by launchd — there is no `launchctl kickstart` for
it, and nothing restarts it for you. Confirm it came back before walking away:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8777/    # expect 200
```

A patch that has been applied is kept, not deleted: it is the record of what the
out-of-repo file was changed to and which pull request reviewed it.
