# Anjava Develop Workflow

Use for a feature that requires discovery, implementation, and verification.

1. Read `AGENTS.md`, relevant rules, package scripts, and nearby code.
2. Identify whether the change is in `anjava/`, `anjava-extend/`, or the web-extension integration boundary.
3. Restate acceptance criteria and affected auth, onboarding, webcam, notification, session, or dashboard behavior.
4. Make a short plan with explicit verification steps for the affected subproject.
5. Implement in small, coherent changes using existing UI and message-passing patterns.
6. Add tests for success, failure, and important edge cases when a useful harness exists.
7. Run lint, tests, type checking when available, and build.
8. Summarize changes, evidence, assumptions, and remaining risks.

Sample prompt:

```text
Follow the Anjava develop workflow for improving extension onboarding. Inspect
`anjava/app/extension-guide/page.tsx` and the extension popup first, preserve
auth/session/baseline behavior, and run the relevant lint, type, and build
commands before finishing.
```
