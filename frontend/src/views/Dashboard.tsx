import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  Card,
  Row,
  Col,
  Typography,
  Tag,
  Button,
  Space,
  Empty,
  Tooltip,
  Avatar,
  Popconfirm,
  Modal,
  Notification,
  Toast,
  Spin,
  Select,
  RadioGroup,
  Radio
} from '@douyinfe/semi-ui';
import {
  IconPlay,
  IconShoppingBag,
  IconCheckCircleStroked,
  IconChevronRight,
  IconPriceTag,
  IconCopy,
  IconHelpCircle,
  IconActivity,
  IconClock,
  IconAlertCircle,
  IconSpin,
  IconRefresh,
  IconGift,
  IconBell,
  IconBolt,
  IconTick,
  IconList
} from '@douyinfe/semi-icons';
import { useAppStore } from '../store/useAppStore';
import { api } from '../api';
import { TaskIcon } from '../components/TaskIcons';
import { useGSAP, animateStaggerEnter, gsap } from '../utils/animations';
import { useOnActivated } from '../utils/useOnActivated';
import type { JobLog, StoreAppointment, OrderStats, DashboardChartData, XiaoCanMessage, XiaoCanMessageChannel, Order, TaskItem } from '../types';

const { Text } = Typography;

const cleanEmoji = (text?: string): string => {
  if (!text) return '';
  return text.replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{2300}-\u{23FF}]|[\u{2B50}-\u{2B55}]|[\u{FE00}-\u{FE0F}]|[\u{200D}]/gu, '').trim();
};

// 智能提取日志中的有效业务执行结果摘要 (过滤无意义的启动时间戳行与前缀)
const getLogSummary = (txt: string): string => {
  if (!txt) return '无返回摘要';
  const lines = txt.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return '无返回摘要';
  // 优先寻找非「开始执行任务」的结果行
  const resultLine = lines.find((l) => !l.includes('开始执行任务') && !l.startsWith('==='));
  const target = resultLine || lines[lines.length - 1] || lines[0];
  return target.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '').trim() || '执行完成';
};

// 格式化剩余超时/截止时间 (天/小时/分钟)
const formatRemainingTime = (remainingSec: number | null | undefined): string => {
  if (remainingSec === null || remainingSec === undefined) return '';
  if (remainingSec <= 0) return '已超时';
  const totalMinutes = Math.floor(remainingSec / 60);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return hours > 0 ? `剩 ${days}天${hours}小时` : `剩 ${days}天`;
  }
  if (hours > 0) {
    return minutes > 0 ? `剩 ${hours}小时${minutes}分钟` : `剩 ${hours}小时`;
  }
  return `剩 ${Math.max(1, minutes)}分钟`;
};

const TASK_LABELS: Record<string, string> = {
  // 霸王餐抢单与预约
  store_grab: '霸王餐即时抢单',
  store_appoint: '倒计时预约抢单',
  store_monitor: '实时名额监听捡漏',
  store_keyword: '商户定时搜索捡漏',
  store_search: '商户定向搜索捡漏',
  store_cancel: '霸王餐名额取消',
  // 日常自动化任务
  daily: '元宝乐园每日任务',
  group_lottery: '社群幸运转盘',
  redpack_rain: '整点红包雨',
  flash_sale: '元宝秒杀抢券',
  vip_expand: '会员每日签到',
  brand_flash: '大牌畅享秒杀',
  svip_rebate: 'SVIP高额返利券',
  media_vip: '影音会员周卡',
  free_order: '订单全额免单券',
  expire_remind: '凭据/JWT到期预警',
  coupon_remind: '卡券/红包到期提醒',
  dual_rebate_monitor: '美团同店双返利监控',
};

// 小蚕官方消息频道元数据 (对应微服务 SilkwormMessageCenter)
const CHANNEL_META: Record<number, { name: string; color: 'blue' | 'green' | 'amber' | 'purple' | 'grey'; icon: React.ReactNode }> = {
  1: { name: '订单通知', color: 'blue', icon: <IconShoppingBag size="small" /> },
  2: { name: '服务通知', color: 'green', icon: <IconCheckCircleStroked size="small" /> },
  3: { name: '活动通知', color: 'amber', icon: <IconGift size="small" /> },
  4: { name: '系统公告', color: 'purple', icon: <IconBell size="small" /> },
};

