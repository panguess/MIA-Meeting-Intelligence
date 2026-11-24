# Audio import policy

1. Import starts only from an explicit user action in the MIA iPhone app.
2. Use Apple's document picker / SwiftUI file importer.
3. Copy the selected file into MIA's protected app container before processing.
4. Validate extension, actual media container, duration, size, and decodability.
5. Compute a cryptographic hash and assign an opaque internal ID.
6. Do not automatically scan Files, mail, messaging apps, or cloud drives.
7. If a selected file is hosted by a cloud file provider, the user must understand that the provider may download it to the device during selection.
