@echo off
rem ============================================================
rem  XiaoCan Assistant - one-click launcher for normal users
rem  The script re-launches itself in a child cmd, so whatever
rem  happens inside (error, crash, Ctrl+C), this outer window
rem  always stays open and shows the result.
rem ============================================================
setlocal
if /i "%~1"=="--inner" goto :MAIN

chcp 65001 >nul
title 小蚕小帮手 [XiaoCan Assistant]
cmd /d /c ""%~f0" --inner"
set "XC_RC=%errorlevel%"
echo.
echo ========================================================
if "%XC_RC%"=="0" goto :OUTER_OK
echo   [失败] 小蚕小帮手未能正常运行，错误码 %XC_RC%
echo   请根据上方 [错误] 提示处理后重新双击 run.bat，
echo   或查阅 README.md 中的「常见问题」章节
goto :OUTER_END
:OUTER_OK
echo   小蚕小帮手已停止运行
:OUTER_END
echo ========================================================
echo   按任意键关闭此窗口...
pause >nul
exit /b %XC_RC%


:MAIN
cd /d "%~dp0"
echo ========================================================
echo   小蚕小帮手 [XiaoCan Assistant]
echo   本地运行 · 数据仅保存在本机 · 无车位限制
echo ========================================================
echo   首次运行会自动安装依赖，大约需要 3-5 分钟，请勿关闭窗口
echo   之后每次启动只需几秒钟

rem ---- 0. 项目文件完整性 ----
if not exist "backend\main.py" goto :ERR_INCOMPLETE
if not exist "backend\requirements.txt" goto :ERR_INCOMPLETE
if not exist "frontend\package.json" goto :ERR_INCOMPLETE
if not exist "scripts\prepare_env.bat" goto :ERR_INCOMPLETE

rem ---- 0. 端口检查 ----
call "%~dp0scripts\check_port.bat" 8690
if errorlevel 2 exit /b 1
if errorlevel 1 goto :ALREADY_RUNNING

rem ---- 1-3. 环境与依赖 ----
call "%~dp0scripts\prepare_env.bat" build
if errorlevel 1 exit /b 1

rem ---- 4. 启动服务 ----
echo.
echo [4/4] 启动服务
echo ========================================================
echo   访问地址: http://127.0.0.1:8690
echo   服务就绪后将自动打开浏览器
echo   使用期间请保持本窗口打开，关闭窗口或按 Ctrl+C 即可停止服务
echo ========================================================
echo.

set "XIAOCAN_RELOAD=0"
set "PYTHONIOENCODING=utf-8"
start "" "%~dp0backend\venv\Scripts\pythonw.exe" "%~dp0scripts\launcher_helper.py" open-when-ready http://127.0.0.1:8690 120

cd /d "%~dp0backend"
"%~dp0backend\venv\Scripts\python.exe" main.py
set "RC=%errorlevel%"
rem 0 = 正常退出，-1073741510 / 3221225786 = Ctrl+C 终止
if "%RC%"=="0" exit /b 0
if "%RC%"=="-1073741510" exit /b 0
if "%RC%"=="3221225786" exit /b 0
echo.
echo   [错误] 后端服务异常退出，错误码 %RC%
echo   请查看上方 Traceback 或 ERROR 开头的报错信息
echo   如提示缺少模块 ModuleNotFoundError，可删除 backend\venv 文件夹后重新双击 run.bat
exit /b %RC%


:ALREADY_RUNNING
echo.
echo   [提示] 小蚕小帮手已经在运行中，正在打开浏览器: http://127.0.0.1:8690
echo   如需重启或更新，请先关闭原来的运行窗口，再重新双击 run.bat
start "" "http://127.0.0.1:8690"
exit /b 0

:ERR_INCOMPLETE
echo.
echo   [错误] 项目文件不完整，缺少 backend、frontend 或 scripts 目录中的文件
echo   可能原因:
echo     1. 直接在压缩包里双击了 run.bat: 请先把压缩包完整解压到一个文件夹，再双击解压后的 run.bat
echo     2. 代码下载不完整: 请重新下载或重新执行 git clone
exit /b 1
