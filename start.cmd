@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  start "" "%~dp0index.html"
  exit /b
)
start "" "http://127.0.0.1:8186"
node server.js
pause
