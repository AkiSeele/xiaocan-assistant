export interface Account {
  key: string;
  user_id?: string;
  silk_id?: string;
  nickname: string;
  avatar?: string;
  token?: string;
  vip_level?: number;
  is_plus?: number | boolean;
  vip_score?: number;
  vip_expired_at?: number;
  phone?: string;
  real_name?: string;
  city_code?: number;
  city_name?: string;
  longitude?: string;
  latitude?: string;
  silk?: number;
  withdrawing?: number;
  withdraw_total?: number;
  completed_number?: number;
  yb_point?: number;
  unreceived_points?: number;
  expires_at: string;
  is_active: number;
  created_at: string;
}

export interface TaskParamField {
  key: string;
  label: string;
  def: any;
  type: 'number' | 'check' | 'string' | string;
  step?: string;
  min?: number;
  max?: number;
  hint?: string;
}

export interface TaskItem {
  task_id: string;
  label: string;
  tip: string;
  category: 'daily' | 'member' | 'custom' | string;
  vip?: string;
  enabled: boolean;
  cron_time: string;
  fixed_time?: boolean;
  time_label?: string;
  params?: Record<string, any>;
  param_defs?: TaskParamField[];
}

export interface StorePromotion {
  store_id?: string;
  promotion_id: string;
  order_money: number;
  rebate_price: number;
  rebate_rate: number;
  rebate_desc?: string;
  rebate_type?: 'fixed' | 'percent' | string;
  rebate_type_text?: string;
  condition: string;
  left_number: number;
  start_time: string;
  end_time: string;
  platform?: 'meituan' | 'eleme' | 'jingdong' | string;
  store_platform?: number;
  need_brand_coupon?: boolean;
  brand_left_number?: number;
  is_vip_brand?: boolean;
  days_limit?: number;
  days_order_limit?: number;
  same_group_id?: number;
  if_use_red_pack?: boolean;
  address?: string;
  opening_hours?: string;
  delivery_time_tip?: string;
  if_can_advance_order?: boolean;
  start_date_timestamp?: number;
  end_date_timestamp?: number;
}

export interface StoreItem {
  store_id: string;
  name: string;
  promotion_id: string;
  icon?: string;
  distance: number;
  distance_text: string;
  left_number: number;
  order_money: number;
  rebate_price: number;
  rebate_rate: number;
  rebate_desc?: string;
  rebate_type?: 'fixed' | 'percent' | string;
  rebate_type_text?: string;
  start_time: string;
  end_time: string;
  opening_hours?: string;
  delivery_time_tip?: string;
  if_can_advance_order?: boolean;
  start_date_timestamp?: number;
  end_date_timestamp?: number;
  condition: string;
  platform?: 'meituan' | 'eleme' | 'jingdong' | string;
  store_platform?: number;
  promotions?: StorePromotion[];
  promotion_count?: number;
  need_brand_coupon?: boolean;
  brand_left_number?: number;
  is_vip_brand?: boolean;
  days_limit?: number;
  days_order_limit?: number;
  same_group_id?: number;
  if_use_red_pack?: boolean;
  address?: string;
  selected_promotion_id?: string;
  is_dual_rebate?: boolean;
  fixed_plan?: StorePromotion;
  percent_plan?: StorePromotion;
  fixed_plans?: StorePromotion[];
  percent_plans?: StorePromotion[];
  selected_fixed_pid?: string;
  selected_percent_pid?: string;
}

export interface Order {
  id: number;
  account_key: string;
  order_sn: string;
  platform_order_id?: string;
  store_id?: string;
  store_name: string;
  store_icon?: string;
  platform: 'meituan' | 'eleme' | 'jingdong' | string;
  order_money: number;
  rebate_money: number;
  original_user_rebate?: number;
  redpack_reward_num?: number;
  status: 'pending' | 'auditing' | 'completed' | 'rejected' | 'cancelled';
  condition: string;
  receipt_img?: string;
  reject_reason?: string;
  expire_time?: string;
  timeout_time?: number;
  created_at: string;
  updated_at?: string;
}

export interface OrderStats {
  total_orders: number;
  completed_orders: number;
  pending_orders: number;
  total_rebate: number;
  pending_rebate: number;
  total_spent: number;
}

export interface StoreAppointment {
  id: number;
  account_key: string;
  store_id: string;
  store_name: string;
  promotion_id: string;
  status: 'pending' | 'scheduled' | 'primed' | 'monitoring' | 'success' | 'failed' | 'cancelled' | 'expired' | string;
  early_ms: number;
  task_type?: 'countdown' | 'monitor' | string;
  start_time?: string;
  until_time?: string;
  notified_31m?: number;
  notified_1m?: number;
  check_interval?: number;
  platform?: string;
  order_money?: number;
  rebate_price?: number;
  rebate_desc?: string;
  rebate_type?: string;
  rebate_card_id?: string;
  redpack_mode?: number;
  outcome?: string;
  created_at: string;
}

