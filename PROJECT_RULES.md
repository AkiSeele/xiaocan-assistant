# 小蚕会员助手 (XiaoCan Assistant) 开发规范与协作守则

> **版本**：v2.1.0  
> **适用对象**：所有参与本项目维护、重构与功能迭代的开发者及 AI 编程助手。  
> **核心原则**：纯净自研 · 本地离线 · 零门槛无车位限制 · 严谨专业 · 极致性能。

---

## 目录
1. [核心开发红线 (不可逾越之原则)](#1-核心开发红线-不可逾越之原则)
2. [项目不要使用 Emoji 规范](#2-项目不要使用-emoji-规范)
3. [Semi Design 设计风格规范](#3-semi-design-设计风格规范)
4. [GSAP 动画开发规范 (遵循 gsap-skills)](#4-gsap-动画开发规范-遵循-gsap-skills)
5. [前端工程与代码规范](#5-前端工程与代码规范)
6. [后端架构与代码规范](#6-后端架构与代码规范)
7. [协议通信与风控防护规范](#7-协议通信与风控防护规范)
8. [变更验证与交付流程](#8-变更验证与交付流程)

---

## 1. 核心开发红线 (不可逾越之原则)

1. **绝对禁止引入商业化卡密与车位限制**：
   - 本项目定性为开源纯净自研工具，任何代码提交严禁引入卡密鉴权、积分扣费、使用期限限制或车位上限拦截。
2. **数据本地化与隐私第一**：
   - 用户的 Token、Cookie、手机号、地理位置等数据**仅允许存储在本地 SQLite 数据库**（`backend/data/xiaocan.db`）。
   - 严禁将用户数据外发至任何未声明的第三方中转服务器。
3. **系统网络安全与退出自愈**：
   - 在抓包嗅探模块（`proxy_sniffer` / `win_proxy`）修改 Windows 系统代理时，必须具备异常崩溃捕获与退出自动还原机制，防止宿主机断网。
4. **单端口统一交付**：
   - 生产环境中，后端必须通过 StaticFiles 托管 `frontend/dist` 静态资源，确保启动后统一在 `http://127.0.0.1:8690` 提供服务。

---

## 2. 项目不要使用 Emoji 规范

为了保持系统企业级、严谨、克制且一致的视觉质感，**全项目严禁使用 Emoji**：

1. **禁止范围**：
   - 代码源文件（.ts, .tsx, .py, .html 等）
   - 界面所有展示文本（按钮标题、页面标题、表格表头、卡片标题、描述文字等）
   - 交互反馈文本（Toast、Notification、Modal 对话框、Popconfirm 等）
   - 终端打印日志与后端日志输出
   - 文档（README.md, PROJECT_RULES.md, 变更日志等）
2. **替代方案**：
   - 状态标识：使用明确的中文纯文本标签（如 [成功]、[进行中]、[已完成]、[已失效] 等）。
   - 图标装饰：**必须且只使用** Semi Design 官方图标库 `@douyinfe/semi-icons`（例如 `IconCheck`、`IconAlertCircle`、`IconHelpCircle`、`IconRefresh` 等）。

---

## 3. Semi Design 设计风格规范

本项目前端界面风格**严格遵守字节跳动 Semi Design 规范**，任何页面与组件的新增或改动必须与 Semi Design 保持高度统一：

1. **官方组件优先**：
   - 所有通用 UI 元素（Button, Form, Input, Select, Modal, Table, Card, Tag, Typography, Tooltip, Dropdown, Tabs 等）必须优先直接使用 `@douyinfe/semi-ui` 提供的原生组件，严禁无故重复造轮子。
2. **设计 Token 与样式系统**：
   - 色彩体系：严格采用 Semi Design 官方色彩变量（如 `--semi-color-primary`, `--semi-color-text-0`, `--semi-color-text-2`, `--semi-color-fill-0`, `--semi-color-bg-0` 等）。
   - 圆角与阴影：使用 Semi Design 标准尺寸（如 `var(--semi-border-radius-medium)`, `var(--semi-shadow-elevated)` 等）。
   - 排版字阶：遵循 Semi 的 Typography 规范（Title 1-6、Text 说明字号）。
3. **深浅色模式与主题适配**：
   - 样式需兼容 Semi 的暗色主题模式，禁止使用未经过主题变量映射的高对比度硬编码纯黑/纯白颜色值。
4. **业务场景交互契约**：
   - 全局提示统一使用 `Toast.success()`、`Toast.error()`、`Toast.warning()`、`Toast.info()`。
   - 确认性操作统一使用 `Popconfirm` 或 `Modal.confirm`，禁止使用原生 `window.confirm` / `alert`。

---

## 4. GSAP 动画开发规范 (遵循 gsap-skills)

动画部分**必须统一采用 GSAP (GreenSock Animation Platform)**，并严格遵循官方 [`greensock/gsap-skills`](https://github.com/greensock/gsap-skills) 规范：

### 4.1 React 组件中必须使用 `useGSAP` Hook
- **严禁裸写 `useEffect` 做 GSAP 动画**，必须使用 `@gsap/react` 提供的 `useGSAP` hook。
- **必须提供作用域 (`scope`)**：
  ```tsx
  import { useRef } from 'react';
  import gsap from 'gsap';
  import { useGSAP } from '@gsap/react';

  // 确保插件已注册
  gsap.registerPlugin(useGSAP);

  export const ExampleCard = () => {
    const containerRef = useRef<HTMLDivElement>(null);

    useGSAP(() => {
      // 在当前 scope 内查找选择器，自动隔离，防止类名跨组件污染
      gsap.from('.anim-item', {
        y: 20,
        autoAlpha: 0,
        duration: 0.4,
        stagger: 0.08,
        ease: 'power2.out',
      });
    }, { scope: containerRef }); // 必须传递 scope

    return (
      <div ref={containerRef}>
        <div className="anim-item">卡片内容 1</div>
        <div className="anim-item">卡片内容 2</div>
      </div>
    );
  };
  ```

### 4.2 交互事件中的动画：必须使用 `contextSafe`
在事件处理函数（如 onClick、hover、回调等）中动态触发的动画，必须使用 `contextSafe` 包裹，确保组件卸载时能被自动释放与回滚：
```tsx
const container = useRef<HTMLDivElement>(null);

const { contextSafe } = useGSAP({ scope: container });

const handleHover = contextSafe(() => {
  gsap.to('.target-box', { scale: 1.05, duration: 0.2, ease: 'power1.out' });
});

const handleLeave = contextSafe(() => {
  gsap.to('.target-box', { scale: 1.0, duration: 0.2, ease: 'power1.out' });
});
```

### 4.3 动画性能与属性守则 (遵循 gsap-performance)
1. **优先使用 Transform 别名与 autoAlpha**：
   - 移动：使用 `x` / `y` / `xPercent` / `yPercent`（GPU 加速，合成层渲染）。
   - 缩放与旋转：使用 `scale` / `rotation`。
   - 显示隐藏：**优先使用 `autoAlpha`**，代替纯 `opacity`（当值为 0 时会自动设置 `visibility: hidden`，防止不可见元素阻挡点击）。
2. **严禁触发布局重排 (Reflow/Layout Thrashing)**：
   - **严禁**对 `top`、`left`、`width`、`height`、`margin`、`padding` 进行高频插值动画，必须通过 `x`、`y`、`scale` 实现。
3. **正确设置 `overwrite`**：
   - 对于频繁触发的悬停或点击动画，建议设置 `overwrite: 'auto'`，防止多个补间动画争抢同一属性导致卡顿。
4. **杜绝 GSAP 2 旧式语法**：
   - 严禁使用 `TweenMax`, `TweenLite`, `TimelineMax` 等已废弃 API，统一使用现代 GSAP 3 语法 (`gsap.to()`, `gsap.from()`, `gsap.timeline()`)。

---

## 5. 前端工程与代码规范

### 5.1 技术基准
- React 19 + TypeScript + Vite 8
- UI：Semi Design (`@douyinfe/semi-ui`, `@douyinfe/semi-icons`)
- 动画：GSAP (`gsap`, `@gsap/react`)
- 样式：Tailwind CSS v4 + Semi 主题变量
- 状态：Zustand

### 5.2 TypeScript 严格契约
- 所有后端 API 响应类型、实体模型必须在 `frontend/src/types/index.ts` 中维护。
- 禁止使用未说明的 `any`；复杂结构必须拆分为明确的 `interface` 或 `type`。
- API 调用统一封装在 `frontend/src/api/index.ts`，禁止在 View 层直接通过原生 axios 随意发起未封装的请求。

### 5.3 门禁检查
每次前端修改完成后，必须运行：
```bash
npm run lint    # 必须保证 0 error
npm run build   # 必须保证 TypeScript 类型检查与 Vite 构建成功通过
```

---

## 6. 后端架构与代码规范

### 6.1 技术基准
- Python 3.11+
- FastAPI + Uvicorn
- APScheduler (`BackgroundScheduler`)
- SQLite3 (`backend/data/xiaocan.db`)
- HTTPX (HTTP/2)

### 6.2 模块职责边界
- **路由定义 (`backend/app/api/endpoints.py`)**：仅负责 HTTP 请求参数解析、入参校验与格式化响应。
- **业务调度与执行 (`backend/app/core/`)**：`scheduler.py`、`appointment_worker.py`、`proxy_sniffer.py`。
- **协议实现 (`backend/app/protocol/`)**：`client.py` 负责逆向 RPC 通信，`signer.py` 负责请求头生成与签名计算。
- **数据存储 (`backend/app/models/database.py`)**：SQL 参数化查询，并在 `init_db()` 中实现列检测自愈。

### 6.3 门禁检查
每次后端修改完成后，必须运行：
```bash
backend\venv\Scripts\python.exe -m compileall backend\app
```

---

## 7. 协议通信与风控防护规范

1. **随机延迟抖动 (Jitter)**：批量任务必须引入 `random.uniform(0.2, 0.8)` 浮动，严禁固定频率死循环。
2. **NTP 高精度授时**：秒杀前必须调用阿里云 NTP 授时服务校准本地时钟偏差。
3. **协议头真实仿真**：必须完整携带小程序环境的 `platform`、`version`、`User-Agent` 与时间戳签名。
4. **鉴权失效保护**：捕获到 401 状态码或 Token 失效时，自动挂起账号并发送通知，严禁无休止重试导致账号被平台封禁。

---

## 8. 变更验证与交付流程

所有功能新增、Bug 修复及调整必须严格按以下步骤闭环：

```text
[需求与影响分析] -> [前后端接口与类型对齐] -> [代码编写 (Semi UI + GSAP useGSAP + 无Emoji)] -> [编译与构建验证 (compileall + lint + build)]
```

每次交付前，确认满足以下清单：
- [ ] 全文及界面无任何 Emoji 表情字符。
- [ ] UI 组件与色彩符合 Semi Design 体系。
- [ ] 动画统一使用 GSAP 并采用 `useGSAP`（附带 `scope` / `contextSafe`）。
- [ ] 后端编译测试通过：`compileall` 无报错。
- [ ] 前端构建测试通过：`npm run build` 成功。
