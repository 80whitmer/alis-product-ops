@echo off
setlocal enabledelayedexpansion
title ALIS Product Hub
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo Node.js doesn't seem to be installed.
    echo Go to https://nodejs.org, download the button labeled LTS, and run the installer.
    echo Then double-click this file again.
    echo.
    pause
    exit /b 1
)

if not exist "server\.env" (
    echo.
    echo First-time setup - two quick questions, then this is remembered for next time.
    echo.
    set /p HUBSPOT_TOKEN="HubSpot Private App Token (from Aaron): "
    set /p HUBSPOT_PORTAL="HubSpot Portal ID (ask Aaron, or press Enter to skip): "
    (
        echo HUBSPOT_PRIVATE_APP_TOKEN=!HUBSPOT_TOKEN!
        echo HUBSPOT_PORTAL_ID=!HUBSPOT_PORTAL!
        echo PORT=3100
    ) > server\.env
    echo.
    echo Saved to server\.env.
)

if not exist "node_modules" (
    echo.
    echo Installing - this can take a few minutes the first time, text scrolling by is normal...
    call npm install
    if errorlevel 1 (
        echo.
        echo Something went wrong during install. Copy this window's text and send it to Aaron.
        pause
        exit /b 1
    )
)

echo.
echo Starting ALIS Product Hub...
echo Leave this window open - closing it stops the app.
echo.
start "" cmd /c "timeout /t 6 /nobreak >nul && start http://localhost:5174"
call npm run dev
