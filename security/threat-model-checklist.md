# MIA threat-model checklist

## Assets
- Original audio and imported recordings
- Transcript and speaker-turn metadata
- Minutes, decisions, action items, risk/issue logs
- Encryption keys, authentication tokens, signed upload URLs
- Audit and retention metadata

## Threats to assess
- Lost or compromised iPhone
- Malicious or compromised app/library dependency
- Unauthorized backend/API access
- Public or misconfigured object storage
- Credential theft and session hijacking
- Developer/support access to production content
- Accidental external AI/API egress
- Logs, crash reports, analytics, and backups leaking content
- Retention job failure or incomplete deletion
- Audio interruption or partial upload being mistaken for complete capture

## Mandatory mitigations before production
- iPhone passcode and OS security assumptions documented
- Keychain-protected keys and encrypted local files
- MFA and least privilege
- Private network/storage and object-level authorization
- Egress deny-by-default
- No sensitive payloads in logs or telemetry
- Verifiable deletion lifecycle including backups
- Audit trail for access, export, provider consent, approval, and deletion
- Incident response and recovery tests
- No real confidential meetings until all gates pass
