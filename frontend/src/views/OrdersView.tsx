import React, { useEffect, useState, useRef } from 'react';
import {
  Card,
  Table,
  Typography,
  Tag,
  Button,
  Space,
  Toast,
  Tabs,
  TabPane,
  Avatar,
  Input,
  RadioGroup,
  Radio,
  Empty,
  Popconfirm
} from '@douyinfe/semi-ui';
import { gsap, useGSAP } from '../utils/animations';

import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import {
  IconRefresh,
  IconCopy,
  IconSearch,
  IconDelete
} from '@douyinfe/semi-icons';
import { useAppStore } from '../store/useAppStore';
import { api } from '../api';
import { useOnActivated } from '../utils/useOnActivated';
import type { Order } from '../types';

const { Title, Text } = Typography;


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

export const OrdersView: React.FC = () => {
  const currentAccountKey = useAppStore((s) => s.currentAccountKey);
  const accounts = useAppStore((s) => s.accounts);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const containerRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [tableScrollY, setTableScrollY] = useState<number>(460);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeStatusTab, setActiveStatusTab] = useState<string>('all');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [delayingOrderId, setDelayingOrderId] = useState<number | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<number | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<number | null>(null);


  // 纯净视口高度自适应：监听表格卡片容器，杜绝 DOM querySelector 与强制同步重排
  useEffect(() => {
    const updateHeight = () => {
      if (!tableContainerRef.current) return;
      const ch = tableContainerRef.current.clientHeight;
      if (ch > 100) {
        // 预留表头(44px)与分页条(48px)及边框空间(约96px)
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

  const lastOrdersSignatureRef = useRef<string>('');
  const inFlightOrdersRef = useRef<boolean>(false);

  const fetchOrders = async (kw?: string, force = false, silent = false) => {
    if (accounts.length === 0) {
      setOrders([]);
      return;
    }
    const keywordToSearch = typeof kw === 'string' ? kw.trim() : (searchKeyword || '').trim();
    const effectiveKey = currentAccountKey || accounts[0]?.key || '';
    const queryKey = `${effectiveKey}_${activeStatusTab}_${platformFilter}_${keywordToSearch}`;

    if (!force && lastOrdersSignatureRef.current === queryKey) {
      return;
    }
    if (inFlightOrdersRef.current) return;
    inFlightOrdersRef.current = true;
    lastOrdersSignatureRef.current = queryKey;

    if (!silent) setLoading(true);
    try {
      const ordersRes = await api.getOrders({
        account_key: effectiveKey || undefined,
        status: activeStatusTab,
        platform: platformFilter,
        keyword: keywordToSearch
      });

      if (ordersRes.ok) {
        setOrders(ordersRes.orders || []);
      }
    } catch (e) {
      lastOrdersSignatureRef.current = '';
      Toast.error('拉取订单列表失败');
    } finally {
      inFlightOrdersRef.current = false;
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [currentAccountKey, activeStatusTab, platformFilter]);

  // 页面切入激活或顶级重复点击时立刻拉取最新订单数据
  useOnActivated('orders', () => {
    fetchOrders(undefined, true, false);
  }, { throttleMs: 300 });

  // 筛选与 Tab 切换时的平滑微过渡 (遵循 Semi Design 高性能 GPU 合成通道，杜绝整体表格下坠位移)
  useGSAP(
    () => {
      const tableEl = containerRef.current?.querySelector('.orders-table-container');
      if (tableEl) {
        gsap.killTweensOf(tableEl);
        gsap.fromTo(
          tableEl,
          { autoAlpha: 0.72 },
          {
            autoAlpha: 1,
            duration: 0.18,
            ease: 'power1.out',
            overwrite: 'auto',
            clearProps: 'opacity,visibility',
          }
        );
      }
    },
    { scope: containerRef, dependencies: [activeStatusTab, platformFilter] }
  );

  // 复制文本快捷方法
  const handleCopyText = (txt: string, label: string = '内容') => {
    navigator.clipboard.writeText(txt);
    Toast.success(`${label}已复制到剪贴板`);
  };

  const handleDelayVoucher = async (order: Order) => {
    setDelayingOrderId(order.id);
    try {
      const res = await api.delayOrderVoucher(order.id);
      if (res.ok) {
        Toast.success(res.message || '领红包延时特权已激活，凭证有效期已延长');
        fetchOrders(undefined, true);
      } else {
        Toast.error(res.message || '延时申请失败');
      }
    } catch (e: any) {
      Toast.error(`延时操作异常: ${e.response?.data?.detail || e.message || e}`);
    } finally {
      setDelayingOrderId(null);
    }
  };

  const handleCancelOrder = async (order: Order) => {
    setCancellingOrderId(order.id);
    try {
      const res = await api.cancelOrder(order.id);
      if (res.ok) {
        Toast.success(res.message || '霸王餐报名已成功取消');
        fetchOrders(undefined, true);
      } else {
        Toast.error(res.message || '取消报名失败');
      }
    } catch (e: any) {
      Toast.error(`取消报名异常: ${e.response?.data?.detail || e.message || e}`);
    } finally {
      setCancellingOrderId(null);
    }
  };

  const handleDeleteOrder = async (order: Order) => {
    setDeletingOrderId(order.id);
    try {
      const res = await api.deleteOrder(order.id);
      if (res.ok) {
        Toast.success(res.message || '订单记录已删除');
        fetchOrders(undefined, true);
      } else {
        Toast.error(res.message || '删除订单失败');
      }
    } catch (e: any) {
      Toast.error(`删除订单异常: ${e.response?.data?.detail || e.message || e}`);
    } finally {
      setDeletingOrderId(null);
    }
  };


  const DEFAULT_PLATFORM_ICONS: Record<string, string> = {
    jingdong: 'https://img10.360buyimg.com/imagetools/jfs/t1/282159/28/8442/32950/67e10a0dFb8e53ae1/3a4d405ef2b69aff.jpg',
    jd: 'https://img10.360buyimg.com/imagetools/jfs/t1/282159/28/8442/32950/67e10a0dFb8e53ae1/3a4d405ef2b69aff.jpg',
    eleme: 'https://cube.elemecdn.com/8/FF/D6D23A46B485F85152E1F9A855510jpg.jpg',
    taobao: 'https://cube.elemecdn.com/8/FF/D6D23A46B485F85152E1F9A855510jpg.jpg',
    meituan: 'http://p0.meituan.net/business/cf047871536dfa726936dfdc834b23c7211376.jpg'
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
        const avatarSrc = row?.store_icon || DEFAULT_PLATFORM_ICONS[row?.platform || 'meituan'];
        return (
          <div className="flex items-start gap-3 max-w-[340px]">
            <Avatar
              size="medium"
              shape="square"
              src={avatarSrc}
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
                <Typography.Text
                  ellipsis={{ showTooltip: true }}
                  style={{ maxWidth: 220, cursor: 'pointer' }}
                  strong
                  className="text-[14px] hover:text-semi-color-primary transition-colors"
                  title="点击复制店铺名"
                  onClick={() => handleCopyText(name, '店铺名称')}
                >
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
        const isPercentOrder =
          row?.order_type === 12 ||
          Boolean(row?.rebate_ratio && row.rebate_ratio > 0) ||
          Number(row?.order_money || 0) <= 0;
        const hasRealOrderMoney = Number(row?.order_money || 0) > 0;
        return (
          <div>
            <div className="text-xs text-semi-color-text-2">
              {isPercentOrder && !hasRealOrderMoney ? (
                <>
                  返利模式：<Text strong>{row?.rebate_ratio ? `按实付 ${row.rebate_ratio}% 返` : '按比例返现'}</Text>
                </>
              ) : (
                <>
                  门槛实付：<Text strong>¥{row?.order_money}</Text>
                </>
              )}
            </div>
            <div className="text-sm font-semibold text-semi-color-danger mt-0.5 flex items-center gap-1 flex-wrap">
              <span>
                {isPercentOrder && !hasRealOrderMoney && row?.status !== 'completed'
                  ? `最高返：¥${row?.rebate_money}`
                  : `返利：¥${row?.rebate_money}`}
              </span>
              {hasRedpack && (
                <Tag size="small" color="red">
                  +{((row!.redpack_reward_num!) > 5 ? (row!.redpack_reward_num!) / 100 : (row!.redpack_reward_num!)).toFixed(2)} 红包
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
      width: 240,
      render: (status: string, row?: Order) => {
        const hasExtId = !!row?.platform_order_id;
        let badgeColor: 'green' | 'amber' | 'blue' | 'red' | 'grey' | 'cyan' = 'grey';
        let statusText = '未知状态';

        if (status === 'completed') {
          badgeColor = 'green';
          statusText = `已返利 ¥${row?.rebate_money}`;
        } else if (status === 'auditing') {
          badgeColor = 'amber';
          statusText = '平台审核中';
        } else if (status === 'pending') {
          if (hasExtId) {
            badgeColor = 'cyan';
            statusText = '已下单待反馈';
          } else {
            badgeColor = 'blue';
            statusText = '待提交外卖单号';
          }
        } else if (status === 'rejected') {
          badgeColor = 'red';
          statusText = row?.reject_reason ? `已驳回: ${row.reject_reason}` : '已驳回';
        } else if (status === 'cancelled') {
          badgeColor = 'grey';
          statusText = '已取消';
        }

        const nowSec = Math.floor(Date.now() / 1000);
        const remainingSec = row?.timeout_time ? row.timeout_time - nowSec : null;
        const countdownStr = formatRemainingTime(remainingSec);
        const hasDelayed = Boolean(row?.delay_count && row.delay_count > 0);

        return (
          <div className="max-w-[240px]">
            <Space spacing="tight" wrap>
              <Tag color={badgeColor} size="small">
                {statusText}
              </Tag>
              {status === 'pending' && countdownStr && (
                <Tag color={countdownStr === '已超时' ? 'red' : 'amber'} size="small">
                  {countdownStr}
                </Tag>
              )}
              {hasDelayed && (
                <Tag color="violet" size="small">
                  已延时2h
                </Tag>
              )}
            </Space>
            <div className="mt-1.5 text-xs font-mono">
              {hasExtId ? (
                <div className="flex items-center gap-1 text-semi-color-text-1">
                  <span className="truncate max-w-[170px]" title={row?.platform_order_id}>
                    单号: {row?.platform_order_id}
                  </span>
                  <Button
                    theme="borderless"
                    icon={<IconCopy size="small" />}
                    size="small"
                    className="p-0.5 ml-0.5 h-5 flex-shrink-0"
                    onClick={() => row && handleCopyText(row.platform_order_id!, '外卖单号')}
                  />
                </div>
              ) : (
                <span className="text-semi-color-text-3">未绑定外卖单号</span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      title: '评价门槛',
      dataIndex: 'condition',
      width: 140,
      render: (cond: string) => {
        const cleanCond = String(cond || '无需评价')
          .replace(/[（(].*?需含字含图.*?[）)]/g, '')
          .replace(/[（(]需含字含图[）)]/g, '')
          .trim() || '无需评价';
        return (
          <Tag color={getConditionTagColor(cleanCond)} size="small">
            {cleanCond}
          </Tag>
        );
      },
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
      key: 'actions',
      width: 190,
      fixed: 'right',
      render: (_: any, row?: Order) => {
        if (!row) return null;
        const status = row.status;
        const hasExtId = !!row.platform_order_id;
        const isPercentOrder =
          row.order_type === 12 ||
          Boolean(row.rebate_ratio && row.rebate_ratio > 0) ||
          Number(row.order_money || 0) <= 0;
        const hasDelayed = Boolean(row.delay_count && row.delay_count > 0);

        if (status === 'pending') {
          if (!hasExtId) {
            return (
              <div className="flex items-center gap-1.5 flex-wrap">
                {!isPercentOrder && (
                  hasDelayed ? (
                    <Tag color="violet" size="small">已延时2h</Tag>
                  ) : (
                    <Button
                      theme="light"
                      type="warning"
                      size="small"
                      loading={delayingOrderId === row.id}
                      onClick={() => handleDelayVoucher(row)}
                      title="使用延时券延长有效期2小时"
                      className="!py-0.5 !px-1.5 text-xs h-6"
                    >
                      使用延时券
                    </Button>
                  )
                )}
                <Popconfirm
                  title="确认取消该霸王餐报名？"
                  content="取消后将释放当前占用的抢单名额，该操作不可撤销。"
                  okText="确认取消"
                  cancelText="返回"
                  okType="danger"
                  onConfirm={() => handleCancelOrder(row)}
                >
                  <Button
                    theme="light"
                    type="danger"
                    size="small"
                    loading={cancellingOrderId === row.id}
                    className="!py-0.5 !px-1.5 text-xs h-6"
                  >
                    取消报名
                  </Button>
                </Popconfirm>
              </div>
            );
          } else {
            return (
              <Tag color="cyan" size="small">已锁单待核对</Tag>
            );
          }
        }

        if (status === 'completed' || status === 'cancelled') {
          return (
            <Popconfirm
              title="确认删除该订单？"
              content="将从官方订单列表与本地记录中彻底删除该条订单。"
              okText="确认删除"
              cancelText="取消"
              okType="danger"
              onConfirm={() => handleDeleteOrder(row)}
            >
              <Button
                theme="light"
                type="tertiary"
                size="small"
                icon={<IconDelete size="small" />}
                loading={deletingOrderId === row.id}
                className="!py-0.5 !px-1.5 text-xs h-6"
              >
                删除订单
              </Button>
            </Popconfirm>
          );
        }

        if (status === 'auditing') {
          return <Tag color="amber" size="small">平台审核中</Tag>;
        }

        if (status === 'rejected') {
          return <Tag color="red" size="small">已驳回</Tag>;
        }

        return <Text size="small" type="secondary">-</Text>;
      },
    }
  ];

  if (accounts.length === 0) {
    return (
      <div className="w-full flex flex-col h-full min-h-0 space-y-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shrink-0">
          <div>
            <Title heading={3}>我的霸王餐订单与返利</Title>
            <Text type="secondary" size="small">实时跟踪已抢霸王餐状态与返利到账明细</Text>
          </div>
        </div>
        <Card className="flex-1 min-h-0 rounded-xl border border-semi-color-border py-16 flex flex-col items-center justify-center text-center bg-semi-color-bg-0">
          <Empty
            title="当前未登录或未托管小蚕账号"
            description="查看已抢霸王餐订单与返利明细需要真实小蚕账号凭证。当前已退出或无登录账号，系统已停止拉取任何订单数据。"
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
    <div ref={containerRef} className="w-full flex flex-col h-full min-h-0 space-y-3">
      {/* 注入表格高度自适应与分页规范样式 */}
      <style>{`
        .orders-table-container .semi-table-body {
          height: var(--table-scroll-y) !important;
          min-height: var(--table-scroll-y) !important;
          max-height: var(--table-scroll-y) !important;
          overflow-y: auto !important;
          contain: content;
          will-change: transform;
          transform: translateZ(0);
          -webkit-overflow-scrolling: touch;
        }
        .orders-table-container .semi-table-placeholder {
          min-height: var(--table-scroll-y) !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        .orders-table-container .semi-spin-wrapper {
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
        .orders-table-container .semi-table-pagination-outer {
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

      {/* 头部标题与操作 */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shrink-0">
        <div>
          <Title heading={3}>我的霸王餐订单与返利</Title>
          <Text type="secondary" size="small">实时跟踪已抢霸王餐状态与返利到账明细</Text>
        </div>

        <Button
          icon={<IconRefresh spin={loading} />}
          loading={loading}
          onClick={() => fetchOrders(undefined, true)}
        >
          刷新订单
        </Button>
      </div>

      {/* 状态分类与平台过滤控制栏 */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shrink-0">
        <Tabs
          type="button"
          activeKey={activeStatusTab}
          onChange={(k) => setActiveStatusTab(String(k))}
          className="shrink-0"
        >
          <TabPane tab="全部" itemKey="all" />
          <TabPane tab="待上传" itemKey="pending" />
          <TabPane tab="审核中" itemKey="auditing" />
          <TabPane tab="已完成" itemKey="completed" />
          <TabPane tab="已驳回" itemKey="rejected" />
          <TabPane tab="已取消" itemKey="cancelled" />
        </Tabs>

        <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
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

          <Input
            prefix={<IconSearch />}
            placeholder="搜索店铺名、单号..."
            value={searchKeyword}
            onChange={(val) => setSearchKeyword(val || '')}
            onEnterPress={() => fetchOrders()}
            showClear
            onClear={() => {
              setSearchKeyword('');
              fetchOrders('');
            }}
            style={{ width: 220 }}
          />
        </div>
      </div>

      {/* 主体表格卡片：撑满视口垂直剩余高度，杜绝超出页面滚动 */}
      <Card
        className="flex-1 min-h-0 flex flex-col rounded-xl border border-semi-color-border shadow-xs overflow-hidden bg-semi-color-bg-0"
        bodyStyle={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: 0 }}
      >
        <div
          ref={tableContainerRef}
          className="orders-table-container relative flex-1 min-h-0 flex flex-col overflow-hidden"
          style={{
            ['--table-scroll-y' as any]: `${tableScrollY}px`
          }}
        >
          <Table
            rowKey="id"
            columns={columns}
            dataSource={orders}
            loading={loading}
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              pageSizeOpts: [10, 20, 50, 100],
            }}
            scroll={{ y: tableScrollY, x: 1200 }}
            size="middle"
            empty={
              loading ? (
                <div className="py-20 text-center flex flex-col items-center justify-center m-auto">
                  <div className="text-sm font-medium text-semi-color-text-0 mt-8">
                    正在同步霸王餐订单记录...
                  </div>
                </div>
              ) : (
                <div className="py-16 text-center flex flex-col items-center justify-center m-auto">
                  <Empty
                    title="暂无匹配的霸王餐订单记录"
                    description="已抢到的霸王餐订单将自动同步展示于此，支持返利明细与审核进度实时追踪"
                  />
                </div>
              )
            }
          />
        </div>
      </Card>
    </div>
  );
};
export default OrdersView;
