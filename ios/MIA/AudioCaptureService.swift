import AVFoundation
import Foundation

/// Initial prototype only. Must be tested on-device and hardened before production use.
final class AudioCaptureService: NSObject {
    private let audioEngine = AVAudioEngine()
    private var audioFile: AVAudioFile?
    private let fileURL: URL

    init(fileURL: URL) {
        self.fileURL = fileURL
        super.init()
    }

    func requestPermission() async throws {
        let granted = await AVAudioApplication.requestRecordPermission()
        guard granted else {
            throw AudioCaptureError.permissionDenied
        }
    }

    func start() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])
        try session.setActive(true)

        let input = audioEngine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
            throw AudioCaptureError.invalidAudioFormat
        }

        audioFile = try AVAudioFile(forWriting: fileURL, settings: format.settings)
        input.installTap(onBus: 0, bufferSize: 4096, format: format) { [weak self] buffer, _ in
            guard let self, let file = self.audioFile else { return }
            do {
                try file.write(from: buffer)
            } catch {
                // Production implementation must persist an error state and notify the user.
            }
        }

        audioEngine.prepare()
        try audioEngine.start()
    }

    func stop() {
        audioEngine.inputNode.removeTap(onBus: 0)
        audioEngine.stop()
        audioFile = nil
        try? AVAudioSession.sharedInstance().setActive(false)
    }
}

enum AudioCaptureError: Error {
    case permissionDenied
    case invalidAudioFormat
}
