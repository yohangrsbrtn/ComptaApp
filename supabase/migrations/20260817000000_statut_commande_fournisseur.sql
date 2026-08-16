-- Statut des commandes fournisseur : à passer / en cours / reçue (au lieu du simple booléen recue).
alter table compta_commandes_fournisseur add column if not exists statut text not null default 'a_passer';

update compta_commandes_fournisseur set statut = 'recue' where recue = true;
update compta_commandes_fournisseur set statut = 'en_cours' where recue = false;
