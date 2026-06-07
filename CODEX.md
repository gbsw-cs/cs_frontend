# Codex Harness

## Project

This repository contains the Anjava frontend surfaces:

- `anjava/`: Next.js web application
- `anjava-extend/`: Plasmo browser extension

The repository root does not define the application scripts. Inspect the relevant
subproject before editing and run commands from that subproject directory.

## Expected Stack

- TypeScript and React
- Next.js in `anjava/`
- Plasmo browser extension in `anjava-extend/`
- npm for `anjava/`
- pnpm for `anjava-extend/`

## Commands

Install dependencies:

```bash
cd anjava && npm install
cd ../anjava-extend && pnpm install --frozen-lockfile
```

Web app checks:

```bash
cd anjava
npm run lint
npm run build
```

Extension checks:

```bash
cd anjava-extend
pnpm run build
```

Run `test`, `typecheck`, or other verification scripts when they are added to
the relevant `package.json`.

## Working Rules

1. Read `AGENTS.md` and the relevant `.codex/rules/*.md` before editing.
2. Inspect existing code and tests before choosing an implementation pattern.
3. Keep changes scoped to the requested behavior; avoid unrelated refactors.
4. Do not add production dependencies without explaining the need and impact.
5. Preserve API compatibility unless the task explicitly permits a breaking change.
6. Validate untrusted input at server boundaries and keep secrets server-side.
7. Add or update tests for changed behavior and meaningful edge cases.
8. Run the relevant lint, test, and build scripts before declaring work complete.
9. Report commands run, failures, assumptions, and remaining risks.

## Definition Of Done

- Acceptance criteria are implemented.
- Error, loading, and empty states are handled where applicable.
- Types do not use unexplained `any` or unsafe casts.
- Tests cover changed behavior when practical for the touched area.
- Relevant lint and build commands pass.
- No credentials, generated artifacts, or local environment files are committed.
