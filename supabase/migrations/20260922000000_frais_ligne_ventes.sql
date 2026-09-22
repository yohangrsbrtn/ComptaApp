-- Les frais/majoration d'une vente client sont désormais leur propre ligne dans compta_ventes,
-- au lieu d'être répartis (et donc de fausser le prix) sur chaque produit vendu.
alter table compta_ventes add column if not exists frais_ligne boolean not null default false;
