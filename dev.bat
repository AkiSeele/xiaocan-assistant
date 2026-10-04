@echo off
rem ============================================================
rem  XiaoCan Assistant - developer mode
rem  backend : http://127.0.0.1:8690 (FastAPI hot reload, own window)
rem  frontend: http://127.0.0.1:5173 (Vite HMR, this window)
rem ============================================================
setlocal
if /i "%~1"=="--inner" goto :MAIN
if /i "%~1"=="--backend" goto :BACKEND

chcp 65001 >nul
title 小蚕小帮手 [前后端双热加载开发模式]
cmd /d /c ""%~f0" --inner"
set "XC_RC=%errorlevel%"
echo.
echo ========================================================
if "%XC_RC%"=="0" goto :OUTER_OK
echo   [失败] 开发模式未能正常运行，错误码 %XC_RC%，请根据上方 [错误] 提示处理
goto :OUTER_END
:OUTER_OK
echo   前端开发服务已停止，后端窗口需单独关闭
:OUTER_END
echo ========================================================
echo   按任意键关闭此窗口...
pause >nul
exit /b %XC_RC%


:MAIN
cd /d "%~dp0"
echo ========================================================
echo   小蚕小帮手 [双热加载开发模式]
echo   前端服务: http://127.0.0.1:5173 [Vite HMR]
echo   后端服务: http://127.0.0.1:8690 [FastAPI Reload]
echo ========================================================

if not exist "backend\main.py" goto :ERR_INCOMPLETE
if not exist "frontend\package.json" goto :ERR_INCOMPLETE
if not exist "scripts\prepare_env.bat" goto :ERR_INCOMPLETE

call "%~dp0scripts\check_port.bat" 8690
if errorlevel 2 exit /b 1
if errorlevel 1 goto :ERR_BACKEND_RUNNING
call "%~dp0scripts\check_port.bat" 5173
if errorlevel 1 exit /b 1

call "%~dp0scripts\prepare_env.bat"
if errorlevel 1 exit /b 1

echo.
echo [4/4] 启动开发服务
echo   正在新窗口中启动后端服务 8690...
start "小蚕后端 [FastAPI 热重载]" cmd /d /c ""%~f0" --backend"

echo   正在启动前端开发服务 5173...
start "" "%~dp0backend\venv\Scripts\pythonw.exe" "%~dp0scripts\launcher_helper.py" open-when-ready http://127.0.0.1:5173 120
echo.

cd /d "%~dp0frontend"
call npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
set "RC=%errorlevel%"
if "%RC%"=="0" exit /b 0
if "%RC%"=="-1073741510" exit /b 0
if "%RC%"=="3221225786" exit /b 0
echo.
echo   [错误] 前端开发服务异常退出，错误码 %RC%
exit /b %RC%


:BACKEND
chcp 65001 >nul
cd /d "%~dp0backend"
set "XIAOCAN_RELOAD=1"
set "PYTHONIOENCODING=utf-8"
"%~dp0backend\venv\Scripts\python.exe" main.py
echo.
echo   [提示] 后端服务已退出，错误码 %errorlevel%，按任意键关闭此窗口...
pause >nul
exit /b 0


:ERR_BACKEND_RUNNING
echo.
echo   [错误] 端口 8690 上已有小蚕小帮手在运行，通常是 run.bat 窗口未关闭
echo   开发模式需要启动带热重载的后端，请先关闭该窗口后重新双击 dev.bat
exit /b 1

:ERR_INCOMPLETE
echo.
echo   [错误] 项目文件不完整，请先完整解压或重新 git clone 后再运行
exit /b 1
