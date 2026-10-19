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
  notify_mode?: AccountNotifyMode;
  notify_config?: AccountNotifyConfig | Record<string, any> | string;
  client_mode?: string;
  platform?: 'xiaocan' | 'meituan' | string;
  saved_at?: number;
  last_claimed_at?: number;
  last_claimed_count?: number;
  last_claimed_details?: MeituanCouponItem[];
  history_pool?: string[];
  meituan_token?: string;
  meituan_nickname?: string;
  meituan_saved_at?: number;
  meituan_last_claimed_at?: number;
  meituan_last_claimed_count?: number;
  meituan_last_claimed_details?: MeituanCouponItem[];
  meituan_history_pool?: string[];
  meituan_is_active?: number;
  expires_at: string;
  is_active: number;
  created_at: string;
  updated_at?: string;
}

export type AccountNotifyMode = 'global' | 'custom' | 'disabled';

export interface AccountNotifyConfig {
  channel?: 'clawbot' | 'serverchan' | 'wxpusher' | 'wecom' | 'dingtalk' | 'feishu' | 'bark' | 'telegram' | 'webhook' | 'email' | 'gotify' | 'discord' | 'qq_bot' | string;
  // 微信 ClawBot
  clawbot_auth_path?: string;
  clawbot_auth_json?: string;
  // Server酱
  serverchan_sendkey?: string;
  // WxPusher
  wxpusher_app_token?: string;
  wxpusher_uids?: string;
  // 企业微信
  wecom_webhook?: string;
  // 钉钉
  dingtalk_webhook?: string;
  dingtalk_secret?: string;
  // 飞书
  feishu_webhook?: string;
  feishu_secret?: string;
  // iOS Bark
  bark_url?: string;
  bark_group?: string;
  bark_sound?: string;
  bark_icon?: string;
  // Telegram
  tg_bot_token?: string;
  tg_chat_id?: string;
  tg_proxy_url?: string;
  tg_api_base_url?: string;
  // 通用 Webhook
  webhook_url?: string;
  webhook_method?: 'POST' | 'GET' | string;
  webhook_headers?: string;
  // 邮件
  email_host?: string;
  email_port?: number;
  email_ssl?: boolean;
  email_user?: string;
  email_pass?: string;
  email_from?: string;
  email_to?: string;
  // Gotify
  gotify_url?: string;
  gotify_token?: string;
  gotify_priority?: number;
  // Discord
  discord_webhook?: string;
  discord_username?: string;
  // QQ 机器人
  qq_bot_api?: string;
  qq_bot_user_id?: string;
  qq_bot_group_id?: string;
  qq_bot_token?: string;
}

export interface AccountNotifyResponse {
  ok: boolean;
  data?: {
    notify_mode: 'global' | 'custom' | 'disabled';
    notify_config: AccountNotifyConfig;
  };
  message?: string;
}

export interface TaskParamOption {
  label: string;
  value: any;
}

export interface TaskParamField {
  key: string;
  label: string;
  def: any;
  type: 'number' | 'check' | 'string' | 'select' | string;
  step?: string;
  min?: number;
  max?: number;
  hint?: string;
  options?: TaskParamOption[];
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
  next_run_time?: string;
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
  fixed_left?: number;
  percent_left?: number;
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
  order_type?: number;
  rebate_ratio?: number;
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
  store_icon?: string;
  icon?: string;
  promotion_id: string;
  status: 'pending' | 'scheduled' | 'primed' | 'monitoring' | 'success' | 'failed' | 'cancelled' | 'expired' | string;
  early_ms: number;
  task_type?: 'countdown' | 'monitor' | 'name_monitor' | 'keyword' | string;
  start_time?: string;
  until_time?: string;
  notified_31m?: number;
  notified_1m?: number;
  check_interval?: number;
  platform?: string;
  order_money?: number;
  rebate_price?: number;
  rebate_desc?: string;
  condition?: string;
  rebate_type?: string;
  rebate_card_id?: string;
  redpack_mode?: number;
  redpack_id?: string;
  redpack_name?: string;
  use_advance_card?: number | boolean;
  keyword?: string;
  match_mode?: 'contains' | 'exact' | string;
  min_rebate_price?: number;
  min_rebate_rate?: number;
  rebate_mode_filter?: 'all' | 'fixed' | 'percent' | string;
  auto_stop_on_success?: number | boolean;
  max_order_money?: number;
  log_id?: number;
  outcome?: string;
  created_at: string;
}

