# 🛡️ NE-SHIELD: AI-Based Landslide Risk Monitoring System

An AI-powered early warning system designed for the North-Eastern Region (NER) of India to predict landslide risks and provide safe routing.

## 🚀 MVP Features
- **Real-time Risk Scoring**: Live weather (Open-Meteo) and terrain (OpenTopoData) integration.
- **Risk Heatmap**: Color-coded district boundaries based on AI risk levels (Low, Moderate, High, Critical).
- **Incident Reporting**: Geo-tagged citizen reports with photo uploads via Supabase Storage.
- **Safe Routing**: Alternative route suggestions using OpenRouteService.
- **Push Alerts**: Real-time risk notifications via Firebase Cloud Messaging (FCM).

## 🛠️ Tech Stack
- **Backend**: Python 3.11, FastAPI, Uvicorn.
- **Frontend**: React 18, Vite, Leaflet.js, Tailwind CSS.
- **Database**: Supabase (PostgreSQL + Realtime + Storage).
- **ML**: XGBoost, Scikit-learn, SHAP.
- **External APIs**: Open-Meteo, OpenTopoData, OpenRouteService.

## 📦 Setup Guide

### 1. Database Setup (Supabase)
1. Create a free project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** and run the schema provided in `backend/db/supabase_client.py`.
3. Create a public storage bucket named `incidents`.

### 2. Backend Configuration
1. Create a `.env` file in the root directory:
   ```bash
   cp .env.example .env
   ```
2. Fill in your `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ORS_API_KEY`, and `FIREBASE` credentials.

### 3. Running the Application
Using Docker:
```bash
docker-compose up --build
```
Or manually:
```bash
# Backend
cd backend
pip install -r requirements.txt
python main.py

# Frontend
cd frontend
npm install
npm run dev
```

## 🗺️ Architecture
`Browser` $\rightarrow$ `FastAPI` $\rightarrow$ `Supabase / External APIs`
`Realtime` $\leftarrow$ `Supabase` $\leftarrow$ `Risk Engine`
