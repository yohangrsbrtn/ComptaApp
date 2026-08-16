-- Frais de port fournisseur : ligne de dépense sans impact stock.
alter table compta_commandes_fournisseur add column if not exists est_frais boolean not null default false;

-- Addict Nutrition : suivi des achats fournisseur (miroir simplifié de compta_commandes_fournisseur,
-- pas de catalogue produit/stock — juste le suivi des dépenses mensuelles).
create table compta_addict_achats (
  id uuid primary key default gen_random_uuid(),
  produit text not null,
  quantite numeric not null default 1,
  prix_achat_unitaire numeric not null default 0,
  statut text not null default 'a_passer', -- a_passer / en_cours / recue
  est_frais boolean not null default false,
  date_reception date,
  created_at timestamptz not null default now()
);

alter table compta_addict_achats enable row level security;
create policy "auth full access" on compta_addict_achats for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
