"""
小蚕小帮手 - 多通道通知调度中枢 (NotificationHub)
对标 BetterGI 架构设计：
1. 统一通知数据契约 (NotificationData) 与事件枚举 (NotificationEvent)
2. 细粒度事件订阅过滤器 (Event Subscription Filter)
3. 账号专属通道单播 vs 全局通道广播路由
4. 覆盖主流多端通道：微信 ClawBot、Server酱、WxPusher、企业微信、钉钉加签、飞书、Bark、Telegram、Webhook、SMTP 邮件、Gotify、Discord、QQ OneBot
5. 全流程严禁使用任何 Emoji
"""
import asyncio
import logging
from typing import Dict, Any, Optional, Tuple, Union, List

from ..models import database as db
from . import clawbot_client
from .notification.models import NotificationEvent, NotificationLevel, NotificationData
from .notification.channels import ALL_NOTIFIERS, BaseNotifier

logger = logging.getLogger("xiaocan.notifier")


# ---------------- 1. 兼容性辅助接口 ---------------- #

def load_clawbot_auth(custom_path: Optional[str] = None, auth_json_str: Optional[str] = None) -> Tuple[Optional[Dict[str, Any]], str]:
    """获取 ClawBot 凭据（委托至原生 clawbot_client 模块）"""
    return clawbot_client.load_auth(custom_path, auth_json_str)


async def send_clawbot_notification(
    title: str,
    content: str,
    custom_path: Optional[str] = None,
    auth_json_str: Optional[str] = None
) -> Dict[str, Any]:
    """通过微信官方 ClawBot (iLink) 通道向用户推送通知"""
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
    """通过 OneBot V11 发送 QQ 群/私聊消息"""
    notifier = ALL_NOTIFIERS["qq_bot"]
    raw_api = api_url or db.get_setting("qq_bot_api", "http://127.0.0.1:8080")
    ttype = target_type or db.get_setting("qq_bot_target_type", "group")
    gid = group_id or db.get_setting("qq_bot_group_id", "")
    uid = user_id or db.get_setting("qq_bot_user_id", "")
    tkn = token or db.get_setting("qq_bot_token", "")
    text = f"[小蚕小帮手] {title}\n{content}"
    return await notifier._do_send(raw_api, ttype, gid, uid, tkn, text)


async def send_feishu_notification(webhook_url: str, title: str, content: str, secret: Optional[str] = None) -> Dict[str, Any]:
    """向飞书自定义群机器人推送消息"""
    notifier = ALL_NOTIFIERS["feishu"]
    return await notifier._do_send(webhook_url, secret, title, content)


async def send_dingtalk_notification(webhook_url: str, secret: Optional[str], title: str, content: str) -> Dict[str, Any]:
    """向钉钉自定义机器人 Webhook 推送 Markdown 消息"""
    notifier = ALL_NOTIFIERS["dingtalk"]
    text = f"### [小蚕小帮手] {title}\n\n{content}"
    return await notifier._do_send(webhook_url, secret, title, text)


# ---------------- 2. 事件订阅过滤器 ---------------- #

def is_event_subscribed(event: Union[str, NotificationEvent]) -> bool:
    """
    检查指定业务事件是否已被全局策略订阅
    对标 BetterGI 的 NotificationEventSubscribe 机制，未订阅的事件直接短路拦截
    """
    ev_str = event.value if isinstance(event, NotificationEvent) else str(event)

    # 测试消息无条件放行
    if ev_str == NotificationEvent.SYSTEM_TEST.value:
        return True

    mapping = {
        NotificationEvent.GRAB_SUCCESS.value: ("notify_on_grab", True),
        NotificationEvent.SPIKE_SUCCESS.value: ("notify_on_spike", True),
        NotificationEvent.MEITUAN_COUPON.value: ("notify_on_meituan", True),
        NotificationEvent.APPOINT_EVENT.value: ("notify_on_appoint", True),
        NotificationEvent.TOKEN_WARN.value: ("notify_on_token_warn", True),
        NotificationEvent.COUPON_EXPIRE.value: ("notify_on_coupon_expire", True),
        NotificationEvent.TASK_FAIL.value: ("notify_on_task_fail", False),
    }

    if ev_str in mapping:
        setting_key, default_val = mapping[ev_str]
        return bool(db.get_setting(setting_key, default_val))

    # 默认放行未显式映射的未知事件
    return True


