# Anjava Codex Harness

## Project

This repository contains the frontend code for Anjava, a posture correction
service for developers.

- `anjava/`: Next.js web application
- `anjava-extend/`: Plasmo Chrome extension

The repository root does not define application scripts. Inspect the relevant
subproject before editing and run commands from that subproject directory.

## Core User Flow

1. User lands on `/`.
2. User signs up or logs in from `/register` or `/login`.
3. Successful first-time auth sends the user to `/webcam-guide`.
4. Webcam guide explains camera positioning and baseline setup.
5. Extension guide explains Chrome Web Store install, notification permissions,
   extension popup login, 10-second baseline measurement, and session start.
6. Dashboard shows posture score, warnings, recent activity, badges, weekly
   trends, camera preview, and settings entry.

## Extension Flow

1. User opens the Anjava extension popup.
2. User logs in with the same Anjava account.
3. If baseline data is missing, the popup opens `/webcam-test?extId=<extensionId>`.
4. The web page collects 10 seconds of posture frames and sends `BASELINE_DONE`
   back to the extension.
5. The extension stores baseline data, starts a session, and runs offscreen
   posture detection.
6. Alerts are delivered through Chrome notifications, active-page toast relay,
   and backend timeline sync.

## Extension Configuration Notes

- Set `NEXT_PUBLIC_EXTENSION_ID` in the web app environment when the extension
  guide should detect whether Anjava extend is installed.
- The extension responds to external `PING` messages from configured
  `externally_connectable` origins.
- The extension currently requests broad `http://*/*` and `https://*/*` host
  permissions because posture toasts can be delivered to the active HTTP(S) tab.
  Do not broaden this further. If the UX no longer needs page toasts everywhere,
  prefer active-tab injection or a user-managed allowlist.
- Detailed browser/extension debug logs should be gated behind
  `NEXT_PUBLIC_DEBUG=1` or `PLASMO_PUBLIC_DEBUG=1`.

## Expected Stack

- TypeScript and React
- Next.js app router in `anjava/`
- Plasmo MV3 extension in `anjava-extend/`
- npm for `anjava/`
- pnpm for `anjava-extend/`
- MediaPipe pose detection assets in both web and extension flows

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
./node_modules/.bin/tsc --noEmit
pnpm run build
```

Run `test`, `typecheck`, or other verification scripts when they are added to
the relevant `package.json`.

## Known Verification Notes

- `anjava` currently has lint warnings in existing files; warnings are not the
  same as failing lint, but report them when they appear.
- `anjava-extend` uses pnpm 11 build-script approvals through
  `anjava-extend/pnpm-workspace.yaml`.
- `anjava-extend` build copies `assets/mediapipe-wasm` with
  `scripts/copy-mediapipe-wasm.mjs` so it works outside Windows.

## Working Rules

1. Read `AGENTS.md` and the relevant `.codex/rules/*.md` before editing.
2. Inspect existing code and tests before choosing an implementation pattern.
3. Keep changes scoped to the requested behavior; avoid unrelated refactors.
4. Do not add production dependencies without explaining the need and impact.
5. Preserve auth, onboarding, baseline, notification, and dashboard behavior unless the task explicitly changes it.
6. Validate untrusted input at server/proxy boundaries and keep secrets out of browser bundles.
7. Add or update tests for changed behavior when a useful test harness exists.
8. Run the relevant lint, type, and build scripts before declaring work complete.
9. Report commands run, failures, assumptions, and remaining risks.

## Definition Of Done

- Acceptance criteria are implemented.
- Error, loading, and empty states are handled where applicable.
- Types do not use unexplained `any` or unsafe casts.
- Extension permission changes are reflected in `anjava-extend/package.json`.
- Relevant lint, type, and build commands pass or failures are clearly explained.
- No credentials, generated artifacts, local caches, or populated environment files are committed.
