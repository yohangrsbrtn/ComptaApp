-- Rattrapage : avant la refonte, le paiement d'une vente était suivi via compta_ventes.montant_paye
-- (qui valait déjà total_vente pour toutes les ventes historiques = soldées). La nouvelle logique calcule
-- le reste dû uniquement depuis compta_ventes_encaissements, vide pour tout l'historique -> on backfill
-- un encaissement égal au montant_paye connu pour chaque commande (client+date) qui n'en a pas encore.
insert into compta_ventes_encaissements (client, date_vente, montant, date_encaissement)
select v.client, v.date, sum(v.montant_paye), v.date
from compta_ventes v
where not v.annulee
  and coalesce(v.client, '') <> ''
  and not exists (
    select 1 from compta_ventes_encaissements e
    where e.client = v.client and e.date_vente = v.date
  )
group by v.client, v.date
having sum(v.montant_paye) > 0.005;
