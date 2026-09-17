@echo off
chcp 65001 >nul
title 小蚕助手 · 前后端双热加载开发模式

echo ========================================================
echo   小蚕会员助手 · 双热加载开发模式
echo   前端服务: http://127.0.0.1:5173 (Vite HMR)
echo   后端服务: http://127.0.0.1:8690 (FastAPI Reload)
echo ========================================================
echo.

cd /d "%~dp0"

if not exist "backend\venv\Scripts\python.exe" (
    echo [*] 首次运行，正在创建 Python 虚拟环境...
    python -m venv backend\venv
    backend\venv\Scripts\pip.exe install -r backend\requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
)

echo [*] 正在启动后端服务 8690...
start "小蚕后端-FastAPI" cmd /k "cd /d %~dp0backend && venv\Scripts\python.exe main.py"

echo [*] 正在启动前端开发服务 5173...
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://127.0.0.1:5173"

cd /d "%~dp0frontend"
call npm run dev -- --host 127.0.0.1 --port 5173
pause
