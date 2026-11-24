"""Tests for the folder logic, using a fake transcriber (no model needed).

Run:  python -m unittest test_mia_transcriber.py
"""

import tempfile
import unittest
from pathlib import Path

import mia_transcriber as mt


def fake(path: Path) -> mt.Transcript:
    if "broken" in path.name:
        raise RuntimeError("cannot decode")
    return mt.Transcript(
        segments=[mt.Segment(0.0, 2.5, "สวัสดีค่ะ เริ่มประชุม"), mt.Segment(3725, 3730, "ปิดประชุม")],
        language="th", duration=3730, model="fake", seconds_taken=12,
    )


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


class WatcherTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.inbox = Path(self.tmp.name)
        self.clock = Clock()
        self.watcher = mt.Watcher(self.inbox, fake, settle_seconds=60, clock=self.clock)

    def tearDown(self):
        self.tmp.cleanup()

    def test_waits_until_file_is_settled_then_writes_transcript(self):
        audio = self.inbox / "MIA-2026-11-24T09-00-00-000Z.m4a"
        audio.write_bytes(b"x" * 10)
        self.assertEqual(self.watcher.scan_once(), 0)  # first sighting
        self.clock.now += 30
        self.assertEqual(self.watcher.scan_once(), 0)  # not settled yet
        self.clock.now += 31
        self.assertEqual(self.watcher.scan_once(), 1)
        out = self.inbox / "MIA-2026-11-24T09-00-00-000Z.transcript.txt"
        text = out.read_text(encoding="utf-8-sig")
        self.assertIn("[00:00:00] สวัสดีค่ะ เริ่มประชุม", text)
        self.assertIn("[01:02:05] ปิดประชุม", text)
        self.assertIn("Audio length: 01:02:10", text)
        self.assertTrue(audio.exists(), "audio must never be deleted")
        self.assertFalse(list(self.inbox.glob("*working*")))
        self.assertFalse(list(self.inbox.glob("*.partial")))
        # Not processed twice.
        self.clock.now += 120
        self.assertEqual(self.watcher.scan_once(), 0)

    def test_growing_file_resets_the_wait(self):
        audio = self.inbox / "a.m4a"
        audio.write_bytes(b"x")
        self.watcher.scan_once()
        self.clock.now += 59
        audio.write_bytes(b"xx")  # still syncing
        self.watcher.scan_once()
        self.clock.now += 59
        self.assertEqual(self.watcher.scan_once(), 0)
        self.clock.now += 2
        self.assertEqual(self.watcher.scan_once(), 1)

    def test_failure_writes_note_and_keeps_going(self):
        (self.inbox / "broken.m4a").write_bytes(b"x")
        (self.inbox / "good.webm").write_bytes(b"x")
        self.assertEqual(self.watcher.scan_once(wait_for_settle=False), 2)
        self.assertTrue((self.inbox / "broken.transcript-failed.txt").exists())
        self.assertTrue((self.inbox / "good.transcript.txt").exists())
        # A failed file is not retried until its note is deleted.
        self.assertEqual(list(mt.pending_audio(self.inbox)), [])
        (self.inbox / "broken.transcript-failed.txt").unlink()
        self.assertEqual([p.name for p in mt.pending_audio(self.inbox)], ["broken.m4a"])

    def test_ignores_non_audio_and_empty_files(self):
        (self.inbox / "notes.txt").write_text("hi")
        (self.inbox / "empty.m4a").write_bytes(b"")
        self.watcher.scan_once()
        self.clock.now += 120
        self.assertEqual(self.watcher.scan_once(), 0)

    def test_summary_hook_failure_keeps_transcript(self):
        original = mt.summary_hook.after_transcript
        mt.summary_hook.after_transcript = lambda *_: (_ for _ in ()).throw(RuntimeError("boom"))
        try:
            (self.inbox / "m.m4a").write_bytes(b"x")
            with self.assertLogs("mia", level="ERROR"):
                self.watcher.scan_once(wait_for_settle=False)
        finally:
            mt.summary_hook.after_transcript = original
        self.assertTrue((self.inbox / "m.transcript.txt").exists())
        self.assertFalse((self.inbox / "m.transcript-failed.txt").exists())


if __name__ == "__main__":
    unittest.main()
