"""
飞书群机器人 Webhook 推送适配器
支持可选加签鉴权与富文本 post 消息格式
"""
import time
import hmac
import hashlib
import base64
import logging
from typing import Dict, Any, Optional
import httpx
from .base import BaseNotifier
from ..models import NotificationData
from ....models import database as db

logger = logging.getLogger("xiaocan.notifier.feishu")


class FeishuNotifier(BaseNotifier):
    name = "feishu"
    display_name = "飞书群机器人"

    async def _do_send(self, webhook_url: str, secret: Optional[str], title: str, content: str) -> Dict[str, Any]:
        url = (webhook_url or "").strip()
        if not url or not url.startswith("http"):
            return {"ok": False, "channel": self.name, "message": "飞书 Webhook 地址格式不正确"}

        payload: Dict[str, Any] = {
            "msg_type": "post",
            "content": {
                "post": {
                    "zh_cn": {
                        "title": f"[小蚕小帮手] {title}",
                        "content": [
                          [{"tag": "text", "text": content}]
                        ]
                    }
                }
            }
        }

        sec = (secret or "").strip()
        if sec:
            timestamp = str(int(time.time()))
            string_to_sign = f"{timestamp}\n{sec}".encode("utf-8")
            hmac_code = hmac.new(string_to_sign, digestmod=hashlib.sha256).digest()
            sign = base64.b64encode(hmac_code).decode("utf-8")
            payload["timestamp"] = timestamp
            payload["sign"] = sign

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code == 200:
                    res_data = resp.json()
                    code = res_data.get("code") if res_data.get("code") is not None else res_data.get("StatusCode")
                    if code == 0:
                        return {"ok": True, "channel": self.name, "message": "飞书机器人通知发送成功"}
                    errmsg = res_data.get("msg") or str(res_data)
                    return {"ok": False, "channel": self.name, "message": f"飞书返回错误: {errmsg}"}
                return {"ok": False, "channel": self.name, "message": f"飞书 HTTP 状态码: {resp.status_code}"}
        except Exception as e:
            logger.warning(f"飞书推送异常: {e}")
            return {"ok": False, "channel": self.name, "message": f"飞书通信异常: {str(e)}"}

    async def send(self, data: NotificationData) -> Dict[str, Any]:
        if not db.get_setting("feishu_enabled", False):
            return {"ok": False, "channel": self.name, "skipped": True, "message": "飞书通道已关闭"}

        url = db.get_setting("feishu_webhook", "")
        secret = db.get_setting("feishu_secret", "")
        return await self._do_send(url, secret, data.title, data.format_plain_text())

    async def test(self, config: Dict[str, Any]) -> Dict[str, Any]:
        url = config.get("feishu_webhook") or db.get_setting("feishu_webhook", "")
        secret = config.get("feishu_secret") or db.get_setting("feishu_secret", "")
        test_title = "通知连通性测试"
        test_content = (
            "这是一条来自小蚕小帮手的连通性测试消息。如果你在飞书群中收到此卡片，"
            "说明飞书群机器人通道已成功接入并正常工作。"
        )
        return await self._do_send(url, secret, test_title, test_content)
