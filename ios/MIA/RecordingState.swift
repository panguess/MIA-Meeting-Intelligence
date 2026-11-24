import Foundation

enum RecordingState: String, Codable {
    case idle
    case requestingPermission
    case recording
    case interrupted
    case finalizing
    case saved
    case failed
}

struct RecordingManifest: Codable, Identifiable {
    let id: UUID
    let createdAt: Date
    var startedAt: Date?
    var endedAt: Date?
    var state: RecordingState
    var segmentNames: [String]
    var interruptionEvents: [String]
    var sha256: String?

    init() {
        id = UUID()
        createdAt = Date()
        state = .idle
        segmentNames = []
        interruptionEvents = []
    }
}
