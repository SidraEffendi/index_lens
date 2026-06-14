-- Run this in your Supabase SQL editor (Database → SQL Editor → New query)

create table if not exists datasets (
  id                    uuid default gen_random_uuid() primary key,
  name                  text not null,
  rows                  integer not null,
  columns               jsonb not null,
  schema                jsonb not null,
  suggested_rel_columns jsonb not null,
  raw_data              jsonb not null,
  created_at            timestamptz default now()
);

-- Allow public read/insert for the demo (no auth required)
alter table datasets enable row level security;

create policy "public insert" on datasets for insert with check (true);
create policy "public select" on datasets for select using (true);
