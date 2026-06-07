# Anjava Review Workflow

1. Read the requirements and compare the branch with its base branch.
2. Inspect changed behavior, not only changed lines.
3. Check correctness, regressions, error handling, security, accessibility, extension permissions, and tests.
4. Pay special attention to auth redirects, token storage, webcam permissions, notification delivery, baseline measurement, and timeline/session sync.
5. Validate suspicious paths with targeted commands when possible.
6. Report findings first, ordered by severity, with file and line references.
7. Separate confirmed findings, open questions, and residual test gaps.

Sample prompt:

```text
Follow the Anjava review workflow for this branch versus `main`. Do not edit
files. Lead with actionable findings ordered by severity, especially around auth,
extension permissions, webcam, baseline, notifications, and dashboard data.
```
