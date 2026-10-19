# -------------------------------------------------------------
# 阶段 1: 前端静态资源构建 (Node 20 Alpine)
# -------------------------------------------------------------
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install --registry=https://registry.npmmirror.com

COPY frontend/ ./
RUN npm run build

# -------------------------------------------------------------
# 阶段 2: 生产运行环境 (Python 3.11 + Node.js 运行时)
# -------------------------------------------------------------
FROM python:3.11-slim
WORKDIR /app

# 安装时区数据、CA证书以及 Node.js 运行时 (美团扫码与领券模块强依赖 Node 18+)
RUN apt-get update && apt-get install -y --no-install-recommends \
    tzdata \
    ca-certificates \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get purge -y --auto-remove curl \
    && rm -rf /var/lib/apt/lists/*

ENV TZ=Asia/Shanghai
ENV PYTHONUNBUFFERED=1
ENV XIAOCAN_RELOAD=0

# 安装 Python 后端依赖
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 拷贝后端代码与前端构建成果
COPY backend/ ./backend/
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# 确保数据目录与持久化存储结构存在
RUN mkdir -p /app/backend/data /app/backend/data/meituan

WORKDIR /app/backend
EXPOSE 8690

# 单端口 8690 统一交付
CMD ["python", "main.py"]
