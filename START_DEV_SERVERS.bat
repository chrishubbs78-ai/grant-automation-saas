@echo off
REM Grant Automation SaaS - Developer Server Startup
REM This script starts both backend and frontend servers

echo.
echo =====================================================
echo   Grant Automation SaaS - Development Server Startup
echo =====================================================
echo.

REM Check if npm is installed
npm --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: npm is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo ✓ Node.js/npm detected
echo.

REM Start backend in new window
echo Starting Backend Server (Port 4006)...
start cmd /k "cd backend && npm run dev"
echo ✓ Backend window opened
echo.

REM Give backend a moment to start
timeout /t 3 /nobreak

REM Start frontend in new window
echo Starting Frontend Server (Port 5173)...
start cmd /k "cd frontend && npm run dev"
echo ✓ Frontend window opened
echo.

echo =====================================================
echo   Servers Starting...
echo =====================================================
echo.
echo Frontend: http://localhost:5173
echo Backend:  http://localhost:4006
echo.
echo IMPORTANT SETUP STEPS (if first time):
echo 1. Create PostgreSQL database user:
echo    CREATE USER grant_automation WITH PASSWORD 'password';
echo    CREATE DATABASE grant_automation OWNER grant_automation;
echo.
echo 2. Update backend\.env with:
echo    - DATABASE_URL (if different than default)
echo    - CLAUDE_API_KEY (from console.anthropic.com)
echo    - GEMINI_API_KEY (from ai.google.dev)
echo.
echo 3. Backend will show:
echo    "Database connected"
echo    "Models synced"
echo    "Server running on port 4006"
echo.
echo For detailed setup, see SETUP.md
echo =====================================================
echo.
echo Press any key to close this window...
pause
