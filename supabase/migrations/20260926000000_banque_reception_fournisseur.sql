alter table compta_commandes_fournisseur add column if not exists banque text;
alter table compta_commandes_fournisseur add column if not exists recue_at timestamptz;
