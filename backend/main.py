"""
NE-SHIELD Backend Entry Point
FastAPI application integrating all risk, incident, routing, and alert services.
"""

import sys
from pathlib import Path

# Ensure project root is in sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import os
import logging
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("backend")

from backend.routers import risk, incidents, routes, alerts, devices, auth

load_dotenv()

app = FastAPI(
    title="NE-SHIELD API",
    description="AI-Based Early Warning and Landslide Risk Monitoring System for NER",
    version="1.0.0"
)

# CORS: Allow all origins, explicitly including Firebase web app, mobile, and wildcard
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "*",
        "https://ne-shield.web.app",
        "https://ne-shield.firebaseapp.com",
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ],
    allow_origin_regex=r".*",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Register Routers
app.include_router(auth.router)
app.include_router(risk.router)
app.include_router(incidents.router)
app.include_router(routes.router)
app.include_router(alerts.router)
app.include_router(devices.router)

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from backend.routers.risk import refresh_district_risk

scheduler = AsyncIOScheduler()

# High-risk sentinel districts for automated background surveillance
MONITORED_SENTINEL_DISTRICTS = [
    {"id": "IN-AS-01", "name": "Dima Hasao", "lat": 25.17, "lon": 93.02},
    {"id": "IN-SK-01", "name": "East Sikkim", "lat": 27.33, "lon": 88.62},
    {"id": "IN-NL-01", "name": "Kohima", "lat": 25.67, "lon": 94.11},
    {"id": "IN-ML-01", "name": "East Khasi Hills", "lat": 25.57, "lon": 91.88},
    {"id": "IN-MZ-01", "name": "Aizawl", "lat": 23.73, "lon": 92.71}
]

async def scheduled_risk_monitoring_cycle():
    """Background task: periodically ingests live weather and recalculates AI risk."""
    import logging
    logger = logging.getLogger("scheduler")
    logger.info("[SCHEDULER] Initiating automated regional landslide risk surveillance cycle...")
    import asyncio
    async def update_one(dist):
        try:
            await refresh_district_risk(dist["id"], dist["name"], dist["lat"], dist["lon"])
            logger.info(f"[SCHEDULER] Updated risk telemetry for {dist['name']}")
        except Exception as e:
            logger.warning(f"[SCHEDULER] Periodic refresh for {dist['name']} skipped: {e}")

    await asyncio.gather(*(update_one(d) for d in MONITORED_SENTINEL_DISTRICTS), return_exceptions=True)

async def render_keep_alive_task():
    """
    Periodically pings the server's public health endpoint (every 10m) to keep
    Render free-tier instances active and prevent cold starts (15m spin-down).
    """
    import httpx
    base_url = os.getenv("RENDER_EXTERNAL_URL") or os.getenv("BACKEND_URL")
    if not base_url:
        return
    try:
        url = f"{base_url.rstrip('/')}/health"
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url)
            logger.info(f"[KEEP-ALIVE] Pinged {url} -> status {resp.status_code}")
    except Exception as e:
        logger.debug(f"[KEEP-ALIVE] Ping note: {e}")

@app.on_event("startup")
async def start_background_monitoring():
    """Starts background risk surveillance on server launch."""
    # Run regional risk update every 30 minutes
    scheduler.add_job(scheduled_risk_monitoring_cycle, "interval", minutes=30, id="periodic_risk_refresh")
    # Keep Render free-tier container warm every 10 minutes
    scheduler.add_job(render_keep_alive_task, "interval", minutes=10, id="render_keep_alive")
    scheduler.start()
    logging.getLogger("uvicorn").info("NE-SHIELD Background Schedulers Armed (Risk Refresh 30m, Keep-Alive 10m).")

@app.on_event("shutdown")
async def stop_background_monitoring():
    if scheduler.running:
        scheduler.shutdown()

@app.api_route("/", methods=["GET", "HEAD"])
async def root():
    return {"message": "Welcome to NE-SHIELD API. Visit /docs for API documentation."}

@app.api_route("/health", methods=["GET", "HEAD"])
async def health():
    return {
        "status": "ok",
        "scheduler_active": scheduler.running
    }



if __name__ == "__main__":
    # Run with uvicorn: python backend/main.py (from repo root)
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=False)

