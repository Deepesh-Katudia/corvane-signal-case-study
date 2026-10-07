-- Corvane Signal: raw weekly answer files uploaded through the app.
-- Files are stored exactly as received so they can be re-analysed whenever the rules improve.
create table if not exists public.response_uploads (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  content text not null,
  created_at timestamptz not null default now(),
  constraint response_uploads_size check (octet_length(content) <= 5 * 1024 * 1024)
);

-- Only the server (service-role key) reads or writes this table; no public policies are defined.
alter table public.response_uploads enable row level security;
