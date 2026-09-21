import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';

interface UseOnActivatedOptions {
  /**
   * 触发节流时间（毫秒），默认 3000ms。在此时间内重复切入同一个 Tab 不会重复触发回调
   */
  throttleMs?: number;
  /**
   * 是否在组件首次挂载时也触发一次回调。默认为 false（首次挂载通常由组件自身的 initial useEffect 负责）
   */
  initial?: boolean;
  /**
   * 组件初次挂载后的保护静默期（毫秒），默认 2500ms。在此时间内切入不重复发包，防止与组件初始化请求冲突
   */
  skipInitialMs?: number;
}

/**
 * 页面激活监听 Hook (适配 Keep-Alive 页面保活架构)
 * 当指定的 targetTab 从未激活状态变为激活状态时自动执行刷新回调
 *
 * @param targetTab 目标标签页标识 (如 'dashboard', 'logs', 'orders', 'automation', 'store', 'accounts')
 * @param callback 激活时要执行的刷新操作
 * @param options 配置项 (throttleMs, initial, skipInitialMs)
 */
export function useOnActivated(
  targetTab: string,
  callback: () => void | Promise<void>,
  options?: UseOnActivatedOptions
) {
  const activeTab = useAppStore((state) => state.activeTab);
  const lastActiveTabRef = useRef<string>(activeTab);
  const mountedAtRef = useRef<number>(Date.now());
  const lastTriggerTimeRef = useRef<number>(options?.initial ? 0 : Date.now());
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const throttleMs = options?.throttleMs ?? 3000;
  const skipInitialMs = options?.skipInitialMs ?? 2500;

  useEffect(() => {
    const prevTab = lastActiveTabRef.current;
    lastActiveTabRef.current = activeTab;

    // 当且仅当 activeTab 变为 targetTab 且之前不是 targetTab 时触发
    if (activeTab === targetTab && prevTab !== targetTab) {
      const now = Date.now();
      // 挂载保护期内且非强制 initial，跳过二次发包
      if (!options?.initial && now - mountedAtRef.current < skipInitialMs) {
        return;
      }

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
  }, [activeTab, targetTab, throttleMs, skipInitialMs, options?.initial]);
}
