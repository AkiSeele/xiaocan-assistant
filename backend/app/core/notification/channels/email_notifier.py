"""
SMTP 邮件通知推送适配器
基于 Python 原生 smtplib 实现，异步线程池派发，无需外部第三方依赖
支持 QQ 邮箱、163 邮箱、Gmail 及企业邮箱等
"""
import asyncio
import smtplib
import socket
from email.mime.text import MIMEText
from email.header import Header
from email.utils import formatdate
import logging
from typing import Dict, Any, List
from .base import BaseNotifier
from ..models import NotificationData
from ....models import database as db

logger = logging.getLogger("xiaocan.notifier.email")


class EmailNotifier(BaseNotifier):
    name = "email"
    display_name = "SMTP 邮件服务"

    def _send_sync(
        self,
        host: str,
        port: int,
        use_ssl: bool,
        user: str,
        password: str,
        from_addr: str,
        to_addrs: List[str],
        subject: str,
        content: str
    ) -> Dict[str, Any]:
        msg = MIMEText(content, "plain", "utf-8")
        msg["Subject"] = Header(subject, "utf-8")
        msg["From"] = Header(f"小蚕小帮手 <{from_addr}>", "utf-8")
        msg["To"] = Header(", ".join(to_addrs), "utf-8")
        msg["Date"] = formatdate(localtime=True)

        try:
            if use_ssl or port == 465:
                server = smtplib.SMTP_SSL(host, port, timeout=12.0)
            else:
                server = smtplib.SMTP(host, port, timeout=12.0)
                try:
                    server.starttls()
                except Exception:
                    pass  # 若服务端不支持 starttls 则继续以明文协商

            if user and password:
                server.login(user, password)

            server.sendmail(from_addr, to_addrs, msg.as_string())
            server.quit()
            return {"ok": True, "channel": self.name, "message": f"邮件已成功发送至 {', '.join(to_addrs)}"}
        except smtplib.SMTPAuthenticationError as auth_err:
            return {
                "ok": False,
                "channel": self.name,
                "message": f"SMTP 认证失败: 账号或授权码错误 (QQ/163邮箱请在邮箱设置中生成专属客户端授权码，而非网页登录密码)"
            }
        except (smtplib.SMTPConnectError, socket.timeout) as conn_err:
            return {
                "ok": False,
                "channel": self.name,
                "message": f"连接 SMTP 邮件服务器超时或失败: {conn_err} (请检查服务器地址与端口号)"
            }
        except Exception as e:
            logger.warning(f"邮件发送异常: {e}")
            return {"ok": False, "channel": self.name, "message": f"邮件发送异常: {str(e)}"}

    async def _do_send(
        self,
        host: str,
        port: int,
        use_ssl: bool,
        user: str,
        password: str,
        from_addr: str,
        to_addr_str: str,
        subject: str,
        content: str
    ) -> Dict[str, Any]:
        h = (host or "").strip()
        u = (user or "").strip()
        p = (password or "").strip()
        raw_to = (to_addr_str or "").strip()
        if not h:
            return {"ok": False, "channel": self.name, "message": "SMTP 服务器地址未配置"}
        if not u or not p:
            return {"ok": False, "channel": self.name, "message": "SMTP 发信账号或授权码未配置"}
        if not raw_to:
            return {"ok": False, "channel": self.name, "message": "收件邮箱地址未配置"}

        to_addrs = [addr.strip() for addr in raw_to.replace("；", ";").replace("，", ",").split(",") if addr.strip()]
        from_val = (from_addr or u).strip()

        return await asyncio.to_thread(
            self._send_sync,
            h,
            port or 465,
            use_ssl,
            u,
            p,
            from_val,
            to_addrs,
            subject,
            content
        )

    async def send(self, data: NotificationData) -> Dict[str, Any]:
        if not db.get_setting("email_enabled", False):
            return {"ok": False, "channel": self.name, "skipped": True, "message": "邮件通知通道已关闭"}

        host = db.get_setting("email_host", "")
        port = int(db.get_setting("email_port", 465) or 465)
        use_ssl = bool(db.get_setting("email_ssl", True))
        user = db.get_setting("email_user", "")
        password = db.get_setting("email_pass", "")
        from_addr = db.get_setting("email_from", "")
        to_addr = db.get_setting("email_to", "")

        subject = f"[小蚕小帮手] {data.title}"
        return await self._do_send(host, port, use_ssl, user, password, from_addr, to_addr, subject, data.format_plain_text())

    async def test(self, config: Dict[str, Any]) -> Dict[str, Any]:
        host = config.get("email_host") or db.get_setting("email_host", "")
        port = int(config.get("email_port") or db.get_setting("email_port", 465) or 465)
        use_ssl = bool(config.get("email_ssl", db.get_setting("email_ssl", True)))
        user = config.get("email_user") or db.get_setting("email_user", "")
        password = config.get("email_pass") or db.get_setting("email_pass", "")
        from_addr = config.get("email_from") or db.get_setting("email_from", "")
        to_addr = config.get("email_to") or db.get_setting("email_to", "")

        test_subject = "[小蚕小帮手] 通知连通性测试邮件"
        test_content = (
            "这是一封来自小蚕小帮手的连通性测试邮件。\n\n"
            "如果你收到此邮件，说明 SMTP 邮件通道已正确配置，"
            "后续霸王餐中签、秒杀抢单与系统预警消息将可通过邮件向你发送。"
        )
        return await self._do_send(host, port, use_ssl, user, password, from_addr, to_addr, test_subject, test_content)
