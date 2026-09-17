import axios from 'axios';
import { Toast } from '@douyinfe/semi-ui';
import type { Account, TaskItem, StoreItem, StoreAppointment, JobLog, UserInfo, Order, OrderStats, DashboardChartData, BatchDailyResult, SystemSettings, NotifyTestResult } from '../types';

export const API_BASE = import.meta.env.VITE_API_BASE || '/api';

const client = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
});

// 全局响应拦截器：统一网络异常与安全兜底
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }
    const status = error?.response?.status;
    if (status === 401) {
      Toast.warning('账号凭据已失效，请重新同步 Token');
    } else if (status === 500) {
      Toast.error('后端服务异常，请稍后重试');
    } else if (error.code === 'ECONNABORTED') {
      Toast.error('请求超时，请检查后端服务是否正常响应');
    } else if (error.message === 'Network Error') {
      Toast.error('网络连接失败，请确认后端服务已在 8690 端口启动');
    }
    return Promise.reject(error);
  }
);

export const api = {
  // 账号管理
  getAccounts: () => client.get<{ ok: boolean; accounts: Account[]; total: number }>('/accounts').then(r => r.data),
  createAccount: (data: Partial<Account>) => client.post<{ ok: boolean; account: Account }>('/accounts', data).then(r => r.data),
  updateAccount: (key: string, data: Partial<Account>) => client.post<{ ok: boolean; account: Account; message: string }>(`/accounts/${key}/profile`, data).then(r => r.data),
  syncAccount: (key: string) => client.post<{ ok: boolean; account: Account; message: string }>(`/accounts/${key}/sync`).then(r => r.data),
  deleteAccount: (key: string) => client.delete<{ ok: boolean; message: string }>(`/accounts/${key}`).then(r => r.data),
  
  // 账号解析与嗅探接入
  parseToken: (rawText: string) => client.post<{ ok: boolean; token?: string; silk_id?: string; is_valid: boolean; message: string; exp_date?: string; city_code?: number; nickname?: string }>('/accounts/parse-token', { raw_text: rawText }).then(r => r.data),
  verifyToken: (token: string, cityCode?: number) => client.post<{ ok: boolean; valid: boolean; message: string }>('/accounts/verify-token', { token, city_code: cityCode }).then(r => r.data),
  startProxyCapture: (port?: number) => client.post<{ ok: boolean; message: string; status: any }>('/accounts/proxy-capture/start', { port }).then(r => r.data),
  stopProxyCapture: () => client.post<{ ok: boolean; message: string; status: any }>('/accounts/proxy-capture/stop').then(r => r.data),
  getProxyCaptureStatus: () => client.get<{ ok: boolean; status: any }>('/accounts/proxy-capture/status').then(r => r.data),

  // 电脑微信无感直连 (免配置·首选)
  scanWechatAccount: () => client.post<{ ok: boolean; account?: Account; message: string }>('/accounts/wechat-scan').then(r => r.data),
  startWechatListener: (timeout?: number) => client.post<{ ok: boolean; message: string; status: any }>('/accounts/wechat-listener/start', { timeout }).then(r => r.data),
  stopWechatListener: () => client.post<{ ok: boolean; message: string; status: any }>('/accounts/wechat-listener/stop').then(r => r.data),
  getWechatListenerStatus: () => client.get<{ ok: boolean; status: any }>('/accounts/wechat-listener/status').then(r => r.data),

  // 历史兼容
  startWinCapture: (port?: number, timeout?: number) => client.post<{ ok: boolean; message: string; status: any }>('/accounts/win_capture/start', { port, timeout }).then(r => r.data),
  stopWinCapture: () => client.post<{ ok: boolean; message: string; status: any }>('/accounts/win_capture/stop').then(r => r.data),
  getWinCaptureStatus: () => client.get<{ ok: boolean; status: any }>('/accounts/win_capture/status').then(r => r.data),
  installCaCert: () => client.post<{ ok: boolean; message: string; ca_installed?: boolean }>('/accounts/win_capture/install_ca').then(r => r.data),


  // 任务自动化
  getTasks: (accountKey: string) => client.get<{ ok: boolean; tasks: TaskItem[] }>(`/tasks?account_key=${accountKey}`).then(r => r.data),
  toggleTask: (data: { account_key: string; task_id: string; enabled: boolean; cron_time?: string; params?: Record<string, any> }) => client.post<{ ok: boolean; message: string }>('/tasks/toggle', data).then(r => r.data),
  runTaskNow: (accountKey: string, taskId: string) => client.post<{ ok: boolean; job_id?: string; output: string }>('/tasks/run', { account_key: accountKey, task_id: taskId }).then(r => r.data),
  batchRunDaily: (accountKey: string) => client.post<BatchDailyResult>('/tasks/batch-run-daily', { account_key: accountKey }).then(r => r.data),

  // 店铺与附近霸王餐 (支持经纬度、平台、搜索过滤、触底流式分页)
  getStores: (params?: { city_code?: number; longitude?: string; latitude?: string; account_key?: string; keyword?: string; platform?: string; condition?: string; rebate_type?: string; sort_by?: string; limit?: number; offset?: number; page_pv_id?: string }, signal?: AbortSignal) => 
    client.get<{ ok: boolean; stores: StoreItem[]; total: number; raw_total?: number; source?: string; has_more?: boolean; next_offset?: number; page_pv_id?: string; keyword?: string; error?: string }>('/store/list', { params, signal }).then(r => r.data),
  scanDualRebateStores: (params?: { city_code?: number; longitude?: string; latitude?: string; account_key?: string; platform?: string; keyword?: string; max_stores?: number }) =>
    client.get<{
      ok: boolean;
      total_scanned_promotions: number;
      total_scanned_stores: number;
      dual_rebate_count: number;
      returned_count?: number;
      max_stores?: number;
      stores: StoreItem[];
      message?: string;
    }>('/store/dual-rebate-scan', { params, timeout: 120000 }).then(r => r.data),
  grabStoreNow: (data: { account_key: string; store_id?: string; store_name?: string; promotion_id: string; platform?: string; order_money?: number; rebate_price?: number; rebate_desc?: string; advance?: boolean }) =>
    client.post<{ ok: boolean; order_id?: number; can_monitor?: boolean; message: string }>('/store/grab-now', data).then(r => r.data),
  createAppointment: (data: Partial<StoreAppointment>) => client.post<{ ok: boolean; appointment_id: number; message: string }>('/store/appoint', data).then(r => r.data),
  getAppointments: (accountKey?: string) => client.get<{ ok: boolean; appointments: StoreAppointment[]; total: number }>('/store/appointments', { params: { account_key: accountKey } }).then(r => r.data),
  stopAppointment: (id: number) => client.post<{ ok: boolean; message: string }>(`/store/appointments/${id}/stop`).then(r => r.data),
  cancelAppointment: (id: number) => client.delete<{ ok: boolean; message: string }>(`/store/appointments/${id}`).then(r => r.data),

  // 设备定位与逆地理编码
  resolveLocation: (latitude: number, longitude: number) =>
    client.get<{ ok: boolean; city_code: number; city_name: string; locality?: string; province?: string; address_name: string; latitude: string; longitude: string }>('/location/resolve', { params: { latitude, longitude } }).then(r => r.data),
  getIpLocation: () =>
    client.get<{ ok: boolean; city_code: number; city_name: string; address_name: string; latitude: string; longitude: string; is_ip?: boolean }>('/location/ip').then(r => r.data),

  // 霸王餐订单管理
  getOrders: (params?: { account_key?: string; status?: string; platform?: string; keyword?: string; limit?: number; offset?: number }) => 
    client.get<{ ok: boolean; orders: Order[]; total: number }>('/orders', { params }).then(r => r.data),
  getOrderStats: (accountKey?: string) => 
    client.get<{ ok: boolean; stats: OrderStats }>(`/orders/stats`, { params: { account_key: accountKey } }).then(r => r.data),
  getDashboardChartData: (accountKey?: string) =>
    client.get<{ ok: boolean; data: DashboardChartData }>('/dashboard/chart-data', { params: { account_key: accountKey } }).then(r => r.data),
  createOrder: (data: Partial<Order>) => 
    client.post<{ ok: boolean; order: Order; message: string }>('/orders', data).then(r => r.data),
  updateOrder: (id: number, data: Partial<Order>) => 
    client.put<{ ok: boolean; order: Order; message: string }>(`/orders/${id}`, data).then(r => r.data),
  submitPlatformOrderId: (id: number, platformOrderId: string, receiptImg?: string) => 
    client.post<{ ok: boolean; order: Order; message: string }>(`/orders/${id}/submit-platform-id`, { platform_order_id: platformOrderId, receipt_img: receiptImg }).then(r => r.data),
  deleteOrder: (id: number) => 
    client.delete<{ ok: boolean; message: string }>(`/orders/${id}`).then(r => r.data),

  // 日志与监控
  getJobs: (accountKey?: string, limit: number = 50) => client.get<{ ok: boolean; jobs: JobLog[] }>('/jobs', { params: { account_key: accountKey, limit } }).then(r => r.data),
  clearJobs: (accountKey?: string) => client.delete<{ ok: boolean; message: string }>('/jobs', { params: { account_key: accountKey } }).then(r => r.data),
  
  // 用户中心 (免付费状态)
  getMe: () => client.get<{ ok: boolean; user: UserInfo }>('/me').then(r => r.data),

  // 系统配置与通知管理
  getSettings: () => client.get<SystemSettings>('/settings').then(r => r.data),
  saveSettings: (data: Partial<SystemSettings>) => client.post<{ ok: boolean; message: string }>('/settings', data).then(r => r.data),
  testNotify: (channel: string, config: Record<string, any>) => 
    client.post<NotifyTestResult>('/settings/test-notify', { channel, config }).then(r => r.data),
  getClawBotStatus: (customPath?: string) => 
    client.get<{ ok: boolean; ready: boolean; message: string; user_id?: string; account_id?: string; has_context_token?: boolean; saved_at?: string }>('/settings/clawbot-status', { params: { custom_path: customPath } }).then(r => r.data),

  // 阿里云 NTP 高精度授时服务
  getBeijingTime: () =>
    client
      .get<{
        ok: boolean;
        timestamp: number;
        beijing_time: string;
        server: string;
        synced: boolean;
        offset: number;
      }>('/time')
      .then(r => r.data),
};
