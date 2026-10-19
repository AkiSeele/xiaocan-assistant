"""
Discord Webhook 消息推送适配器
支持向指定的 Discord 频道 Webhook 发送格式化 Embed 卡片
"""
import logging
from typing import Dict, Any, Optional
import httpx
from .base import BaseNotifier
from ..models import NotificationData, NotificationLevel
from ....models import database as db

logger = logging.getLogger("xiaocan.notifier.discord")


class DiscordNotifier(BaseNotifier):
    name = "discord"
    display_name = "Discord Webhook"

    async def _do_send(
        self,
        webhook_url: str,
        title: str,
        content: str,
        level: NotificationLevel = NotificationLevel.INFO,
        username: Optional[str] = None
    ) -> Dict[str, Any]:
        url = (webhook_url or "").strip()
        if not url or not url.startswith("http"):
            return {"ok": False, "channel": self.name, "message": "Discord Webhook 地址格式不正确"}

        color_map = {
            NotificationLevel.INFO: 0x3498DB,     # 蓝色
            NotificationLevel.SUCCESS: 0x2ECC71,  # 绿色
            NotificationLevel.WARNING: 0xF1C40F,  # 黄色
            NotificationLevel.ERROR: 0xE74C3C     # 红色
        }

        payload: Dict[str, Any] = {
            "username": (username or "小蚕小帮手").strip(),
            "embeds": [
                {
                    "title": f"[小蚕小帮手] {title}",
                    "description": content,
                    "color": color_map.get(level, 0x3498DB)
                }
            ]
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code in (200, 204):
                    return {"ok": True, "channel": self.name, "message": "Discord 消息发送成功"}
                return {"ok": False, "channel": self.name, "message": f"Discord HTTP 状态码: {resp.status_code}"}
        except Exception as e:
            logger.warning(f"Discord 推送异常: {e}")
            return {"ok": False, "channel": self.name, "message": f"Discord 通信异常: {str(e)}"}

    async def send(self, data: NotificationData) -> Dict[str, Any]:
        if not db.get_setting("discord_enabled", False):
            return {"ok": False, "channel": self.name, "skipped": True, "message": "Discord 通道已关闭"}

        url = db.get_setting("discord_webhook", "")
        username = db.get_setting("discord_username", "小蚕小帮手")
        return await self._do_send(url, data.title, data.content, data.level, username)

    async def test(self, config: Dict[str, Any]) -> Dict[str, Any]:
        url = config.get("discord_webhook") or db.get_setting("discord_webhook", "")
        username = config.get("discord_username") or db.get_setting("discord_username", "小蚕小帮手")
        test_title = "通知连通性测试"
        test_content = "这是一条来自小蚕小帮手的连通性测试消息。如果你在频道中收到此 Embed 卡片，说明 Discord 通道已成功接入并正常工作。"
        return await self._do_send(url, test_title, test_content, NotificationLevel.SUCCESS, username)
