import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Card,
  Row,
  Col,
  Avatar,
  Typography,
  Tag,
  Button,
  Space,
  Modal,
  Tabs,
  TabPane,
  Toast,
  Popconfirm,
  Spin,
  Banner,
  Descriptions,
  Badge,
  Divider,
  TextArea,
  Input,
  Tooltip,
  Empty,
  Notification,
  SideSheet,
  Progress,
  RadioGroup,
  Radio,
  Select,
  Dropdown,
  Checkbox,
  InputNumber
} from '@douyinfe/semi-ui';
import { useGSAP, gsap } from '../utils/animations';

import {
  IconPlus,
  IconDelete,
  IconCheckCircleStroked,
  IconCopy,
  IconRefresh,
  IconPlay,
  IconStop,
  IconDesktop,
  IconSearch,
  IconHelpCircle,
  IconFile,
  IconInfoCircle,
  IconChevronRight,
  IconSmartphoneStroked,
  IconCode,
  IconEyeOpened,
  IconTicketCode,
  IconGift,
  IconUser,
  IconShield,
  IconKey,
  IconTick,
  IconSend,
  IconBell,
  IconAlertCircle,
  IconQrCode,
  IconEdit,
  IconMore
} from '@douyinfe/semi-icons';
import { useAppStore } from '../store/useAppStore';
import { api } from '../api';
import { useOnActivated } from '../utils/useOnActivated';
import type { Account, AccountDetailData, AccountNotifyConfig, AccountNotifyMode, ClawBotStatus } from '../types';

const { Title, Text, Paragraph } = Typography;

export interface TokenStatus {
  status: 'valid' | 'expiring' | 'expired' | 'none';
  label: string;
  color: 'green' | 'amber' | 'red' | 'grey';
  daysLeft?: number;
  hoursLeft?: number;
  expireTimeStr?: string;
  isExpired: boolean;
}

export function parseTokenExpiration(token?: string, expiresAt?: string, isTokenExpired?: boolean): TokenStatus {
  if (!token && !expiresAt) {
    return { status: 'none', label: '未配置凭据', color: 'grey', isExpired: false };
  }

  let expTimestampMs: number | null = null;
  let formattedDate = (expiresAt && expiresAt !== '长期有效' && expiresAt !== '无') ? expiresAt : '';

  // 1. 优先尝试从 JWT Payload 中解码真实 exp
  if (token && token.includes('.')) {
    try {
      const parts = token.split('.');
      if (parts.length >= 2) {
        const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const jsonStr = decodeURIComponent(
          atob(payloadBase64)
            .split('')
            .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );
        const payload = JSON.parse(jsonStr);
        if (payload && typeof payload.exp === 'number') {
          expTimestampMs = payload.exp * 1000;
          if (!formattedDate) {
            const d = new Date(expTimestampMs);
            const pad = (n: number) => (n < 10 ? '0' + n : String(n));
            formattedDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
          }
        }
      }
    } catch {
      // 容错处理
    }
  }

  // 2. 若未从 JWT 中提取到时间戳，尝试解析 expiresAt 字符串
  if (!expTimestampMs && formattedDate) {
    const parsed = Date.parse(formattedDate.replace(/-/g, '/'));
    if (!isNaN(parsed)) {
      expTimestampMs = parsed;
    }
  }

  if (!expTimestampMs) {
    if (expiresAt === '长期有效') {
      return { status: 'valid', label: '长期有效', color: 'green', isExpired: false, expireTimeStr: '长期有效' };
    }
    if (isTokenExpired) {
      return { status: 'expired', label: '凭据已过期', color: 'red', daysLeft: 0, expireTimeStr: formattedDate || '已过期', isExpired: true };
    }
    return { status: 'valid', label: '凭据正常', color: 'green', isExpired: false, expireTimeStr: formattedDate || '长期有效' };
  }

  const nowMs = Date.now();
  const diffMs = expTimestampMs - nowMs;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffMs <= 0 || isTokenExpired) {
    const expiredDaysAgo = Math.max(1, Math.abs(Math.floor(diffMs / (1000 * 60 * 60 * 24))));
    const daysAgoText = (diffMs <= 0 && expiredDaysAgo > 0) ? `已过期 ${expiredDaysAgo} 天` : '凭据已过期';
    return {
      status: 'expired',
      label: daysAgoText,
      color: 'red',
      daysLeft: 0,
      hoursLeft: 0,
      expireTimeStr: formattedDate,
      isExpired: true,
    };
  }

  // 微信小程序凭据有效期通常为 48 小时（2天），仅在不足 24 小时（即当日到期）时才转为黄色预警
  // 剩余大于 24 小时时属于正常健康状态（绿色标签）
  if (diffHours <= 24) {
    const hourLabel = diffHours <= 1 ? '今日到期' : `${diffHours} 小时后到期`;
    return {
      status: 'expiring',
      label: hourLabel,
      color: 'amber',
      daysLeft: diffDays,
      hoursLeft: diffHours,
      expireTimeStr: formattedDate,
      isExpired: false,
    };
  }

  return {
    status: 'valid',
    label: `剩余 ${diffDays} 天`,
    color: 'green',
    daysLeft: diffDays,
    hoursLeft: diffHours,
    expireTimeStr: formattedDate,
    isExpired: false,
  };
}

