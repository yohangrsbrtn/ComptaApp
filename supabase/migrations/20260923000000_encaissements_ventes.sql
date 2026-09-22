-- Chaque encaissement reçu sur une commande client devient sa propre ligne (historique visible),
-- au lieu d'un seul champ montant_paye mis à jour en silence.
create table if not exists compta_ventes_encaissements (
  id uuid primary key default gen_random_uuid(),
  client text not null,
  date_vente date not null,
  montant numeric not null default 0,
  date_encaissement date not null default current_date,
  created_at timestamptz not null default now()
);
alter table compta_ventes_encaissements enable row level security;
create policy "auth full access" on compta_ventes_encaissements for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter table compta_ventes add column if not exists frais_ligne boolean not null default false;
