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
import time
import json
import uuid
import hmac
import hashlib
import urllib.parse
import base64
import logging
from typing import Dict, Any, Optional, Tuple
import httpx
from ..models import database as db

from . import clawbot_client

logger = logging.getLogger("xiaocan.notifier")


def load_clawbot_auth(custom_path: Optional[str] = None, auth_json_str: Optional[str] = None) -> Tuple[Optional[Dict[str, Any]], str]:
    """获取 ClawBot 凭据（委托至原生 clawbot_client 模块）"""
    return clawbot_client.load_auth(custom_path, auth_json_str)


async def send_clawbot_notification(
    title: str,
    content: str,
    custom_path: Optional[str] = None,
    auth_json_str: Optional[str] = None
) -> Dict[str, Any]:
    """通过微信官方 ClawBot (iLink) 通道向用户推送通知（委托至原生 clawbot_client 模块）"""
    return await clawbot_client.send_message(title, content, custom_path, auth_json_str)


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

    elif channel == "feishu":
        webhook = (config.get("feishu_webhook") or "").strip()
        return await send_feishu_notification(webhook, test_title, test_content)

    elif channel == "dingtalk":
        webhook = (config.get("dingtalk_webhook") or "").strip()
        secret = (config.get("dingtalk_secret") or "").strip()
        return await send_dingtalk_notification(webhook, secret, test_title, test_content)

    return {"ok": False, "channel": channel, "message": f"未知通知渠道: {channel}"}


async def send_feishu_notification(webhook_url: str, title: str, content: str) -> Dict[str, Any]:
    """向飞书自定义群机器人 Webhook 推送富文本消息"""
    url = (webhook_url or "").strip()
    if not url or not url.startswith("http"):
        return {"ok": False, "channel": "feishu", "message": "飞书 Webhook 地址格式不正确"}
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            payload = {
                "msg_type": "post",
                "content": {
                    "post": {
                        "zh_cn": {
                            "title": f"【小蚕助手】{title}",
                            "content": [
                                [{"tag": "text", "text": content}]
                            ]
                        }
                    }
                }
            }
            resp = await client.post(url, json=payload)
            if resp.status_code == 200:
                res_data = resp.json()
                if res_data.get("code") == 0 or res_data.get("StatusCode") == 0:
                    return {"ok": True, "channel": "feishu", "message": "飞书机器人通知发送成功"}
                return {"ok": False, "channel": "feishu", "message": f"飞书返回错误: {res_data.get('msg')}"}
            return {"ok": False, "channel": "feishu", "message": f"飞书 HTTP 状态码: {resp.status_code}"}
    except Exception as e:
        logger.warning(f"飞书通知发送异常: {e}")
        return {"ok": False, "channel": "feishu", "message": f"飞书发送异常: {str(e)}"}


async def send_dingtalk_notification(webhook_url: str, secret: Optional[str], title: str, content: str) -> Dict[str, Any]:
    """向钉钉自定义机器人 Webhook 推送 Markdown 消息 (支持加签鉴权)"""
    url = (webhook_url or "").strip()
    if not url or not url.startswith("http"):
        return {"ok": False, "channel": "dingtalk", "message": "钉钉 Webhook 地址格式不正确"}

    target_url = url
    if secret and secret.strip():
        timestamp = str(round(time.time() * 1000))
        secret_enc = secret.strip().encode("utf-8")
        string_to_sign = f"{timestamp}\n{secret.strip()}".encode("utf-8")
        hmac_code = hmac.new(secret_enc, string_to_sign, digestmod=hashlib.sha256).digest()
        sign = urllib.parse.quote_plus(base64.b64encode(hmac_code))
        sep = "&" if "?" in target_url else "?"
        target_url = f"{target_url}{sep}timestamp={timestamp}&sign={sign}"

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            payload = {
                "msgtype": "markdown",
                "markdown": {
                    "title": f"【小蚕助手】{title}",
                    "text": f"### 【小蚕助手】{title}\n\n{content}"
                }
            }
            resp = await client.post(target_url, json=payload)
            if resp.status_code == 200:
                res_data = resp.json()
                if res_data.get("errcode") == 0:
                    return {"ok": True, "channel": "dingtalk", "message": "钉钉机器人通知发送成功"}
                return {"ok": False, "channel": "dingtalk", "message": f"钉钉返回错误: {res_data.get('errmsg')}"}
            return {"ok": False, "channel": "dingtalk", "message": f"钉钉 HTTP 状态码: {resp.status_code}"}
    except Exception as e:
        logger.warning(f"钉钉通知发送异常: {e}")
        return {"ok": False, "channel": "dingtalk", "message": f"钉钉发送异常: {str(e)}"}


