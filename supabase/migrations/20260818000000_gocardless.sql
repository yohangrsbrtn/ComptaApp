-- Paiements importés depuis GoCardless — file d'attente de rapprochement avant
-- de rejoindre compta_paiements (jamais d'écriture automatique aveugle).
create table compta_gocardless_transactions (
  id uuid primary key default gen_random_uuid(),
  gc_payment_id text not null unique,
  montant numeric not null,
  devise text not null default 'EUR',
  statut text not null,
  charge_date date,
  description text,
  gc_customer_id text,
  nom_client_gc text,
  client_id uuid references compta_clients(id) on delete set null,
  importe boolean not null default false,
  paiement_id uuid references compta_paiements(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table compta_gocardless_transactions enable row level security;
create policy "auth full access" on compta_gocardless_transactions for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
