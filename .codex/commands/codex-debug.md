# Anjava Debug Workflow

1. Capture the exact symptom, environment, and reproduction steps.
2. Reproduce the issue or explain why reproduction is unavailable.
3. Identify whether the failure is web-only, extension-only, or web-extension integration.
4. Inspect logs, `chrome.storage.local`, localStorage/cookies, message types, network boundaries, and recent changes.
5. Form testable hypotheses and eliminate them with evidence.
6. Add a failing regression test when practical.
7. Apply the smallest root-cause fix, not a symptom mask.
8. Run the regression test and the broader verification suite.

Sample prompt:

```text
Follow the Anjava debug workflow for baseline completion not starting extension
detection. Reproduce it from `/webcam-test?extId=...`, trace the web, extension,
storage, and backend-sync boundaries, distinguish evidence from hypotheses, make
the smallest robust fix, then run targeted checks, lint, type, and build.
```
