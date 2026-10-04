"""
小蚕小帮手启动辅助脚本 (仅依赖 Python 标准库)

由 run.bat / dev.bat 及 scripts/prepare_env.bat 自动调用，一般无需手动执行。

子命令:
  frontend-stale              判断前端是否需要重新构建
                              退出码 0 = 需要构建，1 = 已是最新
  open-when-ready URL [秒]    轮询 URL，服务可访问后自动打开默认浏览器
                              退出码 0 = 已打开，1 = 超时未就绪
"""
import os
import sys
import time
import urllib.error
import urllib.request
import webbrowser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND = os.path.join(ROOT, "frontend")

# 参与前端构建的源文件 / 目录，任意一项比构建产物新即判定需要重新构建
BUILD_INPUTS = [
    "src",
    "public",
    "index.html",
    "package.json",
    "package-lock.json",
    "vite.config.ts",
    "tsconfig.json",
    "tsconfig.app.json",
    "tsconfig.node.json",
]
SKIP_DIRS = {"node_modules", "dist", ".vite"}


def _latest_mtime(path: str) -> float:
    if os.path.isfile(path):
        return os.path.getmtime(path)
    newest = 0.0
    for dirpath, dirnames, filenames in os.walk(path):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            try:
                newest = max(newest, os.path.getmtime(os.path.join(dirpath, name)))
            except OSError:
                pass
    return newest


def frontend_stale() -> int:
    marker = os.path.join(FRONTEND, "dist", "index.html")
    if not os.path.isfile(marker):
        print("  前端页面尚未构建，需要执行首次构建")
        return 0

    built_at = os.path.getmtime(marker)
    for item in BUILD_INPUTS:
        path = os.path.join(FRONTEND, item)
        if os.path.exists(path) and _latest_mtime(path) > built_at:
            print(f"  检测到前端代码有更新 [{item}]，需要重新构建")
            return 0
    return 1


def open_when_ready(url: str, timeout: float) -> int:
    # 显式禁用系统代理，避免本机开启代理软件时请求 127.0.0.1 被转发
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with opener.open(url, timeout=2) as resp:
                if resp.status < 500:
                    webbrowser.open(url)
                    return 0
        except urllib.error.HTTPError as exc:
            if exc.code < 500:
                webbrowser.open(url)
                return 0
        except Exception:
            pass
        time.sleep(0.5)
    return 1


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2

    command = sys.argv[1]
    if command == "frontend-stale":
        return frontend_stale()
    if command == "open-when-ready":
        if len(sys.argv) < 3:
            return 2
        timeout = float(sys.argv[3]) if len(sys.argv) > 3 else 90.0
        return open_when_ready(sys.argv[2], timeout)

    print(f"未知子命令: {command}")
    return 2


if __name__ == "__main__":
    sys.exit(main())
