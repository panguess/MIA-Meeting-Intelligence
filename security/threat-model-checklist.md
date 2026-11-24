# MIA Threat Model Checklist

## Data protection
- [ ] Private repository and restricted collaborators.
- [ ] No secrets, meeting recordings, or transcripts committed to source control.
- [ ] TLS in transit and encryption at rest.
- [ ] Private object storage; public access disabled.
- [ ] Managed secrets; no credentials in source code.

## Access control
- [ ] MFA enabled for maintainers.
- [ ] Least-privilege roles.
- [ ] Workspace and user authorization tested.
- [ ] Administrative access audited.

## Audio lifecycle
- [ ] Recording interruptions and gaps surfaced to user.
- [ ] File integrity checksum verified after recording/import.
- [ ] 90-day audio retention enforced across copies and temporary storage.
- [ ] Backup expiry and deletion semantics documented.
- [ ] Transcript and derived-output retention policy defined.

## AI processing
- [ ] Local model license and provenance reviewed.
- [ ] Telemetry and outbound network traffic assessed.
- [ ] Cloud AI disabled by default.
- [ ] Per-meeting user approval captured before any external transfer.
- [ ] Provider DPA, retention, training, residency, subprocessors, and deletion reviewed.

## Operational readiness
- [ ] Storage exhaustion and app termination tested.
- [ ] iOS calls, Siri, route changes, and app lifecycle interruptions tested.
- [ ] Restore and incident response procedures documented.
- [ ] Human approval required for final minutes and action items.