export const Accounts: React.FC = () => {
  const accounts = useAppStore((s) => s.accounts);
  const loadAccounts = useAppStore((s) => s.loadAccounts);
  const loadUserInfo = useAppStore((s) => s.loadUserInfo);
  const currentAccountKey = useAppStore((s) => s.currentAccountKey);
  const setCurrentAccountKey = useAppStore((s) => s.setCurrentAccountKey);
  const accountsRef = useRef<HTMLDivElement>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [targetUpdateAccount, setTargetUpdateAccount] = useState<Account | null>(null);
  const [activeTab, setActiveTab] = useState('sniffer');
  const [refreshing, setRefreshing] = useState(false);

  // 统计已过期的小蚕账号
  const expiredAccounts = useMemo(() => {
    return accounts.filter((a) => {
      if (a.platform === 'meituan') return false;
      const s = parseTokenExpiration(a.token, a.expires_at, a.is_token_expired);
      return s.isExpired;
    });
  }, [accounts]);

  const handleOpenUpdateModal = (acc: Account) => {
    setTargetUpdateAccount(acc);
    setModalVisible(true);
    setActiveTab('wechat');
    setCustomNickname(acc.nickname || '');
    setCustomSilkId(acc.silk_id || '');
    setRawText('');
    setParsedInfo(null);
    hasNotifiedCaptureRef.current = false;
  };

  // 美团官方账号聚合与绑定状态
  const [targetBindAccount, setTargetBindAccount] = useState<Account | null>(null);
  const meituanAccounts = useMemo(() => accounts.filter((a) => Boolean(a.meituan_token || a.platform === 'meituan')), [accounts]);
  const hasMeituanAccounts = meituanAccounts.length > 0;
  const [meituanLoginModalVisible, setMeituanLoginModalVisible] = useState(false);
  const [meituanAuthSessionId, setMeituanAuthSessionId] = useState<string>('');
  const [meituanQrCode, setMeituanQrCode] = useState<string>('');
  const [meituanAuthStatus, setMeituanAuthStatus] = useState<'idle' | 'loading' | 'pending' | 'success' | 'failed' | 'expired'>('idle');
  const [meituanAuthMessage, setMeituanAuthMessage] = useState<string>('');
  const meituanPollTimerRef = useRef<any>(null);
  const [meituanClaimingKeys, setMeituanClaimingKeys] = useState<Record<string, boolean>>({});
  const [couponModalVisible, setCouponModalVisible] = useState(false);
  const [selectedCouponAccount, setSelectedCouponAccount] = useState<Account | null>(null);

  const [editMeituanModalVisible, setEditMeituanModalVisible] = useState(false);
  const [editingMeituanAccount, setEditingMeituanAccount] = useState<Account | null>(null);
  const [newMeituanNickname, setNewMeituanNickname] = useState('');
  const [savingMeituanNickname, setSavingMeituanNickname] = useState(false);

  // 页面切入激活时自动拉取最新账号列表与用户信息
  useOnActivated('accounts', () => {
    loadAccounts();
    loadUserInfo();
  }, { throttleMs: 3000 });

  useGSAP(
    () => {
      if (accountsRef.current && accounts.length > 0) {
        gsap.killTweensOf('.gsap-account-card, .gsap-meituan-card');
        gsap.fromTo(
          '.gsap-account-card, .gsap-meituan-card',
          { autoAlpha: 0, y: 14, scale: 0.985 },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: 0.35,
            stagger: 0.04,
            ease: 'power2.out',
            overwrite: 'auto',
            clearProps: 'transform,opacity,visibility'
          }
        );
      }
    },
    { scope: accountsRef, dependencies: [accounts.length] }
  );

  // 账号卡片鼠标移入/移出微交互
  const { contextSafe } = useGSAP({ scope: accountsRef });

  const handleCardHover = contextSafe((e: React.MouseEvent<HTMLDivElement>) => {
    gsap.to(e.currentTarget, {
      y: -3,
      duration: 0.22,
      ease: 'power1.out',
      overwrite: 'auto',
    });
  });

  const handleCardLeave = contextSafe((e: React.MouseEvent<HTMLDivElement>) => {
    gsap.to(e.currentTarget, {
      y: 0,
      duration: 0.18,
      ease: 'power1.out',
      overwrite: 'auto',
    });
  });

  // Token 智能解析状态
  const [rawText, setRawText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [parsedInfo, setParsedInfo] = useState<{
    token: string;
    silk_id: string;
    is_valid: boolean;
    message: string;
    exp_date: string;
    nickname: string;
    client_mode?: string;
  } | null>(null);

  // 微信极速无感直连状态
  const [scanningWechat, setScanningWechat] = useState(false);
  const [wechatListening, setWechatListening] = useState(false);
  const [listenCountdown, setListenCountdown] = useState(120);
  const listenPollTimerRef = useRef<any>(null);
  const listenCountdownTimerRef = useRef<any>(null);
  const hasNotifiedCaptureRef = useRef(false);

  // 账号表单自定义
  const [customNickname, setCustomNickname] = useState('');
  const [customSilkId, setCustomSilkId] = useState('');

  // 同步状态
  const [syncingKey, setSyncingKey] = useState<string | null>(null);

  // 账号详情抽屉 (SideSheet) 状态与数据
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailAccount, setDetailAccount] = useState<Account | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<AccountDetailData | null>(null);
  const [cardFilterStatus, setCardFilterStatus] = useState<number>(0);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState<string>('redpacks');

  // 账号专属推送配置模态框状态
  const [notifyModalVisible, setNotifyModalVisible] = useState(false);
  const [notifyAccount, setNotifyAccount] = useState<Account | null>(null);
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [notifySaving, setNotifySaving] = useState(false);
  const [notifyTesting, setNotifyTesting] = useState(false);
  const [notifyMode, setNotifyMode] = useState<AccountNotifyMode>('global');
  const [notifyChannel, setNotifyChannel] = useState<string>('clawbot');
  const [notifyConfig, setNotifyConfig] = useState<AccountNotifyConfig>({});
  const [systemClawbotStatus, setSystemClawbotStatus] = useState<ClawBotStatus | null>(null);

  const handleOpenNotifyModal = async (acc: Account) => {
    setNotifyAccount(acc);
    setNotifyModalVisible(true);
    setNotifyLoading(true);

    // 同步查询系统当前内置 ClawBot 状态
    api.getClawBotStatus().then((r) => {
      if (r && r.ok) setSystemClawbotStatus(r);
    }).catch(() => {});

    try {
      const res = await api.getAccountNotifyConfig(acc.key);
      if (res.ok && res.data) {
        const mode = res.data.notify_mode || 'global';
        const cfg = res.data.notify_config || {};
        setNotifyMode(mode);
        setNotifyConfig(cfg);
        setNotifyChannel(cfg.channel || 'clawbot');
      } else {
        setNotifyMode((acc.notify_mode as AccountNotifyMode) || 'global');
        let parsedCfg: AccountNotifyConfig = {};
        if (typeof acc.notify_config === 'string') {
          try {
            parsedCfg = JSON.parse(acc.notify_config);
          } catch {}
        } else if (acc.notify_config && typeof acc.notify_config === 'object') {
          parsedCfg = acc.notify_config as AccountNotifyConfig;
        }
        setNotifyConfig(parsedCfg);
        setNotifyChannel(parsedCfg.channel || 'clawbot');
      }
    } catch (e: any) {
      Toast.error(`获取推送配置失败: ${e.message || e}`);
    } finally {
      setNotifyLoading(false);
    }
  };

  const handleSaveNotifyConfig = async () => {
    if (!notifyAccount) return;
    setNotifySaving(true);
    try {
      const fullConfig: AccountNotifyConfig = {
        ...notifyConfig,
        channel: notifyChannel,
      };
      const res = await api.saveAccountNotifyConfig(notifyAccount.key, notifyMode, fullConfig);
      if (res.ok) {
        Toast.success(res.message || '账号专属推送配置保存成功');
        setNotifyModalVisible(false);
        await loadAccounts();
      } else {
        Toast.error(res.message || '保存配置失败');
      }
    } catch (e: any) {
      Toast.error(`保存配置异常: ${e.message || e}`);
    } finally {
      setNotifySaving(false);
    }
  };

  const handleTestNotify = async () => {
    if (!notifyAccount) return;
    setNotifyTesting(true);
    try {
      const fullConfig: AccountNotifyConfig = {
        ...notifyConfig,
        channel: notifyChannel,
      };
      const res = await api.testAccountNotify(notifyAccount.key, notifyMode, fullConfig);
      if (res.ok) {
        Toast.success(res.message || '测试消息发送成功，请前往对应客户端查收');
      } else {
        Toast.error(res.message || '测试推送失败，请检查配置参数');
      }
    } catch (e: any) {
      Toast.error(`测试异常: ${e.message || e}`);
    } finally {
      setNotifyTesting(false);
    }
  };

  // 时间戳格式化辅助函数
  const formatTimestamp = (ts?: number | string) => {
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
  };

  const handleSyncAccount = async (key: string) => {
    setSyncingKey(key);
    try {
      const res = await api.syncAccount(key);
      if (res.ok) {
        Toast.success(res.message || '账号资产与官方档案已成功同步');
        await loadAccounts();
        if (detailAccount && detailAccount.key === key) {
          await fetchAccountDetail(key);
        }
      } else {
        Toast.error(res.message || '同步失败');
      }
    } catch (e: any) {
      Toast.error(`同步异常: ${e.message || e}`);
    } finally {
      setSyncingKey(null);
    }
  };

  const handleOpenDetail = async (acc: Account) => {
    setDetailAccount(acc);
    setDetailVisible(true);
    setCardFilterStatus(0);
    setActiveDetailTab('redpacks');
    await fetchAccountDetail(acc.key);
  };

  const fetchAccountDetail = async (key: string) => {
    setDetailLoading(true);
    try {
      const res = await api.getAccountDetail(key);
      if (res.ok) {
        setDetailData(res);
        if (res.account) {
          setDetailAccount(res.account);
        }
        loadAccounts();
      } else {
        Toast.error('获取账号资产详情失败');
      }
    } catch (e: any) {
      Toast.error(`获取账号详情异常: ${e.message || e}`);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleChangeCardStatus = async (status: number) => {
    if (!detailAccount) return;
    setCardFilterStatus(status);
    setCardsLoading(true);
    try {
      const res = await api.getAccountCards(detailAccount.key, status);
      if (res.ok && detailData) {
        setDetailData({
          ...detailData,
          cards: res.cards || []
        });
      }
    } catch (e: any) {
      Toast.error('切换卡券状态失败');
    } finally {
      setCardsLoading(false);
    }
  };

  // 卡券叠加聚合：同类型卡券若过期时间一致则自动叠加展示（尤其针对未使用卡券）
  const stackedCards = useMemo(() => {
    const rawCards = detailData?.cards || [];
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
  }, [detailData?.cards]);

  const handleOpenModal = () => {
    setTargetUpdateAccount(null);
    setModalVisible(true);
    setActiveTab('wechat');
    setRawText('');
    setParsedInfo(null);
    setCustomNickname('');
    setCustomSilkId('');
    hasNotifiedCaptureRef.current = false;
  };

  // 关闭弹窗
  const handleCloseModal = (showAbortToast = false) => {
    setModalVisible(false);
    stopPollingWechatListener();
    if (wechatListening) {
      api.stopWechatListener().catch(() => {});
      setWechatListening(false);
      if (showAbortToast) {
        Toast.info('已停止微信小程序监听');
      }
    }
  };

  const stopPollingWechatListener = () => {
    if (listenPollTimerRef.current) {
      clearInterval(listenPollTimerRef.current);
      listenPollTimerRef.current = null;
    }
    if (listenCountdownTimerRef.current) {
      clearInterval(listenCountdownTimerRef.current);
      listenCountdownTimerRef.current = null;
    }
  };

  // Tab 切换响应
  const handleTabChange = (key: string) => {
    if (activeTab === 'wechat' && key !== 'wechat') {
      if (wechatListening) {
        handleStopWechatListener();
      }
    }
    setActiveTab(key);
  };

  // 监听输入，防抖智能解析 Token
  useEffect(() => {
    if (!(rawText || '').trim()) {
      setParsedInfo(null);
      return;
    }
    const timer = setTimeout(async () => {
      setParsing(true);
      try {
        const res = await api.parseToken(rawText);
        if (res.ok && res.token) {
          setParsedInfo({
            token: res.token,
            silk_id: res.silk_id || '',
            is_valid: res.is_valid,
            message: res.message,
            exp_date: res.exp_date || '长期有效',
            nickname: res.nickname || '小蚕微信用户',
            client_mode: 'app'
          });
          setCustomNickname(res.nickname || '小蚕微信用户');
          setCustomSilkId(res.silk_id || '');
        } else {
          setParsedInfo(null);
        }
      } catch (e) {
        setParsedInfo(null);
      } finally {
        setParsing(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [rawText]);

  // 验证并保存真实账号 (手动 Token 模式)
  const handleSaveAccount = async () => {
    if (!parsedInfo || !parsedInfo.token) {
      Toast.error('请先粘贴有效的小蚕凭证');
      return;
    }

    setVerifying(true);
    try {
      const verifyRes = await api.verifyToken(parsedInfo.token);
      if (!verifyRes.ok || !verifyRes.valid) {
        Toast.error(`凭证验证未通过: ${verifyRes.message || 'Token 无效'}`);
        setVerifying(false);
        return;
      }

      const saveRes = await api.createAccount({
        key: targetUpdateAccount?.key,
        silk_id: (customSilkId || '').trim() || parsedInfo.silk_id,
        nickname: (customNickname || '').trim() || parsedInfo.nickname,
        avatar: '',
        vip_level: 5,
        token: parsedInfo.token,
        expires_at: parsedInfo.exp_date,
        client_mode: 'app'
      });

      const nick = customNickname || parsedInfo.nickname || '小蚕用户';
      const isUpdated = (saveRes as any)?.is_updated;
      Toast.success((saveRes as any)?.message || (isUpdated ? `已成功更新已有账号【${nick}】凭证！` : `账号【${nick}】已成功接入托管！`));
      handleCloseModal(false);
      await loadAccounts();
      if ((saveRes as any)?.account?.key) {
        setCurrentAccountKey((saveRes as any).account.key);
      }
    } catch (e: any) {
      Toast.error(`保存失败: ${e.message || '网络异常'}`);
    } finally {
      setVerifying(false);
    }
  };

  // 1. 立即从电脑微信一键提取 (毫秒级无感直连)
  const handleScanWechatDirect = async () => {
    setScanningWechat(true);
    try {
      const res = await api.scanWechatAccount();
      if (res.ok && res.account) {
        Notification.success({
          title: '小蚕账号直连成功',
          content: res.message || `已成功从电脑微信提取到小蚕账号【${res.account.nickname}】！`,
          duration: 5,
        });
        handleCloseModal(false);
        await loadAccounts();
        if (res.account.key) {
          setCurrentAccountKey(res.account.key);
        }
      } else {
        Toast.warning(res.message || '未能从电脑微信检测到小蚕小程序凭证，请先在电脑微信中打开一次【小蚕霸王餐】小程序');
      }
    } catch (e: any) {
      Toast.error(`提取异常: ${e.message || '网络通信失败'}`);
    } finally {
      setScanningWechat(false);
    }
  };

  // 2. 开启自动感知等待 (当用户打开微信小程序瞬间捕获)
  const handleStartWechatListener = async () => {
    stopPollingWechatListener();
    hasNotifiedCaptureRef.current = false;
    try {
      const res = await api.startWechatListener(120);
      if (res.ok) {
        setWechatListening(true);
        setListenCountdown(120);
        Toast.info('自动感知已开启，请在电脑微信中点击进入【小蚕霸王餐】小程序');

        listenCountdownTimerRef.current = setInterval(() => {
          setListenCountdown((prev) => {
            if (prev <= 1) {
              handleStopWechatListener();
              return 0;
            }
            return prev - 1;
          });
        }, 1000);

        listenPollTimerRef.current = setInterval(async () => {
          try {
            const statusRes = await api.getWechatListenerStatus();
            if (statusRes.ok && statusRes.status) {
              if (statusRes.status.status === 'captured' && statusRes.status.account) {
                stopPollingWechatListener();
                setWechatListening(false);

                if (!hasNotifiedCaptureRef.current) {
                  hasNotifiedCaptureRef.current = true;
                  const nick = statusRes.status.account.nickname || '小蚕用户';
                  const silk = statusRes.status.account.silk_id ? ` (Silk ID: ${statusRes.status.account.silk_id})` : '';
                  Notification.success({
                    title: '小蚕账号自动感知捕获成功',
                    content: `成功从电脑微信捕获小蚕账号【${nick}】${silk}，已完成托管绑定！`,
                    duration: 5,
                  });
                  handleCloseModal(false);
                  await loadAccounts();
                  if (statusRes.status.account.key) {
                    setCurrentAccountKey(statusRes.status.account.key);
                  }
                }
              } else if (!statusRes.status.is_running) {
                stopPollingWechatListener();
                setWechatListening(false);
              }
            }
          } catch (e) {}
        }, 1200);
      } else {
        Toast.error(res.message || '开启自动监听失败');
      }
    } catch (e: any) {
      Toast.error(`启动异常: ${e.message}`);
    }
  };

  // 停止自动感知
  const handleStopWechatListener = async () => {
    try {
      await api.stopWechatListener();
      setWechatListening(false);
      stopPollingWechatListener();
      Toast.info('已停止微信自动监听');
    } catch (e) {}
  };

  useEffect(() => {
    return () => {
      stopPollingWechatListener();
      api.stopWechatListener().catch(() => {});
    };
  }, []);

  // 删除账号
  const handleDeleteAccount = async (key: string) => {
    try {
      await api.deleteAccount(key);
      Toast.success('账号已移除');
      if (detailVisible && detailAccount?.key === key) {
        setDetailVisible(false);
      }
      await loadAccounts();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      const msg = err?.response?.data?.message || err?.message || '移除账号失败';
      Toast.error(`移除账号失败: ${msg}`);
    }
  };

  // 复制 Token
  const handleCopyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    Toast.success('Token 已复制到剪贴板');
  };

  const stopMeituanPolling = () => {
    if (meituanPollTimerRef.current) {
      clearInterval(meituanPollTimerRef.current);
      meituanPollTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopMeituanPolling();
    };
  }, []);

  const handleStartMeituanLogin = async (acc?: Account) => {
    setTargetBindAccount(acc || null);
    stopMeituanPolling();
    setMeituanAuthStatus('loading');
    setMeituanAuthMessage('正在向美团官方申请授权链接与二维码...');
    setMeituanQrCode('');
    setMeituanAuthSessionId('');
    setMeituanLoginModalVisible(true);

    try {
      const res = await api.startMeituanAuth(acc?.key);
      if (res.ok && res.session_id) {
        setMeituanAuthSessionId(res.session_id);
        setMeituanQrCode(res.qrcode_base64 || '');
        setMeituanAuthStatus('pending');
        setMeituanAuthMessage('请使用手机美团 App 扫码并在手机上点击授权登录');

        meituanPollTimerRef.current = setInterval(async () => {
          try {
            const pollRes = await api.pollMeituanAuth(res.session_id!);
            if (pollRes.status === 'success') {
              stopMeituanPolling();
              setMeituanAuthStatus('success');
              const targetName = acc?.nickname || '指定账号';
              setMeituanAuthMessage('美团官方账号绑定成功！');
              Toast.success(pollRes.message || `账号【${targetName}】绑定美团官方账号成功！`);
              await loadAccounts();
              setTimeout(() => {
                setMeituanLoginModalVisible(false);
              }, 1200);
            } else if (pollRes.status === 'expired') {
              stopMeituanPolling();
              setMeituanAuthStatus('expired');
              setMeituanAuthMessage('二维码已过期，请重新获取');
            } else if (pollRes.status === 'failed') {
              stopMeituanPolling();
              setMeituanAuthStatus('failed');
              setMeituanAuthMessage(pollRes.message || '授权失败，请重新尝试');
            }
          } catch (_) {}
        }, 2000);
      } else {
        setMeituanAuthStatus('failed');
        setMeituanAuthMessage(res.message || '获取美团授权二维码失败');
      }
    } catch (e: any) {
      setMeituanAuthStatus('failed');
      setMeituanAuthMessage(`发起授权异常: ${e.message}`);
    }
  };


  const handleOpenEditMeituanName = (acc: Account) => {
    setEditingMeituanAccount(acc);
    setNewMeituanNickname(acc.meituan_nickname || '');
    setEditMeituanModalVisible(true);
  };

  const handleSaveMeituanNickname = async () => {
    if (!editingMeituanAccount) return;
    if (!newMeituanNickname.trim()) {
      Toast.warning('美团账号名称不能为空');
      return;
    }
    setSavingMeituanNickname(true);
    try {
      const res = await api.updateMeituanNickname(editingMeituanAccount.key, newMeituanNickname.trim());
      if (res.ok) {
        Toast.success('美团账号名称已更新');
        setEditMeituanModalVisible(false);
        await loadAccounts();
      } else {
        Toast.error(res.message || '更新失败');
      }
    } catch (e: any) {
      Toast.error(`更新异常: ${e.message || e}`);
    } finally {
      setSavingMeituanNickname(false);
    }
  };

  const handleClearAllMeituan = async () => {
    try {
      const res = await api.clearAllMeituan();
      if (res.ok) {
        Toast.success(res.message || '已清空全部美团凭证');
        await loadAccounts();
      } else {
        Toast.error(res.message || '清空失败');
      }
    } catch (e: any) {
      Toast.error(`清空异常: ${e.message || e}`);
    }
  };

  const handleUnbindMeituan = async (accountKey: string) => {
    try {
      const res = await api.unbindMeituan(accountKey);
      if (res.ok) {
        Toast.success('已解除美团账号绑定');
        await loadAccounts();
      } else {
        Toast.error(res.message || '解除绑定失败');
      }
    } catch (e: any) {
      Toast.error(`解除美团绑定异常: ${e.message}`);
    }
  };

  const handleCancelMeituanLogin = () => {
    stopMeituanPolling();
    if (meituanAuthSessionId) {
      api.cancelMeituanAuth(meituanAuthSessionId).catch(() => {});
    }
    setMeituanLoginModalVisible(false);
  };

  const handleClaimMeituanSingle = async (key: string) => {
    setMeituanClaimingKeys((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await api.runMeituanClaim({ account_key: key });
      if (res.ok && res.result) {
        const count = res.result.coupon_count || 0;
        if (res.result.success) {
          Toast.success(`领券成功！共获得 ${count} 张美团优惠券`);
        } else if (res.result.code === 1014) {
          Toast.info(res.result.formatted_text || '今日已领取过美团优惠券');
        } else {
          Toast.warning(res.result.formatted_text || '未能成功领取');
        }
      } else {
        Toast.error(res.message || '领券失败');
      }
      await loadAccounts();
    } catch (e: any) {
      Toast.error(`领券异常: ${e.message}`);
    } finally {
      setMeituanClaimingKeys((prev) => ({ ...prev, [key]: false }));
    }
  };



  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-4">
        <div>
          <Title heading={3}>账号管理</Title>
          <Text type="secondary">多平台安全托管中心 · 电脑微信直连 · 美团官方扫码 · 自动领券打卡</Text>
        </div>
        <Space>
          <Button
            theme="light"
            icon={<IconRefresh spin={refreshing} />}
            loading={refreshing}
            onClick={async () => {
              setRefreshing(true);
              try {
                await loadAccounts();
                Toast.success('已刷新账号列表');
              } finally {
                setRefreshing(false);
              }
            }}
          >
            刷新列表
          </Button>

          {/* 清空凭证按钮（有美团账号时显示） */}
          {hasMeituanAccounts && (
            <Popconfirm
              title="确定清空全部美团凭证？"
              content="此操作将解除所有账号绑定的美团号，并清空本地美团授权凭证库。后续如需领券可重新扫码。"
              okText="确定清空"
              cancelText="取消"
              okType="danger"
              onConfirm={handleClearAllMeituan}
            >
              <Button
                theme="light"
                type="danger"
                icon={<IconDelete />}
              >
                清空美团凭证
              </Button>
            </Popconfirm>
          )}

          {/* 添加小蚕账号 */}
          <Button
            theme="solid"
            type="primary"
            icon={<IconPlus />}
            onClick={handleOpenModal}
          >
            添加小蚕账号
          </Button>
        </Space>
      </div>

      {expiredAccounts.length > 0 && (
        <Banner
          type="danger"
          closeIcon={null}
          className="mb-4 rounded-xl border border-red-500/30 shadow-xs"
          description={
            <div className="flex items-center justify-between flex-wrap gap-3 w-full py-0.5">
              <div className="flex-1 min-w-[280px]">
                <div className="font-semibold text-semi-color-danger text-sm">
                  检测到 {expiredAccounts.length} 个账号的登录凭据已过期失效
                </div>
                <div className="text-xs text-semi-color-text-2 mt-0.5">
                  受影响账号：{expiredAccounts.map((a) => `【${a.nickname}】`).join('、')}。凭据过期会导致抢单与资产查询报 401 鉴权失效，请尽快重新直连提取或更新凭据。
                </div>
              </div>
              <Button
                theme="solid"
                type="danger"
                size="small"
                icon={<IconRefresh />}
                onClick={() => handleOpenUpdateModal(expiredAccounts[0])}
                className="shrink-0"
              >
                立即更新凭据
              </Button>
            </div>
          }
        />
      )}

      <div ref={accountsRef}>
        <Row gutter={[16, 16]}>
          {accounts.filter((a) => a.platform !== 'meituan').map((acc: Account) => {
            const isSelected = acc.key === currentAccountKey;
            const isMeituanBound = Boolean(acc.meituan_token);
            const tokenStatus = parseTokenExpiration(acc.token, acc.expires_at, acc.is_token_expired);

            return (
              <Col xs={24} sm={12} lg={8} key={acc.key}>
                <div
                  onClick={() => handleOpenDetail(acc)}
                  onMouseEnter={handleCardHover}
                  onMouseLeave={handleCardLeave}
                  className="h-full"
                >
                  <Card
                    shadows="hover"
                    className={`gsap-account-card rounded-xl transition-colors duration-150 relative overflow-hidden border cursor-pointer ${
                      tokenStatus.isExpired
                        ? 'border-red-500/60 bg-red-500/5 hover:border-red-500 shadow-xs'
                        : isSelected
                        ? 'border-semi-color-primary bg-[var(--semi-color-primary-light-default)]/20 shadow-xs'
                        : 'border-semi-color-border hover:border-semi-color-primary-light-active bg-semi-color-bg-1'
                    }`}
                    headerExtraContent={
                    <Space spacing="tight">
                      {isSelected && (
                        <Tag color="blue" type="solid" size="small">
                          <IconCheckCircleStroked size="small" /> 主控
                        </Tag>
                      )}
                      <Tag color={acc.is_plus ? "amber" : "blue"} size="small">
                        {acc.is_plus ? `SVIP${acc.vip_level || 1}` : `VIP${acc.vip_level || 1}`}
                      </Tag>

                      {/* 凭据有效期与过期状态标签 (支持一键点击重新登录覆盖) */}
                      <Tooltip
                        content={
                          tokenStatus.isExpired
                            ? `小蚕登录凭据已于 ${tokenStatus.expireTimeStr || '近期'} 过期失效，点击重新登录并覆盖`
                            : tokenStatus.status === 'expiring'
                            ? `小蚕登录凭据将于 ${tokenStatus.expireTimeStr} 到期 (仅剩 ${tokenStatus.hoursLeft ? `${tokenStatus.hoursLeft} 小时` : `${tokenStatus.daysLeft} 天`})，点击重新登录并覆盖`
                            : `小蚕登录凭据有效期至: ${tokenStatus.expireTimeStr || '长期有效'}，点击可随时重新登录覆盖`
                        }
                      >
                        <Tag
                          color={tokenStatus.color}
                          size="small"
                          className="cursor-pointer hover:opacity-85 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenUpdateModal(acc);
                          }}
                          prefixIcon={tokenStatus.isExpired ? <IconAlertCircle size="small" /> : tokenStatus.status === 'expiring' ? <IconAlertCircle size="small" /> : <IconTick size="small" />}
                        >
                          {tokenStatus.label}
                        </Tag>
                      </Tooltip>

                      {acc.notify_mode === 'custom' && (() => {
                        let ch = '';
                        try {
                          if (typeof acc.notify_config === 'string') {
                            ch = JSON.parse(acc.notify_config)?.channel || '';
                          } else if (acc.notify_config) {
                            ch = (acc.notify_config as any)?.channel || '';
                          }
                        } catch {}
                        const isClaw = ch === 'clawbot' || !ch;
                        return (
                          <Tooltip content={isClaw ? "已绑定微信官方 ClawBot 专属通道，通知直达个人微信服务号" : `已绑定专属推送通道 (${ch})，通知仅定向发送给该账号`}>
                            <Tag color={isClaw ? "green" : "violet"} size="small" prefixIcon={<IconBell size="small" />}>
                              {isClaw ? "微信推送" : "专属推送"}
                            </Tag>
                          </Tooltip>
                        );
                      })()}
                      {acc.notify_mode === 'disabled' && (
                        <Tooltip content="已开启静音免打扰，该账号中签与抢单不触发外部推送">
                          <Tag color="grey" size="small" prefixIcon={<IconBell size="small" />}>
                            免打扰
                          </Tag>
                        </Tooltip>
                      )}
                    </Space>
                  }
                >
                  {/* 主控顶部指示线 */}
                  {isSelected && (
                    <div className="absolute top-0 left-0 right-0 h-[3px] bg-semi-color-primary" />
                  )}

                  <div className="flex gap-3 items-center mb-3">
                    <Avatar size="medium" src={acc.avatar || undefined} color="orange" className="shadow-xs shrink-0">
                      {acc.nickname?.[0] || '蚕'}
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Text strong className="text-base truncate text-semi-color-text-0 max-w-[160px]" title={acc.nickname}>
                          {acc.nickname}
                        </Text>
                        {acc.phone && (
                          <Text type="tertiary" size="small" className="shrink-0">
                            ({acc.phone})
                          </Text>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-xs text-semi-color-text-2 mt-0.5">
                        <div className="flex items-center gap-1.5">
                          <span>Silk ID: {acc.silk_id || '未配置'}</span>
                          {!acc.silk_id && (
                            <Tooltip content="该账号暂无关联 Silk ID，点击卡片底部「同步」按钮可直连官方自动补全">
                              <Tag color="red" size="small">缺失ID</Tag>
                            </Tooltip>
                          )}
                        </div>
                        <div className={tokenStatus.isExpired ? "text-semi-color-danger font-medium" : "text-semi-color-text-3"}>
                          {tokenStatus.isExpired
                            ? `已过期 (${tokenStatus.expireTimeStr?.split(' ')[0] || '失效'})`
                            : `有效至 ${tokenStatus.expireTimeStr?.split(' ')[0] || '长期'}`}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 官方原生资产概览 */}
                  <div className="grid grid-cols-3 gap-2 bg-semi-color-fill-0 p-2.5 rounded-lg mb-3 text-center border border-semi-color-border">
                    <div className="flex flex-col">
                      <Text size="small" type="tertiary">钱包余额</Text>
                      <Text strong className="text-semi-color-primary text-sm">
                        ¥{((acc.silk || 0) / 100).toFixed(2)}
                      </Text>
                    </div>
                    <div className="flex flex-col">
                      <Text size="small" type="tertiary">累计提现</Text>
                      <Text strong className="text-semi-color-text-0 text-sm">
                        ¥{((acc.withdraw_total || 0) / 100).toFixed(2)}
                      </Text>
                    </div>
                    <div className="flex flex-col">
                      <Text size="small" type="tertiary">累计成单</Text>
                      <Text strong className="text-semi-color-success text-sm">
                        {acc.completed_number || 0} 单
                      </Text>
                    </div>
                  </div>

                  {/* 元宝与成长值 */}
                  <div className="flex items-center justify-between text-xs text-semi-color-text-2 mb-3 px-0.5">
                    <div className="flex items-center gap-1.5">
                      <Tag size="small" color="orange">{(acc.yb_point || 0).toLocaleString()} 元宝</Tag>
                      {Boolean(acc.unreceived_points) && (
                        <Tag size="small" color="red">待领 {acc.unreceived_points}</Tag>
                      )}
                    </div>
                    {Boolean(acc.vip_score) && (
                      <Text size="small" type="tertiary">
                        成长值: <Text size="small" strong>{(acc.vip_score || 0).toLocaleString()}</Text>
                      </Text>
                    )}
                  </div>

                  {/* 美团官方账号绑定状态与领券区 */}
                  {isMeituanBound ? (
                    <div
                      className="bg-semi-color-fill-0 border border-semi-color-border rounded-lg p-2.5 mb-3.5 flex items-center justify-between text-xs transition-colors hover:border-amber-400/50"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-1">
                        <Avatar
                          size="extra-extra-small"
                          style={{ backgroundColor: '#ffc300', color: '#222', fontWeight: 600, fontSize: '10px' }}
                        >
                          美
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Text strong className="text-xs truncate max-w-[110px]" title={acc.meituan_nickname}>
                              {acc.meituan_nickname || '美团官方账号'}
                            </Text>
                            <Tooltip content="修改美团备注">
                              <Button
                                theme="borderless"
                                type="tertiary"
                                size="small"
                                icon={<IconEdit />}
                                onClick={() => handleOpenEditMeituanName(acc)}
                                style={{ padding: '0 2px', height: '16px', lineHeight: '16px' }}
                              />
                            </Tooltip>
                            {typeof acc.meituan_last_claimed_count === 'number' && acc.meituan_last_claimed_count > 0 && (
                              <Tag color="amber" size="small" style={{ fontSize: '10px', height: '18px', lineHeight: '18px', padding: '0 4px' }}>
                                {acc.meituan_last_claimed_count} 张券
                              </Tag>
                            )}
                          </div>
                          {acc.meituan_last_claimed_at ? (
                            <Text type="tertiary" className="text-[11px] block truncate">
                              上次领券: {formatTimestamp(acc.meituan_last_claimed_at)}
                            </Text>
                          ) : null}
                        </div>
                      </div>

                      <Space spacing="tight">
                        <Button
                          theme="light"
                          type="warning"
                          size="small"
                          icon={<IconGift />}
                          loading={Boolean(meituanClaimingKeys[acc.key])}
                          onClick={() => handleClaimMeituanSingle(acc.key)}
                        >
                          领券
                        </Button>
                        {acc.meituan_last_claimed_details && acc.meituan_last_claimed_details.length > 0 && (
                          <Button
                            theme="borderless"
                            type="tertiary"
                            size="small"
                            onClick={() => {
                              setSelectedCouponAccount(acc);
                              setCouponModalVisible(true);
                            }}
                          >
                            明细
                          </Button>
                        )}
                      </Space>
                    </div>
                  ) : (
                    <div
                      className="bg-semi-color-fill-0 border border-dashed border-semi-color-border rounded-lg p-2 mb-3.5 flex items-center justify-between text-xs"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-2">
                        <Avatar
                          size="extra-extra-small"
                          style={{ backgroundColor: 'var(--semi-color-fill-2)', color: 'var(--semi-color-text-2)', fontSize: '10px' }}
                        >
                          美
                        </Avatar>
                        <Text type="tertiary" size="small">未绑定美团账号</Text>
                      </div>
                      <Space spacing="tight">
                        <Button
                          theme="light"
                          type="warning"
                          size="small"
                          icon={<IconQrCode />}
                          onClick={() => handleStartMeituanLogin(acc)}
                        >
                          绑定美团
                        </Button>
                      </Space>
                    </div>
                  )}

                  {/* 底部操作条 */}
                  <div
                    className="flex justify-between items-center pt-2.5 border-t border-semi-color-border"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div>
                      {isSelected ? (
                        <Tag color="blue" type="light" size="default" className="font-medium shrink-0">
                          当前主控
                        </Tag>
                      ) : (
                        <Button
                          theme="light"
                          type="primary"
                          size="small"
                          className="shrink-0"
                          onClick={() => {
                            setCurrentAccountKey(acc.key);
                            Toast.success(`已成功切换主控账号为【${acc.nickname}】`);
                          }}
                        >
                          设为主控
                        </Button>
                      )}
                    </div>

                    <Space spacing="tight">
                      {(tokenStatus.isExpired || tokenStatus.status === 'expiring') && (
                        <Button
                          theme="solid"
                          type={tokenStatus.isExpired ? "danger" : "warning"}
                          size="small"
                          icon={<IconRefresh />}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenUpdateModal(acc);
                          }}
                        >
                          {tokenStatus.isExpired ? "更新凭据" : "重新登录"}
                        </Button>
                      )}

                      <Tooltip content="配置消息推送">
                        <Button
                          theme="light"
                          type="tertiary"
                          size="small"
                          icon={<IconBell />}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenNotifyModal(acc);
                          }}
                        >
                          推送
                        </Button>
                      </Tooltip>

                      <Button
                        theme="solid"
                        type="primary"
                        size="small"
                        icon={<IconEyeOpened />}
                        onClick={() => handleOpenDetail(acc)}
                      >
                        详情
                      </Button>

                      <Tooltip content="一键同步官方资产与资料">
                        <Button
                          theme="borderless"
                          size="small"
                          icon={<IconRefresh spin={syncingKey === acc.key} />}
                          loading={syncingKey === acc.key}
                          onClick={() => handleSyncAccount(acc.key)}
                        />
                      </Tooltip>

                      <Dropdown
                        trigger="click"
                        position="topRight"
                        render={
                          <Dropdown.Menu>
                            <Dropdown.Item icon={<IconRefresh />} onClick={() => handleOpenUpdateModal(acc)}>
                              重新登录 / 覆盖凭据
                            </Dropdown.Item>
                            <Dropdown.Divider />
                            {isMeituanBound ? (
                              <>
                                <Dropdown.Item icon={<IconQrCode />} onClick={() => handleStartMeituanLogin(acc)}>
                                  重新扫码美团
                                </Dropdown.Item>
                                <Dropdown.Item icon={<IconEdit />} onClick={() => handleOpenEditMeituanName(acc)}>
                                  修改美团备注
                                </Dropdown.Item>
                                <Dropdown.Item
                                  type="danger"
                                  icon={<IconDelete />}
                                  onClick={() => {
                                    Modal.confirm({
                                      title: '确认解除美团绑定？',
                                      content: `解除后小蚕账号【${acc.nickname}】将不再自动领取美团神券，可随时重新扫码绑定。`,
                                      okText: '确认解除',
                                      cancelText: '取消',
                                      okType: 'danger',
                                      centered: true,
                                      onOk: () => handleUnbindMeituan(acc.key),
                                    });
                                  }}
                                >
                                  解除美团绑定
                                </Dropdown.Item>
                                <Dropdown.Divider />
                              </>
                            ) : null}
                            {acc.token && (
                              <Dropdown.Item icon={<IconCopy />} onClick={() => handleCopyToken(acc.token!)}>
                                复制完整 Token
                              </Dropdown.Item>
                            )}
                            <Dropdown.Item
                              type="danger"
                              icon={<IconDelete />}
                              onClick={() => {
                                Modal.confirm({
                                  title: '确定移除此账号？',
                                  content: '移除后将停止该账号名下的全部定时秒杀与店铺预约，且本地凭证将被清除。',
                                  okType: 'danger',
                                  okText: '确定移除',
                                  cancelText: '取消',
                                  centered: true,
                                  onOk: () => handleDeleteAccount(acc.key),
                                });
                              }}
                            >
                              删除小蚕账号
                            </Dropdown.Item>
                          </Dropdown.Menu>
                        }
                      >
                        <Button
                          theme="borderless"
                          size="small"
                          icon={<IconMore />}
                        />
                      </Dropdown>
                    </Space>
                  </div>
                </Card>
              </div>
            </Col>
            );
          })}

          {accounts.length === 0 && (
            <Col span={24}>
              <Card className="text-center py-16 rounded-xl border border-dashed border-semi-color-border shadow-xs">
                <Empty
                  title="暂未接入任何账号"
                  description="支持小蚕微信小程序直连绑定与美团官方 App 扫码绑定，实现全自动化日常打卡与领券！"
                >
                  <Space className="mt-4">
                    <Button
                      theme="solid"
                      type="primary"
                      icon={<IconPlus />}
                      size="large"
                      onClick={handleOpenModal}
                    >
                      添加小蚕账号
                    </Button>
                    <Button
                      theme="solid"
                      type="warning"
                      icon={<IconQrCode />}
                      size="large"
                      onClick={() => handleStartMeituanLogin()}
                    >
                      扫码绑定美团号
                    </Button>
                  </Space>
                </Empty>
              </Card>
            </Col>
          )}
        </Row>
      </div>

      {/* 账号接入模态对话框 */}

      <Modal
        title={targetUpdateAccount ? `重新登录 / 覆盖凭据 - 【${targetUpdateAccount.nickname}】` : "添加小蚕账号"}
        visible={modalVisible}
        onCancel={() => handleCloseModal(true)}
        footer={null}
        width={640}
        centered
        bodyStyle={{
          maxHeight: 'calc(80vh - 120px)',
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '16px 20px',
        }}
      >
        {targetUpdateAccount && (
          <Banner
            type="info"
            className="mb-4"
            description={
              <div>
                <div className="font-semibold text-semi-color-text-0">
                  正在为已有账号【{targetUpdateAccount.nickname}】(Silk ID: {targetUpdateAccount.silk_id || '未配置'}) 重新登录并覆盖凭据
                </div>
                <div className="text-xs text-semi-color-text-2 mt-0.5">
                  获取后将<b>直接覆盖更新该账号</b>的登录状态与有效期，历史定时任务配置与数据保持不变。
                </div>
              </div>
            }
          />
        )}
        <Tabs activeKey={activeTab} onChange={(k) => handleTabChange(String(k))}>
          {/* TAB 1: 电脑微信直连 (免配置·首选) */}
          <TabPane
            tab={
              <span className="flex items-center gap-1.5">
                <IconDesktop />
                <span>电脑微信直连</span>
              </span>
            }
            itemKey="wechat"
          >
            <Banner
              type="success"
              description="免安装证书与代理配置。在电脑微信中打开【小蚕霸王餐】小程序后，点击按钮即可一键提取并绑定。"
              className="mb-4"
            />

            <div className="bg-gradient-to-br from-semi-color-primary-light-default to-semi-color-fill-0 border border-semi-color-primary-light-active rounded-xl p-6 mb-4 shadow-sm flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-semi-color-primary flex items-center justify-center text-white mb-3 shadow-md">
                <IconDesktop size="extra-large" />
              </div>

              <div className="font-bold text-lg text-semi-color-text-0 mb-1">
                电脑微信一键直连提取
              </div>

              <div className="text-[13px] text-semi-color-text-2 max-w-[440px] mb-5 leading-relaxed">
                {targetUpdateAccount ? (
                  <>
                    步骤 1：在电脑微信小蚕小程序「我的」中<b>退出并重新微信登录</b>（获取全新 180 天凭据）<br />
                    步骤 2：点击下方按钮，系统将自动读取最新凭据并<b>覆盖更新至【{targetUpdateAccount.nickname}】</b>
                  </>
                ) : (
                  <>
                    步骤 1：在电脑微信中打开一次<b>【小蚕霸王餐】</b>小程序<br />
                    步骤 2：点击下方按钮，系统将自动读取凭据并完成托管
                  </>
                )}
              </div>

              <Space spacing="medium">
                <Button
                  theme="solid"
                  type="primary"
                  size="large"
                  icon={<IconSearch />}
                  loading={scanningWechat}
                  onClick={handleScanWechatDirect}
                  className="px-6 py-2 font-semibold"
                >
                  立即一键提取
                </Button>

                {wechatListening ? (
                  <Button
                    type="danger"
                    theme="light"
                    size="large"
                    icon={<IconStop />}
                    onClick={handleStopWechatListener}
                  >
                    停止监听 · 剩余 {listenCountdown}s
                  </Button>
                ) : (
                  <Button
                    theme="light"
                    type="tertiary"
                    size="large"
                    icon={<IconPlay />}
                    onClick={handleStartWechatListener}
                  >
                    开启自动感知等待
                  </Button>
                )}
              </Space>

              {wechatListening && (
                <div className="w-full mt-4 bg-white dark:bg-semi-color-bg-1 border border-semi-color-primary rounded-xl p-3.5 flex items-center gap-3 text-left">
                  <Spin size="middle" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-semi-color-primary text-[14px] flex items-center gap-2">
                      <span>正在实时感知微信小程序...</span>
                      <Tag color="cyan" size="small">倒计时 {listenCountdown}s</Tag>
                    </div>
                    <div className="text-[12px] text-semi-color-text-2 mt-0.5 flex items-center gap-1.5">
                      <IconChevronRight size="small" />
                      <span>请在电脑微信中打开<b>「小蚕霸王餐」</b>小程序，系统将在打开时自动完成捕获并托管。</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4 text-[12px] text-semi-color-text-3 mt-5 pt-3 border-t border-semi-color-border w-full justify-center">
                <span className="flex items-center gap-1 text-semi-color-success">
                  <IconCheckCircleStroked /> 0 网络代理
                </span>
                <span className="flex items-center gap-1 text-semi-color-success">
                  <IconCheckCircleStroked /> 0 CA 证书
                </span>
                <span className="flex items-center gap-1 text-semi-color-success">
                  <IconCheckCircleStroked /> 0 断网风险
                </span>
                <span className="flex items-center gap-1 text-semi-color-success">
                  <IconCheckCircleStroked /> 微信 4.x / 3.x 全适配
                </span>
              </div>
            </div>
          </TabPane>

          {/* TAB 2: 手动 Token 粘贴导入 */}
          <TabPane
            tab={
              <span className="flex items-center gap-1.5">
                <IconFile />
                <span>手动粘贴导入</span>
              </span>
            }
            itemKey="token"
          >
            <Banner
              type="info"
              description="支持直接粘贴抓包文本、cURL 命令、包含 x-Sivir 的请求头或 JSON，系统将自动提取凭据并验证有效性。"
              className="mb-4"
            />

            <div className="mb-4">
              <div className="font-semibold mb-1.5 text-semi-color-text-0">粘贴抓包报文或 Token：</div>
              <TextArea
                rows={4}
                value={rawText}
                onChange={(v) => setRawText(v)}
                placeholder="请粘贴抓包请求头、cURL 命令或 Token 字符串"
              />
            </div>

            {parsing && (
              <div className="flex items-center justify-center gap-2 p-3 text-semi-color-primary">
                <Spin size="small" />
                <span className="text-[13px] font-medium">正在智能解析凭据格式...</span>
              </div>
            )}

            {parsedInfo && (
              <div className="bg-semi-color-fill-0 border border-semi-color-border rounded-lg p-3.5 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge dot type={parsedInfo.is_valid ? 'success' : 'danger'} />
                  <Text strong>{parsedInfo.message}</Text>
                </div>
                <Descriptions
                  row
                  size="small"
                  data={[
                    { key: 'Silk ID', value: customSilkId || parsedInfo.silk_id || '未解析，请手动输入' },
                    { key: '凭据有效期', value: parsedInfo.exp_date }
                  ]}
                />

                <Divider className="my-2.5" />

                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Text size="small" type="secondary">Silk ID：</Text>
                      {customSilkId ? (
                        <Tag color="green" size="small">已自动捕获/解析</Tag>
                      ) : (
                        <Tag color="amber" size="small">需手动输入</Tag>
                      )}
                    </div>
                    <input
                      className="w-full h-8 rounded border border-semi-color-border px-2.5 bg-transparent text-semi-color-text-0 focus:outline-none focus:border-semi-color-primary text-[13px]"
                      value={customSilkId}
                      onChange={(e) => setCustomSilkId(e.target.value)}
                      placeholder="例如: 1334646"
                    />
                  </div>

                  <div>
                    <Text size="small" type="secondary" className="block mb-1">账号备注昵称：</Text>
                    <input
                      className="w-full h-8 rounded border border-semi-color-border px-2.5 bg-transparent text-semi-color-text-0 focus:outline-none focus:border-semi-color-primary text-[13px]"
                      value={customNickname}
                      onChange={(e) => setCustomNickname(e.target.value)}
                      placeholder="自定义账号备注名称"
                    />
                  </div>
                </div>
              </div>
            )}

            <Button
              theme="solid"
              type="primary"
              block
              size="large"
              loading={verifying}
              disabled={!parsedInfo || !parsedInfo.is_valid}
              onClick={handleSaveAccount}
            >
              验证并保存真实账号
            </Button>
          </TabPane>

          {/* TAB 3: 抓包图文指引 */}
          <TabPane
            tab={
              <span className="flex items-center gap-1.5">
                <IconHelpCircle />
                <span>抓包图文指引</span>
              </span>
            }
            itemKey="guide"
          >
            <div className="space-y-4 py-1 text-[13px] leading-relaxed">
              {/* 方式一 */}
              <div className="border border-semi-color-border rounded-xl p-4 bg-semi-color-bg-0">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-md bg-semi-color-primary-light-default flex items-center justify-center text-semi-color-primary">
                    <IconDesktop size="small" />
                  </div>
                  <Text strong className="text-[14px]">
                    方式一：电脑微信一键直连
                  </Text>
                  <Tag color="green" size="small">免抓包</Tag>
                </div>
                <Paragraph type="secondary" className="mb-2">
                  系统通过底层安全进程通信直接读取本地微信小程序的会话凭据，免装任何根证书，不修改系统代理，无断网风险。
                </Paragraph>
                <div className="bg-semi-color-fill-0 rounded-lg p-2.5 text-xs text-semi-color-text-1 space-y-1">
                  <div>1. 在电脑端微信中打开一次<b>【小蚕霸王餐】</b>小程序；</div>
                  <div>2. 返回本系统，在「电脑微信直连」标签下点击<b>「立即一键提取」</b>；</div>
                  <div>3. 提取成功后自动载入昵称、VIP等级及会员资产。</div>
                </div>
              </div>

              {/* 方式二 */}
              <div className="border border-semi-color-border rounded-xl p-4 bg-semi-color-bg-0">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-md bg-semi-color-info-light-default flex items-center justify-center text-semi-color-info">
                    <IconCode size="small" />
                  </div>
                  <Text strong className="text-[14px]">
                    方式二：电脑抓包工具提取
                  </Text>
                  <Tag color="blue" size="small">通用方案</Tag>
                </div>
                <Paragraph type="secondary" className="mb-2">
                  推荐使用 <b>Reqable</b>、<b>Fiddler Everywhere</b> 或 <b>Charles</b>。
                </Paragraph>
                <div className="bg-semi-color-fill-0 rounded-lg p-2.5 text-xs text-semi-color-text-1 space-y-1.5">
                  <div>
                    <b>1. 域名筛选：</b>在抓包工具过滤栏中输入 <code>gw.xiaocantech.com</code>
                  </div>
                  <div>
                    <b>2. 触发请求：</b>在电脑微信中打开小蚕霸王餐小程序并任意浏览店铺或点击个人中心；
                  </div>
                  <div>
                    <b>3. 复制凭证：</b>选中任意请求，在 Request Headers 中找到 <code>x-Sivir</code> 或 <code>token</code> 字段并复制完整字符串；
                  </div>
                  <div>
                    <b>4. 录入系统：</b>切换至「手动粘贴导入」标签，直接粘贴并点击保存。
                  </div>
                </div>
              </div>

              {/* 方式三 */}
              <div className="border border-semi-color-border rounded-xl p-4 bg-semi-color-bg-0">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-md bg-semi-color-warning-light-default flex items-center justify-center text-semi-color-warning">
                    <IconSmartphoneStroked size="small" />
                  </div>
                  <Text strong className="text-[14px]">
                    方式三：手机抓包工具提取
                  </Text>
                  <Tag color="amber" size="small">手机抓包</Tag>
                </div>
                <Paragraph type="secondary" className="mb-2">
                  Android 推荐使用 <b>HttpCanary</b>，iOS 推荐使用 <b>Stream</b> 或 <b>Thor</b>。
                </Paragraph>
                <div className="bg-semi-color-fill-0 rounded-lg p-2.5 text-xs text-semi-color-text-1 space-y-1">
                  <div>1. 手机启动抓包后，打开微信【小蚕霸王餐】小程序并下拉刷新；</div>
                  <div>2. 抓包历史中搜索关键字 <code>gw.xiaocantech.com</code>；</div>
                  <div>3. 复制请求头中的 <code>x-Sivir</code> 字段值，发送至电脑端粘贴导入即可。</div>
                </div>
              </div>

              {/* 凭据解析说明 */}
              <div className="border border-dashed border-semi-color-border rounded-xl p-3.5 bg-semi-color-fill-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <IconInfoCircle size="small" className="text-semi-color-primary" />
                  <Text strong className="text-xs">凭据格式与说明</Text>
                </div>
                <div className="text-xs text-semi-color-text-2 space-y-1">
                  <div>• 凭据为标准 JWT 字符串，通常具有约 30 天有效期。</div>
                  <div>• <b>Linux 服务器便捷导入</b>：支持直接粘贴整段 cURL 命令或 HTTP 原始报文，系统内置引擎将自动提取 Token 并直连官方自动补齐真实 Silk ID 与账号档案。</div>
                  <div>• <b>突破大牌券 App 端限制</b>：针对官方限制 09:30 SVIP 大牌券仅限 App 端领取的问题，系统已内置原生独立 App 协议环境（appid: 10 / X-Platform: app），默认全自动穿透风控抢领大牌券。</div>
                </div>
              </div>
            </div>
          </TabPane>
        </Tabs>
      </Modal>

      {/* 账号资产与详情抽屉 (SideSheet) */}
      <SideSheet
        title={
          <div className="flex items-center justify-between w-full pr-8">
            <div className="flex items-center gap-2">
              <span>账号详情与资产中心</span>
              {detailAccount && (
                <Tag color="blue" size="small" type="light">
                  {detailAccount.nickname}
                </Tag>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                theme="light"
                size="small"
                icon={<IconRefresh spin={detailLoading} />}
                loading={detailLoading}
                onClick={() => detailAccount && fetchAccountDetail(detailAccount.key)}
              >
                刷新数据
              </Button>
              {detailAccount && (
                <Popconfirm
                  title="确定移除此账号？"
                  content="移除后将停止该账号名下的全部定时秒杀与店铺预约，且本地凭证将被清除。"
                  okType="danger"
                  okText="确定移除"
                  cancelText="取消"
                  onConfirm={() => handleDeleteAccount(detailAccount.key)}
                >
                  <Button
                    theme="light"
                    type="danger"
                    size="small"
                    icon={<IconDelete />}
                  >
                    移除账号
                  </Button>
                </Popconfirm>
              )}
            </div>
          </div>
        }
        visible={detailVisible}
        onCancel={() => setDetailVisible(false)}
        width={620}
      >
        {detailAccount && (
          <div className="space-y-4 py-1">
            {/* 头部个人名片与会员等级 */}
            <div className="bg-semi-color-fill-0 p-4 rounded-xl border border-semi-color-border">
              <div className="flex items-start gap-3.5">
                <Avatar
                  size="large"
                  src={detailData?.user_info?.avatar || detailAccount.avatar || undefined}
                  color="orange"
                  className="shadow-sm shrink-0"
                >
                  {(detailData?.user_info?.nickname || detailAccount.nickname)?.[0] || '蚕'}
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Text strong className="text-lg text-semi-color-text-0">
                      {detailData?.user_info?.nickname || detailAccount.nickname}
                    </Text>
                    {(() => {
                      const vipInfo = detailData?.user_info?.vip_level_info;
                      const isPlus = Boolean(vipInfo ? vipInfo.is_plus : (detailData?.account?.is_plus ?? detailAccount.is_plus));
                      const currentVipLevel = vipInfo?.new_level ?? detailData?.account?.vip_level ?? detailAccount.vip_level ?? 1;
                      return (
                        <Tag color={isPlus ? "amber" : "blue"}>
                          {isPlus ? `SVIP${currentVipLevel}` : `VIP${currentVipLevel}`}
                        </Tag>
                      );
                    })()}
                    {detailAccount.key === currentAccountKey && (
                      <Tag color="blue" type="solid" size="small">主控账号</Tag>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs text-semi-color-text-2">
                    <div>Silk ID: <Text copyable className="text-xs">{detailAccount.silk_id || '—'}</Text></div>
                    <div>用户 ID: {detailAccount.user_id || detailData?.user_info?.silk_id || '—'}</div>
                    <div>绑定手机: {detailData?.user_info?.phone || detailAccount.phone || '未设置'}</div>
                    <div>实名认证: {detailData?.user_info?.real_name || detailAccount.real_name || '未设置'}</div>
                  </div>
                </div>
              </div>

              {/* VIP 成长值进度条 */}
              {detailData?.user_info?.vip_level_info && (() => {
                const vipInfo = detailData.user_info.vip_level_info;
                const isPlus = Boolean(vipInfo.is_plus);
                const currentVipLevel = vipInfo.new_level || 1;
                const maxScore = vipInfo.next_level_score || 150000;
                const curScore = vipInfo.score || 0;
                const pct = Math.min(100, Math.round((curScore / (maxScore || 1)) * 100));

                return (
                  <div className="mt-3.5 pt-3 border-t border-semi-color-border">
                    <div className="flex justify-between items-center text-xs mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <Text strong>{isPlus ? 'SVIP 会员成长值' : 'VIP 会员成长值'}</Text>
                        <Tag size="small" color={isPlus ? "orange" : "blue"}>等级 {currentVipLevel}</Tag>
                      </div>
                      <Text type="secondary">
                        {curScore.toLocaleString()} / {maxScore.toLocaleString()} 分
                      </Text>
                    </div>
                    <Progress
                      percent={pct}
                      showInfo={false}
                      stroke={isPlus ? "var(--semi-color-warning)" : "var(--semi-color-primary)"}
                    />
                    {vipInfo.expired_at ? (
                      <div className="text-[11px] text-semi-color-text-2 mt-1">
                        会员有效期至: {formatTimestamp(vipInfo.expired_at)}
                      </div>
                    ) : null}
                  </div>
                );
              })()}
            </div>

            {/* 核心资产指标看板 (4格) */}
            <div className="grid grid-cols-4 gap-2.5">
              <div className="bg-semi-color-bg-0 p-3 rounded-lg border border-semi-color-border text-center shadow-xs">
                <Text size="small" type="tertiary" className="block mb-0.5">钱包余额</Text>
                <Text strong className="text-semi-color-primary text-base">
                  ¥{(((detailData?.user_info?.silk ?? detailAccount.silk) || 0) / 100).toFixed(2)}
                </Text>
              </div>
              <div className="bg-semi-color-bg-0 p-3 rounded-lg border border-semi-color-border text-center shadow-xs">
                <Text size="small" type="tertiary" className="block mb-0.5">累计提现</Text>
                <Text strong className="text-semi-color-text-0 text-base">
                  ¥{(((detailData?.user_info?.withdraw_total ?? detailAccount.withdraw_total) || 0) / 100).toFixed(2)}
                </Text>
              </div>
              <div className="bg-semi-color-bg-0 p-3 rounded-lg border border-semi-color-border text-center shadow-xs">
                <Text size="small" type="tertiary" className="block mb-0.5">霸王餐成单</Text>
                <Text strong className="text-semi-color-success text-base">
                  {(detailData?.user_info?.completed_number ?? detailAccount.completed_number) || 0} 单
                </Text>
              </div>
              <div className="bg-semi-color-bg-0 p-3 rounded-lg border border-semi-color-border text-center shadow-xs">
                <Text size="small" type="tertiary" className="block mb-0.5">元宝总储备</Text>
                <Text strong className="text-semi-color-warning text-base">
                  {((detailData?.task_info?.yb_point ?? detailAccount.yb_point) || 0).toLocaleString()}
                </Text>
              </div>
            </div>

            {/* 选项卡面板 */}
            <Tabs
              type="line"
              activeKey={activeDetailTab}
              onChange={(k) => setActiveDetailTab(k)}
              className="mt-2"
            >
              {/* Tab 1: 霸王餐可用红包 */}
              <TabPane
                tab={
                  <span className="flex items-center gap-1.5">
                    <IconGift />
                    <span>可用红包</span>
                    {detailData?.redpack_stats?.num ? (
                      <Badge count={detailData.redpack_stats.num} overflowCount={99} type="danger" />
                    ) : null}
                  </span>
                }
                itemKey="redpacks"
              >
                <div className="py-2 flex flex-col gap-2.5">
                  <div className="flex justify-between items-center bg-semi-color-fill-0 px-3 py-2 rounded-lg text-xs text-semi-color-text-2 border border-semi-color-border">
                    <span>当前可用外卖红包共 <strong>{detailData?.redpack_stats?.num || detailData?.redpacks?.length || 0}</strong> 个</span>
                    <span>可用于抵扣或补贴霸王餐返利</span>
                  </div>

                  {detailLoading ? (
                    <div className="py-16 flex flex-col items-center justify-center">
                      <Space vertical align="center" spacing="medium">
                        <Spin size="large" />
                        <Text type="secondary" className="text-xs text-semi-color-text-2">
                          正在从官方同步红包资产...
                        </Text>
                      </Space>
                    </div>
                  ) : !detailData || !detailData.redpacks || detailData.redpacks.length === 0 ? (
                    <div className="py-10 text-center">
                      <Empty
                        title="暂无可用的霸王餐红包"
                        description="每日可通过整点红包雨、签到或任务中心获取外卖专属红包"
                      />
                    </div>
                  ) : (
                    (detailData.redpacks || []).map((item) => {
                      const amountYuan = ((item.value_num || item.reward_num || 0) / 100).toFixed(2);
                      const isExpiringSoon = item.end_time && (item.end_time * 1000 - Date.now() < 24 * 3600 * 1000);
                      const platforms = item.limit?.platform_items || item.limit?.bwc_platforms || [];

                      return (
                        <div
                          key={item.user_red_pack_id}
                          className="border border-semi-color-border rounded-semi-border-radius-medium p-3.5 bg-semi-color-bg-0 hover:border-semi-color-primary-light-active transition-all shadow-xs flex items-center gap-3.5"
                        >
                          {/* 左侧金额 */}
                          <div className="w-20 text-center shrink-0 border-r border-semi-color-border pr-2">
                            <div className="text-semi-color-danger font-bold text-xl leading-tight">
                              <span className="text-xs font-normal">¥</span>{amountYuan}
                            </div>
                            <div className="text-[11px] text-semi-color-text-2 mt-0.5">
                              {item.threshold_num ? `满${(item.threshold_num / 100).toFixed(0)}元可用` : '无门槛'}
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
                            <div className="text-xs text-semi-color-text-2 mt-1 truncate">
                              {item.info || '活动满返通用红包'}
                            </div>
                          </div>

                          {/* 右侧到期时间 */}
                          <div className="text-right shrink-0">
                            {isExpiringSoon && (
                              <Tag size="small" color="red" className="mb-1">即将失效</Tag>
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

              {/* Tab 2: 特权卡券包 */}
              <TabPane
                tab={
                  <span className="flex items-center gap-1.5">
                    <IconTicketCode />
                    <span>特权卡券</span>
                    {detailData?.card_stats?.can_use_number ? (
                      <Badge count={detailData.card_stats.can_use_number} overflowCount={99} type="warning" />
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
                      <Radio value={0}>未使用 ({detailData?.card_stats?.can_use_number || (cardFilterStatus === 0 ? (detailData?.cards?.length || 0) : 0)})</Radio>
                      <Radio value={1}>已使用</Radio>
                      <Radio value={2}>已过期</Radio>
                    </RadioGroup>

                    {Boolean(detailData?.card_stats?.expiring_soon_number) && cardFilterStatus === 0 && (
                      <Tag size="small" color="red">
                        {detailData?.card_stats?.expiring_soon_number} 张今日到期
                      </Tag>
                    )}
                  </div>

                  {cardFilterStatus === 0 && Boolean(detailData?.card_stats?.expiring_soon_number) && (
                    <Banner
                      type="warning"
                      description={`提醒：账户有 ${detailData?.card_stats?.expiring_soon_number} 张特权卡券即将在今日到期，请尽快使用！`}
                    />
                  )}

                  {detailLoading || cardsLoading ? (
                    <div className="py-16 flex flex-col items-center justify-center">
                      <Space vertical align="center" spacing="medium">
                        <Spin size="large" />
                        <Text type="secondary" className="text-xs text-semi-color-text-2">
                          正在加载特权卡券...
                        </Text>
                      </Space>
                    </div>
                  ) : !detailData || !detailData.cards || detailData.cards.length === 0 ? (
                    <div className="py-10 text-center">
                      <Empty
                        title="暂无对应状态的卡券"
                        description="特权卡券可通过会员每月礼包、SVIP秒杀或元宝商城兑换获取"
                      />
                    </div>
                  ) : (
                    stackedCards.map(({ item, count }) => {
                      const card = item.card || { name: '特权券', desc: '' };
                      return (
                        <div
                          key={`${item.id}_${count}`}
                          className="border border-semi-color-border rounded-semi-border-radius-medium p-3 bg-semi-color-bg-0 hover:border-semi-color-primary-light-active transition-all shadow-xs flex items-center gap-3.5"
                        >
                          <div className="relative shrink-0">
                            {card.pic ? (
                              <img
                                src={card.pic}
                                alt={card.name}
                                className="w-12 h-12 object-contain rounded-lg border border-semi-color-border p-1 bg-semi-color-fill-0 shrink-0"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-lg bg-semi-color-fill-1 flex items-center justify-center text-semi-color-primary shrink-0">
                                <IconTicketCode size="large" />
                              </div>
                            )}
                            {count > 1 && (
                              <span className="absolute -top-1.5 -right-1.5 bg-semi-color-primary text-white text-[11px] font-bold px-1.5 py-0.5 rounded-full shadow-xs leading-none">
                                x{count}
                              </span>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
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
                            <div className="text-xs text-semi-color-text-2 mt-1 line-clamp-2">
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

              {/* Tab 3: 账号设置与凭据 */}
              <TabPane
                tab={
                  <span className="flex items-center gap-1.5">
                    <IconUser />
                    <span>账号设置与凭据</span>
                  </span>
                }
                itemKey="profile"
              >
                {detailLoading && !detailData ? (
                  <div className="py-16 flex flex-col items-center justify-center">
                    <Space vertical align="center" spacing="medium">
                      <Spin size="large" />
                      <Text type="secondary" className="text-xs text-semi-color-text-2">
                        正在同步账号设置与凭据详情...
                      </Text>
                    </Space>
                  </div>
                ) : (
                  <div className="py-2 flex flex-col gap-4">
                    {/* 1. 账号档案与系统标识 */}
                    <Card
                      title={
                        <div className="flex items-center gap-2">
                          <IconUser className="text-semi-color-primary" />
                          <span className="font-semibold text-sm">账号档案与系统标识</span>
                        </div>
                      }
                      className="rounded-semi-border-radius-medium border border-semi-color-border shadow-xs bg-semi-color-bg-0"
                      headerStyle={{ padding: '12px 16px', borderBottom: '1px solid var(--semi-color-border)' }}
                      bodyStyle={{ padding: '16px' }}
                    >
                      <Descriptions
                        align="left"
                        data={[
                          {
                            key: '账号昵称备注',
                            value: (
                              <Space spacing="tight">
                                <Text strong>{detailAccount.nickname || '小蚕用户'}</Text>
                                {detailAccount.key === currentAccountKey && (
                                  <Tag color="blue" size="small">当前主控</Tag>
                                )}
                              </Space>
                            ),
                          },
                          {
                            key: '本地账号标识',
                            value: (
                              <Text code className="text-xs">{detailAccount.key}</Text>
                            ),
                          },
                          {
                            key: '小蚕 Silk ID',
                            value: (
                              <Space spacing="tight">
                                <Text code className="text-xs">{detailAccount.silk_id || '—'}</Text>
                                <Tag size="small" color="violet">官方唯一ID</Tag>
                              </Space>
                            ),
                          },
                          {
                            key: '绑定手机号码',
                            value: (
                              <Text className="font-mono text-xs">
                                {detailData?.user_info?.phone || detailAccount.phone || '未绑定'}
                              </Text>
                            ),
                          },
                          {
                            key: '官方注册时间',
                            value: (
                              <Text type="secondary" size="small">
                                {detailData?.user_info?.register_time ? formatTimestamp(detailData.user_info.register_time) : '—'}
                              </Text>
                            ),
                          },
                        ]}
                      />
                    </Card>

                    {/* 2. 官方认证与服务状态 */}
                    <Card
                      title={
                        <div className="flex items-center gap-2">
                          <IconShield className="text-semi-color-success" />
                          <span className="font-semibold text-sm">官方认证与服务状态</span>
                        </div>
                      }
                      className="rounded-semi-border-radius-medium border border-semi-color-border shadow-xs bg-semi-color-bg-0"
                      headerStyle={{ padding: '12px 16px', borderBottom: '1px solid var(--semi-color-border)' }}
                      bodyStyle={{ padding: '16px' }}
                    >
                      <Descriptions
                        align="left"
                        data={[
                          {
                            key: '微信公众号通知',
                            value: detailData?.user_info?.if_bind_wxid ? (
                              <Tag color="green" prefixIcon={<IconTick />} size="small">已绑定官方服务号</Tag>
                            ) : (
                              <Tag color="grey" size="small">未绑定服务号</Tag>
                            ),
                          },
                          {
                            key: '官方极速审核',
                            value: detailData?.user_info?.if_auto_audit ? (
                              <Tag color="green" prefixIcon={<IconTick />} size="small">已开通 · 极速核验</Tag>
                            ) : (
                              <Tag color="amber" size="small">未开通 · 人工审核</Tag>
                            ),
                          },
                          {
                            key: '提现支付宝账号',
                            value: detailData?.user_info?.alipay_account || detailAccount.phone ? (
                              <Space spacing="tight">
                                <Text strong className="font-mono">{detailData?.user_info?.alipay_account || detailAccount.phone}</Text>
                                <Tag color="blue" size="small">已绑定</Tag>
                              </Space>
                            ) : (
                              <Text type="tertiary">未绑定提现支付宝</Text>
                            ),
                          },
                          {
                            key: '实名认证状态',
                            value: detailData?.user_info?.real_name || detailAccount.real_name ? (
                              <Space spacing="tight">
                                <Text strong>{detailData?.user_info?.real_name || detailAccount.real_name}</Text>
                                <Tag color="green" size="small">已实名认证</Tag>
                              </Space>
                            ) : (
                              <Tag color="grey" size="small">未实名认证</Tag>
                            ),
                          },
                        ]}
                      />
                    </Card>

                    {/* 3. 官方身份鉴权凭据 */}
                    {(() => {
                      const detailTokenStatus = parseTokenExpiration(detailAccount.token, detailAccount.expires_at, detailAccount.is_token_expired);
                      return (
                        <Card
                          title={
                            <div className="flex items-center justify-between w-full">
                              <div className="flex items-center gap-2">
                                <IconKey className="text-semi-color-warning" />
                                <span className="font-semibold text-sm">小蚕网络身份凭据 (x-Sivir)</span>
                              </div>
                              <Space spacing="tight">
                                <Tag
                                  color={detailTokenStatus.color}
                                  size="small"
                                  prefixIcon={detailTokenStatus.isExpired ? <IconAlertCircle size="small" /> : <IconTick size="small" />}
                                >
                                  {detailTokenStatus.label}
                                </Tag>
                                <Tag color={detailTokenStatus.isExpired ? "red" : "cyan"} size="small">
                                  {detailTokenStatus.expireTimeStr ? `有效期至: ${detailTokenStatus.expireTimeStr}` : '长期有效'}
                                </Tag>
                              </Space>
                            </div>
                          }
                          className="rounded-semi-border-radius-medium border border-semi-color-border shadow-xs bg-semi-color-bg-0"
                          headerStyle={{ padding: '12px 16px', borderBottom: '1px solid var(--semi-color-border)' }}
                          bodyStyle={{ padding: '16px' }}
                        >
                          <div className="space-y-3">
                            {detailTokenStatus.isExpired ? (
                              <Banner
                                type="danger"
                                description={`当前凭据已于 ${detailTokenStatus.expireTimeStr} 过期！官方接口将响应 HTTP 401 鉴权失效异常。请在电脑微信打开一次「小蚕霸王餐」小程序后点击下方「更新此凭据」，或粘贴抓包 Token 进行更新。`}
                              />
                            ) : (
                              <Banner
                                type="info"
                                description="系统严格执行数据本地化安全规范，凭据仅保存在本机 SQLite 数据库中用于直连小蚕官方接口，绝不上报任何外部服务器。"
                              />
                            )}
                            <div className="space-y-1.5">
                              <div className="flex justify-between items-center text-xs">
                                <Text strong type="secondary">JWT 鉴权密文 (x-Sivir Token)：</Text>
                                <Space spacing="tight">
                                  <Button
                                    size="small"
                                    theme="solid"
                                    type={detailTokenStatus.isExpired ? "danger" : "primary"}
                                    icon={<IconRefresh />}
                                    onClick={() => {
                                      setDetailVisible(false);
                                      handleOpenUpdateModal(detailAccount);
                                    }}
                                  >
                                    更新此凭据
                                  </Button>
                                  <Button
                                    size="small"
                                    theme="light"
                                    type="primary"
                                    icon={<IconCopy />}
                                    onClick={() => handleCopyToken(detailAccount.token || '')}
                                  >
                                    复制完整 Token
                                  </Button>
                                </Space>
                              </div>
                              <Input
                                type="password"
                                mode="password"
                                value={detailAccount.token || ''}
                                readOnly
                                className="font-mono text-xs"
                              />
                            </div>
                          </div>
                        </Card>
                      );
                    })()}
                  </div>
                )}
              </TabPane>
            </Tabs>
          </div>
        )}
      </SideSheet>

      {/* 账号专属消息推送配置模态对话框 */}
      <Modal
        title={`账号专属推送配置 - 【${notifyAccount?.nickname || '未命名账号'}】`}
        visible={notifyModalVisible}
        onCancel={() => setNotifyModalVisible(false)}
        width={640}
        centered
        footer={
          <div className="flex justify-end gap-2">
            <Button
              theme="light"
              onClick={() => setNotifyModalVisible(false)}
            >
              取消
            </Button>
            <Button
              theme="solid"
              type="primary"
              loading={notifySaving}
              onClick={handleSaveNotifyConfig}
            >
              保存配置
            </Button>
          </div>
        }
      >
        {notifyLoading ? (
          <div className="py-16 flex flex-col items-center justify-center">
            <Spin tip="正在读取账号推送配置..." />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <Banner
              type="info"
              description="在公司电脑或多用户共享部署环境下，为各小蚕账号独立配置专属通道后，抢单成功、中签等消息将定向推送给账号责任人，互不打扰。"
            />

            <div>
              <Text strong className="block mb-2 text-sm text-semi-color-text-0">
                推送派发模式
              </Text>
              <RadioGroup
                type="card"
                direction="vertical"
                value={notifyMode}
                onChange={(e) => setNotifyMode(e.target.value as AccountNotifyMode)}
                className="w-full space-y-2"
              >
                <Radio
                  value="global"
                  extra="使用系统全局设置中统一配置的默认通道，所有账号消息统一广播。"
                >
                  <div className="font-medium text-sm text-semi-color-text-0">跟随系统全局设置</div>
                </Radio>
                <Radio
                  value="custom"
                  extra="为该账号绑定独立的个人通道，中签、抢单、免单券变动等仅向本人定向派发。"
                >
                  <div className="font-medium text-sm text-semi-color-text-0">绑定个人专属独立通道</div>
                </Radio>
                <Radio
                  value="disabled"
                  extra="此账号完全静音，发生抢单或中签时不触发任何外部推送打扰。"
                >
                  <div className="font-medium text-sm text-semi-color-text-0">静音免打扰模式</div>
                </Radio>
              </RadioGroup>
            </div>

            {notifyMode === 'custom' && (
              <Card
                bordered
                header={
                  <div className="flex items-center justify-between w-full">
                    <Text strong className="text-sm text-semi-color-text-0">专属通道类型</Text>
                    <Select
                      value={notifyChannel}
                      onChange={(val) => setNotifyChannel(val as string)}
                      style={{ width: 260 }}
                    >
                      <Select.OptGroup label="微信生态直推">
                        <Select.Option value="clawbot">微信官方 ClawBot (iLink)</Select.Option>
                        <Select.Option value="serverchan">Server酱 (Turbo / 3)</Select.Option>
                        <Select.Option value="wxpusher">WxPusher 微信推送</Select.Option>
                      </Select.OptGroup>
                      <Select.OptGroup label="办公协同机器人">
                        <Select.Option value="wecom">企业微信群机器人</Select.Option>
                        <Select.Option value="dingtalk">钉钉群机器人</Select.Option>
                        <Select.Option value="feishu">飞书群机器人</Select.Option>
                      </Select.OptGroup>
                      <Select.OptGroup label="移动与极客推送">
                        <Select.Option value="bark">iOS Bark 推送</Select.Option>
                        <Select.Option value="telegram">Telegram Bot</Select.Option>
                        <Select.Option value="gotify">Gotify 自建推送</Select.Option>
                        <Select.Option value="discord">Discord 频道 Webhook</Select.Option>
                        <Select.Option value="qq_bot">QQ 机器人 (OneBot V11)</Select.Option>
                      </Select.OptGroup>
                      <Select.OptGroup label="通用服务与基础设施">
                        <Select.Option value="webhook">通用自定义 Webhook</Select.Option>
                        <Select.Option value="email">SMTP 邮件服务</Select.Option>
                      </Select.OptGroup>
                    </Select>
                  </div>
                }
                headerStyle={{ padding: '12px 16px', borderBottom: 'none' }}
                bodyStyle={{ padding: '0 16px 16px' }}
                style={{ backgroundColor: 'var(--semi-color-fill-0)', borderRadius: 'var(--semi-border-radius-medium)' }}
              >

                {/* 1. 微信官方 ClawBot (首选·最高权重) */}
                {notifyChannel === 'clawbot' && (
                  <div className="space-y-3">
                    <div className="p-3 bg-semi-color-primary-light-default/20 rounded-lg border border-semi-color-primary-light-active">
                      <div className="flex items-center justify-between">
                        <Text strong className="text-xs text-semi-color-primary">
                          系统微信通道状态：
                          {systemClawbotStatus?.ready ? (
                            <span className="text-semi-color-success ml-1">
                              [已就绪] 微信用户: {systemClawbotStatus.user_id || '已授权'}
                            </span>
                          ) : (
                            <span className="text-semi-color-text-2 ml-1">[未检测到全局登录] 可在下方配置个人凭证或系统设置扫码</span>
                          )}
                        </Text>
                      </div>
                      <Text size="small" type="tertiary" className="block mt-1">
                        默认模式：若与系统全局配置微信相同，留空即可复用。
                      </Text>
                    </div>

                    <div className="space-y-1">
                      <Text strong className="text-xs">个人独立微信凭证路径（选填）：</Text>
                      <Input
                        placeholder="留空则自动复用系统微信，或填写个人 clawbot-auth.json 绝对路径"
                        value={notifyConfig.clawbot_auth_path || ''}
                        onChange={(val) => setNotifyConfig({ ...notifyConfig, clawbot_auth_path: val })}
                      />
                    </div>

                    <div className="space-y-1">
                      <Text strong className="text-xs">或直接粘贴凭证 JSON 密文（选填）：</Text>
                      <TextArea
                        placeholder='例如: {"token": "...", "userId": "..."}'
                        rows={2}
                        value={notifyConfig.clawbot_auth_json || ''}
                        onChange={(val) => setNotifyConfig({ ...notifyConfig, clawbot_auth_json: val })}
                      />
                    </div>
                    <Text type="tertiary" size="small">
                      权重说明：微信官方 ClawBot 享有最高分发权重，经腾讯官方 iLink 平台推送至微信服务号，不折叠且支持即时通知。
                    </Text>
                  </div>
                )}

                {/* 2. Server酱 */}
                {notifyChannel === 'serverchan' && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Text strong className="text-xs">Server酱 SendKey：</Text>
                      <Input
                        placeholder="例如: SCTxxxxxxxxxxxxxxxx 或 s3.key"
                        value={notifyConfig.serverchan_sendkey || ''}
                        onChange={(val) => setNotifyConfig({ ...notifyConfig, serverchan_sendkey: val })}
                      />
                    </div>
                    <Text type="tertiary" size="small">
                      前往 sct.ftqq.com 微信扫码登入即可获取专属 SendKey，支持免微信登录长效接收。
                    </Text>
                  </div>
                )}

                {/* 3. WxPusher */}
                {notifyChannel === 'wxpusher' && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Text strong className="text-xs">WxPusher AppToken：</Text>
                      <Input
                        placeholder="AT_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        value={notifyConfig.wxpusher_app_token || ''}
                        onChange={(val) => setNotifyConfig({ ...notifyConfig, wxpusher_app_token: val })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Text strong className="text-xs">接收人 UID（单个或英文逗号隔开）：</Text>
                      <Input
                        placeholder="UID_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        value={notifyConfig.wxpusher_uids || ''}
                        onChange={(val) => setNotifyConfig({ ...notifyConfig, wxpusher_uids: val })}
                      />
                    </div>
                    <Text type="tertiary" size="small">
                      前往 wxpusher.zjiecode.com 创建应用并扫码关注获取用户专属 UID。
                    </Text>
                  </div>
                )}

                {/* 4. 企业微信 */}
                {notifyChannel === 'wecom' && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Text strong className="text-xs">企业微信 Webhook 地址：</Text>
                    </div>
                    <Input
                      placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxx"
                      value={notifyConfig.wecom_webhook || ''}
                      onChange={(val) => setNotifyConfig({ ...notifyConfig, wecom_webhook: val })}
                    />
                    <Text type="tertiary" size="small">
                      支持将个人测试群或内部专属群的企业微信机器人 Webhook 填入此处。
                    </Text>
                  </div>
                )}

                {/* 5. 钉钉 */}
                {notifyChannel === 'dingtalk' && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Text strong className="text-xs">钉钉自定义机器人 Webhook 地址：</Text>
                      <Input
                        placeholder="https://oapi.dingtalk.com/robot/send?access_token=xxxx"
                        value={notifyConfig.dingtalk_webhook || ''}
                        onChange={(val) => setNotifyConfig({ ...notifyConfig, dingtalk_webhook: val })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Text strong className="text-xs">加签安全密钥 Secret（选填）：</Text>
                      <Input
                        placeholder="SECxxxx"
                        value={notifyConfig.dingtalk_secret || ''}
                        onChange={(val) => setNotifyConfig({ ...notifyConfig, dingtalk_secret: val })}
                      />
                    </div>
                    <Text type="tertiary" size="small">
                      若钉钉机器人勾选了「加签」，请填写对应 Secret，系统将自动使用 HMAC-SHA256 计算签名。
                    </Text>
                  </div>
                )}

                {/* 6. 飞书 */}
                {notifyChannel === 'feishu' && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Text strong className="text-xs">飞书自定义机器人 Webhook 地址：</Text>
                      <Input
                        placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/xxxx"
                        value={notifyConfig.feishu_webhook || ''}
                        onChange={(val) => setNotifyConfig({ ...notifyConfig, feishu_webhook: val })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Text strong className="text-xs">签名校验 Secret（选填）：</Text>
                      <Input
                        placeholder="若机器人勾选了安全设置签名校验则填写"
                        value={notifyConfig.feishu_secret || ''}
                        onChange={(val) => setNotifyConfig({ ...notifyConfig, feishu_secret: val })}
                      />
                    </div>
                    <Text type="tertiary" size="small">
                      飞书群设置 - 群机器人 - 添加自定义机器人，将获取到的 Webhook 填入此处。
                    </Text>
                  </div>
                )}

                {/* 7. Bark */}
                {notifyChannel === 'bark' && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Text strong className="text-xs">Bark Key 或完整推送 URL：</Text>
                      <Input
                        placeholder="例如: 2b8fxxxx 或 https://api.day.app/2b8fxxxx"
                        value={notifyConfig.bark_url || ''}
                        onChange={(val) => setNotifyConfig({ ...notifyConfig, bark_url: val })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Text strong className="text-xs">推送铃声（选填）：</Text>
                        <Input
                          placeholder="例如: bell, alarm"
                          value={notifyConfig.bark_sound || ''}
                          onChange={(val) => setNotifyConfig({ ...notifyConfig, bark_sound: val })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Text strong className="text-xs">消息分组（选填）：</Text>
                        <Input
                          placeholder="小蚕小帮手"
                          value={notifyConfig.bark_group || ''}
                          onChange={(val) => setNotifyConfig({ ...notifyConfig, bark_group: val })}
                        />
                      </div>
                    </div>
                    <Text type="tertiary" size="small">
                      支持 iOS Bark App，输入个人设备 Key 或自建 Bark 服务的完整 URL。
                    </Text>
                  </div>
                )}

                {/* 8. Telegram */}
                {notifyChannel === 'telegram' && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Text strong className="text-xs">Telegram Bot Token：</Text>
                      <Input
                        placeholder="例如: 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                        value={notifyConfig.tg_bot_token || ''}
                        onChange={(val) => setNotifyConfig({ ...notifyConfig, tg_bot_token: val })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Text strong className="text-xs">Telegram 个人/群组 Chat ID：</Text>
                      <Input
                        placeholder="例如: 987654321 或 -100123456789"
                        value={notifyConfig.tg_chat_id || ''}
                        onChange={(val) => setNotifyConfig({ ...notifyConfig, tg_chat_id: val })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Text strong className="text-xs">本地网络代理地址（选填）：</Text>
                        <Input
                          placeholder="http://127.0.0.1:7890"
                          value={notifyConfig.tg_proxy_url || ''}
                          onChange={(val) => setNotifyConfig({ ...notifyConfig, tg_proxy_url: val })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Text strong className="text-xs">自定义 API 基础网关（选填）：</Text>
                        <Input
                          placeholder="https://api.telegram.org"
                          value={notifyConfig.tg_api_base_url || ''}
                          onChange={(val) => setNotifyConfig({ ...notifyConfig, tg_api_base_url: val })}
                        />
                      </div>
                    </div>
                    <Text type="tertiary" size="small">
                      国内环境使用 Telegram 建议配置本地代理（如 Clash/V2Ray）或自建反代网关。
                    </Text>
                  </div>
                )}

                {/* 9. 通用自定义 Webhook */}
                {notifyChannel === 'webhook' && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Text strong className="text-xs">Webhook URL 地址：</Text>
                      <Input
                        placeholder="https://your-service.com/api/notify"
                        value={notifyConfig.webhook_url || ''}
                        onChange={(val) => setNotifyConfig({ ...notifyConfig, webhook_url: val })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Text strong className="text-xs">HTTP 请求方法：</Text>
                        <Select
                          value={notifyConfig.webhook_method || 'POST'}
                          onChange={(val) => setNotifyConfig({ ...notifyConfig, webhook_method: val as string })}
                          style={{ width: '100%' }}
                        >
                          <Select.Option value="POST">POST (标准 JSON 载荷)</Select.Option>
                          <Select.Option value="GET">GET (查询参数拼接)</Select.Option>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Text strong className="text-xs">自定义 Headers（选填 JSON）：</Text>
                        <Input
                          placeholder='{"Authorization": "Bearer xxx"}'
                          value={notifyConfig.webhook_headers || ''}
                          onChange={(val) => setNotifyConfig({ ...notifyConfig, webhook_headers: val })}
                        />
                      </div>
                    </div>
                    <Text type="tertiary" size="small">
                      系统将以标准 JSON 结构传递 title, content, level, event 等字段。
                    </Text>
                  </div>
                )}

                {/* 10. SMTP 邮件服务 */}
                {notifyChannel === 'email' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2 space-y-1">
                        <Text strong className="text-xs">SMTP 服务器地址：</Text>
                        <Input
                          placeholder="例如: smtp.qq.com"
                          value={notifyConfig.email_host || ''}
                          onChange={(val) => setNotifyConfig({ ...notifyConfig, email_host: val })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Text strong className="text-xs">服务端口：</Text>
                        <InputNumber
                          value={notifyConfig.email_port || 465}
                          onChange={(val) => setNotifyConfig({ ...notifyConfig, email_port: Number(val) })}
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Text strong className="text-xs">发件人账号/邮箱：</Text>
                        <Input
                          placeholder="your-email@qq.com"
                          value={notifyConfig.email_user || ''}
                          onChange={(val) => setNotifyConfig({ ...notifyConfig, email_user: val })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Text strong className="text-xs">授权码 / SMTP 密码：</Text>
                        <Input
                          type="password"
                          placeholder="QQ/163 邮箱客户端授权码"
                          value={notifyConfig.email_pass || ''}
                          onChange={(val) => setNotifyConfig({ ...notifyConfig, email_pass: val })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 items-center">
                      <div className="space-y-1">
                        <Text strong className="text-xs">接收人邮箱：</Text>
                        <Input
                          placeholder="recipient@domain.com"
                          value={notifyConfig.email_to || ''}
                          onChange={(val) => setNotifyConfig({ ...notifyConfig, email_to: val })}
                        />
                      </div>
                      <div className="pt-4">
                        <Checkbox
                          checked={notifyConfig.email_ssl ?? true}
                          onChange={(e) => setNotifyConfig({ ...notifyConfig, email_ssl: e.target.checked })}
                        >
                          启用 SSL 安全连接 (推荐端口 465)
                        </Checkbox>
                      </div>
                    </div>
                  </div>
                )}

                {/* 11. Gotify */}
                {notifyChannel === 'gotify' && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Text strong className="text-xs">Gotify 根服务地址：</Text>
                      <Input
                        placeholder="例如: https://gotify.yourdomain.com"
                        value={notifyConfig.gotify_url || ''}
                        onChange={(val) => setNotifyConfig({ ...notifyConfig, gotify_url: val })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Text strong className="text-xs">App Token：</Text>
                        <Input
                          placeholder="Axxxxxxxxxxxxxx"
                          value={notifyConfig.gotify_token || ''}
                          onChange={(val) => setNotifyConfig({ ...notifyConfig, gotify_token: val })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Text strong className="text-xs">消息优先级 (1-10)：</Text>
                        <InputNumber
                          min={1}
                          max={10}
                          value={notifyConfig.gotify_priority || 5}
                          onChange={(val) => setNotifyConfig({ ...notifyConfig, gotify_priority: Number(val) })}
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 12. Discord */}
                {notifyChannel === 'discord' && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Text strong className="text-xs">Discord Webhook 地址：</Text>
                      <Input
                        placeholder="https://discord.com/api/webhooks/xxxx/yyyy"
                        value={notifyConfig.discord_webhook || ''}
                        onChange={(val) => setNotifyConfig({ ...notifyConfig, discord_webhook: val })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Text strong className="text-xs">自定义机器人显示名称（选填）：</Text>
                      <Input
                        placeholder="小蚕小帮手"
                        value={notifyConfig.discord_username || ''}
                        onChange={(val) => setNotifyConfig({ ...notifyConfig, discord_username: val })}
                      />
                    </div>
                  </div>
                )}

                {/* 13. QQ 机器人 */}
                {notifyChannel === 'qq_bot' && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Text strong className="text-xs">OneBot HTTP API 根地址：</Text>
                      <Input
                        placeholder="例如: http://127.0.0.1:5700"
                        value={notifyConfig.qq_bot_api || ''}
                        onChange={(val) => setNotifyConfig({ ...notifyConfig, qq_bot_api: val })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Text strong className="text-xs">接收人 QQ 号：</Text>
                        <Input
                          placeholder="例如: 10001"
                          value={notifyConfig.qq_bot_user_id || ''}
                          onChange={(val) => setNotifyConfig({ ...notifyConfig, qq_bot_user_id: val })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Text strong className="text-xs">接收群号（选填）：</Text>
                        <Input
                          placeholder="例如: 954658571"
                          value={(notifyConfig as any).qq_bot_group_id || ''}
                          onChange={(val) => setNotifyConfig({ ...notifyConfig, qq_bot_group_id: val } as any)}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Text strong className="text-xs">API 访问 Token（选填）：</Text>
                      <Input
                        placeholder="若 OneBot 服务端开启了 Authorization 则填写"
                        value={notifyConfig.qq_bot_token || ''}
                        onChange={(val) => setNotifyConfig({ ...notifyConfig, qq_bot_token: val })}
                      />
                    </div>
                  </div>
                )}

                <div className="flex justify-end pt-1">
                  <Button
                    theme="light"
                    icon={<IconSend />}
                    loading={notifyTesting}
                    onClick={handleTestNotify}
                  >
                    测试此通道连通性
                  </Button>
                </div>
              </Card>
            )}
          </div>
        )}
      </Modal>

      {/* 美团官方扫码登录 Modal */}
      <Modal
        title={targetBindAccount ? `绑定美团账号 - ${targetBindAccount.nickname}` : '扫码绑定美团账号'}
        visible={meituanLoginModalVisible}
        onCancel={handleCancelMeituanLogin}
        footer={null}
        width={420}
        centered
      >
        <div className="flex flex-col items-center py-2 text-center">
          {targetBindAccount && (
            <div className="w-full mb-3 text-left bg-semi-color-fill-0 border border-semi-color-border rounded-lg p-2.5 flex items-center">
              <div className="flex items-center gap-2">
                <Avatar size="extra-extra-small" style={{ backgroundColor: '#ffc300', color: '#222', fontSize: '10px', fontWeight: 600 }}>美</Avatar>
                <Text size="small">
                  正在为账号【<Text strong>{targetBindAccount.nickname}</Text>】绑定美团
                </Text>
              </div>
            </div>
          )}

          {meituanAuthStatus === 'pending' && (
            <Banner
              fullMode={false}
              type="info"
              bordered
              description="请打开手机美团 App【扫一扫】扫描下方二维码，并在手机上点击授权登录。授权成功后将自动关闭此窗口。"
              style={{ textAlign: 'left', width: '100%' }}
              className="mb-3"
            />
          )}

          {meituanAuthStatus === 'loading' && (
            <div className="py-12 flex flex-col items-center gap-3">
              <Spin size="large" />
              <Text type="secondary">正在向美团申请授权链接与二维码...</Text>
            </div>
          )}

          {meituanAuthStatus === 'pending' && (
            <div className="flex flex-col items-center w-full">
              {meituanQrCode ? (
                <div className="p-3 bg-white rounded-2xl shadow-xs border border-semi-color-border mb-3">
                  <img
                    src={meituanQrCode}
                    alt="美团登录授权二维码"
                    style={{ width: 220, height: 220, display: 'block' }}
                  />
                </div>
              ) : (
                <div className="w-56 h-56 flex items-center justify-center bg-semi-color-fill-0 rounded-2xl mb-3">
                  <Spin />
                </div>
              )}
              <div className="flex items-center gap-1.5 text-xs text-semi-color-text-2">
                <Spin size="small" />
                <Text strong style={{ color: 'var(--semi-color-primary)' }}>
                  等待美团 App 确认授权中...
                </Text>
              </div>
            </div>
          )}

          {meituanAuthStatus === 'expired' && (
            <div className="py-8 flex flex-col items-center gap-3">
              <IconAlertCircle style={{ fontSize: 48, color: 'var(--semi-color-warning)' }} />
              <Text strong>二维码已过期</Text>
              <Text type="tertiary" className="text-xs mb-2">二维码有效时间约为2分钟，请重新获取最新二维码扫码</Text>
              <Button theme="solid" type="primary" icon={<IconRefresh />} onClick={() => handleStartMeituanLogin(targetBindAccount || undefined)}>
                重新获取二维码
              </Button>
            </div>
          )}

          {meituanAuthStatus === 'failed' && (
            <div className="py-8 flex flex-col items-center gap-3">
              <IconAlertCircle style={{ fontSize: 48, color: 'var(--semi-color-danger)' }} />
              <Text strong>授权未成功</Text>
              <Text type="tertiary" className="text-xs mb-2">{meituanAuthMessage || '未检测到有效授权结果'}</Text>
              <Button theme="solid" type="primary" icon={<IconRefresh />} onClick={() => handleStartMeituanLogin(targetBindAccount || undefined)}>
                重新尝试
              </Button>
            </div>
          )}

          {meituanAuthStatus === 'success' && (
            <div className="py-8 flex flex-col items-center gap-3">
              <IconCheckCircleStroked style={{ fontSize: 48, color: 'var(--semi-color-success)' }} />
              <Text strong style={{ fontSize: 16 }}>授权成功！</Text>
              <Text type="secondary" className="text-xs">
                {targetBindAccount ? `账号【${targetBindAccount.nickname}】美团已成功关联并激活，窗口即将自动关闭...` : '美团账号已成功关联并激活，窗口即将自动关闭...'}
              </Text>
            </div>
          )}
        </div>
      </Modal>

      {/* 美团优惠券明细 Modal */}
      <Modal
        title={`美团领券明细 - ${selectedCouponAccount?.nickname || ''}`}
        visible={couponModalVisible}
        onCancel={() => setCouponModalVisible(false)}
        footer={
          <Button theme="solid" type="primary" onClick={() => setCouponModalVisible(false)}>
            确认
          </Button>
        }
        width={560}
        centered
      >
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          {(() => {
            const list = selectedCouponAccount?.meituan_last_claimed_details || selectedCouponAccount?.last_claimed_details || [];
            if (!list || list.length === 0) {
              return <Empty title="暂无优惠券明细" description="该账号尚未记录领券明细或今日领券未返回具体明细。" />;
            }
            return (
              <div className="space-y-2">
                {list.map((c, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-semi-color-fill-0 rounded-lg border border-semi-color-border flex items-center justify-between"
                  >
                    <div className="min-w-0 pr-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Tag color="orange" size="small">{c.tabName || '优惠券'}</Tag>
                        <Text strong className="text-sm truncate">{c.name || (c as any).couponName}</Text>
                      </div>
                      <Text type="tertiary" className="text-xs">{c.valid_period || (c as any).validPeriod || '在有效期内'}</Text>
                    </div>
                    <div className="shrink-0 text-right">
                      <Text strong style={{ color: 'var(--semi-color-danger)', fontSize: 14 }}>
                        {c.discount_info || (c as any).discountDesc}
                      </Text>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </Modal>

      {/* 修改美团备注名称 Modal */}
      <Modal
        title={`修改美团账号备注 - ${editingMeituanAccount?.nickname || ''}`}
        visible={editMeituanModalVisible}
        onCancel={() => setEditMeituanModalVisible(false)}
        onOk={handleSaveMeituanNickname}
        confirmLoading={savingMeituanNickname}
        okText="保存"
        cancelText="取消"
        width={400}
        centered
      >
        <div className="py-2">
          <Text size="small" type="secondary" className="mb-2 block">
            请输入美团账号名称：
          </Text>
          <Input
            value={newMeituanNickname}
            onChange={(val) => setNewMeituanNickname(val)}
            placeholder="例如：我的美团号 / 张三"
            autoFocus
          />
        </div>
      </Modal>

    </div>
  );
};
