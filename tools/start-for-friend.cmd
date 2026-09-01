@echo off
chcp 65001 >nul
REM 一键开服：游戏服务器 + 页面服务 + 公网隧道（三个窗口，玩完直接关）
cd /d "%~dp0.."
echo [1/3] 启动游戏服务器(3001)...
start "SELL OUT server" cmd /k "npm run dev:server"
timeout /t 4 >nul
echo [2/3] 启动页面服务(5173)...
start "SELL OUT client" cmd /k "npm run dev:client"
timeout /t 5 >nul
echo [3/3] 启动公网隧道(地址见下方,发给你朋友)...
cd tools
cloudflared.exe tunnel --url http://127.0.0.1:5173
pause
