# 小蚕会员助手 · 纯净自研版 (XiaoCan Assistant v2.0)

> 专为小蚕霸王餐用户打造的纯净本地自研自动化与抢单助手。  
> 彻底废除付费商业化限制、无车位上限、数据全离线本地存储。

---

## 核心功能

- **多账号无感托管**：支持无限车位小蚕账号，支持手动 Token、JWT 自动解析、PC 微信凭据嗅探与自签 CA 本地抓包。
- **全场景日常挂机 (15+ 项自动化任务)**：
  - 每日元宝任务、幸运大转盘、免费大红包、整点红包雨、元宝秒杀抢券
  - SVIP 高额返利券秒杀、外卖大牌神券秒杀、影音周卡抢兑、免单券秒杀
  - 支付宝夜间自动提现、JWT 与特权卡券临期主动通知预警
- **毫秒级霸王餐抢单与预约**：
  - 支持按经纬度/城市/商圈检索与美团/饿了么双平台过滤
  - 全城双返利雷达一键扫描
  - 高精度阿里云 NTP 毫秒授时校准，自定义提前冲刺时间（`early_ms`）
- **订单全流程追踪**：自动记录抢单结果，支持外卖平台订单号回填与收益看板可视化。
- **多通道预警推送**：支持企业微信、钉钉机器人、飞书群机器人、Server酱等消息通知。

---

## 技术栈

| 模块 | 核心技术 | 说明 |
| :--- | :--- | :--- |
| **前端** | React 19 + TypeScript + Vite 8 | 极速响应、现代化组件架构 |
| **UI 体系** | 字节跳动 Semi Design + Tailwind CSS | 企业级深浅主题界面，严格遵守 Semi Design 规范 |
| **动效 & 图表** | GSAP (@gsap/react) + ECharts | 遵循 GSAP 官方 Skills 规范，流畅细腻 |
| **后端** | Python 3.11+ / FastAPI / Uvicorn | 异步高性能 RESTful API |
| **任务调度** | APScheduler | 精确 Cron / Date 定时调度器 |
| **存储** | SQLite3 | 零运维单文件数据库，本地私密存储 |
| **网络协议** | HTTPX (HTTP/2) + 逆向 RPC 签名引擎 | 仿真小程序协议头与随机抖动防风控 |

---

## 快速启动

### 方式一：Windows 普通使用启动
双击运行根目录下的 `run.bat`：
1. 首次运行会自动创建 Python 虚拟环境并安装所需依赖；
2. 自动启动本地 Web 服务并拉起浏览器访问：`http://127.0.0.1:8690`（读取 `frontend/dist` 静态打包产物，适合稳定使用）。

### 方式二：Windows 开发者双热加载启动（开发推荐）
双击运行根目录下的 `dev.bat`：
1. 自动启动后端 FastAPI 服务（端口 8690，启用 Python 代码热重载）；
2. 自动启动前端 Vite 开发服务器（端口 5173，启用 React 19 HMR 毫秒级热加载）；
3. 访问 `http://127.0.0.1:5173`，修改任意 `.tsx` 或样式页面即时生效，无需手动刷新。

### 方式三：Docker 容器化运行
```bash
docker-compose up -d --build
```
服务将在容器内启动并映射宿主机 `8690` 端口，数据库文件自动持久化在 `./data` 目录中。

### 方式四：手动分步开发者模式
```bash
# 1. 启动后端 (端口 8690)
cd backend
python -m venv venv
venv\Scripts\pip install -r requirements.txt
python main.py

# 2. 启动前端开发服务器 (端口 5173，支持 HMR 热加载)
cd ../frontend
npm install
npm run dev
```

---

## 开发规范与规则

后续所有功能调整、Bug 修复及新特性开发，请务必严格遵守项目规则手册：
- **完整规则手册**：[PROJECT_RULES.md](PROJECT_RULES.md)
- **AI 规则配置**：
  - Antigravity: `.gemini/rules/project-rules.md`
  - Cursor: `.cursor/rules/project-rules.mdc`
