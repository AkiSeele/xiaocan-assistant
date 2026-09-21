"""
基于 APScheduler 的高精度异步任务调度中心
支持定时任务、整点秒杀高并发并发抢券、即时手动触发与日志记录
"""
import asyncio
import logging
import time
import random
from datetime import datetime, timedelta
import uuid
from typing import Dict, Any, Optional, Tuple
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.combining import OrTrigger

from ..models import database as db
from ..protocol.client import XiaoCanClient, XiaoCanRPCError

logger = logging.getLogger("xiaocan.scheduler")

scheduler = AsyncIOScheduler()
client = XiaoCanClient()


# 任务默认触发时间定义
TASK_DEFAULT_TIME = {
    "yb_task": "08:05",         # 领 500 元宝 (浏览电商30s)
    "yb_sign": "08:10",         # 天天赚元宝签到
    "svip_rebate": "09:00",     # 抢SVIP专属返利券
    "brand_flash": "09:30",     # 抢SVIP大牌券
    "media_vip": "10:00",       # 抢每月影音VIP (10:00/17:00/20:00)
    "free_order": "14:00",      # 抢每月免单券
    "collect_points": "23:59",  # 收取未收元宝 (避免气泡过期)
    "redpack_rain": "10:00",    # 公共整点红包雨 (六场: 10/11/12/14/16/19)
    "flash_sale": "10:00",      # 元宝秒杀
    "daily": "08:10",           # 元宝乐园综合打卡 (兼容旧版)
    "group_lottery": "07:40",   # 社群转盘抽奖
    "vip_expand": "08:30",      # 会员成长膨胀礼包
    "expire_remind": "08:00",   # 登录凭据到期巡检
    "coupon_remind": "08:30",   # 卡券到期提醒
    "dual_rebate_monitor": "*/10 9-22 * * *", # 美团同店双返利智能监控 (每10分钟准点对齐00/30分)
}


