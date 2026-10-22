"""
小蚕助手 - 美团优惠券领取工作流 (Meituan Worker)
支持单账号 401 自动激活自愈、历史池兜底、24小时滚动窗口冷却快速跳过与全账号安全轮询。
详尽执行流水日志追踪，严禁使用 Emoji。
"""

import json
import logging
import random
import time
import uuid
from typing import Any, Dict, List, Optional

from ..models import database as db
from ..models.database import (
    get_all_meituan_accounts,
    get_meituan_account,
    save_meituan_account,
    update_meituan_claim_stats,
)
from .runner import (
    activate_account,
    clear_current_token,
    execute_issue,
    read_current_token,
    runner_lock,
)

logger = logging.getLogger("meituan.worker")

COOLDOWN_SEC = 24 * 3600  # 服务端 24 小时滚动窗口
MAX_401_RETRY = 3
RETRY_INTERVALS = [1.5, 3.0]

# 全局美团发券 RPC 调用时间戳，用于多账号并发时的平滑错峰防抖
_last_rpc_timestamp: float = 0.0


def format_single_coupon_item(idx: int, cp: Dict[str, Any]) -> str:
    """格式化单张优惠券明细为纯文本清单行（无Emoji）"""
    c_name = cp.get("name") or cp.get("couponName") or "美团优惠券"
    c_tab = cp.get("tabName") or "专享神券"
    discount = cp.get("discount_info") or cp.get("discountDesc") or ""
    if not discount:
        val = cp.get("couponValueYuan") or (f"{cp.get('couponValue', 0) / 100:.1f}" if cp.get("couponValue") else "")
        limit = cp.get("priceLimitYuan") or (f"{cp.get('priceLimit', 0) / 100:.1f}" if cp.get("priceLimit") else "")
        if limit and float(limit) > 0:
            discount = f"满{limit}元减{val}元"
        elif val:
            discount = f"立减{val}元"
        else:
            discount = "立享专享优惠"
    period = cp.get("valid_period") or cp.get("validPeriod") or "在有效期内"
    return f"  - [{idx:02d}] [{c_tab}] {c_name} | {discount} | 有效期: {period}"


def format_claim_result(account_key: str, nickname: str, res: Dict[str, Any], cooldown_left: int = 0) -> str:
    """按规范格式化美团领券结果摘要文本（无Emoji）"""
    code = res.get("code")
    header = f"[{nickname or account_key}]"

    if res.get("success"):
        count = res.get("coupon_count", 0)
        count_str = res.get("count_str", "")
        dist_info = f"（{count_str}）" if count_str else ""
        return f"{header} 领券成功！共斩获 {count} 张美团优惠券{dist_info}。"

    if code == 1014:
        tip = ""
        if cooldown_left > 0:
            h = cooldown_left // 3600
            m = (cooldown_left % 3600) // 60
            tip = f"（服务端实行24小时滚动窗口限领，距下次可领还剩 {h}小时{m}分）"
        return f"{header} 今日已达领取上限，无需重复领取。{tip}"

    if code == 401:
        return f"{header} 凭证已过期失效，请在账号管理中重新扫码授权。"

    if code in (509, 50200):
        return f"{header} 美团平台请求频繁，建议稍后重试。"

    return f"{header} 领券未成功：{res.get('message') or res.get('error') or '接口返回异常'}"


