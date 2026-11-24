"""Summary hook (intentionally a no-op).

Decision (24 Nov 2026): summaries are made by the user in their own Claude app
with their existing subscription, not automatically. In the MIA app, the
transcript viewer's "Copy for summary" button copies the transcript together
with summary instructions, and the user pastes it into Claude. There is no API
key and no automatic upload, so this hook does nothing.

If an automatic, local method is added later, implement it here and write the
result next to the transcript, for example:

    MIA-2026-11-24T09-00-00-000Z.summary.txt

Rules for whoever implements it:
  * Never delete or overwrite the transcript or the audio.
  * Write with a temporary name and rename, like mia_transcriber.write_atomic.
  * Do not send audio or transcript text to any online service unless the
    user has explicitly chosen that option.
"""

from __future__ import annotations

from pathlib import Path

SUMMARY_SUFFIX = ".summary.txt"


def after_transcript(audio_path: Path, transcript_path: Path) -> None:
    """Called after each transcript is written. Intentionally a no-op for now."""
    return None
