"""
霸王餐高精度预约与名额监听引擎 (Appointment & Restock Worker)
功能包含：
1. 未到时间点：倒计时 31 分钟发送预热提醒，倒计时 1 分钟启动高频就绪监听，到点准时/提前量毫秒级抢单
2. 已到时间点且有名额：直接即时抢单
3. 已到时间点但无名额：启动名额监听任务，定期轮询库存，检测到补仓/放单毫秒级秒抢，超时自动停，支持随时手动停止
"""
import asyncio
import logging
import time
from datetime import datetime
from typing import Optional, Dict, Any

from ..models import database as db
from ..protocol.client import XiaoCanClient, XiaoCanRPCError
from .notifier import send_system_notification

logger = logging.getLogger("xiaocan.appointment_worker")

client = XiaoCanClient()
_worker_task: Optional[asyncio.Task] = None
_is_running = False

# 内存热缓存 (Hot Cache)：将 50 次/秒高频自旋的磁盘 I/O 降低至每秒最多 1 次
_cached_active_appointments: list = []
_last_fetch_active_ts: float = 0.0
_cached_accounts: Dict[str, Any] = {}

def invalidate_worker_cache():
    global _last_fetch_active_ts
    _last_fetch_active_ts = 0.0


def _parse_time_today(time_str: str) -> Optional[float]:
    """解析 HH:MM 为今日的时间戳，若格式为 YYYY-MM-DD HH:MM:SS 则直接解析"""
    if not time_str or not str(time_str).strip():
        return None
    time_str = str(time_str).strip()
    now = datetime.now()
    try:
        if "-" in time_str:
            dt = datetime.strptime(time_str, "%Y-%m-%d %H:%M:%S")
            return dt.timestamp()
        if ":" in time_str:
            parts = time_str.split(":")
            h, m = int(parts[0]), int(parts[1])
            s = int(parts[2]) if len(parts) > 2 else 0
            dt = datetime(now.year, now.month, now.day, h, m, s)
            return dt.timestamp()
    except Exception as e:
        logger.warning(f"解析时间戳失败 {time_str}: {e}")
    return None


