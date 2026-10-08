"""高精度阿里云 NTP 授时服务模块 (SNTP RFC 5905)
全局维护本地时钟与标准北京时间 (ntp.aliyun.com) 的时钟偏差 (offset)，
为全系统的秒杀倒计时、整点自动化任务、预约抢单提供微秒级时钟基准。
"""
import time
import socket
import struct
import logging
from datetime import datetime
from typing import Dict, Any

logger = logging.getLogger("xiaocan.ntp")

# NTP 服务器列表 (优先阿里云，备选腾讯云与国家授时中心)
NTP_SERVERS = [
    "ntp.aliyun.com",
    "ntp1.aliyun.com",
    "ntp2.aliyun.com",
    "time.pool.aliyun.com",
    "time1.cloud.tencent.com",
]

_ntp_state = {
    "offset": 0.0,            # ntp_time - local_time (秒)
    "last_sync": 0.0,         # 上次成功同步的 local timestamp
    "synced": False,          # 是否已完成至少一次同步
    "server": "ntp.aliyun.com",
    "round_trip_ms": 0.0,     # 网络往返耗时
}


def sync_aliyun_ntp(force: bool = False, timeout: float = 2.0) -> float:
    """向 ntp.aliyun.com 同步时钟偏差并返回校准后的标准时间戳。
    正常情况下 120 秒内复用偏差；若 force=True 则强制穿透缓存立即发起真实网络对齐。
    优先采用 UDP SNTP (ntp.aliyun.com)，当环境防火墙阻断 UDP 123 端口时自动降级至阿里云 HTTP Date 标头授时。
    """
    global _ntp_state
    now_local = time.time()
    if not force and _ntp_state["synced"] and (now_local - _ntp_state["last_sync"] < 120.0):
        return now_local + _ntp_state["offset"]

    # 1. 优先尝试 UDP SNTP 标准授时 (ntp.aliyun.com)
    for srv in NTP_SERVERS:
        try:
            client_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            client_sock.settimeout(timeout)
            # NTP 请求报文：LI=0, VN=3, Mode=3 (Client)
            data = b'\x1b' + 47 * b'\0'
            t0 = time.time()
            client_sock.sendto(data, (srv, 123))
            resp, _ = client_sock.recvfrom(1024)
            t1 = time.time()
            client_sock.close()
            if resp and len(resp) >= 48:
                unpacked = struct.unpack("!12I", resp[0:48])
                # NTP 纪元 1900 到 Unix 纪元 1970 秒数差: 2208988800
                ntp_transmit_ts = unpacked[10] + float(unpacked[11]) / (2**32) - 2208988800
                rtt = t1 - t0
                adjusted_ntp = ntp_transmit_ts + (rtt / 2.0)
                offset = adjusted_ntp - t1
                _ntp_state["offset"] = offset
                _ntp_state["last_sync"] = t1
                _ntp_state["synced"] = True
                _ntp_state["server"] = srv
                _ntp_state["round_trip_ms"] = rtt * 1000.0
                logger.info(f"[NTP授时] 成功与 {srv} 对齐时钟: 本地偏差 {offset:+.3f}s (RTT: {rtt*1000.0:.1f}ms)")
                return adjusted_ntp
        except Exception as e:
            logger.debug(f"[NTP授时] 请求 {srv} (UDP:123) 异常: {e}，尝试备用通道")

    # 2. 备用通道：当本地防火墙拦截 UDP 123 时，自动采用阿里云官网 HTTP Date 标头授时
    try:
        import urllib.request
        import email.utils
        req = urllib.request.Request("https://www.aliyun.com", method="HEAD")
        t0 = time.time()
        # 显式忽略本地系统代理，确保直连获取阿里云边缘节点高精度时钟
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(req, timeout=timeout) as resp:
            t1 = time.time()
            server_date = resp.headers.get("date")
            if server_date:
                parsed_dt = email.utils.parsedate_to_datetime(server_date)
                http_ts = parsed_dt.timestamp()
                rtt = t1 - t0
                adjusted_http = http_ts + (rtt / 2.0)
                offset = adjusted_http - t1
                _ntp_state["offset"] = offset
                _ntp_state["last_sync"] = t1
                _ntp_state["synced"] = True
                _ntp_state["server"] = "ntp.aliyun.com (HTTP)"
                _ntp_state["round_trip_ms"] = rtt * 1000.0
                logger.info(f"[NTP授时] 成功与阿里云 HTTP 授时节点对齐时钟: 本地偏差 {offset:+.3f}s (RTT: {rtt*1000.0:.1f}ms)")
                return adjusted_http
    except Exception as he:
        logger.debug(f"[NTP授时] 阿里云 HTTP 授时备用通道异常: {he}")

    if not _ntp_state["synced"]:
        logger.warning("[NTP授时] 所有 NTP 与 HTTP 授时节点均未响应，降级采用本地系统时钟")
    return now_local + _ntp_state.get("offset", 0.0)


async def async_sync_ntp(force: bool = False, timeout: float = 2.0) -> float:
    """异步非阻塞执行 NTP 同步 (在线程池中运行 Socket，不阻塞 AsyncIO 事件循环)"""
    import asyncio
    return await asyncio.to_thread(sync_aliyun_ntp, force, timeout)


def now_ts() -> float:
    """获取经由 NTP 校准的高精度标准 Unix 时间戳 (秒)"""
    if not _ntp_state["synced"]:
        sync_aliyun_ntp()
    return time.time() + _ntp_state.get("offset", 0.0)


def now_dt() -> datetime:
    """获取经由 NTP 校准的高精度标准北京时间 datetime"""
    return datetime.fromtimestamp(now_ts())


def get_ntp_offset() -> float:
    """获取当前本地时钟与标准时间的偏差 (秒)。正数表示本地落后，负数表示本地超前"""
    return _ntp_state.get("offset", 0.0)


def is_ntp_synced() -> bool:
    """获取当前是否已与 NTP 授时中心成功同步"""
    return _ntp_state.get("synced", False)


def get_ntp_status() -> Dict[str, Any]:
    """获取当前 NTP 授时服务状态"""
    current_std_ts = now_ts()
    bj_time_tuple = time.gmtime(current_std_ts + 8 * 3600)
    return {
        "ok": True,
        "timestamp": current_std_ts,
        "beijing_time": time.strftime("%Y-%m-%d %H:%M:%S", bj_time_tuple),
        "server": _ntp_state.get("server", "ntp.aliyun.com"),
        "synced": _ntp_state.get("synced", False),
        "offset": _ntp_state.get("offset", 0.0),
        "offset_ms": round(_ntp_state.get("offset", 0.0) * 1000.0, 1),
        "round_trip_ms": round(_ntp_state.get("round_trip_ms", 0.0), 1),
        "last_sync": _ntp_state.get("last_sync", 0.0)
    }
