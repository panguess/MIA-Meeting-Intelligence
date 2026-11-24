# MIA Starter Kit v0.1

Status: engineering scaffold only — not a deployable or security-certified product.

## Product constraints
- iPhone is the only audio entry point.
- Live recording uses the iPhone microphone.
- Teams/Zoom/Meet bots and direct meeting-platform audio capture are out of scope.
- External recordings are imported by the user through the iPhone app.
- Default AI mode is local-first. Cloud AI remains disabled until separately approved.
- Audio retention target is 90 days.
- Human approval is required before minutes become final.

## Repository layout
- `ios/MIA/` — SwiftUI/AVFoundation recording prototype source.
- `backend/` — FastAPI service skeleton.
- `database/` — initial PostgreSQL schema draft.
- `contracts/` — API outline.
- `security/` — security baseline and threat-model checklist.

## Important
Do not use confidential or production meeting recordings with this scaffold. It has not been penetration-tested, compiled as a complete iOS app, or deployed. Secrets are intentionally absent.
