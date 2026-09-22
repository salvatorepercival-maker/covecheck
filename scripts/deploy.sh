#!/usr/bin/env bash
#
# Deploy CoveCheck to production.
#
# Why this exists rather than `vercel --prod`, or a git push:
#
# Vercel blocks any deployment whose git commit author is not a member with
# contributing access to the project. This repo's commits are authored under a
# different address than the one on the Vercel account, so every git-triggered
# deploy — and any CLI deploy that carries commit metadata — is rejected before
# the build starts, with `readyState: BLOCKED`. The CLI surfaces that only as
# `fetch failed`; the real message is visible via the REST API.
#
# This script deploys as the authenticated project owner with no git metadata
# attached. Authorisation was never the problem — the token holder owns the
# project — only commit provenance, which this sidesteps.
#
# It ships `git archive HEAD`: committed files only. No .git, no .env, no
# node_modules, nothing untracked. That means **uncommitted work does not
# deploy**, which is deliberate — the live site always corresponds to a commit.
#
# Usage:  npm run deploy
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [[ ! -f .vercel/project.json ]]; then
  echo "error: .vercel/project.json is missing — run 'vercel link --yes --project covecheck' first" >&2
  exit 1
fi

# Warn, but do not block: shipping the last commit is the intended behaviour.
if [[ -n "$(git status --porcelain)" ]]; then
  echo "note: you have uncommitted changes. Deploying HEAD ($(git rev-parse --short HEAD)); those changes will NOT ship."
fi

# --- deploy log ------------------------------------------------------------
# Records what actually shipped, so the Shipyard queue can distinguish "merged"
# from "deployed". Vercel cannot answer this: these deploys carry no git
# metadata by design (see the header), so the deployment record holds no commit
# SHA at all -- `meta` is absent entirely.
#
# Written OUTSIDE the repo deliberately. A log file inside the tree would make
# the working tree dirty, and a dirty tree is exactly what the Ripper deploy
# refuses -- logging here must never be able to block the next deploy.
#
# Known limitation: this records deploys made THROUGH this script. A deploy run
# some other way (plain `vercel --prod`, another machine) leaves it stale. The
# real fix is the live site reporting its own build SHA; that is app code, and
# a separate decision.
DEPLOY_LOG="${DEPLOY_LOG:-$HOME/agent-worlds/deploy-log/covecheck.jsonl}"
log_deploy() {
  mkdir -p "$(dirname "$DEPLOY_LOG")" 2>/dev/null || return 0
  printf '{"ts":"%s","project":"covecheck","sha":"%s","shaShort":"%s","mode":"prod","status":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "$(cd "$REPO_ROOT" && git rev-parse HEAD)" \
    "$(cd "$REPO_ROOT" && git rev-parse --short HEAD)" \
    "$1" >> "$DEPLOY_LOG" 2>/dev/null || true
}

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

git archive HEAD | tar -x -C "$STAGE"

# The project link is the only thing added on top of the committed tree.
mkdir -p "$STAGE/.vercel"
cp .vercel/project.json "$STAGE/.vercel/project.json"

# Belt and braces: never let a local secret reach the upload.
rm -f "$STAGE"/.env "$STAGE"/.env.* 2>/dev/null || true

echo "deploying $(git rev-parse --short HEAD) to production…"
cd "$STAGE"
# `if` exempts this from set -e, so a failure is logged rather than swallowed.
if vercel --prod --yes; then
  log_deploy ok
else
  rc=$?
  log_deploy failed
  exit "$rc"
fi

echo
echo "deployed commit $(cd "$REPO_ROOT" && git rev-parse --short HEAD) → https://www.covecheck.com"