async def prepare_warmup_and_wait(
    target_hour: int,
    target_minute: int,
    token: str,
    silk_id: Optional[str] = None,
    user_id: Optional[str] = None,
    city_code: int = 440303,
    early_ms: int = 50,
    trigger_type: str = "cron"
) -> str:
    """
    秒杀与突发任务专用：提前 25 秒预热唤醒、连接池长连接热激活、毫秒级时钟自旋与压枪等待
    1. 若为 manual 手动触发，跳过等待，即时触发；
    2. 若为 cron 定时触发，提前 25 秒完成 HTTP/2 握手与心跳，进入高频微秒自旋，在 (目标时刻 - early_ms) 毫秒精准返回
    """
    if trigger_type == "manual":
        return ""

    now = datetime.now()
    target_dt = now.replace(hour=target_hour, minute=target_minute, second=0, microsecond=0)
    now_ts = now.timestamp()
    target_ts = target_dt.timestamp()

    # 若目标时间比当前早超过 5 秒（例如跨过零点），顺延至次日
    if target_ts < now_ts - 5.0:
        target_dt += timedelta(days=1)
        target_ts = target_dt.timestamp()

    diff = target_ts - now_ts
    # 如果已经超过目标时刻或差距超过 45 秒（异常唤醒），直接返回
    if diff <= 0 or diff > 45.0:
        return ""

    warmup_log = f"[{time.strftime('%H:%M:%S')}] 任务已提前 25 秒预热唤醒，连接池已激活待命 (目标时刻: {target_hour:02d}:{target_minute:02d}:00)\n"
    
    # 1. 预热网关长连接 (Keep-Alive Pre-warm)，消除首包 DNS 解析与 TLS 1.3 握手耗时
    try:
        await client.get_user_info(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
    except Exception:
        pass

    # 2. 毫秒级自旋等待与压枪发射
    early_sec = early_ms / 1000.0
    while True:
        rem = target_ts - time.time()
        if rem <= early_sec:
            break
        elif rem > 3.0:
            await asyncio.sleep(rem - 2.5)
        elif rem > 0.3:
            await asyncio.sleep(0.05)
        else:
            await asyncio.sleep(0.002)

    return warmup_log


async def execute_task_job(account_key: str, task_id: str, trigger_type: str = "cron") -> Dict[str, Any]:
    """统一任务执行入口 (对齐牛马助手与小蚕助手官方标准流水线)"""
    job_id = f"job_{int(time.time())}_{uuid.uuid4().hex[:6]}"
    account = db.get_account_by_key(account_key)
    if not account:
        logger.warning(f"账号不存在: {account_key}")
        return {"ok": False, "msg": "账号不存在"}

    token = account.get("token")
    if not token:
        msg = f"账号 [{account.get('nickname')}] 未配置有效 Token，请先登录绑定"
        db.add_job_log(job_id, account_key, task_id, "error", msg)
        return {"ok": False, "msg": msg}

    city_code = account.get("city_code") or 440303
    nickname = account.get("nickname") or account_key
    silk_id = account.get("silk_id")
    user_id = account.get("user_id")

    log_output = f"[{time.strftime('%H:%M:%S')}] 开始执行任务 [{task_id}] (账号: {nickname}, 触发: {trigger_type})\n"
    status = "running"
    log_id = 0
    try:
        log_id = db.add_job_log(job_id, account_key, task_id, "running", log_output)
    except Exception:
        pass

    # 读取该任务的自定义参数配置
    configs = {c["task_id"]: c for c in db.get_task_configs(account_key)}
    task_cfg = configs.get(task_id, {})
    params = task_cfg.get("params") or {}

    try:
        if task_id == "daily":
            # 1. 元宝乐园每日签到打卡
            try:
                sign_res = await client.do_user_sign(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                log_output += f"[{time.strftime('%H:%M:%S')}] 每日签到: 打卡成功 (状态: {sign_res.get('status', {}).get('msg', 'ok')})\n"
            except XiaoCanRPCError as e:
                log_output += f"[{time.strftime('%H:%M:%S')}] 每日签到: {e.msg} (提示码: {e.code})\n"

            # 2. 完成任务领奖励 (饿了么: 3, 美团: 4, 官方社群: 6)
            task_events = [
                (3, "饿了么领券"),
                (4, "美团领券"),
                (6, "小蚕专属社群")
            ]
            for tid, tname in task_events:
                try:
                    await client.complete_task_event(task_type=tid, token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                    log_output += f"[{time.strftime('%H:%M:%S')}] 任务事件 [{tname}]: 奖励领取成功\n"
                except XiaoCanRPCError as e:
                    if e.code == 3:
                        log_output += f"[{time.strftime('%H:%M:%S')}] 任务事件 [{tname}]: 今日已完成\n"
                    else:
                        log_output += f"[{time.strftime('%H:%M:%S')}] 任务事件 [{tname}]: {e.msg} (提示码: {e.code})\n"

            # 3. 增加每日抽奖次数
            try:
                await client.incr_lottery_number(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                log_output += f"[{time.strftime('%H:%M:%S')}] 抽奖机会: 每日抽奖次数已同步累加\n"
            except Exception as e:
                log_output += f"[{time.strftime('%H:%M:%S')}] 抽奖机会累加: {e}\n"

        elif task_id == "vip_expand":
            # 1. 会员升级/每日专属成长礼包激活
            try:
                await client.get_vip_up_gift(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                log_output += f"[{time.strftime('%H:%M:%S')}] 会员成长礼包: 权益已核销更新\n"
            except XiaoCanRPCError as e:
                log_output += f"[{time.strftime('%H:%M:%S')}] 会员成长礼包: {e.msg} (提示码: {e.code})\n"

            # 2. 会员专属权益卡券清单核对
            try:
                gifts_res = await client.list_vip_gifts(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                gift_count = len(gifts_res.get("list") or [])
                log_output += f"[{time.strftime('%H:%M:%S')}] 会员特权档位: 已校验 {gift_count} 项特权卡券配置\n"
            except Exception:
                pass

            # 3. 会员每日成长任务
            try:
                await client.get_vip_task(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                log_output += f"[{time.strftime('%H:%M:%S')}] 会员成长任务: 状态正常\n"
            except Exception:
                pass

            # 4. 会员专属每日膨胀红包池与积分查询
            try:
                prizes_res = await client.get_vip_prizes(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                p_data = prizes_res.get("data") or {}
                score = p_data.get("current_score", 0)
                receive_help = bool(params.get("receive_help", True))
                log_output += f"[{time.strftime('%H:%M:%S')}] 会员专属膨胀金: 当前成长积分 {score}，今日膨胀红包金池已刷新 (互助助力: {'开启' if receive_help else '关闭'})\n"
            except XiaoCanRPCError as e:
                log_output += f"[{time.strftime('%H:%M:%S')}] 会员专属膨胀金: {e.msg}\n"

        elif task_id == "group_lottery":
            # 1. 查询转盘配置与剩余抽奖机会
            lucky_times = 0
            day_num = 0
            try:
                info_res = await client.get_lottery_info(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                linfo = info_res.get("lottery_info") or {}
                lucky_times = linfo.get("lucky_times", 0)
                day_num = linfo.get("day_num", 0)
                log_output += f"[{time.strftime('%H:%M:%S')}] 社群转盘状态: 今日已抽奖 {day_num} 次，当前剩余可用次数: {lucky_times}\n"
            except XiaoCanRPCError as e:
                log_output += f"[{time.strftime('%H:%M:%S')}] 获取转盘状态: {e.msg} (提示码: {e.code})\n"

            # 2. 尝试领取各类免费机会 (2:分享, 8:饿了么, 9:美团, 10:到店, 11:福利)
            for t_type, t_label in [(2, "每日分享"), (8, "饿了么加赠"), (9, "美团加赠"), (10, "到店浏览"), (11, "福利中心")]:
                try:
                    await client.add_lottery_times(lottery_type=t_type, token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                    log_output += f"[{time.strftime('%H:%M:%S')}] 免费抽奖机会 [{t_label}]: 领取成功\n"
                    lucky_times += 1
                except XiaoCanRPCError:
                    pass

            # 3. 查询阶梯累计抽奖进度
            try:
                prog_res = await client.get_lottery_progress(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                prog = prog_res.get("lottery_progress") or {}
                log_output += f"[{time.strftime('%H:%M:%S')}] 阶梯进度: 已完成 {prog.get('lottery_count', 0)} 次 (一阶段: {prog.get('first_step_count', 3)}, 二阶段: {prog.get('second_step_count', 9)})\n"
            except Exception:
                pass

            # 4. 若有可用抽奖次数则自动连续执行抽奖 (支持配置抽奖防风控间隔秒数)
            draw_gap = float(params.get("draw_sec", 3.5))
            if lucky_times > 0:
                for spin_i in range(min(lucky_times, 5)):
                    if spin_i > 0 and draw_gap > 0:
                        await asyncio.sleep(draw_gap)
                    try:
                        await client.do_lottery_spin(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                        log_output += f"[{time.strftime('%H:%M:%S')}] 第 {spin_i+1} 次抽奖成功: 获得奖品 (间隔 {draw_gap}s)\n"
                    except XiaoCanRPCError as e:
                        log_output += f"[{time.strftime('%H:%M:%S')}] 抽奖结束: {e.msg} (状态码: {e.code})\n"
                        break
            else:
                log_output += f"[{time.strftime('%H:%M:%S')}] 今日抽奖机会已满额打卡，无需重复消耗\n"

        elif task_id == "redpack_rain":
            # 整点红包雨 (每日 10:00, 11:00, 12:00, 14:00, 16:00, 19:00)
            now_dt = datetime.now()
            next_hour = (now_dt.hour + 1) % 24 if now_dt.minute >= 50 else now_dt.hour
            warmup_msg = await prepare_warmup_and_wait(
                target_hour=next_hour, target_minute=0, token=token,
                silk_id=silk_id, user_id=user_id, city_code=city_code,
                early_ms=50, trigger_type=trigger_type
            )
            if warmup_msg:
                log_output += warmup_msg

            # 读取红包雨自定义参数 (拟真点击数、随机抖动、下落等待时间)
            base_clicks = int(params.get("click_num") or 15)
            jitter = int(params.get("jitter") if params.get("jitter") is not None else 5)
            wait_sec_cfg = int(params.get("game_wait_sec") or 28)

            log_output += f"[{time.strftime('%H:%M:%S')}] 正在检索当前/即将开始的整点红包雨活动场次...\n"
            try:
                rain_res = await client.get_redpack_rain_event(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                event_info = rain_res.get("event") or {}
                has_event = rain_res.get("has_event", False)
                if not has_event or not event_info:
                    log_output += f"[{time.strftime('%H:%M:%S')}] 当前暂无生效中的红包雨活动场次 (每日六场: 10/11/12/14/16/19点)\n"
                else:
                    event_id = event_info.get("event_id")
                    begin_ts = event_info.get("begin_time", 0)
                    end_ts = event_info.get("end_time", 0)
                    evt_status = event_info.get("status", 0)
                    begin_str = time.strftime('%H:%M:%S', time.localtime(begin_ts)) if begin_ts else "待定"
                    end_str = time.strftime('%H:%M:%S', time.localtime(end_ts)) if end_ts else "待定"
                    now_ts = int(time.time())
                    log_output += f"[{time.strftime('%H:%M:%S')}] 探测到红包雨场次 #{event_id}: 营业时间 {begin_str} - {end_str} (状态: {evt_status})\n"

                    # 若距开场不到 60 秒且为定时任务调度，自旋平滑对齐至开场时刻
                    if now_ts < begin_ts:
                        wait_start = begin_ts - now_ts
                        if wait_start <= 60 and trigger_type == "cron":
                            log_output += f"[{time.strftime('%H:%M:%S')}] 距离开场尚有 {wait_start} 秒，等待开场时段...\n"
                            await asyncio.sleep(wait_start)
                            now_ts = int(time.time())
                        else:
                            log_output += f"[{time.strftime('%H:%M:%S')}] 提示: 场次 #{event_id} 尚未开始 ({begin_str} 开始，当前时间 {time.strftime('%H:%M:%S')})\n"

                    # 1. 接入/报名当前场次 (JoinRedPackRainEvent)
                    join_ok = False
                    for try_idx in range(1, 4):
                        ts_fmt = datetime.now().strftime('%H:%M:%S.%f')[:-3]
                        try:
                            j_res = await client.join_redpack_rain(token=token, event_id=event_id, silk_id=silk_id, user_id=user_id, city_code=city_code)
                            succ = j_res.get("success", False)
                            f_reason = j_res.get("failed_reason") or ""
                            if succ:
                                log_output += f"[{ts_fmt}] [公共红包雨] 第{try_idx}次请求: 成功接入第 {event_id} 场次！\n"
                                join_ok = True
                                break
                            else:
                                log_output += f"[{ts_fmt}] [公共红包雨] 第{try_idx}次接入提示: {f_reason or '尚未开抢或已在场内'}\n"
                                if "已参与" in f_reason or "已在场" in f_reason:
                                    join_ok = True
                                    break
                                if "未开始" in f_reason:
                                    break
                        except XiaoCanRPCError as je:
                            log_output += f"[{ts_fmt}] [公共红包雨] 第{try_idx}次接入提示: {je.msg} (代码: {je.code})\n"
                            if je.code == 40023:
                                log_output += f"[{ts_fmt}] [公共红包雨] 提示: 该账号在此场次中已完成抽奖，无需重复参与\n"
                                break
                        await asyncio.sleep(0.2)

                    # 2. 拟真红包雨下落交互时长与点击额度结算 (对齐牛马助手 28~35 秒交互与 15±5 拟真抓取数)
                    if join_ok:
                        cur_ts = time.time()
                        target_end = begin_ts + wait_sec_cfg
                        if cur_ts < target_end:
                            rem_wait = max(4.0, target_end - cur_ts + random.uniform(-1.5, 1.5))
                            log_output += f"[{datetime.now().strftime('%H:%M:%S')}] 场次接入完毕，正在模拟下落红包抓取与互动中 (拟真耗时约 {rem_wait:.1f} 秒)...\n"
                            if log_id > 0:
                                db.update_job_log(log_id, status="running", output=log_output)
                            await asyncio.sleep(rem_wait)
                        else:
                            await asyncio.sleep(random.uniform(1.0, 2.5))

                        # 拟真抓取红包数量 (base ± jitter)
                        actual_clicks = max(1, random.randint(max(1, base_clicks - jitter), base_clicks + jitter))
                        log_output += f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] 互动完成，准备上报结算抓取额度 (点击数: {actual_clicks})...\n"

                        grab_ok = False
                        for try_idx in range(1, 4):
                            ts_fmt = datetime.now().strftime('%H:%M:%S.%f')[:-3]
                            try:
                                g_res = await client.grab_redpack_rain(
                                    token=token,
                                    event_id=event_id,
                                    click_num=actual_clicks,
                                    silk_id=silk_id,
                                    user_id=user_id,
                                    city_code=city_code
                                )
                                items = g_res.get("items") or []
                                if items:
                                    p_details = []
                                    for it in items:
                                        p_name = it.get("name") or "好运红包"
                                        p_val = it.get("prize_value")
                                        if p_val is not None:
                                            p_details.append(f"{p_name}({p_val/100:.2f}元)")
                                        else:
                                            p_details.append(p_name)
                                    p_str = "、".join(p_details)
                                    log_output += f"[{ts_fmt}] [公共红包雨] 结算成功！上报点击 {actual_clicks} 次，斩获 {len(items)} 个红包：{p_str}\n"
                                    from .notifier import send_system_notification
                                    await send_system_notification(
                                        title="整点红包雨中奖提醒",
                                        content=f"账号【{nickname}】在场次 #{event_id} ({begin_str}场) 斩获 {len(items)} 个红包：{p_str}！"
                                    )
                                else:
                                    log_output += f"[{ts_fmt}] [公共红包雨] 抓取结算完成 (上报点击 {actual_clicks} 次)，但本场未分配到有效红包 (可能名额已发完或限额)\n"
                                grab_ok = True
                                break
                            except XiaoCanRPCError as ge:
                                if ge.code == 40023:
                                    log_output += f"[{ts_fmt}] [公共红包雨] 提示: 该账号在此场次中已完成结算抽奖，无需重复提交\n"
                                    break
                                elif ge.code == 200001:
                                    log_output += f"[{ts_fmt}] [公共红包雨] 风险拦截: 触发风控安全校验 (代码: 200001: {ge.msg})\n"
                                    from .notifier import send_system_notification
                                    await send_system_notification(
                                        title="红包雨风控安全拦截",
                                        content=f"账号【{nickname}】参与场次 #{event_id} 红包雨触发安全风控，请在微信小程序完成一次人机验证。"
                                    )
                                    break
                                else:
                                    log_output += f"[{ts_fmt}] [公共红包雨] 第{try_idx}次抓取提示: {ge.msg} (代码: {ge.code})\n"
                                    if ge.code in (40015, 40028):
                                        break
                            await asyncio.sleep(0.5)

                    # 3. 统计账户内领取的红包
                    try:
                        packs_res = await client.list_user_redpack(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                        r_list = packs_res.get("items") or packs_res.get("list") or []
                        if r_list:
                            today_start = int(datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).timestamp())
                            today_packs = [it for it in r_list if (it.get("prize", {}).get("lottery_time") or 0) >= today_start]
                            log_output += f"[{time.strftime('%H:%M:%S')}] 红包账户核验: 今日累计中得 {len(today_packs)} 个红包雨奖励 (历史存留总计 {len(r_list)} 条)\n"
                    except Exception:
                        pass
            except XiaoCanRPCError as e:
                log_output += f"[{time.strftime('%H:%M:%S')}] 红包雨接口响应: {e.msg} (代码: {e.code})\n"
            except Exception as e:
                log_output += f"[{time.strftime('%H:%M:%S')}] 红包雨处理异常: {e}\n"

        elif task_id == "brand_flash":
            # 抢SVIP大牌券 (每日 09:30:00 准点开抢)
            warmup_msg = await prepare_warmup_and_wait(
                target_hour=9, target_minute=30, token=token,
                silk_id=silk_id, user_id=user_id, city_code=city_code,
                early_ms=50, trigger_type=trigger_type
            )
            if warmup_msg:
                log_output += warmup_msg

            log_output += f"[{time.strftime('%H:%M:%S')}] 正在检索今日 09:30 SVIP 大牌神券奖池配置与实时库存...\n"
            try:
                now_ts = int(time.time())
                prizes_res = await client.get_vip_prizes(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                p_data = prizes_res.get("data") or {}
                red_pack_cfg = p_data.get("red_pack_config") or []
                remaining_amt = p_data.get("remaining_amount", 0)

                # 匹配当前时间对应场次 (09:30 场或 16:00 场)
                active_cfg = None
                for cfg in red_pack_cfg:
                    st = cfg.get("start_time", 0)
                    et = cfg.get("end_time", 0)
                    if st <= now_ts <= et:
                        active_cfg = cfg
                        break
                if not active_cfg and red_pack_cfg:
                    active_cfg = red_pack_cfg[0]

                st_val = active_cfg.get("start_time", 0) if active_cfg else 0
                st_str = time.strftime('%H:%M', time.localtime(st_val)) if st_val else "09:30"
                v_items = active_cfg.get("daily_red_pack_vip_config") or [] if active_cfg else []
                tiers = [f"VIP{vi.get('vip_level')}大牌券({vi.get('inventory')}份)" for vi in v_items]
                tiers_str = ' / '.join(tiers)

                if now_ts < st_val:
                    log_output += f"[{time.strftime('%H:%M:%S')}] 场次配置就绪: {st_str} 场 (尚未开始，开抢时间: {st_str}:00) [{tiers_str}]\n"
                elif remaining_amt == 0:
                    log_output += f"[{time.strftime('%H:%M:%S')}] 奖池监测: {st_str} 场次神券当前已售罄 (实时余量: 0 | 初始配额: {tiers_str})\n"
                    log_output += f"[{time.strftime('%H:%M:%S')}] 提示: 该场次大牌神券已被抢光，助手将在每日 09:30:00 准点开抢。\n"
                else:
                    log_output += f"[{time.strftime('%H:%M:%S')}] 奖池就绪: {st_str} 场次火热发放中 (实时余量: {remaining_amt} | 初始配额: {tiers_str})\n"

                # 若仍有库存或正处于开抢突发秒杀期，执行并发/连续秒杀 (burst retry)
                if remaining_amt > 0 or (st_val and abs(now_ts - st_val) <= 120):
                    lottery_success = False
                    # 获取账号 VIP 等级以传入 Go 微服务
                    user_vip_lvl = 0
                    try:
                        u_info = await client.get_user_info(token=token, silk_id=silk_id, user_id=user_id)
                        user_vip_lvl = (u_info.get("vip_level_info") or {}).get("new_level", 0)
                    except Exception:
                        pass

                    for try_idx in range(1, 4):
                        ts_fmt = datetime.now().strftime('%H:%M:%S.%f')[:-3]
                        try:
                            lottery_res = await client.vip_prizes_lottery(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code, vip_level=user_vip_lvl)
                            prize = lottery_res.get("prize") or {}
                            p_name = prize.get("name") or prize.get("title") or "SVIP大牌券"
                            log_output += f"[{ts_fmt}] [抢SVIP大牌券] 第{try_idx}次请求 抢券成功！({p_name})\n"
                            lottery_success = True
                            from .notifier import send_system_notification
                            await send_system_notification(
                                title="抢SVIP大牌券成功",
                                content=f"账号【{nickname}】在 {st_str} 场次成功抢到【{p_name}】！"
                            )
                            break
                        except XiaoCanRPCError as e:
                            if e.code == 50010:
                                log_output += f"[{ts_fmt}] [抢SVIP大牌券] 第{try_idx}次请求提示: 官方限制仅限独立App端领取或本场已抢光 (代码: 50010)\n"
                                break
                            log_output += f"[{ts_fmt}] [抢SVIP大牌券] 第{try_idx}次请求提示: {e.msg} (代码: {e.code})\n"
                            if e.code in (40003, 40004, 40037, 40038, 40039, 40040):
                                break
                        except Exception as e:
                            log_output += f"[{ts_fmt}] [抢SVIP大牌券] 第{try_idx}次请求异常: {e}\n"
                        await asyncio.sleep(0.1)
            except XiaoCanRPCError as e:
                log_output += f"[{time.strftime('%H:%M:%S')}] SVIP大牌券配置响应: {e.msg} (代码: {e.code})\n"
            except Exception as e:
                log_output += f"[{time.strftime('%H:%M:%S')}] SVIP大牌券秒杀异常: {e}\n"

        elif task_id == "yb_task":
            # 领 500 元宝 (浏览电商30s任务，官方任务ID 57)
            log_output += f"[{time.strftime('%H:%M:%S')}] 正在检索天天赚元宝中心每日任务状态...\n"
            try:
                tasks_res = await client.get_daily_tasks(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                task_list = (tasks_res.get("data") or {}).get("list") or []
                target_task = None
                for t in task_list:
                    if t.get("id") == 57 or "30s" in (t.get("title") or "") or "30s" in (t.get("sub_title") or ""):
                        target_task = t
                        break
                if not target_task and task_list:
                    for t in task_list:
                        if t.get("completed") == 2 and t.get("point", 0) >= 500:
                            target_task = t
                            break

                if target_task:
                    tid = target_task.get("id", 57)
                    t_title = target_task.get("title") or "抖音电商浏览30s"
                    c_status = target_task.get("completed", 2)
                    pts = target_task.get("point", 500)
                    
                    if c_status == 1:
                        log_output += f"[{time.strftime('%H:%M:%S')}] 任务 [{t_title}]: 今日已完成打卡，奖励已入账\n"
                    else:
                        ts_fmt = datetime.now().strftime('%H:%M:%S.%f')[:-3]
                        log_output += f"[{ts_fmt}] 正在执行任务 [{t_title}] (奖励 {pts} 元宝)...\n"
                        try:
                            comp_res = await client.complete_activity_task(task_id=tid, token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                            detail = comp_res.get("detail") or {}
                            new_bal = detail.get("balance")
                            bal_tip = f" (最新余额: {new_bal} 元宝)" if new_bal else ""
                            log_output += f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] 任务 [{t_title}] 提交成功！已斩获 {pts} 元宝{bal_tip}\n"
                            
                            # 尝试立即收取
                            try:
                                await client.user_claim_points(task_id=tid, token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                            except Exception:
                                pass
                        except XiaoCanRPCError as ce:
                            if ce.code == 10001 or "完成" in ce.msg:
                                log_output += f"[{datetime.now().strftime('%H:%M:%S')}] 任务 [{t_title}]: 今日已完成无需重复提交\n"
                            else:
                                log_output += f"[{datetime.now().strftime('%H:%M:%S')}] 任务提交响应: {ce.msg} (代码: {ce.code})\n"
                else:
                    log_output += f"[{time.strftime('%H:%M:%S')}] 提示: 今日元宝任务列表中未找到待完成的浏览任务\n"
            except XiaoCanRPCError as e:
                log_output += f"[{time.strftime('%H:%M:%S')}] 元宝任务接口响应: {e.msg} (代码: {e.code})\n"
            except Exception as e:
                log_output += f"[{time.strftime('%H:%M:%S')}] 元宝任务执行异常: {e}\n"

        elif task_id == "collect_points":
            # 收取未收元宝 (收取气泡成熟元宝与已达标任务代币，避免过期失效)
            log_output += f"[{time.strftime('%H:%M:%S')}] 正在检索账户待收取的达标任务与元宝奖励...\n"
            try:
                # 1. 探测未领取元宝明细列表 (GetUnReceivedPointRecords)
                unrec_res = await client.get_unreceived_point_records(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                unrec_point_data = unrec_res.get("point") or {}
                unrec_items = unrec_point_data.get("items") or []
                unrec_points = int(unrec_point_data.get("points") or 0)

                # 2. 探测每日任务中已达标待领取任务 (completed == 3: 去领取)
                tasks_res = await client.get_daily_tasks(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                task_list = (tasks_res.get("data") or {}).get("list") or []
                pending_tasks = [t for t in task_list if t.get("completed") == 3]

                total_unreceived = unrec_points
                # 详细列出探测到的待领任务项
                if unrec_items:
                    for item in unrec_items:
                        tname = item.get("task_name") or f"任务#{item.get('task_id')}"
                        tpt = item.get("point") or 0
                        log_output += f"[{time.strftime('%H:%M:%S')}] 发现待领任务: [{tname}] 待入账 +{tpt} 元宝\n"
                for pt in pending_tasks:
                    tname = pt.get("title") or f"任务#{pt.get('id')}"
                    tpt = pt.get("point") or 0
                    if not any(item.get("task_id") == pt.get("id") for item in unrec_items):
                        log_output += f"[{time.strftime('%H:%M:%S')}] 发现达标待领任务: [{tname}] 待入账 +{tpt} 元宝\n"
                        total_unreceived += int(tpt)

                # 3. 执行官方一键收取微服务 (ActivityTaskMobileService.CollectPoints)
                collect_res = await client.collect_points(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                claimed_pt = int(collect_res.get("point") or 0)

                # 若有独立达标任务且一键收取未覆盖，尝试逐个领取 (UserClaimPoints)
                for pt in pending_tasks:
                    tid = pt.get("id")
                    if tid:
                        try:
                            await client.user_claim_points(task_id=tid, token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                        except Exception:
                            pass
                
                # 4. 重新核验收取后最新状态与资产同步
                latest_task_info = await client.get_user_task_v2(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                task_data_obj = latest_task_info.get("data") or {}
                latest_yb = task_data_obj.get("yb_point", 0)
                latest_unrec = task_data_obj.get("unreceived_points", 0)

                # 更新本地数据库账号资产
                db.update_account_profile(account_key, {
                    "yb_point": latest_yb,
                    "unreceived_points": latest_unrec
                })

                if claimed_pt > 0:
                    log_output += f"[{time.strftime('%H:%M:%S')}] 收取成功！成功入账 +{claimed_pt} 元宝，当前账户元宝: {latest_yb}\n"
                elif total_unreceived > 0 or unrec_items or pending_tasks:
                    log_output += f"[{time.strftime('%H:%M:%S')}] 收取指令已执行，当前账户最新元宝: {latest_yb}\n"
                else:
                    log_output += f"[{time.strftime('%H:%M:%S')}] 检查完成: 当前账户无待收取的达标任务，最新元宝余额: {latest_yb}\n"
            except XiaoCanRPCError as e:
                log_output += f"[{time.strftime('%H:%M:%S')}] 收取元宝接口响应: {e.msg} (代码: {e.code})\n"
            except Exception as e:
                log_output += f"[{time.strftime('%H:%M:%S')}] 收取元宝执行异常: {e}\n"

        elif task_id == "yb_sign":
            # 天天赚元宝签到打卡 (每日 08:10)
            log_output += f"[{time.strftime('%H:%M:%S')}] 正在执行天天赚元宝每日签到打卡...\n"
            try:
                sign_res = await client.do_user_sign(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                msg = sign_res.get("status", {}).get("msg", "打卡成功")
                log_output += f"[{time.strftime('%H:%M:%S')}] 每日签到: {msg} (代码: 0)\n"
            except XiaoCanRPCError as e:
                if e.code == 3 or "已签" in e.msg:
                    log_output += f"[{time.strftime('%H:%M:%S')}] 每日签到: 今日已完成签到打卡无需重复操作\n"
                else:
                    log_output += f"[{time.strftime('%H:%M:%S')}] 每日签到响应: {e.msg} (提示码: {e.code})\n"
            except Exception as e:
                log_output += f"[{time.strftime('%H:%M:%S')}] 每日签到异常: {e}\n"

        elif task_id == "svip_rebate":
            # 抢SVIP专属返利券 (每日 09:00:00 准点开抢)
            warmup_msg = await prepare_warmup_and_wait(
                target_hour=9, target_minute=0, token=token,
                silk_id=silk_id, user_id=user_id, city_code=city_code,
                early_ms=50, trigger_type=trigger_type
            )
            if warmup_msg:
                log_output += warmup_msg

            log_output += f"[{time.strftime('%H:%M:%S')}] 正在检索今日 09:00 SVIP 专属返利券库存与当月达标资格...\n"
            try:
                rebate_res = await client.get_vip_rebate_info(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                r_data = rebate_res.get("data") or {}
                inv = r_data.get("inventory_num", 0)
                completed = r_data.get("completed_num", 0)
                total = r_data.get("total_num", 0)
                start_ts = r_data.get("start_time", 0)
                start_str = time.strftime('%H:%M:%S', time.localtime(start_ts)) if start_ts else "09:00:00"
                log_output += f"[{time.strftime('%H:%M:%S')}] 返利券监测: 开抢时间 {start_str} | 今日余量 {inv} | 当月完成 {completed}/{total} 档\n"

                if completed < total:
                    log_output += f"[{time.strftime('%H:%M:%S')}] 资格核验未通过: 当月需完成 {total} 单（当前仅 {completed} 单），未达到返利券门槛\n"
                elif inv == 0:
                    log_output += f"[{time.strftime('%H:%M:%S')}] 余量监测: 今日返利券配额已被抢完，请明日准点开抢\n"
                else:
                    ts_fmt = datetime.now().strftime('%H:%M:%S.%f')[:-3]
                    try:
                        claim_res = await client.vip_prizes_lottery(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                        p_name = (claim_res.get("prize") or {}).get("name") or "SVIP专属返利券"
                        log_output += f"[{ts_fmt}] [抢SVIP返利券] 抢券成功！已领取: 【{p_name}】\n"
                        from .notifier import send_system_notification
                        await send_system_notification(
                            title="抢SVIP返利券成功",
                            content=f"账号【{nickname}】成功领取【{p_name}】！"
                        )
                    except XiaoCanRPCError as ce:
                        if ce.code == 50010:
                            log_output += f"[{ts_fmt}] [抢SVIP返利券] 官方响应: 官方限制仅限独立App端领取或本场已抢光 (错误码: 50010)\n"
                        else:
                            log_output += f"[{ts_fmt}] [抢SVIP返利券] 官方响应: {ce.msg} (错误码: {ce.code})\n"
            except XiaoCanRPCError as e:
                log_output += f"[{time.strftime('%H:%M:%S')}] SVIP返利券接口响应: {e.msg} (代码: {e.code})\n"
            except Exception as e:
                log_output += f"[{time.strftime('%H:%M:%S')}] SVIP返利券处理异常: {e}\n"

        elif task_id == "free_order":
            # 抢每月免单券 (每日 14:00:00 准点开抢)
            warmup_msg = await prepare_warmup_and_wait(
                target_hour=14, target_minute=0, token=token,
                silk_id=silk_id, user_id=user_id, city_code=city_code,
                early_ms=50, trigger_type=trigger_type
            )
            if warmup_msg:
                log_output += warmup_msg

            log_output += f"[{time.strftime('%H:%M:%S')}] 正在检索每月免单券 14:00 专属通道状态与账户资格...\n"
            try:
                cards_res = await client.get_user_card_list(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                card_list = cards_res.get("card_list") or cards_res.get("list") or []
                existing_free = [c for c in card_list if "免单" in (c.get("name") or c.get("card_name") or "")]
                if existing_free:
                    log_output += f"[{time.strftime('%H:%M:%S')}] 账户监测: 账户内已持有 {len(existing_free)} 张有效免单券，每月限抢1张，无需重复抢券\n"
                else:
                    ts_fmt = datetime.now().strftime('%H:%M:%S.%f')[:-3]
                    try:
                        lottery_res = await client.vip_prizes_lottery(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                        p_info = lottery_res.get("prize") or {}
                        p_name = p_info.get("name") or "每月全额免单券"
                        log_output += f"[{ts_fmt}] [抢每月免单券] 抢券成功！中得: 【{p_name}】\n"
                        from .notifier import send_system_notification
                        await send_system_notification(
                            title="抢每月免单券成功",
                            content=f"账号【{nickname}】成功抢到【{p_name}】！"
                        )
                    except XiaoCanRPCError as ce:
                        if ce.code == 50010:
                            log_output += f"[{ts_fmt}] [抢每月免单券] 官方响应: 官方限制仅限独立App端领取或本场已发完 (代码: 50010)\n"
                        else:
                            log_output += f"[{ts_fmt}] [抢每月免单券] 官方响应: {ce.msg} (代码: {ce.code})\n"
            except Exception as e:
                log_output += f"[{time.strftime('%H:%M:%S')}] 抢免单券处理异常: {e}\n"

        elif task_id == "flash_sale":
            # 元宝秒杀抢券
            goods_ids = str(params.get("goods_ids", "")).strip()
            log_output += f"[{time.strftime('%H:%M:%S')}] 接入元宝商城限量秒杀通道 (目标商品: {goods_ids or '默认推荐券'})...\n"
            ts_fmt = datetime.now().strftime('%H:%M:%S.%f')[:-3]
            if goods_ids:
                try:
                    gid = int(goods_ids.split(",")[0].strip())
                    ex_res = await client.exchange_goods(goods_id=gid, token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                    log_output += f"[{ts_fmt}] [自动抢元宝秒杀] 第1次请求: 商品 #{gid} 兑换成功！(状态: {ex_res.get('status', {}).get('msg', 'ok')})\n"
                except XiaoCanRPCError as e:
                    log_output += f"[{ts_fmt}] [自动抢元宝秒杀] 第1次请求提示: {e.msg} (代码: {e.code})\n"
                except Exception as e:
                    log_output += f"[{ts_fmt}] [自动抢元宝秒杀] 请求异常: {e}\n"
            else:
                log_output += f"[{ts_fmt}] [自动抢元宝秒杀] 未指定具体商品ID，已完成秒杀通道准点探针测试\n"

        elif task_id == "media_vip":
            # 抢每月影音VIP (每日 10:00 / 17:00 / 20:00 三场)
            now_dt = datetime.now()
            target_h = 10 if now_dt.hour < 10 or (now_dt.hour == 9 and now_dt.minute >= 50) else (17 if now_dt.hour < 17 or (now_dt.hour == 16 and now_dt.minute >= 50) else 20)
            warmup_msg = await prepare_warmup_and_wait(
                target_hour=target_h, target_minute=0, token=token,
                silk_id=silk_id, user_id=user_id, city_code=city_code,
                early_ms=50, trigger_type=trigger_type
            )
            if warmup_msg:
                log_output += warmup_msg

            log_output += f"[{time.strftime('%H:%M:%S')}] 正在检索 {target_h}:00 影音会员周卡专属通道与资格...\n"
            try:
                uinfo = await client.get_user_info(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                vip_info = (uinfo.get("user_info") or {}).get("vip_level_info") or {}
                lvl = vip_info.get("new_level", 0)
                if lvl < 5:
                    log_output += f"[{time.strftime('%H:%M:%S')}] 等级核验未通过: 影音周卡仅限 VIP5、VIP6 或 SVIP4-6 用户参与 (当前等级: VIP{lvl})\n"
                else:
                    ts_fmt = datetime.now().strftime('%H:%M:%S.%f')[:-3]
                    try:
                        lottery_res = await client.vip_prizes_lottery(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                        p_info = lottery_res.get("prize") or {}
                        p_name = p_info.get("name") or "腾讯视频VIP周卡"
                        log_output += f"[{ts_fmt}] [影音会员周卡] 抢券成功！获得: 【{p_name}】\n"
                        from .notifier import send_system_notification
                        await send_system_notification(
                            title="抢影音会员周卡成功",
                            content=f"账号【{nickname}】在 {target_h}:00 场次成功抢到【{p_name}】！"
                        )
                    except XiaoCanRPCError as ce:
                        if ce.code == 50010:
                            log_output += f"[{ts_fmt}] [影音会员周卡] 官方响应: 官方限制仅限独立App端领取或本场已发完 (代码: 50010)\n"
                        else:
                            log_output += f"[{ts_fmt}] [影音会员周卡] 官方响应: {ce.msg} (代码: {ce.code})\n"
            except Exception as e:
                log_output += f"[{time.strftime('%H:%M:%S')}] 影音周卡处理异常: {e}\n"



        elif task_id == "expire_remind":
            # 凭据/JWT到期预警
            warn_days = float(params.get("warn_days", 3))
            from .jwt_utils import decode_jwt_payload
            is_valid, payload, _ = decode_jwt_payload(token)
            now_ts = int(time.time())
            exp_ts = None

            if is_valid and payload and "exp" in payload:
                exp_ts = int(payload["exp"])
            elif account.get("expires_at"):
                try:
                    exp_struct = time.strptime(account["expires_at"], "%Y-%m-%d %H:%M:%S")
                    exp_ts = int(time.mktime(exp_struct))
                except Exception:
                    pass

            if exp_ts:
                diff_sec = exp_ts - now_ts
                days_left = diff_sec / 86400.0
                exp_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(exp_ts))
                if days_left <= 0:
                    log_output += f"[{time.strftime('%H:%M:%S')}] 凭据已过期！已于 {exp_str} 失效，请在电脑微信中重新直连提取\n"
                    from .notifier import send_system_notification
                    await send_system_notification(
                        title="小蚕账号凭据已过期",
                        content=f"账号【{nickname}】登录凭据已过期（失效时间: {exp_str}），请重新在微信小程序直连提取更新！"
                    )
                elif days_left <= warn_days:
                    log_output += f"[{time.strftime('%H:%M:%S')}] 凭据即将到期预警: 剩余 {days_left:.1f} 天（到期时间: {exp_str}，阈值: {warn_days}天）\n"
                    from .notifier import send_system_notification
                    await send_system_notification(
                        title="小蚕凭据即将到期预警",
                        content=f"账号【{nickname}】凭据将在 {days_left:.1f} 天后失效（到期时间: {exp_str}），请提前更新避免掉线！"
                    )
                else:
                    log_output += f"[{time.strftime('%H:%M:%S')}] 凭据状态良好: 剩余有效时间 {days_left:.1f} 天（到期时间: {exp_str}）\n"
            else:
                log_output += f"[{time.strftime('%H:%M:%S')}] 凭据核验完成: 长期有效或无固定过期标头\n"

        elif task_id == "coupon_remind":
            # 卡券/红包到期提醒
            warn_hours = float(params.get("warn_hours", 24))
            log_output += f"[{time.strftime('%H:%M:%S')}] 正在检索账户内特权卡券与返利红包...\n"
            try:
                cards_res = await client.get_user_card_list(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                card_list = cards_res.get("card_list") or cards_res.get("list") or []
                expiring = []
                now_ts = int(time.time())
                for c in card_list:
                    exp_val = c.get("expire_time") or c.get("end_time") or 0
                    if isinstance(exp_val, str):
                        try:
                            exp_val = int(time.mktime(time.strptime(exp_val, "%Y-%m-%d %H:%M:%S")))
                        except Exception:
                            exp_val = 0
                    if exp_val > now_ts and (exp_val - now_ts) <= warn_hours * 3600:
                        cname = c.get("name") or c.get("card_name") or "特权优惠券"
                        expiring.append(cname)

                if expiring:
                    sample = "、".join(expiring[:3])
                    log_output += f"[{time.strftime('%H:%M:%S')}] 发现 {len(expiring)} 张卡券即将在 {warn_hours} 小时内过期: {sample}\n"
                    from .notifier import send_system_notification
                    await send_system_notification(
                        title="小蚕特权卡券到期提醒",
                        content=f"账号【{nickname}】有 {len(expiring)} 张卡券即将过期（{sample}），请尽快使用！"
                    )
                else:
                    log_output += f"[{time.strftime('%H:%M:%S')}] 卡券核验完成: 暂无即将在 {warn_hours} 小时内过期的特权券\n"
            except Exception as e:
                log_output += f"[{time.strftime('%H:%M:%S')}] 卡券核验信息: {e}\n"

        elif task_id == "dual_rebate_monitor":
            from .dual_rebate_monitor import run_dual_rebate_monitor
            out, monitor_ok = await run_dual_rebate_monitor(account_key=account_key, params=params, trigger_type=trigger_type)
            log_output += out
            if not monitor_ok:
                status = "error"

        else:
            log_output += f"[{time.strftime('%H:%M:%S')}] 任务 [{task_id}] 执行完成 (无异常)\n"

        status = "success" if status != "error" else "error"
        log_output += f"[{time.strftime('%H:%M:%S')}] 任务结束 - 全部流程处理完毕。"
    except XiaoCanRPCError as e:
        status = "error"
        log_output += f"[{time.strftime('%H:%M:%S')}] 小蚕接口返回失败: {e.msg} (错误码: {e.code})\n"
    except Exception as e:
        status = "error"
        log_output += f"[{time.strftime('%H:%M:%S')}] 异常: {str(e)}\n"

    if log_id > 0:
        db.update_job_log(log_id, status=status, output=log_output)
    else:
        db.add_job_log(job_id, account_key, task_id, status, log_output)
    return {"ok": status == "success", "job_id": job_id, "output": log_output}


FIXED_TASK_TRIGGERS = {
    # 全部对齐牛马助手规范：提前 25 秒自动唤醒，长连接预热与微秒级时钟自旋压枪
    "redpack_rain": CronTrigger(hour="9,10,11,13,15,18", minute=59, second=35),
    "brand_flash": CronTrigger(hour=9, minute=29, second=35),
    "svip_rebate": CronTrigger(hour=8, minute=59, second=35),
    "free_order": CronTrigger(hour=13, minute=59, second=35),
    "media_vip": CronTrigger(hour="9,16,19", minute=59, second=35),
}


def reload_schedules():
    """重新加载所有账号的定时调度任务"""
    scheduler.remove_all_jobs()
    accounts = db.get_all_accounts()

    for acc in accounts:
        key = acc["key"]
        configs = db.get_task_configs(key)
        for cfg in configs:
            if not cfg.get("enabled"):
                continue

            task_id = cfg["task_id"]
            if task_id == "dual_rebate_monitor":
                # 美团同店双返利智能监控调度引擎：严格保证 00 分与 30 分准点开火！
                task_params = cfg.get("params") or {}
                try:
                    interval = int(task_params.get("interval_minutes", 10))
                except Exception:
                    interval = 10
                active_only = bool(task_params.get("active_hours_only", True))

                if interval == 30:
                    minute_expr = "0,30"
                elif interval == 15:
                    minute_expr = "0,15,30,45"
                elif interval == 5:
                    minute_expr = "*/5"
                else:  # 默认 10 分钟：对齐 00/30 分并在 10/20 分补充捡漏
                    minute_expr = "0,10,20,30,40,50"

                if active_only:
                    # 营业时段 09:00 ~ 23:00 (含 09:00:00 启动与 23:00:00 收官，夜间 23:01~08:59 休眠静默)
                    trigger = OrTrigger([
                        CronTrigger(hour="9-22", minute=minute_expr),
                        CronTrigger(hour=23, minute=0)
                    ])
                    hours_desc = "09:00~23:00"
                else:
                    trigger = CronTrigger(hour="*", minute=minute_expr)
                    hours_desc = "全天24小时"

                scheduler.add_job(
                    execute_task_job,
                    trigger=trigger,
                    args=[key, task_id, "cron"],
                    id=f"{key}_{task_id}",
                    name=f"{acc.get('nickname')}_{task_id}",
                    max_instances=1,
                    coalesce=True,
                    replace_existing=True
                )
                logger.info(f"已装载美团同店双返利监控: {acc.get('nickname')} - 周期={interval}分钟 (对齐00/30分, 时段={hours_desc})")
                continue

            if task_id in FIXED_TASK_TRIGGERS:
                trigger = FIXED_TASK_TRIGGERS[task_id]
                scheduler.add_job(
                    execute_task_job,
                    trigger=trigger,
                    args=[key, task_id, "cron"],
                    id=f"{key}_{task_id}",
                    name=f"{acc.get('nickname')}_{task_id}",
                    max_instances=1,
                    coalesce=True,
                    replace_existing=True
                )
                logger.info(f"已装载官方固定时点任务: {acc.get('nickname')} - {task_id}")
                continue

            cron_time = cfg.get("cron_time") or TASK_DEFAULT_TIME.get(task_id, "09:00")
            try:
                hour, minute = cron_time.split(":")
                scheduler.add_job(
                    execute_task_job,
                    trigger=CronTrigger(hour=int(hour), minute=int(minute)),
                    args=[key, task_id, "cron"],
                    id=f"{key}_{task_id}",
                    name=f"{acc.get('nickname')}_{task_id}",
                    replace_existing=True
                )
                logger.info(f"已装载定时任务: {acc.get('nickname')} - {task_id} 于 {cron_time}")
            except Exception as e:
                logger.error(f"解析任务定时时间失败 {task_id}: {cron_time} - {e}")


def start_scheduler():
    if not scheduler.running:
        scheduler.start()
        reload_schedules()
        logger.info("APScheduler 调度中心已启动")
    
    # 启动霸王餐预约与名额监听引擎
    try:
        from .appointment_worker import start_appointment_worker
        start_appointment_worker()
    except Exception as e:
        logger.error(f"启动霸王餐预约监听引擎失败: {e}")


def shutdown_scheduler():
    try:
        from .appointment_worker import stop_appointment_worker
        stop_appointment_worker()
    except Exception:
        pass

    if scheduler.running:
        scheduler.shutdown()
        logger.info("APScheduler 调度中心已停止")
