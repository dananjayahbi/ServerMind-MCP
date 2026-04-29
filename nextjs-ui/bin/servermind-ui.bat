@echo off
REM ServerMind UI launcher
REM Starts the Next.js dashboard in production mode on port 17435
REM This file should be accessible via PATH after running setup-nextjs-ui.bat

set SCRIPT_DIR=%~dp0
set NEXTJS_DIR=%SCRIPT_DIR%..\

cd /d "%NEXTJS_DIR%"

echo.
echo  ServerMind UI
echo  Starting on http://localhost:17435
echo  Press Ctrl+C to stop
echo.

npx next start -p 17435
