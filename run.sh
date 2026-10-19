#!/usr/bin/env bash
# ============================================================
# 小蚕小帮手 (XiaoCan Assistant) - Linux / macOS 一键启动脚本
# 本地离线 · 数据仅存本机 · 零门槛无车位限制
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================================"
echo "  小蚕小帮手 [XiaoCan Assistant]"
echo "  本地运行 · 数据仅保存在本机 · 无车位限制"
echo "========================================================"

# ---- 0. 项目文件完整性检查 ----
if [ ! -f "backend/main.py" ] || [ ! -f "backend/requirements.txt" ] || [ ! -f "frontend/package.json" ]; then
    echo "  [错误] 项目文件不完整，缺少 backend 或 frontend 目录中的关键文件"
    exit 1
fi

# ---- 1. 寻找 Python 3 环境 (>= 3.10) ----
PYTHON_CMD=""
for cmd in python3 python; do
    if command -v "$cmd" >/dev/null 2>&1; then
        VER_OK=$("$cmd" -c "import sys; print(1 if sys.version_info >= (3, 10) else 0)" 2>/dev/null || echo 0)
        if [ "$VER_OK" = "1" ]; then
            PYTHON_CMD="$cmd"
            break
        fi
    fi
done

if [ -z "$PYTHON_CMD" ]; then
    echo "  [错误] 未检测到 Python 3.10+ 环境，请先安装 Python 3.10 或更高版本"
    exit 1
fi

# ---- 2. 寻找 Node.js 环境 (>= 18) ----
NODE_CMD=""
for cmd in node /usr/local/bin/node /opt/homebrew/bin/node; do
    if [ -x "$cmd" ] || command -v "$cmd" >/dev/null 2>&1; then
        NODE_VER=$("$cmd" -v 2>/dev/null || echo "")
        if [ -n "$NODE_VER" ]; then
            NODE_MAJOR=$(echo "$NODE_VER" | sed 's/^v//' | cut -d. -f1)
            if [ "$NODE_MAJOR" -ge 18 ] 2>/dev/null; then
                NODE_CMD="$cmd"
                break
            fi
        fi
    fi
done

if [ -z "$NODE_CMD" ]; then
    echo "  [警告] 未检测到 Node.js 18+ 环境，美团扫码与领券功能可能受限"
    echo "  建议通过 nvm、Homebrew 或系统包管理器安装 Node.js 18+"
fi

# ---- 3. 端口占用检查 (8690) ----
PORT_IN_USE=$("$PYTHON_CMD" -c "
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
try:
    s.bind(('127.0.0.1', 8690))
    s.close()
    print(0)
except Exception:
    print(1)
")

if [ "$PORT_IN_USE" = "1" ]; then
    echo "  [提示] 8690 端口已被占用，小蚕小帮手可能已经在运行中"
    echo "  正在尝试打开浏览器: http://127.0.0.1:8690"
    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "http://127.0.0.1:8690" >/dev/null 2>&1 &
    elif command -v open >/dev/null 2>&1; then
        open "http://127.0.0.1:8690" >/dev/null 2>&1 &
    fi
    exit 0
fi

# ---- 4. Python 虚拟环境与依赖就绪 ----
VENV_DIR="backend/venv"
VENV_PY="$VENV_DIR/bin/python"

if [ ! -f "$VENV_PY" ]; then
    echo "  [1/3] 正在创建 Python 虚拟环境 ($VENV_DIR) ..."
    "$PYTHON_CMD" -m venv "$VENV_DIR"
fi

echo "  [2/3] 正在同步安装后端依赖 ..."
"$VENV_PY" -m pip install --upgrade pip -q -i https://pypi.tuna.tsinghua.edu.cn/simple 2>/dev/null || true
"$VENV_PY" -m pip install -r backend/requirements.txt -q -i https://pypi.tuna.tsinghua.edu.cn/simple

# ---- 5. 前端构建检查 ----
NEED_BUILD=0
if [ ! -f "frontend/dist/index.html" ]; then
    NEED_BUILD=1
else
    NEED_BUILD=$("$VENV_PY" scripts/launcher_helper.py frontend-stale >/dev/null 2>&1 && echo 0 || echo 1)
fi

if [ "$NEED_BUILD" = "1" ]; then
    echo "  [3/3] 正在构建前端界面 (frontend) ..."
    cd frontend
    if [ ! -d "node_modules" ]; then
        npm install --registry=https://registry.npmmirror.com
    fi
    npm run build
    cd "$SCRIPT_DIR"
fi

# ---- 6. 启动后端并打开浏览器 ----
echo ""
echo "========================================================"
echo "  访问地址: http://127.0.0.1:8690"
echo "  服务就绪后将自动打开浏览器"
echo "  按 Ctrl+C 即可安全停止服务"
echo "========================================================"
echo ""

export XIAOCAN_RELOAD=0
export PYTHONIOENCODING=utf-8

"$VENV_PY" scripts/launcher_helper.py open-when-ready http://127.0.0.1:8690 120 >/dev/null 2>&1 &

cd backend
exec "$SCRIPT_DIR/$VENV_PY" main.py
