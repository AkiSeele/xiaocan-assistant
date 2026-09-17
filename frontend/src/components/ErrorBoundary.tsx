import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Card, Button, Typography, Space } from '@douyinfe/semi-ui';
import { IconAlertTriangle, IconRefresh, IconHome } from '@douyinfe/semi-icons';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

const { Title, Paragraph, Text } = Typography;

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('[ErrorBoundary] 组件树渲染异常捕获:', error, errorInfo);

    // 若属于发版后代码块哈希变动的资源加载错误，自动无感重载页面加载最新版本
    const msg = error?.message || '';
    if (
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Importing a module script failed') ||
      msg.includes('ChunkLoadError')
    ) {
      const last = Number(sessionStorage.getItem('chunk_auto_reload') || 0);
      if (Date.now() - last > 5000) {
        sessionStorage.setItem('chunk_auto_reload', String(Date.now()));
        window.location.reload();
      }
    }
  }

  private isChunkLoadError = (): boolean => {
    const msg = this.state.error?.message || '';
    return (
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Importing a module script failed') ||
      msg.includes('ChunkLoadError')
    );
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isChunk = this.isChunkLoadError();

      return (
        <div className="w-full min-h-[400px] flex items-center justify-center p-6">
          <Card className={`max-w-xl w-full border ${isChunk ? 'border-semi-color-primary-light-active' : 'border-semi-color-danger-light-active'} rounded-2xl shadow-sm bg-semi-color-bg-0 text-center py-8 px-6`}>
            <div className={`w-14 h-14 mx-auto mb-4 rounded-2xl ${isChunk ? 'bg-semi-color-primary-light-default text-semi-color-primary' : 'bg-semi-color-danger-light-default text-red-500'} flex items-center justify-center`}>
              {isChunk ? <IconRefresh size="extra-large" /> : <IconAlertTriangle size="extra-large" />}
            </div>

            <Title heading={4} className="mb-2 text-semi-color-text-0">
              {isChunk ? '系统已发布新版本，请刷新加载最新模块' : '页面渲染出现局部异常'}
            </Title>

            <Paragraph type="secondary" className="text-sm mb-6 max-w-md mx-auto">
              {isChunk
                ? '检测到前端已构建发布新版本静态资源，浏览器当前仍持有旧版路由缓存。点击下方按钮即可一键同步至最新版本。'
                : '当前功能组件在渲染时遇到未预期的数据格式或网络异常。系统已隔离此错误，其他功能不受影响。'}
            </Paragraph>

            {this.state.error && (
              <div className="mb-6 p-3 bg-semi-color-fill-0 rounded-lg text-left overflow-x-auto border border-semi-color-border text-xs font-mono text-semi-color-text-2 max-h-32">
                <Text type="danger" strong>
                  {this.state.error.name}: {this.state.error.message}
                </Text>
              </div>
            )}

            <Space spacing="medium">
              <Button
                theme="solid"
                type="primary"
                icon={<IconRefresh />}
                onClick={this.handleReload}
              >
                立即刷新页面
              </Button>
              {!isChunk && (
                <Button
                  theme="light"
                  type="tertiary"
                  icon={<IconHome />}
                  onClick={this.handleReset}
                >
                  重试加载
                </Button>
              )}
            </Space>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
