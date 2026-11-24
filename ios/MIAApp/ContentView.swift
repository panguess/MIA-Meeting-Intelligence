import SwiftUI
import UniformTypeIdentifiers

struct ContentView: View {
    @EnvironmentObject private var recordingService: AudioRecordingService
    @State private var isImporterPresented = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("MIA")
                            .font(.largeTitle.bold())
                        Text("Meeting Intelligence Assistant")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Text("ผู้ช่วยบันทึกและจัดการข้อมูลการประชุมอย่างเป็นส่วนตัว")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }

                    GroupBox {
                        VStack(alignment: .leading, spacing: 14) {
                            Label(
                                recordingService.isRecording
                                    ? "กำลังบันทึก / Recording"
                                    : "พร้อมบันทึก / Ready",
                                systemImage: recordingService.isRecording ? "waveform.circle.fill" : "mic.circle"
                            )
                            .font(.headline)

                            Text(recordingService.statusMessage)
                                .font(.subheadline)

                            HStack(spacing: 12) {
                                Button {
                                    Task { await recordingService.startRecording() }
                                } label: {
                                    Label("เริ่มบันทึก / Start", systemImage: "record.circle")
                                        .frame(maxWidth: .infinity)
                                }
                                .buttonStyle(.borderedProminent)
                                .tint(.red)
                                .disabled(recordingService.isRecording)

                                Button {
                                    recordingService.stopRecording()
                                } label: {
                                    Label("หยุด / Stop", systemImage: "stop.circle")
                                        .frame(maxWidth: .infinity)
                                }
                                .buttonStyle(.bordered)
                                .disabled(!recordingService.isRecording)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    } label: {
                        Label("การบันทึกเสียง / Audio recording", systemImage: "mic")
                    }

                    if let warning = recordingService.warningMessage {
                        Label(warning, systemImage: "exclamationmark.triangle.fill")
                            .font(.footnote)
                            .foregroundStyle(.orange)
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(.orange.opacity(0.10), in: RoundedRectangle(cornerRadius: 10))
                    }

                    GroupBox {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("การประชุมออนไลน์ / Online meetings")
                                .font(.headline)
                            Text("หากประชุมผ่าน Teams บน Laptop ให้วาง iPhone ใกล้ลำโพงเพื่อรับเสียงจากห้องประชุม ไม่ได้เชื่อมต่อ Teams โดยตรง")
                                .font(.subheadline)
                            Text("For Teams meetings on a laptop, place the iPhone near the laptop speakers. MIA records acoustic audio and does not connect to Teams.")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    GroupBox {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("นำเข้าไฟล์เสียง / Import audio")
                                .font(.headline)
                            Text("เลือกไฟล์เสียงจาก Files บน iPhone ไฟล์จะถูกคัดลอกเข้า MIA เพื่อเก็บและประมวลผลภายในแอป")
                                .font(.subheadline)
                            Button {
                                isImporterPresented = true
                            } label: {
                                Label("เลือกไฟล์เสียง / Choose audio file", systemImage: "square.and.arrow.down")
                            }
                            .buttonStyle(.bordered)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    GroupBox {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Text("ไฟล์ในอุปกรณ์ / On-device files")
                                    .font(.headline)
                                Spacer()
                                Text("\(recordingService.recordings.count)")
                                    .foregroundStyle(.secondary)
                            }

                            if recordingService.recordings.isEmpty {
                                Text("ยังไม่มีไฟล์เสียง / No audio files yet")
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            } else {
                                ForEach(recordingService.recordings) { item in
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(item.fileName)
                                            .font(.caption.monospaced())
                                            .lineLimit(1)
                                        Text("\(item.origin == .liveIPhoneRecording ? "บันทึกสด / Live" : "นำเข้า / Imported") • \(item.createdAt.formatted(date: .abbreviated, time: .shortened))")
                                            .font(.caption2)
                                            .foregroundStyle(.secondary)
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    Divider()
                                }
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    Text("ต้นแบบสำหรับทดสอบเท่านั้น • ไฟล์เสียงเก็บในเครื่อง • เป้าหมายการเก็บเสียง 90 วัน • ไม่มีการส่งเสียงไป Cloud AI")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .padding()
            }
            .navigationTitle("MIA")
            .navigationBarTitleDisplayMode(.inline)
            .fileImporter(
                isPresented: $isImporterPresented,
                allowedContentTypes: [.audio],
                allowsMultipleSelection: false
            ) { result in
                switch result {
                case .success(let urls):
                    guard let url = urls.first else { return }
                    recordingService.importAudio(from: url)
                case .failure(let error):
                    // File-picker cancellation is harmless; other errors are surfaced.
                    recordingService.reportImportError(error)
                }
            }
            .onAppear {
                recordingService.refreshRecordings()
            }
        }
    }
}
