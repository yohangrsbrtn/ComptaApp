-- Virements entre les propres comptes du coach (ex: Qonto -> Revolut) — ne comptent
-- ni en revenu ni en dépense (neutre sur le résultat du budget), mais doivent bouger
-- le solde calculé de chaque banque concernée, sinon les deux comptes dérivent.
create table compta_virements_internes (
  id uuid primary key default gen_random_uuid(),
  mois text not null,
  annee int not null default 2026,
  banque_source text not null,
  banque_dest text not null,
  montant numeric not null default 0,
  detail text,
  date date,
  created_at timestamptz not null default now()
);

alter table compta_virements_internes enable row level security;
create policy "auth full access" on compta_virements_internes for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
