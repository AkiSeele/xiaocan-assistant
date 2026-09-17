"""
多通道系统与任务预警通知模块
支持：
1. 微信 ClawBot (直连腾讯 iLink 灰度协议，兼容 Microsoft-Rewards-Script 凭证)
2. QQ 聊天机器人 (遵循 OneBot V11 HTTP 标准，直连 NoneBot2 / SnowLuma)
3. 企业微信群机器人 Webhook
4. iOS Bark 极速震动推送
5. Telegram Bot 推送
"""
import os
import json
import uuid
import base64
import logging
from typing import Dict, Any, Optional, Tuple
import httpx
from ..models import database as db

logger = logging.getLogger("xiaocan.notifier")

# 微信 ClawBot 腾讯 iLink 官方常量 (对齐 2.4.3 规范)
ILINK_BASE_URL = "https://ilinkai.weixin.qq.com"
ILINK_APP_ID = "bot"
ILINK_CHANNEL_VERSION = "2.4.3"
ILINK_APP_CLIENT_VERSION = str((2 << 16) | (4 << 8) | 3)  # 132100
BOT_AGENT = "xiaocan-assistant/2.0.0"

# 默认探测的 Microsoft-Rewards-Script 凭据文件绝对路径
DEFAULT_CLAWBOT_PATHS = [
    r"D:\小插件\Microsoft-Rewards-Script-4.3.2.1\clawbot-auth.json",
    os.path.join(os.getcwd(), "clawbot-auth.json"),
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "clawbot-auth.json")
]


def load_clawbot_auth(custom_path: Optional[str] = None, auth_json_str: Optional[str] = None) -> Tuple[Optional[Dict[str, Any]], str]:
    """
    加载 ClawBot 凭证，优先级：
    1. 传入的直接 JSON 字符串
    2. 传入的指定文件路径
    3. 数据库持久化配置的路径 / 凭证
    4. 默认 Microsoft-Rewards-Script 本地路径
    """
    # 1. 直接 JSON 字符串
    if auth_json_str and auth_json_str.strip():
        try:
            data = json.loads(auth_json_str.strip())
            if isinstance(data, dict) and data.get("token") and data.get("userId"):
                return data, "使用内存传入的直接 JSON 凭证"
        except Exception:
            pass

    # 2. 检查数据库直接存储的 JSON 凭证
    db_json = (db.get_setting("clawbot_auth_json", "") or "").strip()
    if db_json:
        try:
            data = json.loads(db_json)
            if isinstance(data, dict) and data.get("token") and data.get("userId"):
                return data, "使用数据库保存的直接凭证"
        except Exception:
            pass

    # 3. 指定路径或数据库配置路径
    candidate_paths = []
    if custom_path and custom_path.strip():
        candidate_paths.append(custom_path.strip())
    db_path = (db.get_setting("clawbot_auth_path", "") or "").strip()
    if db_path:
        candidate_paths.append(db_path)
    candidate_paths.extend(DEFAULT_CLAWBOT_PATHS)

    for p in candidate_paths:
        try:
            if os.path.exists(p) and os.path.isfile(p):
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, dict) and data.get("token") and data.get("userId"):
                        return data, f"成功从本地文件读取: {p}"
        except Exception as e:
            logger.debug(f"尝试读取 ClawBot 凭证文件 {p} 失败: {e}")

    return None, "未找到有效的 ClawBot 凭据文件 (clawbot-auth.json)"


def _generate_wechat_uin() -> str:
    """X-WECHAT-UIN: 随机 uint32 转十进制字符串再 base64 编码"""
    uint32 = int.from_bytes(os.urandom(4), byteorder="big")
    return base64.b64encode(str(uint32).encode("utf-8")).decode("utf-8")


