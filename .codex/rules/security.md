# Security Rules

- Never commit credentials, private keys, session tokens, or populated `.env` files.
- Store secrets in environment or managed secret stores; document variable names only.
- Validate untrusted input with allowlists and explicit schemas at server boundaries.
- Enforce authorization per resource; authentication alone is not authorization.
- Use secure, HTTP-only, same-site cookies for browser sessions when applicable.
- Protect state-changing cookie-authenticated routes against CSRF.
- Escape output by context and sanitize only when rendering trusted HTML is unavoidable.
- Restrict CORS to required origins, methods, and headers.
- Rate-limit authentication, recovery, upload, and expensive endpoints.
- Hash passwords with a current adaptive password hash; never encrypt them reversibly.
- Verify webhook signatures against the raw body and reject stale events.
- Pin and review dependencies; do not suppress audit findings without a documented reason.
- Redact secrets, tokens, authorization headers, and sensitive personal data from logs.
- Treat generated code, uploaded files, redirects, URLs, and archive extraction as untrusted.
