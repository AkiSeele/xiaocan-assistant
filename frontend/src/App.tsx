import React, { useEffect, Suspense, lazy } from 'react';
import { Layout } from '@douyinfe/semi-ui';
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
  const { activeTab, loadAccounts, loadUserInfo } = useAppStore();

  useEffect(() => {
    sessionStorage.removeItem('chunk_retry_reloaded');
    loadAccounts();
    loadUserInfo();
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'accounts':
        return <Accounts />;
      case 'automation':
        return <Automation />;
      case 'store':
        return <StoreSniping />;
      case 'orders':
        return <OrdersView />;
      case 'logs':
        return <LogsView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <Layout className="h-screen w-screen overflow-hidden bg-semi-color-bg-0 flex flex-row">
      <Sider className="border-r border-semi-color-border h-full bg-semi-color-bg-1 z-20 shadow-sm shrink-0">
        <SideNav />
      </Sider>
      <Layout className="h-full flex flex-col flex-1 min-w-0 overflow-hidden">
        <div className="shrink-0 z-10">
          <TopHeader />
        </div>
        <Content className={`flex-1 min-h-0 bg-semi-color-bg-0 p-4 md:p-6 ${activeTab === 'store' ? 'overflow-hidden flex flex-col' : 'overflow-y-auto'}`}>
          <ErrorBoundary key={activeTab}>
            <Suspense fallback={<PageLoading />}>
              <div className={`animate-page-enter w-full ${activeTab === 'store' ? 'h-full min-h-0 flex flex-col' : 'min-h-full'}`}>
                {renderContent()}
              </div>
            </Suspense>
          </ErrorBoundary>
        </Content>
      </Layout>
    </Layout>
  );
};

export default App;