async def send_clawbot_notification(
    title: str,
    content: str,
    custom_path: Optional[str] = None,
    auth_json_str: Optional[str] = None
) -> Dict[str, Any]:
    """
    通过微信官方 ClawBot (iLink) 通道向用户推送微信通知
    """
    auth, src_msg = load_clawbot_auth(custom_path, auth_json_str)
    if not auth:
        return {"ok": False, "channel": "clawbot", "message": f"ClawBot 未就绪: {src_msg}"}

    token = auth.get("token", "").strip()
    user_id = auth.get("userId", "").strip()
    context_token = auth.get("contextToken", "").strip() if auth.get("contextToken") else ""

    if not token or not user_id:
        return {"ok": False, "channel": "clawbot", "message": "ClawBot 凭证缺少 token 或 userId"}

    text = f"【小蚕助手】{title}\n\n{content}"
    headers = {
        "Content-Type": "application/json",
        "AuthorizationType": "ilink_bot_token",
        "Authorization": f"Bearer {token}",
        "X-WECHAT-UIN": _generate_wechat_uin(),
        "iLink-App-Id": ILINK_APP_ID,
        "iLink-App-ClientVersion": ILINK_APP_CLIENT_VERSION
    }

    client_id = f"openclaw-weixin-{uuid.uuid4().hex}"
    msg_body: Dict[str, Any] = {
        "from_user_id": "",
        "to_user_id": user_id,
        "client_id": client_id,
        "message_type": 2,
        "message_state": 2,
        "item_list": [{"type": 1, "text_item": {"text": text}}]
    }
    if context_token:
        msg_body["context_token"] = context_token

    payload = {
        "msg": msg_body,
        "base_info": {
            "channel_version": ILINK_CHANNEL_VERSION,
            "bot_agent": BOT_AGENT
        }
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(f"{ILINK_BASE_URL}/ilink/bot/sendmessage", json=payload, headers=headers)
            if resp.status_code in (401, 403):
                return {"ok": False, "channel": "clawbot", "message": "ClawBot 凭据鉴权失败或已过期 (HTTP 401/403)"}
            if resp.status_code != 200:
                return {"ok": False, "channel": "clawbot", "message": f"ClawBot 接口 HTTP 异常: {resp.status_code}"}

            data = resp.json()
            ret = data.get("ret", 0)
            if ret == 0:
                return {"ok": True, "channel": "clawbot", "message": "微信 ClawBot 推送成功"}
            elif ret == -14:
                return {"ok": False, "channel": "clawbot", "message": "ClawBot 凭证已过期，请在原脚本端重新扫码登录"}
            elif ret == -2:
                return {
                    "ok": False,
                    "channel": "clawbot",
                    "message": "ClawBot 会话尚未激活或上下文已过期。请在手机微信中给您的 ClawBot 机器人随便发送一条消息以建立会话，随后即可正常推送！"
                }
            else:
                errmsg = data.get("errmsg") or f"未知错误码 {ret}"
                return {"ok": False, "channel": "clawbot", "message": f"ClawBot 推送返回异常: {errmsg}"}
    except Exception as e:
        logger.warning(f"微信 ClawBot 推送请求异常: {e}")
        return {"ok": False, "channel": "clawbot", "message": f"网络通信错误: {str(e)}"}


async def send_qq_bot_notification(
    title: str,
    content: str,
    api_url: Optional[str] = None,
    group_id: Optional[str] = None,
    user_id: Optional[str] = None,
    target_type: Optional[str] = None,
    token: Optional[str] = None
) -> Dict[str, Any]:
    """
    通过 OneBot V11 协议端 (mystool-bot / SnowLuma / NoneBot2) 发送 QQ 群/私聊消息
    """
    raw_api = (api_url or db.get_setting("qq_bot_api", "http://127.0.0.1:8080") or "").strip().rstrip("/")
    if not raw_api:
        return {"ok": False, "channel": "qq_bot", "message": "QQ 机器人 API 地址未配置"}

    target_type = (target_type or db.get_setting("qq_bot_target_type", "group") or "group").strip()
    target_group = (group_id or db.get_setting("qq_bot_group_id", "954658571") or "").strip()
    target_user = (user_id or db.get_setting("qq_bot_user_id", "2371445972") or "").strip()
    auth_token = (token or db.get_setting("qq_bot_token", "") or "").strip()

    headers = {"Content-Type": "application/json"}
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"

    text = f"[小蚕助手] {title}\n{content}"
    sub_results = []
    errors = []

    async with httpx.AsyncClient(timeout=10.0) as client:
        # 群聊推送
        if target_type in ("group", "both") and target_group:
            try:
                gid = int(target_group)
                endpoint = f"{raw_api}/send_group_msg"
                payload = {"group_id": gid, "message": text}
                resp = await client.post(endpoint, json=payload, headers=headers)
                if resp.status_code == 200:
                    rdata = resp.json()
                    if rdata.get("status") == "ok" or rdata.get("retcode") == 0:
                        sub_results.append(f"群聊({gid})发送成功")
                    else:
                        errors.append(f"群聊({gid})响应失败: {rdata.get('message') or rdata}")
                else:
                    errors.append(f"群聊 HTTP 异常: {resp.status_code}")
            except Exception as e:
                errors.append(f"群聊发送异常: {str(e)}")

        # 私聊推送
        if target_type in ("private", "both") and target_user:
            try:
                uid = int(target_user)
                endpoint = f"{raw_api}/send_private_msg"
                payload = {"user_id": uid, "message": text}
                resp = await client.post(endpoint, json=payload, headers=headers)
                if resp.status_code == 200:
                    rdata = resp.json()
                    if rdata.get("status") == "ok" or rdata.get("retcode") == 0:
                        sub_results.append(f"私聊({uid})发送成功")
                    else:
                        errors.append(f"私聊({uid})响应失败: {rdata.get('message') or rdata}")
                else:
                    errors.append(f"私聊 HTTP 异常: {resp.status_code}")
            except Exception as e:
                errors.append(f"私聊发送异常: {str(e)}")

    if not sub_results and not errors:
        return {"ok": False, "channel": "qq_bot", "message": "未指定有效的群号或私聊 QQ 号"}

    ok = len(sub_results) > 0
    msg = "; ".join(sub_results) if ok else "; ".join(errors)
    return {"ok": ok, "channel": "qq_bot", "message": msg, "errors": errors}


async def test_single_channel(channel: str, config: Dict[str, Any]) -> Dict[str, Any]:
    """
    单通道即时测试
    """
    test_title = "通知连通性测试"
    test_content = "这是一条来自小蚕助手的连通性测试消息，如果您收到此消息，说明该通知通道已成功接入并正常工作！"

    if channel == "clawbot":
        return await send_clawbot_notification(
            title=test_title,
            content=test_content,
            custom_path=config.get("clawbot_auth_path"),
            auth_json_str=config.get("clawbot_auth_json")
        )
    elif channel == "qq_bot":
        return await send_qq_bot_notification(
            title=test_title,
            content=test_content,
            api_url=config.get("qq_bot_api"),
            group_id=config.get("qq_bot_group_id"),
            user_id=config.get("qq_bot_user_id"),
            target_type=config.get("qq_bot_target_type"),
            token=config.get("qq_bot_token")
        )
    elif channel == "wecom":
        webhook = (config.get("wecom_webhook") or "").strip()
        if not webhook or not webhook.startswith("http"):
            return {"ok": False, "channel": "wecom", "message": "企业微信 Webhook 地址格式不正确"}
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                md_content = f"### [小蚕助手] {test_title}\n\n{test_content}"
                resp = await client.post(webhook, json={"msgtype": "markdown", "markdown": {"content": md_content}})
                if resp.status_code == 200:
                    return {"ok": True, "channel": "wecom", "message": "企业微信机器人测试消息发送成功"}
                return {"ok": False, "channel": "wecom", "message": f"企业微信 HTTP 状态码: {resp.status_code}"}
        except Exception as e:
            return {"ok": False, "channel": "wecom", "message": f"企业微信测试失败: {str(e)}"}

    elif channel == "bark":
        bark_url = (config.get("bark_url") or "").strip()
        if not bark_url or not bark_url.startswith("http"):
            return {"ok": False, "channel": "bark", "message": "Bark URL 地址格式不正确"}
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                payload = {
                    "title": f"[小蚕助手] {test_title}",
                    "body": test_content,
                    "group": "小蚕自动化"
                }
                resp = await client.post(bark_url.rstrip("/"), json=payload)
                if resp.status_code == 200:
                    return {"ok": True, "channel": "bark", "message": "Bark 测试消息发送成功"}
                return {"ok": False, "channel": "bark", "message": f"Bark HTTP 状态码: {resp.status_code}"}
        except Exception as e:
            return {"ok": False, "channel": "bark", "message": f"Bark 测试失败: {str(e)}"}

    elif channel == "telegram":
        tg_token = (config.get("tg_bot_token") or "").strip()
        tg_chat_id = (config.get("tg_chat_id") or "").strip()
        if not tg_token or not tg_chat_id:
            return {"ok": False, "channel": "telegram", "message": "Telegram Bot Token 或 Chat ID 未填写"}
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                api_url = f"https://api.telegram.org/bot{tg_token}/sendMessage"
                payload = {
                    "chat_id": tg_chat_id,
                    "text": f"*{test_title}*\n\n{test_content}",
                    "parse_mode": "Markdown"
                }
                resp = await client.post(api_url, json=payload)
                if resp.status_code == 200:
                    return {"ok": True, "channel": "telegram", "message": "Telegram 测试消息发送成功"}
                return {"ok": False, "channel": "telegram", "message": f"Telegram HTTP 状态码: {resp.status_code}"}
        except Exception as e:
            return {"ok": False, "channel": "telegram", "message": f"Telegram 测试失败: {str(e)}"}

    return {"ok": False, "channel": channel, "message": f"未知通知渠道: {channel}"}


async def send_system_notification(title: str, content: str, level: str = "info") -> Dict[str, Any]:
    """向所有已启用的通知通道全量广播告警或任务完成消息"""
    channels_sent = []
    errors = []

    # 1. 微信 ClawBot (腾讯 iLink)
    if db.get_setting("clawbot_enabled", True):
        try:
            res = await send_clawbot_notification(title, content)
            if res.get("ok"):
                channels_sent.append("clawbot")
            else:
                errors.append(f"clawbot: {res.get('message')}")
        except Exception as e:
            logger.warning(f"ClawBot 发送失败: {e}")
            errors.append(f"clawbot: {str(e)}")

    # 2. QQ 机器人 (mystool-bot / OneBot V11)
    if db.get_setting("qq_bot_enabled", True):
        try:
            res = await send_qq_bot_notification(title, content)
            if res.get("ok"):
                channels_sent.append("qq_bot")
            else:
                errors.append(f"qq_bot: {res.get('message')}")
        except Exception as e:
            logger.warning(f"QQ 机器人发送失败: {e}")
            errors.append(f"qq_bot: {str(e)}")

    # 3. 企业微信群机器人
    wecom_webhook = (db.get_setting("wecom_webhook", "") or "").strip()
    if wecom_webhook and wecom_webhook.startswith("http") and db.get_setting("wecom_enabled", True):
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                md_content = f"### 【小蚕助手】{title}\n\n{content}"
                payload = {
                    "msgtype": "markdown",
                    "markdown": {
                        "content": md_content
                    }
                }
                resp = await client.post(wecom_webhook, json=payload)
                if resp.status_code == 200:
                    channels_sent.append("wecom")
                else:
                    errors.append(f"wecom status: {resp.status_code}")
        except Exception as e:
            logger.warning(f"企业微信通知发送失败: {e}")
            errors.append(f"wecom: {str(e)}")

    # 4. iOS Bark 推送
    bark_url = (db.get_setting("bark_url", "") or "").strip()
    if bark_url and bark_url.startswith("http") and db.get_setting("bark_enabled", True):
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                bark_base = bark_url.rstrip("/")
                payload = {
                    "title": f"【小蚕助手】{title}",
                    "body": content,
                    "group": "小蚕自动化",
                    "icon": "https://img.icons8.com/color/96/weixing.png"
                }
                resp = await client.post(bark_base, json=payload)
                if resp.status_code == 200:
                    channels_sent.append("bark")
                else:
                    errors.append(f"bark status: {resp.status_code}")
        except Exception as e:
            logger.warning(f"Bark 通知发送失败: {e}")
            errors.append(f"bark: {str(e)}")

    # 5. Telegram Bot
    tg_bot_token = (db.get_setting("tg_bot_token", "") or "").strip()
    tg_chat_id = (db.get_setting("tg_chat_id", "") or "").strip()
    if tg_bot_token and tg_chat_id and db.get_setting("telegram_enabled", True):
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                tg_api = f"https://api.telegram.org/bot{tg_bot_token}/sendMessage"
                payload = {
                    "chat_id": tg_chat_id,
                    "text": f"*{title}*\n\n{content}",
                    "parse_mode": "Markdown"
                }
                resp = await client.post(tg_api, json=payload)
                if resp.status_code == 200:
                    channels_sent.append("telegram")
                else:
                    errors.append(f"telegram status: {resp.status_code}")
        except Exception as e:
            logger.warning(f"Telegram 通知发送失败: {e}")
            errors.append(f"telegram: {str(e)}")

    return {
        "ok": len(channels_sent) > 0 or len(errors) == 0,
        "channels": channels_sent,
        "errors": errors
    }

