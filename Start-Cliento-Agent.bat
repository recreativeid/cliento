@echo off
title cliento - Agen Chrome PC Lokal (http://127.0.0.1:43210)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js belum terpasang di komputer ini.
    echo Silakan instal Node.js LTS dari https://nodejs.org/ lalu jalankan file ini lagi.
    pause
    exit /b 1
)
node "scripts\cliento_local_agent.js"
pause
