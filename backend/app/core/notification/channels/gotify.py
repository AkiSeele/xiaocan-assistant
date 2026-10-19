"""
Gotify 自建消息推送服务适配器
支持私有部署服务器、应用 Token 与优先级配置
"""
import logging
from typing import Dict, Any, Optional
import httpx
from .base import BaseNotifier
from ..models import NotificationData
from ....models import database as db

logger = logging.getLogger("xiaocan.notifier.gotify")


class GotifyNotifier(BaseNotifier):
    name = "gotify"
    display_name = "Gotify 消息推送"

    async def _do_send(
        self,
        gotify_url: str,
        token: str,
        title: str,
        message: str,
        priority: int = 5
    ) -> Dict[str, Any]:
        url = (gotify_url or "").strip().rstrip("/")
        app_token = (token or "").strip()
        if not url or not url.startswith("http"):
            return {"ok": False, "channel": self.name, "message": "Gotify 服务器地址格式不正确"}
        if not app_token:
            return {"ok": False, "channel": self.name, "message": "Gotify App Token 未配置"}

        endpoint = f"{url}/message"
        headers = {
            "X-Gotify-Key": app_token,
            "Content-Type": "application/json"
        }
        payload = {
            "title": f"[小蚕小帮手] {title}",
            "message": message,
            "priority": max(1, min(10, priority or 5))
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(endpoint, json=payload, headers=headers)
                if resp.status_code == 200:
                    return {"ok": True, "channel": self.name, "message": "Gotify 消息发送成功"}
                if resp.status_code == 401 or resp.status_code == 403:
                    return {"ok": False, "channel": self.name, "message": "Gotify 认证失败: Token 无效或无权推送"}
                return {"ok": False, "channel": self.name, "message": f"Gotify HTTP 状态异常: {resp.status_code}"}
        except Exception as e:
            logger.warning(f"Gotify 推送异常: {e}")
            return {"ok": False, "channel": self.name, "message": f"Gotify 通信异常: {str(e)}"}

    async def send(self, data: NotificationData) -> Dict[str, Any]:
        if not db.get_setting("gotify_enabled", False):
            return {"ok": False, "channel": self.name, "skipped": True, "message": "Gotify 通道已关闭"}

        url = db.get_setting("gotify_url", "")
        token = db.get_setting("gotify_token", "")
        priority = int(db.get_setting("gotify_priority", 5) or 5)
        return await self._do_send(url, token, data.title, data.content, priority)

    async def test(self, config: Dict[str, Any]) -> Dict[str, Any]:
        url = config.get("gotify_url") or db.get_setting("gotify_url", "")
        token = config.get("gotify_token") or db.get_setting("gotify_token", "")
        priority = int(config.get("gotify_priority") or db.get_setting("gotify_priority", 5) or 5)
        test_title = "通知连通性测试"
        test_content = "这是一条来自小蚕小帮手的连通性测试消息。如果你收到此消息，说明 Gotify 推送通道已成功接入并正常工作。"
        return await self._do_send(url, token, test_title, test_content, priority)
