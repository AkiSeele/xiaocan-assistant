"""
美团同店双返利智能监控引擎
功能规范：
1. 定期（每5分钟与半小时整点）流式高精度扫描美团外卖同店双返利商户；
2. 维护每日商户快照，每日凌晨自动重置基准；
3. 差量对比：每次执行仅在检测到新增商户或下架/缺少商户时触发通知推送；
4. 严格杜绝 Emoji，遵循 Semi Design 与企业级中文纯文本格式化输出；
5. 必须在系统开启任意有效通知渠道后方可运行。
"""
import time
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple, Set

from ..models import database as db
from .notifier import send_system_notification, is_any_notify_channel_enabled

logger = logging.getLogger("xiaocan.dual_rebate_monitor")

# 内存快照缓存：{account_key: {"date": "YYYY-MM-DD", "timestamp": int, "stores": {store_key: store_info}}}
_snapshot_cache: Dict[str, Dict[str, Any]] = {}


def _get_account_snapshot(account_key: str) -> Optional[Dict[str, Any]]:
    """获取指定账号的商户快照（优先内存缓存，回退 SQLite 存储）"""
    if account_key in _snapshot_cache:
        return _snapshot_cache[account_key]

    saved = db.get_setting(f"dual_rebate_snapshot_{account_key}")
    if isinstance(saved, dict):
        _snapshot_cache[account_key] = saved
        return saved
    return None


def _save_account_snapshot(account_key: str, snapshot: Dict[str, Any]):
    """持久化商户快照（更新内存并写入 SQLite）"""
    _snapshot_cache[account_key] = snapshot
    db.set_setting(f"dual_rebate_snapshot_{account_key}", snapshot)


def _clear_account_snapshot(account_key: str):
    """清理指定账号的快照"""
    if account_key in _snapshot_cache:
        del _snapshot_cache[account_key]
    db.set_setting(f"dual_rebate_snapshot_{account_key}", None)


def _format_store_entry(idx: int, s: Dict[str, Any]) -> str:
    """移动端紧凑型排版（微信/QQ 专属单店 2 行呈现，删除距离，排版深度优化）"""
    name = (s.get("name") or "未知店铺").strip()
    fixed_desc = (s.get("fixed_desc") or "").strip()
    pct_desc = (s.get("percent_desc") or "").strip()

    # 规范化金额描述: "返21% (最高¥14)" -> "返21% (封顶14元)"
    pct_desc = pct_desc.replace("¥", "").replace("最高", "封顶")
    if "封顶" in pct_desc and not pct_desc.endswith("元)"):
        pct_desc = pct_desc.replace(")", "元)")

    plan_parts = []
    if fixed_desc:
        plan_parts.append(fixed_desc)
    if pct_desc:
        plan_parts.append(pct_desc)
    plans_text = " | ".join(plan_parts) if plan_parts else "同店双方案"

    return f"[{idx:02d}] {name}\n     {plans_text}"


def _format_removed_store(idx: int, s: Dict[str, Any]) -> str:
    """移动端已下架商户精简排版（删除距离与多余后缀）"""
    name = (s.get("name") or "未知店铺").strip()
    return f"[{idx:02d}] {name}"


