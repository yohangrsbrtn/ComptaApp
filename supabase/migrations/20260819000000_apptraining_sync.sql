-- Lien vers la fiche client AppTrainingDatabase (source de vérité pour l'identité/statut).
alter table compta_clients add column if not exists apptraining_client_id text unique;
