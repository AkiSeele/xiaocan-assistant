import React, { useEffect, useState, useRef } from 'react';
import {
  Card,
  Row,
  Col,
  Typography,
  Tag,
  Button,
  Space,
  Table,
  Empty,
  Tooltip,
  Avatar,
  Popconfirm,
  Modal,
  Notification,
  Toast,
  Spin
} from '@douyinfe/semi-ui';
import {
  IconPlay,
  IconShoppingBag,
  IconCheckCircleStroked,
  IconArrowRight,
  IconCalendar,
  IconGift,
  IconPriceTag,
  IconCopy,
  IconHelpCircle,
  IconActivity
} from '@douyinfe/semi-icons';
import { useAppStore } from '../store/useAppStore';
import { api } from '../api';
import { useGSAP, animateStaggerEnter, gsap } from '../utils/animations';
import type { JobLog, StoreAppointment, OrderStats, DashboardChartData } from '../types';

const { Text } = Typography;

export const Dashboard: React.FC = () => {
  const { accounts, currentAccountKey, setActiveTab } = useAppStore();
  const dashboardRef = useRef<HTMLDivElement>(null);

  // 核心业务数据状态
  const [recentLogs, setRecentLogs] = useState<JobLog[]>([]);
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
  const [dailySignLoading, setDailySignLoading] = useState<boolean>(false);
  const [vipExpandLoading, setVipExpandLoading] = useState<boolean>(false);
  const [lotteryLoading, setLotteryLoading] = useState<boolean>(false);
  const [batchAllLoading, setBatchAllLoading] = useState<boolean>(false);

  // 日志详情模态框
  const [activeLogModal, setActiveLogModal] = useState<JobLog | null>(null);

  const lastDashboardSignatureRef = useRef<string>('');
  const inFlightDashboardRef = useRef<boolean>(false);

  // 核心数据拉取
  const loadDashboardData = async (force = false) => {
    const effectiveKey = currentAccountKey || (accounts[0]?.key ?? '');
    const signature = `dashboard_${effectiveKey}`;
    if (!force && lastDashboardSignatureRef.current === signature) {
      return;
    }
    if (inFlightDashboardRef.current) return;
    inFlightDashboardRef.current = true;
    lastDashboardSignatureRef.current = signature;

    setLoading(true);
    try {
      const [jobsRes, apptsRes, statsRes, chartRes, tasksRes] = await Promise.all([
        api.getJobs(effectiveKey || undefined, 6),
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
        const enabled = tasksRes.tasks.filter((t: any) => t.enabled).length;
        setEnabledTaskCount(enabled);
        setTotalTaskCount(tasksRes.tasks.length);
      }
    } catch (e) {
      // 捕获异常
    } finally {
      inFlightDashboardRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [currentAccountKey, accounts.length]);

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

  // 1. 快捷日常签到
  const handleDailySign = async () => {
    if (!currentAccountKey) {
      Toast.warning('请先绑定并选择主控小蚕账号');
      return;
    }
    setDailySignLoading(true);
    try {
      const res = await api.runTaskNow(currentAccountKey, 'daily');
      if (res.ok) {
        Notification.success({
          title: '每日签到打卡成功',
          content: res.output?.split('\n')[1] || '已成功获取今日签到与积分奖励！',
          duration: 4,
        });
        loadDashboardData(true);
      } else {
        Toast.error(res.output || '签到执行异常');
      }
    } catch (e: any) {
      Toast.error(`签到失败: ${e.message || e}`);
    } finally {
      setDailySignLoading(false);
    }
  };

  // 2. 快捷会员膨胀金打卡
  const handleVipExpand = async () => {
    if (!currentAccountKey) {
      Toast.warning('请先绑定并选择主控小蚕账号');
      return;
    }
    setVipExpandLoading(true);
    try {
      const res = await api.runTaskNow(currentAccountKey, 'vip_expand');
      if (res.ok) {
        Notification.success({
          title: '会员成长打卡成功',
          content: res.output?.split('\n')[1] || '已成功获取今日SVIP会员成长值与膨胀金！',
          duration: 4,
        });
        loadDashboardData(true);
      } else {
        Toast.error(res.output || '会员打卡异常');
      }
    } catch (e: any) {
      Toast.error(`会员打卡失败: ${e.message || e}`);
    } finally {
      setVipExpandLoading(false);
    }
  };

  // 3. 快捷元宝抽奖
  const handleLotterySpin = async () => {
    if (!currentAccountKey) {
      Toast.warning('请先绑定并选择主控小蚕账号');
      return;
    }
    setLotteryLoading(true);
    try {
      const res = await api.runTaskNow(currentAccountKey, 'yb_lottery');
      if (res.ok) {
        Notification.success({
          title: '元宝转盘抽奖完成',
          content: res.output?.split('\n')[1] || '已完成一次元宝转盘抽大奖！',
          duration: 4,
        });
        loadDashboardData(true);
      } else {
        Toast.error(res.output || '转盘抽奖异常');
      }
    } catch (e: any) {
      Toast.error(`抽奖失败: ${e.message || e}`);
    } finally {
      setLotteryLoading(false);
    }
  };

  // 4. 一键执行全部日常任务 (串行合辑)
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

  const logColumns = [
    {
      title: '调度时间',
      dataIndex: 'created_at',
      width: 160,
      render: (t: string) => (
        <Text size="small" type="tertiary" className="font-mono">
          {t?.split(' ')[1] || t}
        </Text>
      ),
    },
    {
      title: '任务名称',
      dataIndex: 'task_id',
      width: 140,
      render: (tid: string) => {
        const colorMap: Record<string, 'blue' | 'purple' | 'amber' | 'green' | 'cyan'> = {
          daily: 'blue',
          vip_expand: 'amber',
          yb_lottery: 'purple',
          brand_flash: 'green',
          svip_rebate: 'cyan',
        };
        return <Tag color={colorMap[tid] || 'grey'}>{tid}</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (st: string) => (
        <Tag color={st === 'success' ? 'green' : 'red'}>
          {st === 'success' ? '执行成功' : '存在异常'}
        </Tag>
      ),
    },
    {
      title: '输出摘要',
      dataIndex: 'output',
      render: (txt: string, record: JobLog) => (
        <div
          className="cursor-pointer group flex items-center gap-1.5"
          onClick={() => setActiveLogModal(record)}
        >
          <Text
            ellipsis={{ showTooltip: true }}
            className="group-hover:text-semi-color-primary transition-colors text-xs"
            style={{ maxWidth: 300 }}
          >
            {txt?.split('\n')[0] || '—'}
          </Text>
          <IconArrowRight size="extra-small" className="opacity-0 group-hover:opacity-100 transition-opacity text-semi-color-primary" />
        </div>
      ),
    },
    {
      title: '操作',
      width: 70,
      render: (_: any, record: JobLog) => (
        <Tooltip content="复制输出详情">
          <Button
            theme="borderless"
            size="small"
            icon={<IconCopy />}
            onClick={() => handleCopy(record.output, '任务日志')}
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <div ref={dashboardRef} className="w-full space-y-4">
      {/* 顶部主控账号概览 Card */}
      <div className="gsap-card-item bg-gradient-to-r from-semi-color-bg-1 via-semi-color-bg-1 to-blue-50/20 dark:from-semi-color-bg-1 dark:via-semi-color-bg-1 dark:to-blue-950/20 border border-semi-color-border/90 rounded-2xl p-4 sm:p-5 shadow-xs hover:border-semi-color-primary-light-active transition-colors duration-200 will-change-[transform,opacity] flex items-center justify-between">
        {/* 当前主控账号实时状态 */}
        <div className="flex items-center gap-4 min-w-0">
          <div className="relative group cursor-pointer shrink-0">
            <Avatar
              size="large"
              src={currentAccount?.avatar || undefined}
              color="orange"
              className="ring-2 ring-semi-color-primary/30 group-hover:ring-semi-color-primary group-hover:scale-105 transition-all duration-300 shadow-sm"
            >
              {currentAccount?.nickname?.[0] || '蚕'}
            </Avatar>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-gray-900 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-bold text-base sm:text-lg text-semi-color-text-0 truncate max-w-[260px]">
                {currentAccount?.nickname || '未选择主控账号'}
              </span>
              <Tag
                color={currentAccount?.is_plus ? 'amber' : 'blue'}
                size="small"
                shape="square"
                className="font-semibold shadow-2xs"
              >
                {currentAccount?.is_plus
                  ? `SVIP${currentAccount?.vip_level || 5}`
                  : `VIP${currentAccount?.vip_level || 1}`}
              </Tag>
            </div>
            <div className="flex items-center gap-3 text-xs text-semi-color-text-2 mt-1.5 flex-wrap">
              {currentAccount?.phone && (
                <span className="bg-semi-color-fill-0 px-2 py-0.5 rounded-md border border-semi-color-border-subtle">
                  手机: <span className="font-mono">{currentAccount.phone}</span>
                </span>
              )}
              {Boolean(currentAccount?.vip_score) && (
                <Tooltip content="小蚕官方会员成长值，决定每日膨胀金档位与返利倍率">
                  <span className="cursor-help bg-semi-color-fill-0 px-2 py-0.5 rounded-md border border-semi-color-border-subtle text-semi-color-primary flex items-center gap-1 hover:border-semi-color-primary/40 transition-colors">
                    成长值: <span className="font-mono">{(currentAccount?.vip_score || 0).toLocaleString()}</span> 分
                    <IconHelpCircle size="extra-small" />
                  </span>
                </Tooltip>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4 大核心资产 Bento 卡片 (严格遵循 Semi Design 规范与克制微动效) */}
      <Row gutter={[14, 14]}>
        {/* 1. 累计到账返现 */}
        <Col xs={24} sm={12} xl={6}>
          <div
            onMouseEnter={handleBentoEnter}
            onMouseLeave={handleBentoLeave}
            onClick={() => setActiveTab('orders')}
            className="h-full cursor-pointer will-change-transform"
          >
            <Card
              shadows="hover"
              className="gsap-card-item rounded-xl border border-semi-color-border hover:border-semi-color-primary-light-active transition-colors duration-200 select-none h-full"
              bodyStyle={{ padding: '16px 18px' }}
            >
              <div className="flex justify-between items-start">
                <Space align="center" spacing="tight">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <IconCheckCircleStroked size="default" />
                  </div>
                  <Text type="secondary" size="small" className="font-medium">累计到账返现</Text>
                </Space>
                <Tooltip content="已成功核销并结算入账的霸王餐总返利">
                  <IconHelpCircle size="small" className="text-semi-color-text-3 cursor-pointer hover:text-semi-color-text-1 transition-colors" />
                </Tooltip>
              </div>
              <div className="flex items-baseline gap-1 my-2">
                <span className="text-xs font-semibold text-semi-color-text-2">¥</span>
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
        <Col xs={24} sm={12} xl={6}>
          <div
            onMouseEnter={handleBentoEnter}
            onMouseLeave={handleBentoLeave}
            onClick={() => setActiveTab('orders')}
            className="h-full cursor-pointer will-change-transform"
          >
            <Card
              shadows="hover"
              className="gsap-card-item rounded-xl border border-semi-color-border hover:border-semi-color-primary-light-active transition-colors duration-200 select-none h-full"
              bodyStyle={{ padding: '16px 18px' }}
            >
              <div className="flex justify-between items-start">
                <Space align="center" spacing="tight">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <IconPriceTag size="default" />
                  </div>
                  <Text type="secondary" size="small" className="font-medium">在途/待入账返现</Text>
                </Space>
                <Tooltip content="已提交外卖单号，正由小蚕与商家审核中的返利金额">
                  <IconHelpCircle size="small" className="text-semi-color-text-3 cursor-pointer hover:text-semi-color-text-1 transition-colors" />
                </Tooltip>
              </div>
              <div className="flex items-baseline gap-1 my-2">
                <span className="text-xs font-semibold text-semi-color-text-2">¥</span>
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
        <Col xs={24} sm={12} xl={6}>
          <div
            onMouseEnter={handleBentoEnter}
            onMouseLeave={handleBentoLeave}
            onClick={() => setActiveTab('orders')}
            className="h-full cursor-pointer will-change-transform"
          >
            <Card
              shadows="hover"
              className="gsap-card-item rounded-xl border border-semi-color-border hover:border-semi-color-primary-light-active transition-colors duration-200 select-none h-full"
              bodyStyle={{ padding: '16px 18px' }}
            >
              <div className="flex justify-between items-start">
                <Space align="center" spacing="tight">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <IconShoppingBag size="default" />
                  </div>
                  <Text type="secondary" size="small" className="font-medium">今日已省外卖费</Text>
                </Space>
                <Tooltip content="今日已实际核销到账的霸王餐返现总额（在途订单待核销后自动计入）">
                  <IconHelpCircle size="small" className="text-semi-color-text-3 cursor-pointer hover:text-semi-color-text-1 transition-colors" />
                </Tooltip>
              </div>
              <div className="flex items-baseline gap-1 my-2">
                <span className="text-xs font-semibold text-semi-color-text-2">¥</span>
                <span className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-semi-color-text-0">
                  {(chartData?.today_summary?.today_savings || 0).toFixed(2)}
                </span>
              </div>
              <Text type="tertiary" size="small" className="text-xs block truncate">
                今日到账 <span className="text-semi-color-text-1 font-medium">{chartData?.today_summary?.today_completed_orders ?? (chartData?.today_summary?.today_orders || 0)}</span> 笔
                {(chartData?.today_summary?.today_pending_orders ?? 0) > 0 && (
                  <span> · 在途 <span className="text-semi-color-text-1 font-medium">{chartData?.today_summary?.today_pending_orders}</span> 笔</span>
                )}
              </Text>
            </Card>
          </div>
        </Col>

        {/* 4. 自动化任务调度 */}
        <Col xs={24} sm={12} xl={6}>
          <div
            onMouseEnter={handleBentoEnter}
            onMouseLeave={handleBentoLeave}
            onClick={() => setActiveTab('automation')}
            className="h-full cursor-pointer will-change-transform"
          >
            <Card
              shadows="hover"
              className="gsap-card-item rounded-xl border border-semi-color-border hover:border-semi-color-primary-light-active transition-colors duration-200 select-none h-full"
              bodyStyle={{ padding: '16px 18px' }}
            >
              <div className="flex justify-between items-start">
                <Space align="center" spacing="tight">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                    <IconPlay size="default" />
                  </div>
                  <Text type="secondary" size="small" className="font-medium">自动化任务调度</Text>
                </Space>
                <Tooltip content="APScheduler 毫秒级调度中心正全天候监听的定时任务项">
                  <IconActivity size="small" className="text-purple-500 cursor-pointer" />
                </Tooltip>
              </div>
              <div className="flex items-baseline gap-1.5 my-2">
                <span className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-semi-color-text-0">
                  {enabledTaskCount}
                </span>
                <span className="text-xs font-medium text-semi-color-text-2">/ {totalTaskCount} 项开启</span>
              </div>
              <Text type="tertiary" size="small" className="text-xs flex items-center gap-1.5 truncate">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0"></span>
                <span className="truncate">
                  {enabledTaskCount > 0 ? '定时秒杀就绪' : '任务待开启'}
                  {appointments.length > 0 ? ` · ${appointments.length}家店铺盯单` : ''}
                </span>
              </Text>
            </Card>
          </div>
        </Col>
      </Row>

      {/* 快捷工作流操作网格 (对齐牛马助手工作台 + 小蚕省心版极速打卡) */}
      <Row gutter={[14, 14]}>
        <Col xs={24} xl={10}>
          <Card
            title={
              <div className="flex justify-between items-center w-full">
                <span className="font-bold text-base text-semi-color-text-0">
                  快捷自动化工作台
                </span>
                <Tag color="cyan" size="small">极速执行</Tag>
              </div>
            }
            className="gsap-card-item rounded-xl border border-semi-color-border h-full shadow-xs"
            headerStyle={{ padding: '14px 18px', borderBottom: '1px solid var(--semi-color-border)' }}
            bodyStyle={{ padding: 18 }}
          >
            <div className="space-y-3.5">
              {/* 一键全流程执行 (突出主按钮) */}
              <Popconfirm
                title="立即执行当前账号全部日常任务？"
                content="将立即串行打卡：每日签到 + SVIP成长值膨胀金 + 元宝抽奖，打满今日上限。"
                onConfirm={handleBatchRunAll}
                okText="立即打卡"
                cancelText="稍后再说"
              >
                <Button
                  block
                  theme="solid"
                  type="primary"
                  size="large"
                  loading={batchAllLoading}
                  icon={<IconPlay />}
                  className="h-12 rounded-xl justify-between px-4 font-bold shadow-xs bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-500 hover:via-indigo-500 hover:to-violet-500 text-white border-0 transition-all duration-300 hover:shadow-md hover:shadow-indigo-500/25 active:scale-[0.99]"
                >
                  <span className="tracking-wide">一键完成今日所有日常打卡</span>
                  <span className="text-xs font-normal opacity-90 px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-xs">
                    签到+膨胀+抽奖 ›
                  </span>
                </Button>
              </Popconfirm>

              {/* 单项快捷操作 Bento 按钮 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <Tooltip content="每日乐园签到打卡，自动领取元宝与打卡奖励">
                  <div
                    onClick={!dailySignLoading ? handleDailySign : undefined}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border border-semi-color-border bg-semi-color-fill-0 hover:bg-semi-color-bg-0 hover:border-emerald-500/50 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group select-none ${
                      dailySignLoading ? 'opacity-60 pointer-events-none' : ''
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-1.5 group-hover:scale-110 group-hover:bg-emerald-500/20 transition-all">
                      {dailySignLoading ? <Spin size="small" /> : <IconCalendar size="default" />}
                    </div>
                    <span className="text-xs font-semibold text-semi-color-text-0 group-hover:text-emerald-600 transition-colors">每日签到</span>
                    <span className="text-[10px] text-semi-color-text-2 mt-0.5">领元宝积分</span>
                  </div>
                </Tooltip>

                <Tooltip content="领取SVIP会员每日成长值与红包膨胀助力金">
                  <div
                    onClick={!vipExpandLoading ? handleVipExpand : undefined}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border border-semi-color-border bg-semi-color-fill-0 hover:bg-semi-color-bg-0 hover:border-indigo-500/50 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group select-none ${
                      vipExpandLoading ? 'opacity-60 pointer-events-none' : ''
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-1.5 group-hover:scale-110 group-hover:bg-indigo-500/20 transition-all">
                      {vipExpandLoading ? <Spin size="small" /> : <IconCheckCircleStroked size="default" />}
                    </div>
                    <span className="text-xs font-semibold text-semi-color-text-0 group-hover:text-indigo-600 transition-colors">成长值膨胀</span>
                    <span className="text-[10px] text-semi-color-text-2 mt-0.5">领膨胀金</span>
                  </div>
                </Tooltip>

                <Tooltip content="参与元宝幸运转盘抽奖，打满每日抽奖额度">
                  <div
                    onClick={!lotteryLoading ? handleLotterySpin : undefined}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border border-semi-color-border bg-semi-color-fill-0 hover:bg-semi-color-bg-0 hover:border-amber-500/50 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group select-none ${
                      lotteryLoading ? 'opacity-60 pointer-events-none' : ''
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-1.5 group-hover:scale-110 group-hover:bg-amber-500/20 transition-all">
                      {lotteryLoading ? <Spin size="small" /> : <IconGift size="default" />}
                    </div>
                    <span className="text-xs font-semibold text-semi-color-text-0 group-hover:text-amber-600 transition-colors">幸运转盘</span>
                    <span className="text-[10px] text-semi-color-text-2 mt-0.5">元宝抽大奖</span>
                  </div>
                </Tooltip>
              </div>

              {/* 快捷跳转导航 */}
              <div className="pt-2 border-t border-semi-color-border flex gap-2">
                <Button
                  block
                  theme="borderless"
                  type="tertiary"
                  size="small"
                  onClick={() => setActiveTab('automation')}
                  className="text-xs text-semi-color-text-2 hover:text-semi-color-primary justify-center"
                >
                  配置秒杀与提前量参数 ›
                </Button>
                <Button
                  block
                  theme="borderless"
                  type="tertiary"
                  size="small"
                  onClick={() => setActiveTab('orders')}
                  className="text-xs text-semi-color-text-2 hover:text-semi-color-primary justify-center"
                >
                  管理霸王餐外卖订单 ›
                </Button>
              </div>
            </div>
          </Card>
        </Col>

        {/* 最近执行流水与监控 */}
        <Col xs={24} xl={14}>
          <Card
            title={
              <div className="flex justify-between items-center w-full">
                <span className="font-bold text-base text-semi-color-text-0">
                  最近自动化执行流水
                </span>
                <Button
                  theme="borderless"
                  type="tertiary"
                  size="small"
                  icon={<IconArrowRight />}
                  onClick={() => setActiveTab('logs')}
                >
                  完整日志
                </Button>
              </div>
            }
            className="gsap-card-item rounded-xl border border-semi-color-border shadow-xs"
            headerStyle={{ padding: '14px 18px', borderBottom: '1px solid var(--semi-color-border)' }}
            bodyStyle={{ padding: 0 }}
          >
            <Table
              columns={logColumns}
              dataSource={recentLogs}
              pagination={false}
              size="small"
              loading={loading}
              scroll={{ x: 550 }}
              empty={
                <div className="py-8">
                  <Empty
                    title="暂无执行流水"
                    description="定时秒杀或自动化任务启动后，将在此实时呈现调度记录"
                  />
                </div>
              }
            />
          </Card>
        </Col>
      </Row>

      {/* 日志输出查看详情弹窗 */}
      <Modal
        visible={Boolean(activeLogModal)}
        title={`任务输出详情 [${activeLogModal?.task_id || ''}]`}
        onCancel={() => setActiveLogModal(null)}
        footer={
          <Button
            theme="solid"
            type="primary"
            onClick={() => setActiveLogModal(null)}
          >
            知道了
          </Button>
        }
        width={580}
      >
        <div className="space-y-3">
          <div className="flex justify-between text-xs text-semi-color-text-2">
            <span>调度时间: {activeLogModal?.created_at}</span>
            <span>
              状态:{' '}
              <Tag color={activeLogModal?.status === 'success' ? 'green' : 'red'}>
                {activeLogModal?.status}
              </Tag>
            </span>
          </div>
          <div className="bg-semi-color-fill-0 p-3.5 rounded-lg border border-semi-color-border font-mono text-xs max-h-72 overflow-y-auto whitespace-pre-wrap leading-relaxed text-semi-color-text-1">
            {activeLogModal?.output || '暂无输出信息'}
          </div>
        </div>
      </Modal>
    </div>
  );
};
