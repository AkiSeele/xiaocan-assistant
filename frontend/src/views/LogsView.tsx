import React, { useEffect, useState } from 'react';
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
  Tooltip
} from '@douyinfe/semi-ui';
import {
  IconRefresh,
  IconDelete,
  IconClock,
  IconCopy,
  IconFile,
  IconCheckCircleStroked,
  IconAlertCircle
} from '@douyinfe/semi-icons';
import { useAppStore } from '../store/useAppStore';
import { api } from '../api';
import { TaskIcon } from '../components/TaskIcons';
import type { JobLog } from '../types';

const { Title, Text } = Typography;

const TASK_LABELS: Record<string, string> = {
  daily: '元宝乐园每日任务',
  yb_lottery: '元宝抽大奖',
  group_lottery: '社群幸运转盘',
  free_lottery: '免费开红包',
  redpack_rain: '整点红包雨',
  flash_sale: '元宝秒杀抢券',
  vip_expand: '会员每日签到',
  brand_flash: '大牌畅享秒杀',
  svip_rebate: 'SVIP高额返利券',
  media_vip: '影音会员周卡',
  free_order: '订单全额免单券',
  today_stats: '本日数据统计',
  alipay_withdraw: '支付宝自动提现',
  expire_remind: '凭据/JWT到期预警',
  coupon_remind: '卡券/红包到期提醒',
};

