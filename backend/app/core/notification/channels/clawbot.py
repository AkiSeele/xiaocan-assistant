"""
微信官方 ClawBot 推送通道 (腾讯 iLink 灰度协议)
直接委托至本地原生 clawbot_client 模块，保持零第三方依赖
"""
import logging
from typing import Dict, Any
from .base import BaseNotifier
from ..models import NotificationData
from ... import clawbot_client
from ....models import database as db

logger = logging.getLogger("xiaocan.notifier.clawbot")


class ClawBotNotifier(BaseNotifier):
    name = "clawbot"
    display_name = "微信官方 ClawBot"

    async def send(self, data: NotificationData) -> Dict[str, Any]:
        """向已绑定的微信 ClawBot 会话推送消息"""
        if not db.get_setting("clawbot_enabled", True):
            return {"ok": False, "channel": self.name, "skipped": True, "message": "微信 ClawBot 通道已关闭"}

        auth_path = db.get_setting("clawbot_auth_path", "")
        auth_json = db.get_setting("clawbot_auth_json", "")
        return await clawbot_client.send_message(
            title=data.title,
            content=data.content,
            custom_path=auth_path,
            auth_json_str=auth_json
        )

    async def test(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """即时测试微信 ClawBot 连通性"""
        custom_path = config.get("clawbot_auth_path")
        auth_json = config.get("clawbot_auth_json")
        test_title = "通知连通性测试"
        test_content = "这是一条来自小蚕小帮手的连通性测试消息。如果你收到此消息，说明微信官方 ClawBot 推送通道已成功接入并正常工作。"
        return await clawbot_client.send_message(
            title=test_title,
            content=test_content,
            custom_path=custom_path,
            auth_json_str=auth_json
        )