export interface NameMonitorPayload {
  account_key: string;
  keyword: string;
  match_mode?: 'contains' | 'exact';
  platform?: 'all' | 'meituan' | 'eleme';
  rebate_mode_filter?: 'all' | 'fixed' | 'percent';
  min_rebate_price?: number;
  min_rebate_rate?: number;
  max_order_money?: number;
  auto_stop_on_success?: number;
  timeout_sec?: number;
  check_interval?: number;
  start_time?: string;
  until_time?: string;
  redpack_mode?: number;
  redpack_id?: string;
  redpack_name?: string;
  store_icon?: string;
}

export interface JobLog {
  id: number;
  job_id: string;
  account_key: string;
  task_id: string;
  status: 'success' | 'error' | 'failed' | 'running' | 'aborted' | string;
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

export interface MeituanCouponItem {
  name: string;
  discount_info: string;
  valid_period: string;
  priceLimit?: number;
  couponValue?: number;
  tabName?: string;
}

export interface MeituanAccount {
  id?: number;
  key: string;
  nickname: string;
  avatar?: string;
  token: string;
  saved_at?: number;
  last_claimed_at?: number;
  last_claimed_count?: number;
  last_claimed_details?: MeituanCouponItem[];
  is_active: number;
  history_pool?: string[];
  created_at: string;
  updated_at?: string;
}

export interface MeituanAuthStartResponse {
  ok: boolean;
  session_id?: string;
  url?: string;
  qrcode_base64?: string;
  status?: string;
  error?: string;
  message?: string;
}

export interface MeituanAuthPollResponse {
  ok: boolean;
  session_id?: string;
  status: 'pending' | 'success' | 'failed' | 'expired' | 'canceled' | 'not_found';
  account?: MeituanAccount;
  message?: string;
  created_at?: number;
}

export interface BatchDailyResultItem {
  task_id: string;
  account_key?: string;
  account_nickname?: string;
  label: string;
  ok: boolean;
  output: string;
}

export interface BatchDailyAccountItem {
  account_key: string;
  nickname: string;
  all_ok: boolean;
  tasks: BatchDailyResultItem[];
}

export interface BatchDailyResult {
  ok: boolean;
  all_ok: boolean;
  results: BatchDailyResultItem[];
  message: string;
  summary?: {
    xiaocan_accounts_count: number;
    meituan_accounts_count: number;
    total_tasks: number;
    success_tasks: number;
  };
  xiaocan_accounts?: BatchDailyAccountItem[];
  meituan_accounts?: Array<{
    account_key: string;
    nickname: string;
    status: string;
    coupon_count: number;
    message: string;
    formatted_text?: string;
  }>;
}


export interface XiaoCanMessageChannel {
  channel_id: number;
  channel_name: string;
  icon?: string;
  unread: number;
  detail?: {
    title?: string;
    content?: string;
    create_time?: number;
  };
}

export interface XiaoCanMessage {
  message_id: number;
  title: string;
  content: string;
  object_id?: string;
  object_name?: string;
  channel_id: number;
  sub_channel_id?: number;
  unread: number;
  icon_res?: string;
  icon?: string;
  jump_url?: string;
  picture?: string;
  create_time: number;
  custom_message?: {
    notify_type?: number;
    custom_message_type?: number;
    params?: string;
    create_time?: number;
  };
}

export interface XiaoCanMessagesResponse {
  ok: boolean;
  channels: XiaoCanMessageChannel[];
  messages: XiaoCanMessage[];
  unread_total: number;
  error?: string;
  message?: string;
}

export interface ClawBotStatus {
  ready: boolean;
  source: string;
  user_id: string;
  account_id: string;
  has_context_token: boolean;
  saved_at: string;
}

export interface ClawBotQrResponse {
  ok: boolean;
  qrcode?: string;
  qr_image?: string;
  qr_url?: string;
  message: string;
}

export interface ClawBotPollResponse {
  ok: boolean;
  status: 'wait' | 'scaned' | 'need_verifycode' | 'confirmed' | 'expired' | 'verify_code_blocked' | 'binded_redirect' | 'scaned_but_redirect' | 'network_error' | string;
  message: string;
  user_id?: string;
  account_id?: string;
  redirect_host?: string;
}

export interface ClawBotActivationResponse {
  ok: boolean;
  activated: boolean;
  has_context_token?: boolean;
  message: string;
}

export interface SystemSettings {
  ok?: boolean;
  // 微信 ClawBot (腾讯 iLink)
  clawbot_enabled: boolean;
  clawbot_auth_path?: string;
  clawbot_auth_json?: string;
  clawbot_status?: ClawBotStatus;
  // Server酱 (Turbo / 3)
  serverchan_enabled: boolean;
  serverchan_sendkey: string;
  // WxPusher 微信推送
  wxpusher_enabled: boolean;
  wxpusher_app_token: string;
  wxpusher_uids: string;
  // 企业微信
  wecom_enabled: boolean;
  wecom_webhook: string;
  // 钉钉自定义机器人
  dingtalk_enabled: boolean;
  dingtalk_webhook: string;
  dingtalk_secret?: string;
  // 飞书自定义机器人
  feishu_enabled: boolean;
  feishu_webhook: string;
  feishu_secret?: string;
  // iOS Bark
  bark_enabled: boolean;
  bark_url: string;
  bark_group?: string;
  bark_sound?: string;
  bark_icon?: string;
  // Telegram
  telegram_enabled: boolean;
  tg_bot_token: string;
  tg_chat_id: string;
  tg_proxy_url?: string;
  tg_api_base_url?: string;
  // 通用 HTTP Webhook
  webhook_enabled: boolean;
  webhook_url: string;
  webhook_method?: 'POST' | 'GET' | string;
  webhook_headers?: string;
  // SMTP 邮件
  email_enabled: boolean;
  email_host: string;
  email_port: number;
  email_ssl: boolean;
  email_user: string;
  email_pass: string;
  email_from?: string;
  email_to: string;
  // Gotify
  gotify_enabled: boolean;
  gotify_url: string;
  gotify_token: string;
  gotify_priority?: number;
  // Discord
  discord_enabled: boolean;
  discord_webhook: string;
  discord_username?: string;
  // QQ 机器人 (OneBot V11)
  qq_bot_enabled: boolean;
  qq_bot_api: string;
  qq_bot_group_id: string;
  qq_bot_user_id: string;
  qq_bot_target_type: 'group' | 'private' | 'both';
  qq_bot_token?: string;
  // 触发策略 (对标 BetterGI 事件订阅)
  notify_on_grab: boolean;
  notify_on_spike: boolean;
  notify_on_meituan: boolean;
  notify_on_appoint: boolean;
  notify_on_token_warn: boolean;
  notify_on_coupon_expire: boolean;
  notify_on_task_fail: boolean;
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

export interface LocationHistoryItem {
  cityCode: number;
  cityName: string;
  addressName: string;
  longitude: string;
  latitude: string;
  usedAt: number;
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

export interface XiaoCanMessagesResponse {
  ok: boolean;
  channels: XiaoCanMessageChannel[];
  messages: XiaoCanMessage[];
  unread_total: number;
  error?: string;
  message?: string;
}

