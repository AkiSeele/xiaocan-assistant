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
  Select
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
  IconBell
} from '@douyinfe/semi-icons';
import { useAppStore } from '../store/useAppStore';
import { api } from '../api';
import { useOnActivated } from '../utils/useOnActivated';
import type { Account, AccountDetailData, AccountNotifyConfig, AccountNotifyMode, ClawBotStatus } from '../types';

const { Title, Text, Paragraph } = Typography;

export const Accounts: React.FC = () => {
  const accounts = useAppStore((s) => s.accounts);
  const loadAccounts = useAppStore((s) => s.loadAccounts);
  const loadUserInfo = useAppStore((s) => s.loadUserInfo);
  const currentAccountKey = useAppStore((s) => s.currentAccountKey);
  const setCurrentAccountKey = useAppStore((s) => s.setCurrentAccountKey);
  const accountsRef = useRef<HTMLDivElement>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('sniffer');

  // 页面切入激活时自动拉取最新账号列表与用户信息
  useOnActivated('accounts', () => {
    loadAccounts();
    loadUserInfo();
  }, { throttleMs: 3000 });

  useGSAP(
    () => {
      if (accountsRef.current && accounts.length > 0) {
        gsap.fromTo(
          '.gsap-account-card',
          { opacity: 0 },
          {
            opacity: 1,
            duration: 0.16,
            stagger: 0.02,
            ease: 'power1.out',
            clearProps: 'all'
          }
        );
      }
    },
    { scope: accountsRef, dependencies: [accounts.length] }
  );

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
        Toast.success(res.message || '账号专属推送配置保存成功！');
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
        Toast.success(res.message || '测试消息发送成功，请前往对应客户端查收！');
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
        Toast.success(res.message || '账号资产与官方档案已成功同步！');
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
    setModalVisible(true);
    setActiveTab('wechat');
    setRawText('');
    setParsedInfo(null);
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
            nickname: res.nickname || '小蚕微信用户'
          });
          setCustomNickname(res.nickname || '小蚕微信用户');
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
        silk_id: parsedInfo.silk_id,
        nickname: (customNickname || '').trim() || parsedInfo.nickname,
        avatar: '',
        vip_level: 5,
        token: parsedInfo.token,
        expires_at: parsedInfo.exp_date
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
        Toast.info('自动感知已开启！请在电脑微信中点击进入【小蚕霸王餐】小程序');

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
      await loadAccounts();
    } catch (e) {
      Toast.error('移除账号失败');
    }
  };

  // 复制 Token
  const handleCopyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    Toast.success('Token 已复制到剪贴板');
  };

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-5">
        <div>
          <Title heading={3}>账号管理</Title>
          <Text type="secondary">多账号安全托管中心 · 电脑微信一键直连 · 自动同步官方等级</Text>
        </div>
        <Space>
          <Button
            theme="light"
            icon={<IconRefresh />}
            onClick={async () => {
              await loadAccounts();
              Toast.success('已刷新账号列表');
            }}
          >
            刷新列表
          </Button>
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

      <div ref={accountsRef}>
        <Row gutter={[16, 16]}>
          {accounts.map((acc: Account) => {
            const isSelected = acc.key === currentAccountKey;
            return (
              <Col xs={24} sm={12} lg={8} key={acc.key}>
                <div onClick={() => handleOpenDetail(acc)} className="h-full">
                  <Card
                    shadows="hover"
                    className={`gsap-account-card rounded-xl transition-colors duration-150 relative overflow-hidden border cursor-pointer ${
                      isSelected
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
                      <Tag color="green" size="small">在线</Tag>
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
                      <div className="flex items-center gap-1.5 mt-0.5 text-xs text-semi-color-text-2">
                        <span>Silk ID: {acc.silk_id || '—'}</span>
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
                  <div className="flex items-center justify-between text-xs text-semi-color-text-2 mb-3.5 px-0.5">
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

                  {/* 底部操作条 */}
                  <div
                    className="flex justify-between items-center pt-2.5 border-t border-semi-color-border"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div>
                      {isSelected ? (
                        <Tag color="blue" type="light" size="default" className="font-medium">
                          当前主控账号
                        </Tag>
                      ) : (
                        <Button
                          theme="light"
                          type="primary"
                          size="small"
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
                      <Tooltip content="配置该账号专属消息推送 (企业微信/飞书/钉钉/Bark/QQ等)">
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

                      {acc.token && (
                        <Tooltip content="复制完整 Token">
                          <Button
                            theme="borderless"
                            size="small"
                            icon={<IconCopy />}
                            onClick={() => handleCopyToken(acc.token!)}
                          />
                        </Tooltip>
                      )}

                      <Popconfirm
                        title="确定移除此账号？"
                        content="移除后将停止该账号名下的全部定时秒杀与店铺预约，且本地凭证将被清除。"
                        okType="danger"
                        okText="确定移除"
                        cancelText="取消"
                        onConfirm={() => handleDeleteAccount(acc.key)}
                      >
                        <Tooltip content="删除账号">
                          <Button
                            theme="borderless"
                            type="danger"
                            size="small"
                            icon={<IconDelete />}
                          />
                        </Tooltip>
                      </Popconfirm>
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
                  title="暂未接入小蚕账号"
                  description="电脑端打开微信【小蚕霸王餐】小程序后，即可一键直连提取凭据并完成托管绑定。"
                >
                  <Button
                    theme="solid"
                    type="primary"
                    icon={<IconPlus />}
                    size="large"
                    onClick={handleOpenModal}
                    className="mt-4"
                  >
                    添加小蚕账号
                  </Button>
                </Empty>
              </Card>
            </Col>
          )}
        </Row>
      </div>

      {/* 账号接入模态对话框 */}

      <Modal
        title="添加小蚕账号"
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
                步骤 1：在电脑微信中打开一次<b>【小蚕霸王餐】</b>小程序<br />
                步骤 2：点击下方按钮，系统将自动读取凭据并完成托管
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
                    停止监听 (剩余 {listenCountdown}s)
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
                placeholder="请粘贴抓包获取的原始请求头、cURL 命令或 JWT Token 字符串（例如包含 x-Sivir 或 x-vayne 的内容）..."
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
                    { key: 'Silk ID', value: parsedInfo.silk_id || '未能解析' },
                    { key: '凭据有效期', value: parsedInfo.exp_date }
                  ]}
                />

                <Divider className="my-2.5" />

                <div>
                  <Text size="small" type="secondary">账号备注昵称：</Text>
                  <input
                    className="w-full mt-1 h-8 rounded border border-semi-color-border px-2 bg-transparent text-semi-color-text-0 focus:outline-none focus:border-semi-color-primary"
                    value={customNickname}
                    onChange={(e) => setCustomNickname(e.target.value)}
                    placeholder="自定义账号备注名称"
                  />
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
                    方式一：电脑微信一键直连（首选推荐）
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
                    方式二：电脑抓包工具提取（进阶 / 手动）
                  </Text>
                  <Tag color="blue" size="small">通用方案</Tag>
                </div>
                <Paragraph type="secondary" className="mb-2">
                  推荐使用 <b>Reqable</b>（轻量高效）、<b>Fiddler Everywhere</b> 或 <b>Charles</b>。
                </Paragraph>
                <div className="bg-semi-color-fill-0 rounded-lg p-2.5 text-xs text-semi-color-text-1 space-y-1.5">
                  <div>
                    <b>1. 域名筛选：</b>在抓包工具过滤栏中输入 <code>gw.xiaocantech.com</code>
                  </div>
                  <div>
                    <b>2. 触发请求：</b>在电脑微信中打开小蚕霸王餐小程序并任意浏览店铺或点击个人中心；
                  </div>
                  <div>
                    <b>3. 复制凭证：</b>选中任意请求，在 Request Headers（请求头）中找到 <code>x-Sivir</code> 或 <code>token</code> 字段并复制完整字符串；
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
                    方式三：手机抓包工具提取（移动端）
                  </Text>
                  <Tag color="amber" size="small">手机抓包</Tag>
                </div>
                <Paragraph type="secondary" className="mb-2">
                  Android 推荐使用 <b>HttpCanary</b>（小黄鸟），iOS 推荐使用 <b>Stream</b> 或 <b>Thor</b>。
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
                  <div>• 凭据为标准的 JWT 字符串（以 <code>eyJhbGciOi...</code> 开头），通常具有约 30 天有效期。</div>
                  <div>• 支持直接粘贴整段 cURL 命令或 HTTP 原始报文，系统内置正则引擎将自动提取并校验。</div>
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
              <IconTicketCode className="text-semi-color-primary" />
              <span>账号详情与资产中心</span>
              {detailAccount && (
                <Tag color="blue" size="small" type="light">
                  {detailAccount.nickname}
                </Tag>
              )}
            </div>
            <Button
              theme="light"
              size="small"
              icon={<IconRefresh spin={detailLoading} />}
              loading={detailLoading}
              onClick={() => detailAccount && fetchAccountDetail(detailAccount.key)}
            >
              刷新数据
            </Button>
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
                            key: '系统识别 Key',
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
                              <Tag color="green" prefixIcon={<IconTick />} size="small">已开通 (秒级极速核验)</Tag>
                            ) : (
                              <Tag color="amber" size="small">未开通 (人工审核)</Tag>
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
                    <Card
                      title={
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-2">
                            <IconKey className="text-semi-color-warning" />
                            <span className="font-semibold text-sm">小蚕网络身份凭据 (x-Sivir)</span>
                          </div>
                          <Tag color={detailAccount.expires_at ? "cyan" : "green"} size="small">
                            {detailAccount.expires_at ? `有效期至: ${detailAccount.expires_at}` : '长期有效'}
                          </Tag>
                        </div>
                      }
                      className="rounded-semi-border-radius-medium border border-semi-color-border shadow-xs bg-semi-color-bg-0"
                      headerStyle={{ padding: '12px 16px', borderBottom: '1px solid var(--semi-color-border)' }}
                      bodyStyle={{ padding: '16px' }}
                    >
                      <div className="space-y-3">
                        <Banner
                          type="info"
                          description="系统严格执行数据本地化安全规范，凭据仅保存在本机 SQLite 数据库中用于直连小蚕官方接口，绝不上报任何外部服务器。"
                        />
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center text-xs">
                            <Text strong type="secondary">JWT 鉴权密文 (x-Sivir Token)：</Text>
                            <Button
                              size="small"
                              theme="light"
                              type="primary"
                              icon={<IconCopy />}
                              onClick={() => handleCopyToken(detailAccount.token || '')}
                            >
                              复制完整 Token
                            </Button>
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
                  </div>
                )}
              </TabPane>
            </Tabs>
          </div>
        )}
      </SideSheet>

      {/* 账号专属消息推送配置模态对话框 */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <IconBell className="text-semi-color-primary" />
            <span>账号专属推送配置 - 【{notifyAccount?.nickname || '未命名账号'}】</span>
          </div>
        }
        visible={notifyModalVisible}
        onCancel={() => setNotifyModalVisible(false)}
        width={660}
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
                  extra="使用系统全局设置中统一配置的默认通道（所有账号消息统一广播到全局通道）。"
                >
                  <div className="font-medium text-sm text-semi-color-text-0">跟随系统全局设置 (默认)</div>
                </Radio>
                <Radio
                  value="custom"
                  extra="为该账号绑定独立的个人通道，中签、抢单、免单券变动等仅向本人定向派发。"
                >
                  <div className="font-medium text-sm text-semi-color-text-0">绑定个人专属独立通道 (推荐)</div>
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
              <div className="p-4 rounded-lg bg-semi-color-fill-0 border border-semi-color-border space-y-4">
                <div className="flex items-center justify-between">
                  <Text strong className="text-sm text-semi-color-text-0">专属通道类型</Text>
                  <Select
                    value={notifyChannel}
                    onChange={(val) => setNotifyChannel(val as string)}
                    style={{ width: 240 }}
                  >
                    <Select.Option value="clawbot">微信官方 ClawBot (iLink) (首选·推荐)</Select.Option>
                    <Select.Option value="wecom">企业微信群机器人</Select.Option>
                    <Select.Option value="dingtalk">钉钉群机器人</Select.Option>
                    <Select.Option value="feishu">飞书群机器人</Select.Option>
                    <Select.Option value="bark">iOS Bark 推送</Select.Option>
                    <Select.Option value="qq_bot">QQ 机器人 (私聊/群聊)</Select.Option>
                    <Select.Option value="telegram">Telegram Bot</Select.Option>
                  </Select>
                </div>

                <Divider />

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
                        默认模式：若该账号负责人即系统已绑定的微信，下方输入框保持留空即可直接复用（零配置直推）。
                      </Text>
                    </div>

                    <div className="space-y-1">
                      <Text strong className="text-xs">个人独立微信凭证路径 (多用户分流可选)：</Text>
                      <Input
                        placeholder="留空则自动复用系统微信，或填写个人 clawbot-auth.json 绝对路径"
                        value={notifyConfig.clawbot_auth_path || ''}
                        onChange={(val) => setNotifyConfig({ ...notifyConfig, clawbot_auth_path: val })}
                      />
                    </div>

                    <div className="space-y-1">
                      <Text strong className="text-xs">或直接粘贴凭证 JSON 密文 (多用户分流可选)：</Text>
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

                {/* 2. 企业微信 */}
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

                {/* 3. 钉钉 */}
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
                      <Text strong className="text-xs">加签安全密钥 Secret (可选)：</Text>
                      <Input
                        placeholder="SECxxxx (若钉钉机器人开启了加签鉴权请填写)"
                        value={notifyConfig.dingtalk_secret || ''}
                        onChange={(val) => setNotifyConfig({ ...notifyConfig, dingtalk_secret: val })}
                      />
                    </div>
                    <Text type="tertiary" size="small">
                      若钉钉机器人勾选了「加签」，请填写对应 Secret，系统将自动使用 HMAC-SHA256 计算签名。
                    </Text>
                  </div>
                )}

                {/* 4. 飞书 */}
                {notifyChannel === 'feishu' && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Text strong className="text-xs">飞书自定义机器人 Webhook 地址：</Text>
                    </div>
                    <Input
                      placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/xxxx"
                      value={notifyConfig.feishu_webhook || ''}
                      onChange={(val) => setNotifyConfig({ ...notifyConfig, feishu_webhook: val })}
                    />
                    <Text type="tertiary" size="small">
                      飞书群设置 - 群机器人 - 添加自定义机器人，将获取到的 Webhook 填入此处。
                    </Text>
                  </div>
                )}

                {/* 5. Bark */}
                {notifyChannel === 'bark' && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Text strong className="text-xs">Bark Key 或完整推送 URL：</Text>
                    </div>
                    <Input
                      placeholder="例如: 2b8fxxxx 或 https://api.day.app/2b8fxxxx"
                      value={notifyConfig.bark_url || ''}
                      onChange={(val) => setNotifyConfig({ ...notifyConfig, bark_url: val })}
                    />
                    <Text type="tertiary" size="small">
                      支持 iOS Bark App，输入个人设备 Key 或自建 Bark 服务的完整 URL。
                    </Text>
                  </div>
                )}

                {/* 6. QQ 机器人 */}
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
                        <Text strong className="text-xs">接收人 QQ 号 (私聊定向)：</Text>
                        <Input
                          placeholder="例如: 10001"
                          value={notifyConfig.qq_bot_user_id || ''}
                          onChange={(val) => setNotifyConfig({ ...notifyConfig, qq_bot_user_id: val })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Text strong className="text-xs">接收群号 (可选，优先私聊)：</Text>
                        <Input
                          placeholder="例如: 954658571"
                          value={(notifyConfig as any).qq_bot_group_id || ''}
                          onChange={(val) => setNotifyConfig({ ...notifyConfig, qq_bot_group_id: val } as any)}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Text strong className="text-xs">API 访问 Token (可选)：</Text>
                      <Input
                        placeholder="若 OneBot 服务端开启了 Authorization 则填写"
                        value={notifyConfig.qq_bot_token || ''}
                        onChange={(val) => setNotifyConfig({ ...notifyConfig, qq_bot_token: val })}
                      />
                    </div>
                  </div>
                )}

                {/* 7. Telegram */}
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
                    <Text type="tertiary" size="small">
                      可向 @userinfobot 发送消息获取您的个人数字 Chat ID。
                    </Text>
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
              </div>
            )}
          </div>
        )}
      </Modal>

    </div>
  );
};
