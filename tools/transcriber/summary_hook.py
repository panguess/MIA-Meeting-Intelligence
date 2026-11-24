"""Summary hook (not implemented yet, on purpose).

How meeting summaries will be made is still being decided. The options under
consideration are:

  * the user's existing Claude subscription (paste or attach the transcript), or
  * a small summary model that runs on this laptop.

Until that is decided this hook does nothing, so no transcript ever leaves the
computer. When a method is chosen, implement it here and write the result next
to the transcript, for example:

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
