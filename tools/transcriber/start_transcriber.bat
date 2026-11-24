@echo off
REM Starts the MIA transcriber. Keep this window open; close it to stop.
REM Add --model turbo after mia_transcriber.py for faster, slightly less
REM accurate transcripts.
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (
  echo Run setup_windows.bat first.
  pause
  exit /b 1
)
title MIA transcriber
.venv\Scripts\python.exe mia_transcriber.py %*
pause
