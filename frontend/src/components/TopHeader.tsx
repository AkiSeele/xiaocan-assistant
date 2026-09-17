import React from 'react';
import { Layout, Select, Button, Space, Tag, Avatar, Typography, Tooltip } from '@douyinfe/semi-ui';
import {
  IconSun,
  IconMoon,
  IconPlus,
  IconHome,
  IconUser,
  IconPlay,
  IconShoppingBag,
  IconOrderedList,
  IconFile,
  IconSetting
} from '@douyinfe/semi-icons';
import { useAppStore } from '../store/useAppStore';

const { Header } = Layout;
const { Text } = Typography;

const TAB_INFO: Record<string, { title: string; desc: string; icon: React.ReactNode }> = {
  dashboard: { title: '概览仪表盘', desc: '全盘状态与多账号挂机指标监控', icon: <IconHome /> },
  accounts: { title: '账号管理', desc: '微信扫码接入与多账号托管中心', icon: <IconUser /> },
  automation: { title: '自动化任务', desc: '整点秒杀、积分抽奖与签到定时器', icon: <IconPlay /> },
  store: { title: '店铺抢单预约', desc: '附近霸王餐店铺智能排队与毫秒级抢单', icon: <IconShoppingBag /> },
  orders: { title: '我的订单', desc: '霸王餐返利订单跟踪与外卖单号核销', icon: <IconOrderedList /> },
  logs: { title: '运行日志', desc: '系统任务执行详情与实时排错', icon: <IconFile /> },
  settings: { title: '系统与通知', desc: '推送通知、网络代理与系统参数', icon: <IconSetting /> },
};

export const TopHeader: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    accounts,
    currentAccountKey,
    setCurrentAccountKey,
    isDarkMode,
    setDarkMode,
  } = useAppStore();

  const currentInfo = TAB_INFO[activeTab] || TAB_INFO.dashboard;

  return (
    <Header className="h-[60px] px-6 border-b border-semi-color-border bg-semi-color-bg-0/90 semi-glass-header flex items-center justify-between sticky top-0 z-20 transition-colors duration-200">
      {/* 左侧：当前视图指示 */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-semi-color-fill-0 border border-semi-color-border flex items-center justify-center text-semi-color-primary text-base shadow-xs">
          {currentInfo.icon}
        </div>
        <div className="flex items-center">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-base text-semi-color-text-0">{currentInfo.title}</span>
            <Tag color="cyan" size="small" shape="circle">控制台</Tag>
          </div>
          <Text type="tertiary" size="small" className="hidden lg:inline-block ml-3 pl-3 border-l border-semi-color-border text-[12px]">
            {currentInfo.desc}
          </Text>
        </div>
      </div>

      {/* 右侧：账号快捷切换器、添加账号、明暗切换 */}
      <Space spacing="medium">
        {accounts.length > 0 ? (
          <div className="flex items-center gap-2">
            <Text type="secondary" size="small" className="hidden sm:inline">主控账号:</Text>
            <Select
              value={currentAccountKey}
              onChange={(val) => setCurrentAccountKey(String(val))}
              style={{ width: 200 }}
              renderSelectedItem={(option: any) => {
                const acc = accounts.find(a => a.key === option.value);
                return (
                  <Space align="center">
                    <Avatar size="extra-small" src={acc?.avatar || undefined} color="orange">
                      {acc?.nickname?.[0] || '蚕'}
                    </Avatar>
                    <span className="max-w-[95px] truncate text-sm font-medium">
                      {acc?.nickname}
                    </span>
                    <Tag size="small" color={acc?.is_plus ? "amber" : "blue"}>
                      {acc?.is_plus ? `SVIP${acc?.vip_level || 5}` : `VIP${acc?.vip_level || 1}`}
                    </Tag>
                  </Space>
                );
              }}
            >
              {accounts.map((a) => (
                <Select.Option key={a.key} value={a.key}>
                  <Space align="center">
                    <Avatar size="extra-small" src={a.avatar || undefined} color="orange">
                      {a.nickname?.[0] || '蚕'}
                    </Avatar>
                    <span className="font-medium">{a.nickname}</span>
                    <Tag size="small" color={a.is_plus ? "amber" : "blue"}>
                      {a.is_plus ? `SVIP${a.vip_level || 5}` : `VIP${a.vip_level || 1}`}
                    </Tag>
                  </Space>
                </Select.Option>
              ))}
            </Select>
          </div>
        ) : (
          <Button
            theme="light"
            type="primary"
            icon={<IconPlus />}
            onClick={() => setActiveTab('accounts')}
          >
            添加小蚕账号
          </Button>
        )}

        <Tooltip content={isDarkMode ? "切换为亮色主题" : "切换为暗黑主题"} position="bottom">
          <Button
            theme="borderless"
            icon={isDarkMode ? <IconSun size="large" /> : <IconMoon size="large" />}
            onClick={() => setDarkMode(!isDarkMode)}
            className="text-semi-color-text-2 hover:bg-semi-color-fill-0 transition-colors"
          />
        </Tooltip>
      </Space>
    </Header>
  );
};
