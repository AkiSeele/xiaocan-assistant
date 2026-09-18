@echo off
chcp 65001 >nul
title 小蚕小帮手 · 前后端双热加载开发模式

echo ========================================================
echo   小蚕小帮手 · 双热加载开发模式
echo   前端服务: http://127.0.0.1:5173 (Vite HMR)
echo   后端服务: http://127.0.0.1:8690 (FastAPI Reload)
echo ========================================================
echo.

cd /d "%~dp0"

:: 1. 检查 Python 运行环境
if not exist "backend\venv\Scripts\python.exe" (
    echo [*] 首次运行，正在创建 Python 虚拟环境...
    python -m venv backend\venv
    if errorlevel 1 (
        echo [!] Python 虚拟环境创建失败，请确保系统已安装 Python 3.10 或更高版本并加入环境变量 PATH
        pause
        exit /b 1
    )
    echo [*] 正在安装后端依赖...
    backend\venv\Scripts\pip.exe install -r backend\requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
)

:: 2. 检查前端依赖
if not exist "frontend\node_modules" (
    echo [*] 首次运行，检测到前端依赖未安装，正在安装 (npm install)...
    cd /d "%~dp0frontend"
    call npm install
    cd /d "%~dp0"
)

echo [*] 正在启动后端服务 8690...
start "小蚕后端-FastAPI" cmd /k "cd /d %~dp0backend && venv\Scripts\python.exe main.py"

echo [*] 正在启动前端开发服务 5173...
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://127.0.0.1:5173"

cd /d "%~dp0frontend"
call npm run dev -- --host 127.0.0.1 --port 5173
pause
