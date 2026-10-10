import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

export { gsap, useGSAP };

/**
 * 仪表盘卡片与组件交错进入动效 (遵循 gsap-performance & gsap-skills)
 * 采用 transform (y/scale) 与 autoAlpha 走 GPU 合成加速通道，杜绝重排
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
    { autoAlpha: 0, y: 12, scale: 0.99 },
    {
      autoAlpha: 1,
      y: 0,
      scale: 1,
      duration: 0.35,
      stagger: 0.04,
      delay,
      ease: 'power2.out',
      overwrite: 'auto',
      clearProps: 'transform,opacity,visibility',
    }
  );
};

/**
 * Tab 切换或筛选视图切换时的平滑微过渡 (遵循 Semi Design 高性能 GPU 合成通道规范)
 * 采用纯 GPU 合成层的轻柔淡入 (0 位移)，杜绝大容器跳动与下坠抖动，消除画面抽搐感
 */
export const animateSmoothSwitch = (
  target: Element | Element[] | NodeListOf<Element> | string,
  _yOffset: number = 0,
  duration: number = 0.2
) => {
  gsap.killTweensOf(target);
  gsap.fromTo(
    target,
    { autoAlpha: 0.7 },
    {
      autoAlpha: 1,
      duration,
      ease: 'power1.out',
      overwrite: 'auto',
      clearProps: 'opacity,visibility',
    }
  );
};

/**
 * 卡片悬浮鼠标移入微交互
 */
export const animateCardHoverEnter = (element: HTMLElement | null, offset: number = -2) => {
  if (!element) return;
  gsap.to(element, {
    y: offset,
    duration: 0.2,
    ease: 'power1.out',
    overwrite: 'auto',
  });
};

/**
 * 卡片悬浮鼠标移出复位微交互
 */
export const animateCardHoverLeave = (element: HTMLElement | null) => {
  if (!element) return;
  gsap.to(element, {
    y: 0,
    duration: 0.18,
    ease: 'power1.out',
    overwrite: 'auto',
  });
};

/**
 * 悬浮或点击微交互弹性缩放
 */
export const animateTap = (element: HTMLElement | null) => {
  if (!element) return;
  gsap.fromTo(
    element,
    { scale: 0.96 },
    { scale: 1, duration: 0.32, ease: 'back.out(2)' }
  );
};

/**
 * 数字平滑递增翻牌器动效
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
    duration: 0.8,
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
