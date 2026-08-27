-- Suivi par banque simplifié à deux groupes seulement (Banque / Espèces) à la demande
-- du coach — les virements entre ses propres comptes bancaires ne sont plus pertinents
-- à tracer un par un puisqu'ils ne changent rien au total "Banque".
drop table if exists compta_virements_internes;
