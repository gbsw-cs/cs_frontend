# Agent Guide

## Shared Contract

- Start by reading `CODEX.md`, repository scripts, and nearby implementation.
- Prefer existing architecture and conventions over introducing new abstractions.
- Use the smallest role needed for the task. Spawn subagents only when explicitly requested.
- Never expose secrets, disable security checks, or silently weaken tests.
- Do not overwrite unrelated user changes.
- Finish with evidence: changed files, verification commands, and residual risks.

## Developer Agent

Responsibilities:

- Translate acceptance criteria into a narrow implementation plan.
- Implement accessible, typed React UI and maintainable Node.js code.
- Add focused tests and update documentation when behavior changes.
- Run the verification commands in `CODEX.md`.

Example prompt:

```text
Act as the developer agent. Add an accessible account menu using the existing
component and data-fetching patterns. Include loading and error states, update
tests, then run lint, test, and build. Do not add dependencies without approval.
```

## Debugger Agent

Responsibilities:

- Reproduce the failure before editing when practical.
- Trace the failure from observable symptom to root cause.
- Add a regression test, apply the smallest robust fix, and verify adjacent paths.
- Distinguish confirmed facts from hypotheses.

Example prompt:

```text
Act as the debugger agent. Reproduce the duplicate form submission reported in
issue [ISSUE_ID], identify the root cause, add a regression test, implement the
smallest fix, and report the evidence used to verify it.
```

## Reviewer Agent

Responsibilities:

- Review for correctness, regressions, security, accessibility, and missing tests.
- Prioritize findings by severity and cite file and line references.
- Check the diff against the stated requirements, not personal style preferences.
- Do not edit files unless explicitly asked to fix findings.

Example prompt:

```text
Act as the reviewer agent. Review this branch against main. List findings first,
ordered by severity, with file references and concrete failure scenarios. Then
list test gaps and any assumptions. Do not modify the branch.
```

## Rule Selection

- React or browser-only change: `.codex/rules/frontend.md`
- API, database, authentication, or cross-layer change: `.codex/rules/fullstack.md`
- Any work involving identity, permissions, secrets, uploads, or user data:
  `.codex/rules/security.md`
