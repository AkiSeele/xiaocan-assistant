import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  Card,
  Table,
  Typography,
  Tag,
  Button,
  Space,
  Modal,
  Form,
  Select,
  Toast,
  Tabs,
  TabPane,
  Avatar,
  Popconfirm,
  Input,
  RadioGroup,
  Radio,
  Empty,
  Spin,
  Tooltip,
  Banner,
  Switch,
  Badge
} from '@douyinfe/semi-ui';
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import {
  IconRefresh,
  IconSearch,
  IconArrowUp,
  IconClock,
  IconAlertCircle,
  IconTicketCode,
  IconGift,
  IconFastForward,
  IconChevronRight
} from '@douyinfe/semi-icons';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useAppStore } from '../store/useAppStore';
import { api } from '../api';
import type { StoreItem, StorePromotion, StoreAppointment, AccountDetailData } from '../types';

gsap.registerPlugin(useGSAP);

const { Title, Text } = Typography;

const cleanEmoji = (text?: string): string => {
  if (!text) return '';
  return text.replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{2300}-\u{23FF}]|[\u{2B50}-\u{2B55}]|[\u{FE00}-\u{FE0F}]|[\u{200D}]/gu, '').trim();
};

export const getConditionTagColor = (condition?: string): 'green' | 'cyan' | 'blue' | 'amber' | 'grey' => {
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

export const getConditionShortText = (cond?: string): string => {
  if (!cond) return '免评';
  if (cond.includes('无需') || cond.includes('免评')) return '免评';
  if (cond.includes('用餐反馈') || cond.includes('反馈')) return '反馈';
  if (cond.includes('随心')) return '随心';
  if (cond.includes('图文') || cond.includes('好评')) return '图文';
  return cond.slice(0, 2);
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

interface StoreSearchBarProps {
  loading: boolean;
  value: string;
  onSearch: (kw: string) => void;
  onClear: () => void;
}

const StoreSearchBar: React.FC<StoreSearchBarProps> = React.memo(({
  loading,
  value,
  onSearch,
  onClear,
}) => {
  const [localVal, setLocalVal] = useState(value);

  useEffect(() => {
    setLocalVal(value);
  }, [value]);

  const handleTrigger = () => {
    onSearch(localVal);
  };

  const handleClear = () => {
    setLocalVal('');
    onClear();
  };

  return (
    <div className="flex items-center gap-2 w-full sm:w-88 flex-shrink-0">
      <Input
        size="default"
        prefix={<IconSearch />}
        placeholder="搜索店铺名称或美食..."
        value={localVal}
        onChange={(val) => setLocalVal(val)}
        onEnterPress={handleTrigger}
        showClear
        onClear={handleClear}
      />
      <Button
        size="default"
        theme="solid"
        type="primary"
        icon={<IconSearch />}
        loading={loading}
        onClick={handleTrigger}
      >
        搜索
      </Button>
    </div>
  );
});

const DEFAULT_MEAL_TICKET_PIC = 'https://web.xinyifm.cn/oss/xc-backend/176526866545920fc03aff56677a51f3748e03e4df433.png';
const DEFAULT_ADVANCE_COUPON_PIC = 'https://web.xinyifm.cn/oss/xc-backend/17757248992739a34eb5de1a242b29fd70684cd44bce8.png';

export const StoreSniping: React.FC = () => {
  const { accounts, currentAccountKey, activeLocation, setActiveTab } = useAppStore();
  const currentAccount = useMemo(() => accounts.find(a => a.key === currentAccountKey) || accounts[0], [accounts, currentAccountKey]);

  const [stores, setStores] = useState<StoreItem[]>([]);
  const [appointments, setAppointments] = useState<StoreAppointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTabKey, setActiveTabKey] = useState<string>('stores');

  // 当前账号资产概览状态（直观展示饭票、超前抢单券、外卖红包等）
  const [assetStats, setAssetStats] = useState<{
    canUseCards: number;
    expiringSoonCards: number;
    mealTicketCount: number;
    advanceCouponCount: number;
    mealTicketPic: string;
    advanceCouponPic: string;
    redpackCount: number;
    loading: boolean;
  }>({
    canUseCards: 0,
    expiringSoonCards: 0,
    mealTicketCount: 0,
    advanceCouponCount: 0,
    mealTicketPic: DEFAULT_MEAL_TICKET_PIC,
    advanceCouponPic: DEFAULT_ADVANCE_COUPON_PIC,
    redpackCount: 0,
    loading: false,
  });

  // 资产明细弹窗状态
  const [assetDetail, setAssetDetail] = useState<AccountDetailData | null>(null);
  const [assetModalVisible, setAssetModalVisible] = useState(false);
  const [assetModalTab, setAssetModalTab] = useState<'cards' | 'redpacks'>('cards');
  const [cardFilterStatus, setCardFilterStatus] = useState<number>(0);
  const [cardsLoading, setCardsLoading] = useState<boolean>(false);

  // 时间戳格式化辅助函数
  const formatTimestamp = useCallback((ts?: number | string) => {
    if (!ts) return '长期有效';
    const num = Number(ts);
    if (isNaN(num) || num <= 0) return String(ts);
    const d = new Date(num > 10000000000 ? num : num * 1000);
    const Y = d.getFullYear();
    const M = String(d.getMonth() + 1).padStart(2, '0');
    const D = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${Y}-${M}-${D} ${h}:${m}`;
  }, []);

  // 卡券叠加聚合：同类型卡券若过期时间一致则自动叠加展示
  const stackedCards = useMemo(() => {
    const rawCards = assetDetail?.cards || [];
    if (rawCards.length === 0) return [];

    const map = new Map<string, { item: typeof rawCards[0]; count: number }>();
    for (const item of rawCards) {
      const cardType = item.card?.id || item.card?.card_type || item.card?.name || 'card';
      const expireStr = formatTimestamp(item.expire_time);
      const groupKey = `${cardType}_${expireStr}`;

      if (map.has(groupKey)) {
        map.get(groupKey)!.count += 1;
      } else {
        map.set(groupKey, { item, count: 1 });
      }
    }
    return Array.from(map.values());
  }, [assetDetail?.cards, formatTimestamp]);

  const lastAssetsAccountKeyRef = useRef<string>('');
  const inFlightAssetsRef = useRef<boolean>(false);

  const fetchAccountAssets = useCallback(async (accountKey?: string, force = false) => {
    const key = accountKey || currentAccountKey;
    if (!key) return;
    if (!force && lastAssetsAccountKeyRef.current === key) {
      return;
    }
    if (inFlightAssetsRef.current) return;
    inFlightAssetsRef.current = true;
    lastAssetsAccountKeyRef.current = key;

    setAssetStats(prev => ({ ...prev, loading: true }));
    try {
      const res = await api.getAccountDetail(key);
      if (res && res.ok) {
        setAssetDetail(res);
        const rawCards = res.cards || [];
        let mealCount = 0;
        let advanceCount = 0;
        let mealPic = DEFAULT_MEAL_TICKET_PIC;
        let advancePic = DEFAULT_ADVANCE_COUPON_PIC;

        for (const c of rawCards) {
          const cname = c.card?.name || '';
          const ctype = c.card?.card_type;
          if (cname.includes('饭票') || ctype === 0) {
            mealCount++;
            if (c.card?.pic) {
              mealPic = c.card.pic;
            }
          } else if (cname.includes('超前') || ctype === 1) {
            advanceCount++;
            if (c.card?.pic) {
              advancePic = c.card.pic;
            }
          }
        }

        setAssetStats({
          canUseCards: res.card_stats?.can_use_number ?? rawCards.length,
          expiringSoonCards: res.card_stats?.expiring_soon_number ?? 0,
          mealTicketCount: mealCount,
          advanceCouponCount: advanceCount,
          mealTicketPic: mealPic,
          advanceCouponPic: advancePic,
          redpackCount: res.redpack_stats?.num ?? (res.redpacks ? res.redpacks.length : 0),
          loading: false,
        });
      } else {
        setAssetStats(prev => ({ ...prev, loading: false }));
      }
    } catch {
      setAssetStats(prev => ({ ...prev, loading: false }));
    } finally {
      inFlightAssetsRef.current = false;
    }
  }, [currentAccountKey]);

  const handleChangeCardStatus = useCallback(async (status: number) => {
    if (!currentAccountKey) return;
    setCardFilterStatus(status);
    setCardsLoading(true);
    try {
      const res = await api.getAccountCards(currentAccountKey, status);
      if (res.ok && assetDetail) {
        setAssetDetail(prev => prev ? {
          ...prev,
          cards: res.cards || []
        } : null);
      }
    } catch {
      Toast.error('切换卡券状态失败');
    } finally {
      setCardsLoading(false);
    }
  }, [currentAccountKey, assetDetail]);

  const handleOpenAssetModal = useCallback((tab: 'cards' | 'redpacks') => {
    setAssetModalTab(tab);
    setAssetModalVisible(true);
    if (!assetDetail && currentAccountKey) {
      fetchAccountAssets(currentAccountKey, true);
    }
  }, [assetDetail, currentAccountKey, fetchAccountAssets]);

  useEffect(() => {
    if (currentAccountKey) {
      fetchAccountAssets(currentAccountKey);
    }
  }, [currentAccountKey, fetchAccountAssets]);

  // 筛选与搜索条件
  const [platformFilter, setPlatformFilter] = useState<'all' | 'meituan' | 'eleme' | 'jingdong'>('all');
  const [rebateTypeFilter, setRebateTypeFilter] = useState<'all' | 'fixed' | 'percent'>('all');
  const [conditionFilter, setConditionFilter] = useState<'all' | 'no_review' | 'good_review'>('all');
  const [sortBy, setSortBy] = useState<'default' | 'distance' | 'rebate' | 'rate' | 'left'>('default');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [activeSearchKeyword, setActiveSearchKeyword] = useState<string>('');
  
  // 流式触底加载状态
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [showBackTop, setShowBackTop] = useState(false);

  const mainContainerRef = useRef<HTMLDivElement | null>(null);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const brandContainerRef = useRef<HTMLDivElement | null>(null);
  const appointContainerRef = useRef<HTMLDivElement | null>(null);
  const dualContainerRef = useRef<HTMLDivElement | null>(null);
  const [tabScrollHeights, setTabScrollHeights] = useState<Record<string, number>>({
    stores: 480,
    brand_coupon: 480,
    dual_rebate: 440,
    appointments: 480,
  });
  const showBackTopRef = useRef<boolean>(false);
  const scrollRafRef = useRef<number | null>(null);
  const hasMoreRef = useRef<boolean>(true);
  const loadingRef = useRef<boolean>(false);
  const loadingMoreRef = useRef<boolean>(false);
  const nextOffsetRef = useRef<number>(0);
  const activeSearchKeywordRef = useRef<string>('');
  const pagePvIdRef = useRef<string>('');

  // 批量自动加载与美团双返利筛选融合状态
  const [batchTarget, setBatchTarget] = useState<number | undefined>(undefined);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; target: number } | null>(null);
  const abortBatchRef = useRef<boolean>(false);
  const [onlyDualRebate, setOnlyDualRebate] = useState(false);
  const storesRef = useRef<StoreItem[]>([]);

  useEffect(() => {
    storesRef.current = stores;
  }, [stores]);

  // 仅且只有「周边门店通用」的店铺归入大牌券专享 Tab，其他所有店铺均为普通附近店铺
  const isBrandCouponStore = useCallback((s: StoreItem) => {
    return Boolean(
      s.distance_text && (
        s.distance_text === '周边门店通用' ||
        s.distance_text.includes('周边门店通用')
      )
    );
  }, []);

  // 提取店铺在平台内的同店分店唯一聚合标识（准确保留主品牌与核心分店，杜绝跨分店混淆）
  const getStoreBranchIdentityKey = useCallback((s: { name?: string; platform?: string; store_id?: string }) => {
    const plat = s.platform || 'meituan';
    const rawName = s.name || '';
    const n = rawName.replace(/[（【]/g, '(').replace(/[）】]/g, ')').replace(/\s+/g, '');
    const m = n.match(/^([^(\[]+)(?:[(\[](.*?)[)\]])?/);
    if (!m) {
      return `${plat}_${n.toLowerCase()}`;
    }
    const brand = m[1].trim().toLowerCase();
    const branchRaw = (m[2] || '').trim().toLowerCase();
    if (!branchRaw) {
      return `${plat}_${brand}`;
    }
    const bm = branchRaw.match(/([^·・,，.、]+?店)/);
    const branchCore = bm ? bm[1] : branchRaw.split(/[·・,，.、]/)[0];
    return `${plat}_${brand}_${branchCore}`;
  }, []);

  // 识别美团同店双返利商户（严格限定同平台同分店，必须同时具备实付满返与按比例返两类方案）
  const dualRebateStoreKeys = useMemo(() => {
    const branchMap = new Map<string, { fixed: boolean; percent: boolean }>();

    for (const s of stores) {
      const isMeituan = s.platform === 'meituan' || s.store_platform === 1 || !s.platform;
      if (!isMeituan) continue;

      const branchKey = getStoreBranchIdentityKey(s);
      const entry = branchMap.get(branchKey) || { fixed: false, percent: false };

      const hasFixed = s.rebate_type === 'fixed' ||
        Boolean(s.fixed_plan || s.fixed_plans?.length) ||
        (s.promotions && s.promotions.some(p => p.rebate_type === 'fixed' && ((p.rebate_price || 0) > 0 || (p.order_money || 0) > 0)));

      const hasPercent = s.rebate_type === 'percent' ||
        Boolean(s.percent_plan || s.percent_plans?.length) ||
        (s.promotions && s.promotions.some(p => p.rebate_type === 'percent' && ((p.rebate_rate || 0) > 0 || (p.rebate_price || 0) > 0)));

      if (hasFixed) entry.fixed = true;
      if (hasPercent) entry.percent = true;
      branchMap.set(branchKey, entry);
    }

    const dualKeys = new Set<string>();
    for (const s of stores) {
      const isMeituan = s.platform === 'meituan' || s.store_platform === 1 || !s.platform;
      if (!isMeituan) continue;
      const branchKey = getStoreBranchIdentityKey(s);
      const entry = branchMap.get(branchKey);
      if (entry && entry.fixed && entry.percent) {
        dualKeys.add(`${s.store_id || s.name}_${s.platform || 'all'}`);
      }
    }
    return dualKeys;
  }, [stores, getStoreBranchIdentityKey]);

  const regularStores = useMemo(() => {
    let list = stores.filter(s => !isBrandCouponStore(s));
    if (onlyDualRebate) {
      list = list.filter(s => dualRebateStoreKeys.has(`${s.store_id || s.name}_${s.platform || 'all'}`));
    }
    return list;
  }, [stores, isBrandCouponStore, onlyDualRebate, dualRebateStoreKeys]);

  const brandCouponStores = useMemo(() => {
    let list = stores.filter(s => isBrandCouponStore(s));
    if (onlyDualRebate) {
      list = list.filter(s => dualRebateStoreKeys.has(`${s.store_id || s.name}_${s.platform || 'all'}`));
    }
    return list;
  }, [stores, isBrandCouponStore, onlyDualRebate, dualRebateStoreKeys]);



  // 预约配置弹窗
  const [appointModalVisible, setAppointModalVisible] = useState(false);
  const [selectedStore, setSelectedStore] = useState<StoreItem | null>(null);

  // 同店双返利状态
  const [dualStores, setDualStores] = useState<StoreItem[]>([]);
  const [dualScanLoading, setDualScanLoading] = useState(false);
  const [dualScanDone, setDualScanDone] = useState(false);
  const [dualTotalPromos, setDualTotalPromos] = useState(0);
  const [dualTotalStores, setDualTotalStores] = useState(0);
  const [dualSearchKeyword, setDualSearchKeyword] = useState('');
  const [dualMaxStores, setDualMaxStores] = useState<number>(300);

  // 档位选择与多任务


  // 单店档位选择直接绑定在 store 对象上，避免整个大表格因根状态变更全量重绘
  const handleSelectPromo = useCallback((storeKey: string, promoId: string) => {
    setStores(prev => prev.map(s => {
      const key = `${s.store_id || s.name}_${s.platform || 'all'}`;
      if (key === storeKey) {
        return { ...s, selected_promotion_id: promoId };
      }
      return s;
    }));
  }, []);

  // 美团同店双返利满返档位切换
  const handleSelectDualFixedPromo = useCallback((storeKey: string, promoId: string) => {
    setDualStores(prev => prev.map(s => {
      const key = `${s.store_id || s.name}_${s.platform || 'all'}`;
      if (key === storeKey) {
        return { ...s, selected_fixed_pid: promoId };
      }
      return s;
    }));
  }, []);

  // 美团同店双返利比例档位切换
  const handleSelectDualPercentPromo = useCallback((storeKey: string, promoId: string) => {
    setDualStores(prev => prev.map(s => {
      const key = `${s.store_id || s.name}_${s.platform || 'all'}`;
      if (key === storeKey) {
        return { ...s, selected_percent_pid: promoId };
      }
      return s;
    }));
  }, []);
  const [appointModalMode, setAppointModalMode] = useState<'countdown' | 'monitor'>('countdown');
  const [selectedPromo, setSelectedPromo] = useState<StorePromotion | StoreItem | null>(null);
  const [grabbingId, setGrabbingId] = useState<string | null>(null);

  // 同店双返利/多活动即时过滤 (使用 useDeferredValue 避免输入卡顿)
  const deferredDualKeyword = React.useDeferredValue(dualSearchKeyword);
  const displayedDualStores = useMemo(() => {
    if (!deferredDualKeyword.trim()) return dualStores;
    const kw = deferredDualKeyword.trim().toLowerCase();
    return dualStores.filter(s =>
      (s.name && s.name.toLowerCase().includes(kw)) ||
      (s.fixed_plan?.rebate_desc && s.fixed_plan.rebate_desc.toLowerCase().includes(kw)) ||
      (s.percent_plan?.rebate_desc && s.percent_plan.rebate_desc.toLowerCase().includes(kw)) ||
      (s.promotions && s.promotions.some(p => p.rebate_desc && p.rebate_desc.toLowerCase().includes(kw)))
    );
  }, [dualStores, deferredDualKeyword]);

  // 动态自适应屏幕高度计算：使得表格与底部状态栏紧密贴合 Card 底部，消除遮挡与底部截断
  const updateTableHeight = useCallback(() => {
    const tabs: Array<{ key: string; ref: React.RefObject<HTMLDivElement | null> }> = [
      { key: 'stores', ref: tableContainerRef },
      { key: 'brand_coupon', ref: brandContainerRef },
      { key: 'dual_rebate', ref: dualContainerRef },
      { key: 'appointments', ref: appointContainerRef },
    ];

    let baselineContainerH = 0;
    for (const tab of tabs) {
      if (tab.ref.current && tab.ref.current.clientHeight > 0) {
        baselineContainerH = tab.ref.current.clientHeight;
        break;
      }
    }

    const newHeights: Record<string, number> = {};

    for (const tab of tabs) {
      const el = tab.ref.current;
      if (!el) continue;

      const containerH = el.clientHeight > 0 ? el.clientHeight : baselineContainerH;
      if (containerH <= 0) continue;

      const subheaderEl = el.querySelector('.store-table-subheader') as HTMLElement;
      const subheaderH = subheaderEl ? subheaderEl.offsetHeight : 0;

      const headerEl = el.querySelector('.semi-table-header') as HTMLElement;
      const headerH = headerEl ? headerEl.offsetHeight : 44;

      const footerEl = el.querySelector('.store-table-footer') as HTMLElement;
      const paginationEl = el.querySelector('.semi-table-pagination-outer') as HTMLElement;
      const footerH = footerEl
        ? footerEl.offsetHeight
        : (paginationEl ? paginationEl.offsetHeight : (tab.key === 'appointments' ? 49 : 41));

      // 精确填满卡片容器空间，配合 footer 的 margin-top: auto 实现 0 缝隙贴底
      const available = containerH - subheaderH - headerH - footerH;
      newHeights[tab.key] = Math.max(220, Math.floor(available));
    }

    if (Object.keys(newHeights).length > 0) {
      setTabScrollHeights(prev => {
        let changed = false;
        for (const k of Object.keys(newHeights)) {
          if (prev[k] !== newHeights[k]) {
            changed = true;
            break;
          }
        }
        return changed ? { ...prev, ...newHeights } : prev;
      });
    }
  }, []);

  useEffect(() => {
    updateTableHeight();
    const rafId = requestAnimationFrame(updateTableHeight);
    const timer = setTimeout(updateTableHeight, 60);

    const handleResize = () => {
      requestAnimationFrame(updateTableHeight);
    };
    window.addEventListener('resize', handleResize);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        requestAnimationFrame(updateTableHeight);
      });
      if (mainContainerRef.current) ro.observe(mainContainerRef.current);
      if (tableContainerRef.current) ro.observe(tableContainerRef.current);
      if (brandContainerRef.current) ro.observe(brandContainerRef.current);
      if (dualContainerRef.current) ro.observe(dualContainerRef.current);
      if (appointContainerRef.current) ro.observe(appointContainerRef.current);
    }

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
      ro?.disconnect();
    };
  }, [
    updateTableHeight,
    activeTabKey,
    dualScanDone,
    dualScanLoading,
    displayedDualStores.length,
    regularStores.length,
    brandCouponStores.length,
    appointments.length
  ]);

  // GSAP: 遵循 gsap-skills 规范，Tab 切换纯透明度平滑淡入，完全走 GPU 合成通道无回流开销
  useGSAP(() => {
    gsap.killTweensOf('.tab-content-anim');
    gsap.fromTo(
      '.tab-content-anim',
      { opacity: 0.7 },
      {
        opacity: 1,
        duration: 0.15,
        ease: 'power1.out',
        clearProps: 'opacity',
      }
    );
  }, { scope: mainContainerRef, dependencies: [activeTabKey] });

  const handleTriggerDualScan = async (customMax?: number, customKw?: string) => {
    if (accounts.length === 0) {
      Toast.warning('请先绑定或选择账号');
      return;
    }
    setDualScanLoading(true);
    const targetKw = customKw !== undefined ? customKw : dualSearchKeyword.trim();
    const targetMax = customMax !== undefined ? customMax : dualMaxStores;
    try {
      const res = await api.scanDualRebateStores({
        city_code: activeLocation.cityCode,
        longitude: activeLocation.longitude,
        latitude: activeLocation.latitude,
        account_key: currentAccountKey,
        platform: 'all',
        keyword: targetKw || undefined,
        max_stores: targetMax
      });
      if (res.ok) {
        setDualStores(res.stores || []);
        setDualTotalPromos(res.total_scanned_promotions || 0);
        setDualTotalStores(res.total_scanned_stores || 0);
        setDualScanDone(true);
        Toast.success(res.message || `扫描完成：已筛选出 ${res.stores?.length || 0} 家同店多活动/双福利商户`);
      } else {
        Toast.error(res.message || '商户扫描失败');
      }
    } catch (e: any) {
      Toast.error('扫描请求失败: ' + (e?.message || '网络连接超时'));
    } finally {
      setDualScanLoading(false);
    }
  };

  const lastStoresQuerySignatureRef = useRef<string>('');
  const inFlightStoresRef = useRef<boolean>(false);

  const fetchStores = useCallback(async (kw?: string, force = false) => {
    if (accounts.length === 0) {
      setStores([]);
      setHasMore(false);
      hasMoreRef.current = false;
      return;
    }
    const keywordToSearch = kw !== undefined ? kw : activeSearchKeywordRef.current;
    const querySignature = `${activeLocation.cityCode}_${activeLocation.longitude}_${activeLocation.latitude}_${currentAccountKey}_${platformFilter}_${conditionFilter}_${rebateTypeFilter}_${sortBy}_${keywordToSearch}`;

    if (!force && lastStoresQuerySignatureRef.current === querySignature) {
      return;
    }
    if (inFlightStoresRef.current) return;
    inFlightStoresRef.current = true;
    lastStoresQuerySignatureRef.current = querySignature;

    setLoading(true);
    loadingRef.current = true;
    setHasMore(true);
    hasMoreRef.current = true;
    nextOffsetRef.current = 0;
    pagePvIdRef.current = '';
    activeSearchKeywordRef.current = keywordToSearch;

    try {
      const res = await api.getStores({
        city_code: activeLocation.cityCode,
        longitude: activeLocation.longitude,
        latitude: activeLocation.latitude,
        account_key: currentAccountKey,
        platform: platformFilter,
        condition: conditionFilter,
        rebate_type: rebateTypeFilter,
        sort_by: sortBy,
        keyword: keywordToSearch,
        offset: 0
      });
      if (res.ok) {
        const fetchedStores = res.stores || [];
        setStores(fetchedStores);
        setActiveSearchKeyword(keywordToSearch);
        const more = res.has_more !== undefined ? res.has_more : fetchedStores.length > 0;
        setHasMore(more);
        hasMoreRef.current = more;
        const newOffset = res.next_offset !== undefined ? res.next_offset : fetchedStores.length;
        nextOffsetRef.current = newOffset;
        pagePvIdRef.current = res.page_pv_id || '';

        const tableBody = tableContainerRef.current?.querySelector('.semi-table-body') as HTMLElement;
        if (tableBody) {
          tableBody.scrollTop = 0;
        }
      } else {
        setStores([]);
        setHasMore(false);
        hasMoreRef.current = false;
        if (res.error) {
          Toast.warning(res.error);
        }
      }
    } catch {
      lastStoresQuerySignatureRef.current = '';
      Toast.error('获取店铺列表失败');
      setHasMore(false);
      hasMoreRef.current = false;
    } finally {
      inFlightStoresRef.current = false;
      setLoading(false);
      loadingRef.current = false;
    }
  }, [accounts.length, activeLocation.cityCode, activeLocation.latitude, activeLocation.longitude, conditionFilter, currentAccountKey, platformFilter, rebateTypeFilter, sortBy]);

  const loadMoreStores = useCallback(async () => {
    if (loadingRef.current || loadingMoreRef.current || !hasMoreRef.current || accounts.length === 0) {
      return;
    }

    setLoadingMore(true);
    loadingMoreRef.current = true;
    setLoadMoreError(false);

    try {
      const res = await api.getStores({
        city_code: activeLocation.cityCode,
        longitude: activeLocation.longitude,
        latitude: activeLocation.latitude,
        account_key: currentAccountKey,
        platform: platformFilter,
        condition: conditionFilter,
        rebate_type: rebateTypeFilter,
        sort_by: sortBy,
        keyword: activeSearchKeywordRef.current,
        offset: nextOffsetRef.current,
        page_pv_id: pagePvIdRef.current || undefined
      });

      if (res.ok) {
        if (res.page_pv_id) {
          pagePvIdRef.current = res.page_pv_id;
        }
        const newStores = res.stores || [];
        if (newStores.length === 0) {
          if (!res.has_more) {
            setHasMore(false);
            hasMoreRef.current = false;
          } else {
            const newOffset = res.next_offset !== undefined ? res.next_offset : (nextOffsetRef.current + 20);
            nextOffsetRef.current = newOffset;
          }
        } else {
          setStores(prev => {
            const mergedList = [...prev];
            const identityIndexMap = new Map<string, number>();

            mergedList.forEach((s, idx) => {
              const bKey = getStoreBranchIdentityKey(s);
              identityIndexMap.set(bKey, idx);
              if (s.store_id && s.store_id !== '0') {
                identityIndexMap.set(`${s.platform || 'meituan'}_id_${s.store_id}`, idx);
              }
            });

            for (const ns of newStores) {
              const bKey = getStoreBranchIdentityKey(ns);
              const idKey = ns.store_id && ns.store_id !== '0' ? `${ns.platform || 'meituan'}_id_${ns.store_id}` : null;
              
              const matchIdx = (idKey && identityIndexMap.has(idKey))
                ? identityIndexMap.get(idKey)!
                : (identityIndexMap.has(bKey) ? identityIndexMap.get(bKey)! : -1);

              if (matchIdx >= 0) {
                const existing = { ...mergedList[matchIdx] };
                const existingPromos = existing.promotions ? [...existing.promotions] : [];
                const incomingPromos = ns.promotions && ns.promotions.length > 0 ? ns.promotions : [{
                  promotion_id: ns.promotion_id,
                  order_money: ns.order_money,
                  rebate_price: ns.rebate_price,
                  rebate_rate: ns.rebate_rate,
                  rebate_desc: ns.rebate_desc,
                  rebate_type: ns.rebate_type,
                  rebate_type_text: ns.rebate_type_text,
                  condition: ns.condition,
                  left_number: ns.left_number,
                  start_time: ns.start_time,
                  end_time: ns.end_time,
                  platform: ns.platform,
                  store_platform: ns.store_platform,
                  need_brand_coupon: ns.need_brand_coupon,
                  brand_left_number: ns.brand_left_number,
                  is_vip_brand: ns.is_vip_brand,
                  days_limit: ns.days_limit,
                  days_order_limit: ns.days_order_limit,
                  same_group_id: ns.same_group_id,
                  if_use_red_pack: ns.if_use_red_pack,
                  address: ns.address
                }];

                const promoMap = new Map(existingPromos.map(p => [p.promotion_id, p]));
                for (const p of incomingPromos) {
                  if (p.promotion_id && !promoMap.has(p.promotion_id)) {
                    promoMap.set(p.promotion_id, p);
                  }
                }
                const updatedPromos = Array.from(promoMap.values());
                const fPlans = updatedPromos.filter(p => p.rebate_type === 'fixed');
                const pPlans = updatedPromos.filter(p => p.rebate_type === 'percent');

                existing.promotions = updatedPromos;
                existing.promotion_count = updatedPromos.length;
                existing.fixed_plans = fPlans;
                existing.percent_plans = pPlans;
                if (fPlans.length > 0) existing.fixed_plan = fPlans[0];
                if (pPlans.length > 0) existing.percent_plan = pPlans[0];

                // 择优选出主展示方案：优先选有名额的实付满返方案，其次有名额的任意方案，或第一档满返
                const bestPromo = fPlans.find(p => (p.left_number ?? 0) > 0) || fPlans[0] || updatedPromos.find(p => (p.left_number ?? 0) > 0) || updatedPromos[0];
                if (bestPromo) {
                  if (!existing.selected_promotion_id) {
                    existing.promotion_id = bestPromo.promotion_id;
                    existing.order_money = bestPromo.order_money;
                    existing.rebate_price = bestPromo.rebate_price;
                    existing.rebate_rate = bestPromo.rebate_rate;
                    existing.rebate_desc = bestPromo.rebate_desc;
                    existing.rebate_type = bestPromo.rebate_type;
                    existing.rebate_type_text = bestPromo.rebate_type_text;
                    existing.condition = bestPromo.condition;
                    existing.left_number = bestPromo.left_number;
                  }
                  existing.start_time = bestPromo.start_time;
                  existing.end_time = bestPromo.end_time;
                }

                if ((!existing.distance || existing.distance === 0) && ns.distance && ns.distance > 0) {
                  existing.distance = ns.distance;
                  existing.distance_text = ns.distance_text;
                }
                if (!existing.address && ns.address) {
                  existing.address = ns.address;
                }
                mergedList[matchIdx] = existing;
              } else {
                const newIdx = mergedList.length;
                mergedList.push(ns);
                identityIndexMap.set(bKey, newIdx);
                if (idKey) identityIndexMap.set(idKey, newIdx);
              }
            }

            if (sortBy === 'distance') {
              mergedList.sort((a, b) => {
                const da = a.distance && a.distance > 0 ? a.distance : 9999999;
                const db = b.distance && b.distance > 0 ? b.distance : 9999999;
                return da - db;
              });
            }
            return mergedList;
          });
          const more = res.has_more !== undefined ? res.has_more : (newStores.length >= 10);
          setHasMore(more);
          hasMoreRef.current = more;
          const newOffset = res.next_offset !== undefined ? res.next_offset : (nextOffsetRef.current + newStores.length);
          nextOffsetRef.current = newOffset;
        }
      } else {
        setHasMore(false);
        hasMoreRef.current = false;
      }
    } catch {
      setLoadMoreError(true);
    } finally {
      setLoadingMore(false);
      loadingMoreRef.current = false;
    }
  }, [accounts.length, activeLocation.cityCode, activeLocation.latitude, activeLocation.longitude, conditionFilter, currentAccountKey, platformFilter, rebateTypeFilter, sortBy]);

  // 自动批量加载循环：连续拉取直至达到设定商家数或加载完毕
  const triggerBatchLoad = useCallback(async (targetCount: number) => {
    if (targetCount <= 0) return;
    if (accounts.length === 0) {
      Toast.warning('请先选择或绑定账号');
      return;
    }
    abortBatchRef.current = false;
    setBatchLoading(true);

    try {
      while (!abortBatchRef.current && hasMoreRef.current && storesRef.current.length < targetCount) {
        setBatchProgress({ current: storesRef.current.length, target: targetCount });
        await loadMoreStores();
        // 微小停顿让出主线程，保证进度渲染与用户可随时点击停止
        await new Promise(r => setTimeout(r, 60));
      }
      if (storesRef.current.length >= targetCount) {
        Toast.success(`已自动加载至 ${storesRef.current.length} 家商户`);
      } else if (!hasMoreRef.current) {
        Toast.info(`已加载全部商户（共 ${storesRef.current.length} 家）`);
      }
    } catch {
      // ignore
    } finally {
      setBatchLoading(false);
      setBatchProgress(null);
    }
  }, [accounts.length, loadMoreStores]);

  const handleSelectBatchTarget = useCallback((val?: number) => {
    setBatchTarget(val);
    if (val && val > 0) {
      triggerBatchLoad(val);
    } else {
      abortBatchRef.current = true;
      setBatchLoading(false);
      setBatchProgress(null);
    }
  }, [triggerBatchLoad]);

  const handleStopBatch = useCallback(() => {
    abortBatchRef.current = true;
    setBatchLoading(false);
    setBatchProgress(null);
    Toast.info('已停止自动加载');
  }, []);

  const scrollToTop = () => {
    const tableBody = tableContainerRef.current?.querySelector('.semi-table-body') as HTMLElement;
    if (tableBody) {
      tableBody.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return;

    let tableBody = container.querySelector('.semi-table-body') as HTMLElement;

    const onScrollHandler = () => {
      if (!tableBody) return;
      if (scrollRafRef.current !== null) return;

      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        if (!tableBody) return;
        const { scrollTop, scrollHeight, clientHeight } = tableBody;

        // 仅在布尔值反转时触发状态更新，杜绝滚动中每帧重复 re-render
        const nextShow = scrollTop > 240;
        if (nextShow !== showBackTopRef.current) {
          showBackTopRef.current = nextShow;
          setShowBackTop(nextShow);
        }

        // 触底加载增加前置检查，避免高频重复请求
        if (scrollHeight - scrollTop - clientHeight < 160) {
          if (!loadingRef.current && !loadingMoreRef.current && hasMoreRef.current) {
            loadMoreStores();
          }
        }
      });
    };

    if (!tableBody) {
      const timer = setTimeout(() => {
        tableBody = container.querySelector('.semi-table-body') as HTMLElement;
        if (tableBody) {
          tableBody.addEventListener('scroll', onScrollHandler, { passive: true });
        }
      }, 150);
      return () => {
        clearTimeout(timer);
        if (tableBody) {
          tableBody.removeEventListener('scroll', onScrollHandler);
        }
        if (scrollRafRef.current !== null) {
          cancelAnimationFrame(scrollRafRef.current);
          scrollRafRef.current = null;
        }
      };
    }

    tableBody.addEventListener('scroll', onScrollHandler, { passive: true });
    return () => {
      tableBody?.removeEventListener('scroll', onScrollHandler);
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [activeTabKey, stores.length, loadMoreStores]);

  const handleSearch = useCallback((kwFromInput?: string) => {
    const kw = (typeof kwFromInput === 'string' ? kwFromInput : searchKeyword).trim();
    setSearchKeyword(kw);
    setActiveSearchKeyword(kw);
    activeSearchKeywordRef.current = kw;
    fetchStores(kw, true);
  }, [searchKeyword, fetchStores]);

  const handleClearSearch = useCallback(() => {
    setSearchKeyword('');
    setActiveSearchKeyword('');
    activeSearchKeywordRef.current = '';
    fetchStores('', true);
  }, [fetchStores]);

  const lastAppointmentsKeyRef = useRef<string>('');
  const inFlightAppointmentsRef = useRef<boolean>(false);

  const fetchAppointments = useCallback(async (force = false) => {
    const key = currentAccountKey || '';
    if (!force && lastAppointmentsKeyRef.current === key) {
      return;
    }
    if (inFlightAppointmentsRef.current) return;
    inFlightAppointmentsRef.current = true;
    lastAppointmentsKeyRef.current = key;

    try {
      const res = await api.getAppointments(key);
      if (res.ok) {
        setAppointments(res.appointments || []);
      }
    } catch {
      lastAppointmentsKeyRef.current = '';
      // ignore
    } finally {
      inFlightAppointmentsRef.current = false;
    }
  }, [currentAccountKey]);

  useEffect(() => {
    fetchStores();
    fetchAppointments();
  }, [fetchStores, fetchAppointments]);



  const timeStatusCache = useRef<Map<string, { status: 'before' | 'active' | 'ended'; label: string; diffMinutes: number }>>(new Map());
  const lastCacheClearTime = useRef<number>(Date.now());

  // 增加 30 秒时段状态计算缓存，消除表格每行渲染时的重复 Date 解析与字符串切分
  const getStoreTimeStatus = useCallback((startTimeStr?: string, endTimeStr?: string) => {
    if (!startTimeStr) return { status: 'active' as const, label: '进行中', diffMinutes: 0 };

    const nowMs = Date.now();
    if (nowMs - lastCacheClearTime.current > 30000) {
      timeStatusCache.current.clear();
      lastCacheClearTime.current = nowMs;
    }

    const cacheKey = `${startTimeStr}_${endTimeStr || ''}`;
    const cached = timeStatusCache.current.get(cacheKey);
    if (cached) return cached;

    const now = new Date(nowMs);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const parseMinutes = (tStr: string) => {
      const parts = tStr.split(':');
      return parseInt(parts[0], 10) * 60 + parseInt(parts[1] || '0', 10);
    };

    const startMin = parseMinutes(startTimeStr);
    const endMin = endTimeStr ? parseMinutes(endTimeStr) : 23 * 60 + 59;

    let result: { status: 'before' | 'active' | 'ended'; label: string; diffMinutes: number };
    if (currentMinutes < startMin) {
      const diff = startMin - currentMinutes;
      result = {
        status: 'before',
        label: `未开抢 (${startTimeStr})`,
        diffMinutes: diff
      };
    } else if (currentMinutes <= endMin) {
      result = {
        status: 'active',
        label: '抢单中',
        diffMinutes: 0
      };
    } else {
      result = {
        status: 'ended',
        label: '已打烊',
        diffMinutes: 0
      };
    }

    timeStatusCache.current.set(cacheKey, result);
    return result;
  }, []);

  const handleOpenAppoint = useCallback((store: StoreItem, promo?: StorePromotion | StoreItem, forceMode?: 'countdown' | 'monitor') => {
    if (!currentAccountKey) {
      Toast.warning('请先选择或绑定账号');
      return;
    }
    const chosenPid = store.selected_promotion_id || store.promotion_id;
    const targetPromo = promo || store.promotions?.find(p => p.promotion_id === chosenPid) || store;

    const timeStat = getStoreTimeStatus(targetPromo.start_time, targetPromo.end_time);
    const mode = forceMode || (timeStat.status === 'before' ? 'countdown' : 'monitor');

    setSelectedStore(store);
    setSelectedPromo(targetPromo);
    setAppointModalMode(mode);
    setAppointModalVisible(true);
  }, [currentAccountKey, getStoreTimeStatus]);

  const handleGrabNow = useCallback(async (store: StoreItem, promo?: StorePromotion | StoreItem) => {
    if (!currentAccountKey) {
      Toast.warning('请先选择或绑定账号');
      return;
    }
    const currentPid = store.selected_promotion_id || store.promotion_id;
    const targetPromo = promo || (store.promotions?.find(p => p.promotion_id === currentPid)) || store;
    const promoId = targetPromo.promotion_id;
    setGrabbingId(promoId);

    try {
      const res = await api.grabStoreNow({
        account_key: currentAccountKey,
        store_id: targetPromo.store_id || store.store_id,
        store_name: store.name,
        promotion_id: promoId,
        platform: store.platform,
        order_money: targetPromo.order_money,
        rebate_price: targetPromo.rebate_price,
        rebate_desc: targetPromo.rebate_desc
      });

      if (res.ok) {
        Toast.success(res.message || '抢单成功，名额已锁定');
        fetchStores(undefined, true);
        fetchAppointments(true);
      } else {
        if (res.can_monitor) {
          Modal.confirm({
            title: '当前名额已抢空',
            content: '首轮名额已抢完，是否立即为此店铺开启「名额监听」？有退单或补仓时将自动尝试抢单。',
            okText: '开启名额监听',
            cancelText: '取消',
            onOk: () => {
              handleOpenAppoint(store, targetPromo, 'monitor');
            }
          });
        } else {
          Toast.warning(res.message || '抢单未成功');
        }
      }
    } catch (e: any) {
      Toast.error('抢单请求失败: ' + (e?.message || '网络异常'));
    } finally {
      setGrabbingId(null);
    }
  }, [currentAccountKey, fetchStores, fetchAppointments, handleOpenAppoint]);

  const handleSubmitAppoint = async (values: any) => {
    if (!selectedStore || !selectedPromo || !currentAccountKey) return;
    try {
      const isMonitor = appointModalMode === 'monitor';
      await api.createAppointment({
        account_key: currentAccountKey,
        store_id: selectedPromo.store_id || selectedStore.store_id,
        store_name: selectedStore.name,
        promotion_id: selectedPromo.promotion_id,
        platform: selectedStore.platform,
        task_type: isMonitor ? 'monitor' : 'countdown',
        start_time: selectedPromo.start_time,
        until_time: values.until_time || selectedPromo.end_time || '23:59',
        early_ms: values.early_ms || 500,
        check_interval: values.check_interval || 5,
        order_money: selectedPromo.order_money,
        rebate_price: selectedPromo.rebate_price,
        rebate_desc: selectedPromo.rebate_desc || `满${selectedPromo.order_money}返${selectedPromo.rebate_price}元`,
        rebate_type: selectedPromo.rebate_type || 'fixed',
        redpack_mode: values.redpack_mode || 0
      });

      Toast.success(isMonitor ? `已开启【${selectedStore.name}】名额监听任务` : `店铺【${selectedStore.name}】已加入定时预约抢单队列`);
      setAppointModalVisible(false);
      fetchAppointments();
    } catch {
      Toast.error('提交失败，请重试');
    }
  };

  const handleStopAppoint = useCallback(async (aid: number) => {
    try {
      const res = await api.stopAppointment(aid);
      if (res.ok) {
        Toast.success('已停止名额监听任务');
        fetchAppointments();
      }
    } catch {
      Toast.error('停止监听失败');
    }
  }, [fetchAppointments]);

  const handleCancelAppoint = useCallback(async (aid: number) => {
    try {
      await api.cancelAppointment(aid);
      Toast.success('已删除任务记录');
      fetchAppointments();
    } catch {
      Toast.error('操作失败');
    }
  }, [fetchAppointments]);

  const storeColumns: ColumnProps<StoreItem>[] = useMemo(() => [
    {
      title: '店铺信息',
      dataIndex: 'name',
      render: (name: string, row?: StoreItem) => {
        if (!row) return name;
        const platInfo = getPlatformBadge(row.platform);
        const storeKey = `${row.store_id || row.name}_${row.platform || 'all'}`;
        const currentPid = row.selected_promotion_id || row.promotion_id;
        const hasMulti = row.promotions && row.promotions.length > 1;

        return (
          <div className="flex items-start gap-3 py-1">
            <div className="relative flex-shrink-0 mt-0.5">
              <Avatar size="medium" shape="square" src={row.icon || undefined} color={platInfo.avatarColor}>
                {name?.[0] || '店'}
              </Avatar>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Tag color={platInfo.color} size="small" shape="square" className="flex-shrink-0">
                  {platInfo.label}
                </Tag>
                {dualRebateStoreKeys.has(storeKey) && (
                  <Tag color="amber" size="small" shape="square" className="flex-shrink-0">
                    双返利
                  </Tag>
                )}
                <div className="truncate max-w-full font-medium text-[14px]" title={cleanEmoji(name)}>
                  {cleanEmoji(name)}
                </div>
              </div>

              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <Tag size="small" color="grey">
                  {row.distance_text && row.distance_text !== '0m' ? row.distance_text : '附近'}
                </Tag>
                <Tag size="small" color={getConditionTagColor(row.condition)}>
                  {row.condition}
                </Tag>
                {row.if_use_red_pack && (
                  <Tag color="red" size="small" shape="square">
                    可用红包
                  </Tag>
                )}
                {hasMulti && (
                  <Tag color="violet" size="small" shape="circle">
                    共 {row.promotions?.length} 档活动
                  </Tag>
                )}
              </div>

              {row.address && (
                <div className="text-[11px] text-semi-color-text-3 mt-1 truncate max-w-[280px]" title={row.address}>
                  地址: {row.address}
                </div>
              )}

              {hasMulti && (
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  <RadioGroup
                    type="button"
                    buttonSize="small"
                    value={currentPid}
                    onChange={(e) => {
                      handleSelectPromo(storeKey, String(e.target.value));
                    }}
                  >
                    {row.promotions!.map((p, idx) => {
                      const isOutOfStock = p.left_number <= 0;
                      return (
                        <Radio key={p.promotion_id} value={p.promotion_id}>
                          <span>档位{idx + 1}: {cleanEmoji(p.rebate_desc)}</span>
                          {isOutOfStock ? (
                            <span style={{ fontSize: 11, marginLeft: 4, color: 'var(--semi-color-text-3)' }}>(无票)</span>
                          ) : (
                            <span style={{ fontSize: 11, marginLeft: 4, color: 'var(--semi-color-success)' }}>(余{p.left_number})</span>
                          )}
                        </Radio>
                      );
                    })}
                  </RadioGroup>
                </div>
              )}
            </div>
          </div>
        );
      },
    },
    {
      title: '返利规则',
      dataIndex: 'order_money',
      width: 230,
      render: (_: any, row?: StoreItem) => {
        if (!row) return null;
        const currentPid = row.selected_promotion_id || row.promotion_id;
        const activePromo = (row.promotions && row.promotions.find(p => p.promotion_id === currentPid)) || row;
        const isPercent = activePromo.rebate_type === 'percent';
        const desc = activePromo.rebate_desc || `满${activePromo.order_money}返${activePromo.rebate_price}元`;
        const typeText = activePromo.rebate_type_text || (isPercent ? '比例返现' : '实付满返');
        const hasMulti = row.promotions && row.promotions.length > 1;
        const currentIdx = row.promotions ? row.promotions.findIndex(p => p.promotion_id === currentPid) : -1;

        return (
          <div className="space-y-1 py-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base text-red-500 font-bold tracking-tight font-mono">
                {cleanEmoji(desc)}
              </span>
              <Tag color={isPercent ? 'purple' : 'blue'} size="small" shape="square">
                {typeText}
              </Tag>

              {hasMulti && currentIdx >= 0 && (
                <Tag color="violet" size="small" shape="circle">
                  档位 {currentIdx + 1}/{row.promotions!.length}
                </Tag>
              )}
            </div>
            {Boolean(activePromo.days_limit) && (
              <div className="text-[11px] text-semi-color-text-3 flex items-center gap-1 pt-0.5">
                <span>限抢规则：{activePromo.days_limit}天内限抢{activePromo.days_order_limit || 1}单</span>
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: '剩余名额',
      dataIndex: 'left_number',
      width: 130,
      render: (_: any, row?: StoreItem) => {
        if (!row) return null;
        const currentPid = row.selected_promotion_id || row.promotion_id;
        const activePromo = (row.promotions && row.promotions.find(p => p.promotion_id === currentPid)) || row;
        const left = activePromo.left_number;

        return (
          <Tag color={left > 0 ? 'green' : 'grey'} size="large" shape="circle">
            {left > 0 ? `余 ${left} 名额` : '名额已满'}
          </Tag>
        );
      },
    },
    {
      title: '活动时段',
      dataIndex: 'start_time',
      width: 170,
      render: (_: any, row?: StoreItem) => {
        if (!row) return null;
        const currentPid = row.selected_promotion_id || row.promotion_id;
        const activePromo = (row.promotions && row.promotions.find(p => p.promotion_id === currentPid)) || row;
        const timeStat = getStoreTimeStatus(activePromo.start_time, activePromo.end_time);

        return (
          <div className="space-y-1">
            <div className="text-xs font-mono text-semi-color-text-1 flex items-center gap-1">
              <IconClock style={{ color: 'var(--semi-color-text-2)', fontSize: 12, flexShrink: 0 }} />
              <span>
                {activePromo.start_time === '00:00' && (activePromo.end_time === '23:59' || !activePromo.end_time)
                  ? '全天 (00:00~23:59)'
                  : `${activePromo.start_time || '全天'} ~ ${activePromo.end_time || '23:59'}`}
              </span>
            </div>
            {timeStat.status === 'before' ? (
              <Tag color="cyan" size="small" shape="square">
                未开抢 ({timeStat.diffMinutes >= 60 ? `${Math.floor(timeStat.diffMinutes / 60)}小时${timeStat.diffMinutes % 60 > 0 ? `${timeStat.diffMinutes % 60}分` : ''}后` : `${timeStat.diffMinutes}分后`})
              </Tag>
            ) : timeStat.status === 'active' ? (
              <Tag color="green" size="small" shape="square">
                进行中
              </Tag>
            ) : (
              <Tag color="grey" size="small" shape="square">
                已结束
              </Tag>
            )}
          </div>
        );
      },
    },
    {
      title: '操作',
      dataIndex: 'actions',
      width: 130,
      fixed: 'right',
      render: (_: any, row?: StoreItem) => {
        if (!row) return null;
        const currentPid = row.selected_promotion_id || row.promotion_id;
        const activePromo = (row.promotions && row.promotions.find(p => p.promotion_id === currentPid)) || row;
        const timeStat = getStoreTimeStatus(activePromo.start_time, activePromo.end_time);
        const hasQuota = activePromo.left_number > 0;
        const isGrabbing = grabbingId === activePromo.promotion_id;

        if (timeStat.status === 'before') {
          return (
            <Button
              theme="light"
              type="primary"
              size="small"
              onClick={() => handleOpenAppoint(row, activePromo, 'countdown')}
            >
              预约抢单
            </Button>
          );
        }

        if (timeStat.status === 'active') {
          if (hasQuota) {
            return (
              <Button
                theme="solid"
                type="primary"
                size="small"
                loading={isGrabbing}
                onClick={() => handleGrabNow(row, activePromo)}
              >
                立即抢单
              </Button>
            );
          } else {
            return (
              <Button
                theme="light"
                type="warning"
                size="small"
                onClick={() => handleOpenAppoint(row, activePromo, 'monitor')}
              >
                名额监听
              </Button>
            );
          }
        }

        return (
          <Button disabled size="small">已过时段</Button>
        );
      },
    },
  ], [grabbingId, handleGrabNow, handleOpenAppoint, getStoreTimeStatus, handleSelectPromo, dualRebateStoreKeys]);

  const dualColumns: ColumnProps<StoreItem>[] = useMemo(() => [
    {
      title: '美团商户',
      dataIndex: 'name',
      width: 260,
      render: (name: string, row?: StoreItem) => {
        if (!row) return name;
        return (
          <div className="flex items-start gap-3 py-1">
            <div className="relative flex-shrink-0 mt-0.5">
              <Avatar
                size="medium"
                shape="square"
                src={row.icon || undefined}
                color="orange"
                className="rounded-lg"
              >
                {name?.[0] || '美'}
              </Avatar>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Tag color="amber" size="small" shape="square" className="flex-shrink-0">
                  美团外卖
                </Tag>
                <div className="truncate max-w-[160px] font-medium text-[14px]" title={cleanEmoji(name)}>
                  {cleanEmoji(name)}
                </div>
              </div>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <Tag size="small" color={getConditionTagColor(row.condition)}>
                  {row.condition}
                </Tag>
                <Tag size="small" color="grey">
                  {row.distance_text && row.distance_text !== '0m' ? row.distance_text : '附近'}
                </Tag>
                {row.if_use_red_pack && (
                  <Tag color="red" size="small" shape="square">
                    可用红包
                  </Tag>
                )}
              </div>
              <div className="text-[11px] text-semi-color-text-2 mt-1">
                门店营业: {row.opening_hours || '00:00-23:59'}
              </div>
              {row.address && (
                <div className="text-[11px] text-semi-color-text-3 mt-0.5 truncate max-w-[240px]" title={row.address}>
                  地址: {row.address}
                </div>
              )}
            </div>
          </div>
        );
      },
    },
    {
      title: '实付满返方案 (满减返)',
      dataIndex: 'fixed_plans',
      width: 390,
      render: (_: any, row?: StoreItem) => {
        if (!row) return null;
        const storeKey = `${row.store_id || row.name}_${row.platform || 'all'}`;
        const fixedPlans: StorePromotion[] = (row.fixed_plans && row.fixed_plans.length > 0)
          ? row.fixed_plans
          : (row.fixed_plan ? [row.fixed_plan] : (row.promotions?.filter(p => p.rebate_type === 'fixed') || []));

        if (!fixedPlans || fixedPlans.length === 0) {
          return (
            <div className="text-xs text-semi-color-text-3">暂无满返活动</div>
          );
        }

        const chosenPid = row.selected_fixed_pid || fixedPlans[0]?.promotion_id;
        const activeFixed = fixedPlans.find(p => p.promotion_id === chosenPid) || fixedPlans[0];
        const pLeft = Math.max(0, activeFixed.left_number ?? 0);
        const isSoldOut = pLeft <= 0;
        const isGrabbing = grabbingId === activeFixed.promotion_id;
        const timeStat = getStoreTimeStatus(activeFixed.start_time, activeFixed.end_time);
        const isBefore = timeStat.status === 'before';
        const isActive = timeStat.status === 'active';

        return (
          <div className="space-y-1.5 py-1">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Tag color="cyan" size="small" shape="square">实付满返</Tag>
                <span className="font-bold font-mono text-cyan-600 dark:text-cyan-400 text-sm">
                  {cleanEmoji(activeFixed.rebate_desc) || `满${activeFixed.order_money}返${activeFixed.rebate_price}元`}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Tag color={isSoldOut ? 'grey' : 'cyan'} size="small" shape="circle">
                  {isSoldOut ? '已领完' : `余 ${pLeft} 份`}
                </Tag>
                {isBefore ? (
                  <Button
                    theme="light"
                    type="primary"
                    size="small"
                    onClick={() => handleOpenAppoint(row, activeFixed, 'countdown')}
                  >
                    预约
                  </Button>
                ) : isActive ? (
                  !isSoldOut ? (
                    <Button
                      theme="solid"
                      type="primary"
                      size="small"
                      loading={isGrabbing}
                      onClick={() => handleGrabNow(row, activeFixed)}
                    >
                      抢满返
                    </Button>
                  ) : (
                    <Button
                      theme="light"
                      type="tertiary"
                      size="small"
                      onClick={() => handleOpenAppoint(row, activeFixed, 'monitor')}
                    >
                      监听
                    </Button>
                  )
                ) : (
                  <Button disabled size="small">已过时</Button>
                )}
              </div>
            </div>

            {/* 对应档位抢单时段与状态信息 (遵循 Semi Design 柔和微填充规范，彻底杜绝突兀黑边框) */}
            <div
              className="flex items-center gap-1.5 text-xs flex-wrap px-2.5 py-1 mt-1.5"
              style={{
                backgroundColor: 'var(--semi-color-fill-0)',
                borderRadius: 'var(--semi-border-radius-small)',
              }}
            >
              <IconClock style={{ color: 'var(--semi-color-text-2)', fontSize: 12, flexShrink: 0 }} />
              <span className="text-semi-color-text-2">抢单时段:</span>
              <span className="font-mono font-medium text-semi-color-text-0">
                {activeFixed.start_time || '全天'} ~ {activeFixed.end_time || '23:59'}
              </span>
              {isBefore ? (
                <Tag color="cyan" size="small" shape="square">
                  未开抢 ({timeStat.diffMinutes >= 60 ? `${Math.floor(timeStat.diffMinutes / 60)}小时${timeStat.diffMinutes % 60 > 0 ? `${timeStat.diffMinutes % 60}分` : ''}后` : `${timeStat.diffMinutes}分后`})
                </Tag>
              ) : isActive ? (
                <Tag color="green" size="small" shape="square">
                  进行中
                </Tag>
              ) : (
                <Tag color="grey" size="small" shape="square">
                  已结束
                </Tag>
              )}
              {activeFixed.if_can_advance_order && (
                <Tag color="blue" size="small" shape="square">
                  支持预约
                </Tag>
              )}
              {Boolean(activeFixed.days_limit) && (
                <span className="text-[11px] text-semi-color-text-3 ml-auto">
                  {activeFixed.days_limit}天限{activeFixed.days_order_limit || 1}单
                </span>
              )}
            </div>

            {/* 多档位切换选择器 */}
            {fixedPlans.length > 1 && (
              <div className="pt-0.5 flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-semi-color-text-3 flex-shrink-0">切换档位:</span>
                <RadioGroup
                  type="button"
                  buttonSize="small"
                  value={activeFixed.promotion_id}
                  onChange={(e) => {
                    handleSelectDualFixedPromo(storeKey, String(e.target.value));
                  }}
                >
                  {fixedPlans.map((fp, fIdx) => {
                    const fLeft = Math.max(0, fp.left_number ?? 0);
                    return (
                      <Radio key={fp.promotion_id || fIdx} value={fp.promotion_id}>
                        <span className="font-medium">档位{fIdx + 1}</span>
                        {fLeft <= 0 ? (
                          <span style={{ fontSize: 10, marginLeft: 2, color: 'var(--semi-color-text-3)' }}>[无票]</span>
                        ) : (
                          <span style={{ fontSize: 10, marginLeft: 2, color: 'var(--semi-color-primary)' }}>[余{fLeft}]</span>
                        )}
                      </Radio>
                    );
                  })}
                </RadioGroup>
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: '按比例返方案 (比例返)',
      dataIndex: 'percent_plans',
      width: 390,
      render: (_: any, row?: StoreItem) => {
        if (!row) return null;
        const storeKey = `${row.store_id || row.name}_${row.platform || 'all'}`;
        const percentPlans: StorePromotion[] = (row.percent_plans && row.percent_plans.length > 0)
          ? row.percent_plans
          : (row.percent_plan ? [row.percent_plan] : (row.promotions?.filter(p => p.rebate_type === 'percent') || []));

        if (!percentPlans || percentPlans.length === 0) {
          return (
            <div className="text-xs text-semi-color-text-3">暂无比例活动</div>
          );
        }

        const chosenPid = row.selected_percent_pid || percentPlans[0]?.promotion_id;
        const activePercent = percentPlans.find(p => p.promotion_id === chosenPid) || percentPlans[0];
        const pLeft = Math.max(0, activePercent.left_number ?? 0);
        const isSoldOut = pLeft <= 0;
        const isGrabbing = grabbingId === activePercent.promotion_id;
        const timeStat = getStoreTimeStatus(activePercent.start_time, activePercent.end_time);
        const isBefore = timeStat.status === 'before';
        const isActive = timeStat.status === 'active';

        return (
          <div className="space-y-1.5 py-1">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Tag color="violet" size="small" shape="square">按比例返</Tag>
                <span className="font-bold font-mono text-purple-600 dark:text-purple-400 text-sm">
                  {cleanEmoji(activePercent.rebate_desc) || `返${activePercent.rebate_rate}% (最高¥${activePercent.rebate_price})`}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Tag color={isSoldOut ? 'grey' : 'violet'} size="small" shape="circle">
                  {isSoldOut ? '已领完' : `余 ${pLeft} 份`}
                </Tag>
                {isBefore ? (
                  <Button
                    theme="light"
                    type="warning"
                    size="small"
                    onClick={() => handleOpenAppoint(row, activePercent, 'countdown')}
                  >
                    预约
                  </Button>
                ) : isActive ? (
                  !isSoldOut ? (
                    <Button
                      theme="solid"
                      type="warning"
                      size="small"
                      loading={isGrabbing}
                      onClick={() => handleGrabNow(row, activePercent)}
                    >
                      抢比例
                    </Button>
                  ) : (
                    <Button
                      theme="light"
                      type="tertiary"
                      size="small"
                      onClick={() => handleOpenAppoint(row, activePercent, 'monitor')}
                    >
                      监听
                    </Button>
                  )
                ) : (
                  <Button disabled size="small">已结束</Button>
                )}
              </div>
            </div>

            {/* 对应档位活动时段与条件信息 (遵循 Semi Design 柔和微填充规范，彻底杜绝突兀黑边框) */}
            <div
              className="flex items-center gap-1.5 text-xs flex-wrap px-2.5 py-1 mt-1.5"
              style={{
                backgroundColor: 'var(--semi-color-fill-0)',
                borderRadius: 'var(--semi-border-radius-small)',
              }}
            >
              <IconClock style={{ color: 'var(--semi-color-text-2)', fontSize: 12, flexShrink: 0 }} />
              <span className="text-semi-color-text-2">活动时段:</span>
              <span className="font-mono font-medium text-semi-color-text-0">
                {activePercent.start_time === '00:00' && (activePercent.end_time === '23:59' || !activePercent.end_time)
                  ? '全天 (00:00 ~ 23:59)'
                  : `${activePercent.start_time || '00:00'} ~ ${activePercent.end_time || '23:59'}`}
              </span>
              {isBefore ? (
                <Tag color="cyan" size="small" shape="square">
                  未开抢 ({timeStat.diffMinutes >= 60 ? `${Math.floor(timeStat.diffMinutes / 60)}小时${timeStat.diffMinutes % 60 > 0 ? `${timeStat.diffMinutes % 60}分` : ''}后` : `${timeStat.diffMinutes}分后`})
                </Tag>
              ) : isActive ? (
                <Tag color="green" size="small" shape="square">
                  进行中
                </Tag>
              ) : (
                <Tag color="grey" size="small" shape="square">
                  已结束
                </Tag>
              )}
              <Tag color={getConditionTagColor(activePercent.condition)} size="small" shape="square">
                {activePercent.condition}
              </Tag>
              {activePercent.delivery_time_tip && (
                <span className="text-[11px] text-semi-color-text-3 ml-auto">
                  配送约{activePercent.delivery_time_tip}
                </span>
              )}
            </div>

            {/* 多档位切换选择器 */}
            {percentPlans.length > 1 && (
              <div className="pt-0.5 flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-semi-color-text-3 flex-shrink-0">切换档位:</span>
                <RadioGroup
                  type="button"
                  buttonSize="small"
                  value={activePercent.promotion_id}
                  onChange={(e) => {
                    handleSelectDualPercentPromo(storeKey, String(e.target.value));
                  }}
                >
                  {percentPlans.map((pp, pIdx) => {
                    const ppLeft = Math.max(0, pp.left_number ?? 0);
                    const condShort = getConditionShortText(pp.condition);
                    return (
                      <Radio key={pp.promotion_id || pIdx} value={pp.promotion_id}>
                        <span className="font-medium">档位{pIdx + 1}</span>
                        <span style={{ fontSize: 10, marginLeft: 3, color: 'var(--semi-color-text-2)' }}>
                          ({condShort})
                        </span>
                        {ppLeft <= 0 ? (
                          <span style={{ fontSize: 10, marginLeft: 2, color: 'var(--semi-color-text-3)' }}>[无票]</span>
                        ) : (
                          <span style={{ fontSize: 10, marginLeft: 2, color: 'var(--semi-color-warning)' }}>[余{ppLeft}]</span>
                        )}
                      </Radio>
                    );
                  })}
                </RadioGroup>
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: '双返利整合',
      dataIndex: 'dual_summary',
      width: 160,
      render: (_: any, row?: StoreItem) => {
        if (!row) return null;
        const fixedPlans = (row.fixed_plans && row.fixed_plans.length > 0)
          ? row.fixed_plans
          : (row.fixed_plan ? [row.fixed_plan] : (row.promotions?.filter(p => p.rebate_type === 'fixed') || []));
        const percentPlans = (row.percent_plans && row.percent_plans.length > 0)
          ? row.percent_plans
          : (row.percent_plan ? [row.percent_plan] : (row.promotions?.filter(p => p.rebate_type === 'percent') || []));

        const chosenFid = row.selected_fixed_pid || fixedPlans[0]?.promotion_id;
        const activeFixed = fixedPlans.find(p => p.promotion_id === chosenFid) || fixedPlans[0];
        const chosenPid = row.selected_percent_pid || percentPlans[0]?.promotion_id;
        const activePercent = percentPlans.find(p => p.promotion_id === chosenPid) || percentPlans[0];

        const hasFixedQuota = (activeFixed?.left_number ?? 0) > 0;
        const hasPercentQuota = (activePercent?.left_number ?? 0) > 0;

        return (
          <div className="space-y-1.5 py-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Tag color="amber" size="small" shape="circle">
                共 {fixedPlans.length + percentPlans.length} 档方案
              </Tag>
            </div>
            <div className="text-[11px] text-semi-color-text-2">
              {fixedPlans.length}档满返 + {percentPlans.length}档比例
            </div>
            <div className="pt-0.5">
              {hasFixedQuota && hasPercentQuota ? (
                <Tag color="green" size="small" shape="square">
                  双方案均有名额
                </Tag>
              ) : hasFixedQuota || hasPercentQuota ? (
                <Tag color="amber" size="small" shape="square">
                  仅单方案有名额
                </Tag>
              ) : (
                <Tag color="grey" size="small" shape="square">
                  两方案当前缺票
                </Tag>
              )}
            </div>
          </div>
        );
      },
    },
  ], [grabbingId, handleGrabNow, handleOpenAppoint, getStoreTimeStatus, handleSelectDualFixedPromo, handleSelectDualPercentPromo]);

  const appointColumns: ColumnProps<StoreAppointment>[] = useMemo(() => [
    {
      title: '任务ID',
      dataIndex: 'id',
      width: 80,
    },
    {
      title: '任务类型',
      dataIndex: 'task_type',
      width: 130,
      render: (t: string) => {
        const isMonitor = t === 'monitor';
        return (
          <Tag color={isMonitor ? 'orange' : 'blue'} shape="square">
            {isMonitor ? '名额监听' : '定时预约'}
          </Tag>
        );
      }
    },
    {
      title: '店铺与活动',
      dataIndex: 'store_name',
      render: (name: string, row?: StoreAppointment) => {
        const platInfo = getPlatformBadge(row?.platform);
        return (
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Tag color={platInfo.color} size="small" shape="square">
                {platInfo.label}
              </Tag>
              <div className="truncate max-w-full font-medium" title={name}>
                {name}
              </div>
            </div>
            {row?.rebate_desc && (
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-xs text-red-500 font-medium">
                  {row.rebate_desc}
                </span>
                <Tag color={row.rebate_type === 'percent' ? 'purple' : 'blue'} size="small" shape="square">
                  {row.rebate_type === 'percent' ? '比例返现' : '实付满返'}
                </Tag>
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: '策略与时间',
      dataIndex: 'start_time',
      width: 180,
      render: (_: any, row?: StoreAppointment) => {
        if (!row) return null;
        if (row.task_type === 'monitor') {
          return (
            <div className="text-xs space-y-0.5">
              <div>监听截止: <span className="font-mono font-semibold">{row.until_time || '活动结束'}</span></div>
              <div className="text-semi-color-text-2">检测频率: 每 {row.check_interval || 5} 秒</div>
            </div>
          );
        }
        return (
          <div className="text-xs space-y-0.5">
            <div>开抢时间: <span className="font-mono font-semibold">{row.start_time || '准点'}</span></div>
            <div className="text-semi-color-text-2">提前量: {row.early_ms || 500}ms</div>
          </div>
        );
      }
    },
    {
      title: '任务状态',
      dataIndex: 'status',
      width: 170,
      render: (st: string, row?: StoreAppointment) => {
        let tagColor = 'blue';
        let text = '就绪中';
        if (st === 'scheduled') { tagColor = 'blue'; text = '等待开抢'; }
        else if (st === 'primed') { tagColor = 'cyan'; text = '准备就绪'; }
        else if (st === 'monitoring') { tagColor = 'orange'; text = '正在监听'; }
        else if (st === 'success') { tagColor = 'green'; text = '抢单成功'; }
        else if (st === 'failed') { tagColor = 'red'; text = '未抢到'; }
        else if (st === 'expired') { tagColor = 'grey'; text = '监听结束'; }
        else if (st === 'cancelled') { tagColor = 'grey'; text = '已停止'; }

        return (
          <div className="space-y-1">
            <Tag color={tagColor as any}>{text}</Tag>
            {row?.outcome && (
              <Tooltip content={row.outcome}>
                <div className="text-xs text-semi-color-text-2 truncate max-w-[150px]">
                  {row.outcome}
                </div>
              </Tooltip>
            )}
          </div>
        );
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 150,
    },
    {
      title: '操作',
      dataIndex: 'actions',
      width: 110,
      fixed: 'right',
      render: (_: any, row?: StoreAppointment) => {
        if (!row) return null;
        const isActive = ['monitoring', 'scheduled', 'primed', 'pending'].includes(row.status);
        if (isActive) {
          if (row.status === 'monitoring') {
            return (
              <Button
                theme="light"
                type="warning"
                size="small"
                onClick={() => handleStopAppoint(row.id)}
              >
                停止
              </Button>
            );
          }
          return (
            <Popconfirm title="确定取消此预约？" onConfirm={() => handleCancelAppoint(row.id)}>
              <Button theme="light" type="danger" size="small">
                取消
              </Button>
            </Popconfirm>
          );
        }
        return (
          <Popconfirm title="确定删除此记录？" onConfirm={() => handleCancelAppoint(row.id)}>
            <Button theme="borderless" type="tertiary" size="small">
              删除
            </Button>
          </Popconfirm>
        );
      },
    },
  ], [handleStopAppoint, handleCancelAppoint]);



  if (accounts.length === 0) {
    return (
      <div className="w-full">
        <div className="mb-4">
          <Title heading={3}>霸王餐抢单与预约</Title>
          <Text type="secondary">查看附近外卖返利活动，支持即时抢单、定时预约与名额监听</Text>
        </div>
        <Card className="rounded-xl border border-semi-color-border py-16 flex flex-col items-center justify-center text-center">
          <Empty
            title="未检测到有效账号"
            description="请先绑定或选择一个小蚕账号以获取附近商户返利信息。"
          >
            <Button
              theme="solid"
              type="primary"
              onClick={() => setActiveTab('accounts')}
              className="mt-4"
            >
              前往账号中心
            </Button>
          </Empty>
        </Card>
      </div>
    );
  }

  return (
    <div ref={mainContainerRef} className="w-full flex flex-col h-full min-h-0 space-y-3">
      {/* 注入表格专用 GPU 加速、绝对固定高度与分页对齐规范样式 */}
      <style>{`
        .store-table-container .semi-table-body,
        .appointment-table-container .semi-table-body,
        .dual-table-container .semi-table-body {
          height: var(--table-scroll-y) !important;
          min-height: var(--table-scroll-y) !important;
          max-height: var(--table-scroll-y) !important;
          overflow-y: auto !important;
          contain: content;
          will-change: transform;
          transform: translateZ(0);
          -webkit-overflow-scrolling: touch;
        }
        .store-table-footer {
          flex-shrink: 0 !important;
          margin-top: auto !important;
        }
        /* 列表最后一行增加底部安全边距，防止在最底部时内容与底栏或横向滚动条产生视觉遮挡 */
        .store-table-container .semi-table-body table tr:last-child td,
        .dual-table-container .semi-table-body table tr:last-child td,
        .appointment-table-container .semi-table-body table tr:last-child td {
          padding-bottom: 16px !important;
        }
        .store-table-container .semi-table-placeholder,
        .appointment-table-container .semi-table-placeholder,
        .dual-table-container .semi-table-placeholder {
          min-height: var(--table-scroll-y) !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        .appointment-table-container .semi-table-pagination-outer {
          padding: 12px 16px !important;
          margin: 0 !important;
          border-top: 1px solid var(--semi-color-border) !important;
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          background-color: var(--semi-color-bg-0) !important;
        }
        .appointment-table-container .semi-table-pagination-info {
          margin-left: 4px !important;
          color: var(--semi-color-text-2) !important;
          font-size: 13px !important;
        }
      `}</style>

      {/* 顶部区域：页面标题与当前账号及资产概览信息栏 */}
      <div className="flex-shrink-0 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 pb-1">
        <div>
          <Title heading={3}>霸王餐抢单与预约</Title>
          <Text type="secondary" size="small">查看附近外卖返利活动，支持即时抢单、定时预约与名额监听</Text>
        </div>

        {/* 顶部卡券与红包资产栏 (合为一个Card，直观展示饭票、超前抢单券、红包数量，点击查看明细) */}
        <div className="flex items-center gap-2 flex-wrap select-none">
          {/* 合并资产卡片 */}
          <Tooltip content="点击查看饭票、超前抢单券与外卖红包明细">
            <div
              className="group h-8 box-border flex items-center px-2.5 rounded-[var(--semi-border-radius-medium)] border border-semi-color-border bg-semi-color-fill-0 hover:bg-semi-color-fill-1 hover:border-semi-color-primary transition-all cursor-pointer shadow-2xs leading-none gap-2.5"
              onClick={() => handleOpenAssetModal('cards')}
            >
              {/* 饭票 */}
              <div
                className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenAssetModal('cards');
                }}
              >
                {assetStats.mealTicketPic ? (
                  <img
                    src={assetStats.mealTicketPic}
                    alt="饭票"
                    className="w-5 h-5 object-contain shrink-0"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-sm bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                    <IconTicketCode size="small" />
                  </div>
                )}
                <span className="text-xs text-semi-color-text-2">饭票</span>
                {assetStats.loading ? (
                  <Spin size="small" style={{ width: 12, height: 12 }} />
                ) : (
                  <Text strong className="text-xs text-amber-600">
                    {assetStats.mealTicketCount} 张
                  </Text>
                )}
              </div>

              {/* 分隔竖线 */}
              <div className="w-[1px] h-3 bg-semi-color-border shrink-0" />

              {/* 超前抢单券 */}
              <div
                className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenAssetModal('cards');
                }}
              >
                {assetStats.advanceCouponPic ? (
                  <img
                    src={assetStats.advanceCouponPic}
                    alt="超前抢单券"
                    className="w-5 h-5 object-contain shrink-0"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-sm bg-blue-50 text-semi-color-primary flex items-center justify-center shrink-0">
                    <IconFastForward size="small" />
                  </div>
                )}
                <span className="text-xs text-semi-color-text-2">超前抢单券</span>
                {assetStats.loading ? (
                  <Spin size="small" style={{ width: 12, height: 12 }} />
                ) : (
                  <Text strong className="text-xs" style={{ color: 'var(--semi-color-primary)' }}>
                    {assetStats.advanceCouponCount} 张
                  </Text>
                )}
              </div>

              {/* 分隔竖线 */}
              <div className="w-[1px] h-3 bg-semi-color-border shrink-0" />

              {/* 红包 */}
              <div
                className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenAssetModal('redpacks');
                }}
              >
                <div className="w-5 h-5 rounded-sm bg-rose-50 text-rose-500 flex items-center justify-center shrink-0">
                  <IconGift size="small" />
                </div>
                <span className="text-xs text-semi-color-text-2">红包</span>
                {assetStats.loading ? (
                  <Spin size="small" style={{ width: 12, height: 12 }} />
                ) : (
                  <Text strong className="text-xs text-rose-500">
                    {assetStats.redpackCount} 个
                  </Text>
                )}
              </div>

              {/* 展开/详情指示图标，使用 > (IconChevronRight) */}
              <IconChevronRight
                size="small"
                className="text-semi-color-text-3 group-hover:text-semi-color-primary group-hover:translate-x-0.5 transition-all text-xs shrink-0"
              />
            </div>
          </Tooltip>

          {/* 刷新按钮 */}
          <Button
            theme="light"
            type="tertiary"
            icon={<IconRefresh spin={loading || assetStats.loading} />}
            loading={loading || assetStats.loading}
            onClick={() => {
              fetchStores(undefined, true);
              fetchAppointments(true);
              fetchAccountAssets(undefined, true);
            }}
          >
            刷新
          </Button>
        </div>
      </div>

      {/* 主体卡片容器：撑满视口垂直空间，消除底部空白 */}
      <Card
        className="flex-1 min-h-0 flex flex-col rounded-xl border border-semi-color-border shadow-sm overflow-hidden"
        bodyStyle={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: 0 }}
      >
        {/* 顶部导航与筛选控制区 */}
        <div className="flex-shrink-0 p-4 bg-semi-color-bg-0 border-b border-semi-color-border">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* 标签页切换 */}
            <Tabs
              type="button"
              activeKey={activeTabKey}
              onChange={(k) => {
                const tabKey = String(k);
                setActiveTabKey(tabKey);
                if (tabKey === 'dual_rebate' && !dualScanDone && !dualScanLoading) {
                  handleTriggerDualScan();
                }
              }}
            >
              <TabPane tab={`附近店铺 (${regularStores.length})`} itemKey="stores" />
              <TabPane tab={`大牌券专享 (${brandCouponStores.length})`} itemKey="brand_coupon" />
              <TabPane
                tab={
                  <div className="flex items-center gap-1.5">
                    <span>美团同店双返利</span>
                    {dualScanDone && (
                      <Tag color="amber" size="small" shape="circle">{dualStores.length}</Tag>
                    )}
                  </div>
                }
                itemKey="dual_rebate"
              />
              <TabPane tab={`预约与监听 (${appointments.length})`} itemKey="appointments" />
            </Tabs>

            {/* 店铺主 Tab / 大牌券 Tab 搜索框 */}
            {(activeTabKey === 'stores' || activeTabKey === 'brand_coupon') && (
              <StoreSearchBar
                loading={loading}
                value={searchKeyword}
                onSearch={handleSearch}
                onClear={handleClearSearch}
              />
            )}

            {/* 同店双返利专属搜索与最多商家配置项 */}
            {activeTabKey === 'dual_rebate' && (
              <div className="flex items-center gap-3 w-full sm:w-auto flex-shrink-0 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <Text type="secondary" className="text-sm font-medium whitespace-nowrap">商家范围:</Text>
                  <Select
                    size="default"
                    value={dualMaxStores}
                    onChange={(v) => setDualMaxStores(Number(v))}
                    style={{ width: 105 }}
                  >
                    <Select.Option value={100}>100 家</Select.Option>
                    <Select.Option value={300}>300 家</Select.Option>
                    <Select.Option value={500}>500 家</Select.Option>
                    <Select.Option value={600}>600 家</Select.Option>
                    <Select.Option value={700}>700 家</Select.Option>
                    <Select.Option value={800}>800 家</Select.Option>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    size="default"
                    prefix={<IconSearch />}
                    placeholder="搜索双返利店铺..."
                    value={dualSearchKeyword}
                    onChange={(val) => setDualSearchKeyword(val)}
                    onEnterPress={() => handleTriggerDualScan()}
                    showClear
                    onClear={() => setDualSearchKeyword('')}
                    style={{ width: 190 }}
                  />
                  <Button
                    size="default"
                    theme="solid"
                    type="primary"
                    icon={<IconSearch />}
                    loading={dualScanLoading}
                    onClick={() => handleTriggerDualScan()}
                  >
                    扫描
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* 店铺筛选工具条（优化尺寸为 default，字号和点击热区更舒展大气） */}
          {(activeTabKey === 'stores' || activeTabKey === 'brand_coupon') && (
            <div className="pt-4 mt-3 border-t border-semi-color-border-subtle flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2.5">
                  <Text type="secondary" className="text-sm font-medium">外卖平台:</Text>
                  <RadioGroup
                    type="button"
                    buttonSize="middle"
                    value={platformFilter}
                    onChange={(e) => setPlatformFilter(e.target.value)}
                  >
                    <Radio value="all">全部</Radio>
                    <Radio value="meituan">美团</Radio>
                    <Radio value="eleme">饿了么</Radio>
                    <Radio value="jingdong">京东</Radio>
                  </RadioGroup>
                </div>

                <div className="flex items-center gap-2.5">
                  <Text type="secondary" className="text-sm font-medium">返利模式:</Text>
                  <RadioGroup
                    type="button"
                    buttonSize="middle"
                    value={rebateTypeFilter}
                    onChange={(e) => setRebateTypeFilter(e.target.value)}
                  >
                    <Radio value="all">全部</Radio>
                    <Radio value="fixed">实付满返</Radio>
                    <Radio value="percent">按比例返</Radio>
                  </RadioGroup>
                </div>

                <div className="flex items-center gap-2.5">
                  <Text type="secondary" className="text-sm font-medium">评价要求:</Text>
                  <RadioGroup
                    type="button"
                    buttonSize="middle"
                    value={conditionFilter}
                    onChange={(e) => setConditionFilter(e.target.value)}
                  >
                    <Radio value="all">全部</Radio>
                    <Radio value="no_review">无需评价</Radio>
                    <Radio value="good_review">需要图文好评</Radio>
                  </RadioGroup>
                </div>

                <div className="flex items-center gap-2.5">
                  <Text type="secondary" className="text-sm font-medium">排序方式:</Text>
                  <Select
                    size="default"
                    value={sortBy}
                    onChange={(v) => setSortBy(v as any)}
                    style={{ width: 160 }}
                  >
                    <Select.Option value="default">综合推荐 (默认)</Select.Option>
                    <Select.Option value="distance">距离最近 (由近及远)</Select.Option>
                    <Select.Option value="rebate">返利金额最高</Select.Option>
                    <Select.Option value="rate">返利比例最高</Select.Option>
                    <Select.Option value="left">剩余名额最多</Select.Option>
                  </Select>
                </div>

                {/* 商家范围自动加载下拉框：默认为空，选中后自动连续加载至指定数量 */}
                <div className="flex items-center gap-2.5">
                  <Text type="secondary" className="text-sm font-medium">获取范围:</Text>
                  <Select
                    size="default"
                    value={batchTarget}
                    placeholder="手动滚动"
                    onChange={(v) => handleSelectBatchTarget(v ? Number(v) : undefined)}
                    showClear
                    onClear={() => handleSelectBatchTarget(undefined)}
                    style={{ width: 110 }}
                  >
                    <Select.Option value={100}>100 家</Select.Option>
                    <Select.Option value={300}>300 家</Select.Option>
                    <Select.Option value={500}>500 家</Select.Option>
                    <Select.Option value={600}>600 家</Select.Option>
                    <Select.Option value={700}>700 家</Select.Option>
                    <Select.Option value={800}>800 家</Select.Option>
                  </Select>
                  {batchLoading && (
                    <div className="flex items-center gap-1.5 text-xs text-semi-color-primary font-medium bg-semi-color-primary-light-default px-2 py-1 rounded">
                      <Spin size="small" />
                      <span>{batchProgress?.current || stores.length}/{batchTarget}</span>
                      <Button
                        theme="borderless"
                        type="danger"
                        size="small"
                        onClick={handleStopBatch}
                        className="!p-0 !h-auto text-xs ml-0.5"
                      >
                        停止
                      </Button>
                    </div>
                  )}
                </div>

                {/* 美团同店双返利筛选开关 */}
                <div className="flex items-center gap-2 pl-1 border-l border-semi-color-border-subtle">
                  <Switch
                    size="small"
                    checked={onlyDualRebate}
                    onChange={(checked) => setOnlyDualRebate(checked)}
                  />
                  <Text
                    className="text-sm font-medium cursor-pointer select-none"
                    onClick={() => setOnlyDualRebate(!onlyDualRebate)}
                  >
                    只看美团双返利
                  </Text>
                  {onlyDualRebate && (
                    <Tag color="amber" size="small" shape="square">
                      命中 {regularStores.length} 家
                    </Tag>
                  )}
                </div>
              </div>

              {/* 搜索结果提示 */}
              {activeSearchKeyword && (
                <div className="flex items-center gap-2 text-xs bg-semi-color-fill-0 px-3 py-1.5 rounded-md border border-semi-color-border">
                  <Tag color="cyan" size="small">搜索中</Tag>
                  <span className="text-semi-color-text-2">
                    关键词「{activeSearchKeyword}」匹配到 {stores.length} 家商户
                  </span>
                  <Button
                    theme="borderless"
                    type="tertiary"
                    size="small"
                    onClick={handleClearSearch}
                  >
                    清空
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 表格内容区域 (带 GSAP 渐入动画容器，常驻 DOM 消除切 Tab 时的 DOM 销毁与重建开销) */}
        <div className="tab-content-anim flex-1 min-h-0 flex flex-col relative overflow-hidden will-change-[opacity]">
          {/* 附近店铺分栏 */}
          <div
            ref={tableContainerRef}
            className="store-table-container relative flex-1 min-h-0 flex flex-col overflow-hidden"
            style={{
              display: activeTabKey === 'stores' ? 'flex' : 'none',
              ['--table-scroll-y' as any]: `${tabScrollHeights.stores || 480}px`
            }}
          >
            <Table
              rowKey={(row) => `${row?.store_id || row?.name}_${row?.platform || 'all'}`}
              columns={storeColumns}
              dataSource={regularStores}
              loading={loading}
              pagination={false}
              scroll={{ y: tabScrollHeights.stores || 480, x: '100%' }}
              empty={
                loading ? (
                  <div className="py-24" />
                ) : (
                  <div className="py-16 text-center text-semi-color-text-3">
                    {onlyDualRebate ? (
                      <div>
                        <div className="mb-2 text-base font-medium text-semi-color-text-1">
                          当前已加载的 {stores.length} 家附近商户中暂未发现同时支持双返利的店铺
                        </div>
                        <div className="text-xs mb-4">
                          您可以选择上方「获取范围」下拉框自动批量加载更多商户进行扫描筛选
                        </div>
                        <Space spacing={8}>
                          <Button theme="light" type="primary" size="small" onClick={() => handleSelectBatchTarget(300)}>
                            自动加载 300 家
                          </Button>
                          <Button theme="light" type="primary" size="small" onClick={() => handleSelectBatchTarget(500)}>
                            自动加载 500 家
                          </Button>
                          <Button theme="borderless" size="small" onClick={() => setOnlyDualRebate(false)}>
                            关闭双返利筛选
                          </Button>
                        </Space>
                      </div>
                    ) : activeSearchKeyword ? (
                      <div>
                        <div className="mb-2 text-base font-medium text-semi-color-text-1">
                          未找到与「{activeSearchKeyword}」相关的附近店铺
                        </div>
                        <div className="text-xs mb-4">您可以尝试更换搜索词，或查看「大牌券专享」分栏</div>
                        <Button theme="light" type="primary" size="small" onClick={handleClearSearch}>
                          清空搜索词
                        </Button>
                      </div>
                    ) : (
                      <div>暂无符合条件的附近店铺，您可以尝试更换定位坐标或调整筛选条件</div>
                    )}
                  </div>
                )
              }
            />

            {/* 触底加载状态栏 */}
            {regularStores.length > 0 && (
              <div className="store-table-footer flex-shrink-0 mt-auto border-t border-semi-color-border bg-semi-color-fill-0 py-2.5 px-4 flex items-center justify-center">
                {loadingMore ? (
                  <div className="flex items-center gap-2 text-semi-color-primary text-xs font-medium">
                    <Spin size="small" />
                    <span>正在获取更多商户数据...</span>
                  </div>
                ) : loadMoreError ? (
                  <div
                    className="text-xs text-semi-color-danger cursor-pointer hover:underline flex items-center gap-1.5"
                    onClick={() => loadMoreStores()}
                  >
                    <IconAlertCircle size="small" />
                    <span>网络连接稍慢，点击重新加载</span>
                  </div>
                ) : hasMore ? (
                  <div
                    className="text-xs text-semi-color-text-2 cursor-pointer hover:text-semi-color-primary transition-colors flex items-center gap-2"
                    onClick={() => loadMoreStores()}
                  >
                    <Tag color="blue" size="small">触底加载</Tag>
                    <span>已展示 {regularStores.length} 家附近店铺 · 向下滚动或点击加载更多</span>
                  </div>
                ) : (
                  <div className="text-xs text-semi-color-text-3 flex items-center gap-2">
                    <Tag color="grey" size="small">已到底部</Tag>
                    <span>已呈现全部 {regularStores.length} 家附近店铺</span>
                  </div>
                )}
              </div>
            )}

            {/* 回到顶部按钮 */}
            {showBackTop && (
              <Button
                theme="solid"
                type="primary"
                icon={<IconArrowUp />}
                onClick={scrollToTop}
                className="absolute right-6 bottom-14 shadow-lg z-20 rounded-full !w-10 !h-10 !p-0 flex items-center justify-center"
                title="回到顶部"
              />
            )}
          </div>

          {/* 大牌券专享分栏（周边门店通用专享） */}
          <div
            ref={brandContainerRef}
            className="store-table-container relative flex-1 min-h-0 flex flex-col overflow-hidden"
            style={{
              display: activeTabKey === 'brand_coupon' ? 'flex' : 'none',
              ['--table-scroll-y' as any]: `${tabScrollHeights.brand_coupon || 480}px`
            }}
          >
            <Table
              rowKey={(row) => `${row?.store_id || row?.name}_${row?.platform || 'all'}`}
              columns={storeColumns}
              dataSource={brandCouponStores}
              loading={loading}
              pagination={false}
              scroll={{ y: tabScrollHeights.brand_coupon || 480, x: '100%' }}
              empty={
                loading ? (
                  <div className="py-24" />
                ) : (
                  <div className="py-16 text-center text-semi-color-text-3">
                    <div>暂未检测到周边门店通用的商户，您可以在「附近店铺」中查看所有常规返利门店</div>
                  </div>
                )
              }
            />

            {brandCouponStores.length > 0 && (
              <div className="store-table-footer flex-shrink-0 mt-auto border-t border-semi-color-border bg-semi-color-fill-0 py-2.5 px-4 flex items-center justify-center">
                <div className="text-xs text-semi-color-text-3 flex items-center gap-2">
                  <Tag color="grey" size="small">已到底部</Tag>
                  <span>已呈现全部 {brandCouponStores.length} 家周边门店通用商户</span>
                </div>
              </div>
            )}
          </div>

          {/* 美团同店双返利分栏（采用 Semi Design 标准企业级表格，严格约束内部滚动，彻底杜绝外层页面滚动条） */}
          <div
            ref={dualContainerRef}
            className="dual-table-container relative flex-1 min-h-0 flex flex-col overflow-hidden"
            style={{
              display: activeTabKey === 'dual_rebate' ? 'flex' : 'none',
              ['--table-scroll-y' as any]: `${tabScrollHeights.dual_rebate || 440}px`
            }}
          >
            {dualScanLoading ? (
              <div className="flex-1 w-full h-full flex flex-col items-center justify-center p-16 m-auto">
                <Spin size="large" />
                <div className="text-base font-medium text-semi-color-text-0 mt-4">
                  正在加载附近店铺并筛选...
                </div>
              </div>
            ) : !dualScanDone ? (
              <div className="p-16 text-center">
                <Empty
                  title="美团外卖同店双返利智能检索"
                  description="模拟下拉触底流式获取附近店铺，累计商户达到设定范围即停止加载，并严格按照规则筛选同店同时支持「实付满返」与「按比例返」的美团店铺。"
                >
                  <div className="flex items-center justify-center gap-2 mt-4 mb-2">
                    <Text type="secondary" className="text-sm">商家获取范围:</Text>
                    <Select
                      value={dualMaxStores}
                      onChange={(v) => setDualMaxStores(Number(v))}
                      style={{ width: 110 }}
                      size="default"
                    >
                      <Select.Option value={100}>100 家</Select.Option>
                      <Select.Option value={300}>300 家</Select.Option>
                      <Select.Option value={500}>500 家</Select.Option>
                      <Select.Option value={600}>600 家</Select.Option>
                      <Select.Option value={700}>700 家</Select.Option>
                      <Select.Option value={800}>800 家</Select.Option>
                    </Select>
                  </div>
                  <Button
                    theme="solid"
                    type="primary"
                    size="large"
                    icon={<IconSearch />}
                    onClick={() => handleTriggerDualScan()}
                    className="mt-3"
                  >
                    开始扫描美团双返利商户
                  </Button>
                </Empty>
              </div>
            ) : (
              <>
                <div className="store-table-subheader flex-shrink-0 px-4 py-2.5 border-b border-semi-color-border bg-semi-color-fill-0 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs">
                    <Tag color="amber" size="small">美团外卖专享</Tag>
                    <span className="text-semi-color-text-1">
                      共检索 {dualTotalStores} 家商户（{dualTotalPromos} 个活动），筛选出 {dualStores.length} 家双返利店铺
                      {dualStores.length !== displayedDualStores.length && `（搜索匹配 ${displayedDualStores.length} 家）`}
                      {dualMaxStores > 0 && ` · 设定范围 ${dualMaxStores} 家`}
                    </span>
                  </div>
                  <Button
                    theme="light"
                    type="tertiary"
                    size="small"
                    icon={<IconRefresh />}
                    loading={dualScanLoading}
                    onClick={() => handleTriggerDualScan()}
                  >
                    重新扫描
                  </Button>
                </div>

                <Table
                  rowKey={(row) => `${row?.store_id || row?.name}_${row?.platform || 'meituan'}`}
                  columns={dualColumns}
                  dataSource={displayedDualStores}
                  loading={dualScanLoading}
                  pagination={false}
                  scroll={{ y: tabScrollHeights.dual_rebate || 440, x: '100%' }}
                  empty={
                    dualScanLoading ? (
                      <div className="py-24" />
                    ) : (
                      <div className="py-16 text-center text-semi-color-text-3">
                        <div>
                          {(dualSearchKeyword || '').trim()
                            ? `未发现包含「${dualSearchKeyword}」的美团同店双返利店铺`
                            : `在检索的 ${dualTotalStores} 家美团商户中未发现同时开放双返利规则的店铺`}
                        </div>
                        <div className="text-xs mt-2">您可以尝试清除搜索词或切换商圈定位后再次扫描</div>
                      </div>
                    )
                  }
                />

                {displayedDualStores.length > 0 && (
                  <div className="store-table-footer flex-shrink-0 mt-auto border-t border-semi-color-border bg-semi-color-fill-0 py-2.5 px-4 flex items-center justify-between">
                    <div className="text-xs text-semi-color-text-3 flex items-center gap-2">
                      <Tag color="grey" size="small">已到底部</Tag>
                      <span>已呈现全部 {displayedDualStores.length} 家美团同店双返利商户</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div
            ref={appointContainerRef}
            className="appointment-table-container flex-1 min-h-0 flex flex-col relative"
            style={{
              display: activeTabKey === 'appointments' ? 'flex' : 'none',
              ['--table-scroll-y' as any]: `${tabScrollHeights.appointments || 480}px`
            }}
          >
            <Table
              rowKey={(row) => String(row?.id)}
              columns={appointColumns}
              dataSource={appointments}
              pagination={{
                pageSize: 10,
                showTotal: true,
              }}
              scroll={{ y: tabScrollHeights.appointments || 480, x: '100%' }}
              empty={<div className="py-16 text-center text-semi-color-text-3">暂无预约或监听中的任务</div>}
            />
          </div>
        </div>
      </Card>



      {/* 预约与监听配置弹窗 */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            {appointModalMode === 'countdown' ? (
              <Tag color="blue" prefixIcon={<IconClock />}>定时预约</Tag>
            ) : (
              <Tag color="amber" prefixIcon={<IconSearch />}>名额监听</Tag>
            )}
            <span>{appointModalMode === 'countdown' ? '预约抢单配置' : '名额监听配置'}</span>
          </div>
        }
        visible={appointModalVisible}
        onCancel={() => setAppointModalVisible(false)}
        footer={null}
        width={500}
        centered
        bodyStyle={{
          maxHeight: 'calc(80vh - 80px)',
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '16px 20px',
        }}
      >
        <div className="mb-3">
          <RadioGroup
            type="button"
            value={appointModalMode}
            onChange={(e) => setAppointModalMode(e.target.value)}
            className="w-full flex"
          >
            <Radio value="countdown" style={{ flex: 1, textAlign: 'center' }}>
              <div className="flex items-center justify-center gap-1.5 py-0.5">
                <IconClock />
                <span>定时预约 (到点抢单)</span>
              </div>
            </Radio>
            <Radio value="monitor" style={{ flex: 1, textAlign: 'center' }}>
              <div className="flex items-center justify-center gap-1.5 py-0.5">
                <IconSearch />
                <span>名额监听 (无名额轮询)</span>
              </div>
            </Radio>
          </RadioGroup>
        </div>

        {appointModalMode === 'countdown' ? (
          <Banner
            type="info"
            description="开抢前 1 分钟自动进入抢单准备，到点发送抢单请求；若首轮已抢光，可配置自动转入名额监听。"
            className="mb-3.5 rounded-lg"
          />
        ) : (
          <Banner
            type="warning"
            description="当前名额已抢空，系统将按设定频率自动轮询检测补仓名额，发现有名额时自动尝试锁定。"
            className="mb-3.5 rounded-lg"
          />
        )}

        <div className="p-3 bg-semi-color-fill-0 rounded-lg mb-4 border border-semi-color-border flex flex-col gap-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-semi-color-text-2">商户店铺：</span>
            <span className="font-semibold text-semi-color-text-0">{selectedStore?.name} ({getPlatformBadge(selectedStore?.platform).label})</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-semi-color-text-2">活动档位：</span>
            <div className="flex items-center gap-1.5">
              <Tag color={selectedPromo?.rebate_type === 'percent' ? 'purple' : 'blue'} size="small" shape="square">
                {selectedPromo?.rebate_type === 'percent' ? '比例返现' : '实付满返'}
              </Tag>
              <span className="font-bold text-semi-color-danger">
                {selectedPromo?.rebate_desc || `满${selectedPromo?.order_money}返${selectedPromo?.rebate_price}元`}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-semi-color-text-2">活动时段：</span>
            <span className="font-mono text-semi-color-text-1">
              {selectedPromo?.start_time || '全天'} ~ {selectedPromo?.end_time || '23:59'}
            </span>
          </div>
          {selectedPromo?.need_brand_coupon && (
            <div className="flex items-center justify-between pt-1 border-t border-semi-color-border-subtle">
              <span className="text-semi-color-text-2">门槛要求：</span>
              <span className="text-semi-color-text-2 font-medium">
                自动匹配优惠券
              </span>
            </div>
          )}
        </div>

        <Form
          key={`${appointModalMode}_${selectedPromo?.promotion_id || '0'}`}
          onSubmit={handleSubmitAppoint}
        >
          {appointModalMode === 'countdown' ? (
            <>
              <Form.InputNumber
                field="early_ms"
                label="提前抢单时间 (ms)"
                initValue={500}
                min={0}
                max={5000}
                step={50}
                helpText="提前发送请求以抵消网络延迟，默认 500ms"
              />

              <Form.Input
                field="until_time"
                label="自动监听截止时间 (HH:MM)"
                initValue={selectedPromo?.end_time || '15:00'}
                placeholder="例如 14:00 或 15:30"
                helpText="若到点名额已满，将持续监听名额至此时间"
              />

              <Form.InputNumber
                field="check_interval"
                label="监听轮询间隔 (秒)"
                initValue={5}
                min={3}
                max={60}
                helpText="检测补仓名额的轮询频率，建议 3~5 秒"
              />
            </>
          ) : (
            <>
              <Form.Input
                field="until_time"
                label="监听截止时间 (HH:MM)"
                initValue={selectedPromo?.end_time || '15:00'}
                placeholder="例如 14:00 或 15:30"
                helpText="到达此时间后将自动停止监听"
              />

              <Form.InputNumber
                field="check_interval"
                label="轮询刷新频率 (秒)"
                initValue={5}
                min={3}
                max={60}
                helpText="检测商户补仓名额的刷新频率，建议 3~5 秒"
              />
            </>
          )}

          <Form.Select
            field="redpack_mode"
            label="红包使用策略"
            initValue={0}
            helpText="抢单时根据账户红包余额自动选择"
          >
            <Select.Option value={0}>优先使用大额红包</Select.Option>
            <Select.Option value={1}>优先使用临期红包</Select.Option>
            <Select.Option value={2}>不使用红包</Select.Option>
          </Form.Select>

          <Button
            theme="solid"
            type={appointModalMode === 'countdown' ? 'primary' : 'warning'}
            htmlType="submit"
            block
            size="large"
            className="mt-4"
          >
            {appointModalMode === 'countdown' ? '确认添加预约抢单' : '启动名额监听'}
          </Button>
        </Form>
      </Modal>

      {/* 卡券与外卖红包资产明细弹窗 */}
      <Modal
        title={
          <div className="flex items-center justify-between w-full pr-8">
            <div className="flex items-center gap-2">
              <IconTicketCode style={{ color: 'var(--semi-color-primary)' }} />
              <span className="font-semibold text-base">卡券与红包资产明细</span>
              {currentAccount?.nickname && (
                <Tag color="blue" size="small" type="light">
                  {cleanEmoji(currentAccount.nickname)}
                </Tag>
              )}
            </div>
            <Button
              theme="light"
              size="small"
              icon={<IconRefresh spin={assetStats.loading} />}
              loading={assetStats.loading}
              onClick={() => fetchAccountAssets()}
            >
              刷新明细
            </Button>
          </div>
        }
        visible={assetModalVisible}
        onCancel={() => setAssetModalVisible(false)}
        footer={null}
        width={620}
        bodyStyle={{ maxHeight: '68vh', overflowY: 'auto', padding: '12px 20px' }}
      >
        <Tabs
          type="line"
          activeKey={assetModalTab}
          onChange={(k) => setAssetModalTab(k as 'cards' | 'redpacks')}
        >
          {/* Tab 1: 特权卡券 */}
          <TabPane
            tab={
              <span className="flex items-center gap-1.5">
                <IconTicketCode />
                <span>特权卡券</span>
                {assetStats.canUseCards > 0 ? (
                  <Badge count={assetStats.canUseCards} overflowCount={99} type="warning" />
                ) : null}
              </span>
            }
            itemKey="cards"
          >
            <div className="py-2 flex flex-col gap-2.5">
              <div className="flex justify-between items-center">
                <RadioGroup
                  type="button"
                  value={cardFilterStatus}
                  onChange={(e) => handleChangeCardStatus(Number(e.target.value))}
                >
                  <Radio value={0}>未使用 ({assetDetail?.card_stats?.can_use_number || (cardFilterStatus === 0 ? (assetDetail?.cards?.length || 0) : 0)})</Radio>
                  <Radio value={1}>已使用</Radio>
                  <Radio value={2}>已过期</Radio>
                </RadioGroup>

                {Boolean(assetStats.expiringSoonCards) && cardFilterStatus === 0 && (
                  <Tag size="small" color="red">
                    {assetStats.expiringSoonCards} 张今日到期
                  </Tag>
                )}
              </div>

              {cardFilterStatus === 0 && Boolean(assetStats.expiringSoonCards) && (
                <Banner
                  type="warning"
                  description={`账户有 ${assetStats.expiringSoonCards} 张特权卡券即将在今日到期，抢单预约时请优先勾选使用！`}
                />
              )}

              {assetStats.loading || cardsLoading ? (
                <div className="py-14 flex flex-col items-center justify-center">
                  <Space vertical align="center" spacing="medium">
                    <Spin size="large" />
                    <Text type="secondary" className="text-xs text-semi-color-text-2">
                      正在同步特权卡券数据...
                    </Text>
                  </Space>
                </div>
              ) : stackedCards.length === 0 ? (
                <div className="py-10 text-center">
                  <Empty
                    title="暂无对应状态的卡券"
                    description="特权卡券可用于返利加成或霸王餐免评资格"
                  />
                </div>
              ) : (
                stackedCards.map(({ item, count }) => {
                  const card = item.card || { name: '特权卡券', desc: '' };
                  return (
                    <div
                      key={`${item.id}_${count}`}
                      className="border border-semi-color-border rounded-lg p-3 bg-semi-color-bg-0 hover:border-semi-color-primary-light-active transition-all shadow-xs flex items-center gap-3"
                    >
                      <div className="relative shrink-0">
                        {card.pic ? (
                          <img
                            src={card.pic}
                            alt={card.name}
                            className="w-11 h-11 object-contain rounded-md border border-semi-color-border p-0.5 bg-semi-color-fill-0 shrink-0"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-md bg-semi-color-fill-1 flex items-center justify-center text-semi-color-primary shrink-0">
                            <IconTicketCode size="large" />
                          </div>
                        )}
                        {count > 1 && (
                          <span className="absolute -top-1.5 -right-1.5 bg-semi-color-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-xs leading-none">
                            x{count}
                          </span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Text strong className="text-sm text-semi-color-text-0">
                            {card.name}
                          </Text>
                          {count > 1 && (
                            <Tag size="small" color="blue" shape="square">
                              x {count} 张
                            </Tag>
                          )}
                          {cardFilterStatus === 0 && <Tag size="small" color="green">可使用</Tag>}
                          {cardFilterStatus === 1 && <Tag size="small" color="grey">已使用</Tag>}
                          {cardFilterStatus === 2 && <Tag size="small" color="red">已过期</Tag>}
                        </div>
                        <div className="text-xs text-semi-color-text-2 mt-0.5 line-clamp-1">
                          {card.desc || '用于霸王餐活动名额与特权资格'}
                        </div>
                      </div>

                      <div className="text-right shrink-0 text-xs text-semi-color-text-2">
                        <div className="text-[11px] text-semi-color-text-3">有效期至</div>
                        <div className="font-medium text-semi-color-text-1 mt-0.5">
                          {formatTimestamp(item.expire_time)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </TabPane>

          {/* Tab 2: 外卖红包 */}
          <TabPane
            tab={
              <span className="flex items-center gap-1.5">
                <IconGift />
                <span>外卖红包</span>
                {assetStats.redpackCount > 0 ? (
                  <Badge count={assetStats.redpackCount} overflowCount={99} type="danger" />
                ) : null}
              </span>
            }
            itemKey="redpacks"
          >
            <div className="py-2 flex flex-col gap-2.5">
              <div className="flex justify-between items-center bg-semi-color-fill-0 px-3 py-2 rounded-lg text-xs text-semi-color-text-2 border border-semi-color-border">
                <span>当前可用外卖红包共 <strong>{assetStats.redpackCount}</strong> 个</span>
                <span>抢单结算时可在对应外卖平台直接抵扣立减</span>
              </div>

              {assetStats.loading ? (
                <div className="py-14 flex flex-col items-center justify-center">
                  <Space vertical align="center" spacing="medium">
                    <Spin size="large" />
                    <Text type="secondary" className="text-xs text-semi-color-text-2">
                      正在从官方同步红包资产...
                    </Text>
                  </Space>
                </div>
              ) : !assetDetail?.redpacks || assetDetail.redpacks.length === 0 ? (
                <div className="py-10 text-center">
                  <Empty
                    title="暂无可用的霸王餐红包"
                    description="每日可通过整点红包雨、签到打卡或会员中心领取外卖红包"
                  />
                </div>
              ) : (
                assetDetail.redpacks.map((item) => {
                  const amountYuan = ((item.value_num || item.reward_num || 0) / 100).toFixed(2);
                  const isExpiringSoon = item.end_time && (item.end_time * 1000 - Date.now() < 24 * 3600 * 1000);
                  const platforms = item.limit?.platform_items || item.limit?.bwc_platforms || [];

                  return (
                    <div
                      key={item.user_red_pack_id}
                      className="border border-semi-color-border rounded-lg p-3 bg-semi-color-bg-0 hover:border-semi-color-primary-light-active transition-all shadow-xs flex items-center gap-3"
                    >
                      {/* 左侧金额 */}
                      <div className="w-18 text-center shrink-0 border-r border-semi-color-border pr-2">
                        <div className="text-rose-500 font-bold text-lg leading-tight">
                          <span className="text-xs font-normal">¥</span>{amountYuan}
                        </div>
                        <div className="text-[10px] text-semi-color-text-2 mt-0.5">
                          {item.threshold_num ? `满${(item.threshold_num / 100).toFixed(0)}可用` : '无门槛'}
                        </div>
                      </div>

                      {/* 中间红包描述 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Text strong className="text-sm text-semi-color-text-0">
                            {item.name || '霸王餐红包'}
                          </Text>
                          {platforms.includes(1) && <Tag size="small" color="amber">美团</Tag>}
                          {platforms.includes(2) && <Tag size="small" color="blue">饿了么</Tag>}
                          {platforms.includes(3) && <Tag size="small" color="orange">大众点评</Tag>}
                          {platforms.length === 0 && <Tag size="small" color="cyan">外卖全通用</Tag>}
                        </div>
                        <div className="text-xs text-semi-color-text-2 mt-0.5 truncate">
                          {item.info || '活动满返通用红包'}
                        </div>
                      </div>

                      {/* 右侧到期时间 */}
                      <div className="text-right shrink-0">
                        {isExpiringSoon && (
                          <Tag size="small" color="red" className="mb-0.5">即将失效</Tag>
                        )}
                        <div className="text-[11px] text-semi-color-text-2">
                          {formatTimestamp(item.end_time)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </TabPane>
        </Tabs>
      </Modal>
    </div>
  );
};
