"""
iOS Bark 极速通知推送适配器
支持设备 Key、自建服务端、声音选择、分组与角标自定义
"""
import logging
from typing import Dict, Any, Optional
import httpx
from .base import BaseNotifier
from ..models import NotificationData
from ....models import database as db

logger = logging.getLogger("xiaocan.notifier.bark")


class BarkNotifier(BaseNotifier):
    name = "bark"
    display_name = "iOS Bark 推送"

    async def _do_send(
        self,
        bark_url: str,
        title: str,
        body: str,
        group: Optional[str] = None,
        sound: Optional[str] = None,
        icon: Optional[str] = None
    ) -> Dict[str, Any]:
        raw_url = (bark_url or "").strip()
        if not raw_url:
            return {"ok": False, "channel": self.name, "message": "Bark 推送地址或 Key 未配置"}

        endpoint = raw_url if raw_url.startswith("http") else f"https://api.day.app/{raw_url}"
        endpoint = endpoint.rstrip("/")

        payload: Dict[str, Any] = {
            "title": f"[小蚕小帮手] {title}",
            "body": body,
            "group": (group or "小蚕小帮手").strip(),
            "level": "timeSensitive"
        }
        if sound and sound.strip():
            payload["sound"] = sound.strip()
        if icon and icon.strip():
            payload["icon"] = icon.strip()

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(endpoint, json=payload)
                if resp.status_code == 200:
                    res_data = resp.json()
                    if res_data.get("code") == 200:
                        return {"ok": True, "channel": self.name, "message": "Bark 推送成功"}
                    return {"ok": False, "channel": self.name, "message": f"Bark 返回状态: {res_data.get('message')}"}
                return {"ok": False, "channel": self.name, "message": f"Bark HTTP 状态码: {resp.status_code}"}
        except Exception as e:
            logger.warning(f"Bark 推送异常: {e}")
            return {"ok": False, "channel": self.name, "message": f"Bark 通信异常: {str(e)}"}

    async def send(self, data: NotificationData) -> Dict[str, Any]:
        if not db.get_setting("bark_enabled", False):
            return {"ok": False, "channel": self.name, "skipped": True, "message": "Bark 通道已关闭"}

        bark_url = db.get_setting("bark_url", "")
        group = db.get_setting("bark_group", "小蚕小帮手")
        sound = db.get_setting("bark_sound", "minuet")
        icon = db.get_setting("bark_icon", "")
        return await self._do_send(bark_url, data.title, data.content, group, sound, icon)

    async def test(self, config: Dict[str, Any]) -> Dict[str, Any]:
        bark_url = config.get("bark_url") or db.get_setting("bark_url", "")
        group = config.get("bark_group") or db.get_setting("bark_group", "小蚕小帮手")
        sound = config.get("bark_sound") or db.get_setting("bark_sound", "minuet")
        icon = config.get("bark_icon") or db.get_setting("bark_icon", "")
        test_title = "通知连通性测试"
        test_content = "这是一条来自小蚕小帮手的连通性测试消息。如果你在 iPhone 锁屏或通知中心收到震动横幅，说明 Bark 通道已成功接入。"
        return await self._do_send(bark_url, test_title, test_content, group, sound, icon)