export interface JobLog {
  id: number;
  job_id: string;
  account_key: string;
  task_id: string;
  status: 'success' | 'error' | 'running';
  output: string;
  created_at: string;
}

export interface UserInfo {
  nickname: string;
  email: string;
  is_admin: boolean;
  points: number;
  slots_max: number;
  slots_used: number;
  expires_at: string;
  is_vip: boolean;
}

export interface ChartTrendItem {
  date: string;
  full_date: string;
  rebate: number;
  orders: number;
  spent: number;
}

export interface ChartDistributionItem {
  name: string;
  value: number;
  color?: string;
}

export interface DashboardChartData {
  trend: ChartTrendItem[];
  status_distribution: ChartDistributionItem[];
  platform_distribution: ChartDistributionItem[];
  today_summary: {
    today_rebate: number;
    today_orders: number;
    today_completed_orders?: number;
    today_pending_orders?: number;
    today_savings: number;
    today_savings_retail?: number;
  };
}

export interface BatchDailyResultItem {
  task_id: string;
  label: string;
  ok: boolean;
  output: string;
}

export interface BatchDailyResult {
  ok: boolean;
  all_ok: boolean;
  results: BatchDailyResultItem[];
  message: string;
}

export interface ClawBotStatus {
  ready: boolean;
  source: string;
  user_id: string;
  account_id: string;
  has_context_token: boolean;
  saved_at: string;
}

export interface SystemSettings {
  ok?: boolean;
  // 微信 ClawBot (腾讯 iLink)
  clawbot_enabled: boolean;
  clawbot_auth_path?: string;
  clawbot_auth_json?: string;
  clawbot_status?: ClawBotStatus;
  // QQ 机器人 (OneBot V11)
  qq_bot_enabled: boolean;
  qq_bot_api: string;
  qq_bot_group_id: string;
  qq_bot_user_id: string;
  qq_bot_target_type: 'group' | 'private' | 'both';
  qq_bot_token?: string;
  // 企业微信
  wecom_enabled: boolean;
  wecom_webhook: string;
  // iOS Bark
  bark_enabled: boolean;
  bark_url: string;
  // Telegram
  telegram_enabled: boolean;
  tg_bot_token: string;
  tg_chat_id: string;
  // 触发策略
  notify_on_grab: boolean;
  notify_on_appoint: boolean;
  notify_on_spike: boolean;
  // 位置服务与天地图 Web API (tianditu.gov.cn)
  tianditu_key?: string;
}

export interface NotifyTestResult {
  ok: boolean;
  channel: string;
  message: string;
  errors?: string[];
}

export interface UserCardItem {
  id: number;
  card: {
    id: number;
    card_type?: number;
    name: string;
    desc: string;
    pic?: string;
  };
  expire_time: number;
  created_at?: number;
  status?: number;
  key_id?: number;
}

export interface UserRedPackItem {
  user_red_pack_id: number;
  name: string;
  info: string;
  value_num: number; // 单位：分
  reward_num: number; // 单位：分
  threshold_num: number; // 单位：分
  begin_time: number;
  end_time: number;
  type?: number;
  tag?: string;
  icon?: string;
  limit?: {
    platform_items?: number[];
    bwc_types?: number[];
    is_not_threshold?: boolean;
    valid_time_frame_lower?: string;
    valid_time_frame_upper?: string;
    bwc_platforms?: number[];
  };
}

export interface AccountDetailData {
  ok: boolean;
  account: Account;
  user_info?: {
    silk_id?: number;
    nickname?: string;
    avatar?: string;
    phone?: string;
    real_name?: string;
    silk?: number;
    withdrawing?: number;
    withdraw_total?: number;
    completed_number?: number;
    register_time?: number;
    alipay_account?: string;
    if_bind_wxid?: boolean;
    if_auto_audit?: boolean;
    vip_level_info?: {
      new_level?: number;
      score?: number;
      next_level_score?: number;
      current_level_score?: number;
      is_plus?: boolean;
      expired_at?: number;
    };
  };
  task_info?: {
    yb_point?: number;
    unreceived_points?: number;
    exchanged_yb_point?: number;
  };
  card_stats: {
    can_use_number: number;
    expiring_soon_number: number;
  };
  cards: UserCardItem[];
  redpack_stats: {
    num: number;
  };
  redpacks: UserRedPackItem[];
}

export interface LocationCandidate {
  city_code: number;
  city_name: string;
  province?: string;
  district_name?: string;
  town_name?: string;
  poi?: string;
  short_name: string;
  full_address: string;
  latitude: string;
  longitude: string;
  source?: string;
}

export interface LocationSearchResult {
  ok: boolean;
  keyword: string;
  candidates: LocationCandidate[];
  city_code?: number;
  city_name?: string;
  district_name?: string;
  town_name?: string;
  short_name?: string;
  full_address?: string;
  latitude?: string;
  longitude?: string;
  source?: string;
}

