import React, { useState, useEffect, useRef } from 'react';
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
  InputNumber,
  Tooltip,
  Empty,
  Notification
} from '@douyinfe/semi-ui';
import { useGSAP, animateStaggerEnter } from '../utils/animations';

import {
  IconPlus,
  IconDelete,
  IconCheckCircleStroked,
  IconCopy,
  IconRefresh,
  IconPlay,
  IconStop,
  IconDesktop,
  IconEdit,
  IconSearch,
  IconHelpCircle,
  IconFile,
  IconInfoCircle,
  IconArrowRight,
  IconSmartphoneStroked,
  IconCode
} from '@douyinfe/semi-icons';
import { useAppStore } from '../store/useAppStore';
import { api } from '../api';
import type { Account } from '../types';

const { Title, Text, Paragraph } = Typography;

export const Accounts: React.FC = () => {
  const { accounts, loadAccounts, currentAccountKey, setCurrentAccountKey } = useAppStore();
  const accountsRef = useRef<HTMLDivElement>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('sniffer');

  useGSAP(
    () => {
      if (accountsRef.current && accounts.length > 0) {
        animateStaggerEnter(accountsRef.current, '.gsap-account-card', 0.04);
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
    city_code: number;
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
  const [customCityCode, setCustomCityCode] = useState(420100);

  // 编辑账号资料模态框状态
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingKey, setEditingKey] = useState('');
  const [editNickname, setEditNickname] = useState('');
  const [editSilkId, setEditSilkId] = useState('');
  const [editCityName, setEditCityName] = useState('武汉');
  const [editCityCode, setEditCityCode] = useState(420100);
  const [editVipLevel, setEditVipLevel] = useState(5);
  const [editExpiresAt, setEditExpiresAt] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [syncingKey, setSyncingKey] = useState<string | null>(null);

  const handleSyncAccount = async (key: string) => {
    setSyncingKey(key);
    try {
      const res = await api.syncAccount(key);
      if (res.ok) {
        Toast.success(res.message || '账号资产与官方档案已成功同步！');
        await loadAccounts();
      } else {
        Toast.error(res.message || '同步失败');
      }
    } catch (e: any) {
      Toast.error(`同步异常: ${e.message || e}`);
    } finally {
      setSyncingKey(null);
    }
  };

  const handleOpenEditModal = (acc: Account) => {
    setEditingKey(acc.key);
    setEditNickname(acc.nickname || '');
    setEditSilkId(acc.silk_id || '');
    setEditCityName(acc.city_name || '武汉');
    setEditCityCode(acc.city_code || 420100);
    setEditVipLevel(acc.vip_level || 5);
    setEditExpiresAt(acc.expires_at || '');
    setEditAvatar(acc.avatar || '');
    setEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!editingKey) return;
    setSavingEdit(true);
    try {
      await api.updateAccount(editingKey, {
        nickname: editNickname.trim(),
        silk_id: editSilkId.trim(),
        city_name: editCityName.trim(),
        city_code: Number(editCityCode),
        vip_level: Number(editVipLevel),
        expires_at: editExpiresAt.trim(),
        avatar: editAvatar.trim()
      });
      Toast.success('账号资料已成功更新！');
      setEditModalVisible(false);
      await loadAccounts();
    } catch (e) {
      Toast.error('更新账号资料失败');
    } finally {
      setSavingEdit(false);
    }
  };

  // 打开新增账号弹窗
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
    if (!rawText.trim()) {
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
            city_code: res.city_code || 420100,
            nickname: res.nickname || '小蚕微信用户'
          });
          setCustomNickname(res.nickname || '小蚕微信用户');
          setCustomCityCode(res.city_code || 420100);
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
      const verifyRes = await api.verifyToken(parsedInfo.token, customCityCode);
      if (!verifyRes.ok || !verifyRes.valid) {
        Toast.error(`凭证验证未通过: ${verifyRes.message || 'Token 无效'}`);
        setVerifying(false);
        return;
      }

      const saveRes = await api.createAccount({
        silk_id: parsedInfo.silk_id,
        nickname: customNickname.trim() || parsedInfo.nickname,
        avatar: '',
        vip_level: 5,
        token: parsedInfo.token,
        city_code: customCityCode,
        city_name: customCityCode === 420100 ? '武汉' : '本地城市',
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
                <Card
                  shadows="hover"
                  className={`gsap-account-card rounded-xl transition-[border-color,background-color,box-shadow] duration-200 will-change-[transform,opacity] semi-card-elevate ${
                    isSelected
                      ? 'border-2 border-semi-color-primary semi-active-ring bg-semi-color-primary-light-default/10'
                      : 'border border-semi-color-border hover:border-semi-color-primary-light-active'
                  }`}
                  headerExtraContent={
                    <Space>
                      <Tag color={acc.is_plus ? "amber" : "blue"}>
                        {acc.is_plus ? `SVIP${acc.vip_level || 5}` : `VIP${acc.vip_level || 1}`}
                      </Tag>
                      <Tag color="cyan">永久托管</Tag>
                    </Space>
                  }
                >
                  <div className="flex gap-3.5 items-center mb-3">
                    <Avatar size="large" src={acc.avatar || undefined} color="orange" className="shadow-xs">
                      {acc.nickname?.[0] || '蚕'}
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-base truncate text-semi-color-text-0">
                        {acc.nickname}
                      </div>
                      <Text type="tertiary" size="small">
                        Silk ID: {acc.silk_id || '—'}
                      </Text>
                    </div>
                  </div>

                  {/* 官方原生资产概览 */}
                  <div className="grid grid-cols-3 gap-2 bg-semi-color-fill-1 p-2.5 rounded-lg mb-3 text-center border border-semi-color-border">
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

                  <div className="bg-semi-color-fill-0 px-3.5 py-2.5 rounded-lg text-[13px] mb-3.5 space-y-1">
                    <div className="flex justify-between">
                      <Text type="secondary">默认城市：</Text>
                      <Text>{acc.city_name || '武汉'} ({acc.city_code || 420100})</Text>
                    </div>
                    {acc.phone && (
                      <div className="flex justify-between">
                        <Text type="secondary">绑定手机：</Text>
                        <Text>{acc.phone}</Text>
                      </div>
                    )}
                    {Boolean(acc.vip_score) && (
                      <div className="flex justify-between">
                        <Text type="secondary">会员成长值：</Text>
                        <Text strong className="text-semi-color-primary">
                          {(acc.vip_score || 0).toLocaleString()} 分
                        </Text>
                      </div>
                    )}
                    {(acc.yb_point !== undefined || acc.unreceived_points !== undefined) && (
                      <div className="flex justify-between items-center">
                        <Text type="secondary">元宝中心：</Text>
                        <div className="flex items-center gap-1.5">
                          <Tag size="small" color="orange">{acc.yb_point || 0} 元宝</Tag>
                          {Boolean(acc.unreceived_points) && (
                            <Tag size="small" color="red">待领 {acc.unreceived_points} 元宝</Tag>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <Text type="secondary">凭证状态：</Text>
                      <Text className="text-semi-color-success flex items-center gap-1 font-medium">
                        <IconCheckCircleStroked size="small" /> 官方已认证
                      </Text>
                    </div>
                    {acc.expires_at && (
                      <div className="flex justify-between">
                        <Text type="secondary">有效期至：</Text>
                        <Text size="small" type="tertiary">{acc.expires_at}</Text>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between items-center pt-1">
                    <Button
                      theme={isSelected ? 'solid' : 'light'}
                      type="primary"
                      size="small"
                      onClick={() => {
                        setCurrentAccountKey(acc.key);
                        Toast.success(`已成功切换主控账号为【${acc.nickname}】`);
                      }}
                      className="transition-all"
                    >
                      {isSelected ? '当前主控账号' : '切换为主控'}
                    </Button>

                    <Space spacing="tight">
                      <Tooltip content="一键同步官方资产与资料">
                        <Button
                          theme="borderless"
                          size="small"
                          icon={<IconRefresh spin={syncingKey === acc.key} />}
                          loading={syncingKey === acc.key}
                          onClick={() => handleSyncAccount(acc.key)}
                        />
                      </Tooltip>
                      <Tooltip content="编辑账号资料">
                        <Button
                          theme="borderless"
                          size="small"
                          icon={<IconEdit />}
                          onClick={() => handleOpenEditModal(acc)}
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
                      <IconArrowRight size="small" />
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
                    { key: '凭据有效期', value: parsedInfo.exp_date },
                    { key: '建议城市编码', value: String(parsedInfo.city_code) }
                  ]}
                />

                <Divider className="my-2.5" />

                <Row gutter={12}>
                  <Col span={12}>
                    <Text size="small" type="secondary">账号备注昵称：</Text>
                    <input
                      className="w-full mt-1 h-8 rounded border border-semi-color-border px-2 bg-transparent text-semi-color-text-0 focus:outline-none focus:border-semi-color-primary"
                      value={customNickname}
                      onChange={(e) => setCustomNickname(e.target.value)}
                    />
                  </Col>
                  <Col span={12}>
                    <Text size="small" type="secondary">城市编码 (City Code)：</Text>
                    <input
                      className="w-full mt-1 h-8 rounded border border-semi-color-border px-2 bg-transparent text-semi-color-text-0 focus:outline-none focus:border-semi-color-primary"
                      type="number"
                      value={customCityCode}
                      onChange={(e) => setCustomCityCode(Number(e.target.value))}
                    />
                  </Col>
                </Row>
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

      {/* 编辑小蚕账号资料模态框 */}
      <Modal
        title="编辑小蚕账号资料"
        visible={editModalVisible}
        onOk={handleSaveEdit}
        onCancel={() => setEditModalVisible(false)}
        confirmLoading={savingEdit}
        okText="保存修改"
        cancelText="取消"
        width={500}
      >
        <div className="space-y-4 py-2">
          <div>
            <Text strong className="block mb-1.5 text-sm">用户昵称</Text>
            <Input
              value={editNickname}
              placeholder="例如：牧使的苹果"
              onChange={(val) => setEditNickname(val)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Text strong className="block mb-1.5 text-sm">Silk / 会员 ID</Text>
              <Input
                value={editSilkId}
                placeholder="例如：356128706"
                onChange={(val) => setEditSilkId(val)}
              />
            </div>
            <div>
              <Text strong className="block mb-1.5 text-sm">VIP 等级 (SVIP)</Text>
              <InputNumber
                value={editVipLevel}
                min={1}
                max={9}
                className="w-full"
                onChange={(val) => setEditVipLevel(Number(val) || 5)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Text strong className="block mb-1.5 text-sm">城市名称</Text>
              <Input
                value={editCityName}
                placeholder="例如：武汉"
                onChange={(val) => setEditCityName(val)}
              />
            </div>
            <div>
              <Text strong className="block mb-1.5 text-sm">城市代码 (City Code)</Text>
              <InputNumber
                value={editCityCode}
                className="w-full"
                onChange={(val) => setEditCityCode(Number(val) || 420100)}
              />
            </div>
          </div>
          <div>
            <Text strong className="block mb-1.5 text-sm">有效期至</Text>
            <Input
              value={editExpiresAt}
              placeholder="例如：2026-10-21 11:57:10"
              onChange={(val) => setEditExpiresAt(val)}
            />
          </div>
          <div>
            <Text strong className="block mb-1.5 text-sm">头像 URL (可选)</Text>
            <Input
              value={editAvatar}
              placeholder="自定义头像图片链接"
              onChange={(val) => setEditAvatar(val)}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};
