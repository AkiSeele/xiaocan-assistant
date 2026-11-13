"""
小蚕霸王餐协议特征签名计算 (League of Legends 特征头)
逆向提取自小蚕小程序与网关通讯 RPC 协议
"""
import base64
import hashlib
import json
import os
import time
import uuid
from typing import Optional, Dict, List
from ..core import time_service


DEFAULT_PROTOCOL_PROFILE_ID = "android_webview"

# 已实测验证且兼容 App 网关 (X-Platform=Android, appid=10) 与腾讯云 STGW/WAF 的合规协议指纹档案
# 严禁将 okhttp/* 与 Dalvik/* 等已知会触发 STGW 规则 403 的非标脚本 UA 列入自动候选池
PROTOCOL_PROFILES: Dict[str, Dict[str, str]] = {
    "android_webview": {
        "id": "android_webview",
        "label": "Android WebView 标准通道",
        "transport_mode": "okhttp",
        "user_agent": (
            "Mozilla/5.0 (Linux; Android 14; 23116PN5BC Build/UKQ1.230804.001; wv) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.186 Mobile Safari/537.36"
        ),
    },
    "android_chrome131": {
        "id": "android_chrome131",
        "label": "Android Chrome 131 浏览器通道",
        "transport_mode": "chrome131",
        "user_agent": (
            "Mozilla/5.0 (Linux; Android 14; 23116PN5BC Build/UKQ1.230804.001) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"
        ),
    },
    "wechat_app_compat": {
        "id": "wechat_app_compat",
        "label": "WeChat WebView 兼容 App 通道",
        "transport_mode": "chrome131",
        "user_agent": (
            "Mozilla/5.0 (Linux; Android 14; 23116PN5BC Build/UKQ1.230804.001; wv) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.103 "
            "Mobile Safari/537.36 XWEB/1300255 MMWEBSDK/20241102 MicroMessenger/8.0.54.2760(0x28003639) "
            "WeChat/arm64 Weixin NetType/WIFI Language/zh_CN ABI/arm64"
        ),
    },
}


def get_protocol_profile(profile_id: Optional[str] = None) -> Dict[str, str]:
    """获取指定或默认的合规协议指纹档案（非法/未知 ID 自动回退至默认档案）"""
    if profile_id and profile_id in PROTOCOL_PROFILES:
        return dict(PROTOCOL_PROFILES[profile_id])
    return dict(PROTOCOL_PROFILES[DEFAULT_PROTOCOL_PROFILE_ID])


def list_protocol_profiles() -> List[Dict[str, str]]:
    """按优先级顺序列出所有自动自愈候选合规协议档案"""
    return [dict(item) for item in PROTOCOL_PROFILES.values()]


def md5_hex(s: str) -> str:
    return hashlib.md5(s.encode("utf-8")).hexdigest()


def generate_nami() -> str:
    """生成合规的 36 位客户端会话 UUID"""
    return str(uuid.uuid4())


def get_ashe(time_millis: int, server_name: str, method_name: str, nami: str) -> str:
    """
    计算 X-Ashe 签名：
    1. 计算 md5((serverName.methodName).toLowerCase())
    2. 将第一步的散列值与时间戳及 nami 拼接后再计算 md5
    """
    x = md5_hex(f"{server_name}.{method_name}".lower())
    return md5_hex(f"{x}{time_millis}{nami}")


