import React, { useEffect, useState, useRef } from 'react';
import {
  Card,
  Form,
  Button,
  Typography,
  Toast,
  Space,
  Tag,
  Banner,
  Row,
  Col,
  Tabs,
  TabPane,
  Descriptions,
  Modal,
  Input,
  Spin,
  Popconfirm,
  Collapsible,
  Steps,
} from '@douyinfe/semi-ui';
import {
  IconSave,
  IconSend,
  IconRefresh,
  IconTick,
  IconAlertCircle,
  IconInfoCircle,
  IconBell,
  IconServer,
  IconMapPin,
  IconExternalOpen,
  IconQrCode,
  IconUnlink,
  IconChevronDown,
  IconChevronUp,
} from '@douyinfe/semi-icons';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { api } from '../api';
import { useOnActivated } from '../utils/useOnActivated';
import type { SystemSettings, ClawBotStatus } from '../types';

const { Title, Text } = Typography;

gsap.registerPlugin(useGSAP);

interface ClawBotLoginModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const ClawBotLoginModal: React.FC<ClawBotLoginModalProps> = ({ visible, onClose, onSuccess }) => {
  const [step, setStep] = useState<number>(0);
  const [loadingQr, setLoadingQr] = useState<boolean>(false);
  const [qrImage, setQrImage] = useState<string>('');
  const [qrcodeTicket, setQrcodeTicket] = useState<string>('');
  const [qrExpired, setQrExpired] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>('等待获取二维码...');
  const [verifyCode, setVerifyCode] = useState<string>('');
  const [submittingVerify, setSubmittingVerify] = useState<boolean>(false);
  const [authorizedUser, setAuthorizedUser] = useState<string>('');
  const [checkingActivation, setCheckingActivation] = useState<boolean>(false);
  const [activationDone, setActivationDone] = useState<boolean>(false);
  const isCancelledRef = useRef<boolean>(false);
  const pollTimerRef = useRef<any>(null);

  const fetchQrAndPoll = async () => {
    setLoadingQr(true);
    setQrExpired(false);
    setStatusText('正在向微信官方申请登录二维码...');
    setStep(0);
    setVerifyCode('');
    setActivationDone(false);
    try {
      const res = await api.generateClawBotQr();
      if (res.ok && res.qrcode) {
        setQrImage(res.qr_image || '');
        setQrcodeTicket(res.qrcode);
        setLoadingQr(false);
        setStatusText('请使用手机微信扫描二维码进行授权绑定');
        startPolling(res.qrcode);
      } else {
        setLoadingQr(false);
        setStatusText(res.message || '获取二维码失败');
        Toast.error(res.message || '获取二维码失败');
      }
    } catch {
      setLoadingQr(false);
      setStatusText('网络通信异常，获取二维码失败');
      Toast.error('获取二维码失败，请检查网络');
    }
  };

  const startPolling = async (ticket: string, code?: string) => {
    if (isCancelledRef.current) return;
    try {
      const pollRes = await api.pollClawBotStatus(ticket, code);
      if (isCancelledRef.current) return;

      if (pollRes.status === 'wait') {
        setStatusText('等待手机微信扫码...');
        pollTimerRef.current = setTimeout(() => startPolling(ticket), 1500);
      } else if (pollRes.status === 'scaned') {
        setStep(1);
        setStatusText('微信已成功扫码，请在手机上点击【允许】确认授权...');
        pollTimerRef.current = setTimeout(() => startPolling(ticket), 1500);
      } else if (pollRes.status === 'need_verifycode') {
        setStep(1);
        setStatusText('手机微信要求输入配对验证数字，请在下方输入确认');
      } else if (pollRes.status === 'expired' || pollRes.status === 'verify_code_blocked') {
        setQrExpired(true);
        setStatusText(pollRes.message || '二维码已过期失效，请点击刷新');
      } else if (pollRes.status === 'binded_redirect') {
        setQrExpired(true);
        setStatusText(pollRes.message || '微信号已在其他客户端绑定');
        Toast.warning(pollRes.message);
      } else if (pollRes.status === 'confirmed') {
        setStep(2);
        setAuthorizedUser(pollRes.user_id || '');
        setStatusText('微信授权成功！凭证已自动保存');
        Toast.success('微信授权成功！');
        pollActivation();
      } else {
        pollTimerRef.current = setTimeout(() => startPolling(ticket), 2000);
      }
    } catch {
      if (!isCancelledRef.current) {
        pollTimerRef.current = setTimeout(() => startPolling(ticket), 2500);
      }
    }
  };

  const handleSubmitVerifyCode = async () => {
    if (!verifyCode.trim() || !qrcodeTicket) return;
    setSubmittingVerify(true);
    setStatusText('正在提交配对验证码...');
    try {
      await startPolling(qrcodeTicket, verifyCode.trim());
    } finally {
      setSubmittingVerify(false);
    }
  };

  const pollActivation = async () => {
    setCheckingActivation(true);
    try {
      const res = await api.checkClawBotActivation();
      if (res.activated) {
        setActivationDone(true);
        Toast.success('微信会话上下文已成功激活就绪！');
      } else {
        Toast.info('暂未检测到新消息，在微信发送任意消息后点击【立即检测激活】');
      }
    } catch {
      Toast.error('检测激活状态异常');
    } finally {
      setCheckingActivation(false);
    }
  };