async def execute_grab_for_appointment(apt: Dict[str, Any], account: Dict[str, Any], advance: bool = False) -> Dict[str, Any]:
    """执行小蚕官方抢单接口"""
    aid = apt["id"]
    token = account.get("token")
    silk_id = account.get("silk_id")
    user_id = account.get("user_id")
    city_code = account.get("city_code") or 440303
    platform_code = int(apt.get("store_platform") or (3 if apt.get("platform") in ("jingdong", "jd") else (1 if apt.get("platform") == "meituan" else 2)))

    try:
        lat = float(account.get("latitude") or 0.0)
    except Exception:
        lat = 0.0
    try:
        lon = float(account.get("longitude") or 0.0)
    except Exception:
        lon = 0.0

    # 红包使用策略解析 (优先使用提前 25 秒预加载并锁定的红包，消除开抢时的网络延时)
    redpack_id = apt.get("cached_redpack_id")
    redpack_mode = apt.get("redpack_mode", 0)
    if redpack_id is None:
        if redpack_mode == 0:
            # 自动使用最高额度红包 (对齐微信小程序/省心版)
            try:
                max_rp = await client.get_user_max_redpack(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                rep_pack = max_rp.get("rep_pack") or {}
                if not rep_pack and max_rp.get("platform_red_packs"):
                    rep_pack = max_rp["platform_red_packs"][0]
                if rep_pack and rep_pack.get("user_red_pack_id"):
                    redpack_id = int(rep_pack["user_red_pack_id"])
            except Exception as rpe:
                logger.debug(f"自动查询最高红包异常: {rpe}")
        elif redpack_mode == 1:
            if apt.get("redpack_id"):
                try:
                    redpack_id = int(apt["redpack_id"])
                except Exception:
                    pass

    try:
        res = await client.grab_promotion_quota(
            promotion_id=apt["promotion_id"],
            token=token,
            silk_id=silk_id,
            user_id=user_id,
            city_code=city_code,
            store_platform=platform_code,
            if_advance_order=advance,
            latitude=lat,
            longitude=lon,
            redpack_id=redpack_id
        )
        
        # 严格校验小蚕官方订单编号 (成功时必须返回 promotion_order_id > 0)
        order_id = res.get("promotion_order_id") or (res.get("order") or {}).get("promotion_order_id") or 0
        try:
            order_id = int(order_id)
        except Exception:
            order_id = 0

        if order_id <= 0:
            err_msg = (res.get("status") or {}).get("msg") or res.get("msg") or "未返回有效订单号，官方抢单未生效"
            logger.warning(f"预约/监听任务 #{aid} 抢单未成功: {err_msg}")
            return {"ok": False, "code": -1, "message": err_msg}

        success_msg = f"官方抢单成功！名额已锁定 (订单ID: {order_id})"
        logger.info(f"预约/监听任务 #{aid} 抢单成功: {success_msg}")

        # 写入订单库
        try:
            db.create_order({
                "account_key": apt["account_key"],
                "store_id": apt["store_id"],
                "store_name": apt["store_name"],
                "platform": apt.get("platform", "meituan"),
                "order_money": apt.get("order_money", 0.0),
                "rebate_money": apt.get("rebate_price", 0.0),
                "status": "pending",
                "condition": "无需评价",
                "promotion_order_id": order_id
            })
        except Exception as oe:
            logger.warning(f"写入订单记录失败: {oe}")

        # 发送系统通知
        await send_system_notification(
            title="小蚕霸王餐抢单成功！",
            content=f"账号【{account.get('nickname')}】已成功抢到【{apt['store_name']}】({apt.get('rebate_desc', '')})，订单号 #{order_id}，请及时在平台下单！"
        )

        if aid > 0:
            db.update_appointment(aid, {
                "status": "success",
                "outcome": success_msg
            })
            invalidate_worker_cache()
        return {"ok": True, "order_id": order_id, "message": success_msg}
    except XiaoCanRPCError as e:
        logger.warning(f"抢单接口响应: code={e.code}, msg={e.msg}")
        return {"ok": False, "code": e.code, "message": e.msg}
    except Exception as e:
        logger.error(f"抢单接口网络异常: {e}")
        return {"ok": False, "code": -1, "message": str(e)}


async def process_active_appointments() -> bool:
    """单轮调度处理所有活跃的预约和监听任务，返回是否有临近 35 秒内的秒杀任务"""
    global _cached_active_appointments, _last_fetch_active_ts, _cached_accounts
    now_ts = time.time()

    # 高频自旋保护：每秒最多向磁盘发起 1 次活跃任务检索
    if now_ts - _last_fetch_active_ts >= 1.0 or not _cached_active_appointments:
        _cached_active_appointments = db.get_active_appointments()
        _last_fetch_active_ts = now_ts
        _cached_accounts.clear()

    active_list = _cached_active_appointments
    if not active_list:
        return False

    now_str = time.strftime("%Y-%m-%d %H:%M:%S")
    has_primed = False

    for apt in active_list:
        aid = apt["id"]
        status = apt.get("status")
        task_type = apt.get("task_type") or "countdown"
        acc_key = apt["account_key"]

        if acc_key not in _cached_accounts:
            _cached_accounts[acc_key] = db.get_account_by_key(acc_key)
        account = _cached_accounts[acc_key]

        if not account or not account.get("token"):
            db.update_appointment(aid, {
                "status": "failed",
                "outcome": "对应账号凭据失效或已被删除"
            })
            invalidate_worker_cache()
            continue

        # ---------------- 分支一：名额监听捡漏任务 (status == 'monitoring') ---------------- #
        if status == "monitoring" or task_type == "monitor":
            # 1. 检查是否达到截止时间
            until_ts = _parse_time_today(apt.get("until_time"))
            if until_ts and now_ts >= until_ts:
                db.update_appointment(aid, {
                    "status": "expired",
                    "outcome": f"已达到设定的监听截止时间 {apt.get('until_time')}，自动结束监听"
                })
                logger.info(f"监听任务 #{aid} 已超时结束 (until_time={apt.get('until_time')})")
                continue

            # 2. 控制检查频率 (默认每 check_interval 秒检查一次，最低 3 秒)
            interval = max(3, int(apt.get("check_interval") or 5))
            last_checked = _parse_time_today(apt.get("last_checked_at"))
            if last_checked and (now_ts - last_checked) < interval:
                continue

            # 更新最后检查时间戳
            db.update_appointment(aid, {"last_checked_at": now_str})

            # 3. 查验最新实时库存
            try:
                detail = await client.get_store_promotion_detail(
                    promotion_id=apt["promotion_id"],
                    token=account["token"],
                    silk_id=account.get("silk_id"),
                    user_id=account.get("user_id"),
                    city_code=account.get("city_code", 440303)
                )
                pdetail = detail.get("promotion_detail") or {}
                mt_left = pdetail.get("meituan_left_number", 0)
                ele_left = pdetail.get("eleme_left_number", 0)
                plat = apt.get("platform", "meituan")
                target_left = mt_left if plat == "meituan" else ele_left
                if target_left is None or target_left == 0:
                    target_left = pdetail.get("left_number", 0)

                if target_left and int(target_left) > 0:
                    logger.info(f"监听任务 #{aid} 捕获到名额放单 (剩余: {target_left})！立即触发闪电抢单...")
                    res = await execute_grab_for_appointment(apt, account, advance=False)
                    if not res["ok"]:
                        logger.warning(f"监听捕获后抢单失败: {res['message']}，继续保持监听")
            except Exception as e:
                logger.debug(f"轮询活动实时库存异常 (非致命): {e}")

        # ---------------- 分支二：倒计时预约任务 (status in 'scheduled', 'primed', 'pending') ---------------- #
        elif status in ("scheduled", "primed", "pending"):
            start_ts = _parse_time_today(apt.get("start_time"))
            if not start_ts:
                continue

            diff = start_ts - now_ts
            early_sec = max(0.0, float(apt.get("early_ms") or 500) / 1000.0)

            # 标记是否有临近开抢任务 (若在 35 秒内，开启 20ms 自适应超高精度监测)
            if 0 < diff <= 35:
                has_primed = True

            # 1. 倒计时 31 分钟预热通知提醒
            if diff <= (31 * 60) and not apt.get("notified_31m"):
                db.update_appointment(aid, {"notified_31m": 1})
                logger.info(f"任务 #{aid} 触发倒计时 31 分钟预热通知")
                try:
                    await send_system_notification(
                        title="霸王餐开抢预热提醒",
                        content=f"您预约的【{apt['store_name']}】({apt.get('rebate_desc', '')}) 还有 31 分钟开抢（时间: {apt.get('start_time')}），抢单通道已就绪！"
                    )
                except Exception as ne:
                    logger.warning(f"发送系统预热通知失败: {ne}")

            # 2. 倒计时 25 秒：长连接热激活 + 提前解析并锁定最高可用红包 (消除开火网络耗时)
            if diff <= 25 and not apt.get("prewarmed"):
                apt["prewarmed"] = 1
                db.update_appointment(aid, {"status": "primed"})
                logger.info(f"预约任务 #{aid} 提前 25 秒唤醒预热，长连接热激活并提前解析红包...")
                try:
                    # 提前探测一次连接与锁定最优红包
                    await client.get_user_info(token=account["token"], silk_id=account.get("silk_id"), user_id=account.get("user_id"), city_code=account.get("city_code", 440303))
                    if apt.get("redpack_mode", 0) == 0 and not apt.get("cached_redpack_id"):
                        max_rp = await client.get_user_max_redpack(token=account["token"], silk_id=account.get("silk_id"), user_id=account.get("user_id"), city_code=account.get("city_code", 440303))
                        rep_pack = max_rp.get("rep_pack") or {}
                        if not rep_pack and max_rp.get("platform_red_packs"):
                            rep_pack = max_rp["platform_red_packs"][0]
                        if rep_pack and rep_pack.get("user_red_pack_id"):
                            apt["cached_redpack_id"] = int(rep_pack["user_red_pack_id"])
                            logger.info(f"预约任务 #{aid} 已提前锁定最优红包 #{apt['cached_redpack_id']}")
                except Exception as rpe:
                    logger.debug(f"预约任务提前解析红包异常: {rpe}")

            # 3. 准点 / 提前量到达 (diff <= early_sec)：突发毫秒抢单！
            if diff <= early_sec:
                logger.info(f"任务 #{aid} 抢单时间点到达 (提前量 {early_sec}s)，发起突发毫秒抢单！")
                grab_ok = False
                last_msg = "抢单未生效"
                for try_idx in range(1, 4):
                    ts_fmt = datetime.now().strftime('%H:%M:%S.%f')[:-3]
                    res = await execute_grab_for_appointment(apt, account, advance=False)
                    if res.get("ok"):
                        logger.info(f"[{ts_fmt}] 任务 #{aid} 第{try_idx}次抢单成功！")
                        grab_ok = True
                        break
                    else:
                        last_msg = res.get("message") or "名额已满或尚未开仓"
                        logger.warning(f"[{ts_fmt}] 任务 #{aid} 第{try_idx}次抢单提示: {last_msg}")
                        if res.get("code") in (40003, 40004, 40037, 40038, 40039, 40040):
                            break
                    await asyncio.sleep(0.06)

                if not grab_ok:
                    until_str = apt.get("until_time")
                    if until_str:
                        db.update_appointment(aid, {
                            "status": "monitoring",
                            "outcome": f"首轮抢单未锁定 ({last_msg})，已自动切换为持续捡漏监听模式（持续至 {until_str}）"
                        })
                        logger.info(f"任务 #{aid} 首轮抢单未成功，已自动转入持续监听捡漏至 {until_str}")
                    else:
                        db.update_appointment(aid, {
                            "status": "failed",
                            "outcome": f"抢单失败: {last_msg}"
                        })

        # ---------------- 分支三：定时搜索任务 (task_type == 'keyword') ---------------- #
        elif task_type == "keyword":
            # 1. 检查是否达到开始时间
            start_ts = _parse_time_today(apt.get("start_time"))
            if start_ts and now_ts < start_ts:
                continue

            # 2. 检查是否超过截止时间
            until_ts = _parse_time_today(apt.get("until_time"))
            if until_ts and now_ts >= until_ts:
                db.update_appointment(aid, {
                    "status": "expired",
                    "outcome": f"已达到设定的定时搜索截止时间 {apt.get('until_time')}，自动结束"
                })
                continue

            # 3. 检查频率 (默认每 check_interval 秒搜索一次，最低 10 秒)
            interval = max(10, int(apt.get("check_interval") or 30))
            last_checked = _parse_time_today(apt.get("last_checked_at"))
            if last_checked and (now_ts - last_checked) < interval:
                continue

            db.update_appointment(aid, {"last_checked_at": now_str})

            # 4. 调用小蚕官方微服务实时搜索
            try:
                kw = apt.get("store_name", "").strip()
                s_res = await client.search_stores(
                    keyword=kw,
                    city_code=account.get("city_code", 440303),
                    longitude=str(account.get("longitude", "114.13166")),
                    latitude=str(account.get("latitude", "22.548361")),
                    offset=0,
                    limit=10,
                    token=account["token"],
                    silk_id=account.get("silk_id"),
                    user_id=account.get("user_id")
                )
                prom_list = s_res.get("promotion_list") or []
                matched = None
                for p in prom_list:
                    # 匹配平台
                    p_plat = "meituan" if p.get("store_platform") == 1 else "eleme"
                    if apt.get("platform") and apt.get("platform") != p_plat:
                        continue
                    left_num = p.get("left_number") or p.get("meituan_left_number") or p.get("eleme_left_number") or 0
                    if left_num > 0:
                        matched = p
                        break

                if matched:
                    logger.info(f"定时搜索 #{aid} 搜到目标商户【{matched.get('store_name')}】(pid={matched.get('promotion_id')})，立即触发官方抢单！")
                    grab_apt = dict(apt)
                    grab_apt["promotion_id"] = str(matched["promotion_id"])
                    grab_apt["store_name"] = matched.get("store_name", kw)
                    res = await execute_grab_for_appointment(grab_apt, account, advance=False)
                    if res["ok"]:
                        logger.info(f"定时搜索 #{aid} 抢单成功！")
                    else:
                        logger.warning(f"定时搜索 #{aid} 抢单失败: {res['message']}，继续保持搜索")
            except Exception as se:
                logger.debug(f"定时搜索执行异常: {se}")

    return has_primed


async def _appointment_loop():
    """后台常驻循环：常态 1.0s 低功耗，有临近秒杀时自适应 20ms 超高精度监测"""
    logger.info("霸王餐预约与名额监听引擎已启动")
    while _is_running:
        try:
            has_primed = await process_active_appointments()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"预约监听主循环发生未捕获异常: {e}")
            has_primed = False

        if has_primed:
            await asyncio.sleep(0.02)
        else:
            await asyncio.sleep(1.0)
    logger.info("霸王餐预约与名额监听引擎已安全退出")


def start_appointment_worker():
    global _worker_task, _is_running
    if not _is_running:
        _is_running = True
        try:
            loop = asyncio.get_running_loop()
            _worker_task = loop.create_task(_appointment_loop())
        except RuntimeError:
            pass


def stop_appointment_worker():
    global _worker_task, _is_running
    _is_running = False
    if _worker_task and not _worker_task.done():
        _worker_task.cancel()
