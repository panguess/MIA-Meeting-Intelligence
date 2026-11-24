"""MIA laptop transcriber.

Watches a folder (by default the "MIA Inbox" inside the user's OneDrive) for
meeting audio exported from the MIA iPhone app, transcribes each new file on
this computer with faster-whisper (free, open source, runs offline after the
model is downloaded once), and writes the transcript back next to the audio:

    MIA-2026-11-24T09-00-00-000Z.m4a
    MIA-2026-11-24T09-00-00-000Z.transcript.txt   <- written by this script

Nothing is uploaded anywhere by this script. OneDrive sync is done by the
OneDrive app the user already has; this script only reads and writes files in
the local OneDrive folder.

Run:  python mia_transcriber.py            (keep watching)
      python mia_transcriber.py --once     (process what is there, then exit)
"""

from __future__ import annotations

import argparse
import datetime as dt
import logging
import os
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable, Optional

import summary_hook

AUDIO_EXTENSIONS = {".m4a", ".mp4", ".mp3", ".wav", ".aac", ".caf", ".webm", ".ogg", ".opus"}
TRANSCRIPT_SUFFIX = ".transcript.txt"
FAILED_SUFFIX = ".transcript-failed.txt"
WORKING_SUFFIX = ".transcript-working.txt"
LOCK_NAME = ".mia-transcriber.lock"

# A file must keep the same size and modification time for this long before
# it is processed, so a file that OneDrive is still downloading is not read
# half-way.
DEFAULT_SETTLE_SECONDS = 60

log = logging.getLogger("mia")


def default_inbox() -> Path:
    """%USERPROFILE%\\OneDrive\\Desktop\\MIA\\Inbox on Windows (OneDrive env var if set)."""
    onedrive = os.environ.get("OneDriveConsumer") or os.environ.get("OneDrive")
    base = Path(onedrive) if onedrive else Path.home() / "OneDrive"
    return base / "Desktop" / "MIA" / "Inbox"


@dataclass
class Segment:
    start: float
    end: float
    text: str


@dataclass
class Transcript:
    segments: list[Segment]
    language: str
    duration: float
    model: str
    seconds_taken: float = 0.0
    notes: list[str] = field(default_factory=list)


# A transcribe function takes an audio path and returns a Transcript. The real
# one uses faster-whisper; tests pass a fake one.
TranscribeFn = Callable[[Path], Transcript]


def make_whisper_transcriber(model_name: str, language: Optional[str], threads: int) -> TranscribeFn:
    from faster_whisper import WhisperModel  # imported here so tests don't need it

    log.info("Loading model %s (first run downloads it once, about 1.5–3 GB) ...", model_name)
    model = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=threads)
    log.info("Model ready.")

    def transcribe(path: Path) -> Transcript:
        started = time.monotonic()
        segments_iter, info = model.transcribe(
            str(path),
            language=language,
            task="transcribe",
            beam_size=5,
            vad_filter=True,  # skip silence; reduces made-up text in quiet parts
            vad_parameters={"min_silence_duration_ms": 700},
            # Long meetings: not feeding the previous text back in avoids the
            # model getting stuck repeating one sentence.
            condition_on_previous_text=False,
        )
        segments: list[Segment] = []
        last_report = time.monotonic()
        for seg in segments_iter:
            segments.append(Segment(seg.start, seg.end, seg.text.strip()))
            if time.monotonic() - last_report > 60 and info.duration:
                log.info("  %s: %d%% done", path.name, min(99, int(seg.end * 100 / info.duration)))
                last_report = time.monotonic()
        return Transcript(
            segments=segments,
            language=info.language,
            duration=float(info.duration or 0),
            model=model_name,
            seconds_taken=time.monotonic() - started,
        )

    return transcribe


def fmt_clock(seconds: float) -> str:
    seconds = max(0, int(seconds))
    return f"{seconds // 3600:02d}:{seconds % 3600 // 60:02d}:{seconds % 60:02d}"


def render_transcript(audio: Path, result: Transcript) -> str:
    lines = [
        f"MIA transcript — {audio.name}",
        f"Audio length: {fmt_clock(result.duration)}",
        f"Language: {result.language}   Model: {result.model}   "
        f"Processing time: {fmt_clock(result.seconds_taken)}",
        f"Created: {dt.datetime.now().strftime('%Y-%m-%d %H:%M')} on this computer (offline)",
        "Machine transcript: names, numbers and technical terms may be wrong. Check against the audio.",
    ]
    lines += [f"Note: {note}" for note in result.notes]
    lines.append("")
    if not result.segments:
        lines.append("(No speech was detected in this file.)")
    for seg in result.segments:
        if seg.text:
            lines.append(f"[{fmt_clock(seg.start)}] {seg.text}")
    return "\n".join(lines) + "\n"


def write_atomic(path: Path, text: str) -> None:
    """Write to a temporary name first so OneDrive never syncs half a file."""
    tmp = path.with_name(path.name + ".partial")
    tmp.write_text(text, encoding="utf-8-sig")  # BOM so Notepad/Excel show Thai correctly
    os.replace(tmp, path)


def outputs_for(audio: Path) -> tuple[Path, Path, Path]:
    stem = audio.with_suffix("")
    return (
        stem.with_name(stem.name + TRANSCRIPT_SUFFIX),
        stem.with_name(stem.name + FAILED_SUFFIX),
        stem.with_name(stem.name + WORKING_SUFFIX),
    )


def pending_audio(inbox: Path) -> Iterable[Path]:
    for path in sorted(inbox.iterdir()):
        if not path.is_file() or path.suffix.lower() not in AUDIO_EXTENSIONS:
            continue
        if path.name.startswith((".", "~")):
            continue
        done, failed, _ = outputs_for(path)
        if done.exists() or failed.exists():
            continue
        yield path


