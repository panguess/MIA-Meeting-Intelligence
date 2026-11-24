import Foundation

enum RecordingState: Equatable {
    case idle
    case requestingPermission
    case recording(startedAt: Date)
    case interrupted(reason: String, at: Date)
    case stopping
    case completed(fileURL: URL)
    case failed(message: String)
}
