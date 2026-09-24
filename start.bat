@echo off
chcp 936 >nul
cd /d %~dp0
echo 正在启动 云山巨城 本地服务...
start "yunshan-server" cmd /c "python -m http.server 8141"
timeout /t 1 /nobreak >nul
start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" "http://127.0.0.1:8141"
echo 若浏览器未自动打开，请访问 http://127.0.0.1:8141
