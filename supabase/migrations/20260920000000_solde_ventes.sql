-- Paiement partiel sur une vente : montant_paye suit ce qui a été réellement encaissé,
-- le reste (total_vente - montant_paye) est pointable plus tard depuis l'onglet Ventes.
alter table compta_ventes add column if not exists montant_paye numeric not null default 0;
update compta_ventes set montant_paye = total_vente where montant_paye = 0 and total_vente <> 0;
