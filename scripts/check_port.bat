@echo off
rem ============================================================
rem  XiaoCan Assistant - port occupancy check
rem  usage : call scripts\check_port.bat <port>
rem  exit  : 0 = free, 1 = used by XiaoCan itself, 2 = used by other program
rem ============================================================
setlocal
set "PORT=%~1"
set "PID="
set "PNAME=未知程序"

for /f "tokens=5" %%p in ('netstat -ano -p TCP 2^>nul ^| findstr /c:":%PORT% " ^| findstr /c:"LISTENING"') do if not defined PID set "PID=%%p"
if not defined PID exit /b 0

rem 若占用者正是小蚕小帮手本身 (健康检查接口可访问)，返回 1
where curl.exe >nul 2>nul
if errorlevel 1 goto :BUSY
curl.exe -s -m 3 --noproxy "*" "http://127.0.0.1:%PORT%/health" 2>nul | findstr /c:"xiaocan-assistant" >nul 2>nul
if not errorlevel 1 exit /b 1

:BUSY
for /f "tokens=1 delims=," %%n in ('tasklist /fi "PID eq %PID%" /fo csv /nh 2^>nul') do set "PNAME=%%~n"
echo.
echo   [错误] 端口 %PORT% 已被其他程序占用: %PNAME% [PID %PID%]
echo   解决方法:
echo     1. 如果是之前打开的小蚕小帮手窗口，请先关闭那个窗口
echo     2. 或者以管理员身份打开命令提示符，执行下面的命令结束该进程:
echo          taskkill /PID %PID% /F
echo     3. 处理完成后重新双击启动脚本
exit /b 2
