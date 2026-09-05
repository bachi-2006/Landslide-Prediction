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
2. Open the **SQL Editor** and run [supabase/schema.sql](supabase/schema.sql).
3. Confirm the `incidents` Storage bucket exists and is public.
4. Import the supplied historical inventory after the schema is applied:

   ```powershell
   python scripts/import_bhusanket.py
   ```

### 2. Backend Configuration
1. Create a `.env` file in the root directory:
   ```bash
   cp .env.example .env
   ```
2. Fill in your `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (or the newer `SUPABASE_SECRET_KEY`), `ORS_API_KEY`, and `FIREBASE` credentials. The publishable/anon key is optional for the current backend and should never replace the secret key for server-side access.
3. For the frontend UI, copy the `VITE_FIREBASE_*` and `CORS_ORIGINS` values from `.env.example` into `.env` (Vite loads `VITE_*` vars from the process environment or `.env` files in the root).

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
# from the project root
uvicorn backend.main:app --reload

# Frontend (from repo root)
cp .env.example .env
cd frontend
npm install
npm run dev
```

> **Note:** The frontend dev server proxies `/api/*` to the backend (`http://localhost:8000`) via `vite.config.js`, so no CORS setup is needed in development. In production behind the Docker nginx setup, `nginx.conf` proxies `/api/` to the `backend:8000` service. The flip side is that the firebase-messaging-sw.js requires real FCM credentials; notifications stay disabled until `VITE_FIREBASE_*` vars are configured.

The frontend API client uses `/api` as its base URL and appends resource paths such as `/risk`; do not add another `/api` prefix to `VITE_API_URL`.

### Firebase notifications

The old `FIREBASE_SERVER_KEY` is not used. Configure Firebase Admin SDK instead:

1. Open Firebase Console -> Project settings -> Service accounts.
2. Choose **Generate new private key** and download the JSON file.
3. Store it outside the repository, for example `C:\secrets\ne-shield-service-account.json`.
4. Set this backend-only variable in `.env`:

```env
FIREBASE_PROJECT_ID=ne-shield
FIREBASE_CREDENTIALS_JSON=C:\secrets\ne-shield-service-account.json
```

Never put the JSON path, private key contents, or any service-account value in a `VITE_*` variable. The browser gets only the Firebase Web App config and VAPID public key. The frontend registers each FCM token through `/api/devices/token`; the backend stores it in Supabase and sends messages through Firebase Admin SDK.

### Model training and testing

There is currently no real labeled dataset in the repository, so `backend/ml/model.joblib` is not claimed as a trained model. Add a CSV using the schema in `data/README.md`, then run:

```powershell
python backend/ml/train.py --data data/landslide_events.csv
```

This creates `backend/ml/model.joblib` and `backend/ml/metrics.json`, using a stratified 80/20 holdout and reporting accuracy, ROC-AUC, and a classification report. For credible deployment metrics, split by geography and time as well as using the holdout; random splitting alone can overestimate performance.

### Mobile application path

The current implementation is web-only. The recommended next client is Expo React Native, sharing the same FastAPI API and Supabase data model. The mobile app should use Firebase Cloud Messaging for Android, request notification permission, register its FCM token with `/api/devices/token`, and reuse the incident, risk, route, and alert endpoints. Android FCM setup needs `google-services.json`; iOS later needs `GoogleService-Info.plist` and APNs configuration. No second backend or second database is needed.

### 4. Seed/Data
- Real Northeast district boundaries generated from the supplied `district_nwic.kmz` are in `frontend/public/data/ner_districts.json` (115 districts across the eight Northeast states).
- Historical Bhusanket points generated from the supplied `Bhusanket Data.pdf` are in `data/landslides/bhusanket_inventory.csv`, `data/landslides/bhusanket_inventory.geojson`, and the frontend copy `frontend/public/data/historical_landslides.geojson` (9,852 Northeast records).
- The Supabase table for those records is `historical_landslides`; use `scripts/import_bhusanket.py` to upload them in batches.
- The original PDF and KMZ are local source files and are not committed. The intermediate India ADM1/ADM2 boundary files and extracted KML are ignored by Git.
- The ML model file `backend/ml/model.joblib` is optional; if absent, the risk engine uses a weighted heuristic fallback (`backend/services/model.py`).

## 🗺️ Architecture
`Browser` $\rightarrow$ `FastAPI` $\rightarrow$ `Supabase / External APIs`
`Realtime` $\leftarrow$ `Supabase` $\leftarrow$ `Risk Engine`

When `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are configured, the map subscribes to `district_risk` and `incidents` changes and reloads its data automatically. The browser key is publishable; never place `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` in frontend variables.
