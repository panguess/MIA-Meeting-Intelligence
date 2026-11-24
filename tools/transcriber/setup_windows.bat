@echo off
REM One-time setup for the MIA transcriber on Windows.
REM Creates a private Python environment in this folder and installs
REM faster-whisper from PyPI. Nothing is installed system-wide.
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 (
  echo Python was not found. Install Python 3.12 from https://www.python.org/downloads/windows/ first.
  pause
  exit /b 1
)
if not exist .venv (
  py -3 -m venv .venv || goto :error
)
call .venv\Scripts\activate.bat || goto :error
python -m pip install --upgrade pip || goto :error
python -m pip install -r requirements.txt || goto :error
echo.
echo Setup finished. Double-click start_transcriber.bat to start.
pause
exit /b 0
:error
echo Setup failed. Copy the messages above and send them to Claude.
pause
exit /b 1
