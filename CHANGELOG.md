# 变更日志 (Changelog)

本项目所有显著变更均记录于此文档中。  
版本格式遵循 [语义化版本 2.0.0](https://semver.org/lang/zh-CN/) 规范。

---

## [1.0.5] - 2026-11-13

### 协议自愈与风控诊断强化 (Protocol & Anti-WAF)
- **多 Profile 合规协议档案自适应自愈**：
  - 抽离 `PROTOCOL_PROFILES` 合规指纹档案池（`android_webview`、`android_chrome131`、`wechat_app_compat`），使 TLS 指纹与 `User-Agent` 成对匹配并保留 App 原生端通道权限，彻底剔除易触发腾讯云 STGW/WAF 规则 403 的 `okhttp/*` 与 `Dalvik/*` 非标 UA。
  - 常规请求命中 STGW 规则拦截时，自动在并发锁保护下安全切换至下一合规档案做单次自愈重试，并将可用档案持久化至本地 SQLite，同时保持秒杀直射请求零阻塞。
- **403/WAF 精准根因分类与并发熔断保护**：
  - 新增 `classify_block_reason()` 诊断分类器，精确区分「STGW 请求特征规则拦截 (`waf_stgw_rule`)」「TCaptcha 人机挑战 (`waf_captcha_challenge`)」「HTTP 429 网关限流 (`rate_limit_429`)」与「源站拒绝 (`origin_forbidden_403`)」，全面移除各模块误导用户的“IP 被封 / 切换热点 / 重启光猫”提示。
  - 将 WAF 熔断覆盖至常规任务优先级 (`priority < 70`) 并在并发信号量内部增加二次冷却检查，杜绝同批并发请求雪崩补刀；`/api/settings` 新增脱敏只读字段展示当前活跃档案与最近拦截摘要。

### 账号定位体系重构 (Account Location Binding)
- **账号强绑定真实地理位置**：
  - 彻底移除前后端与数据库对武汉默认坐标 (`420100` / `114.305393, 30.593099`) 的隐式兜底及游离的本地 `localStorage` 缓存，自动清洗历史默认占位数据。
  - 在选店、双返扫描、自动化任务开关与抢单预约等全链路强制校验 `has_valid_location()`，未绑定真实坐标时给出明确横幅引导并一键唤起定位绑定弹窗。

### 通知推送与设置体验修复 (Notifications & Settings)
- **WxPusher 逐条投递状态精确校验**：深入解析接口 `data` 列表中每个 UID 的投递状态码，解决接口外层返回成功但用户未扫码关注对应应用导致静默投递失败的误报问题。
- **邮件与设置表单修复**：遵循 RFC 5322 规范使用 `formataddr` 格式化 SMTP 邮件 `From` 头部 (`email_notifier.py`)；修正 `qq_bot_enabled` / `clawbot_enabled` 默认回退值与冗余默认填写，并为设置表单开启 `allowEmpty` 补全空值提交，彻底解决清空内容保存后旧值回填的缺陷。

### 工程部署工具 (DevOps & Sync)
- **Termux 手机端一键增量同步脚本**：新增 `sync-phone.bat` 与 `scripts/sync_phone_termux.ps1`，支持自动执行编译/前端构建门禁、打包增量产物并保留手机端 SQLite 数据库，仅重启核心服务端口 (`:39691`) 并自动核验 `/health`。

---

## [1.0.4] - 2026-11-09

### 核心功能与重大修复 (Highlights)
- **统一全系统阿里云 NTP 授时基准与时钟补偿**：
  - 彻底废除全后端业务模块中对宿主机本地系统时间 (`time.time()`, `datetime.now()`, `time.strftime()`) 的直接依赖，收口至 `time_service.py`，锁定标准北京时间 (`UTC+8`)。
  - 前端新增 `ntpTime.ts`，维护高精度毫秒级 NTP 偏移量，店铺状态与倒计时全部以阿里云 NTP 为唯一基准。
- **定时调度时钟自适应补偿与场次误判修复 (Issue #18)**：
  - 实现自定义 `NtpCronTrigger`，动态扣除宿主机与阿里云 NTP 的时钟偏移量，确保无论宿主机时钟快慢，调度器均在标准北京时间整点唤醒。
  - 修复元宝秒杀抢券与影音会员抢兑的场次判定逻辑，拓宽时间窗口，彻底根除跨分跨整点盲区导致跳过本场商品的缺陷。
  - 增加周期性 NTP 漂移校准任务，时钟偏移变化 `>= 0.5s` 时自动动态重算触发器。
- **官方网关 DNS 解析与 Windows 兼容性修复 (Issue #17)**：
  - 解决 Windows 环境下 `curl_cffi` 0.17.0 内置 c-ares 解析 `gw.xiaocantech.com` 报 `curl (6) NODATA` 的问题。
  - 在 `_CurlCffiTransport` 中引入基于阿里云与腾讯云公共 DNS (`223.5.5.5,119.29.29.29`) 的自愈解析与 `XIAOCAN_DNS_SERVERS` 自定义配置。
- **官方网关 WAF 拦截与特征头伪装净化**：
  - 排查并根除腾讯云 STGW/WAF 针对非标 UA 的 TCaptcha 滑块拦截，将应用层 User-Agent 规范化为原生 `okhttp/4.12.0`（与底层 TLS JA3 指纹 100% 吻合），消除特征头矛盾。
  - 增加网关非 JSON 响应与 TCaptcha 的防御性熔断机制，杜绝未捕获的 `JSONDecodeError` 崩溃。
- **账号管理与美团生态自愈强化**：
  - 强化账号删除时的全量级联清理逻辑，彻底杜绝孤儿配置与脏数据残留，并修复删除账号时 orders 表不存在 user_id 列引发的 HTTP 500 异常。
  - 修复美团扫码绑定时的重复弹窗与状态自愈机制。

---

## [1.0.0] - 2026-10-09 (初始正式稳定版本)

### 优化与性能提升 (Performance)
- **免费开红包与抽奖极速流转**：
  - 重构 `group_lottery` 任务，将 10 类基础与广告加赠机会调整为毫秒级错峰并发执行（每项间隔 40ms），机会领取总耗时从 ~4s 压缩至 ~0.4s。
  - 转盘抽奖间隔由旧版 3.5s 深度优化至 0.35s 极速模式（抖动范围 0.28s~0.45s），7 次开红包耗时由 23s 压减至约 2.1s。
  - 阶梯达标奖励（3次/9次）由固定长休眠调整为即时自动领取。
  - 任务整体执行耗时由 30s 级缩减至 2.7~3.2s，提速达 90%，彻底杜绝超时风险。
- **前端网络超时时间防护加固**：
  - 为 `runTaskNow`（手动即时执行）和 `batchRunDaily`（一键日常打卡）配置 60s 宽裕超时时间，防止批处理任务触发 Axios 默认 30s 超时中断。

### 架构精简与去重 (Refactor)
- **下线并移除历史大包任务 `daily`**：
  - 从 `TASK_META` 及前端展示列表中彻底移除历史综合大包 `daily`，杜绝其与原子任务的重复执行。
  - 将原 `daily` 独有的领券加赠事件（饿了么领券、美团领券、小蚕专属社群）以及每日营销抽奖次数累加（`incr_lottery_number`）全量并入 `yb_task`（天天赚元宝中心任务）。
  - 在 `init_db()` 中实现历史数据库平滑自愈迁移，自动将开启旧版 `daily` 的账号无缝迁移开启至 `yb_sign` 与 `yb_task`，并关闭旧版开关。
- **一键日常打卡流水线优化**：
  - 在一键打卡流水线中精简移除紧随 `yb_task` 之后的重复 `collect_points` 调用，避免相隔 0.1s 重复调用相同收取接口。
  - 保留 `collect_points` 作为每日 23:59 的独立夜间扫尾任务，避免气泡隔夜过期。

### 工程与规范建设 (Engineering)
- **引入 GitHub Actions CI 自动化门禁**：
  - 创建 `.github/workflows/ci.yml`，每次 Push 与 PR 自动执行后端 Python 编译检查（`compileall`）与前端类型检查与构建（`oxlint` + `vite build`）。
- **增加开发环境变量配置模板**：
  - 创建 `backend/.env.example`，规范主机地址、端口、数据目录与时间同步配置。
- **账号管理界面交互体验完善**：
  - 账号详情抽屉顶部新增一键移除账号确认操作，并在删除账号后自动同步关闭详情抽屉。
