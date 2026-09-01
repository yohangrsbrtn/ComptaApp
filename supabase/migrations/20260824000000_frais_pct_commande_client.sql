-- Le % de frais saisi sur un bloc de commande client n'était jamais sauvegardé
-- (état JS en mémoire uniquement) — disparaissait à chaque rafraîchissement de page.
alter table compta_commandes_clients add column if not exists frais_pct numeric default 0;
