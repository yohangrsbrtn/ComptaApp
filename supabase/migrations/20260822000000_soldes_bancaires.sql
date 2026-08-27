-- Pointage manuel du solde réel de chaque banque/espèces, à une date donnée
-- (mois/année de référence). Le solde "actuel" affiché ailleurs se recalcule en
-- ajoutant/retranchant tout ce qui est arrivé depuis (paiements clients + lignes de
-- budget taguées à cette banque) sur les mois suivants — jamais stocké, toujours recalculé.
create table compta_soldes_bancaires (
  banque text primary key,
  solde numeric not null default 0,
  mois text not null,
  annee int not null default 2026,
  date_maj date not null,
  updated_at timestamptz not null default now()
);

alter table compta_soldes_bancaires enable row level security;
create policy "auth full access" on compta_soldes_bancaires for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
