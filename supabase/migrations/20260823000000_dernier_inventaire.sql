-- Date du dernier inventaire physique passé sur ce produit — permet de repérer les
-- produits jamais vérifiés (le vrai risque : un stock à 0 réel resté à 2 dans l'app
-- parce que le coach n'a aucune raison d'aller corriger un produit qu'il n'a plus).
alter table compta_produits add column if not exists dernier_inventaire date;