def claim_single_account(account_key: str, record_log: bool = True) -> Dict[str, Any]:
    """
    为单个美团账号执行领券操作：
    包含：排他锁保护 -> 主 Token 401 自愈重试 -> 历史池兜底 -> 凭证回存续期 -> 写入高精度结构化运行日志。
    """
    with runner_lock:
        global _last_rpc_timestamp
        # 多账号并发执行错峰防刷保护：若距离上一次美团发券 RPC 调用间隔过短，自动注入平滑抖动
        cur_ts = time.time()
        time_diff = cur_ts - _last_rpc_timestamp
        if _last_rpc_timestamp > 0 and time_diff < 2.0:
            jitter = random.uniform(1.2, 2.5) - time_diff
            if jitter > 0:
                logger.info(f"[美团并发错峰防抖] 账号 {account_key} 注入 {jitter:.2f}s 随机平滑延迟...")
                time.sleep(jitter)

        account = get_meituan_account(account_key) or db.get_account_by_key(account_key)
        main_acc = db.get_account_by_key(account_key)
        if not account:
            return {
                "ok": False,
                "success": False,
                "code": 404,
                "account_key": account_key,
                "nickname": account_key,
                "coupon_count": 0,
                "message": "美团账号未找到"
            }

        token = account.get("meituan_token") or account.get("token")
        saved_at = account.get("meituan_saved_at") or account.get("saved_at")
        nickname = account.get("meituan_nickname") or account.get("nickname") or account_key
        main_nickname = main_acc.get("nickname") if main_acc else account_key
        pool = account.get("meituan_history_pool") or account.get("history_pool") or []

        if not token:
            return {
                "ok": False,
                "success": False,
                "code": 404,
                "account_key": account_key,
                "nickname": nickname,
                "coupon_count": 0,
                "message": "该账号尚未绑定美团凭证，请先在卡片上点击绑定美团"
            }

        tok_mask = f"{token[:8]}****{token[-4:]}" if len(token) > 12 else "****"
        pool_count = len(pool)
        now_ts = int(time.time())
        now_str = time.strftime("%H:%M:%S")

        # 创建全局追踪日志
        job_id = f"job_mt_{now_ts}_{uuid.uuid4().hex[:6]}"
        log_lines = [
            f"[{now_str}] ========================================================",
            f"[{now_str}] 【美团官方福利社领券】任务流水启动",
            f"[{now_str}] 宿主账号: 【{main_nickname}】 (账号ID: {account_key})",
            f"[{now_str}] 美团凭证: 【{nickname}】 (Token: {tok_mask}, 备用候选池: {pool_count} 个)",
            f"[{now_str}] 请求接口: https://media.meituan.com/fulishemini/couponActivity/sendCouponWork",
            f"[{now_str}] ========================================================"
        ]
        log_id = 0
        if record_log:
            try:
                log_id = db.add_job_log(job_id, account_key, "meituan_coupon", "running", "\n".join(log_lines))
            except Exception:
                pass

        last_res = {"ok": False, "success": False, "code": 9999, "message": "未执行"}
        status = "running"

        # 1. 尝试主 Token，遇到 401 重新写回文件自愈重试
        for attempt in range(MAX_401_RETRY):
            log_lines.append(f"[{time.strftime('%H:%M:%S')}] [步骤 1/3] 挂载通行证凭据并注入 CLIGuard 签名环境 (第 {attempt + 1}/{MAX_401_RETRY} 次尝试)...")
            activate_account(token, saved_at)
            log_lines.append(f"[{time.strftime('%H:%M:%S')}] [步骤 2/3] 发送福利社发券 RPC 协议请求...")
            res = execute_issue(timeout=35)
            _last_rpc_timestamp = time.time()
            code = res.get("code")

            if code != 401:
                # 成功或 1014 等非 401 状态
                is_success = bool(res.get("success"))
                count = res.get("coupon_count", 0) if is_success else 0
                all_coupons = res.get("coupons") or res.get("display_coupons") or []
                display_coupons = res.get("display_coupons") or all_coupons[:8]

                # 检查服务端是否下发了更新的 Token 并回存
                cur_entry = read_current_token()
                new_token = cur_entry.get("token") if cur_entry else None

                if is_success:
                    update_meituan_claim_stats(account_key, count, all_coupons, new_token=new_token)
                    act_name = res.get("activity_name") or "美团福利社天天神券"
                    count_str = res.get("count_str") or ""
                    log_lines.append(f"[{time.strftime('%H:%M:%S')}] [步骤 3/3] 收到美团接口响应: 领券成功 (状态码: 200)")
                    log_lines.append(f"[{time.strftime('%H:%M:%S')}] 官方活动名称: 【{act_name}】")
                    log_lines.append(f"[{time.strftime('%H:%M:%S')}] 斩获卡券统计: 共成功领取 {count} 张美团优惠券")
                    if count_str:
                        log_lines.append(f"[{time.strftime('%H:%M:%S')}] 分类分布概况: {count_str}")
                    if all_coupons:
                        log_lines.append(f"[{time.strftime('%H:%M:%S')}] 斩获优惠券清单明细 (共 {len(all_coupons)} 张):")
                        for idx, cp in enumerate(all_coupons, 1):
                            log_lines.append(format_single_coupon_item(idx, cp))
                    if new_token and new_token != token:
                        log_lines.append(f"[{time.strftime('%H:%M:%S')}] [凭证自动续期] 成功捕获服务端最新 Token 并持久化回存。")
                    log_lines.append(f"[{time.strftime('%H:%M:%S')}] [成功] 领券记录与资产明细已完整保存至本地数据库。")

                elif code == 1014:
                    last_claimed_ts = account.get("meituan_last_claimed_at") or account.get("last_claimed_at") or 0
                    if last_claimed_ts > 0:
                        elapsed = int(time.time()) - last_claimed_ts
                        cooldown_left = max(0, COOLDOWN_SEC - elapsed)
                        h = cooldown_left // 3600
                        m = (cooldown_left % 3600) // 60
                        last_time_str = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(last_claimed_ts))
                    else:
                        h, m = 23, 59
                        last_time_str = "近期"

                    log_lines.append(f"[{time.strftime('%H:%M:%S')}] [步骤 3/3] 服务端响应: 今日已达领取上限 (状态码: 1014)")
                    log_lines.append(f"[{time.strftime('%H:%M:%S')}] 官方反馈说明: 您今天已经领取过了，每天只能领取一次，明天再来哦～")
                    log_lines.append(f"[{time.strftime('%H:%M:%S')}] 平台限领规则: 美团实行 24 小时滚动窗口限领（非自然日 0 点重置）")
                    log_lines.append(f"[{time.strftime('%H:%M:%S')}] 上次成功领券: {last_time_str} (距下次可领还剩约 {h} 小时 {m} 分钟)")
                    
                    # 读取本地已缓存的今日卡券清单以供展示
                    cached_coupons = account.get("meituan_last_claimed_details") or account.get("last_claimed_details") or []
                    if cached_coupons and isinstance(cached_coupons, list):
                        log_lines.append(f"[{time.strftime('%H:%M:%S')}] 今日有效卡券缓存清单 (共 {len(cached_coupons)} 张，可直接在美团 App 使用):")
                        for idx, cp in enumerate(cached_coupons[:10], 1):
                            log_lines.append(format_single_coupon_item(idx, cp))
                    log_lines.append(f"[{time.strftime('%H:%M:%S')}] [提示] 今日神券权益依然有效，系统已避开无意义重发以防风控。")

                elif code in (509, 50200):
                    log_lines.append(f"[{time.strftime('%H:%M:%S')}] [风控保护] 触发美团官方请求频控限流 (状态码: {code})")
                    log_lines.append(f"[{time.strftime('%H:%M:%S')}] 官方提示: {res.get('message') or '请求过于频繁，请稍后重试'}")
                    log_lines.append(f"[{time.strftime('%H:%M:%S')}] [处理建议] 建议等待 15 分钟后再试，已触发自适应延迟退出。")

                else:
                    log_lines.append(f"[{time.strftime('%H:%M:%S')}] [领券异常] 接口返回状态码: {code}")
                    log_lines.append(f"[{time.strftime('%H:%M:%S')}] 错误信息: {res.get('message') or res.get('error') or '未知错误'}")

                formatted = format_claim_result(account_key, nickname, res)
                res["account_key"] = account_key
                res["nickname"] = nickname
                res["formatted_text"] = formatted
                logger.info(f"[美团领券] {nickname} 执行结果: code={code}, count={count}")

                status = "success" if (is_success or code == 1014) else "error"
                log_lines.append(f"[{time.strftime('%H:%M:%S')}] ========================================================")
                log_lines.append(f"[{time.strftime('%H:%M:%S')}] 【美团官方福利社领券】任务流水结束。")
                full_log_text = "\n".join(log_lines)
                res["detailed_log"] = full_log_text

                if log_id > 0:
                    db.update_job_log(log_id, status=status, output=full_log_text)
                elif record_log:
                    db.add_job_log(job_id, account_key, "meituan_coupon", status, full_log_text)
                return res

            # 401 出现，本地 pt_passport_auth.json 可能被清空，准备重试
            logger.warning(f"[美团领券] {nickname} 第 {attempt + 1} 次尝试收到 401，准备重新激活重试")
            log_lines.append(f"[{time.strftime('%H:%M:%S')}] [自愈检测] 第 {attempt + 1} 次尝试收到 401 响应 (登录态在服务端被重置)")
            log_lines.append(f"[{time.strftime('%H:%M:%S')}] [自愈重试] 正在重新激活写回主 Token 并在冷却后自动重发...")
            last_res = res
            if attempt < len(RETRY_INTERVALS):
                time.sleep(RETRY_INTERVALS[attempt])

        # 2. 主 Token 多次重试仍 401，依次尝试历史池
        if pool:
            logger.info(f"[美团领券] {nickname} 主 Token 失效，尝试历史池 ({len(pool)} 个候选)...")
            log_lines.append(f"[{time.strftime('%H:%M:%S')}] [候选自愈] 主 Token 尝试全部 401，正在遍历备用历史候选池 ({len(pool)} 个候选)...")
            for f_idx, fallback_token in enumerate(reversed(pool), 1):
                if fallback_token == token:
                    continue
                f_mask = f"{fallback_token[:8]}****{fallback_token[-4:]}" if len(fallback_token) > 12 else "****"
                log_lines.append(f"[{time.strftime('%H:%M:%S')}] 正在测试历史候选 Token {f_idx}/{len(pool)} ({f_mask})...")
                activate_account(fallback_token)
                res = execute_issue(timeout=35)
                _last_rpc_timestamp = time.time()
                code = res.get("code")
                if code != 401:
                    logger.info(f"[美团领券] {nickname} 历史池候选 Token 激活成功！code={code}")
                    is_success = bool(res.get("success"))
                    count = res.get("coupon_count", 0) if is_success else 0
                    if not account_key.startswith("acc_"):
                        save_meituan_account({
                            "key": account_key,
                            "token": fallback_token,
                            "is_active": 1
                        })
                    update_meituan_claim_stats(account_key, count, all_coupons, new_token=fallback_token)
                    formatted = format_claim_result(account_key, nickname, res)
                    res["account_key"] = account_key
                    res["nickname"] = nickname
                    res["formatted_text"] = formatted
                    log_lines.append(f"[{time.strftime('%H:%M:%S')}] [自愈成功] 历史候选凭据激活成功 (状态码: {code})！{formatted}")
                    if is_success and all_coupons:
                        log_lines.append(f"[{time.strftime('%H:%M:%S')}] 斩获优惠券明细清单 (共 {len(all_coupons)} 张):")
                        for idx, cp in enumerate(all_coupons, 1):
                            log_lines.append(format_single_coupon_item(idx, cp))
                    status = "success" if (is_success or code == 1014) else "error"
                    log_lines.append(f"[{time.strftime('%H:%M:%S')}] 【美团官方福利社领券】任务流水结束。")
                    full_log_text = "\n".join(log_lines)
                    res["detailed_log"] = full_log_text
                    if log_id > 0:
                        db.update_job_log(log_id, status=status, output=full_log_text)
                    elif record_log:
                        db.add_job_log(job_id, account_key, "meituan_coupon", status, full_log_text)
                    return res

        # 3. 确实全部失效，标记需重新登录
        logger.error(f"[美团领券] {nickname} 凭证彻底失效，需重新扫码授权")
        formatted = format_claim_result(account_key, nickname, last_res)
        last_res["need_relogin"] = True
        last_res["account_key"] = account_key
        last_res["nickname"] = nickname
        last_res["formatted_text"] = formatted
        log_lines.append(f"[{time.strftime('%H:%M:%S')}] [凭证彻底失效] 主凭据及历史候选池均无法通过美团安全验证 (状态码: 401)")
        log_lines.append(f"[{time.strftime('%H:%M:%S')}] [指引] 请前往【账号管理】页面，在对应卡片上点击【绑定美团】重新扫码授权。")
        log_lines.append(f"[{time.strftime('%H:%M:%S')}] ========================================================")
        log_lines.append(f"[{time.strftime('%H:%M:%S')}] 【美团官方福利社领券】任务流水结束。")
        status = "error"
        full_log_text = "\n".join(log_lines)
        last_res["detailed_log"] = full_log_text

        # 停用该失效账号状态
        if account_key.startswith("acc_"):
            db.update_account_profile(account_key, {"meituan_is_active": 0})
        else:
            save_meituan_account({
                "key": account_key,
                "is_active": 0
            })

        if log_id > 0:
            db.update_job_log(log_id, status=status, output=full_log_text)
        elif record_log:
            db.add_job_log(job_id, account_key, "meituan_coupon", status, full_log_text)
        return last_res


