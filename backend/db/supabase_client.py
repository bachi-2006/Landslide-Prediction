"""
Supabase Client Configuration
This module initializes the Supabase client for the NE-SHIELD backend.
"""

import os
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables from .env file
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise EnvironmentError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the .env file")

# Initialize Supabase client with Service Role Key for administrative access on the backend
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

"""
--- SQL SCHEMA ---
Run these commands in the Supabase SQL Editor to set up the database:

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: district_risk
CREATE TABLE district_risk (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    district_id TEXT NOT NULL,
    district_name TEXT,
    risk_score FLOAT,
    risk_level TEXT, -- 'Low', 'Moderate', 'High', 'Critical'
    factors_json JSONB,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table: incidents
CREATE TABLE incidents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submitted_by TEXT,
    description TEXT,
    latitude FLOAT,
    longitude FLOAT,
    photo_url TEXT,
    verified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Table: alerts
CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    district_id TEXT,
    level TEXT,
    message TEXT,
    sent_at TIMESTAMPTZ DEFAULT now()
);

-- Table: fcm_tokens
CREATE TABLE fcm_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token TEXT UNIQUE NOT NULL,
    district_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Realtime for risk and incidents
ALTER PUBLICATION supabase_realtime ADD TABLE district_risk;
ALTER PUBLICATION supabase_realtime ADD TABLE incidents;
"""
