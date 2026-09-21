import React, { useState, useEffect, useMemo } from 'react';
import {
  Layout,
  Button,
  Space,
  Tooltip,
  Divider,
  Toast,
  Spin,
  Avatar,
  Dropdown,
  Modal,
  Tag
} from '@douyinfe/semi-ui';
import {
  IconSun,
  IconMoon,
  IconSidebar,
  IconMapPin,
  IconClock,
  IconUser,
  IconTick,
  IconExit,
  IconPlus,
  IconUserSetting
} from '@douyinfe/semi-icons';
import { useAppStore } from '../store/useAppStore';
import { LocationModal } from './LocationModal';
import { api } from '../api';

const { Header } = Layout;

const cleanEmoji = (text?: string): string => {
  if (!text) return '';
  return text.replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{2300}-\u{23FF}]|[\u{2B50}-\u{2B55}]|[\u{FE00}-\u{FE0F}]|[\u{200D}]/gu, '').trim();
};

const getVipBadgeText = (acc?: { vip_level?: number; is_plus?: number | boolean }) => {
  if (!acc) return null;
  const isPlus = Boolean(acc.is_plus);
  return isPlus ? `SVIP${acc.vip_level || 1}` : `VIP${acc.vip_level || 1}`;
};

export const TopHeader: React.FC = () => {
  const isSidebarCollapsed = useAppStore((s) => s.isSidebarCollapsed);
  const toggleSidebarCollapse = useAppStore((s) => s.toggleSidebarCollapse);
  const isDarkMode = useAppStore((s) => s.isDarkMode);
  const setDarkMode = useAppStore((s) => s.setDarkMode);
  const activeLocation = useAppStore((s) => s.activeLocation);
  const accounts = useAppStore((s) => s.accounts);
  const currentAccountKey = useAppStore((s) => s.currentAccountKey);
  const setCurrentAccountKey = useAppStore((s) => s.setCurrentAccountKey);
  const loadAccounts = useAppStore((s) => s.loadAccounts);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  const [locModalVisible, setLocModalVisible] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [ntpOffset, setNtpOffset] = useState<number>(0);
  const [ntpSynced, setNtpSynced] = useState<boolean>(false);
  const [nowTime, setNowTime] = useState<Date>(new Date());

  const currentAccount = useMemo(() => {
    return accounts.find(a => a.key === currentAccountKey) || accounts[0];
  }, [accounts, currentAccountKey]);

  // 毫秒级时钟走字
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTime(new Date(Date.now() + ntpOffset));
    }, 1000);
    return () => clearInterval(timer);
  }, [ntpOffset]);

  // 初次载入时自动进行一次静默 NTP 授时校准
  useEffect(() => {
    api.getTime(false).then((res) => {
      if (res && res.ok && res.timestamp) {
        const offset = (res.timestamp * 1000) - Date.now();
        setNtpOffset(offset);
        setNtpSynced(res.synced || true);
      }
    }).catch(() => {});
  }, []);

  // 点击时间手动触发高精度 NTP 校准
  const handleCalibrateTime = async () => {
    if (calibrating) return;
    setCalibrating(true);
    try {
      const res = await api.getTime(true);
      if (res && res.ok && res.timestamp) {
        const offset = (res.timestamp * 1000) - Date.now();
        setNtpOffset(offset);
        setNtpSynced(true);
        const offsetDesc = `${offset >= 0 ? '+' : ''}${Math.round(offset)}ms`;
        Toast.success(`时钟校准成功！北京时间已同步，本地时差: ${offsetDesc} (授时源: ${res.server || 'ntp.aliyun.com'})`);
      } else {
        Toast.warning('NTP 授时同步响应异常，已回退为本地时钟');
      }
    } catch (e: any) {
      Toast.error(`时钟校准失败: ${e.message || '网络连接超时'}`);
    } finally {
      setCalibrating(false);
    }
  };

  // 退出账号操作
  const handleLogoutAccount = () => {
    if (!currentAccount) return;
    Modal.confirm({
      title: '退出账号确认',
      content: `确定要退出并移除账号「${cleanEmoji(currentAccount.nickname) || '当前账号'}」吗？退出后本地将清除该账号凭据。`,
      okText: '确定退出',
      cancelText: '取消',
      okButtonProps: { type: 'danger' },
      onOk: async () => {
        try {
          await api.deleteAccount(currentAccount.key);
          Toast.success('账号已安全退出');
          await loadAccounts();
        } catch (e: any) {
          Toast.error(`退出账号失败: ${e.message || '网络异常'}`);
        }
      }
    });
  };

  const hours = String(nowTime.getHours()).padStart(2, '0');
  const minutes = String(nowTime.getMinutes()).padStart(2, '0');
  const seconds = String(nowTime.getSeconds()).padStart(2, '0');
  const timeStr = `${hours}:${minutes}:${seconds}`;

  return (
    <Header className="h-[60px] px-6 border-b border-semi-color-border bg-semi-color-bg-0/90 semi-glass-header flex items-center justify-between sticky top-0 z-20 transition-colors duration-200">
      {/* 左侧：收起/展开侧边栏 */}
      <div className="flex items-center">
        <Tooltip content={isSidebarCollapsed ? "展开侧边栏" : "收起侧边栏"} position="bottom">
          <Button
            theme="borderless"
            type="tertiary"
            icon={<IconSidebar size="large" />}
            onClick={toggleSidebarCollapse}
            className="text-semi-color-text-1 hover:text-semi-color-text-0 hover:bg-semi-color-fill-0 transition-colors"
            aria-label={isSidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
          />
        </Tooltip>
      </div>

      {/* 右侧：位置展示、时间展示、明暗切换、最右侧用户头像区域 */}
      <Space spacing="medium" align="center">
        {/* 1. 位置设置 (和时间一样的胶囊样式，无label前缀，悬浮提示完整地址) */}
        <Tooltip
          content={
            activeLocation.cityName
              ? `${activeLocation.cityName} · ${activeLocation.addressName || '已选'}`
              : '未设置抢单地址'
          }
          position="bottom"
        >
          <div
            onClick={() => setLocModalVisible(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-semi-color-fill-0 border border-semi-color-border hover:bg-semi-color-fill-1 hover:border-semi-color-primary transition-colors text-xs select-none cursor-pointer"
          >
            <IconMapPin className="text-semi-color-primary shrink-0" />
            <span className="font-medium text-semi-color-text-0 text-[13px] truncate max-w-[150px] sm:max-w-[200px]">
              {activeLocation.cityName ? `${activeLocation.cityName} · ${activeLocation.addressName || '已选'}` : '未选择位置'}
            </span>
          </div>
        </Tooltip>

        {/* 2. 高精度时间展示与校准 (去除 NTP Tag，悬浮提示点击校准) */}
        <Tooltip
          content={
            calibrating
              ? "正在连接阿里云 NTP 授时中心校准中..."
              : ntpSynced
              ? "已同步国家授时 · 点击向阿里云 NTP 授时中心发起高精度校准"
              : "点击向阿里云 NTP 授时中心发起高精度时钟校准"
          }
          position="bottom"
        >
          <div
            onClick={calibrating ? undefined : handleCalibrateTime}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-semi-color-fill-0 border border-semi-color-border transition-colors text-xs select-none ${
              calibrating ? 'cursor-wait opacity-85' : 'hover:bg-semi-color-fill-1 cursor-pointer'
            }`}
          >
            {calibrating ? (
              <Spin size="small" style={{ display: 'inline-flex', verticalAlign: 'middle' }} />
            ) : (
              <IconClock className="text-semi-color-warning shrink-0" />
            )}
            <span className="font-mono font-semibold text-semi-color-text-0 text-[13px]">
              {timeStr}
            </span>
          </div>
        </Tooltip>

        <Divider layout="vertical" margin="2px" />

        {/* 3. 主题模式切换 */}
        <Tooltip content={isDarkMode ? "切换为亮色主题" : "切换为暗黑主题"} position="bottom">
          <Button
            theme="borderless"
            icon={isDarkMode ? <IconSun size="large" /> : <IconMoon size="large" />}
            onClick={() => setDarkMode(!isDarkMode)}
            className="text-semi-color-text-2 hover:bg-semi-color-fill-0 transition-colors"
          />
        </Tooltip>

        <Divider layout="vertical" margin="2px" />

        {/* 4. 最右侧账号头像区域：只显示头像，鼠标移入出现切换账号与退出账号 */}
        <Dropdown
          position="bottomRight"
          trigger="hover"
          render={
            <Dropdown.Menu style={{ width: 270, padding: 0, overflow: 'hidden' }}>
              {/* 顶部当前账号卡片：贴合顶边无白边 */}
              <div className="px-3.5 py-3 border-b border-semi-color-border bg-semi-color-fill-0">
                <div className="flex items-center gap-2.5">
                  <Avatar
                    size="small"
                    src={currentAccount?.avatar}
                    alt={currentAccount?.nickname}
                    style={{ backgroundColor: 'var(--semi-color-primary)', flexShrink: 0 }}
                  >
                    {currentAccount?.nickname ? cleanEmoji(currentAccount.nickname)[0] : <IconUser />}
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-xs text-semi-color-text-0 truncate max-w-[130px]">
                        {cleanEmoji(currentAccount?.nickname) || (accounts.length === 0 ? '未配置账号' : '当前主账号')}
                      </span>
                      {getVipBadgeText(currentAccount) ? (
                        <Tag
                          color={currentAccount?.is_plus ? 'amber' : 'blue'}
                          size="small"
                          shape="square"
                          className="font-semibold shadow-2xs"
                        >
                          {getVipBadgeText(currentAccount)}
                        </Tag>
                      ) : null}
                    </div>
                    <div className="text-[11px] text-semi-color-text-2 truncate mt-0.5 font-mono">
                      {currentAccount?.silk_id ? `ID: ${currentAccount.silk_id}` : (accounts.length === 0 ? '点击下方进入配置' : '小蚕会员账号')}
                    </div>
                  </div>
                </div>
              </div>

              {/* 下方操作与列表区域 */}
              <div className="py-1">
                {/* 账号切换列表（当账号数量大于1时呈现） */}
                {accounts.length > 1 ? (
                  <>
                    <div className="px-3.5 pt-1.5 pb-1 text-xs text-semi-color-text-2 font-medium">
                      切换账号
                    </div>
                    <div className="max-h-44 overflow-y-auto">
                      {accounts.map(acc => {
                        const isCurrent = acc.key === currentAccount?.key;
                        const vipLabel = getVipBadgeText(acc);
                        return (
                          <Dropdown.Item
                            key={acc.key}
                            active={isCurrent}
                            onClick={() => {
                              if (!isCurrent) {
                                setCurrentAccountKey(acc.key);
                                Toast.success(`已切换账号: ${cleanEmoji(acc.nickname) || '已选账号'}`);
                              }
                            }}
                          >
                            <div className="flex items-center justify-between w-full gap-2 py-0.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <Avatar
                                  size="extra-extra-small"
                                  src={acc.avatar}
                                  style={{ backgroundColor: 'var(--semi-color-primary)', flexShrink: 0 }}
                                >
                                  {acc.nickname ? cleanEmoji(acc.nickname)[0] : <IconUser />}
                                </Avatar>
                                <span className="truncate text-xs text-semi-color-text-0 max-w-[110px]">
                                  {cleanEmoji(acc.nickname) || '未命名'}
                                </span>
                                {vipLabel ? (
                                  <Tag
                                    color={acc.is_plus ? 'amber' : 'blue'}
                                    size="small"
                                    shape="square"
                                    className="font-semibold shadow-2xs"
                                  >
                                    {vipLabel}
                                  </Tag>
                                ) : null}
                              </div>
                              {isCurrent && <IconTick className="text-semi-color-primary shrink-0" />}
                            </div>
                          </Dropdown.Item>
                        );
                      })}
                    </div>
                    <Dropdown.Divider style={{ margin: '4px 0' }} />
                  </>
                ) : null}

                {/* 账号管理 / 添加账号 */}
                <Dropdown.Item
                  icon={<IconPlus />}
                  onClick={() => setActiveTab('accounts')}
                >
                  <span className="text-xs">添加 / 导入新账号</span>
                </Dropdown.Item>
                <Dropdown.Item
                  icon={<IconUserSetting />}
                  onClick={() => setActiveTab('accounts')}
                >
                  <span className="text-xs">账号管理与凭据中心</span>
                </Dropdown.Item>

                {/* 退出当前账号 */}
                {currentAccount && (
                  <>
                    <Dropdown.Divider style={{ margin: '4px 0' }} />
                    <Dropdown.Item
                      type="danger"
                      icon={<IconExit />}
                      onClick={handleLogoutAccount}
                    >
                      <span className="text-xs font-medium">退出账号</span>
                    </Dropdown.Item>
                  </>
                )}
              </div>
            </Dropdown.Menu>
          }
        >
          <div className="cursor-pointer flex items-center justify-center p-0.5 rounded-full hover:ring-2 hover:ring-semi-color-primary/60 transition-all select-none">
            <Avatar
              size="small"
              src={currentAccount?.avatar}
              alt={currentAccount?.nickname}
              style={{ backgroundColor: 'var(--semi-color-primary)' }}
            >
              {currentAccount?.nickname ? cleanEmoji(currentAccount.nickname)[0] : <IconUser />}
            </Avatar>
          </div>
        </Dropdown>
      </Space>

      {/* 全局位置设置弹窗 */}
      <LocationModal
        visible={locModalVisible}
        onClose={() => setLocModalVisible(false)}
      />
    </Header>
  );
};

