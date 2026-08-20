@echo off
title FinAI Local Web Application
echo ===================================================
echo   FinAI - AI Tax Accountant & Financial Manager
echo ===================================================
echo.

:: Check if Python is available
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python is not found in your PATH.
    echo Please install Python 3.8+ or add it to system PATH.
    pause
    exit /b 1
)

echo Starting FinAI local server on http://localhost:8000 ...
echo.
python "%~dp0server.py"

pause
