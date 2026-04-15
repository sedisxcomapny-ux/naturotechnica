-- Naturotechnica database schema
-- Run with: psql -d naturotechnica -f backend/db/schema.sql

-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Farms
CREATE TABLE IF NOT EXISTS farms (
    farm_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID,
    farm_name   TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Fields (spatial polygons)
CREATE TABLE IF NOT EXISTS farm_fields (
    field_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id         UUID REFERENCES farms(farm_id),
    field_name      TEXT,
    boundary        GEOMETRY(POLYGON, 4326) NOT NULL,
    crop_type       TEXT,
    planted_date    DATE,
    harvest_date    DATE,
    irrigation_type TEXT,
    soil_type       TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Weather data
CREATE TABLE IF NOT EXISTS farm_weather (
    id              BIGSERIAL PRIMARY KEY,
    farm_id         UUID REFERENCES farms(farm_id),
    date            DATE NOT NULL,
    lat             FLOAT,
    lon             FLOAT,
    temp_max_c      FLOAT,
    temp_min_c      FLOAT,
    precipitation_mm FLOAT,
    humidity_pct    FLOAT,
    et0_mm          FLOAT,
    solar_rad_mjm2  FLOAT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (farm_id, date)
);

-- NDVI time series
CREATE TABLE IF NOT EXISTS field_ndvi (
    id          BIGSERIAL PRIMARY KEY,
    field_id    UUID REFERENCES farm_fields(field_id),
    date        DATE NOT NULL,
    ndvi_mean   FLOAT,
    ndvi_min    FLOAT,
    ndvi_max    FLOAT,
    cloud_cover FLOAT,
    source      TEXT DEFAULT 'sentinel-2',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (field_id, date)
);

-- Irrigation scores
CREATE TABLE IF NOT EXISTS field_irrigation_scores (
    id              BIGSERIAL PRIMARY KEY,
    field_id        UUID REFERENCES farm_fields(field_id),
    date            DATE NOT NULL,
    depletion_score FLOAT,
    irrigate_now    BOOLEAN DEFAULT FALSE,
    water_needed_mm FLOAT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (field_id, date)
);

-- Risk alerts
CREATE TABLE IF NOT EXISTS field_risk_alerts (
    id              BIGSERIAL PRIMARY KEY,
    field_id        UUID REFERENCES farm_fields(field_id),
    date            DATE NOT NULL,
    risk_type       TEXT,
    risk_level      TEXT CHECK (risk_level IN ('low','medium','high')),
    probable_cause  TEXT,
    explanation     TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Productivity scores
CREATE TABLE IF NOT EXISTS field_productivity_scores (
    id                  BIGSERIAL PRIMARY KEY,
    field_id            UUID REFERENCES farm_fields(field_id),
    week_ending         DATE NOT NULL,
    ndvi_score          FLOAT,
    water_stress_score  FLOAT,
    gdd_score           FLOAT,
    yield_outlook_score FLOAT,
    composite_score     FLOAT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (field_id, week_ending)
);

-- Recommendations
CREATE TABLE IF NOT EXISTS recommendations (
    id              BIGSERIAL PRIMARY KEY,
    farm_id         UUID REFERENCES farms(farm_id),
    field_id        UUID REFERENCES farm_fields(field_id),
    generated_at    TIMESTAMPTZ DEFAULT NOW(),
    rec_type        TEXT,
    title           TEXT,
    urgency         TEXT CHECK (urgency IN ('low','medium','high')),
    action_text     TEXT,
    supporting_data JSONB,
    confidence_pct  FLOAT,
    acted_on        BOOLEAN DEFAULT FALSE,
    dismissed       BOOLEAN DEFAULT FALSE,
    acted_at        TIMESTAMPTZ,
    dismissed_at    TIMESTAMPTZ
);