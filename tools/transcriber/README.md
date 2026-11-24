# MIA laptop transcriber

Free, offline transcription for MIA recordings, running on the user's own Windows laptop.

```
iPhone (MIA) ──Export → Save to Files──▶ OneDrive\Desktop\MIA\Inbox\MIA-….m4a
                                               │  (OneDrive syncs it to the laptop)
                                               ▼
                          mia_transcriber.py (faster-whisper, on the laptop CPU)
                                               │
                                               ▼
                          OneDrive\Desktop\MIA\Inbox\MIA-….transcript.txt
                                               │  (OneDrive syncs it back)
                                               ▼
                      iPhone (MIA) ── Transcript → pick the .txt file
```

- No paid service and no account beyond the OneDrive the user already has. Audio and text never leave the user's iPhone, laptop and OneDrive.
- The only network access is a one-time download of the speech model from Hugging Face (official SYSTRAN repository) on first run. After that it works offline.
- The script never deletes or moves audio. It only adds files next to it:
  - `<name>.transcript.txt`: the transcript, with `[hh:mm:ss]` timestamps.
  - `<name>.transcript-working.txt`: shown while it is working; removed when done.
  - `<name>.transcript-failed.txt`: written if a file could not be read. Delete it to retry.
- A file is processed only after it has stopped changing for 60 seconds, so a file OneDrive is still syncing is not read half-way.
- One file at a time. Leave 2 CPU threads free by default so the laptop stays usable.

## Why these components are considered safe

| Component | Publisher | Licence | Notes |
|---|---|---|---|
| Python (python.org) | Python Software Foundation | PSF | Official installer only. |
| `faster-whisper` 1.2.1 | SYSTRAN (machine translation company) | MIT | Widely used open-source re-implementation of OpenAI Whisper. Pinned version. |
| CTranslate2 | OpenNMT (SYSTRAN / Harvard NLP origin) | MIT | Inference engine used by faster-whisper. |
| PyAV | PyAV project (FFmpeg bindings) | BSD | Decodes m4a/webm; bundles FFmpeg, so no separate FFmpeg install. |
| onnxruntime | Microsoft | MIT | Runs the bundled Silero voice-activity model that skips silence. |
| Model `Systran/faster-whisper-large-v3` | SYSTRAN, converted from OpenAI Whisper large-v3 | MIT | Downloaded once (~3 GB) from Hugging Face. |

All Python packages come from PyPI into a private `.venv` folder next to the script; nothing is installed system-wide, and deleting the folder removes everything except the downloaded model cache (`%USERPROFILE%\.cache\huggingface`).

## Setup (Windows, once)

1. Install Python 3.12 from <https://www.python.org/downloads/windows/> if `py --version` doesn't work.
2. Copy this `transcriber` folder to the laptop, for example `C:\Users\<you>\MIA-transcriber` (outside OneDrive, so the private environment is not synced).
3. Double-click `setup_windows.bat`.

## Use

Double-click `start_transcriber.bat` and leave the window open. On the iPhone, export a recording and save it to **OneDrive › Desktop › MIA › Inbox**. When the laptop is on and synced, the transcript appears in the same folder.

Options (add after `mia_transcriber.py` in `start_transcriber.bat`, or run from a terminal):

| Option | Default | Meaning |
|---|---|---|
| `--model` | `large-v3` | `large-v3` is the most accurate for Thai and the slowest. `turbo` is several times faster with somewhat lower accuracy. |
| `--language` | `th` | `en` for English meetings, `auto` to detect. |
| `--inbox` | `OneDrive\Desktop\MIA\Inbox` | Folder to watch. |
| `--threads` | CPU count − 2 | CPU threads to use. |
| `--once` | off | Process what is in the folder now, then exit. |

## Assumptions to verify on the real laptop

- **Speed** on the Intel Core Ultra 5 125H (CPU only, int8) has not been measured yet. Rough expectation: `large-v3` about as long as the audio, `turbo` a fraction of that. Measure with a 5-minute and a 1-hour Thai recording before relying on it.
- **Thai accuracy** of `large-v3` versus `turbo` on the user's own meetings. A Thai fine-tuned model (for example Mahidol University's Thonburian Whisper) could be evaluated later.
- The laptop must be on, awake and signed in to OneDrive for files to be processed.

## Summaries

Made by the user in their own Claude app, at no extra cost: open the transcript in MIA, tap **Copy for summary** (copies the transcript plus Thai instructions for key points, decisions, action items with owner and due date, open questions and risks), then **Open Claude** and paste. Nothing is sent automatically. `summary_hook.py` stays a no-op placeholder for a possible future local method.

## Tests

```
python -m unittest test_mia_transcriber.py
```

The tests use a fake transcriber, so they don't need the model.
