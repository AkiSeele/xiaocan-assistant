"""
Server酱 (Turbo / 3) 微信公众号推送适配器
通过方糖气球提供的 SendKey 直接推送至绑定的个人微信服务号
"""
import logging
from typing import Dict, Any, Optional
import httpx
from .base import BaseNotifier
from ..models import NotificationData
from ....models import database as db

logger = logging.getLogger("xiaocan.notifier.serverchan")


class ServerChanNotifier(BaseNotifier):
    name = "serverchan"
    display_name = "Server酱 (Turbo/3)"

    async def _do_send(self, sendkey: str, title: str, desp: str) -> Dict[str, Any]:
        key = (sendkey or "").strip()
        if not key:
            return {"ok": False, "channel": self.name, "message": "Server酱 SendKey 未配置"}

        url = f"https://sctapi.ftqq.com/{key}.send"
        payload = {
            "title": title[:32],  # Server酱标题限制 32 字符
            "desp": desp
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, data=payload)
                if resp.status_code == 200:
                    res_data = resp.json()
                    code = res_data.get("code")
                    if code == 0:
                        return {"ok": True, "channel": self.name, "message": "Server酱推送成功"}
                    err_msg = res_data.get("message") or res_data.get("info") or str(res_data)
                    return {"ok": False, "channel": self.name, "message": f"Server酱返回错误: {err_msg}"}
                return {"ok": False, "channel": self.name, "message": f"Server酱 HTTP 状态异常: {resp.status_code}"}
        except Exception as e:
            logger.warning(f"Server酱推送异常: {e}")
            return {"ok": False, "channel": self.name, "message": f"Server酱通信异常: {str(e)}"}

    async def send(self, data: NotificationData) -> Dict[str, Any]:
        if not db.get_setting("serverchan_enabled", False):
            return {"ok": False, "channel": self.name, "skipped": True, "message": "Server酱通道已关闭"}

        sendkey = db.get_setting("serverchan_sendkey", "")
        return await self._do_send(sendkey, f"[小蚕] {data.title}", data.format_markdown())

    async def test(self, config: Dict[str, Any]) -> Dict[str, Any]:
        sendkey = config.get("serverchan_sendkey") or db.get_setting("serverchan_sendkey", "")
        test_title = "通知连通性测试"
        test_content = "这是一条来自小蚕小帮手的连通性测试消息。如果你在微信公众号中收到此卡片，说明 Server酱 (Turbo/3) 推送通道已成功接入并正常工作。"
        return await self._do_send(sendkey, f"[小蚕] {test_title}", test_content)
