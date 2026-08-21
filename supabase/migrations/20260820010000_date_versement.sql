alter table compta_gocardless_transactions
  add column if not exists date_versement date,
  add column if not exists payout_id text;

update compta_gocardless_transactions set date_versement = charge_date where date_versement is null;
