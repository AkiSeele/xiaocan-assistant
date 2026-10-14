import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';

interface UseOnActivatedOptions {
  /**
   * 触发节流时间（毫秒），默认 300ms。在此时间内重复切入或重复点击不会重复触发回调
   */
  throttleMs?: number;
  /**
   * 是否在组件首次挂载时也触发一次回调。默认为 false（首次挂载通常由组件自身的 initial useEffect 负责）
   */
  initial?: boolean;
}

/**
 * 页面激活监听 Hook (适配 Keep-Alive 页面保活架构与顶级导航重登)
 * 当用户切入指定的 targetTab，或在当前 tab 重复点击顶级导航/Logo 时自动执行刷新回调
 *
 * @param targetTab 目标标签页标识 (如 'dashboard', 'logs', 'orders', 'automation', 'store', 'accounts')
 * @param callback 激活时要执行的刷新操作
 * @param options 配置项 (throttleMs, initial)
 */
export function useOnActivated(
  targetTab: string,
  callback: () => void | Promise<void>,
  options?: UseOnActivatedOptions
) {
  const activeTab = useAppStore((state) => state.activeTab);
  const tabActivationTick = useAppStore((state) => state.tabActivationTick);
  const lastActiveTabRef = useRef<string>(activeTab);
  const lastTickRef = useRef<number>(tabActivationTick);
  const lastTriggerTimeRef = useRef<number>(0);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  // 默认节流 300ms，防止用户极快双击抖动，同时保证每次正规切页或点击导航都能立即触发刷新
  const throttleMs = Math.min(options?.throttleMs ?? 300, 300);

  useEffect(() => {
    const prevTab = lastActiveTabRef.current;
    const prevTick = lastTickRef.current;
    lastActiveTabRef.current = activeTab;
    lastTickRef.current = tabActivationTick;

    // 判定 1: 跨 Tab 切入 targetTab (例如从 orders 切到 dashboard)
    const isTabSwitch = activeTab === targetTab && prevTab !== targetTab;
    // 判定 2: 在 targetTab 当前页内，重复点击顶级侧边导航项或 Logo
    const isTopLevelReClick = activeTab === targetTab && prevTick !== tabActivationTick;

    if (isTabSwitch || isTopLevelReClick) {
      const now = Date.now();
      if (now - lastTriggerTimeRef.current >= throttleMs) {
        lastTriggerTimeRef.current = now;
        // 让出 80ms 确保页面进场动效 (180ms) 优先在 GPU 合成通道渲染，防止接口发包与数据解析阻塞主线程
        const timer = setTimeout(() => {
          try {
            callbackRef.current();
          } catch (e) {
            console.error(`[useOnActivated] Error executing callback for tab: ${targetTab}`, e);
          }
        }, 80);
        return () => clearTimeout(timer);
      }
    }
  }, [activeTab, tabActivationTick, targetTab, throttleMs]);
}
