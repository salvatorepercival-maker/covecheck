<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

Read AGENTS-CHARTER.md before acting.

## Deploys

Merging to `main` deploys production through the Vercel Git integration. Do not
also run `npm run deploy` (`scripts/deploy.sh`) after a merge: that creates a
second, duplicate production deployment. The script dates from when Git deploys
were blocked by a commit-author mismatch, which no longer happens. Run it only
when Sal asks for a manual deploy.