async def send_single_custom_channel(channel: str, config: Dict[str, Any], title: str, content: str) -> Dict[str, Any]:
    """向指定的单通道定向发送消息 (按权重优先级派发)"""
    # 1. 微信官方 ClawBot (腾讯 iLink) - 最高权重
    if channel == "clawbot":
        return await send_clawbot_notification(
            title=title,
            content=content,
            custom_path=config.get("clawbot_auth_path"),
            auth_json_str=config.get("clawbot_auth_json")
        )

    # 2. 企业微信群机器人
    elif channel == "wecom":
        webhook = (config.get("wecom_webhook") or "").strip()
        if not webhook or not webhook.startswith("http"):
            return {"ok": False, "channel": "wecom", "message": "企业微信 Webhook 地址格式不正确"}
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                md_content = f"### 【小蚕助手】{title}\n\n{content}"
                resp = await client.post(webhook, json={"msgtype": "markdown", "markdown": {"content": md_content}})
                if resp.status_code == 200:
                    return {"ok": True, "channel": "wecom", "message": "企业微信通知发送成功"}
                return {"ok": False, "channel": "wecom", "message": f"企业微信 HTTP 状态码: {resp.status_code}"}
        except Exception as e:
            return {"ok": False, "channel": "wecom", "message": f"企业微信异常: {str(e)}"}

    # 3. 钉钉群机器人
    elif channel == "dingtalk":
        webhook = (config.get("dingtalk_webhook") or "").strip()
        secret = (config.get("dingtalk_secret") or "").strip()
        return await send_dingtalk_notification(webhook, secret, title, content)

    # 4. 飞书群机器人
    elif channel == "feishu":
        webhook = (config.get("feishu_webhook") or "").strip()
        return await send_feishu_notification(webhook, title, content)

    # 5. iOS Bark 推送
    elif channel == "bark":
        bark_url = (config.get("bark_url") or "").strip()
        if not bark_url:
            return {"ok": False, "channel": "bark", "message": "Bark URL 不能为空"}
        # 支持用户输入纯 key 或完整 URL
        if not bark_url.startswith("http"):
            bark_url = f"https://api.day.app/{bark_url}"
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                payload = {
                    "title": f"【小蚕助手】{title}",
                    "body": content,
                    "group": "小蚕自动化",
                    "icon": "https://img.icons8.com/color/96/weixing.png"
                }
                resp = await client.post(bark_url.rstrip("/"), json=payload)
                if resp.status_code == 200:
                    return {"ok": True, "channel": "bark", "message": "Bark 专属推送成功"}
                return {"ok": False, "channel": "bark", "message": f"Bark HTTP 状态码: {resp.status_code}"}
        except Exception as e:
            return {"ok": False, "channel": "bark", "message": f"Bark 异常: {str(e)}"}

    # 6. QQ 机器人 (私聊/群聊)
    elif channel == "qq_bot":
        return await send_qq_bot_notification(
            title=title,
            content=content,
            api_url=config.get("qq_bot_api"),
            user_id=config.get("qq_bot_user_id"),
            group_id=config.get("qq_bot_group_id"),
            target_type="private" if config.get("qq_bot_user_id") else "group",
            token=config.get("qq_bot_token")
        )

    # 7. Telegram Bot
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
                    "text": f"*{title}*\n\n{content}",
                    "parse_mode": "Markdown"
                }
                resp = await client.post(api_url, json=payload)
                if resp.status_code == 200:
                    return {"ok": True, "channel": "telegram", "message": "Telegram 专属推送成功"}
                return {"ok": False, "channel": "telegram", "message": f"Telegram HTTP: {resp.status_code}"}
        except Exception as e:
            return {"ok": False, "channel": "telegram", "message": f"Telegram 异常: {str(e)}"}

    return {"ok": False, "channel": channel, "message": f"不支持的单通道类型: {channel}"}


