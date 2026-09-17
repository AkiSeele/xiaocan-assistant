"""
真实本地嗅探代理服务 (Local Sniffing Proxy)
支持:
1. Windows 系统代理一键自动化接管与无损还原 (win_proxy)
2. 小蚕 HTTPS 域名 (*.xiaocan.cn / *.xiaocan.com) 的透明 SSL 动态证书拦截
3. 非小蚕域名纯盲转发 (TCP Tunneling)，绝不干扰其它任何软件或网页网络
4. 捕获凭据后毫秒级自动还原系统代理并安全退出守护进程，杜绝断网
"""
import asyncio
import logging
import os
import ssl
import time
from typing import Optional, Dict, Any, Callable

from .jwt_utils import extract_token_from_text, decode_jwt_payload, extract_silk_id_from_payload, extract_user_id_from_payload
from .win_proxy import win_proxy
from .cert_manager import cert_mgr

logger = logging.getLogger("xiaocan.sniffer")


class SnifferManager:
    def __init__(self):
        self.is_running: bool = False
        self.is_win_proxy_active: bool = False
        self.server: Optional[asyncio.Server] = None
        self.port: int = 8699
        self.host: str = "0.0.0.0"
        self.last_status: str = "idle"  # idle | listening | captured | error | timeout
        self.captured_account: Optional[Dict[str, Any]] = None
        self.error_message: Optional[str] = None
        self.on_captured_callback: Optional[Callable[[Dict[str, Any]], None]] = None
        self._timeout_task: Optional[asyncio.Task] = None
        self.has_notified: bool = False
        self._stop_task_scheduled: bool = False

    def get_status(self) -> Dict[str, Any]:
        return {
            "is_running": self.is_running,
            "is_win_proxy_active": self.is_win_proxy_active,
            "ca_installed": cert_mgr.is_ca_installed(),
            "ca_path": cert_mgr.get_ca_cert_path(),
            "port": self.port,
            "host": "127.0.0.1",
            "status": self.last_status,
            "account": self.captured_account,
            "error": self.error_message
        }

    async def start(self, port: int = 8699, on_captured: Optional[Callable[[Dict[str, Any]], None]] = None):
        """标准启动 (仅开启端口监听，不自动接管 Windows 代理)"""
        if self.is_running:
            return
        self.port = port
        self.on_captured_callback = on_captured
        self.captured_account = None
        self.error_message = None
        self.last_status = "listening"
        self.has_notified = False
        self._stop_task_scheduled = False

        try:
            self.server = await asyncio.start_server(self._handle_client, self.host, self.port)
            self.is_running = True
            logger.info(f"本地嗅探代理已启动，正在监听 0.0.0.0:{self.port} ...")
        except Exception as e:
            self.is_running = False
            self.last_status = "error"
            self.error_message = str(e)
            logger.error(f"启动本地嗅探代理失败: {e}")
            raise

    async def start_win_capture(self, port: int = 8699, timeout_seconds: int = 120, on_captured: Optional[Callable[[Dict[str, Any]], None]] = None):
        """全自动 Windows 电脑微信抓取 (自动配置系统代理 + 端口监听 + 超时自动还原)"""
        await self.start(port=port, on_captured=on_captured)

        # 启动 Windows 系统代理
        ok = win_proxy.enable_proxy(host="127.0.0.1", port=port)
        self.is_win_proxy_active = ok
        if not ok:
            logger.warning("未能成功开启 Windows 系统代理，用户可能需要手动设置代理")

        # 启动超时守卫 (如 120 秒未抓到自动复原代理)
        if self._timeout_task:
            self._timeout_task.cancel()

        async def _timeout_guard():
            try:
                await asyncio.sleep(timeout_seconds)
                if self.is_running and self.last_status == "listening":
                    logger.info(f"Windows 微信嗅探超时 ({timeout_seconds}s)，自动还原代理并停止...")
                    self.last_status = "timeout"
                    await self.stop_win_capture()
            except asyncio.CancelledError:
                pass

        self._timeout_task = asyncio.create_task(_timeout_guard())

    async def stop(self):
        """停止代理监听"""
        if self._timeout_task:
            self._timeout_task.cancel()
            self._timeout_task = None

        if self.server:
            self.server.close()
            await self.server.wait_closed()
            self.server = None

        self.is_running = False
        if self.last_status == "listening":
            self.last_status = "idle"
        logger.info("本地嗅探代理已停止")

    async def stop_win_capture(self):
        """停止 Windows 抓取并彻底还原系统代理"""
        if self.is_win_proxy_active:
            win_proxy.restore_proxy()
            self.is_win_proxy_active = False
        await self.stop()

    def _inspect_and_capture(self, text_data: str, host: Optional[str] = None) -> bool:
        """从通信文本/请求头中解析小蚕凭证"""
        # 仅针对小蚕目标（域名包含 xiaocan/silk/7frs77ao7li62b，或报文中包含小蚕核心特征）提取，绝不截取无关系统流量
        is_xiaocan_target = False
        if host and any(d in host.lower() for d in ["xiaocan", "silk", "7frs77ao7li62b"]):
            is_xiaocan_target = True
        elif any(k in text_data.lower() for k in ["x-sivir", "x-vayne", "x-teemo", "silk_id", "gw.xiaocantech.com", "silkworm"]):
            is_xiaocan_target = True

        if not is_xiaocan_target:
            return False

        token = extract_token_from_text(text_data)
        if token:
            is_valid, payload, msg = decode_jwt_payload(token)
            if is_valid:
                silk_id = extract_silk_id_from_payload(payload)
                user_id = extract_user_id_from_payload(payload)
                account_data = {
                    "token": token,
                    "silk_id": silk_id,
                    "user_id": user_id,
                    "nickname": f"小蚕用户_{silk_id[-4:]}" if silk_id else "小蚕微信用户",
                    "exp": payload.get("exp"),
                    "raw_payload": payload
                }
                should_notify = False
                if not self.captured_account:
                    self.captured_account = account_data
                    should_notify = True
                else:
                    has_new_silk = bool(not self.captured_account.get("silk_id") and account_data.get("silk_id"))
                    has_new_nick = bool(account_data.get("nickname") and not account_data["nickname"].startswith("小蚕用户_") and self.captured_account.get("nickname", "").startswith("小蚕用户_"))
                    has_new_token = bool(account_data.get("token") and account_data.get("token") != self.captured_account.get("token"))

                    if account_data.get("silk_id"):
                        self.captured_account["silk_id"] = account_data["silk_id"]
                    if account_data.get("nickname") and not account_data["nickname"].startswith("小蚕用户_"):
                        self.captured_account["nickname"] = account_data["nickname"]
                    if account_data.get("avatar"):
                        self.captured_account["avatar"] = account_data["avatar"]
                    if account_data.get("vip_level"):
                        self.captured_account["vip_level"] = account_data["vip_level"]
                    if account_data.get("token"):
                        self.captured_account["token"] = account_data["token"]
                    if account_data.get("user_id"):
                        self.captured_account["user_id"] = account_data["user_id"]

                    if has_new_silk or has_new_nick or (has_new_token and not self.has_notified):
                        should_notify = True

                self.last_status = "captured"

                # 自动触发恢复系统代理 (仅需触发一次)
                if self.is_win_proxy_active:
                    logger.info("检测到账号凭证已捕获，正在立即自动恢复 Windows 系统代理...")
                    win_proxy.restore_proxy()
                    self.is_win_proxy_active = False

                # 异步回调处理 (写入数据库)
                if should_notify and self.on_captured_callback:
                    self.has_notified = True
                    logger.info(f"成功捕获小蚕账号凭据！Silk ID: {self.captured_account.get('silk_id')}, User ID: {self.captured_account.get('user_id')}")
                    try:
                        self.on_captured_callback(self.captured_account)
                    except Exception as cb_err:
                        logger.error(f"回调处理捕获账号异常: {cb_err}")

                # 延迟 2.5 秒后安全关闭嗅探服务 (给回包嗅探留出时间)
                if not self._stop_task_scheduled:
                    self._stop_task_scheduled = True
                    async def _delayed_stop():
                        await asyncio.sleep(2.5)
                        await self.stop()

                    asyncio.create_task(_delayed_stop())
                return True
        return False

    def _inspect_response(self, text_data: str):
        """从小蚕服务器回包 JSON 中嗅探用户资料 (昵称/头像/会员等)"""
        try:
            if "{" not in text_data:
                return
            idx = text_data.find("{")
            json_str = text_data[idx:]
            if any(k in json_str for k in ["nickname", "nick_name", "nickName", "vip_level", "avatar"]):
                import json
                end_idx = json_str.rfind("}")
                if end_idx > 0:
                    data = json.loads(json_str[:end_idx+1])
                    self._merge_user_info(data)
        except Exception:
            pass

    def _merge_user_info(self, data: Any):
        if not isinstance(data, dict):
            return
        candidates = [data]
        if "data" in data and isinstance(data["data"], dict):
            candidates.append(data["data"])
        if "result" in data and isinstance(data["result"], dict):
            candidates.append(data["result"])
        if "user" in data and isinstance(data["user"], dict):
            candidates.append(data["user"])

        for item in candidates:
            nick = item.get("nickname") or item.get("nick_name") or item.get("nickName")
            silk_id = item.get("silk_id") or item.get("user_id") or item.get("userId") or item.get("id")
            avatar = item.get("avatar") or item.get("head_img") or item.get("avatarUrl")
            vip = item.get("vip_level") or item.get("vipLevel") or item.get("level")

            if nick or silk_id:
                if self.captured_account:
                    updated = False
                    if nick and self.captured_account.get("nickname") != str(nick):
                        self.captured_account["nickname"] = str(nick)
                        updated = True
                    if silk_id and self.captured_account.get("silk_id") != str(silk_id):
                        self.captured_account["silk_id"] = str(silk_id)
                        updated = True
                    if avatar and not self.captured_account.get("avatar"):
                        self.captured_account["avatar"] = str(avatar)
                        updated = True
                    if vip and not self.captured_account.get("vip_level"):
                        try:
                            self.captured_account["vip_level"] = int(vip)
                            updated = True
                        except Exception:
                            pass
                    if updated:
                        logger.info(f"成功从小蚕回包捕获真实用户资料: 昵称={nick}, Silk ID={silk_id}, VIP={vip}")
                        if self.on_captured_callback:
                            try:
                                self.on_captured_callback(self.captured_account)
                            except Exception as cb_err:
                                logger.error(f"回调处理捕获资料异常: {cb_err}")


    async def _handle_client(self, client_reader: asyncio.StreamReader, client_writer: asyncio.StreamWriter):
        try:
            # 预读 1 个字节以探测协议类型: 0x05 为 SOCKS5 (支持 Proxifier 等), 否则为标准 HTTP/HTTPS 代理
            first_byte = await client_reader.read(1)
            if not first_byte:
                return

            if first_byte == b'\x05':
                await self._handle_socks5(client_reader, client_writer)
            else:
                await self._handle_http(client_reader, client_writer, first_byte)
        except Exception as e:
            logger.debug(f"嗅探代理连接处理异常: {e}")
        finally:
            try:
                client_writer.close()
            except Exception:
                pass

    async def _handle_socks5(self, client_reader: asyncio.StreamReader, client_writer: asyncio.StreamWriter):
        """处理 SOCKS5 握手与转发 (完美兼容 Proxifier 等 SOCKS5 代理客户端)"""
        try:
            import socket
            # 1. 认证协商: 读取客户端支持的方法列表
            nmethods_raw = await client_reader.read(1)
            if not nmethods_raw:
                return
            nmethods = nmethods_raw[0]
            await client_reader.read(nmethods)

            # 回复: 版本 5, 无需认证 (0x00)
            client_writer.write(b'\x05\x00')
            await client_writer.drain()

            # 2. 读取连接请求: VER (1B), CMD (1B), RSV (1B), ATYP (1B)
            req_header = await client_reader.read(4)
            if len(req_header) < 4:
                return
            ver, cmd, rsv, atyp = req_header[0], req_header[1], req_header[2], req_header[3]
            if cmd != 1:  # 仅支持 CONNECT (1)
                client_writer.write(b'\x05\x07\x00\x01\x00\x00\x00\x00\x00\x00')
                await client_writer.drain()
                return

            # 解析目标地址与端口
            if atyp == 1:  # IPv4
                raw_ip = await client_reader.read(4)
                host = socket.inet_ntoa(raw_ip)
            elif atyp == 3:  # 域名
                domain_len_raw = await client_reader.read(1)
                domain_len = domain_len_raw[0]
                host = (await client_reader.read(domain_len)).decode('utf-8', errors='ignore')
            elif atyp == 4:  # IPv6
                raw_ip = await client_reader.read(16)
                host = socket.inet_ntop(socket.AF_INET6, raw_ip)
            else:
                return

            port_bytes = await client_reader.read(2)
            port = int.from_bytes(port_bytes, 'big')

            # 回复 SOCKS5 握手成功: 响应成功, 绑定 0.0.0.0:0
            client_writer.write(b'\x05\x00\x00\x01\x00\x00\x00\x00\x00\x00')
            await client_writer.drain()

            is_xiaocan = "xiaocan" in host.lower() or "silk" in host.lower()
            if is_xiaocan:
                await self._handle_xiaocan_tls_mitm(client_reader, client_writer, host, port, is_http_connect=False)
            else:
                await self._handle_blind_tunnel(client_reader, client_writer, host, port, send_http_ok=False)
        except Exception as e:
            logger.debug(f"SOCKS5 处理异常: {e}")

    async def _handle_http(self, client_reader: asyncio.StreamReader, client_writer: asyncio.StreamWriter, first_byte: bytes):
        """处理标准 HTTP / HTTPS (CONNECT) 代理请求"""
        header_data = bytearray(first_byte)
        while True:
            line = await client_reader.readline()
            if not line:
                break
            header_data.extend(line)
            if line == b'\r\n' or line == b'\n':
                break
            if len(header_data) > 65536:
                break

        raw_header_str = header_data.decode('utf-8', errors='ignore')
        first_line = raw_header_str.splitlines()[0] if raw_header_str else ""

        # 1. 检查明文 HTTP 请求头中的小蚕凭证
        self._inspect_and_capture(raw_header_str)

        # 2. 处理 CONNECT 隧道 (HTTPS)
        if first_line.startswith("CONNECT "):
            parts = first_line.split()
            if len(parts) >= 2:
                target = parts[1]
                host, port = target.split(':') if ':' in target else (target, 443)
                port = int(port)

                is_xiaocan = "xiaocan" in host.lower() or "silk" in host.lower()
                if is_xiaocan:
                    await self._handle_xiaocan_tls_mitm(client_reader, client_writer, host, port, is_http_connect=True)
                else:
                    await self._handle_blind_tunnel(client_reader, client_writer, host, port, send_http_ok=True)
        else:
            # 普通 HTTP 响应
            client_writer.write(b"HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nXiaoCan Sniffer Active")
            await client_writer.drain()

    async def _handle_blind_tunnel(self, client_reader: asyncio.StreamReader, client_writer: asyncio.StreamWriter, host: str, port: int, send_http_ok: bool = True):
        """非小蚕域名的纯盲目 TCP 管道透传 (绝不窥探或误拦截其它软件网络流量)"""
        try:
            remote_reader, remote_writer = await asyncio.open_connection(host, port)
            if send_http_ok:
                client_writer.write(b"HTTP/1.1 200 Connection Established\r\n\r\n")
                await client_writer.drain()

            async def forward(src_r, dst_w):
                try:
                    while True:
                        data = await src_r.read(16384)
                        if not data:
                            break
                        dst_w.write(data)
                        await dst_w.drain()
                except Exception:
                    pass
                finally:
                    try:
                        dst_w.close()
                    except Exception:
                        pass

            t1 = asyncio.create_task(forward(client_reader, remote_writer))
            t2 = asyncio.create_task(forward(remote_reader, client_writer))
            await asyncio.gather(t1, t2, return_exceptions=True)
        except Exception as conn_err:
            logger.warning(f"无法建立上游 TCP 隧道 {host}:{port} -> {conn_err}")
            if send_http_ok:
                try:
                    client_writer.write(b"HTTP/1.1 502 Bad Gateway\r\n\r\n")
                    await client_writer.drain()
                except Exception:
                    pass

    async def _handle_xiaocan_tls_mitm(self, client_reader: asyncio.StreamReader, client_writer: asyncio.StreamWriter, host: str, port: int, is_http_connect: bool = True):
        """针对小蚕目标域名的动态 SSL 解密拦截"""
        try:
            # 建立到真实小蚕后端的连接
            remote_reader, remote_writer = await asyncio.open_connection(host, port, ssl=True)

            if is_http_connect:
                client_writer.write(b"HTTP/1.1 200 Connection Established\r\n\r\n")
                await client_writer.drain()

            # 生成小蚕域名的动态证书
            cert_pem, key_pem = cert_mgr.get_or_create_host_cert(host)

            ssl_ctx = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
            import tempfile
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pem") as f_cert:
                f_cert.write(cert_pem)
                cert_file = f_cert.name
            with tempfile.NamedTemporaryFile(delete=False, suffix=".key") as f_key:
                f_key.write(key_pem)
                key_file = f_key.name

            try:
                ssl_ctx.load_cert_chain(certfile=cert_file, keyfile=key_file)
            finally:
                try:
                    os.remove(cert_file)
                    os.remove(key_file)
                except Exception:
                    pass

            loop = asyncio.get_running_loop()
            # 升级客户端套接字为 TLS 服务端
            client_transport = client_writer.transport
            client_protocol = client_writer._protocol

            tls_transport = await loop.start_tls(
                client_transport,
                client_protocol,
                ssl_ctx,
                server_side=True
            )

            # 重新包装为 reader / writer
            tls_reader = asyncio.StreamReader()
            tls_protocol = asyncio.StreamReaderProtocol(tls_reader)
            tls_transport.set_protocol(tls_protocol)
            tls_writer = asyncio.StreamWriter(tls_transport, tls_protocol, tls_reader, loop)

            # 管道并监听请求头
            async def forward_with_inspect(src_r, dst_w, is_req: bool):
                try:
                    while True:
                        data = await src_r.read(16384)
                        if not data:
                            break
                        try:
                            text = data.decode("utf-8", errors="ignore")
                            if is_req:
                                self._inspect_and_capture(text, host=host)
                            else:
                                self._inspect_response(text)
                        except Exception:
                            pass
                        dst_w.write(data)
                        await dst_w.drain()
                except Exception:
                    pass
                finally:
                    try:
                        dst_w.close()
                    except Exception:
                        pass

            t1 = asyncio.create_task(forward_with_inspect(tls_reader, remote_writer, True))
            t2 = asyncio.create_task(forward_with_inspect(remote_reader, tls_writer, False))
            await asyncio.gather(t1, t2, return_exceptions=True)
        except Exception as mitm_err:
            logger.debug(f"小蚕 SSL 拦截降级为盲转发: {mitm_err}")
            # 如果 TLS 握手失败（如客户端拒绝自签证书），回退为盲转发以保证基础通讯不中断
            await self._handle_blind_tunnel(client_reader, client_writer, host, port, send_http_ok=is_http_connect)


# 单例代理管理器
sniffer = SnifferManager()
