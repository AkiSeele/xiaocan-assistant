"""
企业微信群机器人 Webhook 推送适配器
支持 Markdown 排版
"""
import logging
from typing import Dict, Any
import httpx
from .base import BaseNotifier
from ..models import NotificationData
from ....models import database as db

logger = logging.getLogger("xiaocan.notifier.wecom")


class WeComNotifier(BaseNotifier):
    name = "wecom"
    display_name = "企业微信机器人"

    async def _do_send(self, webhook_url: str, md_content: str) -> Dict[str, Any]:
        url = (webhook_url or "").strip()
        if not url or not url.startswith("http"):
            return {"ok": False, "channel": self.name, "message": "企业微信 Webhook 地址格式不正确"}

        payload = {
            "msgtype": "markdown",
            "markdown": {
                "content": md_content
            }
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code == 200:
                    res_data = resp.json()
                    if res_data.get("errcode") == 0:
                        return {"ok": True, "channel": self.name, "message": "企业微信机器人通知发送成功"}
                    return {"ok": False, "channel": self.name, "message": f"企业微信返回错误: {res_data.get('errmsg')}"}
                return {"ok": False, "channel": self.name, "message": f"企业微信 HTTP 状态码: {resp.status_code}"}
        except Exception as e:
            logger.warning(f"企业微信推送异常: {e}")
            return {"ok": False, "channel": self.name, "message": f"企业微信通信异常: {str(e)}"}

    async def send(self, data: NotificationData) -> Dict[str, Any]:
        if not db.get_setting("wecom_enabled", False):
            return {"ok": False, "channel": self.name, "skipped": True, "message": "企业微信通道已关闭"}

        url = db.get_setting("wecom_webhook", "")
        return await self._do_send(url, data.format_markdown())

    async def test(self, config: Dict[str, Any]) -> Dict[str, Any]:
        url = config.get("wecom_webhook") or db.get_setting("wecom_webhook", "")
        test_content = (
            "### [小蚕小帮手] 通知连通性测试\n\n"
            "这是一条来自小蚕小帮手的连通性测试消息。如果你在企业微信群中收到此卡片，"
            "说明企业微信群机器人通道已成功接入并正常工作。"
        )
        return await self._do_send(url, test_content)