# ---------------- 3. 单通道即时测试 ---------------- #

async def test_single_channel(channel: str, config: Dict[str, Any]) -> Dict[str, Any]:
    """
    针对单通道执行即时连通性测试
    """
    chan = (channel or "").strip().lower()
    notifier = ALL_NOTIFIERS.get(chan)
    if not notifier:
        return {"ok": False, "channel": channel, "message": f"未知的通知渠道类型: {channel}"}

    try:
        return await notifier.test(config)
    except Exception as e:
        logger.error(f"通道 [{channel}] 测试发生未捕获异常: {e}", exc_info=True)
        return {"ok": False, "channel": channel, "message": f"测试执行异常: {str(e)}"}


# ---------------- 4. 账号专属通道单播 ---------------- #

async def send_single_custom_channel(
    channel: str,
    config: Dict[str, Any],
    title: str,
    content: str,
    level: str = "info"
) -> Dict[str, Any]:
    """向指定的单通道按传入的独立自定义配置定向发送消息"""
    chan = (channel or "").strip().lower()
    notifier = ALL_NOTIFIERS.get(chan)
    if not notifier:
        return {"ok": False, "channel": channel, "message": f"未知的通道类型: {channel}"}

    # 构造临时测试型标准载荷
    n_level = NotificationLevel(level) if level in [e.value for e in NotificationLevel] else NotificationLevel.INFO
    data = NotificationData(
        title=title,
        content=content,
        event=NotificationEvent.GRAB_SUCCESS,
        level=n_level
    )

    # 若为临时通道配置，采用各自通道的定向发送逻辑
    if chan == "clawbot":
        return await clawbot_client.send_message(
            title=title,
            content=content,
            custom_path=config.get("clawbot_auth_path"),
            auth_json_str=config.get("clawbot_auth_json")
        )
    elif chan == "serverchan":
        key = config.get("serverchan_sendkey") or db.get_setting("serverchan_sendkey", "")
        return await notifier._do_send(key, f"[小蚕] {title}", data.format_markdown())
    elif chan == "wxpusher":
        app_token = config.get("wxpusher_app_token") or db.get_setting("wxpusher_app_token", "")
        uids = config.get("wxpusher_uids") or db.get_setting("wxpusher_uids", "")
        return await notifier._do_send(app_token, uids, f"[小蚕] {title}", data.format_markdown())
    elif chan == "wecom":
        url = config.get("wecom_webhook") or db.get_setting("wecom_webhook", "")
        return await notifier._do_send(url, data.format_markdown())
    elif chan == "dingtalk":
        url = config.get("dingtalk_webhook") or db.get_setting("dingtalk_webhook", "")
        sec = config.get("dingtalk_secret") or db.get_setting("dingtalk_secret", "")
        return await notifier._do_send(url, sec, title, data.format_markdown())
    elif chan == "feishu":
        url = config.get("feishu_webhook") or db.get_setting("feishu_webhook", "")
        sec = config.get("feishu_secret") or db.get_setting("feishu_secret", "")
        return await notifier._do_send(url, sec, title, data.format_plain_text())
    elif chan == "bark":
        url = config.get("bark_url") or db.get_setting("bark_url", "")
        group = config.get("bark_group") or db.get_setting("bark_group", "小蚕小帮手")
        sound = config.get("bark_sound") or db.get_setting("bark_sound", "minuet")
        icon = config.get("bark_icon") or db.get_setting("bark_icon", "")
        return await notifier._do_send(url, title, content, group, sound, icon)
    elif chan == "telegram":
        token = config.get("tg_bot_token") or db.get_setting("tg_bot_token", "")
        cid = config.get("tg_chat_id") or db.get_setting("tg_chat_id", "")
        proxy = config.get("tg_proxy_url") or db.get_setting("tg_proxy_url", "")
        api_base = config.get("tg_api_base_url") or db.get_setting("tg_api_base_url", "")
        return await notifier._do_send(token, cid, data.format_markdown(), proxy, api_base)
    elif chan == "webhook":
        url = config.get("webhook_url") or db.get_setting("webhook_url", "")
        method = config.get("webhook_method") or db.get_setting("webhook_method", "POST")
        headers = config.get("webhook_headers") or db.get_setting("webhook_headers", "")
        payload = {
            "source": "xiaocan-assistant",
            "event": "account_custom",
            "level": n_level.value,
            "title": title,
            "content": content
        }
        return await notifier._do_send(url, method, headers, payload)
    elif chan == "email":
        host = config.get("email_host") or db.get_setting("email_host", "")
        port = int(config.get("email_port") or db.get_setting("email_port", 465) or 465)
        ssl_on = bool(config.get("email_ssl", db.get_setting("email_ssl", True)))
        user = config.get("email_user") or db.get_setting("email_user", "")
        password = config.get("email_pass") or db.get_setting("email_pass", "")
        from_addr = config.get("email_from") or db.get_setting("email_from", "")
        to_addr = config.get("email_to") or db.get_setting("email_to", "")
        subject = f"[小蚕小帮手] {title}"
        return await notifier._do_send(host, port, ssl_on, user, password, from_addr, to_addr, subject, content)
    elif chan == "gotify":
        url = config.get("gotify_url") or db.get_setting("gotify_url", "")
        token = config.get("gotify_token") or db.get_setting("gotify_token", "")
        priority = int(config.get("gotify_priority") or db.get_setting("gotify_priority", 5) or 5)
        return await notifier._do_send(url, token, title, content, priority)
    elif chan == "discord":
        url = config.get("discord_webhook") or db.get_setting("discord_webhook", "")
        username = config.get("discord_username") or db.get_setting("discord_username", "小蚕小帮手")
        return await notifier._do_send(url, title, content, n_level, username)
    elif chan == "qq_bot":
        api_url = config.get("qq_bot_api") or db.get_setting("qq_bot_api", "http://127.0.0.1:8080")
        target_type = config.get("qq_bot_target_type") or db.get_setting("qq_bot_target_type", "group")
        group_id = config.get("qq_bot_group_id") or db.get_setting("qq_bot_group_id", "")
        user_id = config.get("qq_bot_user_id") or db.get_setting("qq_bot_user_id", "")
        token = config.get("qq_bot_token") or db.get_setting("qq_bot_token", "")
        return await notifier._do_send(api_url, target_type, group_id, user_id, token, data.format_plain_text())

    return await notifier.send(data)


