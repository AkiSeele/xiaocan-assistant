import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  Card,
  Typography,
  Tag,
  Switch,
  Button,
  Space,
  Toast,
  Modal,
  Empty,
  Skeleton,
  Tooltip,
  SideSheet,
  InputNumber,
  Input,
  Banner,
  Tabs,
  TabPane,
  Checkbox,
  Select,
  Popconfirm,
} from '@douyinfe/semi-ui';
import {
  IconPlay,
  IconClock,
  IconSetting,
  IconRefresh,
  IconEdit,
  IconCheckCircleStroked,
  IconAlertCircle,
  IconCalendarClockStroked,
} from '@douyinfe/semi-icons';
import { useAppStore } from '../store/useAppStore';
import { api } from '../api';
import { useGSAP, animateStaggerEnter } from '../utils/animations';
import { useOnActivated } from '../utils/useOnActivated';
import { LogDetailModal } from '../components/LogDetailModal';
import { FlashSaleDrawerConfig } from '../components/FlashSaleDrawerConfig';
import type { TaskItem, Account } from '../types';

const { Title, Text, Paragraph } = Typography;

interface TaskCardProps {
  task: TaskItem;
  accounts: Account[];
  currentAccountKey: string;
  accountTasksMap: Record<string, TaskItem[]>;
  running: boolean;
  onToggleAccount: (accountKey: string, taskId: string, enabled: boolean) => void;
  onToggleAllAccounts: (taskId: string, enabled: boolean) => void;
  onRun: (task: TaskItem, accountKey: string) => void;
  onOpenConfig: (task: TaskItem) => void;
  onOpenTime: (task: TaskItem, e: React.MouseEvent) => void;
}

const getCategoryMeta = (category?: string) => {
  switch (category) {
    case 'member':
      return {
        label: '秒杀抢券',
        tagColor: 'violet' as const,
      };
    case 'custom':
      return {
        label: '资产与提醒',
        tagColor: 'amber' as const,
      };
    case 'daily':
    default:
      return {
        label: '日常任务',
        tagColor: 'blue' as const,
      };
  }
};


