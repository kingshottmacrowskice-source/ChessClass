@echo off
setlocal
cd /d "%~dp0"
title LearnChess

where node >nul 2>&1
if errorlevel 1 (
    echo Node.js is missing. Install Node.js 24 LTS, then try again.
    goto :fail
)
node -e "const [major,minor]=process.versions.node.split('.').map(Number);process.exit(major>22||(major===22&&minor>=13)?0:1)"
if errorlevel 1 (
    echo Node.js 22.13 or newer is required. Please install Node.js 24 LTS.
    goto :fail
)
where npm.cmd >nul 2>&1
if errorlevel 1 (
    echo npm is missing. Please reinstall Node.js with npm included.
    goto :fail
)

if not exist "node_modules\.bin\vite.cmd" (
    echo Installing dependencies. Internet access is required...
    call npm.cmd ci
    if errorlevel 1 goto :fail
)

echo Starting LearnChess at http://127.0.0.1:5173
echo Position database: %~dp0data\positions.sqlite
echo Keep this window open. Press Ctrl+C to stop.
call npm.cmd run dev -- --port 5173 --strictPort --open %*
if errorlevel 1 goto :fail
exit /b 0

:fail
echo.
echo LearnChess could not start. See the error above.
pause
exit /b 1
