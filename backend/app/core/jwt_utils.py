"""
真实的 JWT 与抓包报文解析工具
绝不伪造任何数据，严格按标准解码 JWT Payload 与正则提取
"""
import base64
import json
import re
import time
from typing import Dict, Any, Optional, Tuple


def extract_token_from_text(raw_text: str) -> Optional[str]:
    """
    从用户输入的任意文本中智能提取真实 Token：
    - 支持直接粘贴 JWT (eyJ...)
    - 支持 cURL 命令 (-H 'Authorization: Bearer ...' 或 -H 'x-Sivir: ...')
    - 支持原始 HTTP 请求头格式 (x-Sivir: xxx 或 token: xxx)
    - 支持 JSON 对象格式 ({"token": "..."})
    """
    if not raw_text or not raw_text.strip():
        return None
    
    text = raw_text.strip()

    # 1. 尝试直接匹配标准三段式 JWT (eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)
    jwt_match = re.search(r'\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b', text)
    if jwt_match:
        return jwt_match.group(0)

    # 2. 匹配小蚕特征头 x-Sivir
    sivir_match = re.search(r'x-Sivir[\s:=]+([A-Za-z0-9_.\-]+)', text, re.IGNORECASE)
    if sivir_match:
        val = sivir_match.group(1).strip()
        if len(val) > 20:
            return val

    # 3. 匹配 Authorization: Bearer
    auth_match = re.search(r'Authorization[\s:=]+(?:Bearer\s+)?([A-Za-z0-9_.\-]+)', text, re.IGNORECASE)
    if auth_match:
        val = auth_match.group(1).strip()
        if len(val) > 20:
            return val

    # 4. 匹配 token: xxx
    token_match = re.search(r'\btoken[\s:=]+["\']?([A-Za-z0-9_.\-]+)["\']?', text, re.IGNORECASE)
    if token_match:
        val = token_match.group(1).strip()
        if len(val) > 20:
            return val

    # 5. 若整段就是无空格的长字符串
    if ' ' not in text and len(text) > 30:
        return text

    return None


def decode_jwt_payload(token: str) -> Tuple[bool, Dict[str, Any], str]:
    """
    解码真实 JWT Payload，提取用户真实信息
    返回: (is_valid, payload_dict, message)
    """
    if not token or not isinstance(token, str):
        return False, {}, "Token 为空"

    parts = token.strip().split('.')
    if len(parts) != 3:
        return False, {}, f"非标准 JWT 格式 (包含 {len(parts)} 段，标准为 3 段)"

    try:
        # Base64URL 补齐 padding
        payload_b64 = parts[1]
        rem = len(payload_b64) % 4
        if rem > 0:
            payload_b64 += '=' * (4 - rem)
        
        payload_bytes = base64.urlsafe_b64decode(payload_b64)
        payload = json.loads(payload_bytes.decode('utf-8'))
    except Exception as e:
        return False, {}, f"JWT Payload 解析失败: {str(e)}"

    # 校验真实过期时间
    now = int(time.time())
    exp = payload.get("exp")
    if exp:
        try:
            exp_int = int(exp)
            if exp_int < now:
                time_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(exp_int))
                return False, payload, f"Token 已于 {time_str} 过期，请重新从微信抓包获取最新凭证"
        except (ValueError, TypeError):
            pass

    return True, payload, "Token 格式与有效期校验通过"


def extract_city_code_from_text(raw_text: str) -> Optional[int]:
    """从报文中尝试提取真实城市代码 (如 x-City: 420100)"""
    match = re.search(r'x-City[\s:=]+(\d{6})', raw_text, re.IGNORECASE)
    if match:
        try:
            return int(match.group(1))
        except ValueError:
            pass
    return None


def extract_silk_id_from_payload(payload: Dict[str, Any]) -> str:
    """提取小蚕真实用户 ID / Silk ID (优先读取真正的 silk_id / silkId)"""
    if not payload or not isinstance(payload, dict):
        return ""
    if payload.get("silk_id"):
        return str(payload.get("silk_id"))
    if payload.get("silkId"):
        return str(payload.get("silkId"))
    return ""


def extract_user_id_from_payload(payload: Dict[str, Any]) -> str:
    """提取上游/网关用户 ID (如牛马平台 UserId)"""
    if not payload or not isinstance(payload, dict):
        return ""
    val = (
        payload.get("UserId")
        or payload.get("user_id")
        or payload.get("userId")
        or payload.get("id")
        or payload.get("sub")
        or ""
    )
    return str(val) if val else ""