export const LogsView: React.FC = () => {
  const { currentAccountKey, accounts } = useAppStore();
  const [logs, setLogs] = useState<JobLog[]>([]);
  const [filterAccount, setFilterAccount] = useState<string>(currentAccountKey || '');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(false);
  const [clearing, setClearing] = useState<boolean>(false);

  // 详情弹窗
  const [detailModalVisible, setDetailModalVisible] = useState<boolean>(false);
  const [activeLog, setActiveLog] = useState<JobLog | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await api.getJobs(filterAccount || undefined, 100);
      if (res.ok) {
        setLogs(res.jobs || []);
      }
    } catch (e) {
      Toast.error('拉取日志失败');
    } finally {
      setLoading(false);
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

  const handleOpenDetail = (log: JobLog) => {
    setActiveLog(log);
    setDetailModalVisible(true);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard?.writeText(text);
    Toast.success('日志内容已复制到剪贴板');
  };

  const filteredLogs = logs.filter(item => {
    if (filterStatus === 'all') return true;
    return item.status === filterStatus;
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
      width: 165,
      render: (t: string) => (
        <Space spacing="tight" align="center">
          <IconClock size="small" className="text-semi-color-text-3" />
          <span className="font-mono text-xs text-semi-color-text-1">{t}</span>
        </Space>
      ),
    },
    {
      title: '执行账号',
      dataIndex: 'account_key',
      width: 150,
      render: (key: string) => {
        const acc = accounts.find(a => a.key === key);
        return (
          <div className="flex items-center gap-2">
            <Avatar size="extra-small" color="orange" src={acc?.avatar || undefined}>
              {acc?.nickname?.[0] || '蚕'}
            </Avatar>
            <Tooltip content={`账号Key: ${key}`}>
              <Text ellipsis={{ showTooltip: false }} style={{ maxWidth: 95 }} className="font-medium text-xs text-semi-color-text-0">
                {acc?.nickname || key}
              </Text>
            </Tooltip>
          </div>
        );
      },
    },
    {
      title: '任务名称',
      dataIndex: 'task_id',
      width: 190,
      render: (tid: string) => {
        const label = TASK_LABELS[tid] || tid;
        return (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-semi-color-fill-0 p-0.5 flex items-center justify-center shrink-0">
              <TaskIcon taskId={tid} className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-xs text-semi-color-text-0 leading-none truncate">
                {label}
              </div>
              <span className="text-[10px] text-semi-color-text-3 font-mono">
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
      width: 90,
      align: 'center' as const,
      render: (st: string) => (
        <Tag
          color={st === 'success' ? 'green' : 'red'}
          size="small"
          shape="circle"
          prefixIcon={st === 'success' ? <IconCheckCircleStroked /> : <IconAlertCircle />}
        >
          {st === 'success' ? '成功' : '失败'}
        </Tag>
      ),
    },
    {
      title: '执行日志摘要',
      dataIndex: 'output',
      render: (out: string, record: JobLog) => {
        const lines = (out || '').split('\n').map(l => l.trim()).filter(Boolean);
        // 抓取非模板头部和尾部的核心摘要行
        const summary = lines.find(l => !l.includes('开始执行任务') && !l.includes('全部流程处理完毕')) || lines[0] || '—';

        return (
          <div
            onClick={() => handleOpenDetail(record)}
            className="group cursor-pointer bg-semi-color-fill-0 hover:bg-semi-color-fill-1 border border-semi-color-border/60 hover:border-semi-color-primary-light-active px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-all"
          >
            <Text
              ellipsis={{ showTooltip: true }}
              className="font-mono text-xs text-semi-color-text-1 group-hover:text-semi-color-text-0 flex-1 min-w-0"
              style={{ maxWidth: 420 }}
            >
              {summary}
            </Text>
            <span className="text-[11px] text-semi-color-primary shrink-0 ml-2 group-hover:translate-x-0.5 transition-transform">
              详情 ›
            </span>
          </div>
        );
      },
    },
    {
      title: '操作',
      dataIndex: 'actions',
      width: 90,
      fixed: 'right' as const,
      align: 'center' as const,
      render: (_: any, record: JobLog) => (
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
      ),
    },
  ];

  return (
    <div className="w-full flex flex-col h-full space-y-4">
      {/* 顶部标题与控制栏 */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <Title heading={3} className="m-0">系统运行日志</Title>
            <Tag color="blue" size="small" shape="circle">共 {filteredLogs.length} 条记录</Tag>
          </div>
          <Text type="secondary" size="small" className="mt-1 block">
            实时追踪每日打卡、大牌秒杀请求、店铺预约抢单与资产提现详细流水
          </Text>
        </div>

        <Space wrap>
          <Select
            value={filterAccount}
            onChange={(v) => setFilterAccount(String(v))}
            placeholder="筛选账号"
            style={{ width: 170 }}
          >
            <Select.Option value="">全部账号</Select.Option>
            {accounts.map(a => (
              <Select.Option key={a.key} value={a.key}>
                {a.nickname}
              </Select.Option>
            ))}
          </Select>

          <Select
            value={filterStatus}
            onChange={(v) => setFilterStatus(String(v))}
            style={{ width: 110 }}
          >
            <Select.Option value="all">全部状态</Select.Option>
            <Select.Option value="success">仅成功</Select.Option>
            <Select.Option value="error">仅失败</Select.Option>
          </Select>

          <Button
            theme="light"
            type="tertiary"
            icon={<IconRefresh />}
            loading={loading}
            onClick={fetchLogs}
          >
            刷新
          </Button>

          <Popconfirm
            title="确定清空运行日志？"
            content="清空后历史调度与执行输出将无法恢复。"
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

      {/* 日志数据卡片与表格 (内部定高自适应滚动，表头固定，不引起全页面滚动) */}
      <Card
        className="rounded-2xl border border-semi-color-border shadow-xs flex-1 flex flex-col min-h-0 bg-semi-color-bg-0"
        bodyStyle={{ padding: 0, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
      >
        <Table
          columns={columns}
          dataSource={filteredLogs}
          loading={loading}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            pageSizeOpts: [10, 20, 50, 100],
            className: 'px-4 py-3 border-t border-semi-color-border'
          }}
          scroll={{ y: 'calc(100vh - 310px)', x: 1060 }}
          size="middle"
          empty={
            <div className="py-16 text-center">
              <Empty
                title="暂无运行日志记录"
                description="系统在执行定时秒杀、自动提现、抢单或每日打卡时，将实时记录详细输出流水"
              />
            </div>
          }
        />
      </Card>

      {/* 完整日志回显弹窗 */}
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
        width={620}
        centered
      >
        {activeLog && (
          <div className="space-y-3 pt-1">
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-semi-color-fill-0 border border-semi-color-border text-xs">
              <Space>
                <Text type="secondary">时间：</Text>
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
                <Tag color={activeLog.status === 'success' ? 'green' : 'red'} size="small">
                  {activeLog.status === 'success' ? '执行成功' : '执行失败'}
                </Tag>
              </Space>
            </div>

            <div className="bg-[#1e1e1e] text-[#d4d4d4] p-4 rounded-xl font-mono text-[13px] max-h-[360px] overflow-y-auto whitespace-pre-wrap leading-relaxed shadow-inner">
              {activeLog.output || '无日志内容'}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