class Watcher:
    def __init__(self, inbox: Path, transcribe: Optional[TranscribeFn], settle_seconds: float,
                 transcriber_factory: Optional[Callable[[], TranscribeFn]] = None,
                 clock: Callable[[], float] = time.time):
        self.inbox = inbox
        self._transcribe = transcribe
        self._factory = transcriber_factory
        self.settle_seconds = settle_seconds
        self.clock = clock
        self._seen: dict[Path, tuple[int, float, float]] = {}  # path -> (size, mtime, first_seen_stable)

    def transcriber(self) -> TranscribeFn:
        # Load the (large) model only when there is something to do.
        if self._transcribe is None:
            assert self._factory is not None
            self._transcribe = self._factory()
        return self._transcribe

    def is_settled(self, path: Path) -> bool:
        try:
            stat = path.stat()
        except OSError:
            return False
        now = self.clock()
        key = (stat.st_size, stat.st_mtime)
        previous = self._seen.get(path)
        if previous is None or previous[:2] != key or stat.st_size == 0:
            self._seen[path] = (*key, now)
            return False
        return now - previous[2] >= self.settle_seconds

    def process(self, audio: Path) -> bool:
        done, failed, working = outputs_for(audio)
        log.info("Transcribing %s (%.1f MB) ...", audio.name, audio.stat().st_size / 1e6)
        write_atomic(working, f"MIA is transcribing {audio.name} on the laptop. "
                              f"Started {dt.datetime.now():%Y-%m-%d %H:%M}. "
                              "This file disappears when the transcript is ready.\n")
        try:
            result = self.transcriber()(audio)
            write_atomic(done, render_transcript(audio, result))
            log.info("Done: %s (audio %s, took %s)", done.name, fmt_clock(result.duration),
                     fmt_clock(result.seconds_taken))
            try:
                summary_hook.after_transcript(audio, done)
            except Exception:  # a summary problem must never lose the transcript
                log.exception("Summary hook failed for %s (transcript is kept).", done.name)
            return True
        except Exception as error:  # keep watching other files
            log.exception("Could not transcribe %s", audio.name)
            write_atomic(failed, f"MIA could not transcribe {audio.name}.\n"
                                 f"Reason: {type(error).__name__}: {error}\n"
                                 "Delete this file to try again.\n")
            return False
        finally:
            try:
                working.unlink()
            except FileNotFoundError:
                pass
            self._seen.pop(audio, None)

    def scan_once(self, wait_for_settle: bool = True) -> int:
        processed = 0
        for audio in pending_audio(self.inbox):
            if wait_for_settle and not self.is_settled(audio):
                continue
            self.process(audio)
            processed += 1
        return processed


def acquire_lock(inbox: Path) -> Path:
    lock = Path(os.environ.get("LOCALAPPDATA") or Path.home()) / "MIA" / LOCK_NAME
    lock.parent.mkdir(parents=True, exist_ok=True)
    if lock.exists():
        try:
            pid = int(lock.read_text().strip() or 0)
        except ValueError:
            pid = 0
        if pid and _pid_alive(pid):
            raise SystemExit(f"MIA transcriber is already running (process {pid}). Close it first.")
    lock.write_text(str(os.getpid()))
    return lock


def _pid_alive(pid: int) -> bool:
    if sys.platform == "win32":
        import ctypes
        handle = ctypes.windll.kernel32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
        if handle:
            ctypes.windll.kernel32.CloseHandle(handle)
            return True
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Transcribe MIA meeting audio on this computer.")
    parser.add_argument("--inbox", type=Path, default=default_inbox(),
                        help="Folder to watch (default: OneDrive\\Desktop\\MIA\\Inbox)")
    parser.add_argument("--model", default="large-v3",
                        help="faster-whisper model: large-v3 (best Thai, slowest), turbo (faster), medium, small")
    parser.add_argument("--language", default="th",
                        help="Spoken language code, e.g. th or en. Use 'auto' to let the model detect it.")
    parser.add_argument("--threads", type=int, default=max(1, (os.cpu_count() or 4) - 2),
                        help="CPU threads to use (default leaves 2 free so the laptop stays usable)")
    parser.add_argument("--interval", type=float, default=30, help="Seconds between folder checks")
    parser.add_argument("--settle", type=float, default=DEFAULT_SETTLE_SECONDS,
                        help="Seconds a file must stay unchanged before it is processed")
    parser.add_argument("--once", action="store_true", help="Process files already in the folder, then exit")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(message)s", datefmt="%H:%M:%S")
    inbox: Path = args.inbox
    inbox.mkdir(parents=True, exist_ok=True)
    lock = acquire_lock(inbox)
    language = None if args.language == "auto" else args.language

    watcher = Watcher(
        inbox,
        transcribe=None,
        settle_seconds=args.settle,
        transcriber_factory=lambda: make_whisper_transcriber(args.model, language, args.threads),
    )
    log.info("MIA transcriber watching: %s", inbox)
    log.info("Model %s, language %s, %d CPU threads. Press Ctrl+C to stop.", args.model, args.language, args.threads)
    try:
        if args.once:
            watcher.scan_once(wait_for_settle=False)
            return 0
        while True:
            watcher.scan_once()
            time.sleep(args.interval)
    except KeyboardInterrupt:
        log.info("Stopped.")
        return 0
    finally:
        try:
            lock.unlink()
        except FileNotFoundError:
            pass


if __name__ == "__main__":
    sys.exit(main())
