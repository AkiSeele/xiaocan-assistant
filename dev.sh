#!/usr/bin/env bash
# ============================================================
# 小蚕小帮手 (XiaoCan Assistant) - Linux / macOS 开发模式启动脚本
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================================"
echo "  小蚕小帮手 [XiaoCan Assistant] (开发模式)"
echo "========================================================"

export XIAOCAN_RELOAD=1
export PYTHONIOENCODING=utf-8

VENV_DIR="backend/venv"
VENV_PY="$VENV_DIR/bin/python"

if [ ! -f "$VENV_PY" ]; then
    echo "  [提示] 首次启动请先执行 ./run.sh 完成环境与依赖安装"
    bash ./run.sh
    exit 0
fi

cd backend
exec "$SCRIPT_DIR/$VENV_PY" main.py
