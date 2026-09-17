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

:: 2. 检查前端打包产物
if not exist "frontend\dist\index.html" (
    echo [*] 检测到前端静态资源尚未构建，正在自动安装前端依赖并执行打包...
    cd /d "%~dp0frontend"
    if not exist "node_modules" (
        echo [*] 正在安装前端依赖 (npm install)...
        call npm install
    )
    echo [*] 正在构建前端生产包 (npm run build)...
    call npm run build
    cd /d "%~dp0"
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
