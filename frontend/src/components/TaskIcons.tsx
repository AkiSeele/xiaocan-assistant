import React from 'react';

interface TaskIconProps {
  taskId: string;
  className?: string;
  size?: number;
}

export const TaskIcon: React.FC<TaskIconProps> = ({ taskId, className = 'w-9 h-9', size }) => {
  const style = size ? { width: size, height: size } : undefined;

  switch (taskId) {
    case 'daily':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true" className={className} style={style}><rect x="8" y="10" width="32" height="30" rx="5" fill="#fff"/><rect x="8" y="10" width="32" height="10" rx="5" fill="#ff7a3d"/><rect x="8" y="16" width="32" height="4" fill="#ff7a3d"/><circle cx="16" cy="12" r="2.2" fill="#fff"/><circle cx="32" cy="12" r="2.2" fill="#fff"/><path d="M18 28.5l4.2 4.2 8.3-8.8" fill="none" stroke="#ff6a2a" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      );
    case 'brand_flash':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true" className={className} style={style}><path d="M24 5 9 12v9c0 10 6.2 16.8 15 19.5C32.8 37.8 39 31 39 21v-9L24 5z" fill="#6b4cff"/><path d="M24 10 14 15v6.5c0 7.2 4.2 12 10 14 5.8-2 10-6.8 10-14V15L24 10z" fill="#8b6dff"/><path d="M26 16l-8 10h6l-2 10 10-12h-6l2-8z" fill="#ffd666"/></svg>
      );
    case 'flash_sale':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true" className={className} style={style}><circle cx="24" cy="24" r="18" fill="#ffe08a"/><circle cx="24" cy="24" r="14" fill="#ffc93c"/><path d="M26 12 16 26h7l-2 12 12-16h-7l2-10z" fill="#ff7a1a"/></svg>
      );
    case 'svip_rebate':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true" className={className} style={style}><circle cx="24" cy="24" r="18" fill="#2ec27e"/><circle cx="24" cy="24" r="13" fill="#3dd68c"/><path d="M18 24h10M24 18l7 6-7 6" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      );
    case 'media_vip':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true" className={className} style={style}><circle cx="24" cy="24" r="18" fill="#5b6cff"/><circle cx="24" cy="24" r="11" fill="#7b88ff"/><circle cx="24" cy="24" r="4" fill="#fff"/><path d="M24 8v4M24 36v4M8 24h4M36 24h4" stroke="#c8ceff" strokeWidth="2.5" strokeLinecap="round"/></svg>
      );
    case 'free_order':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true" className={className} style={style}><rect x="6" y="14" width="36" height="22" rx="5" fill="#ff8a3d"/><path d="M6 22h36" stroke="#fff2" strokeWidth="2"/><circle cx="14" cy="25" r="3" fill="#fff"/><rect x="22" y="21" width="14" height="3" rx="1.5" fill="#fff"/><rect x="22" y="27" width="10" height="3" rx="1.5" fill="#ffd7b8"/></svg>
      );
    case 'today_stats':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true" className={className} style={style}><rect x="8" y="8" width="32" height="32" rx="6" fill="#3b82f6"/><rect x="14" y="26" width="5" height="8" rx="1.5" fill="#bfdbfe"/><rect x="22" y="18" width="5" height="16" rx="1.5" fill="#fff"/><rect x="30" y="14" width="5" height="20" rx="1.5" fill="#93c5fd"/></svg>
      );
    case 'redpack_rain':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true" className={className} style={style}><g transform="translate(6 8) rotate(-18)"><rect width="14" height="18" rx="2.5" fill="#ff4d6a"/><rect y="5" width="14" height="2" fill="#ffd666"/><circle cx="7" cy="10" r="2.2" fill="#ffd666"/></g><g transform="translate(18 4) rotate(8)"><rect width="16" height="20" rx="2.5" fill="#ff3b5c"/><rect y="6" width="16" height="2.2" fill="#ffd666"/><circle cx="8" cy="11.5" r="2.5" fill="#ffd666"/></g><g transform="translate(30 12) rotate(22)"><rect width="12" height="15" rx="2" fill="#ff6b81"/><rect y="4.5" width="12" height="1.8" fill="#ffd666"/><circle cx="6" cy="8.5" r="1.8" fill="#ffd666"/></g></svg>
      );
    case 'free_lottery':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true" className={className} style={style}><g transform="translate(15 2) rotate(-14)"><rect width="7" height="14" rx="1.2" fill="#fff" stroke="#ffb0bc" strokeWidth="1"/></g><g transform="translate(22 1) rotate(6)"><rect width="7" height="15" rx="1.2" fill="#ffe8ec" stroke="#ff8fa0" strokeWidth="1"/></g><g transform="translate(27 3) rotate(16)"><rect width="6" height="12" rx="1.1" fill="#fff5f7" stroke="#ffc0ca" strokeWidth="1"/></g><path d="M11 15h26v23a5 5 0 0 1-5 5H16a5 5 0 0 1-5-5V15z" fill="#ff3b5c"/><path d="M11 15h26l-13 10L11 15z" fill="#e02445"/><circle cx="24" cy="27" r="5.2" fill="#ffd666"/><circle cx="24" cy="27" r="3.2" fill="#ffb020"/><circle cx="24" cy="27" r="1.4" fill="#ffe9a8"/></svg>
      );
    case 'group_lottery':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true" className={className} style={style}><circle cx="24" cy="24" r="17" fill="#ff8a1a"/><circle cx="24" cy="24" r="12" fill="#fff"/><path d="M24 12v12l8 4" fill="none" stroke="#ff8a1a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><circle cx="24" cy="24" r="2.5" fill="#ff8a1a"/><path d="M24 8l2 4h-4l2-4zm12 16l-4 2v-4l4 2zM24 40l-2-4h4l-2 4zM8 24l4-2v4l-4-2z" fill="#ffd6a8"/></svg>
      );
    case 'yb_lottery':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true" className={className} style={style}><circle cx="24" cy="24" r="18" fill="#ffe08a"/><circle cx="24" cy="24" r="13" fill="#ffc93c"/><text x="24" y="29" textAnchor="middle" fontSize="14" fontWeight="800" fill="#c45a00">抽</text></svg>
      );
    case 'vip_expand':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true" className={className} style={style}><rect x="8" y="10" width="32" height="30" rx="5" fill="#fff"/><rect x="8" y="10" width="32" height="10" rx="5" fill="#ff5a6a"/><rect x="8" y="16" width="32" height="4" fill="#ff5a6a"/><circle cx="16" cy="12" r="2.2" fill="#fff"/><circle cx="32" cy="12" r="2.2" fill="#fff"/><path d="M18 28.5l4.2 4.2 8.3-8.8" fill="none" stroke="#ff3b5c" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      );
    case 'expire_remind':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true" className={className} style={style}><circle cx="24" cy="24" r="18" fill="#f59e0b"/><path d="M24 14v12" stroke="#fff" strokeWidth="3.5" strokeLinecap="round"/><circle cx="24" cy="33" r="2.2" fill="#fff"/></svg>
      );
    case 'coupon_remind':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true" className={className} style={style}><path d="M8 16a4 4 0 0 1 4-4h24a4 4 0 0 1 4 4v5a3.5 3.5 0 1 0 0 7v5a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4v-5a3.5 3.5 0 1 0 0-7v-5z" fill="#ff5a7a"/><path d="M18 16v17" stroke="#fff" strokeWidth="2" strokeDasharray="3 3" opacity=".7"/><rect x="22" y="20" width="12" height="3" rx="1.5" fill="#fff"/><rect x="22" y="26" width="8" height="3" rx="1.5" fill="#ffd0da"/></svg>
      );
    case 'alipay_withdraw':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true" className={className} style={style}><rect x="8" y="8" width="32" height="32" rx="8" fill="#1677ff"/><path d="M14 20h20v2.2H14V20zm0 6.5h14v2.2H14v-2.2z" fill="#fff"/><circle cx="33" cy="30" r="5.5" fill="#fff"/><path d="M30.8 30h4.4M33 27.8v4.4" stroke="#1677ff" strokeWidth="1.8" strokeLinecap="round"/></svg>
      );
    case 'store_grab':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true" className={className} style={style}><circle cx="24" cy="24" r="18" fill="#ff4d4f"/><path d="M22 14l-6 10h6l-2 10 10-12h-6l2-8z" fill="#fff"/></svg>
      );
    case 'store_appoint':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true" className={className} style={style}><circle cx="24" cy="24" r="18" fill="#1890ff"/><path d="M24 14v10l7 4" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="24" cy="24" r="2.5" fill="#fff"/></svg>
      );
    case 'store_monitor':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true" className={className} style={style}><circle cx="24" cy="24" r="18" fill="#fa8c16"/><path d="M14 24a10 10 0 0 1 20 0M18 24a6 6 0 0 1 12 0" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round"/><circle cx="24" cy="25" r="3" fill="#fff"/></svg>
      );
    case 'store_search':
    case 'store_keyword':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true" className={className} style={style}><circle cx="24" cy="24" r="18" fill="#13c2c2"/><circle cx="22" cy="22" r="7" fill="none" stroke="#fff" strokeWidth="3"/><path d="M27 27l7 7" stroke="#fff" strokeWidth="3" strokeLinecap="round"/></svg>
      );
    case 'store_cancel':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true" className={className} style={style}><circle cx="24" cy="24" r="18" fill="#8c8c8c"/><path d="M17 17l14 14M31 17l-14 14" stroke="#fff" strokeWidth="3.2" strokeLinecap="round"/></svg>
      );
    default:
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true" className={className} style={style}>
          <circle cx="24" cy="24" r="18" fill="#6366f1" />
          <path d="M20 16l12 8-12 8V16z" fill="#fff" />
        </svg>
      );
  }
};
