"""
小蚕助手 - 美团执行器 (Meituan Runner)
负责调用本地 run.js 与 pt-passport，提供二维码生成、状态轮询、Token 激活与发券接口调用。
严禁使用 Emoji。
"""

import base64
import io
import json
import logging
import os
import shutil
import subprocess
import sys
import threading
import time
import uuid
from typing import Any, Dict, List, Optional

import qrcode

from ..models import database as db

logger = logging.getLogger("meituan.runner")

# 路径常量
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ASSETS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
RUN_JS = os.path.join(ASSETS_DIR, "run.js")
AUTH_DIR = os.path.join(BASE_DIR, "data", "meituan")
AUTH_FILE = os.path.join(AUTH_DIR, "pt_passport_auth.json")

CLIENT_ID = "c6f50b5a1e2f4e2bb00a3e2f58df3ced"
PASSPORT_KEY = f"{CLIENT_ID}@prod"

# 确保凭证目录存在
os.makedirs(AUTH_DIR, exist_ok=True)

# 全局排他锁：防止多线程并发操作 pt_passport_auth.json 造成凭证踩踏
runner_lock = threading.Lock()


def get_node_executable() -> str:
    """寻找可用的 node 执行路径"""
    for cmd in ["node", "node.exe"]:
        try:
            res = subprocess.run([cmd, "--version"], capture_output=True, text=True, timeout=5)
            if res.returncode == 0:
                return cmd
        except Exception:
            continue
    return "node"


NODE_BIN = get_node_executable()


def run_node_command(args: List[str], timeout: int = 35) -> Dict[str, Any]:
    """
    执行 run.js 子命令并安全解析返回的 JSON。
    """
    env = os.environ.copy()
    env["MEITUAN_AUTH_DIR"] = AUTH_DIR
    env["NODE_OPTIONS"] = ""

    cmd = [NODE_BIN, RUN_JS] + args
    try:
        proc = subprocess.run(
            cmd,
            cwd=ASSETS_DIR,
            env=env,
            capture_output=True,
            text=True,
            timeout=timeout,
            encoding="utf-8",
            errors="replace"
        )
        stdout = (proc.stdout or "").strip()
        stderr = (proc.stderr or "").strip()

        if not stdout:
            return {
                "ok": False,
                "success": False,
                "error": "EMPTY_OUTPUT",
                "message": stderr or "进程无输出",
                "exit_code": proc.returncode
            }

        # 尝试逐行从后往前解析 JSON（过滤可能的 DeprecationWarning 输出）
        lines = [line.strip() for line in stdout.split("\n") if line.strip()]
        for line in reversed(lines):
            if (line.startswith("{") and line.endswith("}")) or (line.startswith("[") and line.endswith("]")):
                try:
                    data = json.loads(line)
                    if isinstance(data, dict):
                        data["exit_code"] = proc.returncode
                        return data
                    return {"ok": True, "data": data, "exit_code": proc.returncode}
                except Exception:
                    continue

        return {
            "ok": False,
            "success": False,
            "error": "PARSE_ERROR",
            "message": f"无法解析输出为JSON: {stdout[:200]}",
            "raw": stdout,
            "stderr": stderr
        }
    except subprocess.TimeoutExpired:
        return {
            "ok": False,
            "success": False,
            "error": "TIMEOUT",
            "message": f"调用命令超时 ({timeout}秒)"
        }
    except Exception as e:
        return {
            "ok": False,
            "success": False,
            "error": "EXEC_ERROR",
            "message": f"执行异常: {str(e)}"
        }


def generate_qrcode_base64(url: str) -> str:
    """使用 qrcode 库将 URL 转为 Base64 PNG 图片 DataURL"""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=2
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64_str = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{b64_str}"