// 格式化消息时间
const formatMsgTime = (timestamp?: number): string => {
  if (!timestamp) return '';
  const ms = timestamp > 1e11 ? timestamp : timestamp * 1000;
  const d = new Date(ms);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (isToday) {
    return `今天 ${timeStr}`;
  }
  const isThisYear = d.getFullYear() === now.getFullYear();
  if (isThisYear) {
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${timeStr}`;
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${timeStr}`;
};

// 评价门槛标签颜色辅助
const getConditionTagColor = (condition?: string): 'green' | 'cyan' | 'blue' | 'amber' | 'grey' => {
  if (!condition) return 'green';
  const c = condition.trim();
  if (c.includes('无需') || c.includes('免评')) {
    return 'green';
  }
  if (c.includes('用餐反馈') || c.includes('反馈')) {
    return 'cyan';
  }
  if (c.includes('随心')) {
    return 'blue';
  }
  if (c.includes('图文') || c.includes('好评') || c.includes('字') || c.includes('图')) {
    return 'amber';
  }
  return 'cyan';
};

export const Dashboard: React.FC = () => {
  const accounts = useAppStore((s) => s.accounts);
  const currentAccountKey = useAppStore((s) => s.currentAccountKey);
  const setCurrentAccountKey = useAppStore((s) => s.setCurrentAccountKey);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const dashboardRef = useRef<HTMLDivElement>(null);

  // 核心业务数据状态
  const [messages, setMessages] = useState<XiaoCanMessage[]>([]);
  const [messageChannels, setMessageChannels] = useState<XiaoCanMessageChannel[]>([]);
  const [messagesUnreadTotal, setMessagesUnreadTotal] = useState<number>(0);
  const [selectedChannelId, setSelectedChannelId] = useState<number>(0);
  const [messagesLoading, setMessagesLoading] = useState<boolean>(false);
  const [markingRead, setMarkingRead] = useState<boolean>(false);
  const [activeMessageModal, setActiveMessageModal] = useState<XiaoCanMessage | null>(null);

  // 待上传外卖订单 (官方限额 3 笔) 状态
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState<boolean>(false);
  const [pendingAccountFilter, setPendingAccountFilter] = useState<'current' | 'all'>('current');

  // 本账号待执行与进行中任务状态
  const [accountTasks, setAccountTasks] = useState<TaskItem[]>([]);
  const [tasksLoading, setTasksLoading] = useState<boolean>(false);
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);

  const [recentLogs, setRecentLogs] = useState<JobLog[]>([]);
  const [logFilterAccount, setLogFilterAccount] = useState<string>('all');
  const [logsLoading, setLogsLoading] = useState<boolean>(false);
  const [rightPanelTab, setRightPanelTab] = useState<'feed' | 'messages'>('feed');
  const [appointments, setAppointments] = useState<StoreAppointment[]>([]);
  const [orderStats, setOrderStats] = useState<OrderStats>({
    total_orders: 0,
    completed_orders: 0,
    pending_orders: 0,
    total_rebate: 0,
    pending_rebate: 0,
    total_spent: 0,
  });
  const [chartData, setChartData] = useState<DashboardChartData>({
    trend: [],
    status_distribution: [],
    platform_distribution: [],
    today_summary: {
      today_rebate: 0,
      today_orders: 0,
      today_savings: 0,
    },
  });
  const [enabledTaskCount, setEnabledTaskCount] = useState<number>(0);
  const [totalTaskCount, setTotalTaskCount] = useState<number>(12);
  const [loading, setLoading] = useState<boolean>(true);

  // 按钮异步操作 Loading 状态 (防重复点击)
  const [batchAllLoading, setBatchAllLoading] = useState<boolean>(false);

  // 日志详情模态框
  const [activeLogModal, setActiveLogModal] = useState<JobLog | null>(null);

  const lastDashboardSignatureRef = useRef<string>('');
  const inFlightDashboardRef = useRef<boolean>(false);

  // 首页执行流水获取
  const fetchRecentLogs = useCallback(async (targetKey?: string, silent = false) => {
    const acc = targetKey !== undefined ? targetKey : logFilterAccount;
    const queryAcc = acc === 'all' ? undefined : acc;
    if (!silent) setLogsLoading(true);
    try {
      const res = await api.getJobs(queryAcc, 8);
      if (res.ok) {
        setRecentLogs(res.jobs || []);
      }
    } catch {
      // 异常捕获
    } finally {
      if (!silent) setLogsLoading(false);
    }
  }, [logFilterAccount]);

  // 待上传外卖订单拉取 (带上传订单)
  const fetchPendingOrders = useCallback(async (scope?: 'current' | 'all', silent = false) => {
    const targetScope = scope || pendingAccountFilter;
    const effectiveKey = targetScope === 'current' ? (currentAccountKey || (accounts[0]?.key ?? '')) : undefined;
    if (!silent) setOrdersLoading(true);
    try {
      const res = await api.getOrders({
        account_key: effectiveKey || undefined,
        status: 'pending',
        limit: 20,
      });
      if (res.ok) {
        setPendingOrders(res.orders || []);
      }
    } catch {
      // 异常捕获
    } finally {
      if (!silent) setOrdersLoading(false);
    }
  }, [currentAccountKey, accounts, pendingAccountFilter]);

  // 刷新本账号自动化待命任务
  const fetchAccountTasks = useCallback(async (targetKey?: string, silent = false) => {
    const key = targetKey || currentAccountKey || accounts[0]?.key;
    if (!key) return;
    if (!silent) setTasksLoading(true);
    try {
      const res = await api.getTasks(key);
      if (res.ok && res.tasks) {
        setAccountTasks(res.tasks || []);
        const enabled = res.tasks.filter((t: any) => t.enabled).length;
        setEnabledTaskCount(enabled);
        setTotalTaskCount(res.tasks.length);
      }
    } catch {
      // 异常捕获
    } finally {
      if (!silent) setTasksLoading(false);
    }
  }, [currentAccountKey, accounts]);

  // 立即手动触发执行单项任务
  const handleRunTaskImmediately = async (taskId: string, label: string) => {
    const key = currentAccountKey || accounts[0]?.key;
    if (!key) {
      Toast.warning('请先选择或登录执行账号');
      return;
    }
    setRunningTaskId(taskId);
    try {
      const res = await api.runTaskNow(key, taskId);
      if (res.ok) {
        Toast.success(`任务 [${label}] 已触发执行`);
        fetchRecentLogs(logFilterAccount, true);
      } else {
        Toast.error(`任务 [${label}] 执行失败: ${res.output || '未知原因'}`);
      }
    } catch (e: any) {
      Toast.error(`触发任务异常: ${e?.message || '网络连接异常'}`);
    } finally {
      setRunningTaskId(null);
    }
  };


  // 批量推送消息提醒 (接入 Semi Design 全局 Notification 组件)
  const handleNotifyAllUnread = () => {
    const unreadMsgs = messages.filter((m) => m.unread && m.unread > 0);
    const msgsToNotify = unreadMsgs.length > 0 ? unreadMsgs.slice(0, 3) : messages.slice(0, 2);
    if (msgsToNotify.length === 0) {
      Toast.info('暂无最新消息可推送');
      return;
    }
    msgsToNotify.forEach((msg, idx) => {
      setTimeout(() => {
        Notification.info({
          title: msg.title,
          content: (
            <div className="text-xs space-y-1">
              {msg.object_name && <div className="font-semibold text-semi-color-primary">{msg.object_name}</div>}
              <div>{msg.content}</div>
              <div className="text-semi-color-text-2 font-mono text-[11px]">{formatMsgTime(msg.create_time)}</div>
            </div>
          ),
          duration: 5,
        });
      }, idx * 300);
    });
    Toast.success(`已通过 Semi Design 通知组件弹出 ${msgsToNotify.length} 条通知`);
  };

  const handleSelectMessage = (msg: XiaoCanMessage) => {
    setActiveMessageModal(msg);
    Notification.info({
      title: msg.title,
      content: (
        <div className="text-xs space-y-1">
          {msg.object_name && <div className="font-semibold text-semi-color-primary">{msg.object_name}</div>}
          <div>{msg.content}</div>
          <div className="text-semi-color-text-2 font-mono text-[11px]">{formatMsgTime(msg.create_time)}</div>
        </div>
      ),
      duration: 4,
    });
  };

  // 小蚕官方消息中心数据拉取
  const fetchMessages = useCallback(async (channelId?: number, silent = false) => {
    const effectiveKey = currentAccountKey || (accounts[0]?.key ?? '');
    if (!effectiveKey) {
      setMessages([]);
      setMessageChannels([]);
      setMessagesUnreadTotal(0);
      return;
    }
    const cid = channelId !== undefined ? channelId : selectedChannelId;
    if (!silent) setMessagesLoading(true);
    try {
      const res = await api.getMessages({
        account_key: effectiveKey,
        channel_id: cid > 0 ? cid : undefined,
        page: 1,
        page_size: 25,
      });
      if (res.ok) {
        setMessages(res.messages || []);
        if (res.channels && res.channels.length > 0) {
          setMessageChannels(res.channels);
        }
        setMessagesUnreadTotal(res.unread_total ?? 0);
      }
    } catch {
      // 异常捕获
    } finally {
      if (!silent) setMessagesLoading(false);
    }
  }, [currentAccountKey, accounts, selectedChannelId]);

  // 全部标记为已读
  const handleMarkAllRead = async () => {
    const effectiveKey = currentAccountKey || (accounts[0]?.key ?? '');
    if (!effectiveKey) {
      Toast.warning('请先绑定并选择主控小蚕账号');
      return;
    }
    setMarkingRead(true);
    try {
      const res = await api.markAllMessagesRead(effectiveKey);
      if (res.ok) {
        Toast.success('所有消息已标记为已读');
        setMessages((prev) => prev.map((m) => ({ ...m, unread: 0 })));
        setMessageChannels((prev) => prev.map((c) => ({ ...c, unread: 0 })));
        setMessagesUnreadTotal(0);
        fetchMessages(selectedChannelId, true);
      } else {
        Toast.error(res.message || '标记已读失败');
      }
    } catch (e: any) {
      Toast.error(`操作失败: ${e.message || e}`);
    } finally {
      setMarkingRead(false);
    }
  };

  // 核心数据拉取
  const loadDashboardData = async (force = false, silent = false) => {
    const effectiveKey = currentAccountKey || (accounts[0]?.key ?? '');
    const signature = `dashboard_${effectiveKey}`;
    if (!force && lastDashboardSignatureRef.current === signature) {
      return;
    }
    if (inFlightDashboardRef.current) return;
    inFlightDashboardRef.current = true;
    lastDashboardSignatureRef.current = signature;

    if (!silent) setLoading(true);
    try {
      const logQueryKey = logFilterAccount === 'all' ? undefined : logFilterAccount;
      const [jobsRes, apptsRes, statsRes, chartRes, tasksRes] = await Promise.all([
        api.getJobs(logQueryKey, 8),
        api.getAppointments(effectiveKey || undefined),
        api.getOrderStats(effectiveKey || undefined),
        api.getDashboardChartData(effectiveKey || undefined),
        effectiveKey ? api.getTasks(effectiveKey) : Promise.resolve({ ok: false, tasks: [] }),
      ]);

      if (jobsRes.ok) setRecentLogs(jobsRes.jobs || []);
      if (apptsRes.ok) setAppointments(apptsRes.appointments || []);
      if (statsRes.ok && statsRes.stats) setOrderStats(statsRes.stats);
      if (chartRes.ok && chartRes.data) setChartData(chartRes.data);

      if (tasksRes && tasksRes.ok && tasksRes.tasks) {
        setAccountTasks(tasksRes.tasks || []);
        const enabled = tasksRes.tasks.filter((t: any) => t.enabled).length;
        setEnabledTaskCount(enabled);
        setTotalTaskCount(tasksRes.tasks.length);
      }
      fetchMessages(selectedChannelId, silent);
      fetchPendingOrders(undefined, silent);
    } catch (e) {
      // 异常捕获
    } finally {
      inFlightDashboardRef.current = false;
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
    fetchMessages(0);
    fetchPendingOrders(undefined, false);
  }, [currentAccountKey, accounts.length]);

  // 页面切入激活时自动平滑拉取最新资产、任务与执行流水数据
  useOnActivated('dashboard', () => {
    loadDashboardData(true, true);
    fetchRecentLogs(logFilterAccount, true);
    fetchMessages(selectedChannelId, true);
    fetchPendingOrders(undefined, true);
    fetchAccountTasks(undefined, true);
  }, { throttleMs: 3000 });

  // 当日志账号筛选切换时拉取最新日志
  useEffect(() => {
    fetchRecentLogs(logFilterAccount);
  }, [logFilterAccount, fetchRecentLogs]);

  // 当存在正在执行中的流水时，每 3 秒静默轮询更新状态（后台非活跃时自动挂起）
  const hasRunningLogs = recentLogs.some((l) => l.status === 'running');
  useEffect(() => {
    if (!hasRunningLogs) return;
    const timer = setInterval(() => {
      if (useAppStore.getState().activeTab !== 'dashboard') return;
      fetchRecentLogs(logFilterAccount, true);
    }, 3000);
    return () => clearInterval(timer);
  }, [hasRunningLogs, logFilterAccount, fetchRecentLogs]);

  // GSAP 进场交错动画 (只在组件挂载时平滑执行一次，避免数据刷新与账号切换时的闪烁)
  useGSAP(
    () => {
      if (dashboardRef.current) {
        animateStaggerEnter(dashboardRef.current, '.gsap-card-item', 0.02);
      }
    },
    { scope: dashboardRef }
  );

  // 4 大核心资产 Bento 卡片鼠标移入/移出 GSAP 动效 (遵循 Semi Design 克制、严谨、轻量微动效原则)
  const { contextSafe } = useGSAP({ scope: dashboardRef });

  const handleBentoEnter = contextSafe((e: React.MouseEvent<HTMLDivElement>) => {
    gsap.to(e.currentTarget, {
      y: -2,
      duration: 0.2,
      ease: 'power1.out',
      overwrite: 'auto',
    });
  });

  const handleBentoLeave = contextSafe((e: React.MouseEvent<HTMLDivElement>) => {
    gsap.to(e.currentTarget, {
      y: 0,
      duration: 0.18,
      ease: 'power1.out',
      overwrite: 'auto',
    });
  });

  // 当前激活账号资料
  const currentAccount = accounts.find((a) => a.key === currentAccountKey) || accounts[0];

  // 过滤并组装当前账号全部待执行与进行中任务 (严格排除美团同店双返利监控)
  const activePendingTasks = useMemo(() => {
    const list: Array<{
      id: string;
      rawId?: string;
      type: 'automation' | 'appointment';
      label: string;
      subTitle?: string;
      category: 'member' | 'daily' | 'custom' | 'store';
      categoryLabel: string;
      categoryColor: 'violet' | 'blue' | 'amber' | 'cyan' | 'red';
      vip?: string;
      timeText: string;
      nextRunTime?: string;
      statusText: string;
      statusColor: 'cyan' | 'purple' | 'green' | 'amber' | 'grey';
      platform?: string;
      storeIcon?: string;
      rebatePrice?: number;
      condition?: string;
      orderMoney?: number;
      tip?: string;
    }> = [];

    // 1. 本账号进行中/倒计时/就绪的霸王餐抢单预约
    const activeAppts = appointments.filter(
      (a) =>
        (a.status === 'monitoring' || a.status === 'scheduled' || a.status === 'primed') &&
        (!currentAccountKey || a.account_key === currentAccountKey || accounts.length === 1)
    );
    for (const appt of activeAppts) {
      list.push({
        id: `appt_${appt.id}`,
        type: 'appointment',
        label: appt.store_name,
        category: 'store',
        categoryLabel: appt.status === 'monitoring' ? '霸王餐捡漏' : '霸王餐抢单',
        categoryColor: appt.status === 'monitoring' ? 'cyan' : 'amber',
        timeText: appt.start_time ? `今日 ${appt.start_time}` : '全天监控',
        statusText:
          appt.status === 'monitoring'
            ? '捡漏中'
            : appt.status === 'primed'
            ? '就绪'
            : '倒计时',
        statusColor:
          appt.status === 'monitoring'
            ? 'cyan'
            : appt.status === 'primed'
            ? 'green'
            : 'purple',
        platform: appt.platform,
        storeIcon: appt.icon || appt.store_icon,
        rebatePrice: appt.rebate_price,
        condition: appt.condition,
        orderMoney: appt.order_money,
      });
    }

    // 2. 本账号已开启的自动化任务 (明确排除 dual_rebate_monitor 美团同店双返利监控)
    const enabledTasks = accountTasks.filter(
      (t) => t.enabled && t.task_id !== 'dual_rebate_monitor'
    );
    for (const task of enabledTasks) {
      let catLabel = '日常福利';
      let catColor: 'violet' | 'blue' | 'amber' | 'cyan' | 'red' = 'blue';
      if (task.category === 'member') {
        catLabel = '秒杀抢券';
        catColor = 'violet';
      } else if (task.category === 'custom') {
        catLabel = '资产守护';
        catColor = 'amber';
      } else if (task.task_id === 'redpack_rain') {
        catLabel = '整点福利';
        catColor = 'red';
      }

      let timeText = task.time_label || task.cron_time || '待命';
      if (task.fixed_time && task.time_label) {
        timeText = task.time_label;
      } else if (task.cron_time) {
        timeText = `每日 ${task.cron_time}`;
      }

      list.push({
        id: `task_${task.task_id}`,
        rawId: task.task_id,
        type: 'automation',
        label: task.label,
        category: (task.category as any) || 'daily',
        categoryLabel: catLabel,
        categoryColor: catColor,
        vip: task.vip,
        timeText,
        nextRunTime: task.next_run_time,
        statusText: '已开启待命',
        statusColor: 'green',
        tip: task.tip,
      });
    }

    return list;
  }, [appointments, currentAccountKey, accounts.length, accountTasks]);

  // 今日关键待命节点 (精选 3~4 项高频与抢券节点，避免首页 15 项任务平铺造成的杂乱压迫感)
  const highlightTasks = useMemo(() => {
    const appts = activePendingTasks.filter((t) => t.type === 'appointment');
    const priorityIds = ['redpack_rain', 'svip_rebate', 'brand_flash', 'flash_sale', 'daily'];
    const automations = activePendingTasks.filter(
      (t) => t.type === 'automation' && priorityIds.includes(t.rawId || '')
    );
    const combined = [...appts, ...automations];
    if (combined.length === 0) {
      return activePendingTasks.slice(0, 4);
    }
    return combined.slice(0, 4);
  }, [activePendingTasks]);

  // 一键执行全部日常任务 (串行合辑)
  const handleBatchRunAll = async () => {
    if (!currentAccountKey) {
      Toast.warning('请先绑定并选择主控小蚕账号');
      return;
    }
    setBatchAllLoading(true);
    try {
      const res = await api.batchRunDaily(currentAccountKey);
      if (res.ok) {
        Notification.success({
          title: '全部日常任务打卡完毕',
          content: (
            <div className="text-xs space-y-1 mt-1">
              {res.results?.map((r, i) => (
                <div key={i} className="flex justify-between items-center">
                  <span>{r.label}:</span>
                  <Tag size="small" color={r.ok ? 'green' : 'red'}>
                    {r.ok ? '完成' : '异常'}
                  </Tag>
                </div>
              ))}
            </div>
          ),
          duration: 6,
        });
        loadDashboardData(true);
      } else {
        Toast.error(res.message || '一键打卡失败');
      }
    } catch (e: any) {
      Toast.error(`一键执行异常: ${e.message || e}`);
    } finally {
      setBatchAllLoading(false);
    }
  };

  // 复制文本辅助
  const handleCopy = (text: string, label: string = '文本') => {
    navigator.clipboard.writeText(text);
    Toast.success(`${label}已成功复制到剪贴板`);
  };

  return (
    <div ref={dashboardRef} className="w-full h-full min-h-0 flex flex-col justify-between overflow-hidden gap-2 sm:gap-2.5">
      {/* 顶部主控账号概览 Card (专业沉稳三段式，色彩收敛，数据聚焦) */}
      <div className="gsap-card-item shrink-0 bg-semi-color-bg-1 border border-semi-color-border/90 rounded-2xl px-4 py-2.5 shadow-xs hover:border-semi-color-primary-light-active transition-colors duration-200 will-change-[transform,opacity] flex items-center justify-between gap-3">
        {/* 左侧：主控账号身份与连接状态 */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative group cursor-pointer shrink-0" onClick={() => setActiveTab('accounts')}>
            <Avatar
              size="medium"
              src={currentAccount?.avatar || undefined}
              color="orange"
              className="ring-2 ring-semi-color-primary/30 group-hover:ring-semi-color-primary group-hover:scale-105 transition-all duration-300 shadow-xs"
            >
              {currentAccount?.nickname?.[0] || '蚕'}
            </Avatar>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-gray-900 shadow-xs" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="font-bold text-base sm:text-lg text-semi-color-text-0 truncate max-w-[240px] cursor-pointer hover:text-semi-color-primary transition-colors"
                onClick={() => setActiveTab('accounts')}
              >
                {currentAccount?.nickname || '未选择主控账号'}
              </span>
              <Tag
                color={currentAccount?.is_plus ? 'amber' : 'blue'}
                size="small"
                shape="circle"
                className="font-semibold text-xs"
              >
                {currentAccount?.is_plus
                  ? `SVIP${currentAccount?.vip_level || 1}`
                  : `VIP${currentAccount?.vip_level || 1}`}
              </Tag>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-medium shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span>主控托管中</span>
              </div>
              {currentAccount?.phone && (
                <span className="text-xs text-semi-color-text-2 font-mono hidden xl:inline">
                  {currentAccount.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 text-xs text-semi-color-text-2 mt-1 flex-wrap">
              <span>
                密钥: <span className="font-mono text-semi-color-text-1">{currentAccount?.key ? `${currentAccount.key.slice(0, 10)}...` : '无'}</span>
              </span>
              <span>
                最后同步: <span className="font-mono text-semi-color-text-1">{currentAccount?.updated_at?.split(' ')[1] || currentAccount?.updated_at || '刚刚'}</span>
              </span>
              {Boolean(currentAccount?.vip_score) && (
                <span className="hidden lg:inline text-semi-color-text-2">
                  成长值: <span className="font-mono text-semi-color-text-1">{(currentAccount?.vip_score || 0).toLocaleString()}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 右侧：多账号切换与全局操作 */}
        <div className="flex items-center gap-2 shrink-0">
          {accounts.length > 1 && (
            <Select
              value={currentAccountKey}
              onChange={(v) => {
                setCurrentAccountKey(String(v));
                const target = accounts.find((a) => a.key === v);
                Toast.success(`已切换主控为【${target?.nickname || v}】`);
              }}
              style={{ width: 150 }}
              size="small"
              renderSelectedItem={(opt: any) => {
                const acc = accounts.find((a) => a.key === opt?.value);
                return (
                  <div className="flex items-center gap-1.5 text-xs truncate">
                    <Avatar size="extra-extra-small" src={acc?.avatar || undefined} color="orange">
                      {acc?.nickname?.[0] || '蚕'}
                    </Avatar>
                    <span className="truncate">{acc?.nickname || '选择账号'}</span>
                  </div>
                );
              }}
            >
              {accounts.map((a) => (
                <Select.Option key={a.key} value={a.key}>
                  <div className="flex items-center gap-1.5 py-0.5">
                    <Avatar size="extra-extra-small" src={a.avatar || undefined} color="orange">
                      {a.nickname?.[0] || '蚕'}
                    </Avatar>
                    <span className="text-xs truncate flex-1">{a.nickname}</span>
                    <Tag size="small" color={a.is_plus ? 'amber' : 'blue'}>
                      {a.is_plus ? `SVIP${a.vip_level || 1}` : `VIP${a.vip_level || 1}`}
                    </Tag>
                  </div>
                </Select.Option>
              ))}
            </Select>
          )}

          <Button
            theme="light"
            type="primary"
            size="small"
            icon={<IconRefresh spin={loading} />}
            loading={loading}
            onClick={() => {
              loadDashboardData(true);
              Toast.success('已同步最新资产与任务数据');
            }}
          >
            刷新数据
          </Button>

          <Button
            theme="light"
            type="tertiary"
            size="small"
            icon={<IconChevronRight />}
            iconPosition="right"
            onClick={() => setActiveTab('accounts')}
          >
            账号管理
          </Button>
        </div>
      </div>

      {/* 4 大核心资产 Bento 卡片 (大字号聚焦核心资产与调度) */}
      <Row gutter={[10, 10]} className="w-full !mx-0 shrink-0">
        {/* 1. 累计到账返现 */}
        <Col xs={12} sm={6}>
          <div
            onMouseEnter={handleBentoEnter}
            onMouseLeave={handleBentoLeave}
            onClick={() => setActiveTab('orders')}
            className="h-full cursor-pointer will-change-transform"
          >
            <Card
              shadows="hover"
              className="gsap-card-item rounded-xl border border-semi-color-border hover:border-semi-color-primary-light-active transition-colors duration-200 select-none h-full"
              bodyStyle={{ padding: '12px 14px' }}
            >
              <div className="flex justify-between items-center">
                <Space align="center" spacing="tight">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <IconCheckCircleStroked size="small" />
                  </div>
                  <Text type="secondary" className="text-sm font-semibold">累计到账返现</Text>
                </Space>
                <Tooltip content="已成功核销并结算入账的霸王餐总返利">
                  <IconHelpCircle size="small" className="text-semi-color-text-3 cursor-pointer" />
                </Tooltip>
              </div>
              <div className="flex items-baseline gap-1 my-1">
                <span className="text-sm font-semibold text-semi-color-text-2">¥</span>
                <span className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-semi-color-text-0">
                  {orderStats.total_rebate.toFixed(2)}
                </span>
              </div>
              <Text type="tertiary" size="small" className="text-xs block truncate">
                已结算 <span className="text-semi-color-text-1 font-medium">{orderStats.completed_orders}</span> 笔订单
              </Text>
            </Card>
          </div>
        </Col>

        {/* 2. 在途/待入账返现 */}
        <Col xs={12} sm={6}>
          <div
            onMouseEnter={handleBentoEnter}
            onMouseLeave={handleBentoLeave}
            onClick={() => setActiveTab('orders')}
            className="h-full cursor-pointer will-change-transform"
          >
            <Card
              shadows="hover"
              className="gsap-card-item rounded-xl border border-semi-color-border hover:border-semi-color-primary-light-active transition-colors duration-200 select-none h-full"
              bodyStyle={{ padding: '12px 14px' }}
            >
              <div className="flex justify-between items-center">
                <Space align="center" spacing="tight">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <IconPriceTag size="small" />
                  </div>
                  <Text type="secondary" className="text-sm font-semibold">在途/待入账</Text>
                </Space>
                <Tooltip content="已提交外卖单号，正由小蚕与商家审核中的返利金额">
                  <IconHelpCircle size="small" className="text-semi-color-text-3 cursor-pointer" />
                </Tooltip>
              </div>
              <div className="flex items-baseline gap-1 my-1">
                <span className="text-sm font-semibold text-semi-color-text-2">¥</span>
                <span className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-semi-color-text-0">
                  {orderStats.pending_rebate.toFixed(2)}
                </span>
              </div>
              <Text type="tertiary" size="small" className="text-xs block truncate">
                审核中 <span className="text-semi-color-text-1 font-medium">{orderStats.pending_orders}</span> 单 · 预计2~24h
              </Text>
            </Card>
          </div>
        </Col>

        {/* 3. 今日已省外卖费 */}
        <Col xs={12} sm={6}>
          <div
            onMouseEnter={handleBentoEnter}
            onMouseLeave={handleBentoLeave}
            onClick={() => setActiveTab('orders')}
            className="h-full cursor-pointer will-change-transform"
          >
            <Card
              shadows="hover"
              className="gsap-card-item rounded-xl border border-semi-color-border hover:border-semi-color-primary-light-active transition-colors duration-200 select-none h-full"
              bodyStyle={{ padding: '12px 14px' }}
            >
              <div className="flex justify-between items-center">
                <Space align="center" spacing="tight">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <IconShoppingBag size="small" />
                  </div>
                  <Text type="secondary" className="text-sm font-semibold">今日已省外卖费</Text>
                </Space>
                <Tooltip content="今日已实际核销到账的霸王餐返现总额">
                  <IconHelpCircle size="small" className="text-semi-color-text-3 cursor-pointer" />
                </Tooltip>
              </div>
              <div className="flex items-baseline gap-1 my-1">
                <span className="text-sm font-semibold text-semi-color-text-2">¥</span>
                <span className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-semi-color-text-0">
                  {(chartData?.today_summary?.today_savings || 0).toFixed(2)}
                </span>
              </div>
              <Text type="tertiary" size="small" className="text-xs block truncate">
                今日到账 <span className="text-semi-color-text-1 font-medium">{chartData?.today_summary?.today_completed_orders ?? (chartData?.today_summary?.today_orders || 0)}</span> 笔
                {(chartData?.today_summary?.today_pending_orders ?? 0) > 0 && (
                  <span> · 在途 <span className="text-semi-color-text-1 font-medium">{chartData?.today_summary?.today_pending_orders}</span> 单</span>
                )}
              </Text>
            </Card>
          </div>
        </Col>

        {/* 4. 自动化任务调度 */}
        <Col xs={12} sm={6}>
          <div
            onMouseEnter={handleBentoEnter}
            onMouseLeave={handleBentoLeave}
            onClick={() => setActiveTab('automation')}
            className="h-full cursor-pointer will-change-transform"
          >
            <Card
              shadows="hover"
              className="gsap-card-item rounded-xl border border-semi-color-border hover:border-semi-color-primary-light-active transition-colors duration-200 select-none h-full"
              bodyStyle={{ padding: '12px 14px' }}
            >
              <div className="flex justify-between items-center">
                <Space align="center" spacing="tight">
                  <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                    <IconPlay size="small" />
                  </div>
                  <Text type="secondary" className="text-sm font-semibold">任务调度中心</Text>
                </Space>
                <Tooltip content="APScheduler 毫秒级调度中心全天候定时任务">
                  <IconActivity size="small" className="text-purple-500 cursor-pointer" />
                </Tooltip>
              </div>
              <div className="flex items-baseline gap-1 my-1">
                <span className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-semi-color-text-0">
                  {enabledTaskCount}
                </span>
                <span className="text-xs font-medium text-semi-color-text-2">/ {totalTaskCount} 项开启</span>
              </div>
              <Text type="tertiary" size="small" className="text-xs flex items-center gap-1.5 truncate">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0"></span>
                <span className="truncate">
                  {enabledTaskCount > 0 ? '定时秒杀就绪' : '任务待开启'}
                  {appointments.length > 0 ? ` · ${appointments.length}家盯单` : ''}
                </span>
              </Text>
            </Card>
          </div>
        </Col>
      </Row>

      {/* 核心业务双栏布局 (100% 满屏自适应，左7列核心聚焦，右5列全高动态消息) */}
      <div className="flex-1 min-h-0 w-full grid grid-cols-1 lg:grid-cols-12 gap-2 sm:gap-2.5 overflow-hidden">
        {/* 左分栏：霸王餐待办工单 与 今日自动化守护快捷中心 (占 7 列，约 58%) */}
        <div className="lg:col-span-7 h-full min-h-0 flex flex-col gap-2 sm:gap-2.5 overflow-hidden">
          {/* 上卡片：待上传外卖订单 (官方限额 3 笔，紧凑自适应，工单级呈现) */}
          <Card
            title={
              <div className="flex justify-between items-center w-full min-w-0 gap-2">
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="w-5 h-5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <IconShoppingBag size="extra-small" />
                  </div>
                  <span className="font-bold text-base text-semi-color-text-0">
                    霸王餐待办工单
                  </span>
                  <Tag
                    color={pendingOrders.length > 0 ? 'amber' : 'grey'}
                    size="small"
                    shape="circle"
                    className="text-xs"
                  >
                    {pendingOrders.length > 0 ? `${pendingOrders.length}/3 待处理` : '0/3 官方限额'}
                  </Tag>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Select
                    size="small"
                    value={pendingAccountFilter}
                    onChange={(v) => {
                      const val = v as 'current' | 'all';
                      setPendingAccountFilter(val);
                      fetchPendingOrders(val);
                    }}
                    style={{ width: 104 }}
                  >
                    <Select.Option value="current">当前账号</Select.Option>
                    <Select.Option value="all">全部账号</Select.Option>
                  </Select>
                  <Tooltip content="刷新待上传订单">
                    <Button
                      theme="borderless"
                      type="tertiary"
                      size="small"
                      icon={<IconRefresh spin={ordersLoading} />}
                      onClick={() => fetchPendingOrders(pendingAccountFilter)}
                    />
                  </Tooltip>
                  <Button
                    theme="borderless"
                    type="primary"
                    size="small"
                    icon={<IconChevronRight />}
                    iconPosition="right"
                    onClick={() => setActiveTab('orders')}
                    className="text-xs !p-0 shrink-0"
                  >
                    全部
                  </Button>
                </div>
              </div>
            }
            className="gsap-card-item rounded-xl border border-semi-color-border shadow-xs shrink-0 overflow-hidden flex flex-col"
            headerStyle={{ padding: '8px 12px', borderBottom: '1px solid var(--semi-color-border)' }}
            bodyStyle={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}
          >
            {ordersLoading && pendingOrders.length === 0 ? (
              <div className="flex items-center justify-center py-3 text-semi-color-text-2 gap-2">
                <Spin size="small" />
                <span className="text-xs">检查待上传外卖订单...</span>
              </div>
            ) : pendingOrders.length > 0 ? (
              <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-0.5">
                {pendingOrders.map((order) => {
                  const acc = accounts.find((a) => a.key === order.account_key);
                  const isBound = Boolean(order.platform_order_id);
                  return (
                    <div
                      key={order.id}
                      className="p-1.5 sm:p-2 rounded-lg border border-semi-color-border/80 bg-semi-color-fill-0/40 hover:border-semi-color-primary-light-active transition-all flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <Avatar
                          size="extra-small"
                          shape="square"
                          src={
                            order.store_icon ||
                            (order.platform === 'meituan'
                              ? 'http://p0.meituan.net/business/9c1f3ad81227cb1f21341fee52246a08159931.jpg'
                              : undefined)
                          }
                          color="orange"
                          className="shrink-0 rounded-md"
                        >
                          {order.store_name?.[0] || '店'}
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Tooltip content={`点击复制: ${cleanEmoji(order.store_name)}`} position="top" showArrow>
                              <span
                                className="font-bold text-sm text-semi-color-text-0 truncate max-w-[200px] cursor-pointer hover:text-semi-color-primary transition-colors"
                                onClick={() => {
                                  const sname = cleanEmoji(order.store_name);
                                  if (sname) {
                                    navigator.clipboard.writeText(sname);
                                    Toast.success(`已复制店铺名称: ${sname}`);
                                  }
                                }}
                              >
                                {cleanEmoji(order.store_name)}
                              </span>
                            </Tooltip>
                            <Tag size="small" color={order.platform === 'meituan' ? 'amber' : 'blue'} className="shrink-0">
                              {order.platform === 'meituan' ? '美团' : '饿了么'}
                            </Tag>
                            {isBound ? (
                              <Tag size="small" color="cyan" className="shrink-0">
                                已下单待反馈
                              </Tag>
                            ) : (
                              <Tag size="small" color="amber" className="shrink-0">
                                待提交外卖单号
                              </Tag>
                            )}
                            {acc && accounts.length > 1 && (
                              <Tag size="small" color="grey" type="light" className="truncate max-w-[80px] shrink-0">
                                {acc.nickname}
                              </Tag>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-semi-color-text-2 flex-wrap">
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold font-mono">
                              返 ¥{order.rebate_money?.toFixed(2) || '0.00'}
                            </span>
                            <span>门槛 ¥{order.order_money}</span>
                            <Tag size="small" color={getConditionTagColor(order.condition)}>
                              {order.condition || '用餐反馈'}
                            </Tag>
                            {isBound && (
                              <span className="font-mono text-xs text-semi-color-text-1">
                                单号: {order.platform_order_id}
                              </span>
                            )}
                            {(() => {
                              const nowSec = Math.floor(Date.now() / 1000);
                              const remSec = order.timeout_time ? order.timeout_time - nowSec : null;
                              const remText = remSec !== null ? formatRemainingTime(remSec) : '';
                              if (!remText && !order.expire_time) return null;
                              return (
                                <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400 font-medium">
                                  <IconClock size="extra-small" />
                                  {remText ? remText : (order.expire_time ? `截止 ${order.expire_time.split(' ')[1] || order.expire_time}` : '')}
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                      {isBound ? (
                        <Tag
                          size="small"
                          color="cyan"
                          type="light"
                          className="shrink-0 text-xs font-medium !py-0.5"
                        >
                          待送达反馈
                        </Tag>
                      ) : (
                        <Tag
                          size="small"
                          color="amber"
                          type="light"
                          className="shrink-0 text-xs font-medium !py-0.5"
                        >
                          待APP填单
                        </Tag>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-semi-color-fill-0 border border-semi-color-border-subtle">
                <div className="flex items-center gap-2 min-w-0">
                  <IconCheckCircleStroked className="text-emerald-500 shrink-0" size="small" />
                  <div className="text-xs min-w-0">
                    <span className="text-semi-color-text-1 font-medium">当前无待处理工单</span>
                    <span className="text-semi-color-text-2 ml-1 hidden sm:inline">(官方限额 3 笔，抢单后请在小蚕APP回填外卖单号)</span>
                  </div>
                </div>
                <Button
                  theme="light"
                  type="primary"
                  size="small"
                  icon={<IconBolt />}
                  onClick={() => setActiveTab('store')}
                  className="shrink-0 text-xs"
                >
                  挑选霸王餐
                </Button>
              </div>
            )}

            <div className="pt-1.5 mt-auto shrink-0 border-t border-semi-color-border/60 flex items-center justify-between text-xs text-semi-color-text-2">
              <span className="flex items-center gap-1 text-semi-color-text-2">
                <IconAlertCircle size="extra-small" className="text-amber-500" />
                抢单后请在规定时限内前往小蚕APP完成下单并绑定单号
              </span>
              <span
                className="text-semi-color-primary cursor-pointer hover:underline"
                onClick={() => setActiveTab('orders')}
              >
                订单中心 ›
              </span>
            </div>
          </Card>

          {/* 下卡片：今日自动化守护与快捷中心 (一键打卡 + 核心待命节点，精炼降噪) */}
          <Card
            title={
              <div className="flex justify-between items-center w-full min-w-0 gap-2">
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="w-5 h-5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <IconBolt size="extra-small" />
                  </div>
                  <span className="font-bold text-base text-semi-color-text-0">
                    今日自动化守护
                  </span>
                  <Tag color="cyan" size="small" shape="circle" className="text-xs">
                    已开启 {enabledTaskCount} 项
                  </Tag>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Popconfirm
                    title="立即执行今日所有日常打卡？"
                    content="将依次执行：每日签到 + SVIP成长值膨胀金 + 社群转盘，打满今日全部收益。"
                    onConfirm={handleBatchRunAll}
                    okText="立即打卡"
                    cancelText="取消"
                  >
                    <Button
                      theme="solid"
                      type="primary"
                      size="small"
                      loading={batchAllLoading}
                      icon={<IconPlay />}
                      className="text-xs shrink-0 !py-0.5 !h-7 font-medium"
                    >
                      一键日常打卡
                    </Button>
                  </Popconfirm>
                  <Tooltip content="刷新自动化任务状态">
                    <Button
                      theme="borderless"
                      type="tertiary"
                      size="small"
                      icon={<IconRefresh spin={tasksLoading} />}
                      onClick={() => {
                        fetchAccountTasks(undefined);
                        api.getAppointments(currentAccountKey || undefined).then((res) => {
                          if (res.ok) setAppointments(res.appointments || []);
                        });
                      }}
                    />
                  </Tooltip>
                  <Button
                    theme="borderless"
                    type="primary"
                    size="small"
                    icon={<IconChevronRight />}
                    iconPosition="right"
                    onClick={() => setActiveTab('automation')}
                    className="text-xs !p-0 shrink-0"
                  >
                    配置
                  </Button>
                </div>
              </div>
            }
            className="gsap-card-item rounded-xl border border-semi-color-border shadow-xs flex-1 min-h-0 flex flex-col overflow-hidden"
            headerStyle={{ padding: '8px 12px', borderBottom: '1px solid var(--semi-color-border)' }}
            bodyStyle={{ padding: '8px 12px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', gap: '8px' }}
          >
            {/* 快速通道胶囊条 */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button
                onClick={() => setActiveTab('store')}
                className="px-2.5 py-1 rounded-md text-xs font-medium bg-semi-color-fill-0 hover:bg-semi-color-fill-1 text-semi-color-text-1 hover:text-semi-color-primary border border-semi-color-border/60 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <IconShoppingBag size="extra-small" />
                <span>霸王餐抢单捡漏</span>
                <IconChevronRight size="extra-small" />
              </button>
              <button
                onClick={() => setActiveTab('automation')}
                className="px-2.5 py-1 rounded-md text-xs font-medium bg-semi-color-fill-0 hover:bg-semi-color-fill-1 text-semi-color-text-1 hover:text-semi-color-primary border border-semi-color-border/60 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <IconActivity size="extra-small" />
                <span>美团同店双返利监控</span>
                <IconChevronRight size="extra-small" />
              </button>
              <button
                onClick={() => setActiveTab('automation')}
                className="px-2.5 py-1 rounded-md text-xs font-medium bg-semi-color-fill-0 hover:bg-semi-color-fill-1 text-semi-color-text-1 hover:text-semi-color-primary border border-semi-color-border/60 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <IconList size="extra-small" />
                <span>全部 15 项任务</span>
                <IconChevronRight size="extra-small" />
              </button>
            </div>

            {/* 今日核心待命节点列表 (精简提炼，告别平铺与重复按钮) */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-0.5 divide-y divide-semi-color-border/40">
              {highlightTasks.length > 0 ? (
                highlightTasks.map((t) => {
                  const isAppt = t.type === 'appointment';
                  const isRunning = runningTaskId === t.rawId;
                  return (
                    <div
                      key={t.id}
                      className="pt-1.5 first:pt-0 flex items-center justify-between gap-2 hover:bg-semi-color-fill-0/60 p-1.5 rounded-lg transition-colors group"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="w-7 h-7 rounded-lg bg-semi-color-fill-0 border border-semi-color-border-subtle flex items-center justify-center shrink-0">
                          {isAppt ? (
                            <Avatar
                              size="extra-small"
                              shape="square"
                              src={t.storeIcon || undefined}
                              color="orange"
                              className="rounded-md"
                            >
                              {t.label[0] || '店'}
                            </Avatar>
                          ) : (
                            <TaskIcon taskId={t.rawId || ''} size={20} className="w-5 h-5" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Tooltip content={isAppt ? `点击复制: ${cleanEmoji(t.label)}` : t.label} position="top" showArrow>
                              <span
                                className={`font-semibold text-sm text-semi-color-text-0 truncate max-w-[180px] ${isAppt ? 'cursor-pointer hover:text-semi-color-primary transition-colors' : ''}`}
                                onClick={() => {
                                  if (isAppt) {
                                    const sname = cleanEmoji(t.label);
                                    if (sname) {
                                      navigator.clipboard.writeText(sname);
                                      Toast.success(`已复制店铺名称: ${sname}`);
                                    }
                                  }
                                }}
                              >
                                {cleanEmoji(t.label)}
                              </span>
                            </Tooltip>
                            <Tag size="small" color={t.categoryColor} className="shrink-0">
                              {t.categoryLabel}
                            </Tag>
                            {t.vip && (
                              <Tag size="small" color="purple" type="light" className="shrink-0">
                                {t.vip}
                              </Tag>
                            )}
                            {t.platform && (
                              <Tag size="small" color={t.platform === 'meituan' ? 'amber' : 'blue'} className="shrink-0">
                                {t.platform === 'meituan' ? '美团' : '饿了么'}
                              </Tag>
                            )}
                          </div>

                          <div className="flex items-center gap-2 mt-1 text-xs text-semi-color-text-2 flex-wrap">
                            <span className="flex items-center gap-0.5">
                              <IconClock size="extra-small" />
                              {t.timeText}
                            </span>
                            {t.nextRunTime && (
                              <span className="text-semi-color-primary font-mono text-xs">
                                下次: {t.nextRunTime.split(' ')[1] || t.nextRunTime}
                              </span>
                            )}
                            {t.rebatePrice ? (
                              <span className="text-emerald-600 font-bold font-mono">
                                返 ¥{t.rebatePrice}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isAppt ? (
                          <div className="flex items-center gap-1">
                            <Tag size="small" color={t.statusColor}>
                              {t.statusText}
                            </Tag>
                            <Button
                              theme="borderless"
                              type="tertiary"
                              size="small"
                              icon={<IconChevronRight />}
                              onClick={() => setActiveTab('store')}
                              className="text-xs !p-0 shrink-0 text-semi-color-primary"
                            >
                              查看
                            </Button>
                          </div>
                        ) : (
                          <Button
                            theme="light"
                            type="tertiary"
                            size="small"
                            icon={<IconPlay />}
                            loading={isRunning}
                            onClick={() => t.rawId && handleRunTaskImmediately(t.rawId, t.label)}
                            className="text-xs !py-0.5 !h-6 hover:text-semi-color-primary"
                          >
                            测试执行
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="my-auto flex flex-col items-center justify-center text-center py-4">
                  <Empty
                    title="暂无待命任务"
                    description="请在自动化中心开启日常签到、红包雨或秒杀任务"
                    style={{ padding: '6px 0' }}
                  />
                  <Button
                    theme="light"
                    type="primary"
                    size="small"
                    icon={<IconBolt />}
                    className="mt-1"
                    onClick={() => setActiveTab('automation')}
                  >
                    配置自动化任务
                  </Button>
                </div>
              )}
            </div>

            {/* 卡片底栏 */}
            <div className="pt-1.5 mt-auto shrink-0 border-t border-semi-color-border/60 flex items-center justify-between text-xs text-semi-color-text-2">
              <span className="flex items-center gap-1">
                <IconActivity size="extra-small" className="text-semi-color-primary" />
                秒杀抢单提前 25 秒自动压枪 · 毫秒级时钟校准
              </span>
              <span
                className="text-semi-color-primary cursor-pointer hover:underline"
                onClick={() => setActiveTab('automation')}
              >
                全部 15 项任务 ›
              </span>
            </div>
          </Card>
        </div>

        {/* 右分栏：动态与消息中心 (整合为全高度单卡片，Tabs切换，彻底解决表格截断) */}
        <div className="lg:col-span-5 h-full min-h-0 flex flex-col overflow-hidden">
          <Card
            title={
              <div className="flex justify-between items-center w-full min-w-0 gap-2">
                {/* 模式切换切换器 */}
                <RadioGroup
                  type="button"
                  value={rightPanelTab}
                  onChange={(e) => setRightPanelTab(e.target.value as 'feed' | 'messages')}
                  className="shrink-0"
                >
                  <Radio value="feed">
                    <span className="text-xs font-medium">运行动态</span>
                    <Tag size="small" color="blue" shape="circle" className="ml-1 text-xs">
                      {recentLogs.length}
                    </Tag>
                  </Radio>
                  <Radio value="messages">
                    <span className="text-xs font-medium">官方消息</span>
                    {messagesUnreadTotal > 0 ? (
                      <Tag size="small" color="red" shape="circle" className="ml-1 text-xs font-bold">
                        {messagesUnreadTotal}
                      </Tag>
                    ) : (
                      <Tag size="small" color="grey" shape="circle" className="ml-1 text-xs">
                        0
                      </Tag>
                    )}
                  </Radio>
                </RadioGroup>

                {/* 右侧工具操作区 */}
                {rightPanelTab === 'feed' ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Select
                      value={logFilterAccount}
                      onChange={(v) => setLogFilterAccount(String(v))}
                      size="small"
                      style={{ width: 108 }}
                      renderSelectedItem={(optionNode: any) => {
                        const val = optionNode?.value;
                        if (!val || val === 'all') {
                          return <span className="text-xs">全部账号</span>;
                        }
                        const acc = accounts.find((a) => a.key === val);
                        return <span className="text-xs truncate">{acc?.nickname || val}</span>;
                      }}
                    >
                      <Select.Option value="all">
                        <span className="text-xs font-medium">全部账号</span>
                      </Select.Option>
                      {accounts.map((a) => (
                        <Select.Option key={a.key} value={a.key}>
                          <div className="flex items-center gap-1.5 py-0.5">
                            <Avatar size="extra-extra-small" src={a.avatar || undefined} color="orange">
                              {a.nickname?.[0] || '蚕'}
                            </Avatar>
                            <span className="text-xs truncate flex-1">{a.nickname}</span>
                          </div>
                        </Select.Option>
                      ))}
                    </Select>
                    <Tooltip content="刷新动态流水">
                      <Button
                        theme="borderless"
                        type="tertiary"
                        size="small"
                        icon={<IconRefresh spin={logsLoading} />}
                        onClick={() => fetchRecentLogs(logFilterAccount)}
                      />
                    </Tooltip>
                    <Button
                      theme="borderless"
                      type="tertiary"
                      size="small"
                      icon={<IconChevronRight />}
                      iconPosition="right"
                      onClick={() => setActiveTab('logs')}
                      className="text-xs !p-0 shrink-0"
                    >
                      完整日志
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 shrink-0">
                    <Tooltip content="弹出消息提醒">
                      <Button
                        theme="light"
                        type="secondary"
                        size="small"
                        icon={<IconBell />}
                        onClick={handleNotifyAllUnread}
                        className="text-xs !px-1.5 !h-6"
                      >
                        提醒
                      </Button>
                    </Tooltip>
                    <Popconfirm
                      title="确认全部标记已读？"
                      content="将向小蚕官方服务器同步将当前账号的所有未读通知标记为已读"
                      onConfirm={handleMarkAllRead}
                      okText="确定"
                      cancelText="取消"
                    >
                      <Button
                        theme="borderless"
                        type="tertiary"
                        size="small"
                        icon={<IconTick />}
                        disabled={messagesUnreadTotal === 0}
                        loading={markingRead}
                        className="text-xs !px-1.5 !h-6"
                      >
                        已读
                      </Button>
                    </Popconfirm>
                    <Tooltip content="刷新小蚕消息">
                      <Button
                        theme="borderless"
                        type="tertiary"
                        size="small"
                        icon={<IconRefresh spin={messagesLoading} />}
                        onClick={() => fetchMessages(selectedChannelId)}
                      />
                    </Tooltip>
                  </div>
                )}
              </div>
            }
            className="gsap-card-item rounded-xl border border-semi-color-border shadow-xs flex-1 min-h-0 flex flex-col overflow-hidden"
            headerStyle={{ padding: '8px 12px', borderBottom: '1px solid var(--semi-color-border)' }}
            bodyStyle={{ padding: 0, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          >
            {/* 内容区：根据选中的 Tab 呈现 */}
            {rightPanelTab === 'feed' ? (
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                {/* 动态流水列表 (取代原窄表格，以 Feed 流舒展呈现) */}
                <div className="flex-1 min-h-0 overflow-y-auto space-y-1 p-2">
                  {recentLogs.length > 0 ? (
                    recentLogs.map((log) => {
                      const acc = accounts.find((a) => a.key === log.account_key);
                      const summary = getLogSummary(log.output);
                      const taskTitle = TASK_LABELS[log.task_id] || log.task_id;
                      return (
                        <div
                          key={log.id}
                          onClick={() => setActiveLogModal(log)}
                          className="p-2 rounded-lg border border-semi-color-border/60 hover:border-semi-color-primary-light-active bg-semi-color-fill-0/30 hover:bg-semi-color-fill-0 transition-all cursor-pointer group"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-mono text-xs text-semi-color-text-2 shrink-0">
                                {log.created_at?.split(' ')[1] || log.created_at}
                              </span>
                              <div className="w-4 h-4 rounded bg-semi-color-fill-0 flex items-center justify-center shrink-0">
                                <TaskIcon taskId={log.task_id} className="w-3.5 h-3.5" />
                              </div>
                              <span className="font-bold text-sm text-semi-color-text-0 truncate max-w-[140px]">
                                {taskTitle}
                              </span>
                              {acc && (
                                <Tag size="small" color="grey" type="light" className="shrink-0 truncate max-w-[80px]">
                                  {acc.nickname}
                                </Tag>
                              )}
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {log.status === 'running' ? (
                                <Tag color="cyan" prefixIcon={<IconSpin spin />} size="small">
                                  进行中
                                </Tag>
                              ) : log.status === 'success' ? (
                                <Tag color="green" prefixIcon={<IconCheckCircleStroked />} size="small">
                                  成功
                                </Tag>
                              ) : (
                                <Tag color="red" prefixIcon={<IconAlertCircle />} size="small">
                                  异常
                                </Tag>
                              )}
                              <IconChevronRight size="extra-small" className="text-semi-color-text-3 group-hover:text-semi-color-primary transition-colors" />
                            </div>
                          </div>

                          <div className="mt-1.5 text-xs text-semi-color-text-1 group-hover:text-semi-color-text-0 transition-colors line-clamp-1 break-all">
                            {summary}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-8 flex flex-col items-center justify-center">
                      <Empty
                        title="暂无执行流水"
                        description="后台任务或秒杀压枪执行后，调度日志将实时流式呈现在此"
                      />
                    </div>
                  )}
                </div>

                {/* 动态底栏 */}
                <div className="shrink-0 pt-1.5 pb-1 px-3 mt-auto border-t border-semi-color-border/60 flex justify-between items-center text-xs text-semi-color-text-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    <span>调度就绪 · 点击任一流水可查阅完整执行控制台</span>
                  </div>
                  <span
                    className="text-semi-color-primary cursor-pointer hover:underline"
                    onClick={() => setActiveTab('logs')}
                  >
                    全部流水 ›
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                {/* 频道切换过滤 */}
                <div className="p-2 pb-0 flex items-center gap-1 shrink-0 overflow-x-auto">
                  <RadioGroup
                    type="button"
                    value={selectedChannelId}
                    onChange={(e) => {
                      const cid = Number(e.target.value);
                      setSelectedChannelId(cid);
                      fetchMessages(cid);
                    }}
                  >
                    <Radio value={0}>
                      <span className="text-xs">全部</span>
                    </Radio>
                    {[1, 2, 3, 4].map((cid) => {
                      const cMeta = CHANNEL_META[cid];
                      const ch = messageChannels.find((c) => c.channel_id === cid);
                      const unread = ch?.unread ?? 0;
                      return (
                        <Radio key={cid} value={cid}>
                          <span className="text-xs">{cMeta.name}</span>
                          {unread > 0 && (
                            <span className="ml-0.5 text-xs text-red-500 font-bold">
                              ({unread})
                            </span>
                          )}
                        </Radio>
                      );
                    })}
                  </RadioGroup>
                </div>

                {/* 消息列表 */}
                <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 p-2">
                  {messagesLoading && messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-semi-color-text-2 gap-2 py-8">
                      <Spin size="middle" />
                      <span className="text-xs">拉取小蚕官方通知...</span>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="py-8">
                      <Empty
                        title="暂无通知消息"
                        description="小蚕订单审核与系统公告将实时在此呈现"
                      />
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const meta = CHANNEL_META[msg.channel_id] || {
                        name: '通知',
                        color: 'grey' as const,
                        icon: <IconBell size="small" />,
                      };
                      const isUnread = Boolean(msg.unread && msg.unread > 0);
                      return (
                        <div
                          key={msg.message_id}
                          onClick={() => handleSelectMessage(msg)}
                          className={`p-2 rounded-lg border transition-all cursor-pointer flex items-start gap-2.5 ${
                            isUnread
                              ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/50 hover:border-blue-400'
                              : 'bg-semi-color-fill-0/40 border-semi-color-border/60 hover:bg-semi-color-fill-0 hover:border-semi-color-border'
                          }`}
                        >
                          <div className="relative shrink-0 mt-0.5">
                            {msg.icon_res ? (
                              <Avatar
                                size="small"
                                shape="square"
                                src={msg.icon_res}
                                className="rounded-md border border-semi-color-border/80 shadow-2xs"
                              />
                            ) : (
                              <Avatar
                                size="small"
                                shape="circle"
                                style={{
                                  backgroundColor:
                                    msg.channel_id === 1
                                      ? 'var(--semi-color-primary-light-default)'
                                      : msg.channel_id === 2
                                      ? 'rgba(52, 199, 89, 0.15)'
                                      : msg.channel_id === 3
                                      ? 'rgba(255, 149, 0, 0.15)'
                                      : 'rgba(175, 82, 222, 0.15)',
                                  color:
                                    msg.channel_id === 1
                                      ? 'var(--semi-color-primary)'
                                      : msg.channel_id === 2
                                      ? '#34c759'
                                      : msg.channel_id === 3
                                      ? '#ff9500'
                                      : '#af52de',
                                }}
                              >
                                {meta.icon}
                              </Avatar>
                            )}
                            {isUnread && (
                              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 w-full">
                              <Tag color={meta.color} size="small" shape="square" className="shrink-0">
                                {meta.name}
                              </Tag>
                              {msg.object_name && (
                                <Tooltip content={msg.object_name}>
                                  <Tag color="teal" size="small" className="truncate max-w-[120px] shrink-0">
                                    {msg.object_name}
                                  </Tag>
                                </Tooltip>
                              )}
                              <span className={`text-sm truncate ${isUnread ? 'text-semi-color-text-0 font-semibold' : 'text-semi-color-text-1 font-medium'}`}>
                                {msg.title}
                              </span>
                              <span className="ml-auto text-xs font-mono text-semi-color-text-2 shrink-0">
                                {formatMsgTime(msg.create_time)}
                              </span>
                            </div>
                            <p className="text-xs text-semi-color-text-2 line-clamp-2 leading-relaxed mt-1 select-text">
                              {msg.content}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* 消息底栏 */}
                <div className="shrink-0 pt-1.5 pb-1 px-3 mt-auto border-t border-semi-color-border/60 flex justify-between items-center text-xs text-semi-color-text-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    <span>直连 SilkwormMessageCenter 微服务</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span>未读: {messagesUnreadTotal} 条</span>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>



      {/* 日志输出查看详情弹窗 */}
      <Modal
        visible={Boolean(activeLogModal)}
        title={
          <div className="flex items-center gap-2">
            {activeLogModal?.task_id && <TaskIcon taskId={activeLogModal.task_id} className="w-5 h-5 shrink-0" />}
            <span className="truncate">
              任务执行详情 [{TASK_LABELS[activeLogModal?.task_id || ''] || activeLogModal?.task_id}]
            </span>
          </div>
        }
        onCancel={() => setActiveLogModal(null)}
        footer={
          <div className="flex justify-between items-center w-full">
            <Button
              theme="light"
              type="tertiary"
              size="small"
              icon={<IconCopy />}
              onClick={() => handleCopy(activeLogModal?.output || '', '任务日志')}
            >
              复制全部日志
            </Button>
            <Button
              theme="solid"
              type="primary"
              onClick={() => setActiveLogModal(null)}
            >
              关闭
            </Button>
          </div>
        }
        width={620}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 bg-semi-color-fill-0 rounded-lg border border-semi-color-border text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-semi-color-text-2 shrink-0">执行账号:</span>
              <Avatar
                size="extra-extra-small"
                src={accounts.find((a) => a.key === activeLogModal?.account_key)?.avatar || undefined}
                color="orange"
                className="shrink-0"
              >
                {accounts.find((a) => a.key === activeLogModal?.account_key)?.nickname?.[0] || '蚕'}
              </Avatar>
              <span className="font-medium text-semi-color-text-0 truncate">
                {accounts.find((a) => a.key === activeLogModal?.account_key)?.nickname || activeLogModal?.account_key || '默认'}
              </span>
            </div>
            <div>
              <span className="text-semi-color-text-2">调度时间: </span>
              <span className="font-mono text-semi-color-text-1">{activeLogModal?.created_at}</span>
            </div>
            <div>
              <span className="text-semi-color-text-2">执行状态: </span>
              <Tag
                color={
                  activeLogModal?.status === 'success'
                    ? 'green'
                    : activeLogModal?.status === 'running'
                    ? 'cyan'
                    : 'red'
                }
                size="small"
              >
                {activeLogModal?.status === 'success'
                  ? '执行成功'
                  : activeLogModal?.status === 'running'
                  ? '正在执行'
                  : '执行异常'}
              </Tag>
            </div>
          </div>
          <div className="bg-semi-color-fill-0 p-3.5 rounded-lg border border-semi-color-border font-mono text-xs max-h-80 overflow-y-auto whitespace-pre-wrap leading-relaxed text-semi-color-text-1 select-text">
            {activeLogModal?.output || '暂无输出信息'}
          </div>
        </div>
      </Modal>

      {/* 消息通知详情弹窗 */}
      <Modal
        visible={Boolean(activeMessageModal)}
        title={
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-semi-color-fill-0 flex items-center justify-center shrink-0">
              {activeMessageModal?.channel_id && (CHANNEL_META[activeMessageModal.channel_id]?.icon || <IconBell size="small" />)}
            </div>
            <span className="truncate">
              {activeMessageModal?.title || '消息通知详情'}
            </span>
            {activeMessageModal?.channel_id && (
              <Tag color={CHANNEL_META[activeMessageModal.channel_id]?.color || 'grey'} size="small">
                {CHANNEL_META[activeMessageModal.channel_id]?.name || '通知'}
              </Tag>
            )}
          </div>
        }
        onCancel={() => setActiveMessageModal(null)}
        footer={
          <div className="flex justify-between items-center w-full">
            <div className="flex items-center gap-2">
              <Button
                theme="light"
                type="tertiary"
                size="small"
                icon={<IconCopy />}
                onClick={() => handleCopy(activeMessageModal?.content || '', '通知内容')}
              >
                复制内容
              </Button>
              <Button
                theme="light"
                type="secondary"
                size="small"
                icon={<IconBell />}
                onClick={() => {
                  if (activeMessageModal) {
                    Notification.info({
                      title: activeMessageModal.title,
                      content: activeMessageModal.content,
                      duration: 5,
                    });
                    Toast.success('已通过 Semi Design 通知组件弹出提醒');
                  }
                }}
              >
                通知弹窗
              </Button>
            </div>
            <Button
              theme="solid"
              type="primary"
              onClick={() => setActiveMessageModal(null)}
            >
              我知道了
            </Button>
          </div>
        }
        width={540}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-semi-color-fill-0 rounded-lg border border-semi-color-border text-xs">
            <div>
              <span className="text-semi-color-text-2">发送时间: </span>
              <span className="font-mono text-semi-color-text-1">
                {formatMsgTime(activeMessageModal?.create_time)}
              </span>
            </div>
            {activeMessageModal?.object_name && (
              <div className="truncate">
                <span className="text-semi-color-text-2">关联商户: </span>
                <span className="font-medium text-semi-color-text-0">
                  {activeMessageModal.object_name}
                </span>
              </div>
            )}
          </div>
          <div className="bg-semi-color-fill-0 p-3.5 rounded-lg border border-semi-color-border text-xs leading-relaxed text-semi-color-text-1 select-text whitespace-pre-wrap">
            {activeMessageModal?.content || '暂无详细内容'}
          </div>
        </div>
      </Modal>
    </div>
  );
};
