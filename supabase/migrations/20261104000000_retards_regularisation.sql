-- Régularisation : un paiement peut régler des mois passés (liste de "MOIS-ANNEE") sans changer le mois où l'argent est compté.
alter table compta_paiements add column if not exists mois_regles jsonb not null default '[]'::jsonb;

-- "Pas dû" : mois qu'on retire de la liste des retards d'un client (pause, paiement en plusieurs fois…)
create table if not exists compta_retards_ignores (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references compta_clients(id) on delete cascade,
  mois text not null,
  annee int not null,
  created_at timestamptz not null default now(),
  unique (client_id, mois, annee)
);
alter table compta_retards_ignores enable row level security;
create policy "auth full access" on compta_retards_ignores for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
