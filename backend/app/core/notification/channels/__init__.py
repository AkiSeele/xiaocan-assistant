"""
通知通道适配器包导出与注册表
"""
from typing import Dict, Type
from .base import BaseNotifier
from .clawbot import ClawBotNotifier
from .serverchan import ServerChanNotifier
from .wxpusher import WxPusherNotifier
from .wecom import WeComNotifier
from .dingtalk import DingTalkNotifier
from .feishu import FeishuNotifier
from .bark import BarkNotifier
from .telegram import TelegramNotifier
from .webhook import WebhookNotifier
from .email_notifier import EmailNotifier
from .gotify import GotifyNotifier
from .discord import DiscordNotifier
from .qq_bot import QqBotNotifier

# 全局通道实例注册表
ALL_NOTIFIERS: Dict[str, BaseNotifier] = {
    "clawbot": ClawBotNotifier(),
    "serverchan": ServerChanNotifier(),
    "wxpusher": WxPusherNotifier(),
    "wecom": WeComNotifier(),
    "dingtalk": DingTalkNotifier(),
    "feishu": FeishuNotifier(),
    "bark": BarkNotifier(),
    "telegram": TelegramNotifier(),
    "webhook": WebhookNotifier(),
    "email": EmailNotifier(),
    "gotify": GotifyNotifier(),
    "discord": DiscordNotifier(),
    "qq_bot": QqBotNotifier(),
}

__all__ = [
    "BaseNotifier",
    "ClawBotNotifier",
    "ServerChanNotifier",
    "WxPusherNotifier",
    "WeComNotifier",
    "DingTalkNotifier",
    "FeishuNotifier",
    "BarkNotifier",
    "TelegramNotifier",
    "WebhookNotifier",
    "EmailNotifier",
    "GotifyNotifier",
    "DiscordNotifier",
    "QqBotNotifier",
    "ALL_NOTIFIERS",
]
