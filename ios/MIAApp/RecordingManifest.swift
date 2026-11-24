import Foundation

enum RecordingOrigin: String, Codable, Equatable {
    case liveIPhoneRecording
    case iPhoneImport
}

struct RecordingManifest: Codable, Identifiable {
    let id: UUID
    let fileName: String
    let createdAt: Date
    var startedAt: Date?
    var endedAt: Date?
    let origin: RecordingOrigin
    var sha256: String?
    var interruptionEvents: [String]

    init(
        id: UUID = UUID(),
        fileName: String,
        createdAt: Date = Date(),
        startedAt: Date? = nil,
        endedAt: Date? = nil,
        origin: RecordingOrigin,
        sha256: String? = nil,
        interruptionEvents: [String] = []
    ) {
        self.id = id
        self.fileName = fileName
        self.createdAt = createdAt
        self.startedAt = startedAt
        self.endedAt = endedAt
        self.origin = origin
        self.sha256 = sha256
        self.interruptionEvents = interruptionEvents
    }
}
