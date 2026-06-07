# Anjava Performance Workflow

1. Define the user-visible metric and target before optimizing.
2. Measure a baseline using representative dashboard, webcam, or extension-session data.
3. Identify the bottleneck with profiling, traces, bundle analysis, MediaPipe timing, or network timing.
4. Change one meaningful factor at a time.
5. Preserve posture detection correctness, accessibility, notification delivery, and cache invalidation behavior.
6. Re-measure with the same method and document the result.

Sample prompt:

```text
Follow the Anjava performance workflow for dashboard polling and realtime slot
updates. Measure render and network timing first, identify whether the bottleneck
is dashboard rendering, MediaPipe detection, extension messaging, or network sync,
implement a scoped optimization, and compare before and after results.
```