def generate_headers(
    server_name: str,
    method_name: str,
    city_code: int = 0,
    token: Optional[str] = None,
    user_id: Optional[str] = None,
    silk_id: Optional[str] = None,
    nami: Optional[str] = None,
    time_millis: Optional[int] = None,
    platform: str = "app",
    user_agent: Optional[str] = None,
    profile_id: Optional[str] = None,
) -> Dict[str, str]:
    """
    生成小蚕霸王餐网关调用所需的全部请求头 (英雄联盟特征头规范)
    全局默认采用官方独立 App 原生客户端协议规范，彻底杜绝 50010 限制
    """
    if time_millis is None:
        time_millis = time_service.now_millis()
    if nami is None:
        nami = generate_nami()

    ashe = get_ashe(time_millis, server_name, method_name, nami)
    is_mini = str(platform).lower() == "mini"

    headers = {
        "x-City": str(city_code),
        "X-Garen": str(time_millis),
        "X-Nami": nami,
        "x-Annie": "XC",
        "servername": server_name,
        "methodname": method_name,
        "X-Ashe": ashe,
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
        "Accept-Encoding": "gzip",
        "Accept-Language": "zh-CN,zh;q=0.9",
    }

    if is_mini:
        # 微信小程序环境特征 (仅在显式指定 mini 时生效)
        headers["X-Platform"] = "mini"
        headers["appid"] = "20"
        headers["X-App-Sr"] = "20"
        headers["version"] = "3.20.6.67"
        headers["X-Version"] = "3.20.6.67"
        headers["X-Model"] = "microsoft microsoft"
        headers["xweb_xhr"] = "1"
        headers["Sec-Fetch-Site"] = "cross-site"
        headers["Sec-Fetch-Mode"] = "cors"
        headers["Sec-Fetch-Dest"] = "empty"
        headers["Referer"] = "https://servicewechat.com/wx52ae177248081591/798/page-frame.html"
        headers["User-Agent"] = (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/132.0.0.0 Safari/537.36 MicroMessenger/7.0.20.1781(0x6700143B) "
            "NetType/WIFI MiniProgramEnv/Windows WindowsWechat/WMPF WindowsWechat(0x63090a13) "
            "UnifiedPCWindowsWechat(0xf254173b) XWEB/19027"
        )
    else:
        # 全局默认采用移动独立 App 原生协议特征 (彻底突破大牌券、影音周卡等 50010 限制)
        headers["X-Platform"] = "Android"
        headers["appid"] = "10"
        headers["X-App-Sr"] = "10"
        headers["version"] = "3.21.1"
        headers["X-Version"] = "3.21.1"
        headers["x-channel"] = "xiaocan"
        headers["X-CityCode"] = str(city_code)
        headers["X-Model"] = "Android Phone"
        # 腾讯云 WAF (stgw) 会直接 403 拦截 okhttp/x.x 与 Dalvik/x.x 类非浏览器 UA
        # 优先级: 显式传入 user_agent > 显式指定 profile_id > 环境变量 XIAOCAN_USER_AGENT > 默认合规档案
        explicit_ua = str(user_agent).strip() if user_agent else ""
        if explicit_ua:
            headers["User-Agent"] = explicit_ua
        elif profile_id and profile_id in PROTOCOL_PROFILES:
            headers["User-Agent"] = get_protocol_profile(profile_id)["user_agent"]
        else:
            env_ua = (os.getenv("XIAOCAN_USER_AGENT") or "").strip()
            headers["User-Agent"] = env_ua or get_protocol_profile()["user_agent"]

    if user_id:
        headers["x-Vayne"] = str(user_id)
    if silk_id:
        headers["x-Teemo"] = str(silk_id)

    if token:
        clean_token = token.replace("Bearer ", "").strip()
        # 腾讯云 WAF 安全规则对重复鉴权头敏感：小蚕网关采用原生 x-Sivir 与 token 字段鉴权，去除冗余 Authorization 杜绝 WAF 403 拦截
        headers["token"] = clean_token
        headers["x-Sivir"] = clean_token

        # 若未显式传入 user_id，自动尝试从 JWT 中解码
        if not user_id and clean_token.count(".") == 2:
            try:
                parts = clean_token.split(".")
                padded = parts[1] + "=" * ((4 - len(parts[1]) % 4) % 4)
                payload = json.loads(base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8"))
                uid = payload.get("UserId") or payload.get("user_id")
                if uid:
                    headers["x-Vayne"] = str(uid)
            except Exception:
                pass

    return headers
