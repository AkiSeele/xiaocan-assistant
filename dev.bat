@echo off
chcp 65001 >nul
title 小蚕小帮手 [前后端双热加载开发模式]

echo ========================================================
echo   小蚕小帮手 [双热加载开发模式]
echo   前端服务: http://127.0.0.1:5173 (Vite HMR)
echo   后端服务: http://127.0.0.1:8690 (FastAPI Reload)
echo ========================================================
echo.

cd /d "%~dp0"

:: 1. 检查 Python 运行环境
if exist "backend\venv\Scripts\python.exe" goto :VENV_READY

where python >nul 2>nul
if errorlevel 1 (
    echo [!] 未检测到系统 Python 环境，请确保已安装 Python 3.10 或更高版本并加入环境变量 PATH
    echo [!] 官方下载地址: https://www.python.org/downloads/
    pause
    exit /b 1
)

echo [*] 首次运行，正在创建 Python 虚拟环境...
python -m venv backend\venv
if errorlevel 1 (
    echo [!] Python 虚拟环境创建失败，请确保系统已安装 Python 3.10 或更高版本并加入环境变量 PATH
    pause
    exit /b 1
)

echo [*] 正在安装后端依赖...
backend\venv\Scripts\pip.exe install -r backend\requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
if errorlevel 1 (
    echo [!] 后端依赖安装失败，请检查网络连接后重试
    pause
    exit /b 1
)

:VENV_READY

:: 2. 检查前端依赖
if exist "frontend\node_modules" goto :FRONTEND_READY

where npm >nul 2>nul
if errorlevel 1 (
    echo [!] 未检测到 Node.js/npm 环境，请先安装 Node.js (推荐 v18 或更高版本) 并配置 PATH 环境变量
    echo [!] 官方下载地址: https://nodejs.org/
    pause
    exit /b 1
)

echo [*] 首次运行，检测到前端依赖未安装，正在安装 [npm install]...
cd /d "%~dp0frontend"
call npm install
if errorlevel 1 (
    echo [!] 前端依赖安装失败，请检查网络连接后重试
    pause
    exit /b 1
)
cd /d "%~dp0"

:FRONTEND_READY

echo [*] 正在启动后端服务 8690...
start "小蚕后端-FastAPI" cmd /k "cd /d %~dp0backend && venv\Scripts\python.exe main.py"

echo [*] 正在启动前端开发服务 5173...
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://127.0.0.1:5173"

cd /d "%~dp0frontend"
call npm run dev -- --host 127.0.0.1 --port 5173
if errorlevel 1 (
    echo.
    echo [!] 前端开发服务异常退出
)
pause
