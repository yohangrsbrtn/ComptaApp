-- Paiements GoCardless facturés mais rejetés (failed) ou annulés après coup (charged_back) :
-- jamais comptés comme encaissés, mais gardés pour pouvoir les signaler dans Paiements.
create table if not exists compta_gocardless_rejets (
  id uuid primary key default gen_random_uuid(),
  gc_payment_id text not null unique,
  nom_client_gc text,
  montant numeric not null,
  charge_date date,
  statut text not null,
  masque boolean not null default false,
  created_at timestamptz not null default now()
);
alter table compta_gocardless_rejets enable row level security;
create policy "auth full access" on compta_gocardless_rejets for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
