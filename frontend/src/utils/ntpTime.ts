/**
 * 全局阿里云 NTP 标准时间基准工具
 * 维护浏览器本地时钟与后端阿里云 NTP 标准时间的毫秒级偏移量 (offsetMs)，
 * 确保全站倒计时、活动开抢判定、凭证到期计算严格以阿里云 NTP 为唯一基准。
 */

let _ntpOffsetMs = 0;

export const setNtpOffsetMs = (offsetMs: number): void => {
  if (Number.isFinite(offsetMs)) {
    _ntpOffsetMs = offsetMs;
  }
};

export const getNtpOffsetMs = (): number => _ntpOffsetMs;

export const getNtpNowMs = (): number => Date.now() + _ntpOffsetMs;

export const getNtpNowSec = (): number => Math.floor((Date.now() + _ntpOffsetMs) / 1000);

export const getNtpDate = (): Date => new Date(Date.now() + _ntpOffsetMs);
