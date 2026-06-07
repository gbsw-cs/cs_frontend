# Frontend Rules

- Use TypeScript strictness; avoid `any`, non-null assertions, and unsafe casts.
- Prefer semantic HTML and native controls before custom ARIA behavior.
- Ensure keyboard access, visible focus, labels, and meaningful error messages.
- Keep server state in the existing query/data layer; do not duplicate it in local state.
- Keep effects for external synchronization, not derived values or event handling.
- Treat loading, empty, error, and success states as part of the component contract.
- Avoid hydration-dependent output from time, randomness, or browser globals.
- Keep secrets and privileged API calls out of browser bundles.
- Use responsive layouts without fixed assumptions about text length or viewport size.
- Test behavior through user-visible roles and outcomes rather than implementation details.
- Measure before adding memoization, virtualization, or bundle complexity.
