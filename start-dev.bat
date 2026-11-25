@echo off
cd /d "%~dp0"
echo ========================================================
echo  Starting AarogyaDamu - Diabetes Care Journey Companion
echo ========================================================
echo.
echo 0. Ensuring Local PostgreSQL is running (Port 55432)...
wsl -d Ubuntu -u root service postgresql start >nul 2>&1
start /b wsl -d Ubuntu sh -c "while true; do sleep 60; done" >nul 2>&1

:wait_pg
wsl -d Ubuntu pg_isready -h 127.0.0.1 -p 55432 >nul 2>&1
if errorlevel 1 (
  timeout /t 1 /nobreak >nul
  goto wait_pg
)
echo [OK] PostgreSQL is active and accepting connections on port 55432!

echo 1. Launching Backend API (Port 4000)...
start "AarogyaDamu API (Port 4000)" cmd /k "npm run dev:api"

echo 2. Launching Doctor Web Workstation (Port 5173)...
start "AarogyaDamu Web Workstation (Port 5173)" cmd /k "npm run dev:web"

echo 3. Launching Mobile Experience (Port 8081)...
start "AarogyaDamu Mobile App (Port 8081)" cmd /k "npm run dev:mobile:web"

echo.
echo ========================================================
echo All services launched in separate windows!
echo - API Backend:        http://localhost:4000
echo - Doctor Workstation:  http://localhost:5173
echo - Mobile App (Web):    http://localhost:8081
echo ========================================================

