import React from 'react';
import { Nav, Button, Select, Tag, Avatar, Space } from '@douyinfe/semi-ui';
import {
  IconHome,
  IconUser,
  IconPlay,
  IconShoppingBag,
  IconFile,
  IconSetting,
  IconMoon,
  IconSun,
  IconPlus,
  IconOrderedList
} from '@douyinfe/semi-icons';
import { useAppStore } from '../store/useAppStore';

export const HeaderNav: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    accounts,
    currentAccountKey,
    setCurrentAccountKey,
    isDarkMode,
    setDarkMode,
  } = useAppStore();

  const navItems = [
    { itemKey: 'dashboard', text: '概览仪表盘', icon: <IconHome /> },
    { itemKey: 'accounts', text: '账号管理', icon: <IconUser /> },
    { itemKey: 'automation', text: '自动化任务', icon: <IconPlay /> },
    { itemKey: 'store', text: '店铺抢单预约', icon: <IconShoppingBag /> },
    { itemKey: 'orders', text: '我的订单', icon: <IconOrderedList /> },
    { itemKey: 'logs', text: '运行日志', icon: <IconFile /> },
    { itemKey: 'settings', text: '系统与通知', icon: <IconSetting /> },
  ];

  return (
    <div className="border-b border-semi-color-border">
      <Nav
        mode="horizontal"
        selectedKeys={[activeTab]}
        onSelect={(data) => setActiveTab(String(data.itemKey))}
        header={{
          logo: (
            <img
              src="/logo.png"
              alt="小蚕会员助手"
              className="w-8 h-8 rounded-lg object-contain shadow-xs border border-semi-color-border"
            />
          ),
          text: (
            <Space align="center">
              <span className="font-semibold text-base text-semi-color-text-0">小蚕会员助手</span>
              <Tag color="green" size="small" shape="circle">全功能·纯净版</Tag>
            </Space>
          ),
        }}
        items={navItems}
        footer={
          <Space spacing="medium">
            {accounts.length > 0 ? (
              <Select
                value={currentAccountKey}
                onChange={(val) => setCurrentAccountKey(String(val))}
                style={{ width: 180 }}
                renderSelectedItem={(option: any) => {
                  const acc = accounts.find(a => a.key === option.value);
                  return (
                    <Space align="center">
                      <Avatar size="extra-small" src={acc?.avatar || undefined} color="orange">
                        {acc?.nickname?.[0] || '蚕'}
                      </Avatar>
                      <span className="max-w-[100px] truncate">
                        {acc?.nickname}
                      </span>
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
                      <span>{a.nickname}</span>
                      <Tag size="small" color={a.is_plus ? "amber" : "blue"}>
                        {a.is_plus ? `SVIP${a.vip_level || 5}` : `VIP${a.vip_level || 1}`}
                      </Tag>
                    </Space>
                  </Select.Option>
                ))}
              </Select>
            ) : (
              <Button
                theme="light"
                type="primary"
                icon={<IconPlus />}
                onClick={() => setActiveTab('accounts')}
              >
                添加小蚕号
              </Button>
            )}

            <Button
              theme="borderless"
              icon={isDarkMode ? <IconSun /> : <IconMoon />}
              onClick={() => setDarkMode(!isDarkMode)}
              className="text-semi-color-text-2"
            />
          </Space>
        }
      />
    </div>
  );
};
