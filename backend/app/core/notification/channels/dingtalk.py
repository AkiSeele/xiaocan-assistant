"""
钉钉群机器人 Webhook 推送适配器
支持 HMAC-SHA256 加签鉴权与 Markdown 格式
"""
import time
import hmac
import hashlib
import base64
import urllib.parse
import logging
from typing import Dict, Any, Optional
import httpx
from .base import BaseNotifier
from ..models import NotificationData
from ....models import database as db

logger = logging.getLogger("xiaocan.notifier.dingtalk")


class DingTalkNotifier(BaseNotifier):
    name = "dingtalk"
    display_name = "钉钉群机器人"

    async def _do_send(self, webhook_url: str, secret: Optional[str], title: str, text: str) -> Dict[str, Any]:
        url = (webhook_url or "").strip()
        if not url or not url.startswith("http"):
            return {"ok": False, "channel": self.name, "message": "钉钉 Webhook 地址格式不正确"}

        target_url = url
        sec = (secret or "").strip()
        if sec:
            timestamp = str(round(time.time() * 1000))
            secret_enc = sec.encode("utf-8")
            string_to_sign = f"{timestamp}\n{sec}".encode("utf-8")
            hmac_code = hmac.new(secret_enc, string_to_sign, digestmod=hashlib.sha256).digest()
            sign = urllib.parse.quote_plus(base64.b64encode(hmac_code))
            sep = "&" if "?" in target_url else "?"
            target_url = f"{target_url}{sep}timestamp={timestamp}&sign={sign}"

        payload = {
            "msgtype": "markdown",
            "markdown": {
                "title": f"[小蚕小帮手] {title}",
                "text": text
            }
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(target_url, json=payload)
                if resp.status_code == 200:
                    res_data = resp.json()
                    errcode = res_data.get("errcode")
                    if errcode == 0:
                        return {"ok": True, "channel": self.name, "message": "钉钉机器人通知发送成功"}
                    errmsg = res_data.get("errmsg") or ""
                    if errcode == 310000:
                        return {
                            "ok": False,
                            "channel": self.name,
                            "message": f"钉钉安全校验失败: {errmsg} (请检查是否配置了正确的加签 Secret，或将关键词包含'小蚕')"
                        }
                    return {"ok": False, "channel": self.name, "message": f"钉钉返回错误({errcode}): {errmsg}"}
                return {"ok": False, "channel": self.name, "message": f"钉钉 HTTP 状态码: {resp.status_code}"}
        except Exception as e:
            logger.warning(f"钉钉推送异常: {e}")
            return {"ok": False, "channel": self.name, "message": f"钉钉通信异常: {str(e)}"}

    async def send(self, data: NotificationData) -> Dict[str, Any]:
        if not db.get_setting("dingtalk_enabled", False):
            return {"ok": False, "channel": self.name, "skipped": True, "message": "钉钉通道已关闭"}

        url = db.get_setting("dingtalk_webhook", "")
        secret = db.get_setting("dingtalk_secret", "")
        return await self._do_send(url, secret, data.title, data.format_markdown())

    async def test(self, config: Dict[str, Any]) -> Dict[str, Any]:
        url = config.get("dingtalk_webhook") or db.get_setting("dingtalk_webhook", "")
        secret = config.get("dingtalk_secret") or db.get_setting("dingtalk_secret", "")
        test_title = "通知连通性测试"
        test_text = (
            "### [小蚕小帮手] 通知连通性测试\n\n"
            "这是一条来自小蚕小帮手的连通性测试消息。如果你在钉钉群中收到此卡片，"
            "说明钉钉群机器人通道已成功接入并正常工作。"
        )
        return await self._do_send(url, secret, test_title, test_text)