def claim_all_meituan_accounts(force: bool = False, record_log: bool = True, exclude_keys: Optional[Any] = None) -> List[Dict[str, Any]]:
    """
    全量美团账号轮流领券：
    1. 检查 24 小时滚动窗口，冷却中的账号输出详尽跳过明细；
    2. 对需要领取的账号串行调用，并在账号间增加随机延迟抖动；
    3. 执行完毕后恢复首个主账号的激活态。
    """
    accounts = get_all_meituan_accounts()
    if not accounts:
        return []

    results = []
    now_ts = int(time.time())
    exclude_set = set(exclude_keys) if exclude_keys else set()

    for acc in accounts:
        key = acc["key"]
        if key in exclude_set:
            continue
        nickname = acc.get("nickname") or key
        last_claimed = acc.get("last_claimed_at") or 0
        elapsed = now_ts - last_claimed
        cooldown_left = max(0, COOLDOWN_SEC - elapsed)

        # 24小时滚动窗口冷却检查（非强制时直接跳过）
        if not force and cooldown_left > 0 and last_claimed > 0:
            h = cooldown_left // 3600
            m = (cooldown_left % 3600) // 60
            last_str = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(last_claimed))
            tip = f"处于24小时冷却窗口内（距下次可领还剩 {h}小时{m}分），已自动安全跳过"
            logger.info(f"[美团领券跳过] {nickname}: {tip}")
            
            cached_coupons = acc.get("last_claimed_details") or acc.get("meituan_last_claimed_details") or []
            skip_lines = [
                f"[{time.strftime('%H:%M:%S')}] ========================================================",
                f"[{time.strftime('%H:%M:%S')}] 【美团全量领券轮询】检测账号: 【{nickname}】(ID: {key})",
                f"[{time.strftime('%H:%M:%S')}] 上次成功领券: {last_str} (已流逝 {elapsed // 3600}小时{(elapsed % 3600) // 60}分)",
                f"[{time.strftime('%H:%M:%S')}] 平台限领机制: 实行 24 小时滚动窗口限领（非自然日 0 点重置）",
                f"[{time.strftime('%H:%M:%S')}] 滚动冷却剩余: 还需等待约 {h} 小时 {m} 分钟",
                f"[{time.strftime('%H:%M:%S')}] [安全跳过] 账号处于保护冷却窗口内，自动跳过以防止触发美团高频风控。",
            ]
            if cached_coupons and isinstance(cached_coupons, list):
                skip_lines.append(f"[{time.strftime('%H:%M:%S')}] 今日已领取的有效神券明细 (共 {len(cached_coupons)} 张，可直接在美团 App 使用):")
                for idx, cp in enumerate(cached_coupons[:10], 1):
                    skip_lines.append(format_single_coupon_item(idx, cp))
            skip_lines.append(f"[{time.strftime('%H:%M:%S')}] 【美团全量领券轮询】该账号检查完毕。")
            skip_log = "\n".join(skip_lines)

            if record_log:
                try:
                    db.add_job_log(f"job_mt_{now_ts}_{uuid.uuid4().hex[:6]}", key, "meituan_coupon", "success", skip_log)
                except Exception:
                    pass

            results.append({
                "account_key": key,
                "nickname": nickname,
                "ok": True,
                "success": False,
                "status": "skipped",
                "code": 1014,
                "coupon_count": 0,
                "cooldown_left": cooldown_left,
                "message": tip,
                "formatted_text": f"[{nickname}] {tip}",
                "detailed_log": skip_log
            })
            continue

        # 执行领券
        res = claim_single_account(key, record_log=record_log)
        results.append(res)

        # 账号间随机等待，避免高频请求触发美团防刷
        time.sleep(random.uniform(0.6, 1.2))

    # 恢复第一个活跃账号为默认激活态
    with runner_lock:
        active_accs = [a for a in accounts if a.get("is_active")]
        if active_accs:
            primary = active_accs[0]
            activate_account(primary.get("token"), primary.get("saved_at"))

    return results
