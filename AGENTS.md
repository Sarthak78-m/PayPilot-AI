<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Git & File Management Rules

- **Do NOT commit report or scratch files**: Never commit task progress reports, phase reports, scratch logs, or benchmark/test text dumps (`*-report.txt`, `*report*.txt`, etc.) to the repository.
- **Scratch & temporary artifacts**: Keep all implementation notes and reports in the agent artifact directory or scratch directory, never in tracked repo source code.
- **Stage carefully**: Before committing, always check `git status` and `git diff --staged` to verify only intended application code, config, and assets are staged.

