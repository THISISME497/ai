@echo off
setlocal
cd /d "%~dp0"

set "JARVIS_NODE=C:\Users\Danyil\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
set "JARVIS_PNPM=C:\Users\Danyil\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"

if not exist "%JARVIS_NODE%\node.exe" (
  echo Node.js was not found. Install Node.js LTS from https://nodejs.org then run npm start.
  pause
  exit /b 1
)

set "PATH=%JARVIS_NODE%;%PATH%"
call "%JARVIS_PNPM%" run build
if errorlevel 1 (
  echo Jarvis could not be built.
  pause
  exit /b 1
)

echo Starting Jarvis in a separate window...
start "Jarvis Server - keep this window open" /D "%cd%" "%JARVIS_NODE%\node.exe" server.mjs
echo.
echo Jarvis is starting. Open http://localhost:5190 in a few seconds.
pause
