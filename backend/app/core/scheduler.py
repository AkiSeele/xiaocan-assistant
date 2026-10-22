"""
基于 APScheduler 的高精度异步任务调度中心
支持定时任务、整点秒杀高并发并发抢券、即时手动触发与日志记录
"""
import asyncio
import logging
import time
import random
import re
from datetime import datetime, timedelta
import uuid
from typing import Dict, Any, Optional, Tuple
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.combining import OrTrigger

from ..models import database as db
from ..protocol.client import XiaoCanClient, XiaoCanRPCError
from . import time_service
from .notifier import send_system_notification
from .notification import NotificationEvent, NotificationLevel

logger = logging.getLogger("xiaocan.scheduler")

scheduler = AsyncIOScheduler()
client = XiaoCanClient()


# 任务默认触发时间定义
TASK_DEFAULT_TIME = {
    "yb_task": "08:05",         # 领天天赚元宝中心任务 (社群/电商/领券加赠/聚拢元宝)
    "yb_sign": "08:10",         # 天天赚元宝独立签到
    "svip_rebate": "09:00",     # 抢SVIP专属返利券
    "brand_flash": "09:30",     # 抢SVIP大牌券
    "media_vip": "10:00",       # 抢每月影音VIP (10:00/17:00/20:00)
    "free_order": "14:00",      # 抢每月免单券
    "collect_points": "23:59",  # 收取未收元宝 (晚间睡前避免气泡过期)
    "redpack_rain": "10:00",    # 公共整点红包雨 (六场: 10/11/12/14/16/19)
    "flash_sale": "09:00",      # 元宝秒杀 (每日三场: 09:00/14:00/18:00)
    "group_lottery": "07:40",   # 免费开红包与抽奖
    "vip_expand": "08:30",      # 会员成长膨胀礼包
    "expire_remind": "08:00",   # 登录凭据到期巡检
    "coupon_remind": "08:30",   # 卡券到期提醒
    "dual_rebate_monitor": "0 9-23 * * *", # 美团同店双返利智能监控 (默认1小时固定时段巡检)
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

    # 接入阿里云 NTP 授时校准，避免宿主机时钟偏差导致提前/延后抢单
    await time_service.async_sync_ntp(force=True)
    ntp_now = time_service.now_ts()
    ntp_dt = datetime.fromtimestamp(ntp_now)

    target_dt = ntp_dt.replace(hour=target_hour, minute=target_minute, second=0, microsecond=0)
    target_ts = target_dt.timestamp()

    # 若目标时间比当前早超过 5 秒（例如跨过零点），顺延至次日
    if target_ts < ntp_now - 5.0:
        target_dt += timedelta(days=1)
        target_ts = target_dt.timestamp()

    diff = target_ts - ntp_now
    # 如果已经超过目标时刻或差距超过 120 秒（异常唤醒），直接返回
    if diff <= 0 or diff > 120.0:
        return ""

    offset_ms = time_service.get_ntp_offset() * 1000.0
    warmup_log = f"[{time_service.format_now()}] 任务已预热唤醒，阿里云NTP已校准 (时钟偏差: {offset_ms:+.1f}ms, 目标时刻: {target_hour:02d}:{target_minute:02d}:00)\n"

    # 1. 预热网关长连接 (Keep-Alive Pre-warm)，消除首包 DNS 解析与 TLS 1.3 握手耗时
    try:
        await client.get_user_info(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
    except Exception:
        pass

    # 2. 毫秒级自旋等待与压枪发射 (基于 NTP 标准时间)
    early_sec = early_ms / 1000.0
    while True:
        rem = target_ts - time_service.now_ts()
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

    task_names = {
        "yb_task": "领500元宝",
        "yb_sign": "天天赚元宝签到",
        "svip_rebate": "SVIP高额返利券",
        "brand_flash": "SVIP大牌券秒杀",
        "media_vip": "影音会员周卡",
        "free_order": "订单全额免单券",
        "collect_points": "收取未收元宝",
        "redpack_rain": "整点红包雨",
        "flash_sale": "元宝秒杀抢券",
        "daily": "元宝乐园综合打卡",
        "group_lottery": "免费开红包与抽奖",
        "vip_expand": "会员成长膨胀礼包",
        "expire_remind": "登录凭据到期巡检",
        "coupon_remind": "卡券到期提醒",
        "dual_rebate_monitor": "美团同店双返利监控",
        "meituan_coupon": "美团神券每日一键领",
        "store_grab": "霸王餐即时抢单",
        "store_appoint": "倒计时预约抢单",
        "store_monitor": "实时名额监听",
        "store_keyword": "店名定时搜索",
        "store_search": "商户定向嗅探",
        "store_cancel": "霸王餐名额取消",
    }
    task_label = task_names.get(task_id, task_id)
    trig_label = "定时调度" if trigger_type == "cron" else ("手动执行" if trigger_type == "manual" else trigger_type)
    log_output = f"[{time.strftime('%H:%M:%S')}] 开始执行【{task_label}】(账号: {nickname}, 方式: {trig_label})\n"
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
            # 兼容历史 daily 任务标识：依次执行独立原子任务 yb_sign 与 yb_task，彻底消除冗余与重复执行
            log_output += f"[{time.strftime('%H:%M:%S')}] 兼容旧版调用模式: 正在分派原子任务【天天赚元宝签到】与【天天赚元宝任务】...\n"
            try:
                sign_res = await client.do_user_sign(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                msg = sign_res.get("status", {}).get("msg") or sign_res.get("msg") or "打卡成功"
                point = sign_res.get("point") or sign_res.get("data", {}).get("point") or ""
                extra = f" (获得元宝: +{point})" if point else ""
                log_output += f"[{time.strftime('%H:%M:%S')}] 每日签到: {msg}{extra}\n"
            except XiaoCanRPCError as e:
                log_output += f"[{time.strftime('%H:%M:%S')}] 每日签到响应: {e.msg} (代码: {e.code})\n"
            except Exception as e:
                log_output += f"[{time.strftime('%H:%M:%S')}] 每日签到异常: {e}\n"

            # 顺延执行已整合全量事件的 yb_task
            yb_job_res = await execute_task_job(account_key, "yb_task", trigger_type=trigger_type)
            if yb_job_res.get("output"):
                log_output += yb_job_res.get("output", "")

        elif task_id == "vip_expand":
            # 1. 会员打卡与连续签到天数同步 (SilkwormVip.VipRightsService.UserSignInDays)
            try:
                sign_res = await client.get_user_sign_in_days(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                days = sign_res.get("days", 0)
                is_signed = sign_res.get("is_today_signed", False)
                sign_desc = "今日已签到" if is_signed else "待签到"
                log_output += f"[{time.strftime('%H:%M:%S')}] 会员签到打卡: 已连续打卡 {days} 天 ({sign_desc})\n"
            except XiaoCanRPCError as e:
                log_output += f"[{time.strftime('%H:%M:%S')}] 会员签到打卡: {e.msg} (提示码: {e.code})\n"

            # 2. 会员专属每日签到抽奖 (SilkwormVip.VipRightsService.SignInLottery)
            try:
                vip_lottery_res = await client.sign_in_lottery(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                lottery_msg = vip_lottery_res.get("status", {}).get("msg", "打卡成功")
                log_output += f"[{time.strftime('%H:%M:%S')}] VIP专属每日签到抽奖: {lottery_msg}\n"
            except XiaoCanRPCError as le:
                log_output += f"[{time.strftime('%H:%M:%S')}] VIP专属每日签到抽奖: {le.msg} (代码: {le.code})\n"
            except Exception as le:
                log_output += f"[{time.strftime('%H:%M:%S')}] VIP专属每日签到抽奖: {le}\n"

            # 3. 会员签到里程碑节点奖励状态 (SilkwormVip.VipRightsService.SignInNode)
            try:
                node_res = await client.get_sign_in_node(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                nodes = node_res.get("nodes") or []
                log_output += f"[{time.strftime('%H:%M:%S')}] 签到里程碑: 已核验 {len(nodes)} 个阶段权益节点\n"
            except Exception:
                pass

            # 4. 会员升级/每日专属成长礼包激活
            try:
                await client.get_vip_up_gift(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                log_output += f"[{time.strftime('%H:%M:%S')}] 会员成长礼包: 权益已核销更新\n"
            except XiaoCanRPCError as e:
                log_output += f"[{time.strftime('%H:%M:%S')}] 会员成长礼包: {e.msg} (提示码: {e.code})\n"

            # 5. 会员专属权益卡券清单核对
            try:
                gifts_res = await client.list_vip_gifts(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                gift_count = len(gifts_res.get("list") or [])
                log_output += f"[{time.strftime('%H:%M:%S')}] 会员特权档位: 已校验 {gift_count} 项特权卡券配置\n"
            except Exception:
                pass

            # 6. 会员每日成长任务
            try:
                await client.get_vip_task(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                log_output += f"[{time.strftime('%H:%M:%S')}] 会员成长任务: 状态正常\n"
            except Exception:
                pass

        elif task_id == "group_lottery":
            # 1. 查询转盘配置与当前状态
            lucky_times = 0
            day_num = 0
            try:
                info_res = await client.get_lottery_info(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                linfo = info_res.get("lottery_info") or {}
                lucky_times = int(linfo.get("lucky_times", 0))
                day_num = int(linfo.get("day_num", 0))
                log_output += f"[{time.strftime('%H:%M:%S')}] 免费开红包状态: 每日额度/可用次数 {day_num} 次，待抽奖次数: {lucky_times}\n"
            except XiaoCanRPCError as e:
                log_output += f"[{time.strftime('%H:%M:%S')}] 获取开红包状态: {e.msg} (提示码: {e.code})\n"

            # 2. 并发微错峰领取全量免费机会 (毫秒级错峰防频控，极速秒级并发)
            lottery_types = [
                (1, "每日签到(+2次)"),
                (2, "每日分享(+1次)"),
                (4, "沾一沾(+1次)"),
                (8, "饿了么加赠(+1次)"),
                (9, "美团加赠(+1次)"),
                (10, "浏览福利中心(+1次)"),
                (11, "浏览霸王餐页(+1次)")
            ]
            ad_tasks = [
                (2, "视频激励广告(+1次)"),
                (4, "商城优惠浏览(+1次)")
            ]

            async def _claim_lottery_type(t_type: int, t_label: str, delay: float):
                if delay > 0:
                    await asyncio.sleep(delay)
                try:
                    await client.add_lottery_times(lottery_type=t_type, token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                    return f"[{time.strftime('%H:%M:%S')}] 免费机会 [{t_label}]: 领取成功\n"
                except XiaoCanRPCError as e:
                    if e.code in (40002, 40003, 40004, 40037, 40038, 40039, 40040) or "已" in e.msg:
                        return ""
                    return f"[{time.strftime('%H:%M:%S')}] 免费机会 [{t_label}]: {e.msg} (状态码: {e.code})\n"
                except Exception:
                    return ""

            async def _claim_ad_task(b_type: int, b_label: str, delay: float):
                if delay > 0:
                    await asyncio.sleep(delay)
                try:
                    ad_res = await client.claim_ad_lottery_chance(bus_type=b_type, token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                    if ad_res:
                        return f"[{time.strftime('%H:%M:%S')}] 额外机会 [{b_label}]: 领取成功\n"
                except Exception:
                    pass
                return ""

            async def _send_redpack(delay: float):
                if delay > 0:
                    await asyncio.sleep(delay)
                try:
                    await client.lottery_send_redpack(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                except Exception:
                    pass
                return ""

            # 错峰并发执行（每项微间隔 40ms 错峰发射，总并发耗时约 0.4s）
            claim_coros = []
            cur_delay = 0.0
            for t_type, t_label in lottery_types:
                claim_coros.append(_claim_lottery_type(t_type, t_label, cur_delay))
                cur_delay += 0.04
            for b_type, b_label in ad_tasks:
                claim_coros.append(_claim_ad_task(b_type, b_label, cur_delay))
                cur_delay += 0.04
            claim_coros.append(_send_redpack(cur_delay))

            claim_results = await asyncio.gather(*claim_coros)
            for res_text in claim_results:
                if res_text:
                    log_output += res_text

            # 3. 重新同步服务端权威剩余次数
            try:
                sync_res = await client.get_lottery_info(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                s_linfo = sync_res.get("lottery_info") or {}
                lucky_times = int(s_linfo.get("lucky_times", 0))
                day_num = int(s_linfo.get("day_num", 0))
                log_output += f"[{time.strftime('%H:%M:%S')}] 机会汇总: 官方每日额度/剩余次数 {day_num} 次，当前可用抽奖次数: {lucky_times}\n"
            except Exception:
                pass

            # 4. 连续自动开启红包 (极速流转防风控微抖动)
            effective_draw_times = lucky_times if lucky_times > 0 else day_num
            raw_gap = params.get("draw_sec")
            # 兼容历史 3.5s / 0.8s 默认值自动升级为 0.35s 极速模式，若用户明确设定了其他自定义值则尊重用户配置
            if raw_gap is None or raw_gap in (3.5, "3.5", 0.8, "0.8"):
                draw_gap = 0.35
            else:
                draw_gap = max(0.1, float(raw_gap))

            if effective_draw_times > 0:
                opened_count = 0
                for spin_i in range(effective_draw_times):
                    sleep_t = max(0.18, draw_gap + random.uniform(-0.06, 0.10))
                    if spin_i > 0:
                        await asyncio.sleep(sleep_t)
                    try:
                        spin_res = await client.do_lottery_spin(token=token, prize_type=1, silk_id=silk_id, user_id=user_id, city_code=city_code)
                        opened_count += 1
                        prize_desc = "红包奖励已入账"
                        pdata = spin_res.get("prize") or spin_res.get("lottery_prize") or spin_res.get("data") or {}
                        if isinstance(pdata, dict):
                            p_name = pdata.get("name") or pdata.get("prize_name") or pdata.get("title") or ""
                            p_amt = pdata.get("amount") or pdata.get("money") or ""
                            r_group = pdata.get("red_pack_group") or []
                            if r_group and isinstance(r_group, list):
                                total_m = sum(float(x.get("money", 0)) for x in r_group if isinstance(x, dict))
                                if total_m > 0:
                                    p_amt = f"{round(total_m, 2)} 元"
                            if p_name and p_amt:
                                prize_desc = f"{p_name} ({p_amt})"
                            elif p_name:
                                prize_desc = p_name
                            elif p_amt:
                                prize_desc = f"{p_amt} 红包"
                        gap_desc = f" (间隔 {round(sleep_t, 2)}s)" if spin_i > 0 else ""
                        log_output += f"[{time.strftime('%H:%M:%S')}] 第 {opened_count}/{effective_draw_times} 次开红包成功: {prize_desc}{gap_desc}\n"
                    except XiaoCanRPCError as e:
                        log_output += f"[{time.strftime('%H:%M:%S')}] 开启红包中断: {e.msg} (状态码: {e.code})\n"
                        break
                    except Exception as e:
                        log_output += f"[{time.strftime('%H:%M:%S')}] 开启红包异常: {e}\n"
                        break
            else:
                log_output += f"[{time.strftime('%H:%M:%S')}] 当前暂无待开启的红包次数 (今日免费次数均已消耗完毕)\n"

            # 5. 阶梯累计抽奖进度展示与即时自动领取
            try:
                prog_res = await client.get_lottery_progress(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                prog = prog_res.get("lottery_progress") or {}
                lottery_cnt = int(prog.get("lottery_count", 0))
                step1_cnt = int(prog.get("first_step_count", 3))
                step2_cnt = int(prog.get("second_step_count", 9))
                has_got1 = bool(prog.get("has_got_first_step_prize", False))
                has_got2 = bool(prog.get("has_got_second_step_prize", False))

                # 自动领取第一阶段奖励 (3次满额未领)
                if lottery_cnt >= step1_cnt and not has_got1:
                    try:
                        claim_res1 = await client.receive_extra_lottery(step=1, token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                        has_got1 = True
                        p1_name = (claim_res1.get("prize") or {}).get("name") or "饭票奖励"
                        log_output += f"[{time.strftime('%H:%M:%S')}] 阶段一阶梯奖励自动领取成功: {p1_name}\n"
                    except Exception as e:
                        log_output += f"[{time.strftime('%H:%M:%S')}] 阶段一阶梯奖励领取异常: {e}\n"

                # 自动领取第二阶段奖励 (9次满额未领)
                if lottery_cnt >= step2_cnt and not has_got2:
                    try:
                        await asyncio.sleep(0.08)
                        claim_res2 = await client.receive_extra_lottery(step=2, token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                        has_got2 = True
                        p2_name = (claim_res2.get("prize") or {}).get("name") or "现金红包奖励"
                        log_output += f"[{time.strftime('%H:%M:%S')}] 阶段二阶梯奖励自动领取成功: {p2_name}\n"
                    except Exception as e:
                        log_output += f"[{time.strftime('%H:%M:%S')}] 阶段二阶梯奖励领取异常: {e}\n"

                step1_tag = "[已达成/已领取]" if has_got1 else f"[进行中 {lottery_cnt}/{step1_cnt}]"
                step2_tag = "[已达成/已领取]" if has_got2 else f"[进行中 {lottery_cnt}/{step2_cnt}]"
                log_output += f"[{time.strftime('%H:%M:%S')}] 阶梯累计进度: 今日累计完成 {lottery_cnt} 次开红包\n"
                log_output += f"[{time.strftime('%H:%M:%S')}]   - 第一阶段({step1_cnt}次): {step1_tag}\n"
                log_output += f"[{time.strftime('%H:%M:%S')}]   - 第二阶段({step2_cnt}次): {step2_tag}\n"
            except Exception:
                pass

        elif task_id == "redpack_rain":
            # 整点红包雨 (每日 10:00, 11:00, 12:00, 14:00, 16:00, 19:00)
            now_dt = datetime.now()
            next_hour = (now_dt.hour + 1) % 24 if now_dt.minute >= 50 else now_dt.hour
            warmup_msg = await prepare_warmup_and_wait(
                target_hour=next_hour, target_minute=0, token=token,
                silk_id=silk_id, user_id=user_id, city_code=city_code,
                early_ms=0, trigger_type=trigger_type
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
                    now_ts = int(time_service.now_ts())
                    log_output += f"[{time.strftime('%H:%M:%S')}] 探测到红包雨场次 #{event_id}: 营业时间 {begin_str} - {end_str} (状态: {evt_status})\n"

                    # 若距开场不到 90 秒且为定时任务调度，自旋平滑对齐至开场时刻 (基于 NTP 校准时间)
                    if now_ts < begin_ts:
                        wait_start = begin_ts - now_ts
                        if wait_start <= 90 and trigger_type == "cron":
                            log_output += f"[{time.strftime('%H:%M:%S')}] 距离开场尚有 {wait_start} 秒 (NTP对齐)，等待开场时段...\n"
                            await asyncio.sleep(wait_start)
                            now_ts = int(time_service.now_ts())
                        else:
                            log_output += f"[{time.strftime('%H:%M:%S')}] 提示: 场次 #{event_id} 尚未开始 ({begin_str} 开始，当前时间 {time.strftime('%H:%M:%S')})\n"

                    # 1. 接入/报名当前场次 (JoinRedPackRainEvent)
                    # 官方整点红包雨场次跨度 30 分钟。整点时刻 (如 10:00:00) 官方服务端活动状态由 1 (未开始) 切换至 2 (进行中)
                    # 通常存在 0.5~2.5 秒的微弱任务刷新延迟或时钟偏差。如果过早接入，官方接口会返回 failed_code=40028 (活动报名失败)。
                    # 故采用自适应平滑重试 (最多 10 次，覆盖整点后 0~8 秒)，确保在官方服务端放行时第一时间成功接入。
                    join_ok = False
                    max_join_attempts = 10
                    for try_idx in range(1, max_join_attempts + 1):
                        ts_fmt = datetime.now().strftime('%H:%M:%S.%f')[:-3]
                        try:
                            j_res = await client.join_redpack_rain(token=token, event_id=event_id, silk_id=silk_id, user_id=user_id, city_code=city_code)
                            succ = j_res.get("success", False)
                            f_reason = j_res.get("failed_reason") or ""
                            f_code = j_res.get("failed_code", 0)
                            if succ:
                                log_output += f"[{ts_fmt}] [公共红包雨] 第{try_idx}次请求: 成功接入第 {event_id} 场次！\n"
                                join_ok = True
                                break

                            # 已在场内或已参与过该场次
                            if "已参与" in f_reason or "已在场" in f_reason or f_code == 40023:
                                log_output += f"[{ts_fmt}] [公共红包雨] 提示: 账号已处于第 {event_id} 场次中，直接进入额度抓取阶段\n"
                                join_ok = True
                                break

                            # 如果是 40028 或活动报名失败 (代表官方服务端整点状态尚未就绪或仍为 1 未开始)
                            if f_code == 40028 or "报名失败" in f_reason or "未开始" in f_reason:
                                if try_idx < max_join_attempts:
                                    log_output += f"[{ts_fmt}] [公共红包雨] 官方服务端场次待激活放行 (代码: {f_code or 40028})，持续对齐中 (第{try_idx}/{max_join_attempts}次)...\n"
                                    # 每隔 3 次尝试重新刷新一次活动场次状态，同步官方最新场次与状态
                                    if try_idx % 3 == 0:
                                        try:
                                            ref_res = await client.get_redpack_rain_event(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                                            ref_evt = ref_res.get("event") or {}
                                            if ref_evt.get("event_id"):
                                                event_id = ref_evt.get("event_id")
                                                evt_status = ref_evt.get("status", evt_status)
                                        except Exception:
                                            pass
                                    await asyncio.sleep(0.6 + random.uniform(0.1, 0.25))
                                    continue
                                else:
                                    log_output += f"[{ts_fmt}] [公共红包雨] 接入超时: 官方服务端在重试窗口期内未放行开抢 ({f_reason})\n"
                                    break

                            # 其他不可重试的明确原因
                            log_output += f"[{ts_fmt}] [公共红包雨] 第{try_idx}次接入提示: {f_reason or '尚未开抢或已在场内'}\n"
                            break
                        except XiaoCanRPCError as je:
                            log_output += f"[{ts_fmt}] [公共红包雨] 第{try_idx}次接入提示: {je.msg} (代码: {je.code})\n"
                            if je.code == 40023:
                                log_output += f"[{ts_fmt}] [公共红包雨] 提示: 该账号在此场次中已完成抽奖，无需重复参与\n"
                                break
                            if try_idx < max_join_attempts:
                                await asyncio.sleep(0.6)
                            else:
                                break

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
                                    await send_system_notification(
                                        title="整点红包雨中奖提醒",
                                        content=f"账号【{nickname}】在场次 #{event_id} ({begin_str}场) 斩获 {len(items)} 个红包：{p_str}！",
                                        account_key=account_key,
                                        event=NotificationEvent.SPIKE_SUCCESS,
                                        level=NotificationLevel.SUCCESS
                                    )
                                else:
                                    log_output += f"[{ts_fmt}] [公共红包雨] 抓取结算完成 (上报点击 {actual_clicks} 次)，但本场未分配到有效红包 (可能名额已发完或限额)\n"
                                grab_ok = True
                                break
                            except XiaoCanRPCError as ge:
                                log_output += f"[{ts_fmt}] [公共红包雨] 第{try_idx}次开包提示: {ge.msg} (代码: {ge.code})\n"
                                if ge.code == 40023:
                                    break
                                elif ge.code == 200001:
                                    log_output += f"[{ts_fmt}] [公共红包雨] 风险拦截: 触发风控安全校验 (代码: 200001: {ge.msg})\n"
                                    await send_system_notification(
                                        title="红包雨风控安全拦截",
                                        content=f"账号【{nickname}】参与场次 #{event_id} 红包雨触发安全风控，请在微信小程序完成一次人机验证。",
                                        account_key=account_key,
                                        event=NotificationEvent.TOKEN_WARN,
                                        level=NotificationLevel.WARNING
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
            # 抢每日09:30 SVIP额外放量大牌券 (绝不消耗每月保底大牌券配额 - 极速直射模式)
            is_plus = bool(account.get("is_plus", 0))
            vip_level = int(account.get("vip_level", 0) or 0)
            if (is_plus and vip_level < 2) or (not is_plus and vip_level < 5):
                vip_desc = f"SVIP{vip_level}" if is_plus else f"VIP{vip_level}"
                log_output += f"[{time_service.format_now()}] [资格拦截] 当前账号为 {vip_desc} (未达门槛)，「抢SVIP大牌券」官方要求 SVIP2+ 或 VIP5+ 会员开放，自动终止以防触发风控\n"
                status = "success"
                return {"ok": True, "job_id": job_id, "output": log_output}
            log_output += f"[{time_service.format_now()}] 正在预热探测今日 09:30 SVIP 额外大牌放量券实时配置 (微服务 VipRightsService.ExtraBrandCardPool)...\n"
            log_output += f"[{time_service.format_now()}] 配额保护模式: 仅抢每日放量券，严禁触发消耗账号每月保底大牌券额度\n"

            pool_type = 99
            pool_desc = "通用大牌券 (品牌通用)"
            can_burst = True

            try:
                extra_res = await client.get_extra_brand_card_pool(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                b_info = extra_res.get("info") or {}
                # 兼容小蚕官方 APK 原生模型字段 (驼峰与下划线双向支持)
                user_day_num = b_info.get("user_day_num") or b_info.get("userDayNum") or 1
                pools = b_info.get("pools") or []

                if pools:
                    p0 = pools[0]
                    pool_type = p0.get("type", 99)
                    # 官方实体字段: isGrabbed (boolean), hasInventory (boolean)
                    is_pool_grabbed = p0.get("is_grabbed") if p0.get("is_grabbed") is not None else p0.get("isGrabbed", False)
                    is_reach_month_limit = p0.get("is_reach_month_upper_limit") if p0.get("is_reach_month_upper_limit") is not None else p0.get("isReachMonthUpperLimit", False)
                    p_name = p0.get("name") or "通用大牌券"
                    has_inv = p0.get("has_inventory") if p0.get("has_inventory") is not None else p0.get("hasInventory", True)
                    pool_desc = f"{p_name} ({p0.get('desc')})" if p0.get("desc") else p_name

                    if is_pool_grabbed:
                        log_output += f"[{time_service.format_now()}] 权益核验: 今日大牌放量神券已成功领取 (每日限领 {user_day_num} 张)，无需重复抢券\n"
                        can_burst = False
                    elif is_reach_month_limit:
                        log_output += f"[{time_service.format_now()}] 权益核验: 本月大牌放量神券已达上限，无需重复抢券\n"
                        can_burst = False
                    else:
                        inv_desc = "官方显示有余量" if has_inv else "待09:30整点开闸放量"
                        log_output += f"[{time_service.format_now()}] 奖池就绪: 目标券种【{pool_desc}】(类型: {pool_type}, 实时库存: {inv_desc})，直射通道预热就绪\n"
            except XiaoCanRPCError as e:
                log_output += f"[{time_service.format_now()}] 预热奖池探测提示: {e.msg} (代码: {e.code})\n"
            except Exception as e:
                log_output += f"[{time_service.format_now()}] 预热奖池探测异常: {e}\n"

            if can_burst:
                # 针对大牌券设置 early_ms=0 精准整点开火 (避免整点前提前发射导致撞在未开闸状态 40021 或触发网关频控 50008)
                warmup_msg = await prepare_warmup_and_wait(
                    target_hour=9, target_minute=30, token=token,
                    silk_id=silk_id, user_id=user_id, city_code=city_code,
                    early_ms=0, trigger_type=trigger_type
                )
                if warmup_msg:
                    log_output += warmup_msg

                # 计算今日 09:30:00.000 的 NTP 精准时间戳
                cur_ntp = time_service.now_ts()
                cur_dt = datetime.fromtimestamp(cur_ntp)
                flash_target_ts = cur_dt.replace(hour=9, minute=30, second=0, microsecond=0).timestamp()

                # 毫秒级整点零等待直射开火 (Zero-latency Burst)
                for try_idx in range(1, 4):
                    ts_fmt = time_service.format_now_ms()
                    try:
                        grab_res = await client.grab_extra_brand_card(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code, card_type=pool_type)
                        log_output += f"[{ts_fmt}] [抢每日大牌券] 第{try_idx}次请求: 抢券成功！已成功领取【{pool_desc}】\n"
                        await send_system_notification(
                            title="抢SVIP大牌券成功",
                            content=f"账号【{nickname}】在 09:30 场次成功抢到每日大牌券【{pool_desc}】",
                            account_key=account_key,
                            event=NotificationEvent.SPIKE_SUCCESS,
                            level=NotificationLevel.SUCCESS
                        )
                        break
                    except XiaoCanRPCError as e:
                        log_output += f"[{ts_fmt}] [抢每日大牌券] 第{try_idx}次请求提示: {e.msg} (代码: {e.code})\n"

                        now_ts = time_service.now_ts()
                        # 若当前时间尚未到达目标整点，即便返回 40021 也是因为服务端尚未开闸，严禁提前终止退出！
                        if e.code == 40021 and now_ts < flash_target_ts:
                            wait_rem = flash_target_ts - now_ts
                            if wait_rem > 0:
                                await asyncio.sleep(wait_rem + 0.005)
                            continue

                        # 遭遇网关频控 50008 时，退避 200ms 后重试，避开滑动窗口硬碰撞
                        if e.code == 50008:
                            await asyncio.sleep(0.2)
                            continue

                        if e.code in (40003, 40004, 40017, 40021, 40024, 40037, 40038, 40039, 40040):
                            break
                    except Exception as e:
                        log_output += f"[{ts_fmt}] [抢每日大牌券] 第{try_idx}次请求异常: {e}\n"
                    await asyncio.sleep(0.1)

        elif task_id == "yb_task":
            # 领天天赚元宝中心任务 (含官方任务5/57/59打卡、领券加赠、抽奖机会累加与气泡元宝聚拢)
            log_output += f"[{time.strftime('%H:%M:%S')}] 正在检索天天赚元宝中心每日任务状态...\n"
            act_tasks = [
                (5, "加入官方社群", 500),
                (57, "抖音电商浏览30s", 500),
                (59, "天天赚元宝打卡", 1000)
            ]
            for tid, t_title, pts in act_tasks:
                ts_fmt = datetime.now().strftime('%H:%M:%S.%f')[:-3]
                try:
                    await asyncio.sleep(random.uniform(0.1, 0.25))
                    comp_res = await client.complete_activity_task(task_id=tid, token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                    detail = comp_res.get("detail") or {}
                    new_bal = detail.get("balance")
                    bal_tip = f" (最新余额: {new_bal} 元宝)" if new_bal else ""
                    log_output += f"[{ts_fmt}] 任务 [{t_title}] 提交成功！已斩获 {pts} 元宝{bal_tip}\n"
                    try:
                        await client.user_claim_points(task_id=tid, token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                    except Exception:
                        pass
                except XiaoCanRPCError as ce:
                    log_output += f"[{datetime.now().strftime('%H:%M:%S')}] 任务 [{t_title}] 响应: {ce.msg} (代码: {ce.code})\n"
                except Exception as e:
                    log_output += f"[{datetime.now().strftime('%H:%M:%S')}] 任务 [{t_title}] 执行异常: {e}\n"

            # 补充领券与专属社群事件打卡 (饿了么: 3, 美团: 4, 官方社群: 6)
            task_events = [
                (3, "饿了么领券"),
                (4, "美团领券"),
                (6, "小蚕专属社群")
            ]
            for tid, tname in task_events:
                try:
                    await asyncio.sleep(random.uniform(0.08, 0.15))
                    await client.complete_task_event(task_type=tid, token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                    log_output += f"[{time.strftime('%H:%M:%S')}] 任务事件 [{tname}]: 奖励领取成功\n"
                except XiaoCanRPCError as e:
                    log_output += f"[{time.strftime('%H:%M:%S')}] 任务事件 [{tname}] 响应: {e.msg} (代码: {e.code})\n"
                except Exception:
                    pass

            # 补充累加每日营销抽奖机会
            try:
                await client.incr_lottery_number(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                log_output += f"[{time.strftime('%H:%M:%S')}] 抽奖机会: 每日抽奖次数已同步累加\n"
            except Exception:
                pass

            # 汇总收取成熟气泡元宝
            try:
                col_res = await client.collect_points(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                got_pt = col_res.get("point") or col_res.get("points") or 0
                if got_pt > 0:
                    log_output += f"[{time.strftime('%H:%M:%S')}] 元宝一键聚拢: 成功收取成熟气泡 {got_pt} 元宝\n"
            except Exception:
                pass

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
            log_output += f"[{time.strftime('%H:%M:%S')}] 正在执行天天赚元宝每日签到打卡 (官方微服务 ActivityTaskMobileService.SignIn)...\n"
            try:
                sign_res = await client.do_user_sign(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                msg = sign_res.get("status", {}).get("msg") or sign_res.get("msg") or "签到成功"
                point = sign_res.get("point") or sign_res.get("data", {}).get("point") or ""
                extra = f" (获得元宝: +{point})" if point else ""
                log_output += f"[{time.strftime('%H:%M:%S')}] 每日签到: {msg}{extra} (代码: 0)\n"

                # 尝试同步历史连续签到天数与最新元宝资产
                try:
                    hist = await client.get_sign_in_history(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                    days = hist.get("days") or hist.get("data", {}).get("days")
                    if days:
                        log_output += f"[{time.strftime('%H:%M:%S')}] 签到统计: 已连续打卡 {days} 天\n"
                except Exception:
                    pass
            except XiaoCanRPCError as e:
                log_output += f"[{time.strftime('%H:%M:%S')}] 每日签到响应: {e.msg} (代码: {e.code})\n"
            except Exception as e:
                log_output += f"[{time.strftime('%H:%M:%S')}] 每日签到异常: {e}\n"

        elif task_id == "svip_rebate":
            # 抢SVIP专属返利券 (每日 09:00:00 准点秒杀 - 极速直射模式)
            is_plus = bool(account.get("is_plus", 0))
            vip_level = int(account.get("vip_level", 0) or 0)
            if (is_plus and vip_level < 2) or (not is_plus and vip_level < 5):
                vip_desc = f"SVIP{vip_level}" if is_plus else f"VIP{vip_level}"
                log_output += f"[{time_service.format_now()}] [资格拦截] 当前账号为 {vip_desc} (未达门槛)，「抢SVIP专属返利券」官方特权面向 SVIP2+ 或 VIP5+ 会员开放，自动终止以防触发风控\n"
                status = "success"
                return {"ok": True, "job_id": job_id, "output": log_output}
            log_output += f"[{time_service.format_now()}] 正在预热检索今日 09:00 SVIP 专属返利券档位与资格 (官方独立App原生协议 VipRightsService)...\n"
            try:
                rebate_res = await client.get_plus_vip_rebate_card_infos(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                card_infos = rebate_res.get("card_infos") or []
                info_summary = "、".join([f"VIP{c.get('vip_level')}:{c.get('title')}" for c in card_infos[:4]])
                log_output += f"[{time_service.format_now()}] 返利券档位: 已拉取 {len(card_infos)} 档返利券 ({info_summary or '常规档位'})，通道预热就绪\n"
            except Exception as e:
                log_output += f"[{time_service.format_now()}] 返利券档位预热异常: {e}\n"

            warmup_msg = await prepare_warmup_and_wait(
                target_hour=9, target_minute=0, token=token,
                silk_id=silk_id, user_id=user_id, city_code=city_code,
                early_ms=50, trigger_type=trigger_type
            )
            if warmup_msg:
                log_output += warmup_msg

            # 毫秒级整点零等待直射开火 (Zero-latency Burst)
            for try_idx in range(1, 4):
                ts_fmt = time_service.format_now_ms()
                try:
                    claim_res = await client.grab_rebate_card_quota(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                    log_output += f"[{ts_fmt}] [抢SVIP返利券] 第{try_idx}次请求 抢券成功！已领取SVIP专属大额返利券\n"
                    await send_system_notification(
                        title="抢SVIP返利券成功",
                        content=f"账号【{nickname}】成功领取今日 09:00 SVIP 专属大额返利券！",
                        account_key=account_key,
                        event=NotificationEvent.SPIKE_SUCCESS,
                        level=NotificationLevel.SUCCESS
                    )
                    break
                except XiaoCanRPCError as ce:
                    log_output += f"[{ts_fmt}] [抢SVIP返利券] 第{try_idx}次请求提示: {ce.msg} (代码: {ce.code})\n"
                    if ce.code in (40003, 40004, 40017, 40021, 40037, 40038, 40039, 40040):
                        break
                except Exception as e:
                    log_output += f"[{ts_fmt}] [抢SVIP返利券] 第{try_idx}次请求异常: {e}\n"
                await asyncio.sleep(0.1)

        elif task_id == "free_order":
            # 抢每月免单券 (每日 14:00:00 准点开抢 - 极速直射模式)
            is_plus = bool(account.get("is_plus", 0))
            vip_level = int(account.get("vip_level", 0) or 0)
            if (is_plus and vip_level < 5) or (not is_plus and vip_level < 6):
                vip_name = 'SVIP' if is_plus else 'VIP'
                log_output += f"[{time_service.format_now()}] [等级预警] 提示: 每月免单券官方门槛为 SVIP5+ 或 VIP6 (当前身份: {vip_name}{vip_level})，正在核验资格...\n"
            log_output += f"[{time_service.format_now()}] 正在预热检索每月免单券 14:00 专属通道状态与账户资格 (官方独立App原生协议 VipRightsService)...\n"
            can_grab_free = True
            try:
                free_res = await client.get_user_free_order_info(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                f_info = free_res.get("info") or {}
                had = f_info.get("had", False)
                used = f_info.get("used", False)
                if had:
                    used_str = "已使用" if used else "未使用待核销"
                    log_output += f"[{time_service.format_now()}] 账户监测: 本月已持有免单券 (状态: {used_str})，每月限抢1张，无需重复抢券\n"
                    can_grab_free = False
                else:
                    log_output += f"[{time_service.format_now()}] 资格核准: 账户享有 14:00 免单抢券资格，通道预热就绪\n"
            except Exception as e:
                log_output += f"[{time_service.format_now()}] 免单券资格核验异常: {e}\n"

            if can_grab_free:
                warmup_msg = await prepare_warmup_and_wait(
                    target_hour=14, target_minute=0, token=token,
                    silk_id=silk_id, user_id=user_id, city_code=city_code,
                    early_ms=50, trigger_type=trigger_type
                )
                if warmup_msg:
                    log_output += warmup_msg

                # 毫秒级整点零等待直射开火 (Zero-latency Burst)
                for try_idx in range(1, 4):
                    ts_fmt = time_service.format_now_ms()
                    try:
                        lottery_res = await client.grab_free_order_quota(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                        log_output += f"[{ts_fmt}] [抢每月免单券] 第{try_idx}次请求 抢券成功！已抢到每月外卖免单券\n"
                        await send_system_notification(
                            title="抢每月免单券成功",
                            content=f"账号【{nickname}】成功抢到每月外卖全额免单券！",
                            account_key=account_key,
                            event=NotificationEvent.SPIKE_SUCCESS,
                            level=NotificationLevel.SUCCESS
                        )
                        break
                    except XiaoCanRPCError as ce:
                        log_output += f"[{ts_fmt}] [抢每月免单券] 第{try_idx}次请求提示: {ce.msg} (代码: {ce.code})\n"
                        if ce.code in (40003, 40004, 40017, 40021, 40037, 40038, 40039, 40040):
                            break
                    except Exception as e:
                        log_output += f"[{ts_fmt}] [抢每月免单券] 第{try_idx}次请求异常: {e}\n"
                    await asyncio.sleep(0.1)

        elif task_id == "flash_sale":
            # 元宝秒杀抢券 (官方元宝秒杀专区: 09:00 / 14:00 / 18:00 三场 - 精准选品保金直射模式)
            # 官方秒杀专区产品字典 (严格对应官方 App 09:00/14:00/18:00 三场商品与 SVIP/VIP 4折/8折配置)
            FLASH_SALE_CATALOG = {
                "brand_card": {
                    "id": "brand_card", "name": "通用大牌券", "round": "14:00", "round_sec": 50400,
                    "svip_silk": 40000, "vip_silk": 80000, "svip_id": 202, "vip_id": 194, "daily_stock": 50
                },
                "free_order": {
                    "id": "free_order", "name": "霸王餐免单券", "round": "14:00", "round_sec": 50400,
                    "svip_silk": 60000, "vip_silk": 120000, "svip_id": 201, "vip_id": 193, "daily_stock": 10
                },
                "redpack_1": {
                    "id": "redpack_1", "name": "1元小蚕红包", "round": "09:00", "round_sec": 32400,
                    "svip_silk": 4000, "vip_silk": 8000, "svip_id": 200, "vip_id": 190, "daily_stock": 200
                },
                "redpack_2": {
                    "id": "redpack_2", "name": "2元小蚕红包", "round": "09:00", "round_sec": 32400,
                    "svip_silk": 8000, "vip_silk": 16000, "svip_id": 199, "vip_id": 189, "daily_stock": 200
                },
                "redpack_3": {
                    "id": "redpack_3", "name": "3元小蚕红包", "round": "09:00", "round_sec": 32400,
                    "svip_silk": 12000, "vip_silk": 24000, "svip_id": 198, "vip_id": 188, "daily_stock": 80
                },
                "rebate_card": {
                    "id": "rebate_card", "name": "110%返利券", "round": "18:00", "round_sec": 64800,
                    "svip_silk": 8000, "vip_silk": 15000, "svip_id": 204, "vip_id": 197, "daily_stock": 200
                },
                "relive_card": {
                    "id": "relive_card", "name": "超时复活券", "round": "18:00", "round_sec": 64800,
                    "svip_silk": 32000, "vip_silk": 64000, "svip_id": 203, "vip_id": 196, "daily_stock": 50
                }
            }

            # 1. 账号资格与当前可用元宝核验
            is_plus = bool(account.get("is_plus", 0))
            vip_level = int(account.get("vip_level", 5) or 5)
            yb_point = int(account.get("yb_point", 0) or 0)
            vip_tag = "SVIP" if is_plus else f"VIP{vip_level}"

            # 解析用户选定的目标商品
            raw_target_products = params.get("target_products")
            if isinstance(raw_target_products, str):
                target_keys = [x.strip() for x in raw_target_products.split(",") if x.strip()]
            elif isinstance(raw_target_products, list):
                target_keys = [str(x).strip() for x in raw_target_products if str(x).strip()]
            else:
                target_keys = []

            custom_goods_ids = [int(x.strip()) for x in str(params.get("goods_ids", "")).split(",") if x.strip().isdigit()]

            # 核心安全守则：未选择任何目标商品时，绝对不扣减元宝，静默终止
            if not target_keys and not custom_goods_ids:
                log_output += f"[{time_service.format_now()}] [待命静默] 任务尚未勾选任何目标抢兑产品，已安全终止以保护账户元宝余额 (当前账户元宝: {yb_point:,})。请在任务配置中勾选需要抢兑的产品（如通用大牌券、1元红包等）。\n"
                status = "success"
                return {"ok": True, "job_id": job_id, "output": log_output}

            selected_product_items = [FLASH_SALE_CATALOG[k] for k in target_keys if k in FLASH_SALE_CATALOG]
            selected_names = [f"【{p['name']}】({p['round']}场, {'SVIP' if is_plus else 'VIP'}:{p['svip_silk' if is_plus else 'vip_silk']:,}元宝)" for p in selected_product_items]
            log_output += f"[{time_service.format_now()}] 步骤 1/4: 账号核准与选品确认 - 身份: {vip_tag}, 当前可用元宝: {yb_point:,}, 用户已选目标: {', '.join(selected_names) or custom_goods_ids}\n"

            # 2. 场次判定与预热过滤
            now_dt = time_service.now_dt()
            if trigger_type == "cron":
                if now_dt.hour == 8 or now_dt.hour < 9:
                    target_h, target_m = 9, 0
                elif now_dt.hour == 13 or now_dt.hour < 14:
                    target_h, target_m = 14, 0
                elif now_dt.hour == 17 or now_dt.hour < 18:
                    target_h, target_m = 18, 0
                else:
                    target_h, target_m = 14, 0
                target_round_str = f"{target_h:02d}:00"

                # 检查当前场次是否有用户勾选的商品
                current_round_products = [p for p in selected_product_items if p["round"] == target_round_str]
                if not current_round_products and not custom_goods_ids:
                    log_output += f"[{time_service.format_now()}] [场次静默] 当前为 {target_round_str} 场次，未配置本场秒杀商品，自动跳过以保护元宝余额\n"
                    status = "success"
                    return {"ok": True, "job_id": job_id, "output": log_output}

                # 准点秒杀提前预热唤醒与 NTP 授时校准自旋
                warmup_msg = await prepare_warmup_and_wait(
                    target_hour=target_h,
                    target_minute=target_m,
                    token=token,
                    silk_id=silk_id,
                    user_id=user_id,
                    city_code=city_code,
                    early_ms=50,
                    trigger_type=trigger_type
                )
                if warmup_msg:
                    log_output += warmup_msg
            else:
                # 手动即时触发模式
                target_h = 9 if now_dt.hour < 12 else (14 if now_dt.hour < 17 else 18)
                target_round_str = f"{target_h:02d}:00"
                # 手动模式下：优先选取用户勾选的当前/最近场次商品，若无则取用户勾选的第一个商品
                current_round_products = [p for p in selected_product_items if p["round"] == target_round_str]
                if not current_round_products:
                    current_round_products = selected_product_items

            # 3. 实时拉取官方秒杀专区商品池，校验真实库存与限购
            try:
                fs_res = await client.list_flash_sale_exchanges(
                    token=token,
                    silk_id=silk_id,
                    user_id=user_id,
                    city_code=city_code,
                    new_level=vip_level,
                    is_plus=is_plus
                )
            except XiaoCanRPCError as e:
                log_output += f"[{time_service.format_now()}] 官方秒杀接口响应异常: {e.msg} (代码: {e.code})\n"
                status = "failed"
                return {"ok": False, "job_id": job_id, "output": log_output}
            except Exception as e:
                log_output += f"[{time_service.format_now()}] 查询秒杀列表网络异常: {e}\n"
                status = "failed"
                return {"ok": False, "job_id": job_id, "output": log_output}

            raw_list = fs_res.get("list") or {}
            online_items = (raw_list.get("svip") if is_plus else raw_list.get("vip")) or []
            online_map = {it.get("exchange_id"): it for it in online_items if it.get("exchange_id")}

            log_output += f"[{time_service.format_now()}] 步骤 2/4: 官方档期与库存核准 (在线在架商品 {len(online_items)} 款)...\n"

            # 4. 构建当前场次待抢兑的实际商品队列
            targets_to_exchange = []
            for p_info in current_round_products:
                eid = p_info["svip_id"] if is_plus else p_info["vip_id"]
                req_silk = p_info["svip_silk"] if is_plus else p_info["vip_silk"]
                p_name = p_info["name"]

                # 严格等级与专区隔离: SVIP 只能抢 SVIP，VIP 只能抢 VIP
                if is_plus and eid != p_info.get("svip_id"):
                    log_output += f"[{time_service.format_now()}] [专区隔离] 当前为 SVIP 会员，自动过滤普通 VIP 专区商品【{p_name}】\n"
                    continue
                if not is_plus and eid != p_info.get("vip_id"):
                    log_output += f"[{time_service.format_now()}] [专区隔离] 当前为 VIP{vip_level}，自动过滤 SVIP 专区商品【{p_name}】\n"
                    continue

                # 检查在架实时数据
                live_item = online_map.get(eid)
                if live_item:
                    req_silk = live_item.get("community_silk", req_silk)
                    user_reach = live_item.get("quota_limit_reach", False)
                    stock_reach = live_item.get("daily_stock_reach", False)
                    left_stock = live_item.get("left", 0)

                    if user_reach:
                        log_output += f"[{time_service.format_now()}] [限额已达] 账号今日/本周已兑换过【{p_name}】(限购1次)，跳过抢兑\n"
                        continue
                    if stock_reach or (trigger_type == "manual" and left_stock <= 0):
                        log_output += f"[{time_service.format_now()}] [库存告罄] 【{p_name}】全网库存已售罄 (剩余: {left_stock} 份)，跳过\n"
                        continue

                # 元宝余额与预算核准
                if req_silk > yb_point:
                    log_output += f"[{time_service.format_now()}] [元宝不足] 账户可用元宝 ({yb_point:,}) 低于【{p_name}】所需元宝 ({req_silk:,})，取消抢兑以保护账户\n"
                    continue


                targets_to_exchange.append({
                    "exchange_id": eid,
                    "name": p_name,
                    "silk": req_silk,
                    "round": p_info["round"]
                })

            # 若有自定义 goods_ids，也一并加入
            for custom_id in custom_goods_ids:
                if custom_id not in online_map:
                    log_output += f"[{time_service.format_now()}] [等级拦截] 自定义商品 ID#{custom_id} 不在当前账号 ({vip_tag}) 的可兑换池中 (SVIP只能抢SVIP，VIP只能抢VIP)，已跳过\n"
                    continue
                live_item = online_map.get(custom_id) or {}
                c_name = re.sub(r'[𐀀-􏿿]|[☀-➿]', '', live_item.get("goods_name") or f"商品#{custom_id}").strip()
                c_silk = live_item.get("community_silk", 0)
                if c_silk > yb_point:
                    log_output += f"[{time_service.format_now()}] [元宝不足] 账户可用元宝不足以兑换自定义商品【{c_name}】\n"
                    continue
                targets_to_exchange.append({
                    "exchange_id": custom_id,
                    "name": c_name,
                    "silk": c_silk,
                    "round": target_round_str
                })

            if not targets_to_exchange:
                log_output += f"[{time_service.format_now()}] 步骤 3/4: 核验完成 - 本场次无可执行抢兑的目标商品 (商品未到时间、库存已光或元宝不足)\n"
                status = "success"
                return {"ok": True, "job_id": job_id, "output": log_output}

            # 5. 执行极速直射秒杀 (按用户选定商品依次尝试，成功斩获1件即止，防重复扣元宝)
            log_output += f"[{time_service.format_now()}] 步骤 3/4: 锁定开火目标清单: {', '.join([f'【{t["name"]}】({t["silk"]:,}元宝)' for t in targets_to_exchange])}\n"

            grab_success = False
            for target in targets_to_exchange:
                target_eid = target["exchange_id"]
                target_name = target["name"]
                target_silk = target["silk"]

                log_output += f"[{time_service.format_now_ms()}] 步骤 4/4: 发起官方直射秒杀 -> 【{target_name}】(exchange_id: {target_eid}, 消耗: {target_silk:,}元宝)...\n"

                for try_idx in range(1, 4):
                    ts_fmt = time_service.format_now_ms()
                    try:
                        ex_res = await client.exchange_goods_v2(
                            exchange_id=target_eid,
                            token=token,
                            silk_id=silk_id,
                            user_id=user_id,
                            city_code=city_code
                        )
                        # 一旦 RPC 成功返回，代表官方已确认斩获！立即标记成功并终止重试
                        grab_success = True
                        status = "success"
                        log_output += f"[{ts_fmt}] [元宝秒杀抢券] 第{try_idx}次调用 秒杀成功！已成功斩获【{target_name}】！\n"

                        # 更新本地账户元宝余额 (容错保护，严禁本地 DB 报错中断成功闭环)
                        try:
                            remaining_silk = max(0, yb_point - target_silk)
                            db.update_account_profile(account_key, {"yb_point": remaining_silk})
                            log_output += f"[{time_service.format_now()}] 资产变更: 成功扣减 {target_silk:,} 元宝，当前账户最新可用元宝: {remaining_silk:,}\n"
                        except Exception as dbe:
                            log_output += f"[{time_service.format_now()}] 资产变更同步提示: {dbe}\n"

                        # 发送系统通知 (容错保护)
                        try:
                            await send_system_notification(
                                title="元宝秒杀抢券成功",
                                content=f"账号【{nickname}】在 {target['round']} 场次成功抢到【{target_name}】(消耗: {target_silk:,}元宝)！",
                                account_key=account_key,
                                event=NotificationEvent.SPIKE_SUCCESS,
                                level=NotificationLevel.SUCCESS
                            )
                        except Exception as ne:
                            log_output += f"[{time_service.format_now()}] 发送抢券通知提示: {ne}\n"

                        break
                    except XiaoCanRPCError as ce:
                        log_output += f"[{ts_fmt}] [元宝秒杀抢券] 第{try_idx}次调用提示: {ce.msg} (代码: {ce.code})\n"
                        # 代码 7: 本周已达上限; 代码 29: 秒杀已结束; 400xx 等非重试错误均立即终止
                        if ce.code in (7, 29, 40003, 40004, 40017, 40021, 40037, 40038, 40039, 40040):
                            break
                        elif ce.code == 28:
                            # 秒杀未开始
                            if trigger_type == "cron":
                                await asyncio.sleep(0.05)
                                continue
                            else:
                                break
                    except Exception as e:
                        log_output += f"[{ts_fmt}] [元宝秒杀抢券] 第{try_idx}次调用异常: {e}\n"
                    await asyncio.sleep(0.08)

                if grab_success:
                    # 单场抢到一件即功成身退，保护元宝资产不超花
                    break

            if not grab_success:
                log_output += f"[{time_service.format_now()}] 元宝秒杀流水结束: 本轮抢券未命中或场次已结束\n"

        elif task_id == "media_vip":
            # 抢每月影音VIP (每日 10:00 / 17:00 / 20:00 三场 - 极速直射模式)
            now_dt = time_service.now_dt()
            target_h = 10 if now_dt.hour < 10 or (now_dt.hour == 9 and now_dt.minute >= 50) else (17 if now_dt.hour < 17 or (now_dt.hour == 16 and now_dt.minute >= 50) else 20)
            log_output += f"[{time_service.format_now()}] 正在预热检索 {target_h}:00 影音会员周卡专属通道与资格 (官方独立App原生协议 VipRightsService)...\n"

            can_grab_media = True
            try:
                v_res = await client.get_user_tencent_vip_info(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                v_info = v_res.get("info") or {}
                has_quota = v_info.get("has_quota", False)
                avail = v_info.get("available_count", 0)
                has_inv = v_info.get("has_inventory", False)
                next_ts = v_info.get("next_time", 0)
                next_str = time.strftime('%H:%M', time.localtime(next_ts)) if next_ts else f"{target_h}:00"

                # 查询用户历史领取记录，精准判定当月是否已经领满或有可用余量
                month_claimed_count = 0
                latest_claim_desc = "无历史记录"
                try:
                    v_list_res = await client.get_user_tencent_vip_list(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code, page=1, page_size=10)
                    items = v_list_res.get("items") or []
                    if items:
                        latest_item = items[0]
                        latest_ts = latest_item.get("timestamp") or 0
                        latest_claim_desc = time.strftime('%Y-%m-%d %H:%M', time.localtime(latest_ts)) if latest_ts else "无"
                        month_start_ts = int(datetime(now_dt.year, now_dt.month, 1, 0, 0, 0).timestamp())
                        month_claimed_count = sum(1 for it in items if (it.get("timestamp") or 0) >= month_start_ts)
                except Exception as ex:
                    logger.debug(f"Query UserTencentVipList error: {ex}")

                # 资格与余量校验：has_quota 为 True 代表具备抢券资格，available_count 代表本月剩余可用次数
                if not has_quota:
                    log_output += f"[{time_service.format_now()}] 账户核验: 当前账号暂无影音VIP特权领取资格 (未达到SVIP级别要求)\n"
                    can_grab_media = False
                elif avail <= 0:
                    log_output += f"[{time_service.format_now()}] 账户核验: 本月影音VIP周卡名额已用完 (本月已领 {month_claimed_count} 次，最近一次: {latest_claim_desc})，无需重复抢券\n"
                    can_grab_media = False
                else:
                    log_output += f"[{time_service.format_now()}] 资格核准: 账号享有影音VIP特权 (本月已领 {month_claimed_count} 次，最近一次: {latest_claim_desc}，本月尚余 {avail} 次可用名额)\n"
                    log_output += f"[{time_service.format_now()}] 场次就绪: 当前目标场次 {next_str} | 实时库存: {'有余量' if has_inv else '待放量/已发完'}，通道预热就绪\n"
            except Exception as e:
                log_output += f"[{time_service.format_now()}] 预热影音VIP资格异常: {e}\n"

            if can_grab_media:
                warmup_msg = await prepare_warmup_and_wait(
                    target_hour=target_h, target_minute=0, token=token,
                    silk_id=silk_id, user_id=user_id, city_code=city_code,
                    early_ms=50, trigger_type=trigger_type
                )
                if warmup_msg:
                    log_output += warmup_msg

                # 毫秒级整点零等待直射开火 (Zero-latency Burst)
                for try_idx in range(1, 4):
                    ts_fmt = time_service.format_now_ms()
                    try:
                        lottery_res = await client.grab_tencent_vip_quota(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)
                        benefit_name = "影音VIP周卡"
                        cdk_code = ""
                        try:
                            fresh_list = await client.get_user_tencent_vip_list(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code, page=1, page_size=1)
                            fresh_items = fresh_list.get("items") or []
                            if fresh_items:
                                f_item = fresh_items[0]
                                p_name = f_item.get("platform") or ""
                                cdk_code = f_item.get("cdk") or ""
                                if p_name:
                                    benefit_name = f"{p_name} VIP周卡"
                        except Exception:
                            pass

                        cdk_suffix = f" (券码CDK: {cdk_code})" if cdk_code else ""
                        log_output += f"[{ts_fmt}] [影音会员周卡] 第{try_idx}次请求: 抢券成功！斩获【{benefit_name}】{cdk_suffix}\n"
                        await send_system_notification(
                            title="抢影音会员周卡成功",
                            content=f"账号【{nickname}】在 {target_h}:00 场次成功抢到【{benefit_name}】！{cdk_suffix}",
                            account_key=account_key,
                            event=NotificationEvent.SPIKE_SUCCESS,
                            level=NotificationLevel.SUCCESS
                        )
                        break
                    except XiaoCanRPCError as ce:
                        log_output += f"[{ts_fmt}] [影音会员周卡] 第{try_idx}次请求提示: {ce.msg} (代码: {ce.code})\n"
                        if ce.code in (40003, 40004, 40017, 40021, 40037, 40038, 40039, 40040):
                            break
                    except Exception as e:
                        log_output += f"[{ts_fmt}] [影音会员周卡] 第{try_idx}次请求异常: {e}\n"
                    await asyncio.sleep(0.1)

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
                    await send_system_notification(
                        title="小蚕账号凭据已过期",
                        content=f"账号【{nickname}】登录凭据已过期（失效时间: {exp_str}），请重新在微信小程序直连提取更新！",
                        account_key=account_key,
                        event=NotificationEvent.TOKEN_WARN,
                        level=NotificationLevel.ERROR
                    )
                elif days_left <= warn_days:
                    log_output += f"[{time.strftime('%H:%M:%S')}] 凭据即将到期预警: 剩余 {days_left:.1f} 天（到期时间: {exp_str}，阈值: {warn_days}天）\n"
                    await send_system_notification(
                        title="小蚕凭据即将到期预警",
                        content=f"账号【{nickname}】凭据将在 {days_left:.1f} 天后失效（到期时间: {exp_str}），请提前更新避免掉线！",
                        account_key=account_key,
                        event=NotificationEvent.TOKEN_WARN,
                        level=NotificationLevel.WARNING
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
                    await send_system_notification(
                        title="小蚕特权卡券到期提醒",
                        content=f"账号【{nickname}】有 {len(expiring)} 张卡券即将过期（{sample}），请尽快使用！",
                        account_key=account_key,
                        event=NotificationEvent.COUPON_EXPIRE,
                        level=NotificationLevel.WARNING
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

        elif task_id == "meituan_coupon":
            from ..meituan.worker import claim_single_account
            mt_acc = db.get_meituan_account(account_key)
            acc_record = db.get_account_by_key(account_key)
            has_mt = bool(mt_acc or (acc_record and acc_record.get("meituan_token")))
            if has_mt:
                # 显式传入 record_log=False，避免调度器与底层执行器双重插入日志导致记录重复
                claim_res = await asyncio.to_thread(claim_single_account, account_key, False)
                detail_out = claim_res.get("detailed_log") or claim_res.get("formatted_text", "")
                log_output += detail_out + "\n"
                if claim_res.get("success") and claim_res.get("coupon_count", 0) > 0:
                    await send_system_notification(
                        title="美团外卖券自动领取成功",
                        content=f"账号【{nickname}】成功领取 {claim_res.get('coupon_count')} 张美团外卖优惠券！",
                        account_key=account_key,
                        event=NotificationEvent.MEITUAN_COUPON,
                        level=NotificationLevel.SUCCESS
                    )
                if not claim_res.get("success") and claim_res.get("code") != 1014:
                    status = "error"
            else:
                # 严密的多账号隔离：若当前账号未关联美团凭证，直接输出提示并安全跳过，严禁越权轮询其他账号
                log_output += f"[{time.strftime('%H:%M:%S')}] 当前账号【{nickname}】尚未绑定美团官方凭据，已安全跳过本次打卡。\n"
                log_output += f"[{time.strftime('%H:%M:%S')}] [指引] 如需开启美团神券每日自动领取，请前往【账号管理】页面为该账号绑定美团。\n"

        else:
            log_output += f"[{time.strftime('%H:%M:%S')}] 【{task_label}】执行完成 (无异常)\n"

        status = "success" if status != "error" else "error"
        log_output += f"[{time.strftime('%H:%M:%S')}] 【{task_label}】处理完毕。"
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


def create_fixed_trigger(task_id: str) -> Optional[CronTrigger]:
    """为每个账号实例独立创建 CronTrigger 对象，避免多账号并发共享单例 Trigger 导致的调度踩踏"""
    # 全部对齐规范：提前 25 秒自动唤醒，长连接预热与微秒级时钟自旋压枪
    if task_id == "redpack_rain":
        return CronTrigger(hour="9,10,11,13,15,18", minute=59, second=35)
    elif task_id == "brand_flash":
        return CronTrigger(hour=9, minute=29, second=35)
    elif task_id == "svip_rebate":
        return CronTrigger(hour=8, minute=59, second=35)
    elif task_id == "free_order":
        return CronTrigger(hour=13, minute=59, second=35)
    elif task_id == "media_vip":
        return CronTrigger(hour="9,16,19", minute=59, second=35)
    elif task_id == "flash_sale":
        # 官方元宝秒杀每日固定三场 (09:00, 14:00, 18:00)，提前 25 秒自动唤醒与 NTP 校准自旋
        return CronTrigger(hour="8,13,17", minute=59, second=35)
    return None


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
                # 美团同店双返利智能监控调度引擎：按固定时段巡检 (默认 1 小时，可选 30 分钟、2 小时)
                task_params = cfg.get("params") or {}
                try:
                    interval = int(task_params.get("interval_minutes", 60))
                except Exception:
                    interval = 60

                # 防风控安全兜底：必须是 30, 60, 120 之一，其余旧值一律重置为 60 分钟 (1小时)
                if interval not in (30, 60, 120):
                    interval = 60

                active_only = bool(task_params.get("active_hours_only", True))

                if interval == 30:
                    minute_expr = "0,30"
                    if active_only:
                        trigger = OrTrigger([
                            CronTrigger(hour="9-22", minute=minute_expr),
                            CronTrigger(hour=23, minute=0)
                        ])
                        hours_desc = "09:00~23:00 每30分钟"
                    else:
                        trigger = CronTrigger(hour="*", minute=minute_expr)
                        hours_desc = "全天24小时 每30分钟"
                elif interval == 120:
                    minute_expr = 0
                    if active_only:
                        # 营业时段 09:00 ~ 23:00 之间每 2 小时整点执行 (09:00, 11:00, 13:00, 15:00, 17:00, 19:00, 21:00, 23:00)
                        trigger = CronTrigger(hour="9-23/2", minute=minute_expr)
                        hours_desc = "09:00~23:00 每2小时整点"
                    else:
                        trigger = CronTrigger(hour="*/2", minute=minute_expr)
                        hours_desc = "全天24小时 每2小时整点"
                else:  # interval == 60 (默认 1 小时)
                    minute_expr = 0
                    if active_only:
                        # 营业时段 09:00 ~ 23:00 之间每小时整点执行 (09:00, 10:00, 11:00, ..., 23:00)
                        trigger = CronTrigger(hour="9-23", minute=minute_expr)
                        hours_desc = "09:00~23:00 每小时整点"
                    else:
                        trigger = CronTrigger(hour="*", minute=minute_expr)
                        hours_desc = "全天24小时 每小时整点"

                scheduler.add_job(
                    execute_task_job,
                    trigger=trigger,
                    args=[key, task_id, "cron"],
                    id=f"{key}_{task_id}",
                    name=f"{acc.get('nickname')}_{task_id}",
                    max_instances=1,
                    coalesce=True,
                    misfire_grace_time=60,
                    replace_existing=True
                )
                logger.info(f"已装载美团同店双返利监控: {acc.get('nickname')} - 固定时段={interval}分钟 (时段={hours_desc})")
                continue

            fixed_trig = create_fixed_trigger(task_id)
            if fixed_trig:
                scheduler.add_job(
                    execute_task_job,
                    trigger=fixed_trig,
                    args=[key, task_id, "cron"],
                    id=f"{key}_{task_id}",
                    name=f"{acc.get('nickname')}_{task_id}",
                    max_instances=1,
                    coalesce=True,
                    misfire_grace_time=60,
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
                    misfire_grace_time=60,
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
