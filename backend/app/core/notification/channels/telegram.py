"""
Telegram Bot 通知推送适配器
支持本地 HTTP/SOCKS 代理与自定义反代 API 网关，彻底解决国内网络无法直连问题
"""
import logging
from typing import Dict, Any, Optional
import httpx
from .base import BaseNotifier
from ..models import NotificationData
from ....models import database as db

logger = logging.getLogger("xiaocan.notifier.telegram")


class TelegramNotifier(BaseNotifier):
    name = "telegram"
    display_name = "Telegram 机器人"

    async def _do_send(
        self,
        bot_token: str,
        chat_id: str,
        text: str,
        proxy_url: Optional[str] = None,
        api_base_url: Optional[str] = None
    ) -> Dict[str, Any]:
        token = (bot_token or "").strip()
        cid = (chat_id or "").strip()
        if not token or not cid:
            return {"ok": False, "channel": self.name, "message": "Telegram Bot Token 或 Chat ID 未配置"}

        base = (api_base_url or "").strip().rstrip("/")
        if not base:
            base = "https://api.telegram.org"

        url = f"{base}/bot{token}/sendMessage"
        payload = {
            "chat_id": cid,
            "text": text,
            "parse_mode": "Markdown"
        }

        proxy = (proxy_url or "").strip()
        client_kwargs: Dict[str, Any] = {"timeout": 12.0}
        if proxy and proxy.startswith("http"):
            client_kwargs["proxy"] = proxy

        try:
            async with httpx.AsyncClient(**client_kwargs) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code == 200:
                    res_data = resp.json()
                    if res_data.get("ok"):
                        return {"ok": True, "channel": self.name, "message": "Telegram 消息发送成功"}
                    return {"ok": False, "channel": self.name, "message": f"Telegram 失败: {res_data.get('description')}"}
                if resp.status_code == 401:
                    return {"ok": False, "channel": self.name, "message": "Telegram 认证失败(401): Bot Token 无效"}
                if resp.status_code == 400:
                    return {"ok": False, "channel": self.name, "message": f"Telegram 参数错误(400): 请检查 Chat ID 是否正确或已向 Bot 发送过 /start"}
                return {"ok": False, "channel": self.name, "message": f"Telegram HTTP 状态码: {resp.status_code}"}
        except httpx.ConnectTimeout:
            hint = "连接超时。如在中国大陆网络环境下，请在下方配置本地网络代理(如 http://127.0.0.1:7890)或使用反代 API 网关" if not proxy else "代理连接超时，请检查代理端口是否正常开启"
            return {"ok": False, "channel": self.name, "message": f"Telegram 连接超时: {hint}"}
        except Exception as e:
            logger.warning(f"Telegram 推送异常: {e}")
            return {"ok": False, "channel": self.name, "message": f"Telegram 通信异常: {str(e)}"}

    async def send(self, data: NotificationData) -> Dict[str, Any]:
        if not db.get_setting("telegram_enabled", False):
            return {"ok": False, "channel": self.name, "skipped": True, "message": "Telegram 通道已关闭"}

        bot_token = db.get_setting("tg_bot_token", "")
        chat_id = db.get_setting("tg_chat_id", "")
        proxy_url = db.get_setting("tg_proxy_url", "")
        api_base_url = db.get_setting("tg_api_base_url", "")
        return await self._do_send(bot_token, chat_id, data.format_markdown(), proxy_url, api_base_url)

    async def test(self, config: Dict[str, Any]) -> Dict[str, Any]:
        bot_token = config.get("tg_bot_token") or db.get_setting("tg_bot_token", "")
        chat_id = config.get("tg_chat_id") or db.get_setting("tg_chat_id", "")
        proxy_url = config.get("tg_proxy_url") or db.get_setting("tg_proxy_url", "")
        api_base_url = config.get("tg_api_base_url") or db.get_setting("tg_api_base_url", "")
        test_title = "通知连通性测试"
        test_text = (
            f"*[小蚕小帮手] {test_title}*\n\n"
            "这是一条来自小蚕小帮手的连通性测试消息。如果你收到此消息，"
            "说明 Telegram 机器人通道已成功连通并正常工作。"
        )
        return await self._do_send(bot_token, chat_id, test_text, proxy_url, api_base_url)
