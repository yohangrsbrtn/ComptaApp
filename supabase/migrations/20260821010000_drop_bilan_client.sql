-- Champ jamais utilisé nulle part dans l'app (reliquat de la migration Google Sheets,
-- sans lien avec le vrai système de bilans d'AppTrainingDatabase) — retiré à la demande du coach.
alter table compta_clients
  drop column if exists bilan,
  drop column if exists bilan_fait_le;
