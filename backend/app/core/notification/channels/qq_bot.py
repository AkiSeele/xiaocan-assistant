"""
QQ 聊天机器人推送适配器 (遵循 OneBot V11 HTTP 标准)
直连本地 NoneBot2 / mystool-bot / SnowLuma / NapCat 等协议端
"""
import logging
from typing import Dict, Any, Optional
import httpx
from .base import BaseNotifier
from ..models import NotificationData
from ....models import database as db

logger = logging.getLogger("xiaocan.notifier.qq_bot")


class QqBotNotifier(BaseNotifier):
    name = "qq_bot"
    display_name = "QQ 机器人 (OneBot V11)"

    async def _do_send(
        self,
        api_url: str,
        target_type: str,
        group_id: Optional[str],
        user_id: Optional[str],
        token: Optional[str],
        text: str
    ) -> Dict[str, Any]:
        raw_api = (api_url or "").strip().rstrip("/")
        if not raw_api:
            return {"ok": False, "channel": self.name, "message": "QQ 机器人 API 地址未配置"}

        ttype = (target_type or "group").strip()
        gid_str = (group_id or "").strip()
        uid_str = (user_id or "").strip()
        auth_token = (token or "").strip()

        headers = {"Content-Type": "application/json"}
        if auth_token:
            headers["Authorization"] = f"Bearer {auth_token}"

        sub_results = []
        errors = []

        async with httpx.AsyncClient(timeout=10.0) as client:
            # 群聊推送
            if ttype in ("group", "both") and gid_str:
                try:
                    gid = int(gid_str)
                    endpoint = f"{raw_api}/send_group_msg"
                    payload = {"group_id": gid, "message": text}
                    resp = await client.post(endpoint, json=payload, headers=headers)
                    if resp.status_code == 200:
                        rdata = resp.json()
                        if rdata.get("status") == "ok" or rdata.get("retcode") == 0:
                            sub_results.append(f"群聊({gid})推送成功")
                        else:
                            errors.append(f"群聊({gid})响应失败: {rdata.get('message') or rdata}")
                    else:
                        errors.append(f"群聊 HTTP 状态码: {resp.status_code}")
                except Exception as e:
                    errors.append(f"群聊发送异常: {str(e)}")

            # 私聊推送
            if ttype in ("private", "both") and uid_str:
                try:
                    uid = int(uid_str)
                    endpoint = f"{raw_api}/send_private_msg"
                    payload = {"user_id": uid, "message": text}
                    resp = await client.post(endpoint, json=payload, headers=headers)
                    if resp.status_code == 200:
                        rdata = resp.json()
                        if rdata.get("status") == "ok" or rdata.get("retcode") == 0:
                            sub_results.append(f"私聊({uid})推送成功")
                        else:
                            errors.append(f"私聊({uid})响应失败: {rdata.get('message') or rdata}")
                    else:
                        errors.append(f"私聊 HTTP 状态码: {resp.status_code}")
                except Exception as e:
                    errors.append(f"私聊发送异常: {str(e)}")

        if not sub_results and not errors:
            return {"ok": False, "channel": self.name, "message": "未配置有效的群号或管理员 QQ 号"}

        ok = len(sub_results) > 0
        msg = "; ".join(sub_results) if ok else "; ".join(errors)
        return {"ok": ok, "channel": self.name, "message": msg, "errors": errors}

    async def send(self, data: NotificationData) -> Dict[str, Any]:
        if not db.get_setting("qq_bot_enabled", True):
            return {"ok": False, "channel": self.name, "skipped": True, "message": "QQ 机器人通道已关闭"}

        api_url = db.get_setting("qq_bot_api", "http://127.0.0.1:8080")
        target_type = db.get_setting("qq_bot_target_type", "group")
        group_id = db.get_setting("qq_bot_group_id", "")
        user_id = db.get_setting("qq_bot_user_id", "")
        token = db.get_setting("qq_bot_token", "")
        return await self._do_send(api_url, target_type, group_id, user_id, token, data.format_plain_text())

    async def test(self, config: Dict[str, Any]) -> Dict[str, Any]:
        api_url = config.get("qq_bot_api") or db.get_setting("qq_bot_api", "http://127.0.0.1:8080")
        target_type = config.get("qq_bot_target_type") or db.get_setting("qq_bot_target_type", "group")
        group_id = config.get("qq_bot_group_id") or db.get_setting("qq_bot_group_id", "")
        user_id = config.get("qq_bot_user_id") or db.get_setting("qq_bot_user_id", "")
        token = config.get("qq_bot_token") or db.get_setting("qq_bot_token", "")

        test_title = "通知连通性测试"
        test_content = (
            f"[小蚕小帮手] {test_title}\n"
            "这是一条来自小蚕小帮手的连通性测试消息。如果你收到此消息，说明 OneBot V11 协议端已成功接入并正常工作。"
        )
        return await self._do_send(api_url, target_type, group_id, user_id, token, test_content)
