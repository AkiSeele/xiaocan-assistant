[CmdletBinding()]
param(
    [string]$Serial = "",
    [switch]$SkipBuild,
    [int]$Port = 39691
)

$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$BackendDir = Join-Path $ProjectRoot "backend"
$FrontendDir = Join-Path $ProjectRoot "frontend"
$VenvPython = Join-Path $BackendDir "venv\Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    $VenvPython = "python"
}

function Find-AdbExecutable {
    $cmd = Get-Command adb -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source) {
        return $cmd.Source
    }
    $candidates = @(
        "C:\platform-tools\adb.exe",
        (Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"),
        (Join-Path $env:USERPROFILE "platform-tools\adb.exe")
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path $candidate)) {
            return $candidate
        }
    }
    return $null
}

Write-Host "========================================================"
Write-Host "  XiaoCan Assistant Termux One-Click Sync Tool"
Write-Host "========================================================"

Write-Host ""
Write-Host "[1/6] Locating ADB and checking connected devices..."
$AdbExe = Find-AdbExecutable
if (-not $AdbExe) {
    Write-Error "[失败] 未找到 adb.exe，请安装 Android Platform-Tools 或将其加入 PATH（默认检查 C:\platform-tools\adb.exe）。"
    exit 1
}
Write-Host "  [完成] ADB: $AdbExe"

$rawDevices = & $AdbExe devices
$onlineSerials = @()
foreach ($line in $rawDevices) {
    if ($line -match "^([^\s]+)\s+device$") {
        $onlineSerials += $Matches[1]
    }
}

if ($onlineSerials.Count -eq 0) {
    Write-Error "[失败] 未检测到在线的 USB 调试设备，请检查数据线连接与手机 USB 调试授权状态。"
    exit 1
}

if ([string]::IsNullOrWhiteSpace($Serial)) {
    if ($onlineSerials.Count -gt 1) {
        Write-Host "  检测到多台在线设备，请使用 -Serial 指定目标设备:" -ForegroundColor Yellow
        foreach ($s in $onlineSerials) {
            Write-Host "    - $s"
        }
        exit 1
    }
    $Serial = $onlineSerials[0]
}
elseif ($onlineSerials -notcontains $Serial) {
    Write-Error "[失败] 指定设备 $Serial 未处于在线 (device) 状态。当前在线设备: $($onlineSerials -join ', ')"
    exit 1
}
Write-Host "  [完成] 目标设备: $Serial"

Write-Host ""
Write-Host "[2/6] Running backend compile check & frontend build..."
Push-Location $ProjectRoot
try {
    & $VenvPython -m compileall -q backend\app
    if ($LASTEXITCODE -ne 0) {
        throw "后端 Python 编译检查失败 (compileall 退出码 $LASTEXITCODE)"
    }
    Write-Host "  [完成] 后端语法检查通过 (backend\app)"

    if (-not $SkipBuild) {
        $npmCmd = "npm.cmd"
        & $npmCmd --prefix frontend run lint
        if ($LASTEXITCODE -ne 0) {
            throw "前端 ESLint 检查失败 (退出码 $LASTEXITCODE)"
        }
        & $npmCmd --prefix frontend run build
        if ($LASTEXITCODE -ne 0) {
            throw "前端 Vite 构建失败 (退出码 $LASTEXITCODE)"
        }
        Write-Host "  [完成] 前端 Lint 与 Build 已通过"
    }
    else {
        Write-Host "  [跳过] 已指定 -SkipBuild，直接复用现有 frontend\dist 产物"
    }

    $DistIndex = Join-Path $FrontendDir "dist\index.html"
    if (-not (Test-Path $DistIndex)) {
        throw "缺少前端构建产物: $DistIndex"
    }
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "[3/6] Creating clean sync archive (excluding __pycache__, *.pyc, backend/data)..."
$ArchivePath = Join-Path $env:TEMP ("xiaocan_sync_" + [DateTime]::Now.ToString("yyyyMMdd_HHmmss") + ".tar.gz")
$PackageScript = @'
import os
import sys
import tarfile

root_dir = sys.argv[1]
out_tar = sys.argv[2]

def _should_skip(rel_path: str) -> bool:
    parts = rel_path.replace("\\", "/").split("/")
    if "__pycache__" in parts:
        return True
    name = parts[-1]
    if name.endswith((".pyc", ".pyo", ".db", ".db-shm", ".db-wal")):
        return True
    return False

count = 0
with tarfile.open(out_tar, "w:gz") as tf:
    for sub in ("backend/app", "frontend/dist"):
        base = os.path.join(root_dir, sub.replace("/", os.sep))
        if not os.path.exists(base):
            raise FileNotFoundError(f"Missing directory: {base}")
        for cur_root, dirs, files in os.walk(base):
            dirs[:] = [d for d in dirs if d != "__pycache__"]
            for fname in files:
                full = os.path.join(cur_root, fname)
                rel = os.path.relpath(full, root_dir).replace("\\", "/")
                if _should_skip(rel):
                    continue
                tf.add(full, arcname=rel)
                count += 1

print(f"PACKAGED_FILES={count}")
'@

$TmpPy = Join-Path $env:TEMP ("xiaocan_pack_" + [DateTime]::Now.ToString("yyyyMMdd_HHmmss") + ".py")
try {
    [System.IO.File]::WriteAllText($TmpPy, $PackageScript, [System.Text.UTF8Encoding]::new($false))
    $packOut = & $VenvPython $TmpPy $ProjectRoot $ArchivePath
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $ArchivePath)) {
        throw "打包部署归档失败"
    }
    $sizeKb = [Math]::Round(((Get-Item $ArchivePath).Length / 1KB), 1)
    Write-Host "  [完成] 归档创建成功: $ArchivePath (${sizeKb} KB, $packOut)"

    Write-Host ""
    Write-Host "[4/6] Pushing archive to device and extracting safely..."
    $RemoteTmp = "/data/local/tmp/xiaocan_sync.tar.gz"
    & $AdbExe -s $Serial push $ArchivePath $RemoteTmp
    if ($LASTEXITCODE -ne 0) {
        throw "adb push 失败 (退出码 $LASTEXITCODE)"
    }

    function Invoke-TermuxShell([string]$UnixScript) {
        $Normalized = $UnixScript -replace "`r`n", "`n"
        $B64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($Normalized))
        $RemoteCmd = "run-as com.termux /data/data/com.termux/files/usr/bin/sh -c 'echo $B64 | /data/data/com.termux/files/usr/bin/base64 -d | /data/data/com.termux/files/usr/bin/sh'"
        & $AdbExe -s $Serial shell $RemoteCmd
        $script:TermuxExitCode = $LASTEXITCODE
    }

    $ExtractScript = @'