async def send_account_notification(account_key: str, title: str, content: str, level: str = "info") -> Dict[str, Any]:
    """精准向指定账号绑定的专属通道定向推送"""
    if not account_key or not account_key.strip():
        return await _send_global_system_notification(title, content, level)

    cfg_info = db.get_account_notify_config(account_key.strip())
    mode = cfg_info.get("notify_mode") or "global"
    cfg = cfg_info.get("notify_config") or {}

    if mode == "disabled":
        logger.info(f"账号 [{account_key}] 已配置静音模式，跳过消息通知")
        return {"ok": True, "skipped": True, "channel": "disabled", "message": "账号已静音"}

    if mode == "custom":
        channel = cfg.get("channel")
        if not channel:
            logger.warning(f"账号 [{account_key}] 配置为独立通道但未选择具体通道类型，降级走全局通知")
            return await _send_global_system_notification(title, content, level)
        res = await send_single_custom_channel(channel, cfg, title, content)
        logger.info(f"账号 [{account_key}] 专属通道 [{channel}] 发送结果: {res.get('ok')} - {res.get('message')}")
        return res

    # global 模式下退回全局广播
    return await _send_global_system_notification(title, content, level)


async def test_account_channel(account_key: str, mode: str, config: Dict[str, Any]) -> Dict[str, Any]:
    """即时测试指定账号的通知通道连通性"""
    acc = db.get_account_by_key(account_key)
    acc_name = acc.get("nickname") if acc else account_key
    test_title = f"专属通知连通测试 · {acc_name}"
    test_content = (
        f"这是一条发往账号【{acc_name}】专属通道的连通性测试消息。\n"
        f"如果您收到本条推送，说明您的独立个人通道已正确接入，后续该账号的中签、抢单与预警消息将仅定向发送至此处！"
    )

    if mode == "disabled":
        return {"ok": True, "message": "当前为静音模式，已跳过发送"}

    if mode == "global":
        # 测试全局通道连通性
        res = await _send_global_system_notification(test_title, test_content)
        return {
            "ok": res.get("ok", False),
            "message": f"已触发全局通道广播测试 (成功通道: {', '.join(res.get('channels', [])) or '无'})"
        }

    channel = config.get("channel")
    if not channel:
        return {"ok": False, "message": "请先选择需要绑定的通知渠道类型"}

    return await send_single_custom_channel(channel, config, test_title, test_content)


async def send_system_notification(
    title: str,
    content: str,
    level: str = "info",
    account_key: Optional[str] = None
) -> Dict[str, Any]:
    """
    智能分发系统通知：
    1. 若提供了 account_key，且该账号独立配置了 notify_mode ('custom' 或 'disabled')，则精准按账号策略单播派发；
    2. 若未提供 account_key 或账号配置为 'global'，则全量广播至系统全局配置的通知通道。
    """
    if account_key and account_key.strip():
        cfg_info = db.get_account_notify_config(account_key.strip())
        mode = cfg_info.get("notify_mode") or "global"
        if mode in ("custom", "disabled"):
            return await send_account_notification(account_key.strip(), title, content, level)

    return await _send_global_system_notification(title, content, level)


async def _send_global_system_notification(title: str, content: str, level: str = "info") -> Dict[str, Any]:
    """向所有已启用的全局通知通道广播消息"""
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


def is_any_notify_channel_enabled() -> bool:
    """
    检查是否至少开启并配置了一个可用的通知通道
    支持：微信 ClawBot、QQ 机器人、企业微信 Webhook、Bark、Telegram Bot
    """
    # 1. 微信 ClawBot
    if db.get_setting("clawbot_enabled", True):
        auth, _ = load_clawbot_auth()
        if auth and auth.get("token") and auth.get("userId"):
            return True

    # 2. QQ 机器人
    if db.get_setting("qq_bot_enabled", True):
        qq_api = (db.get_setting("qq_bot_api", "") or "").strip()
        if qq_api and (db.get_setting("qq_bot_group_id") or db.get_setting("qq_bot_user_id")):
            return True

    # 3. 企业微信 Webhook
    if db.get_setting("wecom_enabled", False):
        wecom = (db.get_setting("wecom_webhook", "") or "").strip()
        if wecom and wecom.startswith("http"):
            return True

    # 4. iOS Bark
    if db.get_setting("bark_enabled", False):
        bark = (db.get_setting("bark_url", "") or "").strip()
        if bark and bark.startswith("http"):
            return True

    # 5. Telegram Bot
    if db.get_setting("telegram_enabled", False):
        tg_token = (db.get_setting("tg_bot_token", "") or "").strip()
        tg_chat_id = (db.get_setting("tg_chat_id", "") or "").strip()
        if tg_token and tg_chat_id:
            return True

    return False


