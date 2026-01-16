@echo off
title Classroom Grading App Launcher
cls

echo ===========================================
echo      Classroom Grading App Launcher
echo ===========================================
echo.

:: 1. Check if Node.js is installed
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo Please install it from https://nodejs.org/
    echo.
    pause
    exit
)

:: 2. Check and Install Dependencies
if not exist "node_modules" (
    echo [INFO] First time setup detected. Installing required libraries...
    echo [INFO] Installing: express socket.io ip
    call npm install express socket.io ip
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] Failed to install dependencies. Check your internet connection.
        pause
        exit
    )
    echo [SUCCESS] Libraries installed successfully.
    echo.
) else (
    echo [INFO] Dependencies found. Starting server...
)

:: 3. Run the Server
echo.
echo [INFO] Starting Server...
node server.js

:: 4. Keep window open if it crashes
echo.
echo [SERVER STOPPED]
pause