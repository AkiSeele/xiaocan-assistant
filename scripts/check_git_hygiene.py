#!/usr/bin/env python3
"""
小蚕助手 Git 提交前质量与合规检查脚本 (Git Hygiene Checker)
运行方式: python scripts/check_git_hygiene.py
检查项:
1. 全项目 Emoji 字符扫描 (遵守全项目禁止 Emoji 规范)
2. 敏感数据与大文件扫描 (防止 .db、token 泄露或大型二进制文件误提交)
3. 后端代码编译检查 (compileall)
4. 前端类型检查与构建检查 (oxlint + vite build)
"""
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Emoji 与杂项表情 Unicode 范围正则
EMOJI_PATTERN = re.compile(
    r"[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]"
)

# 允许检查的代码与文档后缀
CHECK_EXTENSIONS = {".py", ".ts", ".tsx", ".md", ".json", ".html", ".css"}
IGNORE_DIRS = {"node_modules", "dist", ".git", "venv", ".venv", "tmp", "scratch", ".agents", ".cursor", ".gemini", ".trae"}


def check_emoji():
    print("[1/4] 正在扫描全项目代码与文档中的 Emoji 字符...")
    violations = []
    for path in ROOT.rglob("*"):
        if any(part in IGNORE_DIRS for part in path.parts):
            continue
        if path.suffix in CHECK_EXTENSIONS and path.is_file():
            try:
                content = path.read_text(encoding="utf-8", errors="ignore")
                matches = EMOJI_PATTERN.findall(content)
                if matches:
                    violations.append((path.relative_to(ROOT), len(matches)))
            except Exception:
                pass

    if violations:
        print("[警告] 发现以下文件包含 Emoji 字符 (请遵守 xiaocan-rules 规范，使用 Semi 图标或纯文本标签替换):")
        for file_path, count in violations:
            print(f"  - {file_path}: 发现 {count} 处")
        return False
    print("[通过] 未检测到任何 Emoji 字符。")
    return True


def check_large_or_sensitive_files():
    print("[2/4] 正在检查敏感数据与超大二进制文件...")
    violations = []
    # 通过 git status 检查暂存区与未忽略文件
    res = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=ROOT,
        capture_output=True,
        encoding="utf-8",
        errors="replace"
    )
    for line in res.stdout.splitlines():
        if not line.strip():
            continue
        status, file_str = line[:2], line[3:].strip()
        # 移除引号
        file_str = file_str.strip('"')
        target_path = ROOT / file_str
        if not target_path.exists():
            continue

        if file_str.endswith((".db", ".sqlite", ".sqlite3")) and not file_str.startswith("backend/data/.gitkeep"):
            violations.append(f"敏感数据库文件被变动检测: {file_str}")

        if target_path.is_file():
            size_mb = target_path.stat().st_size / (1024 * 1024)
            if size_mb > 10 and not file_str.endswith(".git"):
                violations.append(f"超大文件被变动检测 ({size_mb:.1f} MB): {file_str}")

    if violations:
        print("[警告] 发现潜在敏感数据或超大文件:")
        for item in violations:
            print(f"  - {item}")
        return False
    print("[通过] 未发现敏感数据库文件或超大体积提交。")
    return True


def check_backend_compilation():
    print("[3/4] 正在验证后端代码编译 (compileall)...")
    res = subprocess.run(
        [sys.executable, "-m", "compileall", "backend/app"],
        cwd=ROOT,
        capture_output=True,
        encoding="utf-8",
        errors="replace"
    )
    if res.returncode != 0:
        print("[失败] 后端存在语法错误:")
        print(res.stderr or res.stdout)
        return False
    print("[通过] 后端语法编译通过 (0 错误)。")
    return True


def check_frontend_build():
    print("[4/4] 正在验证前端类型与构建 (lint & build)...")
    frontend_dir = ROOT / "frontend"
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"

    # 1. lint
    lint_res = subprocess.run(
        [npm_cmd, "run", "lint"],
        cwd=frontend_dir,
        capture_output=True,
        encoding="utf-8",
        errors="replace"
    )
    if lint_res.returncode != 0:
        print("[失败] 前端 lint 检查未通过:")
        print(lint_res.stderr or lint_res.stdout)
        return False

    # 2. build
    build_res = subprocess.run(
        [npm_cmd, "run", "build"],
        cwd=frontend_dir,
        capture_output=True,
        encoding="utf-8",
        errors="replace"
    )
    if build_res.returncode != 0:
        print("[失败] 前端构建未通过:")
        print(build_res.stderr or build_res.stdout)
        return False

    print("[通过] 前端规范与构建检查通过。")
    return True


def main():
    print("=" * 60)
    print("小蚕助手开发合规检查工具 (Xiaocan Assistant Git Hygiene)")
    print("=" * 60)

    ok1 = check_emoji()
    ok2 = check_large_or_sensitive_files()
    ok3 = check_backend_compilation()
    ok4 = check_frontend_build()

    print("=" * 60)
    if ok1 and ok2 and ok3 and ok4:
        print("[全部通过] 当前工作区状态健康，符合开发规范，可以安全提交并推送。")
        sys.exit(0)
    else:
        print("[存在异常] 请根据上述提示修正后再执行提交。")
        sys.exit(1)


if __name__ == "__main__":
    main()
