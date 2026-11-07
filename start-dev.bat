@echo off
echo ========================================================
echo  Starting AarogyaDamu - Diabetes Care Journey Companion
echo ========================================================
echo.
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

