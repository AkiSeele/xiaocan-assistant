import React, { useEffect, useState, Suspense, lazy } from 'react';
import { Layout, Tooltip } from '@douyinfe/semi-ui';
import { IconChevronLeft, IconChevronRight } from '@douyinfe/semi-icons';
import { SideNav } from './components/SideNav';
import { TopHeader } from './components/TopHeader';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PageLoading } from './components/PageLoading';
import { useAppStore } from './store/useAppStore';

// 包装带动态 Chunk 加载重试与自愈能力的 lazy，解决构建发版后旧版客户端 Chunk 哈希失效问题
const lazyWithRetry = (factory: () => Promise<any>) =>
  lazy(async () => {
    try {
      return await factory();
    } catch (error: any) {
      const isChunkError =
        error?.message?.includes('Failed to fetch dynamically imported module') ||
        error?.message?.includes('Importing a module script failed');
      if (isChunkError) {
        const reloaded = sessionStorage.getItem('chunk_retry_reloaded');
        if (!reloaded) {
          sessionStorage.setItem('chunk_retry_reloaded', '1');
          window.location.reload();
          return new Promise(() => {});
        }
      }
      throw error;
    }
  });

// 路由级按需代码分割 (Code Splitting)，将单体包拆解为按需加载的独立 Chunk
const Dashboard = lazyWithRetry(() => import('./views/Dashboard').then(m => ({ default: m.Dashboard })));
const Accounts = lazyWithRetry(() => import('./views/Accounts').then(m => ({ default: m.Accounts })));
const Automation = lazyWithRetry(() => import('./views/Automation').then(m => ({ default: m.Automation })));
const StoreSniping = lazyWithRetry(() => import('./views/StoreSniping').then(m => ({ default: m.StoreSniping })));
const OrdersView = lazyWithRetry(() => import('./views/OrdersView').then(m => ({ default: m.OrdersView })));
const LogsView = lazyWithRetry(() => import('./views/LogsView').then(m => ({ default: m.LogsView })));
const SettingsView = lazyWithRetry(() => import('./views/SettingsView').then(m => ({ default: m.SettingsView })));

const { Sider, Content } = Layout;

export const App: React.FC = () => {
  const {
    activeTab,
    loadAccounts,
    loadUserInfo,
    isSidebarCollapsed,
    setSidebarCollapsed,
    toggleSidebarCollapse,
  } = useAppStore();

  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => new Set([activeTab]));

  useEffect(() => {
    sessionStorage.removeItem('chunk_retry_reloaded');
    loadAccounts();
    loadUserInfo();
  }, []);

  useEffect(() => {
    setVisitedTabs((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  // 监听屏幕尺寸自适应自动化：窄屏 (< 1200px) 自动收起，大屏 (>= 1200px) 自动恢复展开
  useEffect(() => {
    const handleResize = () => {
      const isNarrow = window.innerWidth < 1200;
      const currentCollapsed = useAppStore.getState().isSidebarCollapsed;
      if (isNarrow && !currentCollapsed) {
        setSidebarCollapsed(true);
      } else if (!isNarrow && currentCollapsed) {
        setSidebarCollapsed(false);
      }
    };
    if (window.innerWidth < 1200) {
      setSidebarCollapsed(true);
    } else {
      setSidebarCollapsed(false);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setSidebarCollapsed]);

  return (
    <Layout className="h-screen w-screen overflow-hidden bg-semi-color-bg-0 flex flex-row">
      <Sider
        breakpoint={['xl', 'lg']}
        onBreakpoint={(_screen, broken) => {
          setSidebarCollapsed(broken);
        }}
        className="relative border-r border-semi-color-border h-full bg-semi-color-bg-1 z-20 shadow-sm shrink-0"
      >
        <SideNav />
        {/* 侧边栏右边缘快捷收起/展开悬浮按钮 (Semi Design 风格) */}
        <div
          className="absolute -right-3 top-1/2 -translate-y-1/2 z-30"
          style={{ pointerEvents: 'auto' }}
        >
          <Tooltip content={isSidebarCollapsed ? "展开侧边栏" : "收起侧边栏"} position="right">
            <button
              type="button"
              onClick={toggleSidebarCollapse}
              className="w-6 h-6 rounded-full bg-semi-color-bg-0 border border-semi-color-border shadow-md flex items-center justify-center cursor-pointer text-semi-color-text-2 hover:text-semi-color-primary hover:border-semi-color-primary hover:scale-110 active:scale-95 transition-all duration-150 focus:outline-none"
              aria-label={isSidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
            >
              {isSidebarCollapsed ? <IconChevronRight size="small" /> : <IconChevronLeft size="small" />}
            </button>
          </Tooltip>
        </div>
      </Sider>
      <Layout className="h-full flex flex-col flex-1 min-w-0 overflow-hidden">
        <div className="shrink-0 z-10">
          <TopHeader />
        </div>
        <Content className={`flex-1 min-h-0 bg-semi-color-bg-0 p-4 md:p-6 ${activeTab === 'store' || activeTab === 'logs' || activeTab === 'orders' ? 'overflow-hidden flex flex-col' : 'overflow-y-auto'}`}>
          <ErrorBoundary>
            <Suspense fallback={<PageLoading />}>
              <div className={`w-full ${activeTab === 'store' || activeTab === 'logs' || activeTab === 'orders' ? 'h-full min-h-0 flex flex-col' : 'min-h-full'}`}>
                {visitedTabs.has('dashboard') && (
                  <div
                    key="tab-dashboard"
                    style={{ display: activeTab === 'dashboard' ? 'block' : 'none' }}
                    className="w-full min-h-full animate-page-enter"
                  >
                    <Dashboard />
                  </div>
                )}
                {visitedTabs.has('accounts') && (
                  <div
                    key="tab-accounts"
                    style={{ display: activeTab === 'accounts' ? 'block' : 'none' }}
                    className="w-full min-h-full animate-page-enter"
                  >
                    <Accounts />
                  </div>
                )}
                {visitedTabs.has('automation') && (
                  <div
                    key="tab-automation"
                    style={{ display: activeTab === 'automation' ? 'block' : 'none' }}
                    className="w-full min-h-full animate-page-enter"
                  >
                    <Automation />
                  </div>
                )}
                {visitedTabs.has('store') && (
                  <div
                    key="tab-store"
                    style={{ display: activeTab === 'store' ? 'flex' : 'none' }}
                    className="w-full h-full min-h-0 flex-col animate-page-enter"
                  >
                    <StoreSniping />
                  </div>
                )}
                {visitedTabs.has('orders') && (
                  <div
                    key="tab-orders"
                    style={{ display: activeTab === 'orders' ? 'flex' : 'none' }}
                    className="w-full h-full min-h-0 flex-col animate-page-enter"
                  >
                    <OrdersView />
                  </div>
                )}
                {visitedTabs.has('logs') && (
                  <div
                    key="tab-logs"
                    style={{ display: activeTab === 'logs' ? 'flex' : 'none' }}
                    className="w-full h-full min-h-0 flex-col animate-page-enter"
                  >
                    <LogsView />
                  </div>
                )}
                {visitedTabs.has('settings') && (
                  <div
                    key="tab-settings"
                    style={{ display: activeTab === 'settings' ? 'block' : 'none' }}
                    className="w-full min-h-full animate-page-enter"
                  >
                    <SettingsView />
                  </div>
                )}
              </div>
            </Suspense>
          </ErrorBoundary>
        </Content>
      </Layout>
    </Layout>
  );
};

export default App;
