# ComptaApp

App de comptabilité (coaching sportif) — remplace le Google Sheets "Compta 2026" + son script Apps Script (`code.gs`).

- **URL live** : https://yohangrsbrtn.github.io/ComptaApp/
- **Supabase** : `https://hvcerfxcfzoktzslqaqu.supabase.co` — RLS restreinte aux utilisateurs authentifiés (`auth.role() = 'authenticated'`), un seul compte (`yohangrsbrtn@gmail.com`)
- **Repo** : `https://github.com/yohangrsbrtn/ComptaApp.git` (privé)

## Déploiement

Push sur `main` = déploiement automatique (GitHub Pages, activé sur la branche `main` racine). Pousser après chaque modification, sans demander confirmation.

## Architecture

- `index.html` — shell (sidebar, login, dashboard), state global `S`, routage `setPage()`/`render()`
- `api.js` — config Supabase, auth (`login`/`logout`), helpers REST (`sbSelect`/`sbInsert`/`sbUpdate`/`sbDelete`/`sbUpload`/`sbSignedUrl`), formatters (`fmtEUR`, `fmtDate`, `esc`), constantes `MOIS`/`MOIS_NUM`
- `clients.js` — page Clients (CRUD, équivalent onglet "BASE CLIENTS")
- `paiements.js` — encaissements mensuels par client (équivalent "PAIEMENTS CLIENTS")
- `factures.js` — génération de factures PDF (jsPDF, remplace l'export PDF Google Sheets), numérotation `FAC-2026-MMXX`, upload vers le bucket Storage `factures`
- `budget.js` — budget mensuel (revenus/dépenses fixes/variables/épargne/crédits) + trésorerie, équivalent des onglets mensuels (JANV, FEV...)
- `chimie.js` / `addict.js` — suivi des ventes annexes (équivalent onglets CHIMIE_DATA / ADDICT)

## Schéma Supabase

- `compta_clients` : fiche client (tarif, mode/moyen de paiement, adresse, jour de bilan, statut actif/ancien...)
- `compta_paiements` : encaissements par mois/année, liés à un client (`client_id` nullable, `nom_client` en snapshot)
- `compta_factures` : factures générées (`numero` unique `FAC-YYYY-MMXX`, `lignes` JSONB, `pdf_path` dans le bucket Storage `factures`)
- `compta_budget_lignes` : lignes de budget par mois (`type`: revenu/depense_fixe/depense_variable/epargne/credit)
- `compta_tresorerie` : trésorerie départ/prévue/actuelle par mois (unique par mois+année)
- `compta_chimie`, `compta_addict` : ventes annexes (achat/vente/bénéfice)

Migrations SQL dans `supabase/migrations/`.

## Pièges connus

- **PDF factures** : générés côté client avec jsPDF (CDN), pas de dépendance à Google Sheets. Layout répliqué depuis l'onglet FACTURE d'origine (coordonnées en mm, format A4).
- **Numérotation factures** : calcule le dernier numéro existant du mois (`compta_factures.numero like 'FAC-2026-MM%'`) avant d'incrémenter — pas de compteur séparé.
- **Auth** : un seul utilisateur Supabase Auth (email/password), pas d'inscription libre. Token stocké dans `localStorage.ca_token`.
- **Rapprochement client/paiement** : `compta_paiements.client_id` posé à la création si un client est sélectionné dans le formulaire ; sinon fallback sur `nom_client` (recherche approximative dans `factures.js` → `_trouverClientLocal`).
