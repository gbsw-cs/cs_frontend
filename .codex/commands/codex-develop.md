# Develop Workflow

Use for a feature that requires discovery, implementation, and verification.

1. Read `AGENTS.md`, relevant rules, package scripts, and nearby code.
2. Restate acceptance criteria and identify affected UI, API, and data boundaries.
3. Make a short plan with explicit verification steps.
4. Implement in small, coherent changes using existing patterns.
5. Add tests for success, failure, and important edge cases.
6. Run lint, tests, type checking when available, and build.
7. Summarize changes, evidence, assumptions, and remaining risks.

Sample prompt:

```text
Follow the develop workflow for [FEATURE]. First inspect the existing patterns,
then implement the acceptance criteria in [AREA]. Include accessible states and
focused tests. Run the repository's lint, test, and build commands before finishing.
```
