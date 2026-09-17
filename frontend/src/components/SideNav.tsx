import React, { useState } from 'react';
import { Nav, Tag } from '@douyinfe/semi-ui';
import {
  IconHome,
  IconUser,
  IconPlay,
  IconShoppingBag,
  IconOrderedList,
  IconFile,
  IconSetting
} from '@douyinfe/semi-icons';
import { useAppStore } from '../store/useAppStore';

export const SideNav: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
  } = useAppStore();

  const [isCollapsed, setIsCollapsed] = useState(false);

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
        isCollapsed={isCollapsed}
        onCollapseChange={(collapsed) => setIsCollapsed(collapsed)}
        selectedKeys={[activeTab]}
        onSelect={(data) => setActiveTab(String(data.itemKey))}
        style={{ height: '100%', borderRight: 'none' }}
        header={{
          logo: (
            <img
              src="/logo.png"
              alt="小蚕会员助手"
              className="w-8 h-8 rounded-lg object-contain shadow-xs flex-shrink-0 cursor-pointer border border-semi-color-border"
              onClick={() => setActiveTab('dashboard')}
            />
          ),
          text: (
            <div className="flex flex-col ml-1 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-[15px] text-semi-color-text-0 tracking-tight">小蚕会员助手</span>
                <Tag color="green" size="small" shape="circle">纯净版</Tag>
              </div>
              <span className="text-[11px] text-semi-color-text-2">直连官方微服务网关</span>
            </div>
          ),
        }}
        items={navItems}
        footer={{
          collapseButton: true,
        }}
      />
    </div>
  );
};
