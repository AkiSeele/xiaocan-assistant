"""
小蚕会员助手 · 纯净私有自研版 (XiaoCan Assistant)
基于 FastAPI + APScheduler + 逆向 RPC 协议驱动
"""
import os
import sys
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.endpoints import router as api_router
from app.core.scheduler import start_scheduler, shutdown_scheduler
from app.models.database import init_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("xiaocan.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("正在启动小蚕助手系统...")
    init_db()
    start_scheduler()
    yield
    logger.info("正在关闭小蚕助手系统...")
    shutdown_scheduler()


app = FastAPI(
    title="小蚕会员助手 · 纯净自研版",
    description="对齐原版全部自动化挂机、秒杀与抢单能力，彻底废除付费商业化限制",
    version="2.0.0",
    lifespan=lifespan
)

# 允许跨域请求 (支持前端 Vite 开发服务器 http://localhost:5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载 API 路由
app.include_router(api_router)


from fastapi.responses import RedirectResponse

@app.get("/health")
async def health_check():
    return {"status": "ok", "app": "xiaocan-assistant", "version": "2.0.0", "license": "free"}


@app.get("/m/bind")
async def root_m_bind(ticket: str = ""):
    return RedirectResponse(f"/api/m/bind?ticket={ticket}")


# 若前端已打包 (frontend/dist)，则支持前后端合并一键部署
FRONTEND_DIST = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")
if os.path.exists(FRONTEND_DIST):
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    logger.info("启动本地 Web 服务: http://0.0.0.0:8690")
    uvicorn.run("main:app", host="0.0.0.0", port=8690, reload=True)