async def send_account_notification(
    account_key: str,
    title: str,
    content: str,
    level: str = "info",
    event: Union[str, NotificationEvent] = NotificationEvent.GRAB_SUCCESS
) -> Dict[str, Any]:
    """精准向指定账号绑定的专属通道定向推送"""
    if not is_event_subscribed(event):
        logger.info(f"事件 [{event}] 未被全局策略订阅，已跳过账号 [{account_key}] 推送")
        return {"ok": True, "skipped": True, "message": f"事件 [{event}] 未订阅，已跳过"}

    if not account_key or not account_key.strip():
        data = NotificationData(
            title=title,
            content=content,
            event=event if isinstance(event, NotificationEvent) else NotificationEvent(event),
            level=NotificationLevel(level) if level in [e.value for e in NotificationLevel] else NotificationLevel.INFO
        )
        return await _send_global_system_notification(data)

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
            data = NotificationData(
                title=title,
                content=content,
                event=event if isinstance(event, NotificationEvent) else NotificationEvent(event),
                level=NotificationLevel(level) if level in [e.value for e in NotificationLevel] else NotificationLevel.INFO,
                account_key=account_key
            )
            return await _send_global_system_notification(data)

        res = await send_single_custom_channel(channel, cfg, title, content, level)
        logger.info(f"账号 [{account_key}] 专属通道 [{channel}] 发送结果: {res.get('ok')} - {res.get('message')}")
        return res

    # global 模式下广播
    acc = db.get_account_by_key(account_key)
    acc_name = acc.get("nickname") if acc else account_key
    data = NotificationData(
        title=title,
        content=content,
        event=event if isinstance(event, NotificationEvent) else NotificationEvent(event),
        level=NotificationLevel(level) if level in [e.value for e in NotificationLevel] else NotificationLevel.INFO,
        account_key=account_key,
        account_name=acc_name
    )
    return await _send_global_system_notification(data)


