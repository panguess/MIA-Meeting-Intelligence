# Backend security implementation gates

- Enforce MFA at the identity layer before production.
- Use TLS end-to-end; reject insecure transport.
- Keep storage private; no public buckets or permanent public URLs.
- Use short-lived, meeting-scoped upload credentials.
- Validate content type by inspecting file bytes, not filename alone.
- Do not log transcript text, audio bytes, prompts, API keys, or signed URLs.
- Deny outbound AI-provider traffic by default at network level.
- Store secrets in a managed secret store, never in source control or mobile app.
- Add rate limits, request size limits, authorization checks, and audit events.
- Threat-model and test every export, delete, and recovery path.