set -e
TARGET=/data/data/com.termux/files/home/xiaocan-assistant
if [ ! -d "$TARGET" ]; then
  echo "MISSING_TARGET_DIR:$TARGET"
  exit 2
fi
rm -rf "$TARGET/frontend/dist/assets"
find "$TARGET/backend/app" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
tar -xzf /data/local/tmp/xiaocan_sync.tar.gz -C "$TARGET"
echo EXTRACT_OK
'@
    $extractOut = Invoke-TermuxShell $ExtractScript
    $extractRc = $script:TermuxExitCode
    & $AdbExe -s $Serial shell "rm -f /data/local/tmp/xiaocan_sync.tar.gz" | Out-Null
    if ($extractRc -ne 0 -or -not (($extractOut -join "`n") -match "EXTRACT_OK")) {
        throw "Termux 解压失败: $($extractOut -join "`n")"
    }
    Write-Host "  [完成] 已增量覆盖 backend/app 与 frontend/dist（完整保留手机端 backend/data 数据库）"

    Write-Host ""
    Write-Host "[5/6] Restarting core service on port :$Port only..."
    $RestartScript = (@'
export PATH=/data/data/com.termux/files/usr/bin:$PATH
pkill -f "uvicorn backend\.main:app.*__PORT__" 2>/dev/null || true
i=0
while [ $i -lt 10 ]; do
  if ! pgrep -f "uvicorn backend\.main:app.*__PORT__" >/dev/null 2>&1; then
    break
  fi
  sleep 1
  i=$((i+1))
done
if [ ! -x /data/data/com.termux/files/home/xiaocan_start.sh ]; then
  echo "MISSING_START_SCRIPT"
  exit 3
fi
/data/data/com.termux/files/home/xiaocan_start.sh
'@).Replace("__PORT__", [string]$Port)
    $restartOut = Invoke-TermuxShell $RestartScript
    $restartRc = $script:TermuxExitCode
    Write-Host ($restartOut -join "`n")
    if ($restartRc -ne 0) {
        throw "重启小蚕核心服务失败 (退出码 $restartRc)"
    }

    Write-Host ""
    Write-Host "[6/6] Verifying http://127.0.0.1:$Port/health and inspecting logs..."
    $VerifyScript = (@'
export PATH=/data/data/com.termux/files/usr/bin:$PATH
HEALTH=""
i=0
while [ $i -lt 15 ]; do
  HEALTH=$(curl -s -m 2 "http://127.0.0.1:__PORT__/health" 2>/dev/null || true)
  if echo "$HEALTH" | grep -q '"status":"ok"'; then
    break
  fi
  sleep 1
  i=$((i+1))
done
echo "HEALTH_RESPONSE=$HEALTH"
echo "--- LOG TAIL ---"
tail -n 20 /data/data/com.termux/files/home/xiaocan.log 2>/dev/null || true
if ! echo "$HEALTH" | grep -q '"status":"ok"'; then
  exit 4
fi
'@).Replace("__PORT__", [string]$Port)
    $verifyOut = Invoke-TermuxShell $VerifyScript
    $verifyRc = $script:TermuxExitCode
    Write-Host ($verifyOut -join "`n")
    if ($verifyRc -ne 0) {
        throw "健康检查失败，请核对上方 xiaocan.log 日志输出"
    }

    Write-Host ""
    Write-Host "========================================================"
    Write-Host "  [成功] 手机端 Termux 代码同步与热重启验证通过 (:$Port)"
    Write-Host "========================================================"
}
finally {
    if (Test-Path $TmpPy) { Remove-Item -Force $TmpPy -ErrorAction SilentlyContinue }
    if (Test-Path $ArchivePath) { Remove-Item -Force $ArchivePath -ErrorAction SilentlyContinue }
}
