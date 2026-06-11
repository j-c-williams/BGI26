-- ============================================================
-- BGI Full Schema  (drop & recreate safe to run fresh)
-- ============================================================

create table players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table rounds (
  id uuid primary key default gen_random_uuid(),
  week_number int not null,
  date date not null,
  created_at timestamptz default now()
);

create table scores (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  raw_score int not null,
  handicap int not null default 0,
  adjusted_score int not null,
  placement int not null,
  hole_scores int[] default null,
  dnf boolean default false,
  created_at timestamptz default now()
);

-- Course designs: one saved layout per week
create table courses (
  id uuid primary key default gen_random_uuid(),
  week_number int,
  name text not null default 'Unnamed Course',
  designed_by text,
  center_lat double precision not null default 40.12417,
  center_lng double precision not null default -111.5813977,
  holes jsonb not null default '[]',
  created_at timestamptz default now()
);

create index scores_round_id_idx  on scores(round_id);
create index scores_player_id_idx on scores(player_id);

-- RLS: open read/write (no auth)
alter table players enable row level security;
alter table rounds  enable row level security;
alter table scores  enable row level security;
alter table courses enable row level security;

create policy "Public read players"   on players for select using (true);
create policy "Public insert players" on players for insert with check (true);
create policy "Public read rounds"    on rounds  for select using (true);
create policy "Public insert rounds"  on rounds  for insert with check (true);
create policy "Public read scores"    on scores  for select using (true);
create policy "Public insert scores"  on scores  for insert with check (true);
create policy "Public read courses"   on courses for select using (true);
create policy "Public insert courses" on courses for insert with check (true);
create policy "Public update courses" on courses for update using (true);
