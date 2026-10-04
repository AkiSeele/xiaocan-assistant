@echo off
rem ============================================================
rem  XiaoCan Assistant - shared environment bootstrap
rem  usage : call scripts\prepare_env.bat [build]
rem          build = also make sure frontend\dist is built and up to date
rem  exit  : 0 = ready, non-zero = failed (reason already printed)
rem  note  : no parenthesized blocks are used on purpose, so that
rem          Chinese text and brackets in echo can never break parsing
rem ============================================================
setlocal

for %%I in ("%~dp0..") do set "ROOT=%%~fI"
set "BACKEND=%ROOT%\backend"
set "FRONTEND=%ROOT%\frontend"
set "VENV_DIR=%BACKEND%\venv"
set "VENV_PY=%VENV_DIR%\Scripts\python.exe"
set "REQ=%BACKEND%\requirements.txt"
set "REQ_STAMP=%VENV_DIR%\.xiaocan_requirements.stamp"
set "LOCK=%FRONTEND%\package-lock.json"
set "LOCK_STAMP=%FRONTEND%\node_modules\.xiaocan_lock.stamp"
set "HELPER=%ROOT%\scripts\launcher_helper.py"
set "PIP_MIRROR=https://pypi.tuna.tsinghua.edu.cn/simple"
set "NPM_MIRROR=https://registry.npmmirror.com"
set "NPM_OFFICIAL=https://registry.npmjs.org"

set "WANT_BUILD=0"
if /i "%~1"=="build" set "WANT_BUILD=1"

set "PIP_DISABLE_PIP_VERSION_CHECK=1"
set "PYTHONIOENCODING=utf-8"
set "npm_config_fund=false"
set "npm_config_audit=false"
set "npm_config_update_notifier=false"

rem ============================================================
rem  [1/4] Python
rem ============================================================
echo.
echo [1/4] 检查 Python 运行环境
set "NEED_VENV=0"
if not exist "%VENV_PY%" goto :VENV_MISSING

"%VENV_PY%" -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>nul
if errorlevel 1 goto :VENV_BROKEN
for /f "delims=" %%v in ('call "%VENV_PY%" --version 2^>^&1') do set "PY_VER=%%v"
echo   [完成] 使用项目虚拟环境: %PY_VER%
goto :BACKEND_DEPS

:VENV_BROKEN
echo   [提示] 已有的 Python 虚拟环境不可用，可能是 Python 被卸载/升级或项目目录被移动过，将自动重建
:VENV_MISSING
set "NEED_VENV=1"

set "SYS_PY="
set "OLD_PY="
python -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 3)" >nul 2>nul
set "RC=%errorlevel%"
if "%RC%"=="0" set "SYS_PY=python"
if "%RC%"=="3" set "OLD_PY=python"
if defined SYS_PY goto :PY_FOUND

py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 3)" >nul 2>nul
set "RC=%errorlevel%"
if "%RC%"=="0" set "SYS_PY=py -3"
if "%RC%"=="3" if not defined OLD_PY set "OLD_PY=py -3"
if defined SYS_PY goto :PY_FOUND

if defined OLD_PY goto :ERR_PY_OLD
goto :ERR_PY_MISSING

:PY_FOUND
for /f "delims=" %%v in ('%SYS_PY% --version 2^>^&1') do set "PY_VER=%%v"
echo   [完成] 检测到系统 %PY_VER%

echo   正在创建项目专用的 Python 虚拟环境 [backend\venv]...
if exist "%VENV_DIR%" rmdir /s /q "%VENV_DIR%" >nul 2>nul
if exist "%VENV_DIR%" goto :ERR_VENV_LOCKED
%SYS_PY% -m venv "%VENV_DIR%"
if errorlevel 1 goto :ERR_VENV_CREATE
if not exist "%VENV_PY%" goto :ERR_VENV_CREATE
echo   [完成] 虚拟环境创建成功

rem ============================================================
rem  [2/4] Backend dependencies
rem ============================================================
:BACKEND_DEPS
echo.
echo [2/4] 检查后端依赖
if not exist "%REQ_STAMP%" goto :PIP_INSTALL
fc /b "%REQ%" "%REQ_STAMP%" >nul 2>nul
if errorlevel 1 goto :PIP_INSTALL
"%VENV_PY%" -c "import fastapi, uvicorn, httpx, apscheduler, pydantic, qrcode, cryptography" >nul 2>nul
if errorlevel 1 goto :PIP_INSTALL
echo   [完成] 后端依赖已是最新
goto :FRONTEND_STEP

