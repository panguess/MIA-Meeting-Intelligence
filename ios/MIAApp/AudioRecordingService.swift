import AVFoundation
import Combine
import Foundation

@MainActor
final class AudioRecordingService: NSObject, ObservableObject, AVAudioRecorderDelegate {
    @Published private(set) var isRecording = false
    @Published private(set) var statusMessage = "พร้อมบันทึก / Ready"
    @Published private(set) var warningMessage: String?
    @Published private(set) var recordings: [RecordingManifest] = []

    private let session = AVAudioSession.sharedInstance()
    private let store = AudioFileStore()
    private var recorder: AVAudioRecorder?
    private var currentManifest: RecordingManifest?
    private var notificationTokens: [NSObjectProtocol] = []

    override init() {
        super.init()
        observeAudioSessionChanges()
        refreshRecordings()
    }

    deinit {
        notificationTokens.forEach { NotificationCenter.default.removeObserver($0) }
    }

    func requestMicrophonePermission() async -> Bool {
        switch session.recordPermission {
        case .granted:
            return true
        case .denied:
            statusMessage = "ไม่ได้รับอนุญาตให้ใช้ไมโครโฟน / Microphone access denied"
            return false
        case .undetermined:
            return await withCheckedContinuation { continuation in
                session.requestRecordPermission { granted in
                    continuation.resume(returning: granted)
                }
            }
        @unknown default:
            return false
        }
    }

    func startRecording() async {
        guard !isRecording else { return }
        warningMessage = nil

        guard await requestMicrophonePermission() else { return }

        do {
            try store.prepare()
            try session.setCategory(.record, mode: .default, options: [])
            try session.setActive(true)

            let id = UUID()
            let fileURL = try store.newRecordingURL(id: id)
            let settings: [String: Any] = [
                AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
                AVSampleRateKey: 44_100,
                AVNumberOfChannelsKey: 1,
                AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
            ]

            let newRecorder = try AVAudioRecorder(url: fileURL, settings: settings)
            newRecorder.delegate = self
            newRecorder.isMeteringEnabled = true
            newRecorder.prepareToRecord()

            guard newRecorder.record() else {
                throw RecordingError.couldNotStart
            }

            currentManifest = RecordingManifest(
                id: id,
                fileName: fileURL.lastPathComponent,
                startedAt: Date(),
                origin: .liveIPhoneRecording
            )
            recorder = newRecorder
            isRecording = true
            statusMessage = "กำลังบันทึก / Recording"
            persistCurrentManifestIfNeeded()
        } catch {
            statusMessage = "เริ่มบันทึกไม่สำเร็จ / Could not start"
            warningMessage = error.localizedDescription
            try? session.setActive(false)
        }
    }

    func stopRecording() {
        guard let recorder else { return }
        recorder.stop()
        self.recorder = nil
        isRecording = false
        finalizeCurrentRecording()
        try? session.setActive(false, options: .notifyOthersOnDeactivation)
        if warningMessage == nil {
            statusMessage = "บันทึกและบันทึกไฟล์แล้ว / Recording saved"
        }
        refreshRecordings()
    }

    func importAudio(from url: URL) {
        do {
            _ = try store.importAudio(from: url)
            statusMessage = "นำเข้าไฟล์แล้ว / Audio imported"
            warningMessage = nil
            refreshRecordings()
        } catch {
            statusMessage = "นำเข้าไฟล์ไม่สำเร็จ / Import failed"
            warningMessage = error.localizedDescription
        }
    }

    func reportImportError(_ error: Error) {
        let nsError = error as NSError
        guard !(nsError.domain == NSCocoaErrorDomain && nsError.code == NSUserCancelledError) else {
            return
        }
        statusMessage = "นำเข้าไฟล์ไม่สำเร็จ / Import failed"
        warningMessage = error.localizedDescription
    }

    func refreshRecordings() {
        do {
            recordings = try store.loadAll()
        } catch {
            warningMessage = "อ่านรายการไฟล์ไม่สำเร็จ: \(error.localizedDescription)"
        }
    }

    private func observeAudioSessionChanges() {
        let center = NotificationCenter.default

        notificationTokens.append(center.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: session,
            queue: .main
        ) { [weak self] notification in
            Task { @MainActor in self?.handleInterruption(notification) }
        })

        notificationTokens.append(center.addObserver(
            forName: AVAudioSession.routeChangeNotification,
            object: session,
            queue: .main
        ) { [weak self] notification in
            Task { @MainActor in self?.handleRouteChange(notification) }
        })

        notificationTokens.append(center.addObserver(
            forName: AVAudioSession.mediaServicesWereResetNotification,
            object: session,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.recordInterruption("ระบบเสียงของ iOS ถูกรีเซ็ต / iOS audio services reset")
            }
        })
    }

    private func handleInterruption(_ notification: Notification) {
        guard
            let rawValue = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
            let type = AVAudioSession.InterruptionType(rawValue: rawValue)
        else { return }

        switch type {
        case .began:
            recordInterruption("ระบบขัดจังหวะการบันทึก / Audio interruption began")
        case .ended:
            warningMessage = "เสียงอาจมีช่วงขาดหาย ระบบจะไม่เริ่มบันทึกต่อเอง / Audio may contain a gap; recording will not auto-resume."
        @unknown default:
            recordInterruption("พบเหตุการณ์เสียงที่ไม่รู้จัก / Unknown audio interruption")
        }
    }

    private func handleRouteChange(_ notification: Notification) {
        guard
            let rawValue = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
            let reason = AVAudioSession.RouteChangeReason(rawValue: rawValue)
        else { return }

        let message = "เส้นทางเสียงเปลี่ยน: \(reason.rawValue) / Audio route changed"
        currentManifest?.interruptionEvents.append(message)
        warningMessage = message
        persistCurrentManifestIfNeeded()
    }

    private func recordInterruption(_ message: String) {
        currentManifest?.interruptionEvents.append(message)
        warningMessage = message
        statusMessage = "การบันทึกถูกรบกวน โปรดตรวจสอบไฟล์ / Recording interrupted — review the file"
        guard isRecording else {
            persistCurrentManifestIfNeeded()
            return
        }

        recorder?.stop()
        recorder = nil
        isRecording = false
        finalizeCurrentRecording()
        try? session.setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func finalizeCurrentRecording() {
        guard var manifest = currentManifest else { return }
        manifest.endedAt = Date()

        do {
            let fileURL = try store.newRecordingURL(id: manifest.id)
            manifest.sha256 = try store.checksum(of: fileURL)
            try store.protectAudioFile(at: fileURL)
            try store.save(manifest)
            currentManifest = nil
        } catch {
            warningMessage = "ปิดไฟล์หรือบันทึก manifest ไม่สำเร็จ: \(error.localizedDescription)"
            currentManifest = manifest
            persistCurrentManifestIfNeeded()
        }
    }

    private func persistCurrentManifestIfNeeded() {
        guard let manifest = currentManifest else { return }
        do {
            try store.save(manifest)
            refreshRecordings()
        } catch {
            warningMessage = "บันทึกข้อมูลเหตุขัดข้องไม่ได้: \(error.localizedDescription)"
        }
    }

    func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
        warningMessage = error?.localizedDescription ?? "เกิดข้อผิดพลาดขณะเข้ารหัสเสียง"
        isRecording = false
        self.recorder = nil
        finalizeCurrentRecording()
        try? session.setActive(false, options: .notifyOthersOnDeactivation)
        refreshRecordings()
    }
}

private enum RecordingError: LocalizedError {
    case couldNotStart

    var errorDescription: String? {
        "The audio recorder could not start."
    }
}
