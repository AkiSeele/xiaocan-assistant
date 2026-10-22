import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Typography,
  Button,
  Tag,
  Spin,
  Checkbox,
  Popconfirm,
  Toast,
} from '@douyinfe/semi-ui';
import {
  IconRefresh,
} from '@douyinfe/semi-icons';
import { api } from '../api';
import type { Account, FlashSaleShelfResponse, FlashSaleItem } from '../types';

const { Text } = Typography;

interface FlashSaleDrawerConfigProps {
  accountKey: string;
  accounts: Account[];
  drawerParams: Record<string, any>;
  setDrawerParams: React.Dispatch<React.SetStateAction<Record<string, any>>>;
}

export const FlashSaleDrawerConfig: React.FC<FlashSaleDrawerConfigProps> = ({
  accountKey,
  accounts,
  drawerParams,
  setDrawerParams,
}) => {
  const [loading, setLoading] = useState(false);
  const [shelfData, setShelfData] = useState<FlashSaleShelfResponse | null>(null);
  const [activeTab, setActiveTab] = useState<string>('09:00');
  const [exchangingId, setExchangingId] = useState<number | null>(null);

  const hasInitializedTabRef = React.useRef(false);
  const hasInitializedParamsRef = React.useRef(false);

  useEffect(() => {
    hasInitializedTabRef.current = false;
    hasInitializedParamsRef.current = false;
  }, [accountKey]);

  // 当前选中的商品列表
  const selectedProducts: string[] = useMemo(() => {
    const raw = drawerParams.target_products;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string' && raw.trim()) return raw.split(',').map((s) => s.trim());
    return [];
  }, [drawerParams.target_products]);

  // 从服务端拉取官方秒杀在线专区数据
  const fetchShelf = useCallback(async () => {
    if (!accountKey) return;
    setLoading(true);
    try {
      const res = await api.getFlashSaleShelf(accountKey);
      if (res && res.ok) {
        setShelfData(res);
        // 仅在首次拉取时回显服务端已存储的选品配置
        if (!hasInitializedParamsRef.current) {
          hasInitializedParamsRef.current = true;
          if (res.current_params?.target_products && Array.isArray(res.current_params.target_products)) {
            setDrawerParams((prev) => ({
              ...prev,
              target_products: res.current_params.target_products,
            }));
          }
        }
        // 仅在首次加载时智能定位场次，用户手动切换或勾选后绝不重置打断
        if (!hasInitializedTabRef.current) {
          hasInitializedTabRef.current = true;
          const ongoing = res.rounds?.find((r: any) => r.status === 'ongoing');
          if (ongoing) {
            setActiveTab(ongoing.round);
          } else {
            const upcoming = res.rounds?.find((r: any) => r.status === 'upcoming');
            if (upcoming) setActiveTab(upcoming.round);
          }
        }
      }
    } catch {
      // 失败时保持静默
    } finally {
      setLoading(false);
    }
  }, [accountKey, setDrawerParams]);

  useEffect(() => {
    fetchShelf();
  }, [fetchShelf]);

  // 切换商品勾选状态
  const toggleProduct = (productKey: string) => {
    const nextList = selectedProducts.includes(productKey)
      ? selectedProducts.filter((k) => k !== productKey)
      : [...selectedProducts, productKey];
    setDrawerParams((prev) => ({ ...prev, target_products: nextList }));
  };

  // 即时直接兑换（针对进行中且有在架剩余库存的商品）
  const handleDirectExchange = async (item: FlashSaleItem) => {
    if (!accountKey || exchangingId !== null) return;
    setExchangingId(item.exchange_id);
    try {
      const res = await api.exchangeFlashSale({
        account_key: accountKey,
        exchange_id: item.exchange_id,
        community_silk: item.community_silk,
        goods_name: item.goods_name,
      });

      if (res.ok) {
        Toast.success(res.message || `成功兑换【${item.goods_name}】！`);
        // 即时刷新货架，同步最新剩余库存与可用元宝
        await fetchShelf();
      } else {
        Toast.error(res.message || '兑换失败');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || '兑换请求异常';
      Toast.error(msg);
    } finally {
      setExchangingId(null);
    }
  };

  const currentAccount = accounts.find((a) => a.key === accountKey);
  const accountInfo = shelfData?.account;
  const isPlus = accountInfo ? Boolean(accountInfo.is_plus) : Boolean(currentAccount?.is_plus);
  const vipLevel = accountInfo?.vip_level ?? currentAccount?.vip_level ?? 1;
  const ybPoint = accountInfo?.yb_point ?? currentAccount?.yb_point ?? 0;
  const nickname = accountInfo?.nickname || currentAccount?.nickname || '主控账号';

  // 固定的 3 个场次定义
  const roundsList = shelfData?.rounds || [
    { round: '09:00', round_title: '09:00 早场 (小蚕红包专场)', status: 'ended' as const, items: [] },
    { round: '14:00', round_title: '14:00 午场 (大牌与免单专场)', status: 'ongoing' as const, items: [] },
    { round: '18:00', round_title: '18:00 晚场 (返利与复活专场)', status: 'upcoming' as const, items: [] },
  ];

  const activeRoundData = roundsList.find((r) => r.round === activeTab) || roundsList[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 账号资产与会员通道概览条 */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: '12px 14px',
          backgroundColor: 'var(--semi-color-fill-0)',
          borderRadius: 'var(--semi-border-radius-medium)',
          border: '1px solid var(--semi-color-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Text strong style={{ fontSize: 14 }}>
              {nickname}
            </Text>
            <Tag color={isPlus ? 'amber' : 'blue'} size="small">
              {isPlus ? `SVIP${vipLevel}` : `VIP${vipLevel}`}
            </Tag>
          </div>

          <Button
            icon={<IconRefresh />}
            theme="borderless"
            type="tertiary"
            size="small"
            loading={loading}
            onClick={fetchShelf}
          >
            刷新货架
          </Button>
        </div>

        <div>
          <Text type="secondary" size="small">
            可用元宝:{' '}
            <Text strong style={{ color: 'var(--semi-color-primary)', fontSize: 14, fontWeight: 600 }}>
              {ybPoint.toLocaleString()}
            </Text>
          </Text>
        </div>
      </div>

      {/* 官方三场次选项卡 (采用 3 列等宽栅格，绝对杜绝折行与排版错位) */}
      <Spin spinning={loading && !shelfData}>
        <div
          style={{
            backgroundColor: 'var(--semi-color-fill-0)',
            borderRadius: 'var(--semi-border-radius-medium)',
            border: '1px solid var(--semi-color-border)',
            padding: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text strong style={{ fontSize: 13 }}>
              抢兑商品列表
            </Text>
            <Text type="tertiary" size="small">
              已选 {selectedProducts.length} 款目标抢兑商品
            </Text>
          </div>

          {/* 3 列等宽切换栏 (彻底杜绝折行变动) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8,
              marginBottom: 12,
            }}
          >
            {roundsList.map((round) => {
              const isActive = activeTab === round.round;
              const selectedCount = round.items.filter((i) => selectedProducts.includes(i.product_key)).length;

              const statusColor =
                round.status === 'ongoing'
                  ? 'var(--semi-color-success)'
                  : round.status === 'upcoming'
                  ? 'var(--semi-color-info)'
                  : 'var(--semi-color-text-3)';

              const statusText =
                round.status === 'ongoing' ? '进行中' : round.status === 'upcoming' ? '未开始' : '已结束';

              return (
                <div
                  key={round.round}
                  onClick={() => setActiveTab(round.round)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '8px 4px',
                    borderRadius: 'var(--semi-border-radius-medium)',
                    backgroundColor: isActive
                      ? 'var(--semi-color-primary-light-default)'
                      : 'var(--semi-color-bg-0)',
                    border: isActive
                      ? '1.5px solid var(--semi-color-primary)'
                      : '1px solid var(--semi-color-border)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    userSelect: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Text
                      strong
                      style={{
                        fontSize: 13,
                        color: isActive ? 'var(--semi-color-primary)' : 'var(--semi-color-text-0)',
                      }}
                    >
                      {round.round} 场
                    </Text>
                    {selectedCount > 0 && (
                      <Tag color="violet" size="small" style={{ fontSize: 10, padding: '0 4px', height: 16, lineHeight: '16px' }}>
                        {selectedCount}
                      </Tag>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      marginTop: 2,
                      color: statusColor,
                      fontWeight: round.status === 'ongoing' ? 600 : 400,
                    }}
                  >
                    {statusText}
                  </span>
                </div>
              );
            })}
          </div>

          {/* 活跃场次商品列表 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeRoundData.items.map((item: FlashSaleItem) => {
              const isSelected = selectedProducts.includes(item.product_key);
              const isSoldOut = Boolean(item.daily_stock_reach || (item.left !== undefined && item.left <= 0));
              const isOngoing = activeRoundData.status === 'ongoing';
              const canDirectExchange = isOngoing && !isSoldOut && ybPoint >= item.community_silk;

              return (
                <div
                  key={item.product_key}
                  onClick={() => toggleProduct(item.product_key)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--semi-border-radius-medium)',
                    backgroundColor: isSelected
                      ? 'var(--semi-color-primary-light-default)'
                      : 'var(--semi-color-bg-0)',
                    border: isSelected
                      ? '1px solid var(--semi-color-primary)'
                      : '1px solid var(--semi-color-border)',
                    boxShadow: isSelected ? '0 0 0 1px var(--semi-color-primary)' : 'none',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
                        <Checkbox checked={isSelected} />
                      </div>
                      <Text strong style={{ fontSize: 14 }}>
                        {item.goods_name}
                      </Text>
                    </div>

                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                      onClick={(e) => e.stopPropagation()}
                    >

                      {isSoldOut ? (
                        <Tag color="red" size="small">
                          已售罄
                        </Tag>
                      ) : (
                        isOngoing && (
                          <Popconfirm
                            title={`确认立即消耗 ${item.community_silk.toLocaleString()} 元宝兑换【${item.goods_name}】？`}
                            content="将立即调用官方接口执行兑换，成功后扣减账号可用元宝。"
                            okText="确认兑换"
                            cancelText="取消"
                            onConfirm={() => handleDirectExchange(item)}
                          >
                            <Button
                              theme="solid"
                              type="primary"
                              size="small"
                              loading={exchangingId === item.exchange_id}
                              disabled={!canDirectExchange}
                            >
                              {ybPoint < item.community_silk ? '元宝不足' : '立即兑换'}
                            </Button>
                          </Popconfirm>
                        )
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, paddingLeft: 24 }}>
                    <Text
                      strong
                      style={{
                        fontSize: 15,
                        fontWeight: 600,
                        color: 'var(--semi-color-primary)',
                      }}
                    >
                      {item.community_silk.toLocaleString()} 元宝
                    </Text>
                    <Tag color="grey" size="small">
                      限购 1 次
                    </Tag>
                    {item.daily_stock !== undefined && (
                      <Text type="tertiary" size="small" style={{ fontSize: 12 }}>
                        限量 {item.daily_stock} 份 / 剩余 {item.left ?? 0}
                      </Text>
                    )}
                  </div>

                  {item.equity_desc && (
                    <div style={{ paddingLeft: 24 }}>
                      <Text type="secondary" size="small" style={{ fontSize: 12, lineHeight: '18px' }}>
                        {item.equity_desc}
                      </Text>
                    </div>
                  )}
                </div>
              );
            })}

            {activeRoundData.items.length === 0 && (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <Text type="tertiary" size="small">
                  暂无在架商品数据
                </Text>
              </div>
            )}
          </div>
        </div>
      </Spin>
    </div>
  );
};