:PIP_INSTALL
echo   正在安装后端依赖，首次安装大约需要 1-3 分钟，请耐心等待...
echo.
"%VENV_PY%" -m pip install -r "%REQ%" -i %PIP_MIRROR%
if not errorlevel 1 goto :PIP_OK
echo.
echo   [提示] 国内镜像源安装失败，正在改用 Python 官方源重试...
echo.
"%VENV_PY%" -m pip install -r "%REQ%"
if errorlevel 1 goto :ERR_PIP
:PIP_OK
copy /y "%REQ%" "%REQ_STAMP%" >nul
echo.
echo   [完成] 后端依赖安装成功

rem ============================================================
rem  [3/4] Frontend
rem ============================================================
:FRONTEND_STEP
echo.
echo [3/4] 检查前端页面
set "NEED_BUILD=1"
if "%WANT_BUILD%"=="0" goto :NODE_CHECK

"%VENV_PY%" "%HELPER%" frontend-stale
if errorlevel 1 set "NEED_BUILD=0"
if "%NEED_BUILD%"=="1" goto :NODE_CHECK
echo   [完成] 前端页面已是最新，无需重新构建
goto :ALL_DONE

:NODE_CHECK
set "NODE_STATE=missing"
where node >nul 2>nul
if errorlevel 1 goto :NODE_DECIDE
node -e "const v=process.versions.node.split('.').map(Number);process.exit((v[0]===20&&v[1]>=19)||(v[0]===22&&v[1]>=12)||v[0]>22?0:3)" >nul 2>nul
set "RC=%errorlevel%"
if "%RC%"=="0" set "NODE_STATE=ok"
if "%RC%"=="3" set "NODE_STATE=old"
if not "%NODE_STATE%"=="ok" goto :NODE_DECIDE
call npm -v >nul 2>nul
if errorlevel 1 set "NODE_STATE=missing"

:NODE_DECIDE
if "%NODE_STATE%"=="ok" goto :NODE_OK
rem 正式运行模式下，若已有旧版构建产物，则允许降级继续使用
if "%WANT_BUILD%"=="1" if exist "%FRONTEND%\dist\index.html" goto :WARN_USE_OLD_DIST
if "%NODE_STATE%"=="old" goto :ERR_NODE_OLD
goto :ERR_NODE_MISSING

:NODE_OK
for /f "delims=" %%v in ('node -v') do set "NODE_VER=%%v"
echo   [完成] 检测到 Node.js %NODE_VER%

if not exist "%FRONTEND%\node_modules" goto :NPM_INSTALL
if not exist "%LOCK_STAMP%" goto :NPM_INSTALL
fc /b "%LOCK%" "%LOCK_STAMP%" >nul 2>nul
if errorlevel 1 goto :NPM_INSTALL
echo   [完成] 前端依赖已是最新
goto :BUILD_STEP

:NPM_INSTALL
echo   正在安装前端依赖，首次安装大约需要 1-3 分钟，请耐心等待...
echo.
pushd "%FRONTEND%"
call npm ci --registry=%NPM_MIRROR%
set "RC=%errorlevel%"
if "%RC%"=="0" goto :NPM_INSTALLED
echo.
echo   [提示] 国内镜像源安装失败，正在改用 npm 官方源重试...
echo.
call npm ci --registry=%NPM_OFFICIAL%
set "RC=%errorlevel%"
:NPM_INSTALLED
popd
if not "%RC%"=="0" goto :ERR_NPM
copy /y "%LOCK%" "%LOCK_STAMP%" >nul
set "NEED_BUILD=1"
echo.
echo   [完成] 前端依赖安装成功

:BUILD_STEP
if "%WANT_BUILD%"=="0" goto :ALL_DONE
echo   正在构建前端页面，大约需要 10-30 秒...
echo.
pushd "%FRONTEND%"
call "%FRONTEND%\node_modules\.bin\vite.cmd" build
set "RC=%errorlevel%"
popd
if not "%RC%"=="0" goto :ERR_BUILD
if not exist "%FRONTEND%\dist\index.html" goto :ERR_BUILD
echo.
echo   [完成] 前端页面构建成功
goto :ALL_DONE

:WARN_USE_OLD_DIST
echo   [警告] 前端代码有更新，但未检测到可用的 Node.js 20.19 或更高版本，无法重新构建
echo   [警告] 本次将继续使用旧版页面，部分新功能可能无法显示
echo   [警告] 安装 Node.js 后重新双击 run.bat 即可自动更新页面，安装方法见 README.md

