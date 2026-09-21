import './semi-layer.css';
import '@douyinfe/semi-ui/react19-adapter';
import '@douyinfe/semi-icons/lib/es/styles/icons.css';
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// 自动捕获 Vite 代码拆分 Chunk 过期事件，无感刷新页面加载最新版本
window.addEventListener('vite:preloadError', (event) => {
  console.warn('[Vite] 检测到前端静态资源 Chunk 哈希已更新，自动重载页面以同步最新模块...', event);
  window.location.reload();
});

createRoot(document.getElementById('root')!).render(
  <App />
);

