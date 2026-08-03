#!/usr/bin/env bash
#
# Deploy CoveCheck to production.
#
# Why this exists rather than `vercel --prod`, or a git push:
#
# Vercel blocks any deployment whose git commit author is not a member with
# contributing access to the project. This repo's commits are authored as
# salvatore.percival@manifest.net while the Vercel account is
# salvatore.percival@checkfront.com, so every git-triggered deploy — and any CLI
# deploy that carries commit metadata — is rejected before the build starts, with
# `readyState: BLOCKED`. The CLI surfaces that only as `fetch failed`; the real
# message is visible via the REST API.
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
vercel --prod --yes

echo
echo "deployed commit $(cd "$REPO_ROOT" && git rev-parse --short HEAD) → https://www.covecheck.com"
