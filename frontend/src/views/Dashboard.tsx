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
  Select,
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
  IconRefresh,
  IconCalendar,
  IconGift,
  IconPriceTag,
  IconCopy,
  IconHelpCircle,
  IconActivity
} from '@douyinfe/semi-icons';
import { useAppStore } from '../store/useAppStore';
import { api } from '../api';
import { RebateTrendChart } from '../components/charts/RebateTrendChart';
import { OrderDistributionChart } from '../components/charts/OrderDistributionChart';
import { useGSAP, animateStaggerEnter } from '../utils/animations';
import type { JobLog, StoreAppointment, OrderStats, DashboardChartData } from '../types';

const { Title, Text } = Typography;

export const Dashboard: React.FC = () => {
  const { accounts, currentAccountKey, setCurrentAccountKey, setActiveTab } = useAppStore();
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
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // 按钮异步操作 Loading 状态 (防重复点击)
  const [dailySignLoading, setDailySignLoading] = useState<boolean>(false);
  const [vipExpandLoading, setVipExpandLoading] = useState<boolean>(false);
  const [lotteryLoading, setLotteryLoading] = useState<boolean>(false);
  const [batchAllLoading, setBatchAllLoading] = useState<boolean>(false);

  // 日志详情模态框
  const [activeLogModal, setActiveLogModal] = useState<JobLog | null>(null);

  // 动态北京时间秒级时钟 (基于 ntp.aliyun.com 校准)
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('--:--:--');
  const [currentDateStr, setCurrentDateStr] = useState<string>('');
  const [isNtpSynced, setIsNtpSynced] = useState<boolean>(false);
  const timeOffsetRef = useRef<number>(0);

  // 向后端查询由 ntp.aliyun.com 校准的精确时间差
  const syncNtpClock = async () => {
    try {
      const res = await api.getBeijingTime();
      if (res && res.ok && res.timestamp) {
        // res.timestamp 是秒级浮点数 (Unix Epoch)
        const ntpEpochMs = res.timestamp * 1000;
        timeOffsetRef.current = ntpEpochMs - performance.now();
        setIsNtpSynced(Boolean(res.synced));
      }
    } catch (e) {
      // 降级使用本地计算
    }
  };

  useEffect(() => {
    syncNtpClock();
    // 每 5 分钟向阿里云 NTP 授时中心校验一次时钟偏差
    const ntpTimer = setInterval(syncNtpClock, 5 * 60 * 1000);

    const updateClock = () => {
      const epochMs = timeOffsetRef.current
        ? performance.now() + timeOffsetRef.current
        : Date.now();

      // 精确转换为 UTC+8 北京时间
      const d = new Date(epochMs);
      const utcMs = d.getTime() + d.getTimezoneOffset() * 60000;
      const bjDate = new Date(utcMs + 3600000 * 8);

      const hours = String(bjDate.getHours()).padStart(2, '0');
      const minutes = String(bjDate.getMinutes()).padStart(2, '0');
      const seconds = String(bjDate.getSeconds()).padStart(2, '0');
      setCurrentTimeStr(`${hours}:${minutes}:${seconds}`);

      const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
      const year = bjDate.getFullYear();
      const month = bjDate.getMonth() + 1;
      const date = bjDate.getDate();
      const dayName = days[bjDate.getDay()];
      setCurrentDateStr(`${year}年${month}月${date}日 ${dayName}`);
    };

    updateClock();
    const clockTimer = setInterval(updateClock, 1000);
    return () => {
      clearInterval(ntpTimer);
      clearInterval(clockTimer);
    };
  }, []);

  // 核心数据拉取
  const loadDashboardData = async (isManual = false) => {
    if (isManual) {
      setRefreshing(true);
      syncNtpClock();
    } else {
      setLoading(true);
    }

    try {
      const [jobsRes, apptsRes, statsRes, chartRes, tasksRes] = await Promise.all([
        api.getJobs(currentAccountKey || undefined, 6),
        api.getAppointments(currentAccountKey || undefined),
        api.getOrderStats(currentAccountKey || undefined),
        api.getDashboardChartData(currentAccountKey || undefined),
        currentAccountKey ? api.getTasks(currentAccountKey) : Promise.resolve({ ok: false, tasks: [] }),
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
      if (isManual) {
        Toast.success('仪表盘与阿里云北京时间已同步刷新');
      }
    } catch (e) {
      if (isManual) Toast.error('刷新数据失败，请检查网络');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [currentAccountKey]);

  // GSAP 进场交错动画 (只在组件挂载时平滑执行一次，避免数据刷新与账号切换时的闪烁)
  useGSAP(
    () => {
      if (dashboardRef.current) {
        animateStaggerEnter(dashboardRef.current, '.gsap-card-item', 0.02);
      }
    },
    { scope: dashboardRef }
  );

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
        loadDashboardData();
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
        loadDashboardData();
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
        loadDashboardData();
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
        loadDashboardData();
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
      {/* 顶部综合工作台 Bar (对齐牛马助手时钟 + 小蚕省心版主控状态卡片) */}
      <div className="gsap-card-item bg-gradient-to-r from-semi-color-bg-1 via-semi-color-bg-1 to-blue-50/20 dark:from-semi-color-bg-1 dark:via-semi-color-bg-1 dark:to-blue-950/20 border border-semi-color-border/90 rounded-2xl p-4 sm:p-5 shadow-xs hover:shadow-md hover:border-semi-color-primary-light-active transition-[box-shadow,border-color] duration-200 will-change-[transform,opacity] flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        {/* 左侧：当前主控账号实时状态 */}
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
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-gray-900 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-base text-semi-color-text-0 truncate max-w-[220px]">
                {currentAccount?.nickname || '未选择主控账号'}
              </span>
              <Tag
                color={currentAccount?.is_plus ? 'amber' : 'blue'}
                size="small"
                shape="square"
                className="font-semibold shadow-xs"
              >
                {currentAccount?.is_plus
                  ? `SVIP${currentAccount?.vip_level || 5}`
                  : `VIP${currentAccount?.vip_level || 1}`}
              </Tag>
              <Tag color="green" size="small" shape="square" className="flex items-center gap-1 font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>正常托管中</span>
              </Tag>
            </div>
            <div className="flex items-center gap-3 text-xs text-semi-color-text-2 mt-1.5 flex-wrap font-mono">
              {currentAccount?.phone && (
                <span className="bg-semi-color-fill-0 px-1.5 py-0.5 rounded border border-semi-color-border-subtle">
                  手机: {currentAccount.phone}
                </span>
              )}
              {Boolean(currentAccount?.vip_score) && (
                <Tooltip content="小蚕官方会员成长值，决定每日膨胀金档位与返利倍率">
                  <span className="cursor-help bg-semi-color-fill-0 px-1.5 py-0.5 rounded border border-semi-color-border-subtle text-semi-color-primary flex items-center gap-1 hover:border-semi-color-primary/40 transition-colors">
                    成长值: {(currentAccount?.vip_score || 0).toLocaleString()} 分
                    <IconHelpCircle size="extra-small" />
                  </span>
                </Tooltip>
              )}
              <span className="bg-semi-color-fill-0 px-1.5 py-0.5 rounded border border-semi-color-border-subtle">
                定位: {currentAccount?.city_name || '武汉'}
              </span>
            </div>
          </div>
        </div>

        {/* 中间：账号快速切换器 (无需跳出仪表盘即可切换) */}
        <div className="flex items-center gap-2.5 self-stretch md:self-auto justify-between md:justify-end">
          <Select
            value={currentAccountKey}
            onChange={(val) => {
              setCurrentAccountKey(val as string);
              Toast.success('已切换主控账号');
            }}
            style={{ width: 190 }}
            size="small"
            placeholder="切换主控账号"
            className="hover:border-semi-color-primary transition-colors"
          >
            {accounts.map((acc) => (
              <Select.Option key={acc.key} value={acc.key}>
                <div className="flex justify-between items-center w-full">
                  <span className="truncate">{acc.nickname}</span>
                  <span className="text-[11px] text-semi-color-text-2 ml-1 font-mono">
                    {acc.is_plus ? `SVIP${acc.vip_level || 5}` : `VIP${acc.vip_level || 1}`}
                  </span>
                </div>
              </Select.Option>
            ))}
          </Select>

          {/* 右侧：高精度秒级时钟 (基于 ntp.aliyun.com 授时中心校准) */}
          <Tooltip content={isNtpSynced ? "已直连国家授时中心 (ntp.aliyun.com) 完成秒级校对" : "正在连接阿里云 NTP 授时中心..."}>
            <div className="bg-semi-color-bg-0/90 backdrop-blur-md border border-semi-color-border/80 rounded-xl px-3.5 py-2 text-right shrink-0 cursor-help select-none hover:border-emerald-500/50 hover:bg-emerald-500/5 hover:shadow-sm transition-all duration-200">
              <div className="flex items-center justify-end gap-1.5">
                <span className={`w-2 h-2 rounded-full ${isNtpSynced ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse' : 'bg-amber-400'}`} />
                <span className="font-mono text-lg font-black tracking-wider text-semi-color-text-0 leading-none">
                  {currentTimeStr}
                </span>
              </div>
              <div className="text-[11px] text-semi-color-text-2 truncate mt-1 flex items-center justify-end gap-1.5 font-medium">
                <span>{currentDateStr}</span>
                <span className="text-[9px] px-1 py-0.2 rounded font-mono font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">NTP</span>
              </div>
            </div>
          </Tooltip>

          <Tooltip content="刷新最新数据看板">
            <Button
              theme="light"
              type="tertiary"
              size="small"
              icon={<IconRefresh spin={refreshing} />}
              onClick={() => loadDashboardData(true)}
              className="shrink-0 hover:scale-105 active:scale-95 transition-transform"
            />
          </Tooltip>
        </div>
      </div>

      {/* 4 大核心资产 Bento 卡片 (高价值业务数据，拒绝废话) */}
      <Row gutter={[14, 14]}>
        <Col xs={24} sm={12} lg={6}>
          <Card
            shadows="hover"
            className="gsap-card-item rounded-2xl border border-semi-color-border/80 shadow-xs hover:shadow-lg hover:-translate-y-1 hover:border-emerald-500/40 transition-[box-shadow,border-color,transform] duration-200 will-change-[transform,opacity] cursor-pointer group bg-gradient-to-br from-emerald-50/50 via-semi-color-bg-1 to-transparent dark:from-emerald-950/25 dark:via-semi-color-bg-1"
            bodyStyle={{ padding: 18 }}
          >
            <div className="flex justify-between items-start mb-2">
              <Space align="center" spacing="tight">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:bg-emerald-500/20 transition-transform duration-200">
                  <IconCheckCircleStroked size="large" />
                </div>
                <Text type="secondary" size="small" className="font-medium">累计到账返现</Text>
              </Space>
              <Tooltip content="已成功核销并结算入账的霸王餐总返利">
                <IconHelpCircle size="small" className="text-semi-color-text-3 cursor-pointer group-hover:text-emerald-500 transition-colors" />
              </Tooltip>
            </div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xs font-semibold text-emerald-600">¥</span>
              <Title heading={2} className="text-emerald-600 dark:text-emerald-400 tracking-tight font-mono">
                {orderStats.total_rebate.toFixed(2)}
              </Title>
            </div>
            <Text type="tertiary" size="small" className="mt-1 block text-xs">
              已结算 <strong className="text-semi-color-text-1">{orderStats.completed_orders}</strong> 笔霸王餐订单
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            shadows="hover"
            className="gsap-card-item rounded-2xl border border-semi-color-border/80 shadow-xs hover:shadow-lg hover:-translate-y-1 hover:border-blue-500/40 transition-[box-shadow,border-color,transform] duration-200 will-change-[transform,opacity] cursor-pointer group bg-gradient-to-br from-blue-50/50 via-semi-color-bg-1 to-transparent dark:from-blue-950/25 dark:via-semi-color-bg-1"
            bodyStyle={{ padding: 18 }}
          >
            <div className="flex justify-between items-start mb-2">
              <Space align="center" spacing="tight">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:bg-blue-500/20 transition-transform duration-200">
                  <IconPriceTag size="large" />
                </div>
                <Text type="secondary" size="small" className="font-medium">在途/待入账返现</Text>
              </Space>
              <Tooltip content="已提交外卖单号，正由小蚕与商家审核中的返利金额">
                <IconHelpCircle size="small" className="text-semi-color-text-3 cursor-pointer group-hover:text-blue-500 transition-colors" />
              </Tooltip>
            </div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xs font-semibold text-blue-600">¥</span>
              <Title heading={2} className="text-blue-600 dark:text-blue-400 tracking-tight font-mono">
                {orderStats.pending_rebate.toFixed(2)}
              </Title>
            </div>
            <Text type="tertiary" size="small" className="mt-1 block text-xs">
              审核中 <strong className="text-semi-color-text-1">{orderStats.pending_orders}</strong> 单 · 预计2~24h到账
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            shadows="hover"
            className="gsap-card-item rounded-2xl border border-semi-color-border/80 shadow-xs hover:shadow-lg hover:-translate-y-1 hover:border-amber-500/40 transition-[box-shadow,border-color,transform] duration-200 will-change-[transform,opacity] cursor-pointer group bg-gradient-to-br from-amber-50/50 via-semi-color-bg-1 to-transparent dark:from-amber-950/25 dark:via-semi-color-bg-1"
            bodyStyle={{ padding: 18 }}
          >
            <div className="flex justify-between items-start mb-2">
              <Space align="center" spacing="tight">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:bg-amber-500/20 transition-transform duration-200">
                  <IconShoppingBag size="large" />
                </div>
                <Text type="secondary" size="small" className="font-medium">今日已省外卖费</Text>
              </Space>
              <Tooltip content="今日已实际核销到账的霸王餐返现总额（在途订单待核销后自动计入）">
                <IconHelpCircle size="small" className="text-semi-color-text-3 cursor-pointer group-hover:text-amber-500 transition-colors" />
              </Tooltip>
            </div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xs font-semibold text-amber-600">¥</span>
              <Title heading={2} className="text-amber-600 dark:text-amber-400 tracking-tight font-mono">
                {(chartData?.today_summary?.today_savings || 0).toFixed(2)}
              </Title>
            </div>
            <Text type="tertiary" size="small" className="mt-1 block text-xs">
              今日已到账 <strong className="text-semi-color-text-1">{chartData?.today_summary?.today_completed_orders ?? (chartData?.today_summary?.today_orders || 0)}</strong> 笔
              {(chartData?.today_summary?.today_pending_orders ?? 0) > 0 && (
                <span> · 在途 <strong className="text-semi-color-text-1">{chartData?.today_summary?.today_pending_orders}</strong> 笔</span>
              )}
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            shadows="hover"
            className="gsap-card-item rounded-2xl border border-semi-color-border/80 shadow-xs hover:shadow-lg hover:-translate-y-1 hover:border-purple-500/40 transition-[box-shadow,border-color,transform] duration-200 will-change-[transform,opacity] cursor-pointer group bg-gradient-to-br from-purple-50/50 via-semi-color-bg-1 to-transparent dark:from-purple-950/25 dark:via-semi-color-bg-1"
            bodyStyle={{ padding: 18 }}
          >
            <div className="flex justify-between items-start mb-2">
              <Space align="center" spacing="tight">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:bg-purple-500/20 transition-all duration-300">
                  <IconPlay size="large" />
                </div>
                <Text type="secondary" size="small" className="font-medium">自动化任务调度</Text>
              </Space>
              <Tooltip content="APScheduler 毫秒级调度中心正全天候监听的定时任务项">
                <IconActivity size="small" className="text-purple-500 animate-pulse cursor-pointer" />
              </Tooltip>
            </div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <Title heading={2} className="text-purple-600 dark:text-purple-400 tracking-tight font-mono">
                {enabledTaskCount}
              </Title>
              <Text type="tertiary" size="small">/ {totalTaskCount} 项开启</Text>
            </div>
            <Text type="tertiary" size="small" className="mt-1 block text-xs flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shadow-[0_0_6px_rgba(168,85,247,0.8)] animate-pulse"></span>
              <span>
                {enabledTaskCount > 0 ? '定时秒杀全天候就绪' : '任务待开启'}
                {appointments.length > 0 ? ` · ${appointments.length}家店铺盯单中` : ''}
              </span>
            </Text>
          </Card>
        </Col>
      </Row>

      {/* 可视化专业图表区域 (Apache ECharts 双列联动) */}
      <Row gutter={[14, 14]}>
        {/* 近 7 天霸王餐返现与单量走势图 */}
        <Col xs={24} lg={15}>
          <Card
            title={
              <Space align="center">
                <span className="font-bold text-base text-semi-color-text-0">
                  近 7 天霸王餐返利趋势
                </span>
                <Tooltip content="汇总过去 7 天每天的实际霸王餐返现到账金额与完成单量">
                  <IconHelpCircle size="small" className="text-semi-color-text-3" />
                </Tooltip>
              </Space>
            }
            className="gsap-card-item rounded-xl border border-semi-color-border shadow-xs"
            headerStyle={{ padding: '14px 18px', borderBottom: '1px solid var(--semi-color-border)' }}
            bodyStyle={{ padding: '16px 18px' }}
          >
            <RebateTrendChart data={chartData.trend} loading={loading} />
          </Card>
        </Col>

        {/* 订单与平台渠道分布环形图 */}
        <Col xs={24} lg={9}>
          <Card
            title={
              <Space align="center">
                <span className="font-bold text-base text-semi-color-text-0">
                  订单状态与渠道构成
                </span>
                <Tooltip content="展示所有霸王餐订单的状态归类与外卖平台（美团/饿了么）占比">
                  <IconHelpCircle size="small" className="text-semi-color-text-3" />
                </Tooltip>
              </Space>
            }
            className="gsap-card-item rounded-xl border border-semi-color-border shadow-xs"
            headerStyle={{ padding: '14px 18px', borderBottom: '1px solid var(--semi-color-border)' }}
            bodyStyle={{ padding: '16px 18px' }}
          >
            <OrderDistributionChart
              statusData={chartData.status_distribution}
              platformData={chartData.platform_distribution}
              loading={loading}
            />
          </Card>
        </Col>
      </Row>

      {/* 快捷工作流操作网格 (对齐牛马助手工作台 + 小蚕省心版极速打卡) */}
      <Row gutter={[14, 14]}>
        <Col xs={24} lg={10}>
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
        <Col xs={24} lg={14}>
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
