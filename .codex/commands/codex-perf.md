# Performance Workflow

1. Define the user-visible metric and target before optimizing.
2. Measure a baseline using representative data and production-like settings.
3. Identify the bottleneck with profiling, traces, bundle analysis, or query plans.
4. Change one meaningful factor at a time.
5. Preserve correctness, accessibility, and cache invalidation behavior.
6. Re-measure with the same method and document the result.

Sample prompt:

```text
Follow the performance workflow for [SLOW_PATH]. Measure [METRIC] first, identify
the dominant bottleneck, implement a scoped optimization, and compare before and
after results. Do not trade correctness or accessibility for an unmeasured gain.
```
