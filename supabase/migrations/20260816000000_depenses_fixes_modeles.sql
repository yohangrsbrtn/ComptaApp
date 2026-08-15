-- Dépenses fixes récurrentes : un modèle par charge fixe, reconduit automatiquement chaque mois.
-- coche = "payé ce mois-ci" (suivi seulement, ne change pas le total du mois).

create table compta_depenses_fixes_modeles (
  id uuid primary key default gen_random_uuid(),
  categorie text not null,
  banque text,
  detail text,
  montant numeric not null default 0,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

alter table compta_depenses_fixes_modeles enable row level security;
create policy "auth full access" on compta_depenses_fixes_modeles for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter table compta_budget_lignes add column if not exists modele_id uuid references compta_depenses_fixes_modeles(id) on delete set null;
