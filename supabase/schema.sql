create extension if not exists "uuid-ossp";

create table if not exists public.district_risk (
    id uuid primary key default uuid_generate_v4(),
    district_id text not null unique,
    district_name text,
    risk_score double precision,
    risk_level text check (risk_level in ('Low', 'Moderate', 'High', 'Critical')),
    factors_json jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

create table if not exists public.historical_landslides (
    id uuid primary key default uuid_generate_v4(),
    source_key text not null unique,
    source_row text,
    slide_no text,
    state text not null,
    latitude double precision not null,
    longitude double precision not null,
    raw_text text,
    created_at timestamptz not null default now()
);

alter table public.historical_landslides add column if not exists source_key text;
update public.historical_landslides
set source_key = coalesce(source_row, '') || ':' || coalesce(slide_no, '')
where source_key is null;
alter table public.historical_landslides drop constraint if exists historical_landslides_slide_no_key;
create unique index if not exists historical_landslides_source_key_key
    on public.historical_landslides (source_key);
create index if not exists idx_historical_landslides_coords
    on public.historical_landslides (latitude, longitude);
create index if not exists idx_incidents_created_at
    on public.incidents (created_at desc);

create table if not exists public.users (
    id uuid primary key default uuid_generate_v4(),
    name text not null,
    phone text,
    district text,
    role text default 'citizen',
    created_at timestamptz not null default now()
);

create table if not exists public.incidents (
    id uuid primary key default uuid_generate_v4(),
    submitted_by text,
    reporter_role text default 'citizen',
    verification_status text default 'community_reported',
    severity text default 'Moderate',
    status text default 'open',
    assigned_officer text,
    assigned_at timestamptz,
    dispatched_personnel int default 0,
    people_responded int default 0,
    people_evacuated int default 0,
    resolved_by text,
    resolution_summary text,
    road_cleared boolean default false,
    resolved_at timestamptz,
    description text not null,
    latitude double precision not null,
    longitude double precision not null,
    photo_url text,
    verified boolean not null default false,
    created_at timestamptz not null default now()
);

-- Migration for existing installations
alter table public.incidents
  add column if not exists reporter_role text default 'citizen',
  add column if not exists verification_status text default 'community_reported',
  add column if not exists severity text default 'Moderate',
  add column if not exists status text default 'open',
  add column if not exists assigned_officer text,
  add column if not exists assigned_at timestamptz,
  add column if not exists dispatched_personnel int default 0,
  add column if not exists people_responded int default 0,
  add column if not exists people_evacuated int default 0,
  add column if not exists resolved_by text,
  add column if not exists resolution_summary text,
  add column if not exists road_cleared boolean default false,
  add column if not exists resolved_at timestamptz;


create table if not exists public.alerts (
    id uuid primary key default uuid_generate_v4(),
    district_id text,
    level text not null,
    message text not null,
    sent_at timestamptz not null default now()
);

create table if not exists public.fcm_tokens (
    id uuid primary key default uuid_generate_v4(),
    token text unique not null,
    district_id text,
    created_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public)
values ('incidents', 'incidents', true)
on conflict (id) do update set public = excluded.public;

alter table public.district_risk enable row level security;
alter table public.historical_landslides enable row level security;
alter table public.incidents enable row level security;
alter table public.alerts enable row level security;
alter table public.fcm_tokens enable row level security;

drop policy if exists "public can read district risk" on public.district_risk;
create policy "public can read district risk"
    on public.district_risk for select to anon, authenticated using (true);
drop policy if exists "public can read historical landslides" on public.historical_landslides;
create policy "public can read historical landslides"
    on public.historical_landslides for select to anon, authenticated using (true);
drop policy if exists "public can read incidents" on public.incidents;
create policy "public can read incidents"
    on public.incidents for select to anon, authenticated using (true);
drop policy if exists "public can upload incident photos" on storage.objects;
create policy "public can upload incident photos"
    on storage.objects for insert to anon, authenticated
    with check (bucket_id = 'incidents');
drop policy if exists "public can read incident photos" on storage.objects;
create policy "public can read incident photos"
    on storage.objects for select to anon, authenticated
    using (bucket_id = 'incidents');

do $$
begin
    if not exists (
        select 1
        from pg_publication_rel rel
        join pg_class table_info on table_info.oid = rel.prrelid
        join pg_namespace schema_info on schema_info.oid = table_info.relnamespace
        join pg_publication publication_info on publication_info.oid = rel.prpubid
        where publication_info.pubname = 'supabase_realtime'
          and schema_info.nspname = 'public'
          and table_info.relname = 'district_risk'
    ) then
        execute 'alter publication supabase_realtime add table public.district_risk';
    end if;
    if not exists (
        select 1
        from pg_publication_rel rel
        join pg_class table_info on table_info.oid = rel.prrelid
        join pg_namespace schema_info on schema_info.oid = table_info.relnamespace
        join pg_publication publication_info on publication_info.oid = rel.prpubid
        where publication_info.pubname = 'supabase_realtime'
          and schema_info.nspname = 'public'
          and table_info.relname = 'historical_landslides'
    ) then
        execute 'alter publication supabase_realtime add table public.historical_landslides';
    end if;
    if not exists (
        select 1
        from pg_publication_rel rel
        join pg_class table_info on table_info.oid = rel.prrelid
        join pg_namespace schema_info on schema_info.oid = table_info.relnamespace
        join pg_publication publication_info on publication_info.oid = rel.prpubid
        where publication_info.pubname = 'supabase_realtime'
          and schema_info.nspname = 'public'
          and table_info.relname = 'incidents'
    ) then
        execute 'alter publication supabase_realtime add table public.incidents';
    end if;
end $$;

-- Citizen SOS Relief Aid Requests (Food, Water, Medical, Evacuation)
create table if not exists public.relief_requests (
    id text primary key,
    user_name text not null,
    phone text,
    locality_name text not null,
    lat double precision not null,
    lon double precision not null,
    aid_type text not null default 'food',
    people_count integer not null default 1,
    urgency text not null default 'High',
    status text not null default 'pending',
    dispatched_centre text,
    notes text,
    created_at timestamptz not null default now()
);
create index if not exists idx_relief_requests_created on public.relief_requests (created_at desc);

alter table public.relief_requests enable row level security;
drop policy if exists "public can read relief_requests" on public.relief_requests;
create policy "public can read relief_requests"
    on public.relief_requests for select to anon, authenticated using (true);
drop policy if exists "public can insert relief_requests" on public.relief_requests;
create policy "public can insert relief_requests"
    on public.relief_requests for insert to anon, authenticated with check (true);
drop policy if exists "public can update relief_requests" on public.relief_requests;
create policy "public can update relief_requests"
    on public.relief_requests for update to anon, authenticated using (true);

alter table public.users enable row level security;
drop policy if exists "public can read users" on public.users;
create policy "public can read users"
    on public.users for select to anon, authenticated using (true);
drop policy if exists "public can insert users" on public.users;
create policy "public can insert users"
    on public.users for insert to anon, authenticated with check (true);
drop policy if exists "public can update users" on public.users;
create policy "public can update users"
    on public.users for update to anon, authenticated using (true);

drop policy if exists "public can insert incidents" on public.incidents;
create policy "public can insert incidents"
    on public.incidents for insert to anon, authenticated with check (true);
drop policy if exists "public can update incidents" on public.incidents;
create policy "public can update incidents"
    on public.incidents for update to anon, authenticated using (true);

drop policy if exists "public can read alerts" on public.alerts;
create policy "public can read alerts"
    on public.alerts for select to anon, authenticated using (true);
drop policy if exists "public can insert alerts" on public.alerts;
create policy "public can insert alerts"
    on public.alerts for insert to anon, authenticated with check (true);

drop policy if exists "public can insert fcm_tokens" on public.fcm_tokens;
create policy "public can insert fcm_tokens"
    on public.fcm_tokens for insert to anon, authenticated with check (true);
drop policy if exists "public can read fcm_tokens" on public.fcm_tokens;
create policy "public can read fcm_tokens"
    on public.fcm_tokens for select to anon, authenticated using (true);

do $$
begin
    if not exists (
        select 1 from pg_publication_rel rel
        join pg_class c on c.oid = rel.prrelid
        join pg_publication p on p.oid = rel.prpubid
        where p.pubname = 'supabase_realtime' and c.relname = 'alerts'
    ) then
        execute 'alter publication supabase_realtime add table public.alerts';
    end if;
    if not exists (
        select 1 from pg_publication_rel rel
        join pg_class c on c.oid = rel.prrelid
        join pg_publication p on p.oid = rel.prpubid
        where p.pubname = 'supabase_realtime' and c.relname = 'relief_requests'
    ) then
        execute 'alter publication supabase_realtime add table public.relief_requests';
    end if;
end $$;


