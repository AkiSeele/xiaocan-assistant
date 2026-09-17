import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

export { gsap, useGSAP };

/**
 * 仪表盘卡片与组件交错进入动效
 */
export const animateStaggerEnter = (
  container: HTMLElement | null,
  targetSelector: string = '.gsap-card-item',
  delay: number = 0.02
) => {
  if (!container) return;
  const elements = container.querySelectorAll(targetSelector);
  if (!elements.length) return;

  gsap.killTweensOf(elements);
  gsap.fromTo(
    elements,
    { opacity: 0, y: 14 },
    {
      opacity: 1,
      y: 0,
      duration: 0.32,
      stagger: 0.03,
      delay,
      ease: 'power2.out',
      clearProps: 'transform',
    }
  );
};

/**
 * 悬浮或点击微交互弹性缩放
 */
export const animateTap = (element: HTMLElement | null) => {
  if (!element) return;
  gsap.fromTo(
    element,
    { scale: 0.96 },
    { scale: 1, duration: 0.35, ease: 'back.out(2)' }
  );
};

/**
 * 数字递增动画
 */
export const animateNumberCounter = (
  element: HTMLElement | null,
  targetValue: number,
  decimals: number = 2
) => {
  if (!element) return;
  const obj = { val: 0 };
  gsap.to(obj, {
    val: targetValue,
    duration: 1.0,
    ease: 'power2.out',
    onUpdate: () => {
      if (element) {
        element.innerText = obj.val.toLocaleString('zh-CN', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        });
      }
    },
  });
};
