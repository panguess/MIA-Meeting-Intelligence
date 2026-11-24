# MIA iOS prototype

## Requirements
- macOS with Xcode 15 or later (Xcode 16 recommended)
- iOS 17.0 or later device or simulator
- An Apple Developer account/team for signing to a physical iPhone
- A physical iPhone is required to validate microphone recording and real audio-session interruptions

## Open and run
1. Clone this private repository on the Mac.
2. Open `ios/MIA.xcodeproj` in Xcode.
3. Select the MIA target and set your own Team under Signing & Capabilities.
4. If needed, change the bundle identifier from `com.panguess.mia` to one you control.
5. Select a physical iPhone and Run.
6. Accept microphone permission. Start a short test recording, stop, then confirm that a file appears under the in-app recording list.
7. Test import by choosing a non-sensitive audio file from Files.

## Current prototype scope
- SwiftUI bilingual meeting screen (Thai/English labels)
- Explicit Start and Stop controls
- iOS microphone permission request
- AAC recording through AVAudioRecorder
- iOS audio-session interruption and route-change notifications
- Local app Documents storage and JSON manifest
- SHA-256 checksum after a normally completed recording
- User-initiated audio import through the iOS document picker
- Audio cleanup target of 90 days based on local file modification date

## Important limitations
- This is an initial prototype, not production software.
- This repository has not been built in Xcode or run on an iPhone in this environment.
- Background audio capability is declared, but screen-lock/background behavior must be validated on a physical device.
- iOS interruptions can cause gaps. MIA warns the user and does not silently auto-resume.
- The current 90-day local cleanup is best-effort and runs when the app opens/prepares storage; it is not a server-side retention control.
- Imported file type/content validation is basic and requires hardening.
- No network upload, transcription, diarization, LLM, cloud processing, or backend integration is implemented in this milestone.
- Do not use confidential meeting audio until security review and device testing are complete.
