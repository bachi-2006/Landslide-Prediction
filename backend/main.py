"""
NE-SHIELD Backend Entry Point
FastAPI application integrating all risk, incident, routing, and alert services.
"""

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

@app.get("/")
async def root():
    return {"message": "Welcome to NE-SHIELD API. Visit /docs for API documentation."}

@app.get("/health")
async def health():
    return {"status": "ok"}



if __name__ == "__main__":
    # Run with uvicorn: python backend/main.py (from repo root)
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
