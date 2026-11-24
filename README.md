# MIA — Meeting Intelligence Assistant

**Private repository.** Product direction: Personal-first, Enterprise-ready.

## Current milestone
- Starter architecture and API/database/security drafts
- Native iOS SwiftUI prototype scaffold in `ios/MIA.xcodeproj`
- Explicit iPhone Start/Stop recording flow
- Audio import initiated from the iPhone app
- Local app Documents storage, iOS file protection, backup exclusion, JSON manifest, SHA-256 checksum
- Audio-session interruption and route-change warnings
- 90-day local cleanup target
- No cloud upload, transcription, diarization, AI provider, or meeting-platform integration

## Product constraints
- iPhone is the only audio capture and file-import entry point.
- Online meetings are captured acoustically through the iPhone microphone (for example, iPhone near laptop speakers during Teams).
- No Teams/Zoom/Meet bots, meeting APIs, browser extensions, or desktop audio capture.
- Thai and English interface labels; full multilingual output pipeline remains future work.
- Human approval is required before generated minutes become final.
- Cloud AI is disabled and not implemented in this milestone.
- Never commit meeting audio, transcripts, credentials, API keys, or production secrets.

## Start here
See [iOS build and test instructions](ios/README.md). Open `ios/MIA.xcodeproj` using Xcode on macOS.

## Repository layout
- `ios/MIAApp/` — SwiftUI app, recorder service, local file store, app configuration
- `ios/MIA.xcodeproj/` — Xcode project and shared scheme
- `backend/` — FastAPI skeleton and security notes
- `database/` — initial PostgreSQL schema draft
- `contracts/` — draft API outline
- `security/` — threat model checklist
- `docs/` — architecture decisions

## Status and limitations
This is an early engineering prototype, not production-ready or security-certified. The project has not yet been compiled with Xcode or validated on a physical iPhone in this environment. Recording interruption recovery, import validation, retention enforcement, secure deletion, and device behavior require further testing and hardening.
