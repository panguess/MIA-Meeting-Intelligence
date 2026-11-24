import CryptoKit
import Foundation

/// Stores meeting audio inside the app's private Documents directory.
final class AudioFileStore {
    private let fileManager = FileManager.default
    private let folderName = "MIARecordings"
    private let retentionDays = 90

    private var recordingsDirectory: URL {
        let documents = fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return documents.appendingPathComponent(folderName, isDirectory: true)
    }

    func prepare() throws {
        try fileManager.createDirectory(
            at: recordingsDirectory,
            withIntermediateDirectories: true
        )
        try removeExpiredAudio()
    }

    func newRecordingURL(id: UUID) throws -> URL {
        try prepare()
        return recordingsDirectory.appendingPathComponent("\(id.uuidString).m4a")
    }

    func importAudio(from sourceURL: URL) throws -> RecordingManifest {
        try prepare()
        let hasAccess = sourceURL.startAccessingSecurityScopedResource()
        defer {
            if hasAccess { sourceURL.stopAccessingSecurityScopedResource() }
        }

        let id = UUID()
        let fileExtension = sourceURL.pathExtension.isEmpty ? "audio" : sourceURL.pathExtension
        let fileName = "\(id.uuidString).\(fileExtension)"
        let destination = recordingsDirectory.appendingPathComponent(fileName)
        try fileManager.copyItem(at: sourceURL, to: destination)

        var manifest = RecordingManifest(
            id: id,
            fileName: fileName,
            origin: .iPhoneImport,
            sha256: try checksum(of: destination)
        )
        manifest.endedAt = Date()
        try save(manifest)
        return manifest
    }

    func save(_ manifest: RecordingManifest) throws {
        try prepareDirectoryOnly()
        let url = recordingsDirectory.appendingPathComponent("\(manifest.id.uuidString).json")
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(manifest).write(to: url, options: .atomic)
    }

    func loadAll() throws -> [RecordingManifest] {
        try prepare()
        let urls = try fileManager.contentsOfDirectory(
            at: recordingsDirectory,
            includingPropertiesForKeys: nil
        )
        return urls
            .filter { $0.pathExtension.lowercased() == "json" }
            .compactMap { url in
                guard let data = try? Data(contentsOf: url) else { return nil }
                let decoder = JSONDecoder()
                decoder.dateDecodingStrategy = .iso8601
                return try? decoder.decode(RecordingManifest.self, from: data)
            }
            .sorted { $0.createdAt > $1.createdAt }
    }

    func checksum(of url: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }

        var hasher = SHA256()
        while true {
            let chunk = try handle.read(upToCount: 1_048_576) ?? Data()
            if chunk.isEmpty { break }
            hasher.update(data: chunk)
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }

    private func prepareDirectoryOnly() throws {
        try fileManager.createDirectory(
            at: recordingsDirectory,
            withIntermediateDirectories: true
        )
    }

    private func removeExpiredAudio() throws {
        let cutoff = Calendar.current.date(byAdding: .day, value: -retentionDays, to: Date()) ?? .distantPast
        let urls = try fileManager.contentsOfDirectory(
            at: recordingsDirectory,
            includingPropertiesForKeys: [.contentModificationDateKey]
        )

        for url in urls where url.pathExtension.lowercased() != "json" {
            let values = try url.resourceValues(forKeys: [.contentModificationDateKey])
            if let modified = values.contentModificationDate, modified < cutoff {
                try fileManager.removeItem(at: url)
                let manifestURL = recordingsDirectory
                    .appendingPathComponent(url.deletingPathExtension().lastPathComponent + ".json")
                try? fileManager.removeItem(at: manifestURL)
            }
        }
    }
}
