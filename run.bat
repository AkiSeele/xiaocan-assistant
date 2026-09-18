@echo off
chcp 65001 >nul
title 小蚕小帮手 [XiaoCan Assistant]

echo ========================================================
echo   小蚕小帮手 [XiaoCan Assistant]
echo   前端技术栈: React 19 + 字节跳动 Semi Design
echo   后端技术栈: Python FastAPI + APScheduler
echo   授权状态: 本地全自动 · 无车位限制
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

:: 2. 检查前端打包产物
if exist "frontend\dist\index.html" goto :FRONTEND_READY

echo [*] 检测到前端静态资源尚未构建，准备自动安装依赖并执行打包...

where npm >nul 2>nul
if errorlevel 1 (
    echo [!] 未检测到 Node.js/npm 环境，请先安装 Node.js (推荐 v18 或更高版本) 并配置 PATH 环境变量
    echo [!] 官方下载地址: https://nodejs.org/
    pause
    exit /b 1
)

cd /d "%~dp0frontend"
if not exist "node_modules" (
    echo [*] 正在安装前端依赖 [npm install]...
    call npm install
    if errorlevel 1 (
        echo [!] 前端依赖安装失败，请检查网络连接后重试
        pause
        exit /b 1
    )
)

echo [*] 正在构建前端生产包 [npm run build]...
call npm run build
if errorlevel 1 (
    echo [!] 前端构建失败，请检查控制台错误信息
    pause
    exit /b 1
)
cd /d "%~dp0"

:FRONTEND_READY

echo [*] 正在启动服务 [端口 8690]...
echo [*] 本地访问地址: http://127.0.0.1:8690
echo [*] 按 Ctrl+C 可停止服务
echo.

:: 稍等 2 秒自动在浏览器中打开主页
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:8690"

cd /d "%~dp0backend"
venv\Scripts\python.exe main.py
if errorlevel 1 (
    echo.
    echo [!] 服务异常退出，请查看上方控制台报错详情
)
pause
