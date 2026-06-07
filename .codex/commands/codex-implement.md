# Anjava Implement Workflow

Use when requirements and the intended design are already clear.

1. Confirm the requested behavior and files likely to change.
2. Check existing interfaces, types, tests, and conventions.
3. For extension changes, check `background.ts`, `popup.tsx`, content scripts, and manifest permissions before editing.
4. For web changes, check the relevant app route, shared `lib/api.ts`, and existing card/form styles.
5. Implement the smallest complete change.
6. Avoid unrelated cleanup and new dependencies.
7. Add or update focused tests when practical.
8. Run targeted checks first, then lint/type/build for the affected subproject.

Sample prompt:

```text
Follow the Anjava implement workflow. Add a popup setting for notification
behavior in `anjava-extend/popup.tsx` using existing setting-row patterns.
Preserve auth, session, notification, and baseline contracts, then run relevant
lint, type, and build checks.
```
