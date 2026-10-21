-- Jour du mois où tombe une dépense fixe récurrente (pour afficher/trier par date et pointer plus facilement)
alter table compta_depenses_fixes_modeles add column if not exists jour int;
