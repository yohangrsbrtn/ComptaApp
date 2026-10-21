-- Opérations de relevé à ne plus jamais proposer (transferts vers la chimie, etc.)
create table if not exists compta_releve_ignores (
  id uuid primary key default gen_random_uuid(),
  motif text not null unique,
  created_at timestamptz not null default now()
);
alter table compta_releve_ignores enable row level security;
create policy "auth full access" on compta_releve_ignores for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
