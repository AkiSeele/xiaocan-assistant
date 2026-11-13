"""
WxPusher 微信推送服务适配器
微信扫码关注 WxPusher 公众号，免搭建且配额充足
"""
import logging
from typing import Dict, Any, List
import httpx
from .base import BaseNotifier
from ..models import NotificationData
from ....models import database as db

logger = logging.getLogger("xiaocan.notifier.wxpusher")


class WxPusherNotifier(BaseNotifier):
    name = "wxpusher"
    display_name = "WxPusher 微信推送"

    async def _do_send(self, app_token: str, uids_str: str, title: str, content: str) -> Dict[str, Any]:
        token = (app_token or "").strip()
        if not token:
            return {"ok": False, "channel": self.name, "message": "WxPusher appToken 未配置"}

        raw_uids = (uids_str or "").strip()
        uids: List[str] = [u.strip() for u in raw_uids.replace("，", ",").split(",") if u.strip()]
        if not uids:
            return {"ok": False, "channel": self.name, "message": "WxPusher UID 列表未配置（请至少填写一个用户 UID）"}

        url = "https://wxpusher.zjiecode.com/api/send/message"
        payload = {
            "appToken": token,
            "content": content,
            "summary": title[:30],
            "contentType": 3,  # 3 表示 Markdown
            "uids": uids
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code == 200:
                    res_data = resp.json()
                    code = res_data.get("code")
                    if code == 1000:
                        data_list = res_data.get("data") or []
                        if isinstance(data_list, list) and len(data_list) > 0:
                            ok_count = 0
                            failed_msgs: List[str] = []
                            for item in data_list:
                                if not isinstance(item, dict):
                                    continue
                                item_code = item.get("code")
                                item_uid = item.get("uid") or ""
                                item_status = item.get("status") or item.get("msg") or f"错误码 {item_code}"
                                if item_code == 1000:
                                    ok_count += 1
                                else:
                                    failed_msgs.append(f"{item_uid or 'UID'}: {item_status}")
                            if ok_count == 0 and failed_msgs:
                                return {
                                    "ok": False,
                                    "channel": self.name,
                                    "message": f"WxPusher 投递失败（{'; '.join(failed_msgs)}）。请确认该 UID 已微信扫码关注当前应用对应的 WxPusher 公众号",
                                }
                            if failed_msgs:
                                return {
                                    "ok": True,
                                    "channel": self.name,
                                    "message": f"WxPusher 部分成功（成功 {ok_count} 个，失败: {'; '.join(failed_msgs)}）",
                                }
                        return {"ok": True, "channel": self.name, "message": "WxPusher 消息发送成功"}
                    err_msg = res_data.get("msg") or str(res_data)
                    return {"ok": False, "channel": self.name, "message": f"WxPusher 返回错误: {err_msg}"}
                return {"ok": False, "channel": self.name, "message": f"WxPusher HTTP 状态异常: {resp.status_code}"}
        except Exception as e:
            logger.warning(f"WxPusher 推送异常: {e}")
            return {"ok": False, "channel": self.name, "message": f"WxPusher 通信异常: {str(e)}"}

    async def send(self, data: NotificationData) -> Dict[str, Any]:
        if not db.get_setting("wxpusher_enabled", False):
            return {"ok": False, "channel": self.name, "skipped": True, "message": "WxPusher 通道已关闭"}

        app_token = db.get_setting("wxpusher_app_token", "")
        uids = db.get_setting("wxpusher_uids", "")
        return await self._do_send(app_token, uids, f"[小蚕] {data.title}", data.format_markdown())

    async def test(self, config: Dict[str, Any]) -> Dict[str, Any]:
        app_token = config.get("wxpusher_app_token") or db.get_setting("wxpusher_app_token", "")
        uids = config.get("wxpusher_uids") or db.get_setting("wxpusher_uids", "")
        test_title = "通知连通性测试"
        test_content = (
            "### [小蚕小帮手] 通知连通性测试\n\n"
            "这是一条来自小蚕小帮手的连通性测试消息。如果你在微信公众号中收到此卡片，"
            "说明 WxPusher 微信推送通道已成功接入并正常工作。"
        )
        return await self._do_send(app_token, uids, f"[小蚕] {test_title}", test_content)
