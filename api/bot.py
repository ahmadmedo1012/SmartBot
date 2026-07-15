"""Bot entrypoint — handles cron/webhook/bot operations.
Separate from admin dashboard for faster cold starts."""
from __future__ import annotations
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, AsyncSessionLocal
from models import Base
from config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("fb-bot-entry")


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.connect() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.commit()
    yield
    await engine.dispose()


app = FastAPI(title="SmartBot Worker", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

from routers import bot as bot_r
from routers import webhooks as webhook_r
app.include_router(bot_r.router)
app.include_router(webhook_r.router)