  useEffect(() => {
    if (visible) {
      isCancelledRef.current = false;
      fetchQrAndPoll();
    } else {
      isCancelledRef.current = true;
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    }
    return () => {
      isCancelledRef.current = true;
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
  }, [visible]);

  const handleFinish = () => {
    onSuccess();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      onCancel={onClose}
      title={
        <div className="flex items-center gap-2">
          <IconQrCode className="text-semi-color-primary" />
          <span className="font-semibold">绑定微信 ClawBot 官方推送通道</span>
        </div>
      }
      footer={
        <div className="flex items-center justify-between w-full">
          <Text type="secondary" size="small">
            直连腾讯 iLink 灰度协议 · 全程私有化运行
          </Text>
          <Space>
            <Button onClick={onClose} theme="light">
              {step >= 2 ? '稍后激活' : '取消'}
            </Button>
            {step >= 2 && (
              <Button theme="solid" type="primary" onClick={handleFinish}>
                {activationDone ? '完成' : '已发送消息，完成配置'}
              </Button>
            )}
          </Space>
        </div>
      }
      width={560}
      centered
      maskClosable={false}
    >
      <div className="py-2 space-y-4">
        <Steps type="basic" current={step} size="small" className="clawbot-steps mb-3">
          <Steps.Step title="扫码授权" description="手机微信扫码" />
          <Steps.Step title="确认配对" description="手机确认授权" />
          <Steps.Step title="发信激活" description="微信发信激活" />
        </Steps>

        {step < 2 && (
          <div className="flex flex-col items-center justify-center pt-2">
            <div className="relative inline-block p-3.5 bg-white rounded-xl border border-semi-color-border shadow-xs">
              {loadingQr ? (
                <div className="w-52 h-52 flex flex-col items-center justify-center gap-2">
                  <Spin size="large" />
                  <span className="text-xs text-semi-color-text-2">申请二维码中...</span>
                </div>
              ) : qrImage ? (
                <img src={qrImage} alt="微信 ClawBot 登录二维码" className="w-52 h-52 object-contain block" />
              ) : (
                <div className="w-52 h-52 flex flex-col items-center justify-center gap-2">
                  <IconAlertCircle style={{ fontSize: 32, color: 'var(--semi-color-danger)' }} />
                  <span className="text-xs text-semi-color-text-2">暂无可用二维码</span>
                  <Button size="small" onClick={fetchQrAndPoll} icon={<IconRefresh />}>重新加载</Button>
                </div>
              )}

              {qrExpired && (
                <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px] rounded-xl flex flex-col items-center justify-center text-white p-4 text-center">
                  <IconAlertCircle style={{ fontSize: 28, color: 'var(--semi-color-warning)' }} />
                  <span className="text-xs mt-1 mb-3 font-medium">二维码已失效</span>
                  <Button size="small" theme="solid" type="primary" icon={<IconRefresh />} onClick={fetchQrAndPoll}>
                    刷新二维码
                  </Button>
                </div>
              )}
            </div>

            <div className="text-center mt-3 text-sm flex items-center justify-center gap-2 text-semi-color-text-0 font-medium">
              {!qrExpired && !loadingQr && <Spin size="small" />}
              <span>{statusText}</span>
            </div>

            {step === 1 && (
              <div className="w-full mt-4 p-3.5 rounded-lg bg-semi-color-fill-0 border border-semi-color-border space-y-2">
                <div className="text-xs text-semi-color-text-1">
                  若您的手机微信界面提示了数字配对码，请输入以继续授权：
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="请输入微信显示的配对数字"
                    value={verifyCode}
                    onChange={setVerifyCode}
                    onEnterPress={handleSubmitVerifyCode}
                    size="small"
                    className="max-w-[200px]"
                  />
                  <Button
                    theme="solid"
                    type="primary"
                    size="small"
                    loading={submittingVerify}
                    onClick={handleSubmitVerifyCode}
                    disabled={!verifyCode.trim()}
                  >
                    提交配对码
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {step >= 2 && (
          <div className="space-y-4 pt-2">
            <div className="p-4 rounded-xl bg-semi-color-fill-0 border border-semi-color-border space-y-3">
              <div className="flex items-center gap-2 text-semi-color-success font-medium">
                <IconTick />
                <span>微信授权绑定成功！</span>
                {authorizedUser && <Tag color="green" size="small">用户 ID: {authorizedUser}</Tag>}
              </div>

              <div className="text-xs text-semi-color-text-1 leading-relaxed bg-white dark:bg-semi-color-bg-1 p-3 rounded-lg border border-semi-color-border">
                <div className="font-semibold text-semi-color-text-0 mb-1">关键激活步骤提示：</div>
                腾讯官方 iLink 灰度接口要求首条会话必须由微信用户主动发起。
                <br />
                请在手机微信中打开<strong>「微信 ClawBot」</strong>，并向它发送一条任意消息（如<strong>你好</strong>或<strong>1</strong>）。
              </div>

              <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                <div className="flex items-center gap-2">
                  <Text strong size="small">会话上下文状态：</Text>
                  {activationDone ? (
                    <Tag color="green" prefixIcon={<IconTick />}>已激活就绪</Tag>
                  ) : (
                    <Tag color="amber" prefixIcon={<IconAlertCircle />}>等待微信发信</Tag>
                  )}
                </div>

                <Button
                  theme={activationDone ? 'light' : 'solid'}
                  type={activationDone ? 'tertiary' : 'primary'}
                  icon={<IconRefresh />}
                  loading={checkingActivation}
                  onClick={pollActivation}
                  size="small"
                >
                  {activationDone ? '重新检测' : '我已发信，立即检测激活'}
                </Button>
              </div>
            </div>

            {activationDone && (
              <Banner
                type="success"
                closeIcon={null}
                title="微信推送通道就绪"
                description="系统已自动持久化会话凭证，秒杀中签、外卖霸王餐中奖与每日任务运行结果将实时推送至您的微信。"
              />
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

export const SettingsView: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const formApiRef = useRef<any>(null);
  const [loading, setLoading] = useState(false);
  const [testingChannel, setTestingChannel] = useState<string | null>(null);
  const [testingTianditu, setTestingTianditu] = useState(false);
  const [clawbotStatus, setClawbotStatus] = useState<ClawBotStatus | null>(null);
  const [clawbotModalVisible, setClawbotModalVisible] = useState<boolean>(false);
  const [advancedClawbotOpen, setAdvancedClawbotOpen] = useState<boolean>(false);
  const [checkingActivation, setCheckingActivation] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState('channels');
  const [initialValues, setInitialValues] = useState<Partial<SystemSettings>>({
    clawbot_enabled: true,
    clawbot_auth_path: '',
    clawbot_auth_json: '',
    qq_bot_enabled: true,
    qq_bot_api: 'http://127.0.0.1:8080',
    qq_bot_group_id: '954658571',
    qq_bot_user_id: '2371445972',
    qq_bot_target_type: 'group',
    qq_bot_token: '',
    wecom_enabled: false,
    wecom_webhook: '',
    bark_enabled: false,
    bark_url: '',
    telegram_enabled: false,
    tg_bot_token: '',
    tg_chat_id: '',
    notify_on_grab: true,
    notify_on_appoint: true,
    notify_on_spike: true,
    tianditu_key: '109fd484f999e3c0472ab15fa38fe2ac',
  });

  useGSAP(() => {
    gsap.from('.settings-card', {
      y: 16,
      autoAlpha: 0,
      duration: 0.35,
      stagger: 0.06,
      ease: 'power2.out',
    });
  }, { scope: containerRef, dependencies: [activeTab] });

  const loadData = async () => {
    try {
      const res = await api.getSettings();
      if (res.clawbot_status) {
        setClawbotStatus(res.clawbot_status);
      }
      setInitialValues(res);
      if (formApiRef.current) {
        formApiRef.current.setValues(res);
      }
    } catch (e) {
      Toast.error('获取系统设置失败');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // 页面切入激活时自动重新拉取配置
  useOnActivated('settings', () => {
    loadData();
  }, { throttleMs: 3000 });

  const handleRefreshClawBot = async () => {
    try {
      const curPath = formApiRef.current?.getValue('clawbot_auth_path');
      const res = await api.getClawBotStatus(curPath);
      if (res.ok) {
        setClawbotStatus({
          ready: res.ready,
          source: res.message,
          user_id: res.user_id || '',
          account_id: res.account_id || '',
          has_context_token: !!res.has_context_token,
          saved_at: res.saved_at || '',
        });
        Toast.success(res.ready ? 'ClawBot 凭据有效已就绪' : res.message);
      } else {
        Toast.warning(res.message || '未检测到有效 ClawBot 凭证');
      }
    } catch (e) {
      Toast.error('探测 ClawBot 状态异常');
    }
  };

  const handleUnbindClawBot = async () => {
    try {
      const res = await api.unbindClawBot();
      if (res.ok) {
        Toast.success('微信 ClawBot 账号已成功解绑');
        setClawbotStatus(null);
        await loadData();
      } else {
        Toast.error(res.message || '解绑失败');
      }
    } catch {
      Toast.error('解绑操作异常');
    }
  };

  const handleCheckActivationDirect = async () => {
    setCheckingActivation(true);
    try {
      const res = await api.checkClawBotActivation();
      if (res.activated) {
        Toast.success('微信会话上下文活跃已就绪');
        await loadData();
      } else {
        Toast.warning(res.message || '暂未检测到微信新消息，请向 ClawBot 发送任意消息后重试');
      }
    } catch {
      Toast.error('检测激活状态异常');
    } finally {
      setCheckingActivation(false);
    }
  };

  const handleTestChannel = async (channel: string) => {
    const currentValues = formApiRef.current?.getValues() || {};
    setTestingChannel(channel);
    try {
      const res = await api.testNotify(channel, currentValues);
      if (res.ok) {
        Toast.success(`[成功] ${res.message}`);
      } else {
        Toast.error(`[失败] ${res.message}`);
      }
    } catch (e: any) {
      Toast.error(`测试通信异常: ${e?.response?.data?.detail || e.message || '未知错误'}`);
    } finally {
      setTestingChannel(null);
    }
  };

  const handleTestTianditu = async () => {
    const key = formApiRef.current?.getValue('tianditu_key') || '';
    if (!String(key).trim()) {
      Toast.warning('请先填写天地图服务密钥 (Token / tk)');
      return;
    }
    setTestingTianditu(true);
    try {
      const res = await api.testTianditu({ tianditu_key: String(key).trim() });
      if (res.ok) {
        Toast.success(`[成功] ${res.message || '天地图 API 鉴权连通成功！通道运行正常'}`);
      } else {
        Toast.error(`[失败] ${res.message || '天地图鉴权失败'}`);
      }
    } catch (e: any) {
      Toast.error(`测试通信异常: ${e?.response?.data?.detail || e.message || '网络连接超时'}`);
    } finally {
      setTestingTianditu(false);
    }
  };

  const handleSave = async (values: any) => {
    setLoading(true);
    try {
      await api.saveSettings(values);
      Toast.success('系统设置已成功保存');
      loadData();
    } catch (e) {
      Toast.error('保存设置失败');
    } finally {
      setLoading(false);
    }
  };

  const aboutDescriptions = [
    { key: '系统版本', value: <Tag color="green" size="small">v2.1.0 企业纯净自研版</Tag> },
    { key: '授权状态', value: <Tag color="cyan" size="small">终身免费开放 · 零车位与商业化限制</Tag> },
    { key: '前端技术栈', value: <Tag color="blue" size="small">React 19 + TypeScript + Semi Design + Tailwind CSS v4 + GSAP</Tag> },
    { key: '后端技术栈', value: <Tag color="purple" size="small">FastAPI + APScheduler + 逆向 RPC 驱动 + 腾讯 iLink 灰度协议 + OneBot V11</Tag> },
    { key: '多项目联动', value: '支持原生内嵌微信 ClawBot (腾讯 iLink 直连) 与本地 mystool-bot (QQ 机器人)' },
    { key: '数据持久化', value: '本地 SQLite 独立存储，纯私有化运行，零外部数据上报' },
    { key: '部署形态', value: 'Windows 单机 / 局域网内网穿透 / 软路由 / NAS / Linux 服务器自托管' },
  ];

  return (
    <div ref={containerRef} className="w-full max-w-[1240px] space-y-6 pb-12">
      {/* 顶部标题栏与全局快捷操作 */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2 border-b border-semi-color-border">
        <div>
          <Title heading={3} className="!mb-1">系统与通知设置</Title>
          <Text type="secondary" size="small">
            集中管理外卖霸王餐抢单中签、大牌秒杀中签与自动化任务的多端实时预警通道及全局运行参数
          </Text>
        </div>
        <Space>
          <Button
            theme="light"
            icon={<IconRefresh />}
            onClick={loadData}
          >
            刷新配置
          </Button>
          <Button
            theme="solid"
            type="primary"
            icon={<IconSave />}
            loading={loading}
            onClick={() => formApiRef.current?.submitForm()}
          >
            保存全部设置
          </Button>
        </Space>
      </div>

      <Form
        getFormApi={(api) => {
          formApiRef.current = api;
        }}
        initValues={initialValues}
        onSubmit={handleSave}
      >
        {({ values }) => (
          <div className="space-y-6">
            <Tabs
              type="line"
              activeKey={activeTab}
              onChange={(key) => setActiveTab(String(key))}
              keepDOM
              lazyRender={false}
              className="bg-transparent"
            >
              {/* Tab 1: 推送通道设置 */}
              <TabPane
                tab={
                  <span className="flex items-center gap-2 font-medium px-1">
                    <IconSend className="text-semi-color-primary" />
                    推送通道设置
                  </span>
                }
                itemKey="channels"
              >
                <div className="pt-4 space-y-6">
                  {/* 1. 微信 ClawBot 官方推送通道 */}
                  <Card
                    className="settings-card rounded-xl border border-semi-color-border shadow-xs"
                    headerExtraContent={
                      <div className="flex items-center gap-2">
                        <Tag
                          color={values?.clawbot_enabled ? 'green' : 'grey'}
                          size="small"
                        >
                          {values?.clawbot_enabled ? '已启用' : '已停用'}
                        </Tag>
                        <Form.Switch field="clawbot_enabled" noLabel />
                      </div>
                    }
                    title={
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-base">微信 ClawBot 官方推送通道</span>
                        <Tag color="green">腾讯 iLink 官方协议</Tag>
                        <Tag color="cyan">原生内置直连</Tag>
                        <Tag color="blue">免第三方依赖</Tag>
                      </div>
                    }
                  >
                    <div className="space-y-4">
                      {/* 已绑定状态展示 */}
                      {clawbotStatus?.ready ? (
                        <div className="p-4 rounded-xl bg-semi-color-fill-0 border border-semi-color-border space-y-3">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Text strong>连接状态：</Text>
                              <Tag color="green" prefixIcon={<IconTick />}>已连接就绪</Tag>
                              {clawbotStatus.has_context_token ? (
                                <Tag color="cyan" prefixIcon={<IconTick />}>微信会话活跃</Tag>
                              ) : (
                                <Tag color="amber" prefixIcon={<IconAlertCircle />}>待发信激活</Tag>
                              )}
                            </div>
                            <Space>
                              <Button
                                size="small"
                                theme="light"
                                type="primary"
                                icon={<IconQrCode />}
                                onClick={() => setClawbotModalVisible(true)}
                              >
                                重新扫码 / 换号
                              </Button>
                              <Popconfirm
                                title="确认解绑微信 ClawBot 账号？"
                                content="解绑后将清空本地微信登录凭据，无法再接收微信推送。"
                                okText="确认解绑"
                                cancelText="取消"
                                onConfirm={handleUnbindClawBot}
                              >
                                <Button
                                  size="small"
                                  theme="borderless"
                                  type="danger"
                                  icon={<IconUnlink />}
                                >
                                  解绑账号
                                </Button>
                              </Popconfirm>
                            </Space>
                          </div>

                          <div className="text-xs text-semi-color-text-2 space-y-1">
                            <div>凭据说明: {clawbotStatus.source}</div>
                            {clawbotStatus.user_id && <div>用户 ID: <span className="font-mono">{clawbotStatus.user_id}</span></div>}
                            {clawbotStatus.account_id && <div>授权账号: <span className="font-mono">{clawbotStatus.account_id}</span></div>}
                          </div>

                          {!clawbotStatus.has_context_token && (
                            <div className="p-2.5 rounded-lg bg-semi-color-warning-light-default border border-semi-color-warning text-xs text-semi-color-text-1 flex items-center justify-between gap-2 flex-wrap">
                              <span>提示：微信要求首条交互由用户发起。请在微信向「微信 ClawBot」发送任意文字以激活会话。</span>
                              <Button
                                size="small"
                                theme="solid"
                                type="warning"
                                icon={<IconRefresh />}
                                loading={checkingActivation}
                                onClick={handleCheckActivationDirect}
                              >
                                检测会话激活
                              </Button>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* 未绑定状态引导卡 */
                        <div className="p-4 rounded-xl bg-semi-color-fill-0 border border-semi-color-border flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                          <div className="space-y-1 max-w-[640px]">
                            <div className="flex items-center gap-2">
                              <Text strong className="text-base text-semi-color-text-0">尚未绑定微信推送通道</Text>
                              <Tag color="amber" size="small">未就绪</Tag>
                            </div>
                            <div className="text-xs text-semi-color-text-2 leading-relaxed">
                              微信 ClawBot 是腾讯官方提供的免费个人通知通道，支持向个人微信实时推送外卖霸王餐中奖、秒杀抢单与任务异常报警。
                              小蚕助手已原生内置该协议，只需点击右侧按钮扫码即可直接开通，无需借助外部脚本或繁琐配置。
                            </div>
                          </div>
                          <Button
                            theme="solid"
                            type="primary"
                            size="large"
                            icon={<IconQrCode />}
                            onClick={() => setClawbotModalVisible(true)}
                            className="flex-shrink-0"
                          >
                            扫码绑定微信 ClawBot
                          </Button>
                        </div>
                      )}

                      {/* 底部操作行 */}
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
                        <Button
                          theme="borderless"
                          size="small"
                          icon={advancedClawbotOpen ? <IconChevronUp /> : <IconChevronDown />}
                          onClick={() => setAdvancedClawbotOpen(!advancedClawbotOpen)}
                          className="!text-semi-color-text-2"
                        >
                          {advancedClawbotOpen ? '收起高级导入选项' : '展开高级导入选项 (手动配置凭证)'}
                        </Button>

                        <Space>
                          {clawbotStatus?.ready && (
                            <Button
                              theme="light"
                              icon={<IconRefresh />}
                              onClick={handleRefreshClawBot}
                            >
                              检测凭据状态
                            </Button>
                          )}
                          <Button
                            theme="solid"
                            type="secondary"
                            icon={<IconSend />}
                            loading={testingChannel === 'clawbot'}
                            onClick={() => handleTestChannel('clawbot')}
                          >
                            发送微信测试
                          </Button>
                        </Space>
                      </div>

                      {/* 高级导入与自定义凭据配置 */}
                      <Collapsible isOpen={advancedClawbotOpen}>
                        <div className="p-3.5 rounded-lg bg-semi-color-fill-0 border border-semi-color-border space-y-3 mt-2">
                          <div className="text-xs font-semibold text-semi-color-text-1">
                            高级凭证配置（适合从老版本或多机迁移凭证）
                          </div>
                          <Form.Input
                            field="clawbot_auth_path"
                            label="外部凭证路径 (clawbot-auth.json)"
                            placeholder="如需从外部已有文件加载凭据可在此填写文件绝对路径，留空则默认使用系统内嵌凭据"
                            helpText="留空时系统默认优先从项目内置 SQLite 数据库与 backend/data/clawbot-auth.json 读取。"
                          />
                          <Form.TextArea
                            field="clawbot_auth_json"
                            label="直接 JSON 凭证内容"
                            placeholder="可直接在此粘贴完整凭证 JSON 内容"
                            rows={3}
                          />
                        </div>
                      </Collapsible>
                    </div>
                  </Card>

                  {/* 2. QQ 聊天机器人推送通道 */}
                  <Card
                    className="settings-card rounded-xl border border-semi-color-border shadow-xs"
                    headerExtraContent={
                      <div className="flex items-center gap-2">
                        <Tag
                          color={values?.qq_bot_enabled ? 'green' : 'grey'}
                          size="small"
                        >
                          {values?.qq_bot_enabled ? '已启用' : '已停用'}
                        </Tag>
                        <Form.Switch field="qq_bot_enabled" noLabel />
                      </div>
                    }
                    title={
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-base">QQ 聊天机器人推送 (OneBot V11)</span>
                        <Tag color="cyan">OneBot V11 协议</Tag>
                        <Tag color="violet">直连本地 mystool-bot</Tag>
                      </div>
                    }
                  >
                    <div className="space-y-4">
                      <Banner
                        type="info"
                        closeIcon={null}
                        description="小蚕助手已支持直连本地 mystool-bot (NoneBot2 8080端口) 或 SnowLuma (3000端口)。当外卖霸王餐抢单中签或秒杀成功时，机器人将在群内或私聊实时推送提醒。"
                      />

                      <Form.Input
                        field="qq_bot_api"
                        label="OneBot V11 HTTP 接口地址"
                        placeholder="http://127.0.0.1:8080"
                        helpText="支持 NoneBot2 内部路由 (http://127.0.0.1:8080) 或 SnowLuma HTTP 服务 (http://127.0.0.1:3000)。"
                      />

                      <Form.RadioGroup
                        field="qq_bot_target_type"
                        label="推送目标范围"
                        direction="horizontal"
                      >
                        <Form.Radio value="group">仅推送至目标群聊</Form.Radio>
                        <Form.Radio value="private">仅私聊管理员推送</Form.Radio>
                        <Form.Radio value="both">群聊与私聊同时推送</Form.Radio>
                      </Form.RadioGroup>

                      <Row gutter={16}>
                        <Col span={12}>
                          <Form.Input
                            field="qq_bot_group_id"
                            label="目标群号"
                            placeholder="954658571"
                            helpText="接收抢单提醒的 QQ 群号"
                          />
                        </Col>
                        <Col span={12}>
                          <Form.Input
                            field="qq_bot_user_id"
                            label="管理员 QQ 号 (私聊目标)"
                            placeholder="2371445972"
                            helpText="接收私聊提醒的管理员 QQ 号"
                          />
                        </Col>
                      </Row>

                      <Form.Input
                        field="qq_bot_token"
                        label="OneBot Access Token (可选)"
                        placeholder="若协议端配置了访问令牌请输入，默认留空"
                      />

                      <div className="flex items-center justify-end pt-2">
                        <Button
                          theme="solid"
                          type="secondary"
                          icon={<IconSend />}
                          loading={testingChannel === 'qq_bot'}
                          onClick={() => handleTestChannel('qq_bot')}
                        >
                          发送 QQ 测试消息
                        </Button>
                      </div>
                    </div>
                  </Card>

                  {/* 3. 其它多端通知通道 (企业微信 / Bark / Telegram) */}
                  <div>
                    <div className="mb-3">
                      <Text strong className="text-base">扩展推送通道</Text>
                      <Text type="secondary" size="small" className="block">
                        根据业务需要可选开启企业微信、iOS Bark 毫秒横幅或 Telegram 机器人
                      </Text>
                    </div>

                    <Row gutter={[16, 16]}>
                      {/* 企业微信 */}
                      <Col xs={24} lg={8}>
                        <Card
                          className="settings-card rounded-xl border border-semi-color-border shadow-xs h-full flex flex-col justify-between"
                          headerExtraContent={
                            <div className="flex items-center gap-2">
                              <Tag color={values?.wecom_enabled ? 'green' : 'grey'} size="small">
                                {values?.wecom_enabled ? '开启' : '关闭'}
                              </Tag>
                              <Form.Switch field="wecom_enabled" noLabel />
                            </div>
                          }
                          title={
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold">企业微信机器人</span>
                              <Tag color="orange" size="small">WeCom</Tag>
                            </div>
                          }
                        >
                          <div className="space-y-4 flex-1 flex flex-col justify-between">
                            <Form.Input
                              field="wecom_webhook"
                              label="Webhook 接口地址"
                              placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
                              helpText="企业微信群添加自定义机器人后复制其 Webhook 地址填入此处"
                            />
                            <div className="flex justify-end pt-2">
                              <Button
                                size="small"
                                theme="light"
                                icon={<IconSend />}
                                loading={testingChannel === 'wecom'}
                                onClick={() => handleTestChannel('wecom')}
                              >
                                测试企业微信
                              </Button>
                            </div>
                          </div>
                        </Card>
                      </Col>

                      {/* iOS Bark */}
                      <Col xs={24} lg={8}>
                        <Card
                          className="settings-card rounded-xl border border-semi-color-border shadow-xs h-full flex flex-col justify-between"
                          headerExtraContent={
                            <div className="flex items-center gap-2">
                              <Tag color={values?.bark_enabled ? 'green' : 'grey'} size="small">
                                {values?.bark_enabled ? '开启' : '关闭'}
                              </Tag>
                              <Form.Switch field="bark_enabled" noLabel />
                            </div>
                          }
                          title={
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold">iOS Bark 极速通知</span>
                              <Tag color="cyan" size="small">Bark</Tag>
                            </div>
                          }
                        >
                          <div className="space-y-4 flex-1 flex flex-col justify-between">
                            <Form.Input
                              field="bark_url"
                              label="Bark 推送地址或 Key"
                              placeholder="https://api.day.app/your_key"
                              helpText="支持 iPhone 极速震动横幅弹窗，填入 Bark App 提供的完整 URL 或 Key"
                            />
                            <div className="flex justify-end pt-2">
                              <Button
                                size="small"
                                theme="light"
                                icon={<IconSend />}
                                loading={testingChannel === 'bark'}
                                onClick={() => handleTestChannel('bark')}
                              >
                                测试 Bark
                              </Button>
                            </div>
                          </div>
                        </Card>
                      </Col>

                      {/* Telegram Bot */}
                      <Col xs={24} lg={8}>
                        <Card
                          className="settings-card rounded-xl border border-semi-color-border shadow-xs h-full flex flex-col justify-between"
                          headerExtraContent={
                            <div className="flex items-center gap-2">
                              <Tag color={values?.telegram_enabled ? 'green' : 'grey'} size="small">
                                {values?.telegram_enabled ? '开启' : '关闭'}
                              </Tag>
                              <Form.Switch field="telegram_enabled" noLabel />
                            </div>
                          }
                          title={
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold">Telegram 机器人</span>
                              <Tag color="blue" size="small">Telegram</Tag>
                            </div>
                          }
                        >
                          <div className="space-y-3 flex-1 flex flex-col justify-between">
                            <Form.Input
                              field="tg_bot_token"
                              label="Bot Token"
                              placeholder="123456:ABC-DEF..."
                            />
                            <Form.Input
                              field="tg_chat_id"
                              label="Chat ID"
                              placeholder="12345678"
                            />
                            <div className="flex justify-end pt-2">
                              <Button
                                size="small"
                                theme="light"
                                icon={<IconSend />}
                                loading={testingChannel === 'telegram'}
                                onClick={() => handleTestChannel('telegram')}
                              >
                                测试 Telegram
                              </Button>
                            </div>
                          </div>
                        </Card>
                      </Col>
                    </Row>
                  </div>
                </div>
              </TabPane>

              {/* Tab 2: 通知触发策略 */}
              <TabPane
                tab={
                  <span className="flex items-center gap-2 font-medium px-1">
                    <IconBell className="text-semi-color-primary" />
                    通知触发策略
                  </span>
                }
                itemKey="strategies"
              >
                <div className="pt-4 space-y-6">
                  <Card
                    className="settings-card rounded-xl border border-semi-color-border shadow-xs"
                    title={
                      <div>
                        <span className="font-semibold text-base">事件推送触发策略</span>
                        <Text type="secondary" size="small" className="block mt-0.5">
                          细粒度控制不同业务事件产生时的提醒行为，触发后将通过上方已启用的全部通道同步发送
                        </Text>
                      </div>
                    }
                  >
                    <div className="space-y-4">
                      {/* 策略 1: 抢单成功 */}
                      <div className="flex items-center justify-between p-4 rounded-lg bg-semi-color-fill-0 border border-semi-color-border hover:bg-semi-color-fill-1 transition-colors">
                        <div className="space-y-1 pr-4">
                          <div className="flex items-center gap-2">
                            <Text strong>霸王餐自动抢单中签时通知</Text>
                            <Tag color="green" size="small">核心事件</Tag>
                          </div>
                          <div className="text-xs text-semi-color-text-2">
                            当霸王餐名额放量并成功抢单锁定名额时，立即触发全通道通知提醒用户及时前往美团/饿了么下单
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Tag color={values?.notify_on_grab ? 'green' : 'grey'} size="small">
                            {values?.notify_on_grab ? '已启用' : '已停用'}
                          </Tag>
                          <Form.Switch field="notify_on_grab" noLabel />
                        </div>
                      </div>

                      {/* 策略 2: 预约状态变动 */}
                      <div className="flex items-center justify-between p-4 rounded-lg bg-semi-color-fill-0 border border-semi-color-border hover:bg-semi-color-fill-1 transition-colors">
                        <div className="space-y-1 pr-4">
                          <div className="flex items-center gap-2">
                            <Text strong>店铺预约状态变动与自动预约成功通知</Text>
                            <Tag color="cyan" size="small">预约监听</Tag>
                          </div>
                          <div className="text-xs text-semi-color-text-2">
                            店铺霸王餐预约成功、已到开抢时段或自动监听完成预约目标时发送实时进度预警
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Tag color={values?.notify_on_appoint ? 'green' : 'grey'} size="small">
                            {values?.notify_on_appoint ? '已启用' : '已停用'}
                          </Tag>
                          <Form.Switch field="notify_on_appoint" noLabel />
                        </div>
                      </div>

                      {/* 策略 3: 大牌秒杀 */}
                      <div className="flex items-center justify-between p-4 rounded-lg bg-semi-color-fill-0 border border-semi-color-border hover:bg-semi-color-fill-1 transition-colors">
                        <div className="space-y-1 pr-4">
                          <div className="flex items-center gap-2">
                            <Text strong>大牌秒杀与大额神券中签通知</Text>
                            <Tag color="orange" size="small">限时秒杀</Tag>
                          </div>
                          <div className="text-xs text-semi-color-text-2">
                            会员秒杀场次（如 10:00 / 14:00 大牌秒杀活动）成功抢中或获得大额券包时触发提醒
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Tag color={values?.notify_on_spike ? 'green' : 'grey'} size="small">
                            {values?.notify_on_spike ? '已启用' : '已停用'}
                          </Tag>
                          <Form.Switch field="notify_on_spike" noLabel />
                        </div>
                      </div>
                    </div>
                  </Card>

                  <Banner
                    type="info"
                    closeIcon={null}
                    description="所有通知策略均与上方启用的推送通道联动生效。若关闭某个通道，该通道将自动跳过所有策略推送；当没有开启任何通道时，抢单事件依然正常写入本地数据库日志。"
                  />
                </div>
              </TabPane>

              {/* Tab 3: 位置与地理服务 (天地图 Web API) */}
              <TabPane
                tab={
                  <span className="flex items-center gap-2 font-medium px-1">
                    <IconMapPin className="text-semi-color-primary" />
                    位置与地理服务
                  </span>
                }
                itemKey="location"
              >
                <div className="pt-4 space-y-6">
                  <Card
                    className="settings-card rounded-xl border border-semi-color-border shadow-xs"
                    title={
                      <div>
                        <span className="font-semibold text-base">天地图 (tianditu.gov.cn) Web API 服务设置</span>
                        <Text type="secondary" size="small" className="block mt-0.5">
                          国家地理信息公共服务平台，用于全平台抢单基准定位、经纬度高精度逆地理编码与商圈检索
                        </Text>
                      </div>
                    }
                    headerExtraContent={
                      <div className="flex items-center gap-2">
                        <Tag
                          color={values?.tianditu_key ? 'green' : 'amber'}
                          size="small"
                        >
                          {values?.tianditu_key ? '已配置天地图密钥' : '待配置密钥'}
                        </Tag>
                      </div>
                    }
                  >
                    <div className="space-y-4">
                      <Banner
                        type="info"
                        closeIcon={null}
                        description="天地图 (tianditu.gov.cn) 是国家测绘地理信息局建设的权威国家地理信息公共服务平台。配置服务密钥 (Token / tk) 后，全平台店铺抢单基准位置搜索、高精逆地理编码与商圈检索将由天地图官方服务直连驱动，无调用量配额与频次阻碍。"
                      />

                      <Form.Input
                        field="tianditu_key"
                        label="天地图服务密钥 (Token / tk)"
                        placeholder="例如: 109fd484f999e3c0472ab15fa38fe2ac"
                        extraText="国家地理信息公共服务平台控制台生成的 Web API 专属 Token (tk)"
                      />

                      <div className="flex items-center justify-between pt-2 border-t border-semi-color-border">
                        <Button
                          theme="light"
                          icon={<IconExternalOpen />}
                          onClick={() => window.open('https://console.tianditu.gov.cn/api/key', '_blank')}
                        >
                          前往天地图控制台申请密钥
                        </Button>
                        <Button
                          type="primary"
                          theme="light"
                          icon={<IconSend />}
                          loading={testingTianditu}
                          onClick={handleTestTianditu}
                        >
                          测试天地图连通性
                        </Button>
                      </div>
                    </div>
                  </Card>
                </div>
              </TabPane>

              {/* Tab 4: 系统架构与关于 */}
              <TabPane
                tab={
                  <span className="flex items-center gap-2 font-medium px-1">
                    <IconServer className="text-semi-color-primary" />
                    系统架构与关于
                  </span>
                }
                itemKey="about"
              >
                <div className="pt-4 space-y-6">
                  <Card
                    className="settings-card rounded-xl border border-semi-color-border shadow-xs"
                    title={<span className="font-semibold text-base">系统架构与运行环境</span>}
                  >
                    <Descriptions
                      data={aboutDescriptions}
                      row
                      size="medium"
                      className="w-full"
                    />
                  </Card>

                  <Card
                    className="settings-card rounded-xl border border-semi-color-border shadow-xs"
                    title={<span className="font-semibold text-base">安全与隐私声明</span>}
                  >
                    <div className="text-xs text-semi-color-text-2 space-y-2 leading-relaxed">
                      <div>1. 本系统所有抢单任务、自动化脚本和用户登录 Token 均直接保存在本地 SQLite 数据库中，不经过任何第三方服务器中转。</div>
                      <div>2. 微信 ClawBot 通信直接与腾讯官方 iLink 灰度服务器交互，QQ 机器人通过本地 HTTP 协议与本地客户端对接，确保通讯链路全私有化闭环。</div>
                      <div>3. 请妥善保管包含 Authorization 凭据的配置文件及本地数据库文件，切勿将其公开发布至公开代码仓库。</div>
                    </div>
                  </Card>
                </div>
              </TabPane>
            </Tabs>

            {/* 底部保存条 */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-semi-color-bg-0 border border-semi-color-border shadow-xs">
              <div className="flex items-center gap-2">
                <IconInfoCircle className="text-semi-color-primary" />
                <Text type="secondary" size="small">
                  修改设置后请点击右侧保存按钮，配置将即时持久化保存至本地 SQLite 数据库中。
                </Text>
              </div>
              <Space>
                <Button
                  theme="light"
                  onClick={loadData}
                >
                  重置
                </Button>
                <Button
                  theme="solid"
                  type="primary"
                  htmlType="submit"
                  icon={<IconSave />}
                  loading={loading}
                >
                  保存所有配置
                </Button>
              </Space>
            </div>
          </div>
        )}
      </Form>

      {/* 微信 ClawBot 原生扫码登录与激活弹窗 */}
      <ClawBotLoginModal
        visible={clawbotModalVisible}
        onClose={() => setClawbotModalVisible(false)}
        onSuccess={() => {
          loadData();
          Toast.success('微信 ClawBot 配置已成功更新');
        }}
      />
    </div>
  );
};
