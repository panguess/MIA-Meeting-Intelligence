# Architecture Decisions — MIA

## Current baseline (provisional)
- Product direction: Personal-first, Enterprise-ready.
- Audio input: iPhone app only, including imports through the iOS document picker.
- Online meetings: acoustic capture from laptop speakers; no Teams/Zoom/Meet bot or API audio integration.
- Recording: explicit Start/Stop, full-session capture by default; interruptions and gaps must be surfaced.
- AI processing: Local-first Hybrid is the provisional baseline. Cloud AI remains off by default and requires explicit per-meeting approval plus security review.
- Human review: required before final report approval.
- Audio retention: 90 days, including managed copies, temporary files, and backups subject to documented backup expiry.
- Transcript/minutes retention: policy to be decided separately.

## Open decisions
- Select and benchmark local/cloud speech-to-text, diarization, and LLM options.
- Confirm provider licensing, telemetry, provenance, privacy, and data-retention terms.
- Validate iOS background recording, interruption recovery, storage exhaustion, and file integrity on target devices.
- Define final retention/deletion policy for transcripts and derived outputs.
- Complete threat modelling and security review before real meeting data is processed.

## Non-goals for V1
- Meeting bots.
- Teams API audio retrieval.
- Browser extension or desktop audio capture.
- Public audio or transcript storage.
