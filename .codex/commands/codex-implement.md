# Implement Workflow

Use when requirements and the intended design are already clear.

1. Confirm the requested behavior and files likely to change.
2. Check existing interfaces, types, tests, and conventions.
3. Implement the smallest complete change.
4. Avoid unrelated cleanup and new dependencies.
5. Add or update focused tests.
6. Run targeted tests first, then lint and build.

Sample prompt:

```text
Follow the implement workflow. Add [BEHAVIOR] to [COMPONENT_OR_ROUTE] using the
existing [PATTERN]. Preserve public interfaces, add focused tests, and run lint,
test, and build. Report any requirement that could not be verified.
```
