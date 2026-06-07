# Review Workflow

1. Read the requirements and compare the branch with its base branch.
2. Inspect changed behavior, not only changed lines.
3. Check correctness, regressions, error handling, security, accessibility, and tests.
4. Validate suspicious paths with targeted commands when possible.
5. Report findings first, ordered by severity, with file and line references.
6. Separate confirmed findings, open questions, and residual test gaps.

Sample prompt:

```text
Follow the review workflow for this branch versus [BASE_BRANCH]. Do not edit files.
Lead with actionable findings ordered by severity. Include concrete failure cases,
file references, missing tests, and any assumptions used during the review.
```
