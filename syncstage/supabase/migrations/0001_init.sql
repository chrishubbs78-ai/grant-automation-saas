-- SyncStage initial schema
-- projects, assets, jobs, alignment_maps + RLS + storage buckets + realtime

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type project_status as enum (
  'empty', 'uploading', 'analyzing', 'ready_to_generate',
  'generating', 'editing', 'rendering', 'done'
);

create type job_type as enum (
  'analyze', 'avatar_generate', 'segment_rerender', 'final_render'
);

create type job_status as enum (
  'queued', 'running', 'succeeded', 'failed', 'cancelled'
);

create type asset_kind as enum (
  'song', 'face_photo', 'face_video', 'broll',
  'vocal_stem', 'instrumental_stem', 'analysis',
  'avatar_clip', 'final_render'
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Untitled video',
  status project_status not null default 'empty',
  duration double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind asset_kind not null,
  bucket text not null,
  storage_path text not null,
  mime_type text,
  range jsonb, -- {start, end} seconds for avatar_clip segments
  meta jsonb,
  created_at timestamptz not null default now()
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  type job_type not null,
  status job_status not null default 'queued',
  payload jsonb not null default '{}',
  progress jsonb, -- {pct, stage, detail}
  error text,
  output jsonb,
  cost_usd numeric(8, 4),
  duration_ms bigint,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create table alignment_maps (
  project_id uuid primary key references projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  version integer not null default 1,
  data jsonb not null, -- AlignmentMap (words, broll, dirtyRanges)
  updated_at timestamptz not null default now()
);

create index assets_project_idx on assets (project_id, kind);
create index jobs_project_idx on jobs (project_id, created_at desc);
create index jobs_queue_idx on jobs (status, created_at) where status = 'queued';

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_updated_at before update on projects
  for each row execute function set_updated_at();
create trigger alignment_maps_updated_at before update on alignment_maps
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table projects enable row level security;
alter table assets enable row level security;
alter table jobs enable row level security;
alter table alignment_maps enable row level security;

create policy "own projects" on projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own assets" on assets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own jobs" on jobs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own alignment_maps" on alignment_maps
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Workers use the service-role key and bypass RLS.

-- ---------------------------------------------------------------------------
-- Realtime: clients subscribe to job progress + project status changes
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table jobs;
alter publication supabase_realtime add table projects;

-- ---------------------------------------------------------------------------
-- Storage buckets
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('uploads', 'uploads', false),
  ('stems',   'stems',   false),
  ('clips',   'clips',   false),
  ('renders', 'renders', false)
on conflict (id) do nothing;

-- Per-user folder convention: <bucket>/<user_id>/<project_id>/<file>
create policy "users read own files" on storage.objects
  for select using (
    bucket_id in ('uploads', 'stems', 'clips', 'renders')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users upload own files" on storage.objects
  for insert with check (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users delete own uploads" on storage.objects
  for delete using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
