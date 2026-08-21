create table compta_notes_paiement (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references compta_clients(id) on delete cascade,
  mois text not null,
  annee int not null,
  note text not null,
  created_at timestamptz not null default now(),
  unique (client_id, mois, annee)
);

alter table compta_notes_paiement enable row level security;
create policy "auth full access" on compta_notes_paiement for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
