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
  IconGift,
  IconTicketCode,
  IconClock,
  IconShield,
  IconUser,
  IconSmartphoneStroked,
  IconGlobe,
  IconCode,
  IconMail
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
        setStatusText('微信授权成功，凭证已自动保存');
        Toast.success('微信授权成功');
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
        Toast.success('微信会话上下文已激活就绪');
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
      title="绑定微信 ClawBot 官方推送通道"
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
              <Button onClick={handleFinish} theme="solid" type="primary">
                完成绑定
              </Button>
            )}
          </Space>
        </div>
      }
      width={480}
      centered
    >
      <div className="py-2">
        {step < 2 && (
          <div className="flex flex-col items-center justify-center p-4">
            <div className="relative w-64 h-64 border border-semi-color-border rounded-xl flex items-center justify-center bg-semi-color-fill-0 overflow-hidden shadow-xs">
              {loadingQr ? (
                <div className="flex flex-col items-center gap-2">
                  <Spin size="large" />
                  <Text size="small" type="secondary">申请微信登录凭据...</Text>
                </div>
              ) : qrImage ? (
                <img
                  src={qrImage}
                  alt="微信登录二维码"
                  className={`w-full h-full object-contain ${qrExpired ? 'filter blur-xs opacity-20' : ''}`}
                />
              ) : (
                <Text type="tertiary" size="small">暂无二维码</Text>
              )}

              {qrExpired && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 p-4 text-center">
                  <Text className="text-white mb-2 text-sm">二维码已失效</Text>
                  <Button
                    theme="solid"
                    type="primary"
                    icon={<IconRefresh />}
                    onClick={fetchQrAndPoll}
                    size="small"
                  >
                    重新生成二维码
                  </Button>
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center gap-2 text-xs text-semi-color-text-2">
              {!qrExpired && !loadingQr && <Spin size="small" />}
              <span>{statusText}</span>
            </div>

            {step === 1 && (
              <div className="w-full mt-4 p-3.5 rounded-lg bg-semi-color-fill-0 border border-semi-color-border space-y-2">
                <div className="text-xs text-semi-color-text-1">
                  若你的手机微信界面提示了数字配对码，请输入以继续授权：
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
                <span>微信授权绑定成功</span>
                {authorizedUser && <Tag color="green" size="small">用户 ID: {authorizedUser}</Tag>}
              </div>

              <div className="text-xs text-semi-color-text-1 leading-relaxed bg-white dark:bg-semi-color-bg-1 p-3 rounded-lg border border-semi-color-border">
                <div className="font-semibold text-semi-color-text-0 mb-1">关键激活步骤提示：</div>
                腾讯官方 iLink 灰度接口要求首条会话必须由微信用户主动发起。
                <br />
                请在手机微信中打开<strong>「微信 ClawBot」</strong>，并向其发送一条测试消息。
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
                description="系统已自动持久化会话凭证，秒杀中签、外卖霸王餐中奖与每日任务运行结果将实时推送至你的微信。"
              />
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

interface ChannelMeta {
  key: string;
  name: string;
  group: 'wechat' | 'collab' | 'geek' | 'infra';
  groupName: string;
  enabledField: keyof SystemSettings;
  badge: string;
  badgeColor: 'green' | 'blue' | 'cyan' | 'violet' | 'orange' | 'grey';
  description: string;
  docUrl?: string;
  docText?: string;
}

const CHANNELS: ChannelMeta[] = [
  // 微信生态
  {
    key: 'clawbot',
    name: '微信官方 ClawBot',
    group: 'wechat',
    groupName: '微信生态直推',
    enabledField: 'clawbot_enabled',
    badge: '官方直连',
    badgeColor: 'green',
    description: '腾讯官方 iLink 灰度协议直连，不折叠支持锁屏提醒，私有化部署免第三方中转。',
  },
  {
    key: 'serverchan',
    name: 'Server酱 (Turbo / 3)',
    group: 'wechat',
    groupName: '微信生态直推',
    enabledField: 'serverchan_enabled',
    badge: '微信公众号',
    badgeColor: 'cyan',
    description: '经典微信消息推送服务，关注「方糖」公众号并绑定 SendKey，即刻在微信接收结构化图文卡片通知。',
    docUrl: 'https://sct.ftqq.com/',
    docText: '获取 SendKey',
  },
  {
    key: 'wxpusher',
    name: 'WxPusher 微信推送',
    group: 'wechat',
    groupName: '微信生态直推',
    enabledField: 'wxpusher_enabled',
    badge: '多关注者推送',
    badgeColor: 'violet',
    description: '专注微信生态的多端推送服务，支持创建专属推送应用，通过关注公众号获取 UID 实现点对点直推。',
    docUrl: 'https://wxpusher.zjiecode.com/',
    docText: 'WxPusher 控制台',
  },
  {
    key: 'wecom',
    name: '企业微信群机器人',
    group: 'wechat',
    groupName: '微信生态直推',
    enabledField: 'wecom_enabled',
    badge: '群组 Webhook',
    badgeColor: 'orange',
    description: '企业微信内部群自定义机器人，基于标准 Webhook 接口发送 Markdown 格式的抢单与秒杀消息。',
    docUrl: 'https://work.weixin.qq.com/api/doc/90000/90136/91770',
    docText: '企业微信官方文档',
  },
  // 办公协同
  {
    key: 'dingtalk',
    name: '钉钉群机器人',
    group: 'collab',
    groupName: '办公协同机器人',
    enabledField: 'dingtalk_enabled',
    badge: 'HMAC 加签',
    badgeColor: 'blue',
    description: '钉钉群自定义机器人，支持配置加签密钥（HMAC-SHA256）进行防篡改安全校验，推送 Markdown 消息。',
    docUrl: 'https://open.dingtalk.com/document/robots/custom-robot-access',
    docText: '钉钉机器人文档',
  },
  {
    key: 'feishu',
    name: '飞书群机器人',
    group: 'collab',
    groupName: '办公协同机器人',
    enabledField: 'feishu_enabled',
    badge: '富文本卡片',
    badgeColor: 'cyan',
    description: '飞书群自定义群机器人，支持推送飞书定制化富文本卡片内容与签名安全校验。',
    docUrl: 'https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot',
    docText: '飞书机器人文档',
  },
  // 移动与极客
  {
    key: 'bark',
    name: 'iOS Bark 推送',
    group: 'geek',
    groupName: '移动与极客推送',
    enabledField: 'bark_enabled',
    badge: 'iOS 毫秒横幅',
    badgeColor: 'green',
    description: 'iOS 平台的纯净通知客户端，支持自定义推送铃声、消息分组归档以及锁屏即时横幅提醒。',
    docUrl: 'https://github.com/Finb/Bark',
    docText: 'Bark 开源主页',
  },
  {
    key: 'telegram',
    name: 'Telegram 机器人',
    group: 'geek',
    groupName: '移动与极客推送',
    enabledField: 'telegram_enabled',
    badge: '内置本地代理',
    badgeColor: 'blue',
    description: 'Telegram Bot API 推送。内置 HTTP/SOCKS 本地代理与自定义 API 网关支持，国内网络环境零超时。',
    docUrl: 'https://core.telegram.org/bots/api',
    docText: 'Telegram Bot 指南',
  },
  {
    key: 'gotify',
    name: 'Gotify 自建推送',
    group: 'geek',
    groupName: '移动与极客推送',
    enabledField: 'gotify_enabled',
    badge: '私有化自建',
    badgeColor: 'violet',
    description: '简单开源的私有化推送服务，支持自定义 1-10 级消息推送优先级，数据完全掌控在个人服务器。',
    docUrl: 'https://gotify.net/',
    docText: 'Gotify 官网',
  },
  {
    key: 'discord',
    name: 'Discord 频道 Webhook',
    group: 'geek',
    groupName: '移动与极客推送',
    enabledField: 'discord_enabled',
    badge: 'Embed 卡片',
    badgeColor: 'blue',
    description: '向指定 Discord 社区服务器频道推送结构化 Embed 富文本卡片消息。',
    docUrl: 'https://support.discord.com/hc/en-us/articles/228383668',
    docText: 'Discord Webhook 指南',
  },
  // 通用设施
  {
    key: 'webhook',
    name: '通用自定义 HTTP Webhook',
    group: 'infra',
    groupName: '通用服务与基础设施',
    enabledField: 'webhook_enabled',
    badge: 'JSON 开放协议',
    badgeColor: 'green',
    description: '向任意第三方 HTTP 服务或自建智能家居中枢（Home Assistant / Node-RED）推送标准 JSON 数据包。',
  },
  {
    key: 'email',
    name: 'SMTP 邮件服务',
    group: 'infra',
    groupName: '通用服务与基础设施',
    enabledField: 'email_enabled',
    badge: '永久免费',
    badgeColor: 'blue',
    description: '基于标准 SMTP 协议直接向用户邮箱发送通知邮件，支持 QQ 邮箱、163 邮箱等开启 SSL 安全直连。',
  },
  {
    key: 'qq_bot',
    name: 'QQ 机器人 (OneBot V11)',
    group: 'infra',
    groupName: '通用服务与基础设施',
    enabledField: 'qq_bot_enabled',
    badge: '群聊 / 私聊',
    badgeColor: 'violet',
    description: '通过 OneBot V11 标准 HTTP 协议直连本地 QQ 机器人（mystool-bot、SnowLuma、NoneBot2），支持群聊与私聊广播。',
  },
];

const GROUPS = [
  { key: 'wechat', title: '微信生态直推' },
  { key: 'collab', title: '办公协同机器人' },
  { key: 'geek', title: '移动与极客推送' },
  { key: 'infra', title: '通用服务与基础设施' },
];

interface StrategyItem {
  field: keyof SystemSettings;
  title: string;
  tagText: string;
  tagColor: 'green' | 'orange' | 'cyan' | 'blue' | 'red' | 'violet' | 'grey';
  icon: React.ReactNode;
  iconBg: string;
  description: string;
}

const STRATEGIES: StrategyItem[] = [
  {
    field: 'notify_on_grab',
    title: '霸王餐自动抢单锁定中签通知',
    tagText: '核心事件',
    tagColor: 'green' as const,
    icon: <IconTick className="text-semi-color-success" />,
    iconBg: 'bg-semi-color-success-light-default',
    description: '当霸王餐名额放量并成功抢单锁定名额时，立即触发全通道通知提醒用户及时前往美团/饿了么下单。',
  },
  {
    field: 'notify_on_spike',
    title: '09:30 SVIP 大牌秒杀与限时抢券通知',
    tagText: '限时秒杀',
    tagColor: 'orange' as const,
    icon: <IconGift className="text-semi-color-warning" />,
    iconBg: 'bg-semi-color-warning-light-default',
    description: '09:30 SVIP 专属大牌券、每日免单券、影院联名卡或元宝秒杀成功领取时触发全通道提醒。',
  },
  {
    field: 'notify_on_meituan',
    title: '美团外卖神券与满减券自动领取通知',
    tagText: '美团领券',
    tagColor: 'cyan' as const,
    icon: <IconTicketCode className="text-semi-color-info" />,
    iconBg: 'bg-semi-color-info-light-default',
    description: '定时调度或手动触发美团账号自动领取天天神券、膨胀券与大额满减券包成功时发送结果汇总。',
  },
  {
    field: 'notify_on_appoint',
    title: '店铺预约状态变动与自动开抢预热通知',
    tagText: '预约监控',
    tagColor: 'blue' as const,
    icon: <IconClock className="text-semi-color-primary" />,
    iconBg: 'bg-semi-color-primary-light-default',
    description: '店铺预约成功建立、开抢前 31 分钟通道预热就绪、或双返利巡检探测完成时发送进度提醒。',
  },
  {
    field: 'notify_on_token_warn',
    title: '账号凭据失效、即将到期与安全风控预警',
    tagText: '安全保障',
    tagColor: 'red' as const,
    icon: <IconShield className="text-semi-color-danger" />,
    iconBg: 'bg-semi-color-danger-light-default',
    description: '检测到账号 401 凭据过期、Token 临期即将失效、或接口触发微信验证码拦截时第一时间紧急报警。',
  },
  {
    field: 'notify_on_coupon_expire',
    title: '特权卡券与返利红包即将到期提醒',
    tagText: '资产保障',
    tagColor: 'violet' as const,
    icon: <IconBell className="text-semi-color-tertiary" />,
    iconBg: 'bg-semi-color-fill-1',
    description: '账户内持有的加赠券、超前抢单券或返利红包即将到期前发送预警，防止关键权益过期作废。',
  },
  {
    field: 'notify_on_task_fail',
    title: '抢单失败、库存售罄与任务异常中断通知',
    tagText: '执行监控',
    tagColor: 'grey' as const,
    icon: <IconAlertCircle className="text-semi-color-text-2" />,
    iconBg: 'bg-semi-color-fill-0',
    description: '开抢瞬间名额已空、库存抢光或接口频控失败时发送通知（默认关闭，开启后可能产生较多非中签消息）。',
  },
];

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
  const [selectedChannelKey, setSelectedChannelKey] = useState<string>('clawbot');
  const [initialValues, setInitialValues] = useState<Partial<SystemSettings>>({
    clawbot_enabled: true,
    clawbot_auth_path: '',
    clawbot_auth_json: '',
    serverchan_enabled: false,
    serverchan_sendkey: '',
    wxpusher_enabled: false,
    wxpusher_app_token: '',
    wxpusher_uids: '',
    wecom_enabled: false,
    wecom_webhook: '',
    dingtalk_enabled: false,
    dingtalk_webhook: '',
    dingtalk_secret: '',
    feishu_enabled: false,
    feishu_webhook: '',
    feishu_secret: '',
    bark_enabled: false,
    bark_url: '',
    bark_group: '小蚕小帮手',
    bark_sound: 'minuet',
    bark_icon: '',
    telegram_enabled: false,
    tg_bot_token: '',
    tg_chat_id: '',
    tg_proxy_url: '',
    tg_api_base_url: '',
    webhook_enabled: false,
    webhook_url: '',
    webhook_method: 'POST',
    webhook_headers: '',
    email_enabled: false,
    email_host: '',
    email_port: 465,
    email_ssl: true,
    email_user: '',
    email_pass: '',
    email_from: '',
    email_to: '',
    gotify_enabled: false,
    gotify_url: '',
    gotify_token: '',
    gotify_priority: 5,
    discord_enabled: false,
    discord_webhook: '',
    discord_username: '小蚕小帮手',
    qq_bot_enabled: true,
    qq_bot_api: 'http://127.0.0.1:8080',
    qq_bot_group_id: '954658571',
    qq_bot_user_id: '2371445972',
    qq_bot_target_type: 'group',
    qq_bot_token: '',
    notify_on_grab: true,
    notify_on_spike: true,
    notify_on_meituan: true,
    notify_on_appoint: true,
    notify_on_token_warn: true,
    notify_on_coupon_expire: true,
    notify_on_task_fail: false,
    tianditu_key: '109fd484f999e3c0472ab15fa38fe2ac',
  });

  // GSAP 动画：顶部 Tab 切换平滑位移淡入 (遵循 gsap-react 与 gsap-performance 规范)
  useGSAP(() => {
    const activePanel = containerRef.current?.querySelector(`.tab-panel-${activeTab}`);
    if (activePanel) {
      gsap.fromTo(
        activePanel,
        { autoAlpha: 0, y: 12 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.3,
          ease: 'power2.out',
          clearProps: 'transform,opacity,visibility',
        }
      );

      // 若切入策略订阅 Tab，触发错峰自然瀑布流
      if (activeTab === 'strategies') {
        const items = containerRef.current?.querySelectorAll('.strategy-item');
        if (items && items.length > 0) {
          gsap.fromTo(
            items,
            { autoAlpha: 0, y: 8 },
            {
              autoAlpha: 1,
              y: 0,
              duration: 0.26,
              stagger: 0.04,
              ease: 'power2.out',
              clearProps: 'transform,opacity,visibility',
              delay: 0.06,
            }
          );
        }
      }
    }
  }, { scope: containerRef, dependencies: [activeTab], revertOnUpdate: true });

  // GSAP 动画：通道切换时，表单内容顺畅淡入浮起 (y: 10 -> 0)，Card Header 与外框保持绝对稳固锚定
  useGSAP(() => {
    const activeForm = containerRef.current?.querySelector(`.channel-form-${selectedChannelKey}`);
    if (activeForm) {
      gsap.fromTo(
        activeForm,
        { autoAlpha: 0, y: 10 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.28,
          ease: 'power2.out',
          clearProps: 'transform,opacity,visibility',
          overwrite: 'auto',
        }
      );
    }

    const headerInfo = containerRef.current?.querySelector('.channel-header-info');
    if (headerInfo) {
      gsap.fromTo(
        headerInfo,
        { autoAlpha: 0.4 },
        {
          autoAlpha: 1,
          duration: 0.22,
          ease: 'power1.out',
          clearProps: 'opacity,visibility',
          overwrite: 'auto',
        }
      );
    }
  }, { scope: containerRef, dependencies: [selectedChannelKey], revertOnUpdate: true });

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
    } catch {
      Toast.error('获取系统设置失败');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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
    } catch {
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
      Toast.warning('请先填写天地图服务密钥');
      return;
    }
    setTestingTianditu(true);
    try {
      const res = await api.testTianditu({ tianditu_key: String(key).trim() });
      if (res.ok) {
        Toast.success(`[成功] ${res.message || '天地图 API 鉴权连通成功，通道运行正常'}`);
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
    } catch {
      Toast.error('保存设置失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribeAll = () => {
    if (!formApiRef.current) return;
    STRATEGIES.forEach((s) => {
      formApiRef.current.setValue(s.field, true);
    });
    Toast.success('已开启全部业务事件推送');
  };

  const handleUnsubscribeAll = () => {
    if (!formApiRef.current) return;
    STRATEGIES.forEach((s) => {
      formApiRef.current.setValue(s.field, false);
    });
    Toast.info('已关闭所有业务事件推送');
  };

  const aboutDescriptions = [
    { key: '系统版本', value: <Tag color="green" size="small">v1.0.2 企业纯净自研版</Tag> },
    { key: '授权状态', value: <Tag color="cyan" size="small">终身免费开放 · 零车位与商业化限制</Tag> },
    { key: '前端技术栈', value: <Tag color="blue" size="small">React 19 + TypeScript + Semi Design + Tailwind CSS v4 + GSAP</Tag> },
    { key: '后端技术栈', value: <Tag color="purple" size="small">FastAPI + APScheduler + 逆向 RPC 驱动 + 腾讯 iLink 灰度协议 + OneBot V11</Tag> },
    { key: '多端协同', value: '内置 13 种主流通知矩阵，支持账号独立定向派发与全系统广播' },
    { key: '数据持久化', value: '本地 SQLite 独立存储，纯私有化运行，零外部数据上报' },
    { key: '部署形态', value: 'Windows 单机 / 局域网内网穿透 / 软路由 / NAS / Linux 服务器自托管' },
  ];

  const getChannelIcon = (key: string) => {
    switch (key) {
      case 'clawbot':
        return <IconQrCode className="text-semi-color-success" />;
      case 'serverchan':
      case 'wxpusher':
        return <IconBell className="text-semi-color-primary" />;
      case 'wecom':
        return <IconUser className="text-semi-color-warning" />;
      case 'dingtalk':
      case 'feishu':
        return <IconSend className="text-semi-color-info" />;
      case 'bark':
        return <IconSmartphoneStroked className="text-semi-color-success" />;
      case 'telegram':
        return <IconGlobe className="text-semi-color-primary" />;
      case 'gotify':
        return <IconServer className="text-semi-color-tertiary" />;
      case 'discord':
      case 'webhook':
        return <IconCode className="text-semi-color-secondary" />;
      case 'email':
        return <IconMail className="text-semi-color-info" />;
      case 'qq_bot':
        return <IconUser className="text-semi-color-tertiary" />;
      default:
        return <IconSend className="text-semi-color-primary" />;
    }
  };

  return (
    <div ref={containerRef} className="w-full space-y-6 pb-12">
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
        {({ values }) => {
          const subscribedCount = STRATEGIES.filter((s) => Boolean(values?.[s.field])).length;

          return (
            <div className="space-y-6">
              <Tabs
                type="line"
                activeKey={activeTab}
                onChange={(key) => setActiveTab(String(key))}
                keepDOM
                lazyRender={false}
                className="bg-transparent"
              >
                {/* Tab 1: 推送通道设置 (Master-Detail 结构) */}
                <TabPane
                  tab={
                    <span className="flex items-center gap-2 font-medium px-2 py-1">
                      <IconSend className="text-semi-color-primary" />
                      推送通道设置
                    </span>
                  }
                  itemKey="channels"
                >
                  <div className="settings-tab-panel tab-panel-channels pt-4">
                    <div className="flex flex-col lg:flex-row gap-6 items-start">
                      {/* 左侧通道导航列表 */}
                      <div className="w-full lg:w-72 shrink-0 bg-semi-color-bg-0 border border-semi-color-border rounded-xl p-2.5 space-y-2.5 shadow-xs max-h-[calc(100vh-220px)] overflow-y-auto">
                        <div className="flex items-center justify-between px-2 pt-0.5">
                          <Text strong className="text-xs text-semi-color-text-1 uppercase tracking-wider">
                            通道目录
                          </Text>
                          <Tag color="blue" size="small">
                            {CHANNELS.filter((c) => Boolean(values?.[c.enabledField])).length} / 13 启用
                          </Tag>
                        </div>

                        {GROUPS.map((g) => {
                          const groupChannels = CHANNELS.filter((c) => c.group === g.key);
                          return (
                            <div key={g.key} className="space-y-0.5">
                              <div className="text-[11px] font-semibold text-semi-color-text-2 px-2 py-0.5 uppercase tracking-wider">
                                {g.title}
                              </div>
                              {groupChannels.map((c) => {
                                const isSelected = selectedChannelKey === c.key;
                                const isEnabled = Boolean(values?.[c.enabledField]);
                                return (
                                  <div
                                    key={c.key}
                                    onClick={() => setSelectedChannelKey(c.key)}
                                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors duration-150 select-none ${
                                      isSelected
                                        ? 'bg-semi-color-primary-light-default text-semi-color-primary font-medium shadow-xs'
                                        : 'text-semi-color-text-0 hover:bg-semi-color-fill-0 active:bg-semi-color-fill-1'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div className="shrink-0">{getChannelIcon(c.key)}</div>
                                      <span className="text-xs truncate">{c.name}</span>
                                    </div>
                                    <Tag
                                      color={isEnabled ? 'green' : 'grey'}
                                      size="small"
                                      className="shrink-0"
                                    >
                                      {isEnabled ? '已开启' : '已停用'}
                                    </Tag>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>

                      {/* 右侧通道精细配置面板 (单容器固定结构，消除外层跳动与边框闪烁) */}
                      {(() => {
                        const currentChannel = CHANNELS.find((c) => c.key === selectedChannelKey) || CHANNELS[0];
                        const isCurrentEnabled = Boolean(values?.[currentChannel.enabledField]);

                        return (
                          <div className="flex-1 min-w-0 w-full channel-detail-panel">
                            <Card
                              className="rounded-xl border border-semi-color-border shadow-xs"
                              header={
                                <div className="flex items-center justify-between w-full flex-wrap gap-3 pb-3 border-b border-semi-color-border">
                                  <div className="space-y-1 channel-header-info">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <Title heading={4} className="!mb-0">{currentChannel.name}</Title>
                                      <Tag color={currentChannel.badgeColor} size="small">{currentChannel.badge}</Tag>
                                    </div>
                                    <Text type="secondary" size="small" className="block">
                                      {currentChannel.description}
                                    </Text>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {CHANNELS.map((c) => {
                                      const isChanEnabled = Boolean(values?.[c.enabledField]);
                                      return (
                                        <div
                                          key={`header_switch_${c.key}`}
                                          className={selectedChannelKey === c.key ? 'flex items-center gap-2' : 'hidden'}
                                        >
                                          <Tag color={isChanEnabled ? 'green' : 'grey'} size="small">
                                            {isChanEnabled ? '已启用通道' : '通道已停用'}
                                          </Tag>
                                          <Form.Switch
                                            key={`switch_${c.key}`}
                                            field={c.enabledField}
                                            noLabel
                                          />
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              }
                            >
                              <div className="space-y-4 pt-1">
                                {/* 通道停用时的温和提示 */}
                                {!isCurrentEnabled && (
                                  <Banner
                                    type="info"
                                    closeIcon={null}
                                    description="当前通道处于停用状态。如需接收抢单与秒杀推送，请打开右上角的启用开关并保存配置。"
                                    className="mb-4"
                                  />
                                )}

                                  {/* 1. 微信 ClawBot */}
                                  <div className={`channel-form-slot channel-form-clawbot ${selectedChannelKey === 'clawbot' ? 'block' : 'hidden'}`}>
                                    <div className="space-y-4">
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
                                            className="shrink-0"
                                          >
                                            扫码绑定微信 ClawBot
                                          </Button>
                                        </div>
                                      )}

                                      <div>
                                        <Button
                                          theme="borderless"
                                          size="small"
                                          icon={advancedClawbotOpen ? <IconChevronUp /> : <IconChevronDown />}
                                          onClick={() => setAdvancedClawbotOpen(!advancedClawbotOpen)}
                                          className="!text-semi-color-text-2"
                                        >
                                          {advancedClawbotOpen ? '收起高级导入选项' : '展开高级导入选项'}
                                        </Button>

                                        <Collapsible isOpen={advancedClawbotOpen}>
                                          <div className="p-3.5 rounded-lg bg-semi-color-fill-0 border border-semi-color-border space-y-3 mt-2">
                                            <div className="text-xs font-semibold text-semi-color-text-1">
                                              高级凭据路径与自定义 JSON 配置
                                            </div>
                                            <Form.Input
                                              field="clawbot_auth_path"
                                              label="外部凭证路径"
                                              placeholder="填写外部凭据文件绝对路径，留空则使用系统默认凭据"
                                              helpText="留空时系统默认从本地数据库与 backend/data/clawbot-auth.json 读取"
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
                                    </div>
                                  </div>

                                  {/* 2. Server酱 */}
                                  <div className={`channel-form-slot channel-form-serverchan ${selectedChannelKey === 'serverchan' ? 'block' : 'hidden'}`}>
                                    <div className="space-y-4">
                                      <Form.Input
                                        field="serverchan_sendkey"
                                        mode="password"
                                        label="Server酱 SendKey"
                                        placeholder="SCTxxxxxxxxxxxxxxxx 或 s3.key"
                                        helpText="在 sct.ftqq.com 微信扫码登录后直接复制 SendKey 填入此处"
                                      />
                                    </div>
                                  </div>

                                  {/* 3. WxPusher */}
                                  <div className={`channel-form-slot channel-form-wxpusher ${selectedChannelKey === 'wxpusher' ? 'block' : 'hidden'}`}>
                                    <div className="space-y-4">
                                      <Form.Input
                                        field="wxpusher_app_token"
                                        mode="password"
                                        label="应用 Token (appToken)"
                                        placeholder="AT_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                                        helpText="在 wxpusher.zjiecode.com 创建应用后获取"
                                      />
                                      <Form.Input
                                        field="wxpusher_uids"
                                        label="目标用户 UID 列表"
                                        placeholder="UID_..., UID_... (多个以英文逗号分隔)"
                                        helpText="微信扫码关注该应用公众号后在后台用户列表中获取"
                                      />
                                    </div>
                                  </div>

                                  {/* 4. 企业微信 */}
                                  <div className={`channel-form-slot channel-form-wecom ${selectedChannelKey === 'wecom' ? 'block' : 'hidden'}`}>
                                    <div className="space-y-4">
                                      <Form.Input
                                        field="wecom_webhook"
                                        label="企业微信群机器人 Webhook 地址"
                                        placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
                                        helpText="在企业微信内部群添加自定义群机器人后复制其 Webhook 接口地址"
                                      />
                                    </div>
                                  </div>

                                  {/* 5. 钉钉 */}
                                  <div className={`channel-form-slot channel-form-dingtalk ${selectedChannelKey === 'dingtalk' ? 'block' : 'hidden'}`}>
                                    <div className="space-y-4">
                                      <Form.Input
                                        field="dingtalk_webhook"
                                        label="钉钉机器人 Webhook 接口地址"
                                        placeholder="https://oapi.dingtalk.com/robot/send?access_token=..."
                                      />
                                      <Form.Input
                                        field="dingtalk_secret"
                                        mode="password"
                                        label="加签 Secret (选填)"
                                        placeholder="SECxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                                        helpText="若机器人在钉钉后台开启了加签安全设置，请输入 SEC 开头的密钥"
                                      />
                                    </div>
                                  </div>

                                  {/* 6. 飞书 */}
                                  <div className={`channel-form-slot channel-form-feishu ${selectedChannelKey === 'feishu' ? 'block' : 'hidden'}`}>
                                    <div className="space-y-4">
                                      <Form.Input
                                        field="feishu_webhook"
                                        label="飞书机器人 Webhook 接口地址"
                                        placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
                                      />
                                      <Form.Input
                                        field="feishu_secret"
                                        mode="password"
                                        label="签名校验 Secret (选填)"
                                        placeholder="若在飞书后台配置了签名校验请输入"
                                      />
                                    </div>
                                  </div>

                                  {/* 7. iOS Bark */}
                                  <div className={`channel-form-slot channel-form-bark ${selectedChannelKey === 'bark' ? 'block' : 'hidden'}`}>
                                    <div className="space-y-4">
                                      <Form.Input
                                        field="bark_url"
                                        label="Bark 推送地址或设备 Key"
                                        placeholder="https://api.day.app/your_key 或输入纯 Key"
                                        helpText="支持 iPhone 极速锁屏横幅与震动，填入 Bark 提供的完整 URL 或 Key"
                                      />
                                      <Row gutter={16}>
                                        <Col span={12}>
                                          <Form.Input
                                            field="bark_sound"
                                            label="提示铃声 (选填)"
                                            placeholder="minuet"
                                            helpText="例如: minuet, alarm, bell"
                                          />
                                        </Col>
                                        <Col span={12}>
                                          <Form.Input
                                            field="bark_group"
                                            label="分组名称 (选填)"
                                            placeholder="小蚕小帮手"
                                          />
                                        </Col>
                                      </Row>
                                    </div>
                                  </div>

                                  {/* 8. Telegram */}
                                  <div className={`channel-form-slot channel-form-telegram ${selectedChannelKey === 'telegram' ? 'block' : 'hidden'}`}>
                                    <div className="space-y-4">
                                      <Row gutter={16}>
                                        <Col span={14}>
                                          <Form.Input
                                            field="tg_bot_token"
                                            mode="password"
                                            label="Telegram Bot Token"
                                            placeholder="123456:ABC-DEF..."
                                            helpText="由 @BotFather 生成的机器人口令"
                                          />
                                        </Col>
                                        <Col span={10}>
                                          <Form.Input
                                            field="tg_chat_id"
                                            label="目标 Chat ID"
                                            placeholder="12345678"
                                            helpText="可向 @userinfobot 发送消息获取"
                                          />
                                        </Col>
                                      </Row>
                                      <Row gutter={16}>
                                        <Col span={12}>
                                          <Form.Input
                                            field="tg_proxy_url"
                                            label="本地网络代理 (选填，国内环境推荐)"
                                            placeholder="http://127.0.0.1:7890"
                                            helpText="直连超时时配置本地 HTTP/SOCKS 代理即可畅通连接"
                                          />
                                        </Col>
                                        <Col span={12}>
                                          <Form.Input
                                            field="tg_api_base_url"
                                            label="自定义 API 基础网关 (选填)"
                                            placeholder="https://api.telegram.org"
                                            helpText="若拥有自建反向代理可填入网关地址"
                                          />
                                        </Col>
                                      </Row>
                                    </div>
                                  </div>

                                  {/* 9. Gotify */}
                                  <div className={`channel-form-slot channel-form-gotify ${selectedChannelKey === 'gotify' ? 'block' : 'hidden'}`}>
                                    <div className="space-y-4">
                                      <Form.Input
                                        field="gotify_url"
                                        label="Gotify 服务端地址"
                                        placeholder="https://gotify.yourdomain.com"
                                      />
                                      <Row gutter={16}>
                                        <Col span={16}>
                                          <Form.Input
                                            field="gotify_token"
                                            mode="password"
                                            label="Application Token"
                                            placeholder="Axxxxxxxxxxxxxx"
                                          />
                                        </Col>
                                        <Col span={8}>
                                          <Form.InputNumber
                                            field="gotify_priority"
                                            label="通知优先级 (1-10)"
                                            placeholder="5"
                                            min={1}
                                            max={10}
                                          />
                                        </Col>
                                      </Row>
                                    </div>
                                  </div>

                                  {/* 10. Discord */}
                                  <div className={`channel-form-slot channel-form-discord ${selectedChannelKey === 'discord' ? 'block' : 'hidden'}`}>
                                    <div className="space-y-4">
                                      <Form.Input
                                        field="discord_webhook"
                                        label="Discord Webhook 链接"
                                        placeholder="https://discord.com/api/webhooks/..."
                                      />
                                      <Form.Input
                                        field="discord_username"
                                        label="机器人展示昵称 (选填)"
                                        placeholder="小蚕小帮手"
                                      />
                                    </div>
                                  </div>

                                  {/* 11. 通用 Webhook */}
                                  <div className={`channel-form-slot channel-form-webhook ${selectedChannelKey === 'webhook' ? 'block' : 'hidden'}`}>
                                    <div className="space-y-4">
                                      <Form.Input
                                        field="webhook_url"
                                        label="目标 Webhook URL 地址"
                                        placeholder="http://127.0.0.1:8123/api/webhook/xiaocan"
                                        helpText="系统将向该地址发送包含 title、content、event、account 等字段的标准化 JSON"
                                      />
                                      <Row gutter={16}>
                                        <Col span={8}>
                                          <Form.Select
                                            field="webhook_method"
                                            label="请求方式"
                                            style={{ width: '100%' }}
                                          >
                                            <Form.Select.Option value="POST">POST (推荐)</Form.Select.Option>
                                            <Form.Select.Option value="GET">GET</Form.Select.Option>
                                          </Form.Select>
                                        </Col>
                                        <Col span={16}>
                                          <Form.Input
                                            field="webhook_headers"
                                            label="自定义请求头 (JSON 格式选填)"
                                            placeholder='例如: {"Authorization": "Bearer ..."}'
                                          />
                                        </Col>
                                      </Row>
                                    </div>
                                  </div>

                                  {/* 12. SMTP 邮件 */}
                                  <div className={`channel-form-slot channel-form-email ${selectedChannelKey === 'email' ? 'block' : 'hidden'}`}>
                                    <div className="space-y-4">
                                      <Row gutter={16}>
                                        <Col span={14}>
                                          <Form.Input
                                            field="email_host"
                                            label="SMTP 服务器地址"
                                            placeholder="smtp.qq.com / smtp.163.com"
                                          />
                                        </Col>
                                        <Col span={10}>
                                          <Form.InputNumber
                                            field="email_port"
                                            label="端口 (默认 465 SSL)"
                                            placeholder="465"
                                          />
                                        </Col>
                                      </Row>
                                      <Row gutter={16}>
                                        <Col span={12}>
                                          <Form.Input
                                            field="email_user"
                                            label="发信邮箱账号"
                                            placeholder="your_email@qq.com"
                                          />
                                        </Col>
                                        <Col span={12}>
                                          <Form.Input
                                            field="email_pass"
                                            mode="password"
                                            label="邮箱授权码 / 密码"
                                            placeholder="输入邮箱客户端授权码"
                                            helpText="QQ/163邮箱需在网页设置中生成专属授权码"
                                          />
                                        </Col>
                                      </Row>
                                      <Row gutter={16}>
                                        <Col span={15}>
                                          <Form.Input
                                            field="email_to"
                                            label="接收通知的收件人邮箱"
                                            placeholder="receiver@example.com (支持逗号分隔多个)"
                                          />
                                        </Col>
                                        <Col span={9}>
                                          <div className="flex flex-col">
                                            <div className="h-6" />
                                            <div className="h-8 flex items-center">
                                              <Form.Checkbox
                                                field="email_ssl"
                                                noLabel
                                              >
                                                启用 SSL 安全连接 (465)
                                              </Form.Checkbox>
                                            </div>
                                          </div>
                                        </Col>
                                      </Row>
                                    </div>
                                  </div>

                                  {/* 13. QQ 机器人 */}
                                  <div className={`channel-form-slot channel-form-qq_bot ${selectedChannelKey === 'qq_bot' ? 'block' : 'hidden'}`}>
                                    <div className="space-y-4">
                                      <Banner
                                        type="info"
                                        closeIcon={null}
                                        description="支持直连本地 mystool-bot、SnowLuma 或 NoneBot2。当抢单中签或秒杀成功时，机器人将在目标群聊或私聊向你发送提醒。"
                                      />
                                      <Row gutter={16}>
                                        <Col span={14}>
                                          <Form.Input
                                            field="qq_bot_api"
                                            label="OneBot V11 HTTP 接口地址"
                                            placeholder="http://127.0.0.1:8080"
                                            helpText="支持 NoneBot2 内部路由或 SnowLuma HTTP 服务"
                                          />
                                        </Col>
                                        <Col span={10}>
                                          <Form.Input
                                            field="qq_bot_token"
                                            mode="password"
                                            label="Access Token (选填)"
                                            placeholder="若协议端配置请输入，默认留空"
                                          />
                                        </Col>
                                      </Row>
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
                                            label="管理员 QQ 号"
                                            placeholder="2371445972"
                                            helpText="接收私聊提醒的管理员 QQ 号"
                                          />
                                        </Col>
                                      </Row>
                                      <Form.RadioGroup
                                        field="qq_bot_target_type"
                                        label="推送目标范围"
                                        direction="horizontal"
                                      >
                                        <Form.Radio value="group">仅推送至目标群聊</Form.Radio>
                                        <Form.Radio value="private">仅私聊管理员推送</Form.Radio>
                                        <Form.Radio value="both">群聊与私聊同时推送</Form.Radio>
                                      </Form.RadioGroup>
                                    </div>
                                  </div>

                                {/* 卡片底部统一样式操作栏 (紧凑贴合表单，杜绝巨大空白断层) */}
                                <div className="flex items-center justify-between pt-4 mt-6 border-t border-semi-color-border flex-wrap gap-2">
                                  <div>
                                    {currentChannel.docUrl ? (
                                      <Button
                                        theme="borderless"
                                        size="small"
                                        icon={<IconExternalOpen />}
                                        onClick={() => window.open(currentChannel.docUrl, '_blank')}
                                      >
                                        {currentChannel.docText || '查看官方配置指引'}
                                      </Button>
                                    ) : currentChannel.key === 'clawbot' && clawbotStatus?.ready ? (
                                      <Button
                                        theme="light"
                                        size="small"
                                        icon={<IconRefresh />}
                                        onClick={handleRefreshClawBot}
                                      >
                                        检测微信凭据状态
                                      </Button>
                                    ) : null}
                                  </div>

                                  <Button
                                    theme="solid"
                                    type="secondary"
                                    icon={<IconSend />}
                                    loading={testingChannel === currentChannel.key}
                                    onClick={() => handleTestChannel(currentChannel.key)}
                                  >
                                    测试此通道连通性
                                  </Button>
                                </div>
                              </div>
                            </Card>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </TabPane>

                {/* Tab 2: 通知触发策略 (结构化列表) */}
                <TabPane
                  tab={
                    <span className="flex items-center gap-2 font-medium px-2 py-1">
                      <IconBell className="text-semi-color-primary" />
                      通知触发策略
                    </span>
                  }
                  itemKey="strategies"
                >
                  <div className="settings-tab-panel tab-panel-strategies pt-4 space-y-6">
                    <Card
                      className="rounded-xl border border-semi-color-border shadow-xs"
                      title={
                        <div>
                          <span className="font-semibold text-base">业务事件触发与订阅策略</span>
                          <Text type="secondary" size="small" className="block mt-0.5">
                            细粒度控制不同业务事件产生时的提醒行为，触发后将通过已启用的全部通道同步发送。未订阅事件直接在分发中枢过滤，绝不扰民。
                          </Text>
                        </div>
                      }
                      headerExtraContent={
                        <div className="flex items-center gap-3">
                          <Tag color="blue" size="small">
                            已订阅 {subscribedCount} / 7 项事件
                          </Tag>
                          <Space>
                            <Button size="small" theme="light" onClick={handleSubscribeAll}>
                              全部开启
                            </Button>
                            <Button size="small" theme="light" onClick={handleUnsubscribeAll}>
                              全部关闭
                            </Button>
                          </Space>
                        </div>
                      }
                    >
                      <div className="divide-y divide-semi-color-border">
                        {STRATEGIES.map((item) => (
                          <div
                            key={item.field}
                            className="strategy-item flex items-center justify-between py-3.5 px-2 hover:bg-semi-color-fill-0 rounded-lg transition-colors gap-4"
                          >
                            <div className="flex items-center gap-3.5 min-w-0">
                              <div className={`w-9 h-9 rounded-lg shrink-0 flex items-center justify-center ${item.iconBg}`}>
                                {item.icon}
                              </div>
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Text strong className="text-sm text-semi-color-text-0">{item.title}</Text>
                                  <Tag color={item.tagColor} size="small">{item.tagText}</Tag>
                                </div>
                                <div className="text-xs text-semi-color-text-2 leading-relaxed">
                                  {item.description}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Tag color={values?.[item.field] ? 'green' : 'grey'} size="small">
                                {values?.[item.field] ? '已订阅' : '未订阅'}
                              </Tag>
                              <Form.Switch field={item.field} noLabel />
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>

                    <Banner
                      type="info"
                      closeIcon={null}
                      description="所有通知策略均与上方启用的推送通道联动生效。若关闭某个通道，该通道将自动跳过所有策略推送；当没有开启任何通道时，抢单事件依然正常写入本地数据库日志。"
                    />
                  </div>
                </TabPane>

                {/* Tab 3: 位置与地理服务 */}
                <TabPane
                  tab={
                    <span className="flex items-center gap-2 font-medium px-2 py-1">
                      <IconMapPin className="text-semi-color-primary" />
                      位置与地理服务
                    </span>
                  }
                  itemKey="location"
                >
                  <div className="settings-tab-panel tab-panel-location pt-4 space-y-6">
                    <Card
                      className="rounded-xl border border-semi-color-border shadow-xs"
                      title={
                        <div>
                          <span className="font-semibold text-base">天地图 (tianditu.gov.cn) Web API 逆地理编码服务</span>
                          <Text type="secondary" size="small" className="block mt-0.5">
                            国家地理信息公共服务平台，用于全平台抢单基准定位、经纬度高精度逆地理编码与商圈检索
                          </Text>
                        </div>
                      }
                      headerExtraContent={
                        <Tag
                          color={values?.tianditu_key ? 'green' : 'amber'}
                          size="small"
                        >
                          {values?.tianditu_key ? '已配置天地图密钥' : '待配置密钥'}
                        </Tag>
                      }
                    >
                      <div className="space-y-4">
                        <Banner
                          type="info"
                          closeIcon={null}
                          description="天地图是国家测绘地理信息局建设的国家地理信息公共服务平台。配置服务密钥后，店铺抢单基准位置搜索、高精逆地理编码与商圈检索将由天地图官方服务直连驱动，无配额与频次限制。"
                        />

                        <Form.Input
                          field="tianditu_key"
                          label="天地图服务密钥"
                          placeholder="例如: 109fd484f999e3c0472ab15fa38fe2ac"
                          extraText="国家地理信息公共服务平台控制台生成的 Web API 专属密钥"
                        />

                        <div className="flex items-center justify-between pt-2 border-t border-semi-color-border">
                          <Button
                            theme="light"
                            icon={<IconExternalOpen />}
                            onClick={() => window.open('https://www.tianditu.gov.cn/', '_blank')}
                          >
                            前往天地图控制台
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
                    <span className="flex items-center gap-2 font-medium px-2 py-1">
                      <IconServer className="text-semi-color-primary" />
                      系统架构与关于
                    </span>
                  }
                  itemKey="about"
                >
                  <div className="settings-tab-panel tab-panel-about pt-4 space-y-6">
                    <Card
                      className="rounded-xl border border-semi-color-border shadow-xs"
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
                      className="rounded-xl border border-semi-color-border shadow-xs"
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

              {/* 底部统一样式保存条 */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 rounded-xl bg-semi-color-bg-0 border border-semi-color-border shadow-xs gap-3">
                <div className="flex items-center gap-2">
                  <IconInfoCircle className="text-semi-color-primary shrink-0" />
                  <Text type="secondary" size="small">
                    修改通道参数或触发策略后，请点击右侧保存按钮。设置将即时写入本地 SQLite 数据库生效。
                  </Text>
                </div>
                <Space className="shrink-0">
                  <Button
                    theme="light"
                    onClick={loadData}
                  >
                    重置更改
                  </Button>
                  <Button
                    theme="solid"
                    type="primary"
                    htmlType="submit"
                    icon={<IconSave />}
                    loading={loading}
                  >
                    保存全部设置
                  </Button>
                </Space>
              </div>
            </div>
          );
        }}
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
