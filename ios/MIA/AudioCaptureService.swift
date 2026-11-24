import AVFoundation
import Foundation

/// Prototype boundary for iPhone-only acoustic capture.
/// Production implementation still needs interruption recovery, durable chunk writes,
/// background capability configuration, storage limits, and device testing.
final class AudioCaptureService: NSObject {
    private let session = AVAudioSession.sharedInstance()
    private var recorder: AVAudioRecorder?

    func requestPermission() async -> Bool {
        await withCheckedContinuation { continuation in
            session.requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
    }

    func configureSession() throws {
        try session.setCategory(.record, mode: .default, options: [])
        try session.setActive(true)
    }

    func startRecording(to url: URL) throws {
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 44_100,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]
        let newRecorder = try AVAudioRecorder(url: url, settings: settings)
        newRecorder.isMeteringEnabled = true
        newRecorder.prepareToRecord()
        guard newRecorder.record() else {
            throw NSError(domain: "MIA.AudioCapture", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "Unable to start recording"])
        }
        recorder = newRecorder
    }

    func stopRecording() {
        recorder?.stop()
        recorder = nil
        try? session.setActive(false, options: .notifyOthersOnDeactivation)
    }
}
