-- =============================================================================
--  NE-SHIELD: COMPLETE UNIFIED DATABASE MIGRATION & SCHEMA
--  Smart India Hackathon (SIH) 2026
-- =============================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. District Risk Telemetry Table
CREATE TABLE IF NOT EXISTS public.district_risk (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    district_id TEXT NOT NULL UNIQUE,
    district_name TEXT,
    risk_score DOUBLE PRECISION DEFAULT 0.1,
    risk_level TEXT CHECK (risk_level IN ('Low', 'Moderate', 'High', 'Critical')),
    factors_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Historical Landslides (GSI Database)
CREATE TABLE IF NOT EXISTS public.historical_landslides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_row TEXT,
    slide_no TEXT UNIQUE,
    state TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    raw_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Users / Responders / Field Officers / Admin Directory
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    phone TEXT,
    district TEXT,
    unit TEXT,
    role TEXT DEFAULT 'citizen' CHECK (role IN ('citizen', 'field_officer', 'officer', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Incidents Table (Full RBAC Triage, Assignment, Personnel & Resolution)
CREATE TABLE IF NOT EXISTS public.incidents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submitted_by TEXT,
    reporter_role TEXT DEFAULT 'citizen',
    verification_status TEXT DEFAULT 'community_reported',
    severity TEXT DEFAULT 'Moderate',
    status TEXT DEFAULT 'open',
    assigned_officer TEXT,
    assigned_by TEXT,
    officer_unit TEXT,
    assigned_at TIMESTAMPTZ,
    dispatched_personnel INT DEFAULT 0,
    people_responded INT DEFAULT 0,
    people_evacuated INT DEFAULT 0,
    resolved_by TEXT,
    resolved_by_account TEXT,
    resolved_role TEXT,
    resolution_summary TEXT,
    resolution_notes TEXT,
    road_cleared BOOLEAN DEFAULT false,
    resolved_at TIMESTAMPTZ,
    description TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    photo_url TEXT,
    verified BOOLEAN NOT NULL DEFAULT false,
    response_actions JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add columns if incidents table already exists
ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS reporter_role TEXT DEFAULT 'citizen',
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'community_reported',
  ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'Moderate',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS assigned_officer TEXT,
  ADD COLUMN IF NOT EXISTS assigned_by TEXT,
  ADD COLUMN IF NOT EXISTS officer_unit TEXT,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispatched_personnel INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS people_responded INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS people_evacuated INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resolved_by TEXT,
  ADD COLUMN IF NOT EXISTS resolved_by_account TEXT,
  ADD COLUMN IF NOT EXISTS resolved_role TEXT,
  ADD COLUMN IF NOT EXISTS resolution_summary TEXT,
  ADD COLUMN IF NOT EXISTS resolution_notes TEXT,
  ADD COLUMN IF NOT EXISTS road_cleared BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS response_actions JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_incidents_created ON public.incidents (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON public.incidents (status);

-- 6. Citizen SOS Relief Requests Table (Offline pack & Aid requests)
CREATE TABLE IF NOT EXISTS public.relief_requests (
    id TEXT PRIMARY KEY,
    user_name TEXT NOT NULL,
    phone TEXT,
    locality_name TEXT NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    aid_type TEXT NOT NULL DEFAULT 'food',
    people_count INTEGER NOT NULL DEFAULT 1,
    urgency TEXT NOT NULL DEFAULT 'High',
    status TEXT NOT NULL DEFAULT 'pending',
    dispatched_centre TEXT,
    notes TEXT,
    source TEXT DEFAULT 'mobile_app',
    beacon_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.relief_requests
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'mobile_app',
  ADD COLUMN IF NOT EXISTS beacon_id TEXT;

CREATE INDEX IF NOT EXISTS idx_relief_requests_created ON public.relief_requests (created_at DESC);

-- 7. ESP32 Hardware Beacon Devices (Managed by Admin)
CREATE TABLE IF NOT EXISTS public.hardware_beacons (
    beacon_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    location_name TEXT DEFAULT 'North-East Field Node',
    latitude DOUBLE PRECISION DEFAULT 25.5788,
    longitude DOUBLE PRECISION DEFAULT 91.8933,
    status TEXT DEFAULT 'online',
    siren_active BOOLEAN DEFAULT false,
    siren_level TEXT DEFAULT 'Critical',
    siren_message TEXT DEFAULT 'Emergency Siren Warning',
    wifi_ssid TEXT DEFAULT 'MSI 6704',
    sta_ip TEXT,
    db_connected BOOLEAN DEFAULT true,
    clients_connected INTEGER DEFAULT 0,
    last_incident_seen TEXT,
    battery_level INTEGER DEFAULT 100,
    last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.hardware_beacons (beacon_id, name, location_name, latitude, longitude, status, siren_active, db_connected)
VALUES ('ESP32-OFFGRID-01', 'HQ Field Siren Beacon #1', 'Shillong Sector NH-40', 25.5788, 91.8933, 'online', false, true)
ON CONFLICT (beacon_id) DO NOTHING;

-- 8. ESP32 Captive Portal SOS Registrations
CREATE TABLE IF NOT EXISTS public.beacon_sos_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    beacon_id TEXT NOT NULL DEFAULT 'ESP32-OFFGRID-01',
    citizen_name TEXT NOT NULL,
    phone TEXT,
    people_count INTEGER NOT NULL DEFAULT 1,
    medical_needs TEXT DEFAULT 'None',
    notes TEXT,
    ip_address TEXT,
    synced_to_cloud BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_beacon_sos_created ON public.beacon_sos_logs (created_at DESC);

-- 9. Emergency Broadcast Alerts Table
CREATE TABLE IF NOT EXISTS public.alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    district_id TEXT,
    level TEXT NOT NULL,
    message TEXT NOT NULL,
    channels JSONB DEFAULT '["push", "sms", "hardware_siren"]'::jsonb,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. Push Notification Device Tokens (FCM)
CREATE TABLE IF NOT EXISTS public.fcm_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token TEXT UNIQUE NOT NULL,
    district_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. Persistent Auth Sessions
CREATE TABLE IF NOT EXISTS public.auth_sessions (
    token TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    user_name TEXT,
    district TEXT,
    unit TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON public.auth_sessions (token);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON public.auth_sessions (expires_at);

-- 12. Storage Bucket for Incident Photographic Evidence
INSERT INTO storage.buckets (id, name, public)
VALUES ('incidents', 'incidents', true)
ON CONFLICT (id) DO UPDATE SET public = excluded.public;

-- 13. Row Level Security (RLS) Policies
ALTER TABLE public.district_risk ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historical_landslides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relief_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hardware_beacons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beacon_sos_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public can read district risk" ON public.district_risk;
CREATE POLICY "public can read district risk" ON public.district_risk FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public can update district risk" ON public.district_risk;
CREATE POLICY "public can update district risk" ON public.district_risk FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public can read historical landslides" ON public.historical_landslides;
CREATE POLICY "public can read historical landslides" ON public.historical_landslides FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "public can read incidents" ON public.incidents;
CREATE POLICY "public can read incidents" ON public.incidents FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public can insert incidents" ON public.incidents;
CREATE POLICY "public can insert incidents" ON public.incidents FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "public can update incidents" ON public.incidents;
CREATE POLICY "public can update incidents" ON public.incidents FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "public can delete incidents" ON public.incidents;
CREATE POLICY "public can delete incidents" ON public.incidents FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "public can read relief_requests" ON public.relief_requests;
CREATE POLICY "public can read relief_requests" ON public.relief_requests FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public can insert relief_requests" ON public.relief_requests;
CREATE POLICY "public can insert relief_requests" ON public.relief_requests FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "public can update relief_requests" ON public.relief_requests;
CREATE POLICY "public can update relief_requests" ON public.relief_requests FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public can read users" ON public.users;
CREATE POLICY "public can read users" ON public.users FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public can insert users" ON public.users;
CREATE POLICY "public can insert users" ON public.users FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "public can update users" ON public.users;
CREATE POLICY "public can update users" ON public.users FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public can read hardware_beacons" ON public.hardware_beacons;
CREATE POLICY "public can read hardware_beacons" ON public.hardware_beacons FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public can write hardware_beacons" ON public.hardware_beacons;
CREATE POLICY "public can write hardware_beacons" ON public.hardware_beacons FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public can read beacon_sos_logs" ON public.beacon_sos_logs;
CREATE POLICY "public can read beacon_sos_logs" ON public.beacon_sos_logs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public can insert beacon_sos_logs" ON public.beacon_sos_logs;
CREATE POLICY "public can insert beacon_sos_logs" ON public.beacon_sos_logs FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "public can read alerts" ON public.alerts;
CREATE POLICY "public can read alerts" ON public.alerts FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public can insert alerts" ON public.alerts;
CREATE POLICY "public can insert alerts" ON public.alerts FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "public can manage fcm_tokens" ON public.fcm_tokens;
CREATE POLICY "public can manage fcm_tokens" ON public.fcm_tokens FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public can manage auth_sessions" ON public.auth_sessions;
CREATE POLICY "public can manage auth_sessions" ON public.auth_sessions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public can upload incident photos" ON storage.objects;
CREATE POLICY "public can upload incident photos" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'incidents');
DROP POLICY IF EXISTS "public can read incident photos" ON storage.objects;
CREATE POLICY "public can read incident photos" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'incidents');

-- 14. Enable Supabase Realtime Broadcasting
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_rel rel JOIN pg_class c ON c.oid = rel.prrelid JOIN pg_publication p ON p.oid = rel.prpubid WHERE p.pubname = 'supabase_realtime' AND c.relname = 'district_risk') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.district_risk;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_rel rel JOIN pg_class c ON c.oid = rel.prrelid JOIN pg_publication p ON p.oid = rel.prpubid WHERE p.pubname = 'supabase_realtime' AND c.relname = 'incidents') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.incidents;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_rel rel JOIN pg_class c ON c.oid = rel.prrelid JOIN pg_publication p ON p.oid = rel.prpubid WHERE p.pubname = 'supabase_realtime' AND c.relname = 'alerts') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_rel rel JOIN pg_class c ON c.oid = rel.prrelid JOIN pg_publication p ON p.oid = rel.prpubid WHERE p.pubname = 'supabase_realtime' AND c.relname = 'relief_requests') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.relief_requests;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_rel rel JOIN pg_class c ON c.oid = rel.prrelid JOIN pg_publication p ON p.oid = rel.prpubid WHERE p.pubname = 'supabase_realtime' AND c.relname = 'historical_landslides') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.historical_landslides;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_rel rel JOIN pg_class c ON c.oid = rel.prrelid JOIN pg_publication p ON p.oid = rel.prpubid WHERE p.pubname = 'supabase_realtime' AND c.relname = 'hardware_beacons') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.hardware_beacons;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_rel rel JOIN pg_class c ON c.oid = rel.prrelid JOIN pg_publication p ON p.oid = rel.prpubid WHERE p.pubname = 'supabase_realtime' AND c.relname = 'beacon_sos_logs') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.beacon_sos_logs;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_rel rel JOIN pg_class c ON c.oid = rel.prrelid JOIN pg_publication p ON p.oid = rel.prpubid WHERE p.pubname = 'supabase_realtime' AND c.relname = 'users') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
    END IF;
END $$;