const TaskCard: React.FC<TaskCardProps> = React.memo(({
  task,
  accounts,
  currentAccountKey,
  accountTasksMap,
  running,
  onToggleAccount,
  onToggleAllAccounts,
  onRun,
  onOpenConfig,
  onOpenTime,
}) => {
  const hasParams = Boolean(task.param_defs && task.param_defs.length > 0);
  const categoryMeta = getCategoryMeta(task.category);

  // 计算当前任务在各账号的开启状态
  const enabledAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      const t = accountTasksMap[acc.key]?.find((item) => item.task_id === task.task_id);
      return Boolean(t?.enabled);
    });
  }, [accounts, accountTasksMap, task.task_id]);

  const isCurrentAccountEnabled = Boolean(
    accountTasksMap[currentAccountKey]?.find((item) => item.task_id === task.task_id)?.enabled
  );

  const isAllAccountsEnabled = accounts.length > 0 && enabledAccounts.length === accounts.length;

  const currentAccount = useMemo(
    () => accounts.find((a) => a.key === currentAccountKey),
    [accounts, currentAccountKey]
  );
  const isPlus = Boolean(currentAccount?.is_plus);
  const vipLevel = currentAccount?.vip_level ?? 1;

  // 检测当前账号对该秒杀抢券任务的官方门槛与特权支持（仅在资格不足时提示，符合资格时不展示多余的“资格符合”标记）
  const eligibility = useMemo(() => {
    if (!task.vip) return null;
    const v = task.vip;
    if (v === 'VIP / SVIP') {
      return null;
    }
    if (v === 'SVIP2+ / VIP5+' || v === 'SVIP2-6 / VIP5+' || v === 'SVIP2-6') {
      if (isPlus && vipLevel >= 2) return null;
      if (!isPlus && vipLevel >= 5) return null;
      return { eligible: false, text: isPlus ? '需SVIP2+' : '需VIP5+ (等级不足)', color: 'orange' as const };
    }
    if (v === 'SVIP4+ / VIP5+' || v === 'SVIP4-6 / VIP5-6') {
      if (isPlus && vipLevel >= 4) return null;
      if (!isPlus && vipLevel >= 5) return null;
      return { eligible: false, text: isPlus ? '需SVIP4+' : '需VIP5+ (等级不足)', color: 'orange' as const };
    }
    if (v === 'SVIP5+ / VIP6' || v === 'SVIP5-6 / VIP6') {
      if (isPlus && vipLevel >= 5) return null;
      if (!isPlus && vipLevel >= 6) return null;
      return { eligible: false, text: isPlus ? '需SVIP5+' : '需VIP6 (等级不足)', color: 'orange' as const };
    }
    if (v === 'VIP2+ / SVIP') {
      if (isPlus || vipLevel >= 2) return null;
      return { eligible: false, text: '需VIP2+ (等级不足)', color: 'orange' as const };
    }
    return null;
  }, [task.vip, isPlus, vipLevel]);

  return (
    <Card
      shadows="hover"
      bordered={true}
      headerLine={true}
      footerLine={true}
      className="gsap-task-card h-full flex flex-col justify-between"
      style={{
        borderRadius: 'var(--semi-border-radius-large)',
        backgroundColor: 'var(--semi-color-bg-1)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
      headerStyle={{
        padding: '12px 16px',
      }}
      bodyStyle={{
        padding: '14px 16px',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
      }}
      footerStyle={{
        padding: '10px 16px',
      }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text strong style={{ fontSize: 15, color: 'var(--semi-color-text-0)' }}>
            {task.label}
          </Text>
          <Tag size="small" color={categoryMeta.tagColor}>
            {categoryMeta.label}
          </Tag>
          {task.vip && (
            <Tag color="amber" size="small" shape="circle">
              {task.vip}
            </Tag>
          )}
          {eligibility && (
            <Tag color={eligibility.color} size="small">
              {eligibility.text}
            </Tag>
          )}
        </div>
      }
      headerExtraContent={
        <Space align="center" spacing="tight">
          <Tooltip content={isCurrentAccountEnabled ? '点击关闭当前主控账号' : '点击开启当前主控账号'}>
            <Switch
              checked={isCurrentAccountEnabled}
              onChange={(val) => onToggleAccount(currentAccountKey, task.task_id, val)}
              size="small"
            />
          </Tooltip>
        </Space>
      }
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <Space spacing="tight">
            {hasParams && (
              <Button
                theme="light"
                type="tertiary"
                size="small"
                icon={<IconSetting />}
                onClick={() => onOpenConfig(task)}
              >
                参数
              </Button>
            )}
            {!task.fixed_time && (
              <Button
                theme="light"
                type="tertiary"
                size="small"
                icon={<IconCalendarClockStroked />}
                onClick={(e) => onOpenTime(task, e)}
              >
                时间
              </Button>
            )}
          </Space>
          <Button
            theme="light"
            type="primary"
            size="small"
            icon={<IconPlay />}
            loading={running}
            onClick={() => onRun(task, currentAccountKey)}
          >
            立即执行
          </Button>
        </div>
      }
    >
      <div className="flex flex-col h-full flex-1">
        {/* 上半部分：任务内容说明与时段/参数标记自然聚合紧凑展示 */}
        <div>
          {/* 任务内容说明 */}
          <Paragraph
            ellipsis={{ rows: 2 }}
            style={{
              color: 'var(--semi-color-text-2)',
              fontSize: 13,
              lineHeight: '20px',
              minHeight: 40,
              margin: 0,
              marginBottom: 8,
            }}
          >
            {task.tip ? task.tip.replace(/[（(][^）)]*[）)]/g, '').trim() : ''}
          </Paragraph>

          {/* 触发时段与参数标记 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {task.fixed_time ? (
              <Tooltip content={task.task_id === 'dual_rebate_monitor' ? '点击配置固定时间段与巡检参数' : (task.time_label || '固定场次')}>
                <Tag
                  color="violet"
                  size="small"
                  className={task.task_id === 'dual_rebate_monitor' ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}
                  onClick={task.task_id === 'dual_rebate_monitor' ? () => onOpenConfig(task) : undefined}
                >
                  <IconClock style={{ marginRight: 4 }} />
                  {(task.time_label || '固定场次').replace(/[（(][^）)]*[）)]/g, '').trim()}
                </Tag>
              </Tooltip>
            ) : (
              <Tooltip content="点击修改执行时间">
                <Tag
                  color="blue"
                  size="small"
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => onOpenTime(task, e)}
                >
                  <IconClock style={{ marginRight: 4 }} />
                  每日 {task.cron_time}
                  <IconEdit size="extra-small" style={{ marginLeft: 3 }} />
                </Tag>
              </Tooltip>
            )}

            {hasParams && (
              <Tooltip content="支持自定义参数配置">
                <Tag
                  color="cyan"
                  size="small"
                  style={{ cursor: 'pointer' }}
                  onClick={() => onOpenConfig(task)}
                >
                  <IconSetting style={{ marginRight: 4 }} />
                  自定义参数
                </Tag>
              </Tooltip>
            )}

            {task.task_id === 'flash_sale' && (
              <Tag
                color={
                  Array.isArray(task.params?.target_products) && task.params.target_products.length > 0
                    ? 'violet'
                    : 'grey'
                }
                size="small"
                style={{ cursor: 'pointer' }}
                onClick={() => onOpenConfig(task)}
              >
                {Array.isArray(task.params?.target_products) && task.params.target_products.length > 0
                  ? `已选 ${task.params.target_products.length} 款目标商品`
                  : '未选定商品 (点击配置)'}
              </Tag>
            )}
          </div>
        </div>

        {/* 多账号启用状态展示与快捷切换 (自动沉底) */}
        <div
          style={{
            marginTop: 'auto',
            backgroundColor: 'var(--semi-color-fill-0)',
            borderRadius: 'var(--semi-border-radius-medium)',
            padding: '8px 10px',
            border: '1px solid var(--semi-color-border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text type="secondary" size="small" style={{ fontSize: 11 }}>
              账号启用 ({enabledAccounts.length}/{accounts.length})
            </Text>
            {accounts.length > 1 && (
              <Button
                theme="borderless"
                type="tertiary"
                size="small"
                style={{ padding: '0 4px', fontSize: 11, height: 'auto', lineHeight: '18px' }}
                onClick={() => onToggleAllAccounts(task.task_id, !isAllAccountsEnabled)}
              >
                {isAllAccountsEnabled ? '全部暂停' : '全部开启'}
              </Button>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {accounts.map((acc) => {
              const isAccEnabled = Boolean(
                accountTasksMap[acc.key]?.find((item) => item.task_id === task.task_id)?.enabled
              );
              const isCurrent = acc.key === currentAccountKey;

              return (
                <Tooltip
                  key={acc.key}
                  content={`${acc.nickname} · ${isAccEnabled ? '点击关闭此账号' : '点击开启此账号'}${isCurrent ? ' · 当前主控' : ''}`}
                >
                  <Tag
                    size="small"
                    color={isAccEnabled ? 'green' : 'grey'}
                    type={isAccEnabled ? 'light' : 'ghost'}
                    style={{
                      cursor: 'pointer',
                      borderRadius: '4px',
                      fontSize: 11,
                      padding: '1px 6px',
                    }}
                    onClick={() => onToggleAccount(acc.key, task.task_id, !isAccEnabled)}
                  >
                    <span
                      style={{
                        display: 'inline-block',
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        backgroundColor: isAccEnabled
                          ? 'var(--semi-color-success)'
                          : 'var(--semi-color-text-3)',
                        marginRight: 4,
                      }}
                    />
                    {acc.nickname || '未命名'}
                    {isCurrent ? ' · 主控' : ''}
                  </Tag>
                </Tooltip>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
});

export const Automation: React.FC = () => {
  const currentAccountKey = useAppStore((s) => s.currentAccountKey);
  const accounts = useAppStore((s) => s.accounts);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const tasksRef = useRef<HTMLDivElement>(null);
  const [accountTasksMap, setAccountTasksMap] = useState<Record<string, TaskItem[]>>({});
  const [activeCategory, setActiveCategory] = useState<string>('member');
  const [loading, setLoading] = useState(false);
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [batchRunning, setBatchRunning] = useState<boolean>(false);

  // 日志回显弹窗
  const [execResultModal, setExecResultModal] = useState<boolean>(false);
  const [execOutput, setExecOutput] = useState<string>('');
  const [execTitle, setExecTitle] = useState<string>('任务执行日志');

  // 批量日常打卡结果弹窗
  const [batchResultModal, setBatchResultModal] = useState<boolean>(false);
  const [batchResults, setBatchResults] = useState<any[]>([]);
  const [batchSummaryMessage, setBatchSummaryMessage] = useState<string>('');

  // 参数配置抽屉 (SideSheet)
  const [drawerVisible, setDrawerVisible] = useState<boolean>(false);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [drawerParams, setDrawerParams] = useState<Record<string, any>>({});
  const [drawerCronTime, setDrawerCronTime] = useState<string>('09:00');
  const [drawerApplyAllAccounts, setDrawerApplyAllAccounts] = useState<boolean>(false);
  const [savingParams, setSavingParams] = useState<boolean>(false);

  // 定时时间快捷修改弹窗
  const [timeModalVisible, setTimeModalVisible] = useState<boolean>(false);
  const [timeEditingTask, setTimeEditingTask] = useState<TaskItem | null>(null);
  const [editingTimeValue, setEditingTimeValue] = useState<string>('');
  const [timeApplyAllAccounts, setTimeApplyAllAccounts] = useState<boolean>(false);

  const currentAccount = accounts.find((a) => a.key === currentAccountKey);

  const accountsRef = useRef(accounts);
  useEffect(() => {
    accountsRef.current = accounts;
  }, [accounts]);
  const accountKeys = useMemo(() => accounts.map((a) => a.key).join(','), [accounts]);

  const lastAutomationSignatureRef = useRef<string>('');
  const inFlightAutomationRef = useRef<boolean>(false);

  // 拉取所有账号的任务列表
  const fetchAllTasks = useCallback(async (force = false, silent = false) => {
    if (!accountKeys) return;
    const accs = accountsRef.current;
    if (accs.length === 0) return;
    if (!force && lastAutomationSignatureRef.current === accountKeys) {
      return;
    }
    if (inFlightAutomationRef.current) return;
    inFlightAutomationRef.current = true;
    lastAutomationSignatureRef.current = accountKeys;

    if (!silent) setLoading(true);
    try {
      const map: Record<string, TaskItem[]> = {};
      await Promise.all(
        accs.map(async (acc) => {
          try {
            const res = await api.getTasks(acc.key);
            if (res.ok) {
              map[acc.key] = res.tasks || [];
            }
          } catch (e) {
            console.error(`Failed to fetch tasks for ${acc.key}`, e);
          }
        })
      );
      setAccountTasksMap(map);
    } catch (e) {
      lastAutomationSignatureRef.current = '';
      Toast.error('拉取任务列表失败');
    } finally {
      inFlightAutomationRef.current = false;
      if (!silent) setLoading(false);
    }
  }, [accountKeys]);

  useEffect(() => {
    fetchAllTasks();
  }, [fetchAllTasks]);

  // 页面切入激活时自动拉取各账号最新自动化任务状态
  useOnActivated('automation', () => {
    fetchAllTasks(true, Object.keys(accountTasksMap).length > 0);
  }, { throttleMs: 3000 });

  useGSAP(
    () => {
      if (tasksRef.current) {
        animateStaggerEnter(tasksRef.current, '.gsap-task-card', 0.02);
      }
    },
    { scope: tasksRef, dependencies: [activeCategory, loading] }
  );

  // 单个账号的任务开关
  const handleToggleAccount = async (accountKey: string, taskId: string, enabled: boolean) => {
    try {
      await api.toggleTask({
        account_key: accountKey,
        task_id: taskId,
        enabled,
      });

      setAccountTasksMap((prev) => {
        const next = { ...prev };
        if (next[accountKey]) {
          next[accountKey] = next[accountKey].map((t) =>
            t.task_id === taskId ? { ...t, enabled } : t
          );
        }
        return next;
      });

      const acc = accounts.find((a) => a.key === accountKey);
      Toast.success(`${acc?.nickname || '账号'} 任务已${enabled ? '开启' : '暂停'}`);
    } catch (e: any) {
      const errMsg = e?.response?.data?.detail || e?.message || '更新任务状态失败';
      Toast.error(errMsg);
    }
  };

  // 一键切换全部账号的某个任务
  const handleToggleAllAccounts = async (taskId: string, enabled: boolean) => {
    try {
      await Promise.all(
        accounts.map((acc) =>
          api.toggleTask({
            account_key: acc.key,
            task_id: taskId,
            enabled,
          })
        )
      );

      setAccountTasksMap((prev) => {
        const next: Record<string, TaskItem[]> = {};
        for (const [k, list] of Object.entries(prev)) {
          next[k] = list.map((t) => (t.task_id === taskId ? { ...t, enabled } : t));
        }
        return next;
      });

      Toast.success(`全部 ${accounts.length} 个账号已批量${enabled ? '开启' : '暂停'}`);
    } catch (e: any) {
      const errMsg = e?.response?.data?.detail || e?.message || '批量切换失败';
      Toast.error(errMsg);
    }
  };

  // 单个执行任务
  const handleRun = async (task: TaskItem, accountKey: string) => {
    setRunningTaskId(task.task_id);
    const targetKey = accountKey || currentAccountKey;
    try {
      const res = await api.runTaskNow(targetKey, task.task_id);
      if (res.ok) {
        setExecTitle(`执行完成 - ${task.label}`);
        setExecOutput(res.output || '执行成功，无额外输出日志');
        setExecResultModal(true);
      } else {
        setExecTitle(`执行异常 - ${task.label}`);
        setExecOutput(res.output || '执行遇到错误');
        setExecResultModal(true);
      }
    } catch (e: any) {
      setExecTitle(`执行失败 - ${task.label}`);
      setExecOutput(e.message || '网络连接或后端通信故障');
      setExecResultModal(true);
    } finally {
      setRunningTaskId(null);
    }
  };

  // 全账号批量日常打卡
  const handleBatchRunDaily = async () => {
    if (accounts.length === 0) {
      Toast.warning('当前无托管账号，请先添加或绑定账号');
      return;
    }
    setBatchRunning(true);
    try {
      const res = await api.batchRunDaily();
      if (res.ok) {
        setBatchResults(res.results || []);
        setBatchSummaryMessage(res.message || '全账号日常打卡完成');
        setBatchResultModal(true);
      } else {
        Toast.error(res.message || '全账号批量打卡失败');
      }
    } catch (e: any) {
      Toast.error(`全账号批量打卡失败: ${e.message}`);
    } finally {
      setBatchRunning(false);
    }
  };

  // 打开参数配置抽屉
  const handleOpenConfig = (task: TaskItem) => {
    setSelectedTask(task);
    const initialParams = task.params ? { ...task.params } : {};
    if (task.task_id === 'dual_rebate_monitor') {
      const im = Number(initialParams.interval_minutes);
      if (![30, 60, 120].includes(im)) {
        initialParams.interval_minutes = 60;
      }
    }
    setDrawerParams(initialParams);
    setDrawerCronTime(task.cron_time || '09:00');
    setDrawerApplyAllAccounts(false);
    setDrawerVisible(true);
  };

  // 下拉选择参数变更处理（针对美团同店双返利 30 分钟高频风控二次确认）
  const handleSelectParamChange = (key: string, newVal: any, _currentVal: any) => {
    if (selectedTask?.task_id === 'dual_rebate_monitor' && key === 'interval_minutes' && Number(newVal) === 30) {
      Modal.confirm({
        title: '高频巡检风控预警',
        content: '30分钟巡检频率较高，高频扫描商圈商户可能增加平台风控风险，如验证码拦截、临时限流或封禁。建议日常使用推荐的 1小时 或 2小时 固定时段巡检。确定要切换为 30分钟 巡检吗？',
        okText: '确认切换为30分钟',
        cancelText: '保持原有时段',
        icon: <IconAlertCircle style={{ color: 'var(--semi-color-warning)' }} />,
        okButtonProps: { type: 'warning' },
        centered: true,
        onOk: () => {
          setDrawerParams((prev) => ({ ...prev, [key]: Number(newVal) }));
        },
      });
      return;
    }
    const finalVal = typeof newVal === 'string' && !isNaN(Number(newVal)) ? Number(newVal) : newVal;
    setDrawerParams((prev) => ({ ...prev, [key]: finalVal }));
  };

  // 保存抽屉参数
  const handleSaveConfig = async () => {
    if (!selectedTask) return;
    setSavingParams(true);
    try {
      const targetKeys =
        drawerApplyAllAccounts && selectedTask.task_id !== 'flash_sale'
          ? accounts.map((a) => a.key)
          : [currentAccountKey];

      await Promise.all(
        targetKeys.map((k) =>
          api.toggleTask({
            account_key: k,
            task_id: selectedTask.task_id,
            enabled: selectedTask.enabled,
            cron_time: selectedTask.fixed_time ? undefined : drawerCronTime,
            params: drawerParams,
          })
        )
      );

      setAccountTasksMap((prev) => {
        const next: Record<string, TaskItem[]> = {};
        for (const [k, list] of Object.entries(prev)) {
          if (targetKeys.includes(k)) {
            next[k] = list.map((t) =>
              t.task_id === selectedTask.task_id
                ? {
                    ...t,
                    cron_time: selectedTask.fixed_time ? t.cron_time : drawerCronTime,
                    params: { ...drawerParams },
                  }
                : t
            );
          } else {
            next[k] = list;
          }
        }
        return next;
      });

      Toast.success(
        drawerApplyAllAccounts
          ? `${selectedTask.label} 配置已同步至全部账号`
          : `${selectedTask.label} 配置已保存`
      );
      setDrawerVisible(false);
    } catch (e: any) {
      const errMsg = e?.response?.data?.detail || e?.message || '保存失败';
      Toast.error(errMsg);
    } finally {
      setSavingParams(false);
    }
  };

  // 打开快捷时间修改
  const handleOpenTime = (task: TaskItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (task.fixed_time) {
      Toast.info(`${task.label} 为固定时段任务，无需设置时间`);
      return;
    }
    setTimeEditingTask(task);
    setEditingTimeValue(task.cron_time || '09:00');
    setTimeApplyAllAccounts(false);
    setTimeModalVisible(true);
  };

  // 保存快捷时间
  const handleSaveQuickTime = async () => {
    if (!timeEditingTask) return;
    const val = (editingTimeValue || '').trim();
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(val)) {
      Toast.warning('时间格式须为 HH:mm，如 09:30');
      return;
    }
    try {
      const targetKeys = timeApplyAllAccounts ? accounts.map((a) => a.key) : [currentAccountKey];

      await Promise.all(
        targetKeys.map((k) =>
          api.toggleTask({
            account_key: k,
            task_id: timeEditingTask.task_id,
            enabled: timeEditingTask.enabled,
            cron_time: val,
            params: timeEditingTask.params || {},
          })
        )
      );

      setAccountTasksMap((prev) => {
        const next: Record<string, TaskItem[]> = {};
        for (const [k, list] of Object.entries(prev)) {
          if (targetKeys.includes(k)) {
            next[k] = list.map((t) =>
              t.task_id === timeEditingTask.task_id ? { ...t, cron_time: val } : t
            );
          } else {
            next[k] = list;
          }
        }
        return next;
      });

      Toast.success(
        timeApplyAllAccounts
          ? `已将 ${timeEditingTask.label} 触发时间 ${val} 同步至所有账号`
          : `${timeEditingTask.label} 触发时间已更新为 ${val}`
      );
      setTimeModalVisible(false);
    } catch (e: any) {
      Toast.error(`更新时间失败: ${e.message}`);
    }
  };

  // 分类任务批量启停 (仅针对当前选中的Tab分类)
  const handleBatchToggleCategory = async (category: string, enable: boolean) => {
    const currentTasks = accountTasksMap[currentAccountKey] || [];
    const targetTasks = currentTasks.filter((t) => (t.category || 'daily') === category);

    if (targetTasks.length === 0) return;

    try {
      await Promise.all(
        targetTasks.map((t) =>
          api.toggleTask({
            account_key: currentAccountKey,
            task_id: t.task_id,
            enabled: enable,
          })
        )
      );

      const targetIds = targetTasks.map((t) => t.task_id);
      setAccountTasksMap((prev) => {
        const next = { ...prev };
        if (next[currentAccountKey]) {
          next[currentAccountKey] = next[currentAccountKey].map((t) =>
            targetIds.includes(t.task_id) ? { ...t, enabled: enable } : t
          );
        }
        return next;
      });

      const categoryNameMap: Record<string, string> = {
        member: '秒杀抢券',
        daily: '日常任务',
        custom: '资产与提醒',
      };
      const catLabel = categoryNameMap[category] || '当前分类';
      Toast.success(`已为当前账号${enable ? '开启' : '关闭'}「${catLabel}」全部 ${targetTasks.length} 项任务`);
    } catch (e) {
      Toast.error('批量操作失败');
    }
  };

  // 主任务基准列表
  const masterTasks = useMemo(() => {
    return accountTasksMap[currentAccountKey] || Object.values(accountTasksMap)[0] || [];
  }, [accountTasksMap, currentAccountKey]);

  // 统计计算
  const currentAccountTasks = useMemo(() => {
    return accountTasksMap[currentAccountKey] || [];
  }, [accountTasksMap, currentAccountKey]);

  const enabledCount = useMemo(
    () => currentAccountTasks.filter((t) => t.enabled).length,
    [currentAccountTasks]
  );

  const memberTasks = useMemo(
    () => masterTasks.filter((t) => t.category === 'member'),
    [masterTasks]
  );
  const memberEnabledCount = useMemo(
    () => currentAccountTasks.filter((t) => t.category === 'member' && t.enabled).length,
    [currentAccountTasks]
  );

  const dailyTasks = useMemo(
    () => masterTasks.filter((t) => !t.category || t.category === 'daily'),
    [masterTasks]
  );
  const dailyEnabledCount = useMemo(
    () => currentAccountTasks.filter((t) => (!t.category || t.category === 'daily') && t.enabled).length,
    [currentAccountTasks]
  );

  const customTasks = useMemo(
    () => masterTasks.filter((t) => t.category === 'custom'),
    [masterTasks]
  );
  const customEnabledCount = useMemo(
    () => currentAccountTasks.filter((t) => t.category === 'custom' && t.enabled).length,
    [currentAccountTasks]
  );

  const displayedTasks = useMemo(() => {
    return masterTasks.filter((t) => (t.category || 'daily') === activeCategory);
  }, [masterTasks, activeCategory]);

  if (!currentAccountKey || accounts.length === 0) {
    return (
      <div className="w-full">
        <div className="flex justify-between items-center mb-5">
          <div>
            <Title heading={3}>自动化任务</Title>
            <Text type="secondary">配置每日定时签到、大牌抢券、整点红包与到期提醒</Text>
          </div>
        </div>
        <Card
          bordered={true}
          style={{
            borderRadius: 'var(--semi-border-radius-large)',
            backgroundColor: 'var(--semi-color-bg-1)',
            padding: '48px 24px',
            textAlign: 'center',
          }}
        >
          <Empty
            title="未检测到小蚕账号"
            description="请先在「账号管理」中绑定或导入小蚕账号，即可配置自动化任务。"
          >
            <Button
              theme="solid"
              type="primary"
              onClick={() => setActiveTab('accounts')}
              style={{ marginTop: 16 }}
            >
              前往账号管理
            </Button>
          </Empty>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full pb-10 space-y-4">
      {/* 顶部标题与快捷操作栏 */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <Space align="center" spacing="medium">
            <Title heading={3} style={{ margin: 0 }}>
              自动化任务
            </Title>
            <Tag color="blue" size="large" shape="circle">
              当前主控: {currentAccount?.nickname || '未命名'}
              {currentAccount?.is_plus
                ? ` (SVIP${currentAccount.vip_level || 1})`
                : ` (VIP${currentAccount?.vip_level || 1})`}
            </Tag>
          </Space>
          <Text type="secondary" size="small" style={{ display: 'block', marginTop: 4 }}>
            支持多账号独立配置定时任务，涵盖每日签到、整点红包、秒杀抢券与订单提醒。
          </Text>
        </div>

        <Space spacing="medium">
          <Popconfirm
            title="确认执行全账号日常打卡？"
            content="将为所有托管的有效账号执行已启用的日常任务（签到、成长值膨胀金、社群转盘等）。"
            okText="立即打卡"
            cancelText="取消"
            onConfirm={handleBatchRunDaily}
          >
            <Button
              theme="solid"
              type="primary"
              icon={<IconPlay />}
              loading={batchRunning}
            >
              一键全账号打卡
            </Button>
          </Popconfirm>
          <Button
            theme="light"
            type="tertiary"
            icon={<IconRefresh />}
            onClick={() => fetchAllTasks(true)}
          >
            刷新状态
          </Button>
        </Space>
      </div>

      {/* 4 统计指标栅格 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
        }}
      >
        <Card
          bordered={true}
          shadows="hover"
          style={{
            borderRadius: 'var(--semi-border-radius-large)',
            backgroundColor: 'var(--semi-color-bg-1)',
          }}
          bodyStyle={{ padding: '14px 16px' }}
        >
          <Text type="secondary" size="small">当前账号开启</Text>
          <Title heading={3} style={{ margin: '4px 0', color: 'var(--semi-color-text-0)' }}>
            {enabledCount}{' '}
            <span style={{ fontSize: 13, fontWeight: 'normal', color: 'var(--semi-color-text-2)' }}>
              / {masterTasks.length} 项
            </span>
          </Title>
          <Tag color={enabledCount > 0 ? 'green' : 'grey'} size="small">
            {enabledCount > 0 ? '正常调度中' : '全部暂停'}
          </Tag>
        </Card>

        <Card
          bordered={true}
          shadows="hover"
          style={{
            borderRadius: 'var(--semi-border-radius-large)',
            backgroundColor: 'var(--semi-color-bg-1)',
          }}
          bodyStyle={{ padding: '14px 16px' }}
        >
          <Text type="secondary" size="small">秒杀抢券</Text>
          <Title heading={3} style={{ margin: '4px 0', color: 'var(--semi-color-secondary)' }}>
            {memberEnabledCount}{' '}
            <span style={{ fontSize: 13, fontWeight: 'normal', color: 'var(--semi-color-text-2)' }}>
              / {memberTasks.length} 项开启
            </span>
          </Title>
          <Tag color="violet" size="small">
            红包雨 / SVIP大牌券 / 免单
          </Tag>
        </Card>

        <Card
          bordered={true}
          shadows="hover"
          style={{
            borderRadius: 'var(--semi-border-radius-large)',
            backgroundColor: 'var(--semi-color-bg-1)',
          }}
          bodyStyle={{ padding: '14px 16px' }}
        >
          <Text type="secondary" size="small">日常任务</Text>
          <Title heading={3} style={{ margin: '4px 0', color: 'var(--semi-color-primary)' }}>
            {dailyEnabledCount}{' '}
            <span style={{ fontSize: 13, fontWeight: 'normal', color: 'var(--semi-color-text-2)' }}>
              / {dailyTasks.length} 项开启
            </span>
          </Title>
          <Tag color="blue" size="small">
            会员签到 / 元宝抽奖 / 领气泡
          </Tag>
        </Card>

        <Card
          bordered={true}
          shadows="hover"
          style={{
            borderRadius: 'var(--semi-border-radius-large)',
            backgroundColor: 'var(--semi-color-bg-1)',
          }}
          bodyStyle={{ padding: '14px 16px' }}
        >
          <Text type="secondary" size="small">资产与提醒</Text>
          <Title heading={3} style={{ margin: '4px 0', color: 'var(--semi-color-warning)' }}>
            {customEnabledCount}{' '}
            <span style={{ fontSize: 13, fontWeight: 'normal', color: 'var(--semi-color-text-2)' }}>
              / {customTasks.length} 项开启
            </span>
          </Title>
          <Tag color="amber" size="small">
            自动提现 / 到期预警
          </Tag>
        </Card>
      </div>

      {/* 分类 Tabs */}
      <Tabs
        type="line"
        activeKey={activeCategory}
        onChange={(k) => setActiveCategory(k)}
        tabBarExtraContent={
          <Space spacing="medium">
            <Button
              size="small"
              theme="light"
              type="tertiary"
              onClick={() => handleBatchToggleCategory(activeCategory, true)}
            >
              全部开启
            </Button>
            <Button
              size="small"
              theme="light"
              type="tertiary"
              onClick={() => handleBatchToggleCategory(activeCategory, false)}
            >
              全部关闭
            </Button>
          </Space>
        }
      >
        <TabPane tab={`秒杀抢券 (${memberTasks.length})`} itemKey="member" />
        <TabPane tab={`日常任务 (${dailyTasks.length})`} itemKey="daily" />
        <TabPane tab={`资产与提醒 (${customTasks.length})`} itemKey="custom" />
      </Tabs>

      {/* 响应式 4 列栅格 (宽屏 4 列，平板 2~3 列，移动端 1 列，尺寸缩小时丝滑自适应) */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((idx) => (
            <Card
              key={idx}
              bordered={true}
              style={{
                borderRadius: 'var(--semi-border-radius-large)',
                padding: '16px',
                backgroundColor: 'var(--semi-color-bg-1)',
              }}
            >
              <Skeleton.Title style={{ width: '60%', height: 20, marginBottom: 12 }} />
              <Skeleton.Paragraph rows={2} style={{ marginBottom: 16 }} />
              <Skeleton.Button style={{ width: '100%', height: 32 }} />
            </Card>
          ))}
        </div>
      ) : displayedTasks.length === 0 ? (
        <Card
          bordered={true}
          style={{
            borderRadius: 'var(--semi-border-radius-large)',
            backgroundColor: 'var(--semi-color-bg-1)',
            padding: '48px 24px',
            textAlign: 'center',
          }}
        >
          <Empty title="暂无任务" description="当前分类下暂无任务。" />
        </Card>
      ) : (
        <div
          ref={tasksRef}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        >
          {displayedTasks.map((task) => (
            <TaskCard
              key={task.task_id}
              task={task}
              accounts={accounts}
              currentAccountKey={currentAccountKey}
              accountTasksMap={accountTasksMap}
              running={runningTaskId === task.task_id}
              onToggleAccount={handleToggleAccount}
              onToggleAllAccounts={handleToggleAllAccounts}
              onRun={handleRun}
              onOpenConfig={handleOpenConfig}
              onOpenTime={handleOpenTime}
            />
          ))}
        </div>
      )}

      {/* 参数配置抽屉 (SideSheet) */}
      <SideSheet
        title={`配置任务参数 - ${selectedTask?.label || ''}`}
        visible={drawerVisible}
        onCancel={() => setDrawerVisible(false)}
        width={selectedTask?.task_id === 'flash_sale' ? 520 : 420}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button theme="light" type="tertiary" onClick={() => setDrawerVisible(false)}>
              取消
            </Button>
            <Button
              theme="solid"
              type="primary"
              loading={savingParams}
              onClick={handleSaveConfig}
            >
              保存配置
            </Button>
          </div>
        }
      >
        {selectedTask && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 任务说明 */}
            <div
              style={{
                backgroundColor: 'var(--semi-color-fill-0)',
                padding: '12px 14px',
                borderRadius: 'var(--semi-border-radius-medium)',
                border: '1px solid var(--semi-color-border)',
              }}
            >
              <Text strong style={{ fontSize: 15, display: 'block', marginBottom: 4 }}>
                {selectedTask.label}
              </Text>
              <Text type="secondary" size="small" style={{ lineHeight: '20px' }}>
                {selectedTask.tip ? selectedTask.tip.replace(/[（(][^）)]*[）)]/g, '').trim() : ''}
              </Text>
            </div>

            {/* 定时配置 (元宝秒杀抢券采用场次专属时间，无需展示触发时间区块) */}
            {selectedTask.task_id !== 'flash_sale' && (
              <div
                style={{
                  backgroundColor: 'var(--semi-color-fill-0)',
                  padding: '12px 14px',
                  borderRadius: 'var(--semi-border-radius-medium)',
                  border: '1px solid var(--semi-color-border)',
                }}
              >
                <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
                  触发时间
                </Text>

              {selectedTask.fixed_time ? (
                <Banner
                  fullMode={false}
                  type="info"
                  bordered
                  description={
                    <span style={{ fontSize: 12 }}>
                      {selectedTask.task_id === 'dual_rebate_monitor'
                        ? `固定时段: ${selectedTask.time_label || '固定时段巡检'}，可在下方「高级参数」中修改固定时间段。`
                        : `固定时段: ${selectedTask.time_label || '系统自动轮询'}，到点自动触发，无需设置。`}
                    </span>
                  }
                />
              ) : (
                <>
                  <Input
                    value={drawerCronTime}
                    onChange={(v) => setDrawerCronTime(v)}
                    placeholder="例如: 09:30"
                    style={{ marginBottom: 8 }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text type="tertiary" size="small">
                      推荐:
                    </Text>
                    {['00:00', '07:40', '09:00', '09:15', '10:00', '11:00', '12:00', '14:00', '22:05'].map((t) => (
                      <Tag
                        key={t}
                        color="blue"
                        size="small"
                        onClick={() => setDrawerCronTime(t)}
                        style={{ cursor: 'pointer' }}
                      >
                        {t}
                      </Tag>
                    ))}
                  </div>
                </>
              )}
            </div>
            )}

            {/* 动态参数项 */}
            {selectedTask.task_id === 'flash_sale' ? (
              <FlashSaleDrawerConfig
                accountKey={currentAccountKey}
                accounts={accounts}
                drawerParams={drawerParams}
                setDrawerParams={setDrawerParams}
              />
            ) : selectedTask.param_defs && selectedTask.param_defs.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Text strong style={{ fontSize: 13 }}>
                  高级参数
                </Text>

                {selectedTask.param_defs.map((pd) => {
                  const val = drawerParams[pd.key] ?? pd.def;

                  if (pd.type === 'multi_select' || (pd.type === 'select' && (pd as any).multiple)) {
                    const selectedList: string[] = Array.isArray(val)
                      ? val
                      : (typeof val === 'string' && val.trim() ? val.split(',').map((s) => s.trim()) : []);

                    
                    return (
                      <div
                        key={pd.key}
                        style={{
                          backgroundColor: 'var(--semi-color-fill-0)',
                          padding: '12px 14px',
                          borderRadius: 'var(--semi-border-radius-medium)',
                          border: '1px solid var(--semi-color-border)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <Text strong style={{ fontSize: 13 }}>
                            {pd.label.replace(/[（(][^）)]*[）)]/g, '').trim()}
                          </Text>
                          <Tag color={selectedList.length > 0 ? 'violet' : 'grey'} size="small">
                            {selectedList.length > 0 ? `已选择 ${selectedList.length} 款` : '未选定'}
                          </Tag>
                        </div>

                        <Select
                          multiple
                          value={selectedList}
                          onChange={(newVal) => setDrawerParams((prev) => ({ ...prev, [pd.key]: newVal }))}
                          style={{ width: '100%', marginBottom: selectedTask.task_id === 'flash_sale' && pd.key === 'target_products' ? 12 : 0 }}
                          placeholder="请勾选需要秒杀的商品（支持多选）"
                        >
                          {(pd.options || []).map((opt) => (
                            <Select.Option key={String(opt.value)} value={opt.value}>
                              {opt.label}
                            </Select.Option>
                          ))}
                        </Select>

                        {pd.hint && (
                          <Text type="tertiary" size="small" style={{ display: 'block', marginTop: 8, lineHeight: '18px' }}>
                            {pd.hint.replace(/[（(][^）)]*[）)]/g, '').trim()}
                          </Text>
                        )}
                      </div>
                    );
                  }

                  if (pd.type === 'select') {
                    let selectVal = val;
                    if (pd.key === 'interval_minutes' && selectedTask.task_id === 'dual_rebate_monitor') {
                      const numVal = Number(val);
                      selectVal = [30, 60, 120].includes(numVal) ? numVal : 60;
                    }

                    return (
                      <div
                        key={pd.key}
                        style={{
                          backgroundColor: 'var(--semi-color-fill-0)',
                          padding: '12px 14px',
                          borderRadius: 'var(--semi-border-radius-medium)',
                          border: '1px solid var(--semi-color-border)',
                        }}
                      >
                        <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
                          {pd.label.replace(/[（(][^）)]*[）)]/g, '').trim()}
                        </Text>
                        <Select
                          value={selectVal}
                          onChange={(newVal) => handleSelectParamChange(pd.key, newVal, selectVal)}
                          style={{ width: '100%' }}
                        >
                          {(pd.options || []).map((opt) => (
                            <Select.Option key={String(opt.value)} value={opt.value}>
                              {opt.label}
                            </Select.Option>
                          ))}
                        </Select>
                        {pd.hint && (
                          <Text type="tertiary" size="small" style={{ display: 'block', marginTop: 4 }}>
                            {pd.hint}
                          </Text>
                        )}
                      </div>
                    );
                  }

                  if (pd.type === 'check' || pd.type === 'boolean') {
                    const isChecked = Boolean(val);
                    return (
                      <div
                        key={pd.key}
                        onClick={() =>
                          setDrawerParams((prev) => ({ ...prev, [pd.key]: !isChecked }))
                        }
                        className="group transition-all hover:bg-semi-color-fill-1 hover:border-semi-color-primary-light-active"
                        style={{
                          backgroundColor: 'var(--semi-color-fill-0)',
                          padding: '12px 14px',
                          borderRadius: 'var(--semi-border-radius-medium)',
                          border: '1px solid var(--semi-color-border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 16,
                          cursor: 'pointer',
                          userSelect: 'none',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            strong
                            style={{
                              fontSize: 13,
                              display: 'block',
                              lineHeight: '20px',
                              color: 'var(--semi-color-text-0)',
                            }}
                          >
                            {pd.label.replace(/[（(][^）)]*[）)]/g, '').trim()}
                          </Text>
                          {pd.hint && (
                            <Text
                              type="tertiary"
                              size="small"
                              style={{
                                display: 'block',
                                marginTop: 4,
                                lineHeight: '18px',
                                wordBreak: 'break-word',
                              }}
                            >
                              {pd.hint.replace(/[（(][^）)]*[）)]/g, '').trim()}
                            </Text>
                          )}
                        </div>
                        <div
                          style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        >
                          <Switch
                            checked={isChecked}
                            onChange={(checked) =>
                              setDrawerParams((prev) => ({ ...prev, [pd.key]: checked }))
                            }
                          />
                        </div>
                      </div>
                    );
                  }

                  if (pd.type === 'number') {
                    return (
                      <div
                        key={pd.key}
                        style={{
                          backgroundColor: 'var(--semi-color-fill-0)',
                          padding: '12px 14px',
                          borderRadius: 'var(--semi-border-radius-medium)',
                          border: '1px solid var(--semi-color-border)',
                        }}
                      >
                        <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
                          {pd.label.replace(/[（(][^）)]*[）)]/g, '').trim()}
                        </Text>
                        <InputNumber
                          value={Number(val)}
                          step={pd.step ? Number(pd.step) : 1}
                          min={pd.min !== undefined ? Number(pd.min) : 0}
                          max={pd.max !== undefined ? Number(pd.max) : undefined}
                          onChange={(v) => setDrawerParams((prev) => ({ ...prev, [pd.key]: v }))}
                          style={{ width: '100%' }}
                        />
                        {pd.hint && (
                          <Text type="tertiary" size="small" style={{ display: 'block', marginTop: 4 }}>
                            {pd.hint.replace(/[（(][^）)]*[）)]/g, '').trim()}
                          </Text>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={pd.key}
                      style={{
                        backgroundColor: 'var(--semi-color-fill-0)',
                        padding: '12px 14px',
                        borderRadius: 'var(--semi-border-radius-medium)',
                        border: '1px solid var(--semi-color-border)',
                      }}
                    >
                      <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
                        {pd.label.replace(/[（(][^）)]*[）)]/g, '').trim()}
                      </Text>
                      <Input
                        value={String(val ?? '')}
                        onChange={(v) => setDrawerParams((prev) => ({ ...prev, [pd.key]: v }))}
                        placeholder={pd.hint ? pd.hint.replace(/[（(][^）)]*[）)]/g, '').trim() : `请输入 ${pd.label.replace(/[（(][^）)]*[）)]/g, '').trim()}`}
                      />
                      {pd.hint && (
                        <Text type="tertiary" size="small" style={{ display: 'block', marginTop: 4 }}>
                          {pd.hint}
                        </Text>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                style={{
                  backgroundColor: 'var(--semi-color-fill-0)',
                  padding: '16px',
                  borderRadius: 'var(--semi-border-radius-medium)',
                  border: '1px solid var(--semi-color-border)',
                  textAlign: 'center',
                }}
              >
                <Text type="secondary" size="small">
                  此任务无需额外自定义参数。
                </Text>
              </div>
            )}

            {/* 同步全部账号选项 (系统多于1个账号时展示卡片式开关，仅1个账号时完全隐藏) */}
            {accounts.length > 1 && selectedTask.task_id !== 'flash_sale' && (
              <div
                style={{
                  marginTop: 16,
                  padding: '12px 14px',
                  backgroundColor: 'var(--semi-color-fill-0)',
                  borderRadius: 'var(--semi-border-radius-medium)',
                  border: '1px solid var(--semi-color-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  userSelect: 'none',
                  transition: 'border-color 0.2s, background-color 0.2s',
                }}
                onClick={() => setDrawerApplyAllAccounts(!drawerApplyAllAccounts)}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Text strong size="small" style={{ color: 'var(--semi-color-text-0)' }}>
                    应用到全部托管账号
                  </Text>
                  <Text type="tertiary" size="small">
                    保存时将此配置同步应用至当前托管的全部 {accounts.length} 个账号
                  </Text>
                </div>
                <Checkbox
                  checked={drawerApplyAllAccounts}
                  onChange={(e) => setDrawerApplyAllAccounts(Boolean(e?.target?.checked))}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                />
              </div>
            )}
          </div>
        )}
      </SideSheet>

      {/* 修改触发时间弹窗 */}
      <Modal
        title={`修改时间 - ${timeEditingTask?.label || ''}`}
        visible={timeModalVisible}
        onCancel={() => setTimeModalVisible(false)}
        onOk={handleSaveQuickTime}
        okText="保存时间"
        cancelText="取消"
        width={400}
        centered
      >
        <div style={{ padding: '8px 0' }}>
          <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
            定时执行时间
          </Text>
          <Input
            value={editingTimeValue}
            onChange={(v) => setEditingTimeValue(v)}
            placeholder="例如: 22:05"
            style={{ marginBottom: 12 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            <Text type="tertiary" size="small">
              推荐:
            </Text>
            {['00:00', '07:40', '09:00', '09:15', '10:00', '11:00', '12:00', '14:00', '22:05', '23:58'].map((t) => (
              <Tag
                key={t}
                color="blue"
                size="small"
                onClick={() => setEditingTimeValue(t)}
                style={{ cursor: 'pointer' }}
              >
                {t}
              </Tag>
            ))}
          </div>

          {accounts.length > 1 && (
            <div
              style={{
                marginTop: 14,
                padding: '10px 12px',
                backgroundColor: 'var(--semi-color-fill-0)',
                borderRadius: 'var(--semi-border-radius-medium)',
                border: '1px solid var(--semi-color-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'border-color 0.2s, background-color 0.2s',
              }}
              onClick={() => setTimeApplyAllAccounts(!timeApplyAllAccounts)}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Text strong size="small" style={{ color: 'var(--semi-color-text-0)' }}>
                  应用到全部托管账号
                </Text>
                <Text type="tertiary" size="small">
                  保存时同步将该时间应用到全部 {accounts.length} 个账号
                </Text>
              </div>
              <Checkbox
                checked={timeApplyAllAccounts}
                onChange={(e) => setTimeApplyAllAccounts(Boolean(e?.target?.checked))}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
              />
            </div>
          )}
        </div>
      </Modal>

      {/* 批量打卡结果汇总 */}
      <Modal
        title="日常任务执行结果"
        visible={batchResultModal}
        onCancel={() => setBatchResultModal(false)}
        footer={
          <Button theme="solid" type="primary" onClick={() => setBatchResultModal(false)}>
            确认
          </Button>
        }
        width={640}
        centered
      >
        <div style={{ padding: '6px 0' }}>
          <Banner
            fullMode={false}
            type={batchResults.length > 0 && batchResults.every(r => r.ok) ? 'success' : 'warning'}
            bordered
            description={batchSummaryMessage}
            style={{ marginBottom: 14 }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 420, overflowY: 'auto' }}>
            {batchResults.map((r, idx) => (
              <div
                key={idx}
                style={{
                  backgroundColor: 'var(--semi-color-fill-0)',
                  padding: '12px',
                  borderRadius: 'var(--semi-border-radius-medium)',
                  border: '1px solid var(--semi-color-border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text strong style={{ fontSize: 13 }}>
                    {r.label}
                  </Text>
                  {r.ok ? (
                    <Tag color="green" size="small" prefixIcon={<IconCheckCircleStroked />}>
                      成功
                    </Tag>
                  ) : (
                    <Tag color="red" size="small" prefixIcon={<IconAlertCircle />}>
                      失败
                    </Tag>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    
                    color: 'var(--semi-color-text-2)',
                    whiteSpace: 'pre-wrap',
                    backgroundColor: 'var(--semi-color-bg-0)',
                    padding: '8px',
                    borderRadius: 'var(--semi-border-radius-small)',
                    border: '1px solid var(--semi-color-border)',
                  }}
                >
                  {r.output}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* 统一单次任务执行日志弹窗 */}


      <LogDetailModal
        visible={execResultModal}
        onClose={() => setExecResultModal(false)}
        customTitle={execTitle}
        customTaskId={runningTaskId || undefined}
        customAccountKey={currentAccountKey}
        customCreatedAt={new Date().toLocaleTimeString()}
        customStatus={execTitle.includes('成功') ? 'success' : 'error'}
        customOutput={execOutput}
      />
    </div>
  );
};
