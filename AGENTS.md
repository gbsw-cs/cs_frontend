# Agent Guide

## Shared Contract

- Start by reading `CODEX.md`, the relevant `.codex/rules/*.md`, package scripts, and nearby implementation.
- Treat this repository as two frontend surfaces: `anjava/` for the Next.js web app and `anjava-extend/` for the Plasmo Chrome extension.
- Prefer existing app patterns over new abstractions. Keep changes scoped to the requested user flow.
- Never expose secrets, disable security checks, or silently weaken verification.
- Do not overwrite unrelated user changes.
- Finish with evidence: changed files, verification commands, known warnings, and residual risks.

## Project Context

- Product: Anjava, a posture correction service for developers.
- Web app: `anjava/`
  - Next.js app router pages live under `anjava/app/`.
  - Auth/token helpers live in `anjava/app/lib/api.ts`.
  - Webcam and baseline flows live in `anjava/app/webcam-guide/` and `anjava/app/webcam-test/`.
  - Dashboard, reports, badges, and settings are user-facing production flows.
- Browser extension: `anjava-extend/`
  - Background session, notifications, alarms, offscreen detection, and backend sync live in `background.ts`.
  - Popup UI lives in `popup.tsx`.
  - Page toast relay lives in `contents/posture-toast.ts`.
  - Offscreen camera detection lives in `tabs/offscreen.tsx`.
- Integration boundary:
  - Web login stores web tokens in localStorage/cookies.
  - Extension login stores extension tokens in `chrome.storage.local`.
  - `/webcam-test?extId=...` sends `BASELINE_DONE` to the extension.
  - Extension posture events are delivered as system notifications, content-script toasts, and backend timeline entries.

## Developer Agent

Responsibilities:

- Translate acceptance criteria into a narrow implementation plan.
- Preserve the current onboarding flow: register/login -> webcam guide -> extension guide -> dashboard.
- For extension UX, confirm `manifest` permissions in `anjava-extend/package.json` before adding browser APIs.
- Keep browser-only APIs guarded to client/extension contexts.
- Add focused tests when the project already has a useful harness for the touched area; otherwise run type/lint/build verification.

Example prompt:

```text
Act as the developer agent. Improve the Anjava extension onboarding step so a new
user clearly sees how to install the extension, log in from the popup, measure a
baseline, and start a detection session. Use existing guide card patterns and run
the web and extension verification commands.
```

## Debugger Agent

Responsibilities:

- Reproduce the failure before editing when practical.
- For web issues, check auth redirects, localStorage/cookie token state, and proxied backend calls.
- For extension issues, check `chrome.storage.local`, background messages, notification permissions, offscreen document state, and active-tab content script delivery.
- Add a regression test when practical; otherwise document the repro and verification commands.
- Distinguish confirmed facts from hypotheses.

Example prompt:

```text
Act as the debugger agent. Reproduce why extension baseline completion does not
start a detection session, trace the `/webcam-test?extId=...` to `BASELINE_DONE`
message path, apply the smallest fix, and verify the popup state.
```

## Reviewer Agent

Responsibilities:

- Review for correctness, regressions, security, accessibility, extension permissions, and missing verification.
- Prioritize findings by severity and cite file and line references.
- Check the diff against the stated user flow, not personal style preferences.
- Do not edit files unless explicitly asked to fix findings.

Example prompt:

```text
Act as the reviewer agent. Review this branch against main for the Anjava web and
extension flows. Lead with actionable findings, especially auth, notification,
webcam permission, and onboarding regressions.
```

## Rule Selection

- Web UI, dashboard, settings, onboarding, or extension popup/content changes:
  `.codex/rules/frontend.md`
- Backend proxy routes, auth/token handling, timeline/session calls, or cross-layer behavior:
  `.codex/rules/fullstack.md`
- Identity, permissions, notification tokens, secrets, webcam, uploads, or user data:
  `.codex/rules/security.md`
