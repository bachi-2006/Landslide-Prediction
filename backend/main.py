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
from dotenv import load_dotenv

from backend.routers import risk, incidents, routes, alerts, devices

load_dotenv()

app = FastAPI(
    title="NE-SHIELD API",
    description="AI-Based Early Warning and Landslide Risk Monitoring System for NER",
    version="1.0.0"
)

# CORS: restrict origins via environment in production.
# Comma-separated list, e.g. CORS_ORIGINS=http://localhost:5173,https://app.example.com
cors_origins = os.getenv("CORS_ORIGINS", "*")
origins = [o.strip() for o in cors_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=origins != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Routers
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
    for dist in MONITORED_SENTINEL_DISTRICTS:
        try:
            await refresh_district_risk(dist["id"], dist["name"], dist["lat"], dist["lon"])
            logger.info(f"[SCHEDULER] Updated risk telemetry for {dist['name']}")
        except Exception as e:
            logger.warning(f"[SCHEDULER] Periodic refresh for {dist['name']} skipped: {e}")

@app.on_event("startup")
async def start_background_monitoring():
    """Starts background risk surveillance on server launch."""
    # Run every 30 minutes in background
    scheduler.add_job(scheduled_risk_monitoring_cycle, "interval", minutes=30, id="periodic_risk_refresh")
    scheduler.start()
    logging.getLogger("uvicorn").info("NE-SHIELD Background Risk Surveillance Scheduler Armed (30m cycle).")

@app.on_event("shutdown")
async def stop_background_monitoring():
    if scheduler.running:
        scheduler.shutdown()

@app.get("/")
async def root():
    return {"message": "Welcome to NE-SHIELD API. Visit /docs for API documentation."}

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "scheduler_active": scheduler.running
    }



if __name__ == "__main__":
    # Run with uvicorn: python backend/main.py (from repo root)
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
