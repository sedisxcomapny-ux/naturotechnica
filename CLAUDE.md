# Naturotechnica

## What this is
An AI platform that ingests satellite imagery, weather data, and soil
sensor readings to generate farm recommendations (irrigation, yield
forecasts, disease risk) for smallholder and mid-size farms.
Platform name: Naturotechnica. Domain: naturotechnica.com

## Tech stack
- Backend: Python 3.11, FastAPI, PostgreSQL + PostGIS
- ML: XGBoost, scikit-learn, MLflow, pandas, rasterio
- Frontend: Next.js 14, Tailwind CSS, Mapbox GL JS, Recharts
- Auth: Supabase
- Email: Resend
- Scheduler: APScheduler
- Deployment: Railway (backend), Vercel (frontend)

## Folder structure
- backend/ingestion/ — data pipeline scripts (weather, satellite)
- backend/models/   — ML model training and inference
- backend/api/      — FastAPI routes and endpoints
- backend/db/       — SQL schema and database utilities
- frontend/         — Next.js app
- models/           — saved ML model artifacts (.pkl files)
- data/raw/         — raw downloaded data (gitignored)

## Conventions
- All API routes return JSON with {data, error, status} shape
- Never commit .env or API keys
- All database queries go through backend/db/ helpers
- Model artifacts saved to /models/ with version numbers
- Use snake_case for Python, camelCase for JavaScript
- Always handle errors — no bare except clauses

## Current phase
Phase 1 — Building the data ingestion pipeline.
Start with weather_ingest.py using the Open-Meteo free API.
No hardware, no satellites yet. Get weather data flowing first.

## Pilot farm (placeholder for testing)
- Farm: Chicago area corn field
- Coordinates: lat 41.8781, lon -87.6298
- Crop: corn
- Planted: 2025-05-01
- Harvest expected: 2025-10-15
- Irrigation: center pivot

## Do not
- Use placeholder or mock data — always connect to real APIs
- Install paid data services — only free APIs in Phase 1
- Build the frontend until the backend pipeline works end to end
- Use bare except clauses
- Commit secrets or API keys