"""
通用 HTTP Webhook 推送适配器
支持向自定义端点发送标准化 JSON 载荷或 GET 请求，无缝对接各类自动化中枢
"""
import time
import json
import logging
from typing import Dict, Any, Optional
import httpx
from .base import BaseNotifier
from ..models import NotificationData, NotificationEvent, NotificationLevel
from ....models import database as db

logger = logging.getLogger("xiaocan.notifier.webhook")


class WebhookNotifier(BaseNotifier):
    name = "webhook"
    display_name = "通用 HTTP Webhook"

    async def _do_send(
        self,
        url: str,
        method: str,
        headers_json_str: Optional[str],
        data_payload: Dict[str, Any]
    ) -> Dict[str, Any]:
        target_url = (url or "").strip()
        if not target_url or not target_url.startswith("http"):
            return {"ok": False, "channel": self.name, "message": "Webhook URL 格式不正确（必须以 http:// 或 https:// 开头）"}

        target_method = (method or "POST").strip().upper()
        headers: Dict[str, str] = {"Content-Type": "application/json"}

        raw_headers = (headers_json_str or "").strip()
        if raw_headers:
            try:
                parsed = json.loads(raw_headers)
                if isinstance(parsed, dict):
                    headers.update({str(k): str(v) for k, v in parsed.items()})
            except Exception as e:
                return {"ok": False, "channel": self.name, "message": f"自定义请求头 JSON 解析失败: {e}"}

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                if target_method == "GET":
                    params = {
                        "title": data_payload.get("title", ""),
                        "content": data_payload.get("content", ""),
                        "event": data_payload.get("event", "")
                    }
                    resp = await client.get(target_url, params=params, headers=headers)
                else:
                    resp = await client.post(target_url, json=data_payload, headers=headers)

                if 200 <= resp.status_code < 300:
                    return {"ok": True, "channel": self.name, "message": f"Webhook 请求成功 (HTTP {resp.status_code})"}
                return {"ok": False, "channel": self.name, "message": f"Webhook 响应异常状态码: HTTP {resp.status_code}"}
        except Exception as e:
            logger.warning(f"Webhook 推送异常: {e}")
            return {"ok": False, "channel": self.name, "message": f"Webhook 通信异常: {str(e)}"}

    async def send(self, data: NotificationData) -> Dict[str, Any]:
        if not db.get_setting("webhook_enabled", False):
            return {"ok": False, "channel": self.name, "skipped": True, "message": "通用 Webhook 通道已关闭"}

        url = db.get_setting("webhook_url", "")
        method = db.get_setting("webhook_method", "POST")
        headers = db.get_setting("webhook_headers", "")

        payload = {
            "source": "xiaocan-assistant",
            "event": data.event.value,
            "level": data.level.value,
            "title": data.title,
            "content": data.content,
            "account_key": data.account_key,
            "account_name": data.account_name,
            "timestamp": data.timestamp,
            "time_str": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(data.timestamp)),
            "metadata": data.metadata
        }
        return await self._do_send(url, method, headers, payload)

    async def test(self, config: Dict[str, Any]) -> Dict[str, Any]:
        url = config.get("webhook_url") or db.get_setting("webhook_url", "")
        method = config.get("webhook_method") or db.get_setting("webhook_method", "POST")
        headers = config.get("webhook_headers") or db.get_setting("webhook_headers", "")

        now = time.time()
        payload = {
            "source": "xiaocan-assistant",
            "event": NotificationEvent.SYSTEM_TEST.value,
            "level": NotificationLevel.INFO.value,
            "title": "通知连通性测试",
            "content": "这是一条来自小蚕小帮手的连通性测试消息，说明自定义 HTTP Webhook 接收端已正常连通。",
            "account_key": "test_account",
            "account_name": "系统测试",
            "timestamp": now,
            "time_str": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(now)),
            "metadata": {"test": True}
        }
        return await self._do_send(url, method, headers, payload)