:ALL_DONE
exit /b 0

rem ============================================================
rem  Error messages
rem ============================================================
:ERR_PY_MISSING
echo.
echo   [错误] 未检测到 Python 3.10 或更高版本
echo   解决方法:
echo     1. 打开 https://www.python.org/downloads/ 下载 Python 3.12 安装包
echo     2. 安装界面第一页底部务必勾选 "Add python.exe to PATH"，再点击 Install Now
echo     3. 安装完成后关闭本窗口，重新双击启动脚本
echo   如果已经安装过仍然提示此错误:
echo     - 打开 Windows 设置 - 应用 - 高级应用设置 - 应用执行别名，
echo       关闭 "python.exe" 和 "python3.exe" 两个应用安装程序别名后重试
echo   详细步骤见 README.md 的「新手使用教程」章节
exit /b 1

:ERR_PY_OLD
for /f "delims=" %%v in ('%OLD_PY% --version 2^>^&1') do set "PY_VER=%%v"
echo.
echo   [错误] 当前 Python 版本过低: %PY_VER%，本项目需要 Python 3.10 或更高版本
echo   解决方法: 前往 https://www.python.org/downloads/ 安装 Python 3.12，
echo             安装时勾选 "Add python.exe to PATH"，然后重新双击启动脚本
exit /b 1

:ERR_VENV_LOCKED
echo.
echo   [错误] 无法删除旧的虚拟环境目录: %VENV_DIR%
echo   原因: 目录中的文件正被其他程序占用，通常是另一个小蚕小帮手窗口仍在运行
echo   解决方法: 关闭所有小蚕小帮手窗口后重新双击启动脚本；
echo             如仍失败，可手动删除 backend\venv 文件夹后再试
exit /b 1

:ERR_VENV_CREATE
echo.
echo   [错误] Python 虚拟环境创建失败
echo   解决方法:
echo     1. 确认 Python 是从 python.org 官方安装包安装的，而不是精简版或 Microsoft Store 版本
echo     2. 若项目放在了受保护目录，如 C:\Program Files，请移动到桌面或 D 盘等普通目录
echo     3. 处理后重新双击启动脚本
exit /b 1

:ERR_PIP
echo.
echo   [错误] 后端依赖安装失败
echo   常见原因与解决方法:
echo     1. 网络不通或被代理软件拦截: 检查网络连接，或暂时关闭代理/VPN 后重试
echo     2. Python 版本过新导致部分依赖暂无安装包: 建议改装 Python 3.12
echo     3. 处理后重新双击启动脚本即可，已下载的部分不会重复下载
echo   请将上方红色或 ERROR 开头的报错内容截图，便于排查问题
exit /b 1

:ERR_NODE_MISSING
echo.
echo   [错误] 未检测到 Node.js，首次运行需要它来生成网页界面
echo   解决方法:
echo     1. 打开 https://nodejs.org/zh-cn/download 下载 LTS 长期支持版并安装，全部保持默认选项即可
echo     2. 安装完成后关闭本窗口，重新双击启动脚本
echo   详细步骤见 README.md 的「新手使用教程」章节
exit /b 1

:ERR_NODE_OLD
for /f "delims=" %%v in ('node -v 2^>nul') do set "NODE_VER=%%v"
echo.
echo   [错误] 当前 Node.js 版本过低: %NODE_VER%，本项目需要 20.19 或 22.12 及以上版本
echo   解决方法: 前往 https://nodejs.org/zh-cn/download 下载最新 LTS 版本覆盖安装，然后重新双击启动脚本
exit /b 1

:ERR_NPM
echo.
echo   [错误] 前端依赖安装失败
echo   常见原因与解决方法:
echo     1. 网络不通或被代理软件拦截: 检查网络连接，或暂时关闭代理/VPN 后重试
echo     2. 文件被占用: 关闭正在运行的小蚕小帮手窗口和代码编辑器后重试
echo     3. 仍然失败时，可手动删除 frontend\node_modules 文件夹后重新双击启动脚本
echo   请将上方 npm ERR 开头的报错内容截图，便于排查问题
exit /b 1

:ERR_BUILD
echo.
echo   [错误] 前端页面构建失败
echo   解决方法:
echo     1. 删除 frontend\node_modules 文件夹后重新双击启动脚本，让程序重新安装依赖
echo     2. 若仍失败，请将上方报错内容截图并反馈
exit /b 1