def activate_account(token_str: str, saved_at: Optional[int] = None) -> bool:
    """
    将指定账号的 Token 写入本地 pt_passport_auth.json 作为当前激活态。
    """
    if not token_str:
        return False
    entry = {
        "token": token_str,
        "saved_at": saved_at or int(time.time())
    }
    content = {
        PASSPORT_KEY: entry
    }
    try:
        with open(AUTH_FILE, "w", encoding="utf-8") as f:
            json.dump(content, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        logger.error(f"[凭证激活失败] 无法写入 {AUTH_FILE}: {e}")
        return False


def read_current_token() -> Optional[Dict[str, Any]]:
    """读取当前本地 pt_passport_auth.json 中的 Token 结构"""
    if not os.path.exists(AUTH_FILE):
        return None
    try:
        with open(AUTH_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, dict):
                entry = data.get(PASSPORT_KEY)
                if not entry and len(data) > 0:
                    entry = list(data.values())[0]
                if entry and isinstance(entry, dict) and entry.get("token"):
                    return entry
    except Exception:
        pass
    return None


def clear_current_token():
    """清除本地 pt_passport_auth.json"""
    if os.path.exists(AUTH_FILE):
        try:
            os.remove(AUTH_FILE)
        except Exception:
            pass


def execute_issue(timeout: int = 40) -> Dict[str, Any]:
    """执行领券接口 issue"""
    return run_node_command(["issue"], timeout=timeout)


def fetch_location(timeout: int = 15) -> Dict[str, Any]:
    """获取美团账号当前位置信息"""
    return run_node_command(["location"], timeout=timeout)


class MeituanAuthManager:
    """
    美团扫码授权会话管理器（单例），管理扫码流程与后台轮询线程。
    """
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._sessions = {}
                cls._instance._session_threads = {}
                cls._instance._session_processes = {}
            return cls._instance

    def start_auth_session(self, account_key: Optional[str] = None, custom_nickname: Optional[str] = None) -> Dict[str, Any]:
        """发起新的授权会话，返回 session_id、url 和二维码 Base64"""
        with runner_lock:
            # 清理旧凭证，防止直接命中已有缓存
            clear_current_token()

            # 获取授权链接
            res = run_node_command(["auth-get-code"], timeout=15)
            if not res.get("ok"):
                return {
                    "ok": False,
                    "error": res.get("error") or "AUTH_GET_CODE_FAILED",
                    "message": res.get("message") or "获取授权链接失败"
                }

            url = res.get("url")
            if not url:
                # 若直接返回了 token，说明 pt-passport 内部已有缓存
                if res.get("token"):
                    token = res["token"]
                    return {
                        "ok": True,
                        "immediate_token": token,
                        "status": "success",
                        "message": "已存在有效凭证"
                    }
                return {
                    "ok": False,
                    "error": "NO_URL",
                    "message": "未能取得美团授权链接"
                }

            # 生成二维码 Base64 图片
            try:
                qr_base64 = generate_qrcode_base64(url)
            except Exception as e:
                return {
                    "ok": False,
                    "error": "QR_GEN_FAILED",
                    "message": f"二维码生成失败: {str(e)}"
                }

            session_id = uuid.uuid4().hex
            
            # 记录授权启动流水日志
            target_acc = db.get_account_by_key(account_key) if account_key else None
            acc_name = target_acc.get("nickname") if target_acc else (account_key or "未指定账号")
            job_id = f"job_{int(time.time())}_{uuid.uuid4().hex[:6]}"
            now_str = time.strftime("%H:%M:%S")
            log_lines = [
                f"[{now_str}] 发起美团官方扫码授权会话 (会话ID: {session_id[:8]})",
                f"[{now_str}] 目标关联账号: 【{acc_name}】",
                f"[{now_str}] 正在申请美团官方授权链接与登录二维码...",
                f"[{now_str}] 二维码生成就绪，请使用手机美团 App 扫码并在手机上确认授权登录。"
            ]
            init_output = "\n".join(log_lines)
            log_id = None
            try:
                log_id = db.add_job_log(
                    job_id=job_id,
                    account_key=account_key or "system",
                    task_id="meituan_auth",
                    status="running",
                    output=init_output
                )
            except Exception as e:
                logger.warning(f"Failed to record meituan_auth job_log: {e}")

            session_data = {
                "session_id": session_id,
                "account_key": account_key,
                "custom_nickname": custom_nickname,
                "url": url,
                "qrcode_base64": qr_base64,
                "status": "pending",
                "message": "请使用美团 App 扫码并在手机上确认登录",
                "created_at": time.time(),
                "account": None,
                "token": None,
                "log_id": log_id,
                "log_lines": log_lines
            }
            self._sessions[session_id] = session_data

            # 启动后台轮询线程
            thread = threading.Thread(
                target=self._poll_worker,
                args=(session_id,),
                daemon=True,
                name=f"mt-poll-{session_id[:8]}"
            )
            self._session_threads[session_id] = thread
            thread.start()

            return {
                "ok": True,
                "session_id": session_id,
                "url": url,
                "qrcode_base64": qr_base64,
                "status": "pending",
                "log_id": log_id
            }

    def _poll_worker(self, session_id: str):
        """后台轮询工作线程，执行 pt-passport auth poll-token"""
        logger.info(f"[美团授权] 启动轮询会话: {session_id}")
        bind_meituan_to_account = db.bind_meituan_to_account
        get_account_by_key = db.get_account_by_key
        save_meituan_account = db.save_meituan_account
        get_all_meituan_accounts = db.get_all_meituan_accounts
        update_job_log = db.update_job_log
        env = os.environ.copy()
        env["MEITUAN_AUTH_DIR"] = AUTH_DIR
        env["NODE_OPTIONS"] = ""

        cmd = [NODE_BIN, RUN_JS, "auth-poll-token"]
        try:
            proc = subprocess.Popen(
                cmd,
                cwd=ASSETS_DIR,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace"
            )
            self._session_processes[session_id] = proc

            try:
                # 轮询限时 120 秒
                stdout, stderr = proc.communicate(timeout=120)
            except subprocess.TimeoutExpired:
                proc.kill()
                stdout, stderr = proc.communicate()
                session = self._sessions.get(session_id)
                if session and session["status"] == "pending":
                    session["status"] = "expired"
                    session["message"] = "二维码已过期，请重新获取二维码扫码"
                    log_id = session.get("log_id")
                    if log_id:
                        lines = session.get("log_lines", [])
                        lines.append(f"[{time.strftime('%H:%M:%S')}] 扫码授权超时，二维码已过期（120秒未扫码）。")
                        update_job_log(log_id, status="failed", output="\n".join(lines))
                return

            stdout = (stdout or "").strip()
            # 解析输出
            token = None
            if stdout:
                lines = [l.strip() for l in stdout.split("\n") if l.strip()]
                for line in reversed(lines):
                    if line.startswith("{") and line.endswith("}"):
                        try:
                            d = json.loads(line)
                            if d.get("ok") and d.get("token"):
                                token = d["token"]
                                break
                        except Exception:
                            continue

            # 如果未从 JSON 直接解析到，尝试从本地文件恢复
            if not token:
                cur = read_current_token()
                if cur and cur.get("token"):
                    token = cur["token"]

            session = self._sessions.get(session_id)
            if not session or session["status"] != "pending":
                return

            log_id = session.get("log_id")
            log_lines = session.get("log_lines", [])

            if token:
                logger.info(f"[美团授权成功] 会话 {session_id} 获得 Token: {token[:8]}****")
                now_str = time.strftime("%H:%M:%S")
                log_lines.append(f"[{now_str}] 手机端扫码授权成功！已取得美团官方 Token (前缀: {token[:10]}..., 后缀: {token[-6:]})")

                # 尝试获取城市定位信息以丰富展示
                city_name = ""
                try:
                    loc_res = fetch_location(timeout=10)
                    if loc_res.get("ok") and loc_res.get("cityName"):
                        city_name = loc_res.get("cityName")
                        log_lines.append(f"[{time.strftime('%H:%M:%S')}] 美团账号定位城市: {city_name}")
                except Exception:
                    pass

                account_key = session.get("account_key")
                custom_nickname = session.get("custom_nickname")
                saved_at = int(time.time())

                if account_key:
                    target_acc = get_account_by_key(account_key)
                    acc_nick = target_acc.get("nickname") if target_acc else account_key
                    if custom_nickname and str(custom_nickname).strip():
                        nickname = str(custom_nickname).strip()
                    else:
                        nickname = f"美团 ({token[-4:]})"
                        if city_name:
                            nickname += f" - {city_name}"

                    bind_meituan_to_account(account_key, {
                        "token": token,
                        "nickname": nickname,
                        "saved_at": saved_at,
                        "is_active": 1
                    })
                    account_record = get_account_by_key(account_key)
                    session["status"] = "success"
                    session["token"] = token
                    session["account"] = account_record
                    session["message"] = f"已成功为账号【{acc_nick}】绑定美团！"
                    log_lines.append(f"[{time.strftime('%H:%M:%S')}] 成功将美团账号【{nickname}】关联绑定至小蚕账号【{acc_nick}】({account_key})")
                else:
                    existing_accounts = get_all_meituan_accounts()
                    matched_account = None
                    for acc in existing_accounts:
                        if acc.get("token") == token:
                            matched_account = acc
                            break

                    acc_key = matched_account["key"] if matched_account else f"mt_{uuid.uuid4().hex[:8]}"
                    if custom_nickname and str(custom_nickname).strip():
                        nickname = str(custom_nickname).strip()
                    elif matched_account:
                        nickname = matched_account.get("nickname") or f"美团账号 ({token[-4:]})"
                    else:
                        nickname = f"美团账号 ({token[-4:]})"
                        if city_name:
                            nickname += f" - {city_name}"

                    account_record = save_meituan_account({
                        "key": acc_key,
                        "nickname": nickname,
                        "token": token,
                        "saved_at": saved_at,
                        "is_active": 1
                    })

                    session["status"] = "success"
                    session["token"] = token
                    session["account"] = account_record
                    session["message"] = "美团账号绑定成功"
                    log_lines.append(f"[{time.strftime('%H:%M:%S')}] 美团账号凭证已归档至系统凭据库 (标识: {acc_key})")

                log_lines.append(f"[{time.strftime('%H:%M:%S')}] 美团官方扫码授权全流程完成。")
                if log_id:
                    update_job_log(log_id, status="success", output="\n".join(log_lines))
            else:
                session["status"] = "failed"
                session["message"] = "未检测到授权，请重新尝试"
                log_lines.append(f"[{time.strftime('%H:%M:%S')}] 授权失败: 未能从官方接口检测到授权凭证。")
                if log_id:
                    update_job_log(log_id, status="failed", output="\n".join(log_lines))
        except Exception as e:
            logger.error(f"[美团授权异常] {session_id}: {e}")
            session = self._sessions.get(session_id)
            if session and session["status"] == "pending":
                session["status"] = "failed"
                session["message"] = f"授权异常: {str(e)}"
                log_id = session.get("log_id")
                log_lines = session.get("log_lines", [])
                log_lines.append(f"[{time.strftime('%H:%M:%S')}] 授权流程发生异常: {str(e)}")
                if log_id:
                    update_job_log(log_id, status="failed", output="\n".join(log_lines))
        finally:
            self._session_processes.pop(session_id, None)

    def get_session_status(self, session_id: str) -> Dict[str, Any]:
        """获取指定会话状态"""
        session = self._sessions.get(session_id)
        if not session:
            return {
                "ok": False,
                "status": "not_found",
                "message": "授权会话不存在或已过期"
            }
        return {
            "ok": True,
            "session_id": session_id,
            "status": session["status"],
            "account": session.get("account"),
            "message": session.get("message"),
            "created_at": session.get("created_at")
        }

    def cancel_session(self, session_id: str):
        """取消会话并终止进程"""
        proc = self._session_processes.pop(session_id, None)
        if proc:
            try:
                proc.kill()
            except Exception:
                pass
        session = self._sessions.get(session_id)
        if session:
            session["status"] = "canceled"
            session["message"] = "授权已取消"
            log_id = session.get("log_id")
            if log_id:
                try:
                    lines = session.get("log_lines", [])
                    lines.append(f"[{time.strftime('%H:%M:%S')}] 用户取消了美团扫码授权会话。")
                    db.update_job_log(log_id, status="aborted", output="\n".join(lines))
                except Exception:
                    pass


auth_manager = MeituanAuthManager()
