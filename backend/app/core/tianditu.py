"""
天地图 (国家地理信息公共服务平台 tianditu.gov.cn) 地理位置与逆地理编码服务模块
提供基于天地图官方 Web API 的高精度国内逆地理编码、坐标解析与多候选 POI 检索。
严禁使用 Emoji 字符。
"""
import logging
import json
import re
import asyncio
from typing import Dict, Any, Optional, List
import httpx

try:
    from ..models import database as db
except ImportError:
    from app.models import database as db

logger = logging.getLogger("tianditu")

DEFAULT_TIANDITU_KEY = "109fd484f999e3c0472ab15fa38fe2ac"
TIANDITU_GEOCODER_URL = "http://api.tianditu.gov.cn/geocoder"
TIANDITU_SEARCH_URL = "http://api.tianditu.gov.cn/v2/search"
DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# 常用核心城市编码速查表 (GB/T 2260)
CITY_CODE_MAP: Dict[str, int] = {
    "北京": 110100, "北京市": 110100,
    "天津": 120100, "天津市": 120100,
    "上海": 310100, "上海市": 310100,
    "重庆": 500100, "重庆市": 500100,
    "武汉": 420100, "武汉市": 420100,
    "广州": 440100, "广州市": 440100,
    "深圳": 440300, "深圳市": 440300,
    "成都": 510100, "成都市": 510100,
    "杭州": 330100, "杭州市": 330100,
    "南京": 320100, "南京市": 320100,
    "西安": 610100, "西安市": 610100,
    "长沙": 430100, "长沙市": 430100,
    "郑州": 410100, "郑州市": 410100,
    "东莞": 441900, "东莞市": 441900,
    "佛山": 440600, "佛山市": 440600,
    "苏州": 320500, "苏州市": 320500,
    "合肥": 340100, "合肥市": 340100,
    "青岛": 370200, "青岛市": 370200,
    "昆明": 530100, "昆明市": 530100,
    "沈阳": 210100, "沈阳市": 210100,
    "大连": 210200, "大连市": 210200,
    "宁波": 330200, "宁波市": 330200,
    "福州": 350100, "福州市": 350100,
    "厦门": 350200, "厦门市": 350200,
    "哈尔滨": 230100, "哈尔滨市": 230100,
    "长春": 220100, "长春市": 220100,
    "南昌": 360100, "南昌市": 360100,
    "贵阳": 520100, "贵阳市": 520100,
    "南宁": 450100, "南宁市": 450100,
    "海口": 460100, "海口市": 460100,
    "乌鲁木齐": 650100, "乌鲁木齐市": 650100,
    "兰州": 620100, "兰州市": 620100,
    "呼和浩特": 150100, "呼和浩特市": 150100,
    "银川": 640100, "银川市": 640100,
    "西宁": 630100, "西宁市": 630100,
    "拉萨": 540100, "拉萨市": 540100,
}


