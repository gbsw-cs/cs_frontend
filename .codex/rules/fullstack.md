# Fullstack Rules

- Treat `anjava/app/api/backend/[...path]/route.ts` and auth proxy routes as server boundaries.
- Keep validation and authorization on the server even when the client validates too.
- Define typed request and response contracts; version intentional breaking changes.
- Return stable error shapes without stack traces, SQL details, or secrets.
- Use parameterized queries and the project's migration system for schema changes.
- Make migrations backward compatible during rolling deployments when applicable.
- Bound pagination, upload size, query complexity, and request body size.
- Add timeouts and explicit failure handling around external services.
- Make retryable mutations idempotent or protect them with idempotency keys.
- Keep transaction boundaries explicit and test partial-failure behavior.
- Use structured logs with request correlation, while excluding credentials and PII.
- Test contracts at API boundaries and critical flows end to end.
- Preserve backend contracts used by dashboard, settings, sessions, timeline, push-token sync, and baseline calculation.
- Keep extension and web token lifecycles separate unless the task explicitly changes account linking.
