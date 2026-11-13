@echo off
rem ============================================================
rem  XiaoCan Assistant - One-Click Termux Phone Sync Wrapper
rem  Forwards optional args such as -SkipBuild or -Serial <id>
rem ============================================================
setlocal
if /i "%~1"=="--inner" goto :MAIN

chcp 65001 >nul
title 小蚕小帮手 [手机端 Termux 一键同步]
cmd /d /c ""%~f0" --inner %*"
set "SYNC_RC=%errorlevel%"
echo.
echo ========================================================
if "%SYNC_RC%"=="0" goto :OUTER_OK
echo   [失败] 手机端同步未能完成，错误码 %SYNC_RC%
echo   请根据上方错误提示检查设备连接、构建或端口日志
goto :OUTER_END
:OUTER_OK
echo   [完成] 手机端同步与服务健康检查已全部通过
:OUTER_END
echo ========================================================
echo   按任意键关闭此窗口...
pause >nul
exit /b %SYNC_RC%

:MAIN
shift
cd /d "%~dp0"
set "PS_ARGS="
:ARG_LOOP
if "%~1"=="" goto :RUN_PS
set "PS_ARGS=%PS_ARGS% %1"
shift
goto :ARG_LOOP

:RUN_PS
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\sync_phone_termux.ps1" %PS_ARGS%
exit /b %errorlevel%