async def test_account_channel(account_key: str, mode: str, config: Dict[str, Any]) -> Dict[str, Any]:
    """即时测试指定账号的通知通道连通性"""
    acc = db.get_account_by_key(account_key)
    acc_name = acc.get("nickname") if acc else account_key
    test_title = f"专属通知连通测试 · {acc_name}"
    test_content = (
        f"这是一条发往账号【{acc_name}】专属通道的连通性测试消息。\n"
        f"如果你收到本条推送，说明你的独立个人通道已正确接入，后续该账号的中签、抢单与预警消息将仅定向发送至此处。"
    )

    if mode == "disabled":
        return {"ok": True, "message": "当前为静音模式，已跳过发送"}

    if mode == "global":
        test_data = NotificationData(
            title=test_title,
            content=test_content,
            event=NotificationEvent.SYSTEM_TEST,
            level=NotificationLevel.INFO,
            account_key=account_key,
            account_name=acc_name
        )
        res = await _send_global_system_notification(test_data)
        return {
            "ok": res.get("ok", False),
            "message": f"已触发全局通道广播测试 (成功通道: {', '.join(res.get('channels', [])) or '无'})"
        }

    channel = config.get("channel")
    if not channel:
        return {"ok": False, "message": "请先选择需要绑定的通知渠道类型"}

    return await send_single_custom_channel(channel, config, test_title, test_content)


# ---------------- 5. 全局系统通知智能分发中枢 ---------------- #

