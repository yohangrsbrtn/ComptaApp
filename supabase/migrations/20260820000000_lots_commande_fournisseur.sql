alter table compta_commandes_fournisseur
  add column if not exists lot_id uuid,
  add column if not exists date_commande date;

update compta_commandes_fournisseur
  set lot_id = gen_random_uuid()
  where lot_id is null;

update compta_commandes_fournisseur
  set date_commande = coalesce(date_commande, created_at::date)
  where date_commande is null;

alter table compta_commandes_fournisseur
  alter column lot_id set default gen_random_uuid();
