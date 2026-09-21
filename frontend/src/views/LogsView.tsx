import React, { useEffect, useState, useRef } from 'react';
import {
  Card,
  Typography,
  Tag,
  Button,
  Space,
  Table,
  Select,
  Toast,
  Empty,
  Modal,
  Avatar,
  Popconfirm,
  Tooltip,
  RadioGroup,
  Radio
} from '@douyinfe/semi-ui';
import {
  IconRefresh,
  IconDelete,
  IconClock,
  IconCopy,
  IconFile,
  IconCheckCircleStroked,
  IconAlertCircle,
  IconList,
  IconSpin
} from '@douyinfe/semi-icons';
import { useAppStore } from '../store/useAppStore';
import { api } from '../api';
import { TaskIcon } from '../components/TaskIcons';
import { useOnActivated } from '../utils/useOnActivated';
import type { JobLog } from '../types';

const { Title, Text } = Typography;

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

const STORE_TASK_KEYS = new Set([
  'store_grab',
  'store_appoint',
  'store_monitor',
  'store_keyword',
  'store_search',
  'store_cancel',
]);

export const LogsView: React.FC = () => {
  const accounts = useAppStore((s) => s.accounts);
  const [logs, setLogs] = useState<JobLog[]>([]);
  const [filterAccount, setFilterAccount] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(false);
  const [clearing, setClearing] = useState<boolean>(false);

  // 表格与视口自适应高度
  const containerRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [tableScrollY, setTableScrollY] = useState<number>(460);

  // 详情弹窗
  const [detailModalVisible, setDetailModalVisible] = useState<boolean>(false);
  const [activeLog, setActiveLog] = useState<JobLog | null>(null);

  // 纯净视口高度自适应：杜绝 DOM querySelector 与强制同步重排
  useEffect(() => {
    const updateHeight = () => {
      if (!tableContainerRef.current) return;
      const ch = tableContainerRef.current.clientHeight;
      if (ch > 100) {
        // 预留表头(44px)与分页条(48px)空间(约96px)
        const targetH = Math.max(260, ch - 96);
        setTableScrollY((prev) => (Math.abs(prev - targetH) > 12 ? targetH : prev));
      }
    };

    updateHeight();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && tableContainerRef.current) {
      ro = new ResizeObserver(() => {
        updateHeight();
      });
      ro.observe(tableContainerRef.current);
    }

    window.addEventListener('resize', updateHeight);
    return () => {
      window.removeEventListener('resize', updateHeight);
      ro?.disconnect();
    };
  }, []);

  const lastLogsSignatureRef = useRef<string>('');
  const inFlightLogsRef = useRef<boolean>(false);

  const fetchLogs = async (silent = false, force = false) => {
    const queryKey = filterAccount || 'all';
    if (!silent && !force && lastLogsSignatureRef.current === queryKey) {
      return;
    }
    if (inFlightLogsRef.current) return;
    inFlightLogsRef.current = true;
    if (!silent) {
      setLoading(true);
      lastLogsSignatureRef.current = queryKey;
    }
    try {
      const res = await api.getJobs(filterAccount || undefined, 150);
      if (res.ok) {
        setLogs(res.jobs || []);
      }
    } catch (e) {
      if (!silent) {
        lastLogsSignatureRef.current = '';
        Toast.error('拉取日志失败');
      }
    } finally {
      inFlightLogsRef.current = false;
      if (!silent) setLoading(false);
    }
  };

  const handleClearLogs = async () => {
    setClearing(true);
    try {
      const res = await api.clearJobs(filterAccount || undefined);
      if (res.ok) {
        Toast.success('运行日志已清空');
        setLogs([]);
      }
    } catch (e) {
      Toast.error('清空日志失败');
    } finally {
      setClearing(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [filterAccount]);

  // 页面切入激活时自动拉取最新运行日志
  useOnActivated('logs', () => {
    fetchLogs(logs.length > 0, true);
  }, { throttleMs: 2500 });

  // 当存在「执行中」任务时，自动每 3 秒静默轮询更新日志流（后台非活跃时自动挂起）
  const hasRunning = logs.some(l => l.status === 'running');

  useEffect(() => {
    if (!hasRunning) return;

    const interval = setInterval(() => {
      if (useAppStore.getState().activeTab !== 'logs') return;
      fetchLogs(true, true);
    }, 3000);

    return () => clearInterval(interval);
  }, [hasRunning, filterAccount]);

  const handleOpenDetail = (log: JobLog) => {
    setActiveLog(log);
    setDetailModalVisible(true);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard?.writeText(text);
    Toast.success('日志内容已复制到剪贴板');
  };

  const filteredLogs = logs.filter(item => {
    if (filterStatus !== 'all' && item.status !== filterStatus) {
      return false;
    }
    if (filterCategory === 'store') {
      return STORE_TASK_KEYS.has(item.task_id);
    }
    if (filterCategory === 'daily') {
      return !STORE_TASK_KEYS.has(item.task_id);
    }
    return true;
  });

  const columns = [
    {
      title: '序号',
      dataIndex: 'id',
      width: 70,
      align: 'center' as const,
      render: (id: number) => <span className="font-mono text-xs text-semi-color-text-2">{id}</span>,
    },
    {
      title: '执行时间',
      dataIndex: 'created_at',
      width: 175,
      render: (t: string) => (
        <Space spacing="tight" align="center">
          <IconClock size="small" className="text-semi-color-text-3 shrink-0" />
          <span className="font-mono text-xs text-semi-color-text-1 whitespace-nowrap">{t}</span>
        </Space>
      ),
    },
    {
      title: '执行账号',
      dataIndex: 'account_key',
      width: 170,
      render: (key: string) => {
        const acc = accounts.find(a => a.key === key);
        const name = acc?.nickname || key;
        return (
          <div className="flex items-center gap-2 max-w-full">
            <Avatar size="extra-small" color="orange" src={acc?.avatar || undefined} className="shrink-0">
              {acc?.nickname?.[0] || '蚕'}
            </Avatar>
            <Tooltip content={`账号: ${name} (Key: ${key})`}>
              <Text ellipsis={{ showTooltip: false }} className="font-medium text-xs text-semi-color-text-0 truncate">
                {name}
              </Text>
            </Tooltip>
          </div>
        );
      },
    },
    {
      title: '任务类别与名称',
      dataIndex: 'task_id',
      width: 230,
      render: (tid: string) => {
        const label = TASK_LABELS[tid] || tid;
        const isStore = STORE_TASK_KEYS.has(tid);
        return (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-semi-color-fill-0 p-0.5 flex items-center justify-center shrink-0">
              <TaskIcon taskId={tid} className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold text-xs text-semi-color-text-0 leading-tight">
                  {label}
                </span>
                <Tag color={isStore ? 'red' : 'blue'} size="small" shape="square" className="scale-90 origin-left">
                  {isStore ? '抢单预约' : '日常调度'}
                </Tag>
              </div>
              <span className="text-[10px] text-semi-color-text-3 font-mono block truncate">
                {tid}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      title: '执行状态',
      dataIndex: 'status',
      width: 95,
      align: 'center' as const,
      render: (st: string) => {
        if (st === 'running') {
          return (
            <Tag
              color="blue"
              size="small"
              shape="circle"
              prefixIcon={<IconSpin spin />}
            >
              执行中
            </Tag>
          );
        }
        return (
          <Tag
            color={st === 'success' ? 'green' : 'red'}
            size="small"
            shape="circle"
            prefixIcon={st === 'success' ? <IconCheckCircleStroked /> : <IconAlertCircle />}
          >
            {st === 'success' ? '成功' : '失败'}
          </Tag>
        );
      },
    },
    {
      title: '执行步骤与摘要 (点击展开详情流水)',
      dataIndex: 'output',
      render: (out: string, record: JobLog) => {
        const rawLines = (out || '').split('\n').map(l => (l || '').trim()).filter(Boolean);
        const stepCount = rawLines.length;

        // 优先提取最关键的结论行（错误原因、异常信息、成功结果或最新执行行）
        let keyLine = '';
        if (record.status === 'running') {
          // 执行中时优先展示最后一行（即当前正在进行的检测、轮询或预热状态）
          keyLine = rawLines[rawLines.length - 1] || '任务正在自适应调度执行中...';
        } else if (record.status === 'error') {
          // 优先抓取官方响应失败、异常或未成功原因
          keyLine = rawLines.find(l => l.includes('异常') || l.includes('返回失败') || l.includes('未成功') || l.includes('错误码')) || '';
          if (!keyLine) {
            keyLine = rawLines.find(l => l.includes('失败')) || '';
          }
        } else {
          // 成功时优先抓取锁定订单或完成信息
          keyLine = rawLines.find(l => l.includes('成功锁定') || l.includes('抢单成功') || l.includes('打卡成功') || l.includes('完成')) || '';
        }

        if (!keyLine) {
          // 兜底找非纯初始化的步骤行
          keyLine = rawLines.find(l => !l.includes('启动抢单流水') && !l.includes('步骤 1/')) || rawLines[rawLines.length - 1] || rawLines[0] || '—';
        }

        return (
          <div
            onClick={() => handleOpenDetail(record)}
            className="group cursor-pointer bg-semi-color-fill-0 hover:bg-semi-color-fill-1 border border-semi-color-border/70 hover:border-semi-color-primary-light-active px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-all"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Tag color={record.status === 'error' ? 'red' : 'cyan'} size="small" shape="square" className="shrink-0 scale-90">
                {stepCount > 1 ? `${stepCount}步` : '结果'}
              </Tag>
              <Text
                ellipsis={{ showTooltip: true }}
                className={`font-mono text-xs flex-1 min-w-0 ${record.status === 'error' ? 'text-red-500 font-medium' : 'text-semi-color-text-1 group-hover:text-semi-color-text-0'}`}
              >
                {keyLine}
              </Text>
            </div>
            <span className="text-[11px] text-semi-color-primary shrink-0 ml-2 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5 whitespace-nowrap">
              步骤详情 ›
            </span>
          </div>
        );
      },
    },
    {
      title: '操作',
      dataIndex: 'actions',
      width: 100,
      fixed: 'right' as const,
      align: 'center' as const,
      render: (_: any, record: JobLog) => (
        <div className="w-full flex justify-center items-center">
          <Button
            theme="light"
            type="tertiary"
            size="small"
            icon={<IconFile />}
            onClick={() => handleOpenDetail(record)}
            className="text-xs"
          >
            详情
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div ref={containerRef} className="w-full flex flex-col h-full min-h-0 space-y-3">
      {/* 注入表格撑满视口、绝对固定高度与分页器规范样式 */}
      <style>{`
        .logs-table-container .semi-table-body {
          height: var(--table-scroll-y) !important;
          min-height: var(--table-scroll-y) !important;
          max-height: var(--table-scroll-y) !important;
          overflow-y: auto !important;
          contain: content;
          will-change: transform;
          transform: translateZ(0);
          -webkit-overflow-scrolling: touch;
        }
        .logs-table-container .semi-table-row-cell-fixed-right,
        .logs-table-container .semi-table-header-cell-fixed-right {
          text-align: center !important;
        }
        .logs-table-container .semi-table-row-cell-fixed-right > .semi-table-row-cell-render-content {
          display: flex !important;
          justify-content: center !important;
          align-items: center !important;
          width: 100% !important;
        }
        .logs-table-container .semi-table-placeholder {
          min-height: var(--table-scroll-y) !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        .logs-table-container .semi-spin-wrapper {
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          justify-content: center !important;
          position: absolute !important;
          top: 50% !important;
          left: 50% !important;
          transform: translate(-50%, -50%) !important;
          width: auto !important;
          height: auto !important;
          z-index: 10 !important;
        }
        .logs-table-container .semi-table-pagination-outer {
          padding: 10px 16px !important;
          margin: 0 !important;
          margin-top: auto !important;
          flex-shrink: 0 !important;
          border-top: 1px solid var(--semi-color-border) !important;
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          background-color: var(--semi-color-bg-0) !important;
        }
      `}</style>

      {/* 顶部标题与筛选控制栏 */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <Title heading={3} className="m-0">系统运行日志</Title>
            <Tag color="blue" size="small" shape="circle">共 {filteredLogs.length} 条记录</Tag>
          </div>
          <Text type="secondary" size="small" className="mt-1 block">
            全流程追踪即时抢单、预约毫秒秒杀、实时捡漏监听、日常打卡及资产提现高精步骤流水
          </Text>
        </div>

        <Space wrap>
          {/* 分类筛选 */}
          <RadioGroup
            type="button"
            buttonSize="middle"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <Radio value="all">全部分类</Radio>
            <Radio value="store">抢单与预约</Radio>
            <Radio value="daily">日常自动化</Radio>
          </RadioGroup>

          <Select
            value={filterAccount}
            onChange={(v) => setFilterAccount(String(v))}
            placeholder="筛选账号"
            style={{ width: 175 }}
            renderSelectedItem={(optionNode: any) => {
              const val = optionNode?.value;
              if (!val) {
                return (
                  <div className="flex items-center gap-1.5 text-xs">
                    <Avatar size="extra-extra-small" color="blue" shape="square">全</Avatar>
                    <span className="font-medium">全部账号</span>
                  </div>
                );
              }
              const acc = accounts.find(a => a.key === val);
              return (
                <div className="flex items-center gap-1.5 text-xs truncate">
                  <Avatar size="extra-extra-small" src={acc?.avatar || undefined} color="orange">
                    {acc?.nickname?.[0] || '蚕'}
                  </Avatar>
                  <span className="truncate">{acc?.nickname || val}</span>
                </div>
              );
            }}
          >
            <Select.Option value="">
              <div className="flex items-center gap-2 py-0.5">
                <Avatar size="extra-extra-small" color="blue" shape="square">全</Avatar>
                <span className="text-xs font-medium">全部账号 (汇总)</span>
              </div>
            </Select.Option>
            {accounts.map(a => (
              <Select.Option key={a.key} value={a.key}>
                <div className="flex items-center gap-2 py-0.5">
                  <Avatar size="extra-extra-small" src={a.avatar || undefined} color="orange">
                    {a.nickname?.[0] || '蚕'}
                  </Avatar>
                  <span className="truncate flex-1 text-xs">{a.nickname}</span>
                </div>
              </Select.Option>
            ))}
          </Select>

          <Select
            value={filterStatus}
            onChange={(v) => setFilterStatus(String(v))}
            style={{ width: 110 }}
          >
            <Select.Option value="all">全部状态</Select.Option>
            <Select.Option value="running">仅执行中</Select.Option>
            <Select.Option value="success">仅成功</Select.Option>
            <Select.Option value="error">仅失败</Select.Option>
          </Select>

          <Button
            theme="light"
            type="tertiary"
            icon={<IconRefresh />}
            loading={loading}
            onClick={() => fetchLogs(false, true)}
          >
            刷新
          </Button>

          <Popconfirm
            title="确定清空运行日志？"
            content="清空后历史调度与抢单步骤流水将无法恢复。"
            onConfirm={handleClearLogs}
            okText="确认清空"
            cancelText="取消"
            okType="danger"
          >
            <Button
              theme="light"
              type="danger"
              icon={<IconDelete />}
              loading={clearing}
              disabled={logs.length === 0}
            >
              清空
            </Button>
          </Popconfirm>
        </Space>
      </div>

      {/* 主体卡片容器：撑满视口垂直空间，消除底部与空数据时的塌陷 */}
      <Card
        className="flex-1 min-h-0 flex flex-col rounded-xl border border-semi-color-border shadow-xs overflow-hidden bg-semi-color-bg-0"
        bodyStyle={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: 0 }}
      >
        <div
          ref={tableContainerRef}
          className="logs-table-container relative flex-1 min-h-0 flex flex-col overflow-hidden"
          style={{
            ['--table-scroll-y' as any]: `${tableScrollY}px`
          }}
        >
          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredLogs}
            loading={loading}
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              pageSizeOpts: [10, 20, 50, 100],
            }}
            scroll={{ y: tableScrollY, x: 1060 }}
            size="middle"
            empty={
              loading ? (
                <div className="py-20 text-center flex flex-col items-center justify-center m-auto">
                  <div className="text-sm font-medium text-semi-color-text-0 mt-8">
                    正在加载运行日志流水...
                  </div>
                </div>
              ) : (
                <div className="py-16 text-center flex flex-col items-center justify-center m-auto">
                  <Empty
                    title="暂无运行日志记录"
                    description="系统在执行店铺抢单、倒计时预约、实时名额监听、自动提现或每日任务时，将实时记录详细步骤流水"
                  />
                </div>
              )
            }
          />
        </div>
      </Card>

      {/* 完整日志步骤详情回显弹窗 */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            {activeLog && <TaskIcon taskId={activeLog.task_id} className="w-6 h-6" />}
            <span>日志详情 - [{TASK_LABELS[activeLog?.task_id || ''] || activeLog?.task_id}]</span>
          </div>
        }
        visible={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={
          <div className="flex justify-between items-center w-full">
            <Button
              theme="light"
              type="tertiary"
              icon={<IconCopy />}
              onClick={() => handleCopy(activeLog?.output || '')}
            >
              复制全部日志
            </Button>
            <Button theme="solid" type="primary" onClick={() => setDetailModalVisible(false)}>
              关闭
            </Button>
          </div>
        }
        width={680}
        centered
      >
        {activeLog && (
          <div className="space-y-3 pt-1">
            {/* 元信息条 */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-semi-color-fill-0 border border-semi-color-border text-xs">
              <Space>
                <Text type="secondary">执行时间：</Text>
                <span className="font-mono text-semi-color-text-0">{activeLog.created_at}</span>
              </Space>
              <Space>
                <Text type="secondary">账号：</Text>
                <span className="font-semibold text-semi-color-text-0">
                  {accounts.find(a => a.key === activeLog.account_key)?.nickname || activeLog.account_key}
                </span>
              </Space>
              <Space>
                <Text type="secondary">状态：</Text>
                <Tag
                  color={activeLog.status === 'running' ? 'blue' : (activeLog.status === 'success' ? 'green' : 'red')}
                  size="small"
                  prefixIcon={activeLog.status === 'running' ? <IconSpin spin /> : undefined}
                >
                  {activeLog.status === 'running' ? '正在执行中' : (activeLog.status === 'success' ? '执行成功' : '执行失败')}
                </Tag>
              </Space>
              <Space>
                <Text type="secondary">任务标识：</Text>
                <span className="font-mono text-semi-color-text-2">{activeLog.task_id}</span>
              </Space>
            </div>

            {/* 步骤流水结构化可视化解析 */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-semi-color-text-1 font-medium">
                <IconList size="small" />
                <span>详细执行步骤过程：</span>
              </div>
              <div className="bg-[#1e1e1e] text-[#d4d4d4] p-4 rounded-xl font-mono text-[12px] max-h-[380px] overflow-y-auto whitespace-pre-wrap leading-relaxed shadow-inner">
                {activeLog.output ? (
                  activeLog.output.split('\n').map((line, idx) => {
                    const isStep = line.includes('步骤');
                    const isSuccess = line.includes('成功');
                    const isError = line.includes('失败') || line.includes('异常') || line.includes('未成功');
                    const isRunning = line.includes('正在') || line.includes('检测') || line.includes('预热') || line.includes('持续');
                    let color = '#d4d4d4';
                    if (isStep) color = '#79b8ff';
                    else if (isSuccess) color = '#7ee787';
                    else if (isError) color = '#ff7b72';
                    else if (isRunning) color = '#f9d770';

                    return (
                      <div key={idx} style={{ color }} className="py-0.5">
                        {line}
                      </div>
                    );
                  })
                ) : (
                  '无日志内容'
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

