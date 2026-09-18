import React from 'react';
import { Nav, Select, Avatar, Space, Button, Tooltip, Dropdown } from '@douyinfe/semi-ui';
import {
  IconHome,
  IconUser,
  IconPlay,
  IconShoppingBag,
  IconOrderedList,
  IconFile,
  IconSetting,
  IconPlus,
} from '@douyinfe/semi-icons';
import { useAppStore } from '../store/useAppStore';

export const SideNav: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    isSidebarCollapsed,
    setSidebarCollapsed,
    accounts,
    currentAccountKey,
    setCurrentAccountKey,
  } = useAppStore();

  const currentAccount = accounts.find((a) => a.key === currentAccountKey) || accounts[0];

  const navItems = [
    { itemKey: 'dashboard', text: '概览仪表盘', icon: <IconHome size="large" /> },
    { itemKey: 'accounts', text: '账号管理', icon: <IconUser size="large" /> },
    { itemKey: 'automation', text: '自动化任务', icon: <IconPlay size="large" /> },
    { itemKey: 'store', text: '店铺抢单预约', icon: <IconShoppingBag size="large" /> },
    { itemKey: 'orders', text: '我的订单', icon: <IconOrderedList size="large" /> },
    { itemKey: 'logs', text: '运行日志', icon: <IconFile size="large" /> },
    { itemKey: 'settings', text: '系统与通知', icon: <IconSetting size="large" /> },
  ];

  return (
    <div className="h-full flex flex-col">
      <Nav
        mode="vertical"
        isCollapsed={isSidebarCollapsed}
        onCollapseChange={(collapsed) => setSidebarCollapsed(collapsed)}
        selectedKeys={[activeTab]}
        onSelect={(data) => setActiveTab(String(data.itemKey))}
        style={{ height: '100%', borderRight: 'none' }}
        header={{
          logo: isSidebarCollapsed ? (
            <Tooltip content="小蚕小帮手" position="right">
              <div
                className="w-10 h-10 rounded-xl bg-semi-color-primary-light-default flex items-center justify-center cursor-pointer transition-all duration-200 hover:scale-105 shadow-xs mx-auto"
                onClick={() => setActiveTab('dashboard')}
              >
                <img
                  src="/logo.png"
                  alt="小蚕小帮手"
                  className="w-8 h-8 object-contain rounded-lg"
                />
              </div>
            </Tooltip>
          ) : (
            <div
              className="w-8 h-8 rounded-xl bg-semi-color-primary-light-default flex items-center justify-center cursor-pointer transition-transform duration-200 hover:scale-105 shrink-0"
              onClick={() => setActiveTab('dashboard')}
            >
              <img
                src="/logo.png"
                alt="小蚕小帮手"
                className="w-6.5 h-6.5 object-contain rounded-lg"
              />
            </div>
          ),
          text: (
            <div className="flex items-center ml-2.5 cursor-pointer select-none" onClick={() => setActiveTab('dashboard')}>
              <span className="font-bold text-[16px] text-semi-color-text-0 tracking-tight hover:text-semi-color-primary transition-colors">
                小蚕小帮手
              </span>
            </div>
          ),
        }}
        items={navItems}
        footer={
          isSidebarCollapsed ? (
            <div className="w-full flex justify-center py-2.5 border-t border-semi-color-border/60">
              <Dropdown
                trigger="click"
                position="rightBottom"
                render={
                  <Dropdown.Menu>
                    {accounts.map((a) => (
                      <Dropdown.Item
                        key={a.key}
                        active={a.key === currentAccountKey}
                        onClick={() => setCurrentAccountKey(a.key)}
                      >
                        <div className="flex items-center gap-2 py-1">
                          <Avatar size="extra-small" src={a.avatar || undefined} color="orange">
                            {a.nickname?.[0] || '蚕'}
                          </Avatar>
                          <span className="font-medium text-xs max-w-[140px] truncate text-semi-color-text-0">{a.nickname}</span>
                        </div>
                      </Dropdown.Item>
                    ))}
                    {accounts.length > 0 && <Dropdown.Divider />}
                    <Dropdown.Item onClick={() => setActiveTab('accounts')}>
                      <div className="flex items-center gap-1.5 text-xs text-semi-color-primary py-0.5">
                        <IconPlus size="small" /> 添加账号
                      </div>
                    </Dropdown.Item>
                  </Dropdown.Menu>
                }
              >
                <Tooltip content={currentAccount?.nickname || '未添加账号'} position="right">
                  <div className="cursor-pointer p-1.5 rounded-xl hover:bg-semi-color-fill-0 transition-colors flex items-center justify-center">
                    <Avatar size="small" src={currentAccount?.avatar || undefined} color="orange">
                      {currentAccount?.nickname?.[0] || '蚕'}
                    </Avatar>
                  </div>
                </Tooltip>
              </Dropdown>
            </div>
          ) : (
            <div className="w-full px-2.5 py-2.5 border-t border-semi-color-border/60">
              {accounts.length > 0 ? (
                <Select
                  value={currentAccountKey}
                  onChange={(val) => setCurrentAccountKey(String(val))}
                  style={{ width: '100%' }}
                  renderSelectedItem={(option: any) => {
                    const acc = accounts.find((a) => a.key === option.value);
                    return (
                      <div className="flex items-center gap-2 overflow-hidden w-full">
                        <Avatar size="extra-small" src={acc?.avatar || undefined} color="orange" className="shrink-0">
                          {acc?.nickname?.[0] || '蚕'}
                        </Avatar>
                        <span className="truncate text-xs font-medium text-semi-color-text-0">
                          {acc?.nickname}
                        </span>
                      </div>
                    );
                  }}
                >
                  {accounts.map((a) => (
                    <Select.Option key={a.key} value={a.key}>
                      <Space align="center">
                        <Avatar size="extra-small" src={a.avatar || undefined} color="orange">
                          {a.nickname?.[0] || '蚕'}
                        </Avatar>
                        <span className="font-medium text-xs text-semi-color-text-0">{a.nickname}</span>
                      </Space>
                    </Select.Option>
                  ))}
                </Select>
              ) : (
                <Button
                  theme="light"
                  type="primary"
                  icon={<IconPlus />}
                  block
                  size="small"
                  onClick={() => setActiveTab('accounts')}
                >
                  添加账号
                </Button>
              )}
            </div>
          )
        }
      />
    </div>
  );
};
