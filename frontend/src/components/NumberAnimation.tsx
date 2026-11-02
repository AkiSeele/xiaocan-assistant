import React, { useRef, useMemo } from 'react';
import { gsap, useGSAP } from '../utils/animations';

export interface NumberAnimationProps {
  /** 目标数值 */
  to: number;
  /** 起始数值 (未指定时首次从 0 开始过渡，后续变化从上一次的值过渡) */
  from?: number;
  /** 小数位数，默认 0 */
  precision?: number;
  /** 动画持续时间 (秒)，默认 0.8 */
  duration?: number;
  /** 延迟启动时间 (秒)，默认 0 */
  delay?: number;
  /** 是否开启千分位分隔符，例如 1,234.56，默认 false */
  showSeparator?: boolean;
  /** 数值前缀 (例如 ¥) */
  prefix?: React.ReactNode;
  /** 数值后缀 (例如 笔 / 元) */
  suffix?: React.ReactNode;
  /** 外部触发刷新标识 (当数值未变但外部点击刷新时重新播放动画) */
  refreshKey?: any;
  /** 自定义格式化函数 */
  formatter?: (val: number) => string;
  /** 容器自定义类名 */
  className?: string;
  /** 容器行内样式 */
  style?: React.CSSProperties;
}

/**
 * 数值滚动加载动画组件 (参考 Naive UI NumberAnimation 设计，基于 GSAP useGSAP 高性能驱动)
 * 采用原生 DOM textContent 更新，GPU 合成层隔离，杜绝高频重排 (Reflow)
 */
export const NumberAnimation: React.FC<NumberAnimationProps> = ({
  to,
  from,
  precision = 0,
  duration = 0.8,
  delay = 0,
  showSeparator = false,
  prefix,
  suffix,
  refreshKey,
  formatter,
  className = '',
  style,
}) => {
  const containerRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const currentValRef = useRef<number>(from !== undefined ? from : 0);
  const isFirstMountRef = useRef<boolean>(true);
  const lastRefreshKeyRef = useRef<any>(refreshKey);

  // 数值格式化函数
  const formatNumber = useMemo(() => {
    return (num: number): string => {
      if (formatter) return formatter(num);
      const safeNum = Number.isFinite(num) ? num : 0;
      let s = safeNum.toFixed(precision);
      if (showSeparator) {
        const parts = s.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        s = parts.join('.');
      }
      return s;
    };
  }, [formatter, precision, showSeparator]);

  useGSAP(
    () => {
      let startVal = currentValRef.current;
      const endVal = Number.isFinite(to) ? to : 0;
      const isRefresh = lastRefreshKeyRef.current !== refreshKey;
      lastRefreshKeyRef.current = refreshKey;

      if (isFirstMountRef.current) {
        startVal = from !== undefined ? from : 0;
        isFirstMountRef.current = false;
      } else if (isRefresh && startVal === endVal) {
        // 当外部主动触发刷新且数值相同时，从 0 重新向上滚动至目标值
        startVal = from !== undefined ? from : 0;
      }

      const proxy = { val: startVal };

      const tween = gsap.to(proxy, {
        val: endVal,
        duration,
        delay,
        ease: 'power2.out',
        overwrite: 'auto',
        onUpdate: () => {
          currentValRef.current = proxy.val;
          if (textRef.current) {
            textRef.current.textContent = formatNumber(proxy.val);
          }
        },
        onComplete: () => {
          currentValRef.current = endVal;
          if (textRef.current) {
            textRef.current.textContent = formatNumber(endVal);
          }
        },
      });

      return () => {
        tween.kill();
      };
    },
    {
      dependencies: [to, refreshKey, duration, delay, precision, showSeparator],
      scope: containerRef,
    }
  );

  return (
    <span ref={containerRef} className={className} style={style}>
      {prefix}
      <span ref={textRef}>
        {formatNumber(isFirstMountRef.current && from === undefined ? 0 : (from !== undefined ? from : to))}
      </span>
      {suffix}
    </span>
  );
};
