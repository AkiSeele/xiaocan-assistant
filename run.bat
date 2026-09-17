@echo off
chcp 65001 >nul
title 小蚕会员助手 · 纯净自研版 (XiaoCan Assistant v2.0)

echo ========================================================
echo   小蚕会员助手 · 纯净自研版 (XiaoCan Assistant v2.0)
echo   前端技术栈: React 19 + 字节跳动 Semi Design
echo   后端技术栈: Python FastAPI + APScheduler
echo   授权状态: 纯净免付费 · 无车位限制 · 本地全自动
echo ========================================================
echo.

cd /d "%~dp0"

if not exist "backend\venv\Scripts\python.exe" (
    echo [*] 首次运行，正在创建 Python 虚拟环境...
    python -m venv backend\venv
    backend\venv\Scripts\pip.exe install -r backend\requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
)

echo [*] 正在启动服务 (端口 8690)...
echo [*] 本地访问地址: http://127.0.0.1:8690
echo [*] 按 Ctrl+C 可停止服务
echo.

:: 稍等 2 秒自动在浏览器中打开主页
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:8690"

cd backend
venv\Scripts\python.exe main.py
pause