async def run_dual_rebate_monitor(
    account_key: str,
    params: Optional[Dict[str, Any]] = None,
    trigger_type: str = "cron"
) -> Tuple[str, bool]:
    """
    执行美团同店双返利监控主流程
    返回: (log_output: str, success: bool)
    """
    params = params or {}
    try:
        max_stores = int(params.get("max_stores", 300))
    except Exception:
        max_stores = 300
    keyword = (params.get("keyword") or "").strip()
    notify_on_initial = bool(params.get("notify_on_initial", True))

    log_lines = []
    now_str = time.strftime("%H:%M:%S")
    today_str = datetime.now().strftime("%Y-%m-%d")

    log_lines.append(f"[{now_str}] 启动美团同店双返利巡检: 触发方式={trigger_type}, 范围={max_stores}家, 关键词='{keyword}'")

    # 1. 前置强校验：必须接入并开启任意一种通知渠道
    if not is_any_notify_channel_enabled():
        err_msg = f"[{now_str}] 巡检中止: 系统未开启或未配置任何通知渠道，请前往【系统设置】配置！"
        log_lines.append(err_msg)
        return "\n".join(log_lines) + "\n", False

    # 2. 账号校验与凭据定位
    acc = db.get_account_by_key(account_key)
    if not acc:
        err_msg = f"[{now_str}] 账号凭据失效: 未找到 account_key={account_key}"
        log_lines.append(err_msg)
        return "\n".join(log_lines) + "\n", False

    city_code = acc.get("city_code") or 440303
    longitude = acc.get("longitude") or "114.13166"
    latitude = acc.get("latitude") or "22.548361"
    nickname = acc.get("nickname") or account_key

    # 3. 动态调用美团双返利流式扫描
    from ..api.endpoints import scan_dual_rebate_stores, _get_store_branch_key
    try:
        scan_res = await scan_dual_rebate_stores(
            city_code=city_code,
            longitude=str(longitude),
            latitude=str(latitude),
            account_key=account_key,
            platform="meituan",
            keyword=keyword,
            max_stores=max_stores
        )
    except Exception as e:
        err_msg = f"[{now_str}] 扫描接口调用异常: {e}"
        log_lines.append(err_msg)
        return "\n".join(log_lines) + "\n", False

    if not isinstance(scan_res, dict) or not scan_res.get("ok"):
        err_msg = f"[{now_str}] 扫描失败: {scan_res.get('message') if isinstance(scan_res, dict) else '接口返回异常'}"
        log_lines.append(err_msg)
        return "\n".join(log_lines) + "\n", False

    stores = scan_res.get("stores") or []
    # 严格按距离由近及远排序
    stores.sort(key=lambda x: (x.get("distance", 0) if x.get("distance", 0) > 0 else 9999999))
    scanned_count = scan_res.get("total_scanned_stores", 0)
    dual_count = len(stores)
    log_lines.append(f"[{time.strftime('%H:%M:%S')}] 扫描完成: 遍历商户={scanned_count}家, 检出同店双返利商户={dual_count}家")

    # 构建当前商户映射集 (key: 同店分店唯一标识)
    current_map: Dict[str, Dict[str, Any]] = {}
    for s in stores:
        sname = (s.get("name") or "").strip()
        skey = _get_store_branch_key("meituan", sname)
        fixed_desc = (s.get("fixed_plan") or {}).get("rebate_desc") or (s.get("rebate_desc") or "")
        pct_desc = (s.get("percent_plan") or {}).get("rebate_desc") or ""
        current_map[skey] = {
            "name": sname,
            "branch_key": skey,
            "distance": s.get("distance", 0),
            "distance_text": s.get("distance_text", "附近"),
            "fixed_desc": fixed_desc,
            "percent_desc": pct_desc,
            "order_money": s.get("order_money", 0),
            "rebate_price": s.get("rebate_price", 0),
            "rebate_rate": s.get("rebate_rate", 0),
        }

    # 4. 快照管理与差量分析
    prev_snapshot = _get_account_snapshot(account_key)
    is_new_day = (not prev_snapshot) or (prev_snapshot.get("date") != today_str)

    if is_new_day:
        # 跨天重置或初次运行：重置基准快照
        log_lines.append(f"[{time.strftime('%H:%M:%S')}] 检测到跨天或首次运行，已自动重置每日基准快照 (日期: {today_str})")
        new_snapshot = {
            "date": today_str,
            "timestamp": int(time.time()),
            "stores": current_map
        }
        _save_account_snapshot(account_key, new_snapshot)

        if notify_on_initial:
            if dual_count > 0:
                body_lines = [
                    f"账号: {nickname} | 时间: {now_str}",
                    f"双返利商户: 共 {dual_count} 家 (范围: 附近{scanned_count}家)",
                    "--------------------------------"
                ]
                for idx, s in enumerate(stores[:25], start=1):
                    body_lines.append(_format_store_entry(idx, s))
                    if idx < min(dual_count, 25):
                        body_lines.append("")
                if dual_count > 25:
                    body_lines.append(f"... 另有 {dual_count - 25} 家商户可在小蚕助手列表查看")

                while body_lines and body_lines[-1] == "":
                    body_lines.pop()

                title = f"美团双返利今日基准 (共{dual_count}家)"
                content = "\n".join(body_lines)
                try:
                    await send_system_notification(title=title, content=content, account_key=account_key)
                    log_lines.append(f"[{time.strftime('%H:%M:%S')}] 今日首轮基准清单已通过通知发送 (共 {dual_count} 家)")
                except Exception as ne:
                    log_lines.append(f"[{time.strftime('%H:%M:%S')}] 基准清单通知发送异常: {ne}")
            else:
                log_lines.append(f"[{time.strftime('%H:%M:%S')}] 当前扫描范围内暂无同店双返利商户，已建立今日空基准")
        return "\n".join(log_lines) + "\n", True

    # 同一天内的后续巡检：对比上一轮快照
    prev_map = prev_snapshot.get("stores") or {}
    prev_keys = set(prev_map.keys())
    curr_keys = set(current_map.keys())
    confirm_removal = bool(params.get("confirm_removal", True))

    # ---------------- 关键防抖与防雪崩机制 ----------------
    # 1. 扫描异常即时重试判定：如果上一轮存在较多商户 (>=4家)，而本轮忽然大幅突降 (降幅 > 50% 或归零，或缺失>=5家且剩余<=3家)
    is_drop_anomaly = (
        len(prev_keys) >= 4 and (
            len(curr_keys) == 0 or
            len(curr_keys) <= int(len(prev_keys) * 0.45) or
            (len(prev_keys - curr_keys) >= 5 and len(curr_keys) <= 3)
        )
    )

    if is_drop_anomaly:
        log_lines.append(
            f"[{time.strftime('%H:%M:%S')}] 预警：检测到双返利商户数异常突降 ({len(prev_keys)} -> {len(curr_keys)})，"
            f"疑似官方接口暂时性抖动或限流，等待 2 秒后执行补偿复扫..."
        )
        import asyncio
        await asyncio.sleep(2.0)
        try:
            retry_res = await scan_dual_rebate_stores(
                city_code=city_code,
                longitude=str(longitude),
                latitude=str(latitude),
                account_key=account_key,
                platform="meituan",
                keyword=keyword,
                max_stores=max_stores
            )
            if isinstance(retry_res, dict) and retry_res.get("ok"):
                retry_stores = retry_res.get("stores") or []
                if len(retry_stores) > int(len(prev_keys) * 0.5):
                    log_lines.append(f"[{time.strftime('%H:%M:%S')}] 补偿复扫成功恢复数据，重新检出双返利商户={len(retry_stores)}家！")
                    stores = retry_stores
                    dual_count = len(stores)
                    current_map = {}
                    for s in stores:
                        sname = (s.get("name") or "").strip()
                        skey = _get_store_branch_key("meituan", sname)
                        fixed_desc = (s.get("fixed_plan") or {}).get("rebate_desc") or (s.get("rebate_desc") or "")
                        pct_desc = (s.get("percent_plan") or {}).get("rebate_desc") or ""
                        current_map[skey] = {
                            "name": sname,
                            "branch_key": skey,
                            "distance_text": s.get("distance_text", "附近"),
                            "fixed_desc": fixed_desc,
                            "percent_desc": pct_desc,
                            "order_money": s.get("order_money", 0),
                            "rebate_price": s.get("rebate_price", 0),
                            "rebate_rate": s.get("rebate_rate", 0),
                        }
                    curr_keys = set(current_map.keys())
                    is_drop_anomaly = False
        except Exception as re_err:
            log_lines.append(f"[{time.strftime('%H:%M:%S')}] 补偿复扫异常: {re_err}")

    # 2. 异常突降熔断机制 (Spike Circuit Breaker)：
    # 若重试后仍处于严重突降状态且上一轮存量较多：
    # 绝对禁止直接清空快照并广播虚假全部下架通知！
    consecutive_drop = int(prev_snapshot.get("consecutive_drop", 0))
    if is_drop_anomaly:
        consecutive_drop += 1
        if consecutive_drop < 2:
            log_lines.append(
                f"[{time.strftime('%H:%M:%S')}] [防抖熔断] 补偿复扫后商户数仍处于异常突降状态 ({len(prev_keys)} -> {len(curr_keys)})。"
                f"触发接口异常保护，拦截虚假批量下架广播，保留上轮 {len(prev_keys)} 家商户基准待下轮核验 (连续异常: {consecutive_drop}/2)"
            )
            prev_snapshot["consecutive_drop"] = consecutive_drop
            prev_snapshot["timestamp"] = int(time.time())
            _save_account_snapshot(account_key, prev_snapshot)
            return "\n".join(log_lines) + "\n", True
        else:
            log_lines.append(f"[{time.strftime('%H:%M:%S')}] [连续确认] 连续 2 轮扫描商户均异常偏低，确认确实发生批量下架，执行真实状态更新")

    # 3. 差量分析与下架二次核验
    pending_missing = dict(prev_snapshot.get("pending_missing") or {})
    raw_added = curr_keys - prev_keys
    raw_removed = prev_keys - curr_keys

    confirmed_removed = set()
    real_added = set(raw_added)

    if confirm_removal:
        # 若之前在待确认缺失列表中的商户本轮重新出现，清除待确认标记（平滑自愈）
        for k in curr_keys:
            if k in pending_missing:
                del pending_missing[k]

        # 本轮缺失商户判定：
        for k in raw_removed:
            miss_cnt = pending_missing.get(k, 0) + 1
            if miss_cnt >= 2:
                # 连续 2 轮缺失才确认为真正下架
                confirmed_removed.add(k)
                if k in pending_missing:
                    del pending_missing[k]
                sname = prev_map.get(k, {}).get("name", k)
                log_lines.append(f"[{time.strftime('%H:%M:%S')}] [下架确认] 商户【{sname}】连续 2 轮巡检均未检出，确认为正式下架")
            else:
                # 首次缺失，放入缓冲列表，本轮仍保留在 current_map 中防止下轮被当成新增
                pending_missing[k] = miss_cnt
                if k in prev_map:
                    current_map[k] = prev_map[k]
                sname = prev_map.get(k, {}).get("name", k)
                log_lines.append(f"[{time.strftime('%H:%M:%S')}] [防抖暂缓] 商户【{sname}】本轮未检出，进入待核验状态 (1/2)，暂不发送下架提醒")
    else:
        confirmed_removed = raw_removed

    added_keys = real_added
    removed_keys = confirmed_removed

    log_lines.append(
        f"[{time.strftime('%H:%M:%S')}] 差量比对结果: 上轮={len(prev_keys)}家, 当前={len(current_map)}家, "
        f"新增={len(added_keys)}家, 确认下架={len(removed_keys)}家 (待核验缓冲={len(pending_missing)}家)"
    )

    # 更新快照
    new_snapshot = {
        "date": today_str,
        "timestamp": int(time.time()),
        "stores": current_map,
        "pending_missing": pending_missing,
        "consecutive_drop": 0
    }
    _save_account_snapshot(account_key, new_snapshot)

    if not added_keys and not removed_keys:
        log_lines.append(f"[{time.strftime('%H:%M:%S')}] 巡检完成: 未发现新增或确认下架商户，保持静默不重复推送")
        return "\n".join(log_lines) + "\n", True

    # 发现变动，组装并推送通知（专为微信/QQ移动端竖屏阅读深度优化）
    time_short = time.strftime("%H:%M:%S")
    summary_parts = []
    if added_keys:
        summary_parts.append(f"+{len(added_keys)} 新增")
    if removed_keys:
        summary_parts.append(f"-{len(removed_keys)} 下架")
    change_summary = " / ".join(summary_parts)

    body_lines = [
        f"账号: {nickname} | 时间: {time_short}",
        f"双返利商户: 共 {len(curr_keys)} 家 ({change_summary})",
        "--------------------------------"
    ]

    if added_keys:
        body_lines.append(f"【新增双返利商户】({len(added_keys)}家)")
        sorted_added = sorted(
            added_keys,
            key=lambda k: (
                current_map.get(k, {}).get("distance", 0) if current_map.get(k, {}).get("distance", 0) > 0 else 9999999
            )
        )
        for idx, k in enumerate(sorted_added, start=1):
            s = current_map[k]
            body_lines.append(_format_store_entry(idx, s))
            if idx < len(sorted_added):
                body_lines.append("")

    if removed_keys:
        if added_keys:
            body_lines.append("")
        body_lines.append(f"【下架/缺少商户】({len(removed_keys)}家)")
        sorted_removed = sorted(
            removed_keys,
            key=lambda k: (
                prev_map.get(k, {}).get("distance", 0) if prev_map.get(k, {}).get("distance", 0) > 0 else 9999999
            )
        )
        for idx, k in enumerate(sorted_removed, start=1):
            s = prev_map[k]
            body_lines.append(_format_removed_store(idx, s))

    while body_lines and body_lines[-1] == "":
        body_lines.pop()

    title = f"美团双返利变动 ({change_summary})"
    content = "\n".join(body_lines)
    try:
        await send_system_notification(title=title, content=content, account_key=account_key)
        log_lines.append(f"[{time.strftime('%H:%M:%S')}] 变动通知已成功发送 ({change_summary})")
    except Exception as ne:
        log_lines.append(f"[{time.strftime('%H:%M:%S')}] 变动通知发送异常: {ne}")

    return "\n".join(log_lines) + "\n", True
