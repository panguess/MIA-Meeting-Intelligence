import SwiftUI

@main
struct MIAApp: App {
    @StateObject private var recordingService = AudioRecordingService()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(recordingService)
        }
    }
}
