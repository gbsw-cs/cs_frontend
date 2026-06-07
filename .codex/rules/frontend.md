# Frontend Rules

- In `anjava/`, follow Next.js app router conventions and keep browser-only code inside client components.
- In `anjava-extend/`, follow Plasmo conventions and keep Chrome APIs inside extension contexts.
- Use TypeScript strictness; avoid `any`, non-null assertions, and unsafe casts.
- Prefer semantic HTML and native controls before custom ARIA behavior.
- Ensure keyboard access, visible focus, labels, and meaningful error messages.
- Keep server state in the existing query/data layer; do not duplicate it in local state.
- Keep effects for external synchronization, not derived values or event handling.
- Treat loading, empty, error, and success states as part of the component contract.
- Avoid hydration-dependent output from time, randomness, or browser globals.
- Keep secrets and privileged API calls out of browser bundles.
- Preserve the onboarding path from auth to webcam guide, extension guide, and dashboard unless explicitly changing it.
- For extension notifications, handle allow, deny, closed, timeout, and disabled-settings states explicitly.
- For webcam and baseline UI, surface camera permission, device-not-found, low-quality, loading, and retry states.
- Use responsive layouts without fixed assumptions about text length or viewport size.
- Test behavior through user-visible roles and outcomes rather than implementation details.
- Measure before adding memoization, virtualization, or bundle complexity.
