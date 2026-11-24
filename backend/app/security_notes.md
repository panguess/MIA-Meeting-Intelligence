# Backend Security Notes

This is a scaffold, not a production security implementation.

- Use private networking and deny-by-default outbound egress.
- Enforce TLS in transit and encryption at rest.
- Apply MFA, least privilege, and managed secrets.
- Do not place audio, transcripts, tokens, or personal data in logs, analytics, or crash reports.
- Use private object storage; never public buckets or public object URLs.
- Keep Cloud AI disabled by default; require explicit meeting-level approval and vendor security review.
- Define deletion across primary storage, replicas, caches, temporary files, and backups. Document backup expiry.
- Add authentication, authorization, audit trails, rate limits, upload validation, malware scanning, and key rotation before production.
