# Debug Workflow

1. Capture the exact symptom, environment, and reproduction steps.
2. Reproduce the issue or explain why reproduction is unavailable.
3. Inspect logs, state transitions, network boundaries, and recent changes.
4. Form testable hypotheses and eliminate them with evidence.
5. Add a failing regression test when practical.
6. Apply the smallest root-cause fix, not a symptom mask.
7. Run the regression test and the broader verification suite.

Sample prompt:

```text
Follow the debug workflow for [BUG]. Reproduce it from [STEPS], trace the root
cause, and distinguish evidence from hypotheses. Add a regression test, make the
smallest robust fix, then run targeted tests, lint, and build.
```