async def send_system_notification(
    title: str,
    content: str,
    level: str = "info",
    account_key: Optional[str] = None,
    event: Union[str, NotificationEvent] = NotificationEvent.GRAB_SUCCESS,
    metadata: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    智能分发系统通知：
    1. 校验全局事件订阅策略：若该事件未被用户启用，立即短路跳过，杜绝扰民；
    2. 若提供了 account_key，且该账号独立配置了 notify_mode ('custom' 或 'disabled')，则精准按账号策略单播派发；
    3. 若未提供 account_key 或账号配置为 'global'，则全量并发广播至系统所有已启用的全局通道。
    """
    ev = event if isinstance(event, NotificationEvent) else NotificationEvent(event)
    if not is_event_subscribed(ev):
        logger.debug(f"通知事件 [{ev.value}] 未订阅，已自动忽略")
        return {"ok": True, "skipped": True, "event": ev.value, "message": f"事件 [{ev.value}] 未订阅"}

    if account_key and account_key.strip():
        cfg_info = db.get_account_notify_config(account_key.strip())
        mode = cfg_info.get("notify_mode") or "global"
        if mode in ("custom", "disabled"):
            return await send_account_notification(account_key.strip(), title, content, level, ev)

    acc_name = None
    if account_key:
        acc = db.get_account_by_key(account_key.strip())
        if acc:
            acc_name = acc.get("nickname")

    n_level = NotificationLevel(level) if level in [e.value for e in NotificationLevel] else NotificationLevel.INFO
    data = NotificationData(
        title=title,
        content=content,
        event=ev,
        level=n_level,
        account_key=account_key,
        account_name=acc_name,
        metadata=metadata or {}
    )

    return await _send_global_system_notification(data)


async def _send_global_system_notification(data: NotificationData) -> Dict[str, Any]:
    """向所有已启用的全局通知通道并发广播消息"""
    channels_sent: List[str] = []
    errors: List[str] = []

    # 收集已开启通道的发送任务
    tasks = []
    channel_keys = []

    for key, notifier in ALL_NOTIFIERS.items():
        # 各通道自行在 send() 中依据 db.get_setting("{key}_enabled") 快速短路
        tasks.append(notifier.send(data))
        channel_keys.append(key)

    results = await asyncio.gather(*tasks, return_exceptions=True)

    for key, res in zip(channel_keys, results):
        if isinstance(res, Exception):
            logger.warning(f"通道 [{key}] 发送异常: {res}")
            errors.append(f"{key}: {str(res)}")
        elif isinstance(res, dict):
            if res.get("ok"):
                channels_sent.append(key)
            elif not res.get("skipped"):
                errors.append(f"{key}: {res.get('message')}")

    return {
        "ok": len(channels_sent) > 0 or len(errors) == 0,
        "channels": channels_sent,
        "errors": errors
    }


# ---------------- 6. 全局通道可用性检测 ---------------- #

def is_any_notify_channel_enabled() -> bool:
    """
    检查是否至少开启并配置了一个可用的通知通道
    """
    # 1. 微信 ClawBot
    if db.get_setting("clawbot_enabled", True):
        auth, _ = load_clawbot_auth()
        if auth and auth.get("token") and auth.get("userId"):
            return True

    # 2. Server酱
    if db.get_setting("serverchan_enabled", False):
        if (db.get_setting("serverchan_sendkey", "") or "").strip():
            return True

    # 3. WxPusher
    if db.get_setting("wxpusher_enabled", False):
        if (db.get_setting("wxpusher_app_token", "") or "").strip() and (db.get_setting("wxpusher_uids", "") or "").strip():
            return True

    # 4. 企业微信 Webhook
    if db.get_setting("wecom_enabled", False):
        wecom = (db.get_setting("wecom_webhook", "") or "").strip()
        if wecom and wecom.startswith("http"):
            return True

    # 5. 钉钉机器人
    if db.get_setting("dingtalk_enabled", False):
        ding = (db.get_setting("dingtalk_webhook", "") or "").strip()
        if ding and ding.startswith("http"):
            return True

    # 6. 飞书机器人
    if db.get_setting("feishu_enabled", False):
        feishu = (db.get_setting("feishu_webhook", "") or "").strip()
        if feishu and feishu.startswith("http"):
            return True

    # 7. iOS Bark
    if db.get_setting("bark_enabled", False):
        bark = (db.get_setting("bark_url", "") or "").strip()
        if bark:
            return True

    # 8. Telegram Bot
    if db.get_setting("telegram_enabled", False):
        tg_token = (db.get_setting("tg_bot_token", "") or "").strip()
        tg_chat_id = (db.get_setting("tg_chat_id", "") or "").strip()
        if tg_token and tg_chat_id:
            return True

    # 9. 通用 Webhook
    if db.get_setting("webhook_enabled", False):
        wh = (db.get_setting("webhook_url", "") or "").strip()
        if wh and wh.startswith("http"):
            return True

    # 10. SMTP 邮件
    if db.get_setting("email_enabled", False):
        if (db.get_setting("email_host", "") or "").strip() and (db.get_setting("email_to", "") or "").strip():
            return True

    # 11. Gotify
    if db.get_setting("gotify_enabled", False):
        if (db.get_setting("gotify_url", "") or "").strip() and (db.get_setting("gotify_token", "") or "").strip():
            return True

    # 12. Discord
    if db.get_setting("discord_enabled", False):
        dc = (db.get_setting("discord_webhook", "") or "").strip()
        if dc and dc.startswith("http"):
            return True

    # 13. QQ 机器人
    if db.get_setting("qq_bot_enabled", True):
        qq_api = (db.get_setting("qq_bot_api", "") or "").strip()
        if qq_api and (db.get_setting("qq_bot_group_id") or db.get_setting("qq_bot_user_id")):
            return True

    return False
