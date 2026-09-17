import React, { useEffect, useState, useRef } from 'react';
import {
  Card,
  Table,
  Typography,
  Tag,
  Button,
  Space,
  Modal,
  Select,
  Toast,
  Tabs,
  TabPane,
  Avatar,
  Popconfirm,
  Input,
  RadioGroup,
  Radio,
  Row,
  Col,
  Empty,
  Tooltip
} from '@douyinfe/semi-ui';
import { useGSAP, animateStaggerEnter } from '../utils/animations';

import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import {
  IconRefresh,
  IconCopy,
  IconSearch,
  IconPlus,
  IconDelete
} from '@douyinfe/semi-icons';
import { useAppStore } from '../store/useAppStore';
import { api } from '../api';
import type { Order, OrderStats } from '../types';

const { Title, Text } = Typography;

export const OrdersView: React.FC = () => {
  const { currentAccountKey, accounts, setActiveTab } = useAppStore();
  const ordersRef = useRef<HTMLDivElement>(null);

  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<OrderStats>({

    total_orders: 0,
    completed_orders: 0,
    pending_orders: 0,
    total_rebate: 0,
    pending_rebate: 0,
    total_spent: 0
  });
  const [loading, setLoading] = useState(false);
  const [activeStatusTab, setActiveStatusTab] = useState<string>('all');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  // 提交外卖单号核销弹窗
  const [submitModalVisible, setSubmitModalVisible] = useState(false);
  const [currentSubmittingOrder, setCurrentSubmittingOrder] = useState<Order | null>(null);
  const [platformOrderIdInput, setPlatformOrderIdInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 手动登记新订单弹窗
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newStoreName, setNewStoreName] = useState('');
  const [newPlatform, setNewPlatform] = useState<'meituan' | 'eleme' | 'jingdong'>('meituan');
  const [newOrderMoney, setNewOrderMoney] = useState<number>(30);
  const [newRebateMoney, setNewRebateMoney] = useState<number>(18);
  const [newPlatformOrderId, setNewPlatformOrderId] = useState('');
  const [newCondition, setNewCondition] = useState('无需评价');

  const fetchOrders = async (kw?: string) => {
    if (accounts.length === 0) {
      setOrders([]);
      setStats({
        total_orders: 0,
        completed_orders: 0,
        pending_orders: 0,
        total_rebate: 0,
        pending_rebate: 0,
        total_spent: 0
      });
      return;
    }
    const keywordToSearch = typeof kw === 'string' ? kw : searchKeyword.trim();
    setLoading(true);
    try {
      const [ordersRes, statsRes] = await Promise.all([
        api.getOrders({
          account_key: currentAccountKey || undefined,
          status: activeStatusTab,
          platform: platformFilter,
          keyword: keywordToSearch
        }),
        api.getOrderStats(currentAccountKey || undefined)
      ]);

      if (ordersRes.ok) {
        setOrders(ordersRes.orders || []);
      }
      if (statsRes.ok && statsRes.stats) {
        setStats(statsRes.stats);
      }
    } catch (e) {
      Toast.error('拉取订单列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [currentAccountKey, activeStatusTab, platformFilter]);

  useGSAP(
    () => {
      if (ordersRef.current) {
        animateStaggerEnter(ordersRef.current, '.gsap-order-card', 0.03);
      }
    },
    { scope: ordersRef, dependencies: [activeStatusTab, platformFilter] }
  );

  // 复制文本快捷方法
  const handleCopyText = (txt: string, label: string = '内容') => {
    navigator.clipboard.writeText(txt);
    Toast.success(`${label}已复制到剪贴板`);
  };

  // 打开提交单号弹窗
  const handleOpenSubmitModal = (order: Order) => {
    setCurrentSubmittingOrder(order);
    setPlatformOrderIdInput(order.platform_order_id || '');
    setSubmitModalVisible(true);
  };

  // 确认提交外卖单号
  const handleConfirmSubmitPlatformId = async () => {
    if (!currentSubmittingOrder) return;
    const cleanId = platformOrderIdInput.trim();
    if (!cleanId) {
      Toast.warning('请输入有效的美团或饿了么外卖订单号');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.submitPlatformOrderId(currentSubmittingOrder.id, cleanId);
      if (res.ok) {
        Toast.success('外卖单号已提交，小蚕平台审核中！预计 2~24 小时返利到账');
        setSubmitModalVisible(false);
        fetchOrders();
      } else {
        Toast.error(res.message || '提交失败');
      }
    } catch (e) {
      Toast.error('提交外卖单号失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 确认手动登记新订单
  const handleCreateOrder = async () => {
    if (!newStoreName.trim()) {
      Toast.warning('请输入店铺名称');
      return;
    }
    try {
      await api.createOrder({
        account_key: currentAccountKey || (accounts[0]?.key ?? 'acc_default'),
        store_name: newStoreName.trim(),
        platform: newPlatform,
        order_money: Number(newOrderMoney) || 0,
        rebate_money: Number(newRebateMoney) || 0,
        platform_order_id: newPlatformOrderId.trim(),
        status: newPlatformOrderId.trim() ? 'auditing' : 'pending',
        condition: newCondition
      });
      Toast.success('新霸王餐订单已成功登记！');
      setCreateModalVisible(false);
      setNewStoreName('');
      setNewPlatformOrderId('');
      fetchOrders();
    } catch (e) {
      Toast.error('创建订单失败');
    }
  };

  // 删除订单
  const handleDeleteOrder = async (id: number) => {
    try {
      await api.deleteOrder(id);
      Toast.success('订单记录已删除');
      fetchOrders();
    } catch (e) {
      Toast.error('删除订单失败');
    }
  };

  const getPlatformBadge = (plat?: string) => {
    if (plat === 'jingdong' || plat === 'jd') {
      return { label: '京东外卖', color: 'red' as const, avatarColor: 'red' as const };
    }
    if (plat === 'eleme' || plat === 'taobao') {
      return { label: '饿了么', color: 'blue' as const, avatarColor: 'blue' as const };
    }
    return { label: '美团外卖', color: 'orange' as const, avatarColor: 'orange' as const };
  };

  const columns: ColumnProps<Order>[] = [
    {
      title: '店铺与订单号',
      dataIndex: 'store_name',
      width: 340,
      render: (name: string, row?: Order) => {
        const platInfo = getPlatformBadge(row?.platform);
        return (
          <div className="flex items-start gap-3 max-w-[340px]">
            <Avatar
              size="medium"
              shape="square"
              src={row?.store_icon || undefined}
              color={platInfo.avatarColor}
              className="flex-shrink-0"
            >
              {name?.[0] || '外'}
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Tag color={platInfo.color} size="small" shape="square" className="flex-shrink-0">
                  {platInfo.label}
                </Tag>
                <Typography.Text ellipsis={{ showTooltip: true }} style={{ maxWidth: 220 }} strong className="text-[14px]">
                  {name}
                </Typography.Text>
              </div>
              <div className="flex items-center gap-1 mt-1 text-xs text-semi-color-text-2 font-mono">
                <span className="truncate max-w-[180px]">单号: {row?.order_sn}</span>
                <Button
                  theme="borderless"
                  icon={<IconCopy size="small" />}
                  size="small"
                  className="p-0.5 ml-1 h-5 flex-shrink-0"
                  onClick={() => row && handleCopyText(row.order_sn, '小蚕单号')}
                />
              </div>
            </div>
          </div>
        );
      },
    },
    {
      title: '实付与返利',
      dataIndex: 'order_money',
      width: 170,
      render: (_: any, row?: Order) => {
        const hasRedpack = Boolean(row?.redpack_reward_num && row.redpack_reward_num > 0);
        return (
          <div>
            <div className="text-xs text-semi-color-text-2">
              门槛实付：<Text strong>¥{row?.order_money}</Text>
            </div>
            <div className="text-sm font-semibold text-semi-color-danger mt-0.5 flex items-center gap-1 flex-wrap">
              <span>返利：¥{row?.rebate_money}</span>
              {hasRedpack && (
                <Tag size="small" color="red">
                  +{((row!.redpack_reward_num!) / 100).toFixed(2)} 红包
                </Tag>
              )}
            </div>
          </div>
        );
      },
    },
    {
      title: '外卖单号 / 审核状态',
      dataIndex: 'status',
      width: 260,
      render: (status: string, row?: Order) => {
        const hasExtId = !!row?.platform_order_id;
        let badgeColor: 'green' | 'amber' | 'blue' | 'red' | 'grey' = 'grey';
        let statusText = '未知状态';

        if (status === 'completed') {
          badgeColor = 'green';
          statusText = `已返利 ¥${row?.rebate_money}`;
        } else if (status === 'auditing') {
          badgeColor = 'amber';
          statusText = '平台审核中';
        } else if (status === 'pending') {
          badgeColor = 'blue';
          statusText = '待提交外卖单号';
        } else if (status === 'rejected') {
          badgeColor = 'red';
          statusText = row?.reject_reason ? `已驳回: ${row.reject_reason}` : '已驳回';
        } else if (status === 'cancelled') {
          badgeColor = 'grey';
          statusText = '已取消';
        }

        const nowSec = Math.floor(Date.now() / 1000);
        const remainingSec = row?.timeout_time ? row.timeout_time - nowSec : null;
        let countdownStr = '';
        if (remainingSec !== null) {
          if (remainingSec > 0) {
            const m = Math.floor(remainingSec / 60);
            countdownStr = `剩 ${m} 分钟`;
          } else {
            countdownStr = '已超时';
          }
        }

        return (
          <div className="max-w-[260px]">
            <Space spacing="tight">
              <Tag color={badgeColor} size="small">
                {statusText}
              </Tag>
              {status === 'pending' && countdownStr && (
                <Tag color={countdownStr === '已超时' ? 'red' : 'amber'} size="small">
                  {countdownStr}
                </Tag>
              )}
            </Space>
            <div className="mt-1.5 text-xs font-mono">
              {hasExtId ? (
                <div className="flex items-center gap-1 text-semi-color-text-1">
                  <span className="truncate max-w-[170px]">单号: {row?.platform_order_id}</span>
                  <Button
                    theme="borderless"
                    icon={<IconCopy size="small" />}
                    size="small"
                    className="p-0.5 ml-1 h-5 flex-shrink-0"
                    onClick={() => row && handleCopyText(row.platform_order_id!, '外卖单号')}
                  />
                </div>
              ) : row?.status === 'pending' ? (
                <Button
                  theme="solid"
                  type="warning"
                  size="small"
                  className="mt-1 text-xs"
                  onClick={() => row && handleOpenSubmitModal(row)}
                >
                  点击填写外卖单号
                </Button>
              ) : null}
            </div>
          </div>
        );
      },
    },
    {
      title: '评价门槛',
      dataIndex: 'condition',
      width: 120,
      render: (cond: string) => (
        <Tag color={cond === '无需评价' ? 'green' : 'cyan'} size="small">
          {cond || '无需评价'}
        </Tag>
      ),
    },
    {
      title: '下单时间',
      dataIndex: 'created_at',
      width: 170,
      render: (timeStr: string) => (
        <Text size="small" type="secondary">{timeStr}</Text>
      ),
    },
    {
      title: '操作',
      dataIndex: 'actions',
      width: 150,
      fixed: 'right',
      render: (_: any, row?: Order) => (
        <Space>
          {(row?.status === 'pending' || row?.status === 'auditing') && (
            <Button
              theme="borderless"
              type="primary"
              size="small"
              onClick={() => row && handleOpenSubmitModal(row)}
            >
              {row?.platform_order_id ? '修改单号' : '核销提交'}
            </Button>
          )}
          <Popconfirm
            title="确定删除此订单记录？"
            content="删除后将无法通过助手自动追踪该订单的返利到账状态。"
            okType="danger"
            okText="确定删除"
            cancelText="取消"
            onConfirm={() => row && handleDeleteOrder(row.id)}
          >
            <Tooltip content="删除订单记录">
              <Button
                theme="borderless"
                type="danger"
                size="small"
                icon={<IconDelete />}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (accounts.length === 0) {
    return (
      <div className="w-full">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-5">
          <div>
            <Title heading={3}>我的霸王餐订单与返利</Title>
            <Text type="secondary">实时跟踪已抢霸王餐状态、外卖单号核销与返利到账明细</Text>
          </div>
        </div>
        <Card className="rounded-xl border border-semi-color-border py-16 flex flex-col items-center justify-center text-center bg-semi-color-bg-0">
          <Empty
            title="当前未登录或未托管小蚕账号"
            description="查看已抢霸王餐订单、核销外卖单号与返利明细需要真实小蚕账号凭证。当前已退出或无登录账号，系统已停止拉取任何订单数据。"
          >
            <Button
              theme="solid"
              type="primary"
              onClick={() => setActiveTab('accounts')}
              className="mt-4"
            >
              前往「小蚕账号」添加或绑定账号
            </Button>
          </Empty>
        </Card>
      </div>
    );
  }

  return (
    <div ref={ordersRef} className="w-full">
      {/* 头部标题与操作 */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-5">
        <div>
          <Title heading={3}>我的霸王餐订单与返利</Title>
          <Text type="secondary">实时跟踪已抢霸王餐状态、外卖单号核销与返利到账明细</Text>
        </div>

        <Space>
          <Button
            icon={<IconRefresh spin={loading} />}
            loading={loading}
            onClick={() => fetchOrders()}
          >
            刷新订单
          </Button>
          <Button
            theme="solid"
            type="primary"
            icon={<IconPlus />}
            onClick={() => setCreateModalVisible(true)}
          >
            登记新订单
          </Button>
        </Space>
      </div>

      {/* 收益看板统计指标 */}
      <Row gutter={[16, 16]} className="mb-5">
        <Col xs={24} sm={12} lg={6}>
          <Card className="gsap-order-card rounded-xl border border-semi-color-border semi-card-elevate bg-gradient-to-br from-green-50/50 via-transparent to-transparent dark:from-green-950/20 shadow-xs">
            <Text type="secondary" size="small">累计已到账返利</Text>
            <div className="text-2xl font-bold text-semi-color-success mt-1 font-mono">
              ¥ {stats.total_rebate.toFixed(2)}
            </div>
            <Text type="tertiary" size="small" className="mt-1 block">已直接抵扣或提现</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="gsap-order-card rounded-xl border border-semi-color-border semi-card-elevate bg-gradient-to-br from-amber-50/50 via-transparent to-transparent dark:from-amber-950/20 shadow-xs">
            <Text type="secondary" size="small">待入账返利</Text>
            <div className="text-2xl font-bold text-semi-color-warning mt-1 font-mono">
              ¥ {stats.pending_rebate.toFixed(2)}
            </div>
            <Text type="tertiary" size="small" className="mt-1 block">{stats.pending_orders} 笔审核/待提交中</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="gsap-order-card rounded-xl border border-semi-color-border semi-card-elevate shadow-xs">
            <Text type="secondary" size="small">已完成霸王餐单数</Text>
            <div className="text-2xl font-bold text-semi-color-text-0 mt-1">
              {stats.completed_orders} <span className="text-sm font-normal text-semi-color-text-2">单</span>
            </div>
            <Text type="tertiary" size="small" className="mt-1 block">核销成功率 100%</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="gsap-order-card rounded-xl border border-semi-color-border semi-card-elevate shadow-xs">
            <Text type="secondary" size="small">累计外卖消费总额</Text>
            <div className="text-2xl font-bold text-semi-color-text-0 mt-1 font-mono">
              ¥ {stats.total_spent.toFixed(2)}
            </div>
            <Text type="tertiary" size="small" className="mt-1 block">综合实付门槛金额</Text>
          </Card>
        </Col>
      </Row>


      {/* 搜索与工具栏 */}
      <Card className="rounded-xl mb-4 p-3 border border-semi-color-border">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <Text type="secondary" size="small" className="mr-2">外卖平台:</Text>
              <RadioGroup
                type="button"
                value={platformFilter}
                onChange={(e) => setPlatformFilter(e.target.value)}
              >
                <Radio value="all">全部</Radio>
                <Radio value="meituan">美团</Radio>
                <Radio value="eleme">饿了么</Radio>
                <Radio value="jingdong">京东</Radio>
              </RadioGroup>
            </div>
          </div>

          <div className="w-full sm:w-72">
            <Input
              prefix={<IconSearch />}
              placeholder="搜索店铺名、单号..."
              value={searchKeyword}
              onChange={(val) => setSearchKeyword(val)}
              onEnterPress={() => fetchOrders()}
              showClear
              onClear={() => {
                setSearchKeyword('');
                fetchOrders('');
              }}
            />
          </div>
        </div>
      </Card>

      {/* 订单列表 Tabs */}
      <Tabs activeKey={activeStatusTab} onChange={(k) => setActiveStatusTab(String(k))}>
        <TabPane tab="全部" itemKey="all" />
        <TabPane tab="待上传" itemKey="pending" />
        <TabPane tab="审核中" itemKey="auditing" />
        <TabPane tab="已完成" itemKey="completed" />
        <TabPane tab="已驳回" itemKey="rejected" />
        <TabPane tab="已取消" itemKey="cancelled" />
      </Tabs>

      <Card className="rounded-xl mt-3 shadow-sm border border-semi-color-border">
        <Table
          columns={columns}
          dataSource={orders}
          loading={loading}
          pagination={{ pageSize: 10 }}
          scroll={{ y: 'calc(100vh - 430px)', x: 1050 }}
          empty={
            <div className="py-12 text-center text-semi-color-text-3">
              暂无匹配的霸王餐订单记录
            </div>
          }
        />
      </Card>

      {/* 提交外卖单号核销模态框 */}
      <Modal
        title="提交外卖单号核销返利"
        visible={submitModalVisible}
        onOk={handleConfirmSubmitPlatformId}
        onCancel={() => setSubmitModalVisible(false)}
        confirmLoading={submitting}
        okText="确认提交并进入审核"
        cancelText="取消"
        width={480}
      >
        <div className="space-y-4 py-2">
          <div className="bg-semi-color-fill-0 p-3 rounded-lg text-sm">
            <div className="flex justify-between mb-1">
              <Text type="secondary">店铺名称：</Text>
              <Text strong>{currentSubmittingOrder?.store_name}</Text>
            </div>
            <div className="flex justify-between mb-1">
              <Text type="secondary">外卖平台：</Text>
              <Text>{currentSubmittingOrder?.platform === 'meituan' ? '美团外卖' : '饿了么'}</Text>
            </div>
            <div className="flex justify-between">
              <Text type="secondary">预计立返：</Text>
              <Text className="text-semi-color-danger font-bold">¥ {currentSubmittingOrder?.rebate_money}</Text>
            </div>
          </div>

          <div>
            <Text strong className="block mb-1.5 text-sm">
              外卖平台订单号（美团或饿了么）
            </Text>
            <Input
              value={platformOrderIdInput}
              placeholder="请输入外卖 App 订单详情中的 16~24 位订单编号"
              onChange={(val) => setPlatformOrderIdInput(val)}
            />
            <Text type="tertiary" size="small" className="mt-1 block">
              请打开美团或饿了么 App，在「我的订单」复制对应的订单编号后粘贴至此处。
            </Text>
          </div>
        </div>
      </Modal>

      {/* 手动登记新订单模态框 */}
      <Modal
        title="登记新霸王餐订单"
        visible={createModalVisible}
        onOk={handleCreateOrder}
        onCancel={() => setCreateModalVisible(false)}
        okText="保存订单"
        cancelText="取消"
        width={500}
      >
        <div className="space-y-3 py-1">
          <div>
            <Text strong className="block mb-1 text-sm">店铺名称</Text>
            <Input
              value={newStoreName}
              placeholder="例如：肯德基（首义路餐厅）"
              onChange={(val) => setNewStoreName(val)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Text strong className="block mb-1 text-sm">外卖平台</Text>
              <Select
                value={newPlatform}
                style={{ width: '100%' }}
                onChange={(val) => setNewPlatform(val as any)}
              >
                <Select.Option value="meituan">美团外卖</Select.Option>
                <Select.Option value="eleme">饿了么</Select.Option>
                <Select.Option value="jingdong">京东外卖</Select.Option>
              </Select>
            </div>
            <div>
              <Text strong className="block mb-1 text-sm">评价要求</Text>
              <Select
                value={newCondition}
                style={{ width: '100%' }}
                onChange={(val) => setNewCondition(String(val))}
              >
                <Select.Option value="无需评价">无需评价</Select.Option>
                <Select.Option value="图文好评">图文好评</Select.Option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Text strong className="block mb-1 text-sm">门槛实付金额 (¥)</Text>
              <Input
                value={String(newOrderMoney)}
                placeholder="30"
                onChange={(val) => setNewOrderMoney(Number(val) || 0)}
              />
            </div>
            <div>
              <Text strong className="block mb-1 text-sm">返利金额 (¥)</Text>
              <Input
                value={String(newRebateMoney)}
                placeholder="18"
                onChange={(val) => setNewRebateMoney(Number(val) || 0)}
              />
            </div>
          </div>

          <div>
            <Text strong className="block mb-1 text-sm">外卖单号 (选填，已下单可直接填入)</Text>
            <Input
              value={newPlatformOrderId}
              placeholder="例如：2609148819230491"
              onChange={(val) => setNewPlatformOrderId(val)}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};
export default OrdersView;
