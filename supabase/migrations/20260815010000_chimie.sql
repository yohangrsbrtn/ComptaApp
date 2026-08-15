-- Module Chimie : stock, commandes fournisseur/clients, ventes — remplace compta_chimie (trop simple)

drop table if exists compta_chimie;

create table compta_produits (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  marque text,
  type text,
  prix_vente numeric,
  prix_achat numeric,
  stock_reel numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table compta_commandes_fournisseur (
  id uuid primary key default gen_random_uuid(),
  produit_id uuid references compta_produits(id) on delete set null,
  produit_nom text not null,
  marque text,
  quantite numeric not null default 0,
  prix_achat_unitaire numeric not null default 0,
  date date,
  recue boolean not null default false,
  created_at timestamptz not null default now()
);

create table compta_commandes_clients (
  id uuid primary key default gen_random_uuid(),
  client text not null,
  produit_id uuid references compta_produits(id) on delete set null,
  produit_nom text not null,
  marque text,
  quantite numeric not null default 0,
  prix_vente_unitaire numeric not null default 0,
  donne boolean not null default false,
  created_at timestamptz not null default now()
);

create table compta_ventes (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  client text,
  produit_nom text not null,
  marque text,
  quantite numeric not null default 1,
  prix_achat_unitaire numeric not null default 0,
  prix_vente_unitaire numeric not null default 0,
  total_achat numeric not null default 0,
  total_vente numeric not null default 0,
  benefice numeric not null default 0,
  annulee boolean not null default false,
  created_at timestamptz not null default now()
);

alter table compta_produits enable row level security;
alter table compta_commandes_fournisseur enable row level security;
alter table compta_commandes_clients enable row level security;
alter table compta_ventes enable row level security;

create policy "auth full access" on compta_produits for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth full access" on compta_commandes_fournisseur for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth full access" on compta_commandes_clients for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth full access" on compta_ventes for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
