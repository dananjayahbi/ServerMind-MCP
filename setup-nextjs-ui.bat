@echo off
REM ServerMind Next.js UI — Setup Script
REM Run once from the project root to install deps, build, and add to PATH
REM Requires: Node.js 18+ and npm

set NEXTJS_DIR=%~dp0nextjs-ui

echo.
echo ============================================================
echo  ServerMind MCP — Next.js UI Setup
echo ============================================================
echo.

REM Check Node.js
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install Node.js 18+ from https://nodejs.org
  pause
  exit /b 1
)

echo [1/4] Installing dependencies...
cd /d "%NEXTJS_DIR%"
call npm install
if errorlevel 1 (
  echo [ERROR] npm install failed
  pause
  exit /b 1
)

echo.
echo [2/4] Generating Prisma client...
call npx prisma generate
if errorlevel 1 (
  echo [ERROR] Prisma generate failed
  pause
  exit /b 1
)

echo.
echo [3/4] Building Next.js app (production)...
call npm run build
if errorlevel 1 (
  echo [ERROR] Next.js build failed
  pause
  exit /b 1
)

echo.
echo [4/4] Adding servermind-ui command to PATH...
set BIN_DIR=%NEXTJS_DIR%\bin
REM Add to user PATH permanently using setx
setx PATH "%PATH%;%BIN_DIR%" >nul 2>&1
if errorlevel 1 (
  echo [WARN] Could not set PATH automatically.
  echo        Please manually add this directory to your PATH:
  echo        %BIN_DIR%
) else (
  echo [OK] Added to PATH: %BIN_DIR%
  echo      (Restart your terminal for the change to take effect)
)

echo.
echo ============================================================
echo  Setup complete!
echo.
echo  To start the UI:
echo    1. Run: servermind-mcp  (in one terminal)
echo    2. Run: servermind-ui   (in another terminal)
echo    3. Open: http://localhost:17435
echo ============================================================
echo.
pause
