-- ComptaApp — schéma initial

create extension if not exists pgcrypto;

create table compta_clients (
  id uuid primary key default gen_random_uuid(),
  prenom text not null,
  nom text not null,
  jour_paiement int,
  date_debut date,
  date_fin date,
  tarif numeric,
  pack text,
  mode_paiement text,        -- Virement / ESP / Gocardless
  moy_paiement text,         -- Qonto / Revolut / Sumeria / ...
  bilan boolean default false,
  bilan_fait_le date,
  jour_bilan text,
  salle_sport text,
  objectifs text,
  adresse text,
  statut text not null default 'actif', -- actif / ancien
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table compta_paiements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references compta_clients(id) on delete set null,
  nom_client text not null,
  mois text not null,       -- JANVIER, FEVRIER, ...
  annee int not null default 2026,
  date_paiement date,
  mt_suivi numeric not null default 0,
  mt_seance numeric not null default 0,
  banque text,
  regularisation boolean default false,
  decla_urssaf boolean default false,
  created_at timestamptz not null default now()
);

create table compta_factures (
  id uuid primary key default gen_random_uuid(),
  numero text unique not null,
  client_id uuid references compta_clients(id) on delete set null,
  nom_client text not null,
  adresse text,
  mois text,
  annee int default 2026,
  date_envoi date not null,
  date_echeance date,
  mode_paiement text,
  lignes jsonb not null default '[]',
  montant_total numeric not null default 0,
  pdf_path text,
  created_at timestamptz not null default now()
);

create table compta_budget_lignes (
  id uuid primary key default gen_random_uuid(),
  mois text not null,
  annee int not null default 2026,
  type text not null,        -- revenu / depense_fixe / depense_variable / epargne / credit
  categorie text not null,
  banque text,
  detail text,
  montant numeric not null default 0,
  prevu numeric,
  date date,
  coche boolean default true,
  created_at timestamptz not null default now()
);

create table compta_tresorerie (
  id uuid primary key default gen_random_uuid(),
  mois text not null,
  annee int not null default 2026,
  depart numeric default 0,
  prevue numeric default 0,
  actuelle numeric default 0,
  unique(mois, annee)
);

create table compta_chimie (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  client text,
  produit text not null,
  marque text,
  quantite numeric default 1,
  prix_achat_unitaire numeric default 0,
  prix_vente_unitaire numeric default 0,
  created_at timestamptz not null default now()
);

create table compta_addict (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  client text,
  produit text not null,
  quantite numeric default 1,
  achat numeric default 0,
  vente numeric default 0,
  created_at timestamptz not null default now()
);

-- RLS : accès réservé aux utilisateurs authentifiés (compte unique)
alter table compta_clients enable row level security;
alter table compta_paiements enable row level security;
alter table compta_factures enable row level security;
alter table compta_budget_lignes enable row level security;
alter table compta_tresorerie enable row level security;
alter table compta_chimie enable row level security;
alter table compta_addict enable row level security;

create policy "auth full access" on compta_clients for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth full access" on compta_paiements for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth full access" on compta_factures for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth full access" on compta_budget_lignes for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth full access" on compta_tresorerie for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth full access" on compta_chimie for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth full access" on compta_addict for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Storage bucket pour les PDF de factures
insert into storage.buckets (id, name, public) values ('factures', 'factures', false)
on conflict (id) do nothing;

create policy "auth read factures" on storage.objects for select using (bucket_id = 'factures' and auth.role() = 'authenticated');
create policy "auth write factures" on storage.objects for insert with check (bucket_id = 'factures' and auth.role() = 'authenticated');
