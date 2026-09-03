"""
NE-SHIELD Backend Entry Point
FastAPI application integrating all risk, incident, routing, and alert services.
"""

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.routers import risk, incidents, routes, alerts

app = FastAPI(
    title="NE-SHIELD API",
    description="AI-Based Early Warning and Landslide Risk Monitoring System for NER",
    version="1.0.0"
)

# Security: CORS configuration
# In production, restrict 'allow_origins' to the specific frontend domain
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Routers
app.include_router(risk.router)
app.include_router(incidents.router)
app.include_router(routes.router)
app.include_router(alerts.router)

@app.get("/")
async def root():
    return {"message": "Welcome to NE-SHIELD API. Visit /docs for API documentation."}

# WebSocket for Realtime updates
# This connects the frontend to the backend, which in turn listens to Supabase Realtime
@app.websocket("/ws/risk-updates")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        # In a real implementation, we would subscribe to Supabase Realtime here
        # and forward events to the connected websocket client.
        # For the MVP demo, we'll handle the subscription on the frontend side
        # directly via the Supabase JS client, but keep this endpoint for architectural completeness.
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f"Heartbeat: Received {data}")
    except WebSocketDisconnect:
        print("Client disconnected from risk-updates websocket")

if __name__ == "__main__":
    # Run with uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