def extract_city_code_from_admin(admin_code: Any, city_name: str = "") -> int:
    """从行政区划代码(包含天地图的 156 前缀)计算 6 位市级行政区编码"""
    if admin_code:
        raw_str = str(admin_code).replace("156", "").strip()
        if raw_str.isdigit() and len(raw_str) >= 6:
            code_int = int(raw_str[:6])
            # 市级代码通常为末两位 00 (如 420100, 310100)
            return (code_int // 100) * 100
    if city_name:
        clean = city_name.replace("市", "").strip()
        if clean in CITY_CODE_MAP:
            return CITY_CODE_MAP[clean]
    return 420100


class TiandituClient:
    """天地图官方 Web API 客户端"""

    def __init__(self, key: Optional[str] = None):
        self.key = key

    def get_key(self, custom_key: Optional[str] = None) -> str:
        """获取当前有效的天地图服务 Token"""
        if custom_key and custom_key.strip():
            return custom_key.strip()
        if self.key and self.key.strip():
            return self.key.strip()
        stored = db.get_setting("tianditu_key", "")
        if stored and str(stored).strip():
            return str(stored).strip()
        return DEFAULT_TIANDITU_KEY

    async def test_connection(self, custom_key: Optional[str] = None) -> Dict[str, Any]:
        """测试天地图 Web 服务 Token 连通性"""
        tk = self.get_key(custom_key)
        if not tk:
            return {
                "ok": False,
                "message": "天地图服务密钥 (Token) 不能为空"
            }

        try:
            headers = {"User-Agent": DESKTOP_UA}
            # 使用武汉核心坐标测试逆地理编码服务
            post_str = json.dumps({"lon": 114.305393, "lat": 30.593099, "ver": 1})
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(
                    TIANDITU_GEOCODER_URL,
                    params={"postStr": post_str, "type": "geocode", "tk": tk},
                    headers=headers
                )
                data = resp.json()
                status = str(data.get("status", ""))
                msg = str(data.get("msg", ""))
                
                if status == "0" or msg.lower() == "ok":
                    formatted = data.get("result", {}).get("formatted_address", "")
                    return {
                        "ok": True,
                        "message": f"天地图 API 鉴权连通成功 (测试点: {formatted})",
                        "data": data
                    }
                else:
                    return {
                        "ok": False,
                        "message": f"天地图鉴权失败: {msg or status}，请检查密钥是否有效"
                    }
        except Exception as e:
            return {
                "ok": False,
                "message": f"连接天地图网络异常: {str(e)}"
            }

    async def resolve_location(self, lat: float, lon: float, custom_key: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        逆地理编码：通过经纬度查询省、市、区、街道及详细地址
        使用天地图接口: http://api.tianditu.gov.cn/geocoder
        """
        tk = self.get_key(custom_key)
        if not tk:
            return None

        try:
            headers = {"User-Agent": DESKTOP_UA}
            post_str = json.dumps({"lon": lon, "lat": lat, "ver": 1})
            async with httpx.AsyncClient(timeout=6.0) as client:
                resp = await client.get(
                    TIANDITU_GEOCODER_URL,
                    params={"postStr": post_str, "type": "geocode", "tk": tk},
                    headers=headers
                )
                data = resp.json()
                if str(data.get("status", "")) == "0" or str(data.get("msg", "")).lower() == "ok":
                    res = data.get("result", {})
                    comp = res.get("addressComponent", {})
                    
                    raw_province = comp.get("province", "") or ""
                    raw_city = comp.get("city", "") or ""
                    raw_county = comp.get("county", "") or ""
                    raw_town = comp.get("town", "") or ""
                    raw_poi = comp.get("poi", "") or ""
                    formatted_address = res.get("formatted_address", "") or ""

                    # 直辖市 (北京/上海/天津/重庆) 往往 city 为空，province 存储直辖市名
                    city_name = raw_city.replace("市", "").strip() if raw_city else ""
                    if not city_name and raw_province:
                        city_name = raw_province.replace("市", "").strip()

                    # 提取城市代码 (优先从 county_code / city_code 计算)
                    admin_c = comp.get("county_code") or comp.get("city_code") or comp.get("province_code")
                    city_code = extract_city_code_from_admin(admin_c, city_name)

                    # 构造简洁的展示地址
                    if formatted_address:
                        addr_str = formatted_address
                    elif city_name and raw_county:
                        addr_str = f"{city_name} · {raw_county}"
                    elif city_name:
                        addr_str = f"{city_name}市"
                    else:
                        addr_str = "高精度定位点"

                    return {
                        "city_code": city_code,
                        "city_name": city_name or "未知",
                        "province": raw_province,
                        "district": raw_county,
                        "town": raw_town,
                        "poi": raw_poi,
                        "address_name": addr_str,
                        "latitude": f"{lat:.6f}",
                        "longitude": f"{lon:.6f}",
                        "source": "tianditu",
                        "raw": data
                    }
                else:
                    logger.warning(f"天地图逆地理编码返回失败: status={data.get('status')}, msg={data.get('msg')}")
                    return None
        except Exception as e:
            logger.warning(f"天地图逆地理编码网络异常: {e}")
            return None

    async def search_poi(self, keyword: str, custom_key: Optional[str] = None, count: int = 10) -> List[Dict[str, Any]]:
        """
        POI 与地点多候选检索：支持城市商圈、具体地标、行政区与门牌号检索
        使用天地图接口: http://api.tianditu.gov.cn/v2/search
        """
        tk = self.get_key(custom_key)
        clean_kw = keyword.strip()
        if not tk or not clean_kw:
            return []

        try:
            headers = {"User-Agent": DESKTOP_UA}
            post_data = {
                "keyWord": clean_kw,
                "level": 12,
                "mapBound": "73.0,18.0,135.0,54.0",  # 中国全境经纬度范围
                "queryType": 1,
                "start": 0,
                "count": count
            }
            async with httpx.AsyncClient(timeout=7.0) as client:
                resp = await client.get(
                    TIANDITU_SEARCH_URL,
                    params={"postStr": json.dumps(post_data), "type": "query", "tk": tk},
                    headers=headers
                )
                data = resp.json()
                candidates: List[Dict[str, Any]] = []

                # 1. 行政区域匹配 (当用户输入城市或行政区名时，天地图返回 area 对象)
                if data.get("area"):
                    area = data["area"]
                    lonlat_str = str(area.get("lonlat", ""))
                    if "," in lonlat_str:
                        parts = lonlat_str.split(",")
                        lon_val, lat_val = parts[0].strip(), parts[1].strip()
                        area_name = area.get("name", clean_kw)
                        c_code = extract_city_code_from_admin(area.get("adminCode"), area_name)
                        c_name = area_name.replace("市", "").replace("区", "").replace("县", "").strip()
                        candidates.append({
                            "city_code": c_code,
                            "city_name": c_name or "未知",
                            "province": "",
                            "district_name": area_name if ("区" in area_name or "县" in area_name) else "",
                            "town_name": "",
                            "poi": area_name,
                            "short_name": area_name,
                            "full_address": f"{area_name}行政区域",
                            "latitude": lat_val,
                            "longitude": lon_val,
                            "source": "tianditu"
                        })

                # 2. POI 地标与商圈候选匹配
                pois = data.get("pois", [])
                if pois:
                    async def process_single_poi(poi_item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
                        name = poi_item.get("name", "")
                        raw_addr = poi_item.get("address", "") or ""
                        lonlat = str(poi_item.get("lonlat", "")).split(",")
                        if len(lonlat) != 2:
                            return None
                        lon, lat = lonlat[0].strip(), lonlat[1].strip()

                        # 若原始地址信息不足（缺失省市或极短），并发调用天地图逆地理接口补全
                        has_city_or_prov = bool(re.search(r"(省|市)", raw_addr))
                        if not has_city_or_prov or len(raw_addr) < 4:
                            try:
                                geo_p = json.dumps({"lon": float(lon), "lat": float(lat), "ver": 1})
                                gr = await client.get(
                                    TIANDITU_GEOCODER_URL,
                                    params={"postStr": geo_p, "type": "geocode", "tk": tk},
                                    headers=headers
                                )
                                gd = gr.json()
                                res = gd.get("result", {})
                                comp = res.get("addressComponent", {})
                                raw_c = comp.get("city") or comp.get("province", "")
                                c_name = raw_c.replace("市", "").strip()
                                c_dist = comp.get("county", "")
                                admin_c = comp.get("county_code") or comp.get("city_code")
                                c_code = extract_city_code_from_admin(admin_c, c_name)
                                full_addr = res.get("formatted_address") or f"{raw_c}{c_dist}{raw_addr}"
                                return {
                                    "city_code": c_code,
                                    "city_name": c_name or "未知",
                                    "province": comp.get("province", ""),
                                    "district_name": c_dist,
                                    "town_name": comp.get("town", ""),
                                    "poi": name,
                                    "short_name": f"{c_dist} · {name}" if (c_dist and name not in c_dist) else name,
                                    "full_address": full_addr,
                                    "latitude": lat,
                                    "longitude": lon,
                                    "source": "tianditu"
                                }
                            except Exception:
                                pass

                        # 从地址字符串解析省、市、区
                        prov, city, dist = "", "", ""
                        m_direct = re.match(r"^(北京市|上海市|天津市|重庆市|北京|上海|天津|重庆)", raw_addr)
                        if m_direct:
                            prov = m_direct.group(1)
                            if not prov.endswith("市"):
                                prov += "市"
                            city = prov
                            remainder = raw_addr[len(m_direct.group(1)):].lstrip()
                            m_dist = re.search(r"^([\u4e00-\u9fa5]{2,6}?[区县])", remainder)
                            if m_dist:
                                dist = m_dist.group(1)
                        else:
                            m_prov = re.search(r"([\u4e00-\u9fa5]{2,6}?(?:省|自治区))", raw_addr)
                            if m_prov:
                                prov = m_prov.group(1)
                                after_prov = raw_addr[raw_addr.find(prov) + len(prov):]
                                m_city = re.search(r"([\u4e00-\u9fa5]{2,6}?市)", after_prov)
                                if m_city:
                                    city = m_city.group(1)
                            else:
                                m_city = re.search(r"([\u4e00-\u9fa5]{2,6}?市)", raw_addr)
                                if m_city:
                                    city = m_city.group(1)

                            m_dist = re.search(r"(?:市|盟|州)([\u4e00-\u9fa5]{2,6}?(?:区|县|旗))", raw_addr)
                            if m_dist:
                                dist = m_dist.group(1)

                        c_name = city.replace("市", "").strip() if city else ""
                        c_code = extract_city_code_from_admin(None, c_name)
                        short_title = f"{dist} · {name}" if (dist and name not in dist) else (name or clean_kw)

                        return {
                            "city_code": c_code,
                            "city_name": c_name or "未知",
                            "province": prov,
                            "district_name": dist,
                            "poi": name,
                            "short_name": short_title,
                            "full_address": raw_addr or f"{prov}{city}{dist}{name}",
                            "latitude": lat,
                            "longitude": lon,
                            "source": "tianditu"
                        }

                    tasks = [process_single_poi(p) for p in pois[:count]]
                    results = await asyncio.gather(*tasks)
                    for r in results:
                        if r:
                            candidates.append(r)

                # 去重候选 (依据经纬度精度 0.001 约 100 米内去重)
                dedup_candidates: List[Dict[str, Any]] = []
                seen_coords = set()
                for c in candidates:
                    try:
                        coord_key = (round(float(c["latitude"]), 3), round(float(c["longitude"]), 3))
                    except Exception:
                        coord_key = (c.get("latitude"), c.get("longitude"))
                    if coord_key not in seen_coords:
                        seen_coords.add(coord_key)
                        dedup_candidates.append(c)

                return dedup_candidates
        except Exception as e:
            logger.warning(f"天地图 POI 检索异常: {e}")
            return []


tianditu_client = TiandituClient()
