# MIA — Meeting Intelligence Assistant

MIA is a personal-first, enterprise-ready meeting intelligence assistant.

## Product baseline
- iPhone is the only audio capture and audio-file import entry point.
- Supports physical meetings and online meetings through acoustic capture (e.g. iPhone near laptop speakers during Teams meetings).
- No meeting bots, Teams API audio ingestion, browser extensions, or desktop audio capture.
- Thai and English, including code-switching.
- Outputs: full transcript, detailed meeting minutes, executive summary, action tracker, and risk & issue log.
- Human approval is required before finalizing reports.
- Audio retention target: 90 days.

## Repository status
This repository contains an initial development scaffold. It is **not production-ready**, has not been security-certified, and has not been compiled or validated on a physical iPhone.

## Structure
- `ios/MIA`: Swift/AVFoundation recording and import policy scaffold.
- `backend`: minimal FastAPI service skeleton and security notes.
- `database`: initial PostgreSQL schema draft.
- `contracts`: API outline.
- `security`: threat-model checklist.
- `docs`: architecture decision log.

## Security
Do not commit meeting audio, transcripts, credentials, API keys, personal data, or production secrets. Keep the repository private. Treat all sample code and schemas as drafts pending review.
