let _paMois = moisActuel();
let _paAnnee = 2026;
let _paRows = [];
let _paTab = 'mois';

let _paDerniereSyncGC = 0;

async function renderPaiements() {
  await loadClients();

  document.getElementById('root').innerHTML = shell(`
    <div class="topbar">
      <div><div class="page-title">Paiements clients</div><div class="page-sub">Encaissements par mois</div></div>
      <div style="display:flex;gap:10px;">
        <button class="btn btn-ghost" onclick="openGenerationFactures()">Générer les factures</button>
        <button class="btn btn-primary" onclick="openPaiementModal()">+ Encaissement</button>
      </div>
    </div>
    <div class="pill-tabs" style="margin-bottom:18px;">
      <div class="pill-tab ${_paTab==='mois'?'active':''}" onclick="_paTab='mois';renderPaiements()">Par mois</div>
      <div class="pill-tab ${_paTab==='gocardless'?'active':''}" onclick="_paTab='gocardless';renderPaiements()">GoCardless</div>
      <div class="pill-tab ${_paTab==='previsionnel'?'active':''}" onclick="_paTab='previsionnel';renderPaiements()">Prévisionnel</div>
    </div>
    <div id="pa-body"><div class="empty">Chargement…</div></div>
  `);

  // Synchro GoCardless lancée en arrière-plan, jamais bloquante pour l'affichage —
  // si elle rapporte du nouveau, on rafraîchit silencieusement une fois terminée.
  if (Date.now() - _paDerniereSyncGC > 2 * 60 * 1000) {
    _paDerniereSyncGC = Date.now();
    _syncEtImporterAutoGoCardless().then(nb => { if (nb && S.page === 'paiements') renderPaiements(); });
  }

  if (_paTab === 'mois') await _renderPaiementsMois();
  else if (_paTab === 'gocardless') await _renderGoCardless();
  else await _renderPrevisionnel();
}

async function _renderPaiementsMois() {
  const [rows, notes] = await Promise.all([
    sbSelect('compta_paiements', `mois=eq.${encodeURIComponent(_paMois)}&annee=eq.${_paAnnee}&order=date_paiement.asc`),
    sbSelect('compta_notes_paiement', `mois=eq.${encodeURIComponent(_paMois)}&annee=eq.${_paAnnee}`),
  ]);
  _paRows = rows;
  const notesParClient = {};
  notes.forEach(n => notesParClient[n.client_id] = n);

  const totalSuivi = _paRows.reduce((s, p) => s + Number(p.mt_suivi || 0), 0);
  const totalSeance = _paRows.reduce((s, p) => s + Number(p.mt_seance || 0), 0);
  const totalUrssaf = _paRows.filter(p => p.decla_urssaf).reduce((s, p) => s + Number(p.mt_suivi || 0) + Number(p.mt_seance || 0), 0);

  const clientsPayes = new Set(_paRows.filter(p => p.client_id).map(p => p.client_id));
  const estMoisEnCours = _paMois === moisActuel() && _paAnnee === new Date().getFullYear();
  const jourAujourdhui = new Date().getDate();
  const enAttente = S.clients
    .filter(c => c.statut === 'actif' && !clientsPayes.has(c.id))
    .map(c => ({ ...c, enRetard: estMoisEnCours && c.jour_paiement && jourAujourdhui > c.jour_paiement, note: notesParClient[c.id]?.note || '' }))
    .sort((a, b) => (a.jour_paiement || 99) - (b.jour_paiement || 99));

  const idsAppTraining = enAttente.map(c => c.apptraining_client_id).filter(Boolean);
  const dernieresRelances = await _fetchDernieresRelances(idsAppTraining);

  document.getElementById('pa-body').innerHTML = `
    <div class="toolbar">
      <select onchange="_paMois=this.value;renderPaiements()" style="background:var(--card2);color:var(--text);border:1px solid var(--border);padding:9px 12px;border-radius:10px;">
        ${MOIS.map(m => `<option value="${m}" ${m===_paMois?'selected':''}>${m}</option>`).join('')}
      </select>
    </div>
    <div class="grid cards4" style="margin-bottom:18px;">
      <div class="card kpi"><div class="label">Suivis</div><div class="value pos">${fmtEUR(totalSuivi)}</div></div>
      <div class="card kpi"><div class="label">Séances</div><div class="value pos">${fmtEUR(totalSeance)}</div></div>
      <div class="card kpi"><div class="label">Total</div><div class="value">${fmtEUR(totalSuivi + totalSeance)}</div></div>
      <div class="card kpi"><div class="label">Déclaré URSSAF</div><div class="value">${fmtEUR(totalUrssaf)}</div></div>
    </div>

    <div class="page-sub" style="margin:0 0 10px;font-weight:700;">Clients en attente de paiement — ${_paMois} (${enAttente.length})</div>
    <div class="table-wrap" style="margin-bottom:24px;">
      <table>
        <thead><tr><th>Client</th><th>Jour de paiement prévu</th><th>Moyen</th><th>Statut</th><th>Note</th><th>Dernière relance</th><th></th></tr></thead>
        <tbody>
          ${enAttente.length ? enAttente.map(c => `
            <tr>
              <td><b>${esc(c.prenom)} ${esc(c.nom)}</b></td>
              <td>${c.jour_paiement ? `le ${c.jour_paiement}` : '—'}</td>
              <td><span class="badge ${c.mode_paiement === 'ESP' ? 'badge-gold' : c.mode_paiement === 'Gocardless' ? 'badge-blue' : 'badge-green'}">${esc(c.mode_paiement) || '—'}</span> ${c.moy_paiement ? `<span class="page-sub">${esc(c.moy_paiement)}</span>` : ''}</td>
              <td>${c.note ? '<span class="badge badge-blue">Noté</span>' : c.enRetard ? '<span class="badge badge-red">En retard</span>' : '<span class="badge badge-muted">En attente</span>'}</td>
              <td style="max-width:220px;cursor:pointer;" onclick='ouvrirNotePaiement("${c.id}", ${JSON.stringify(c.note)})'>${c.note ? `<span class="page-sub">${esc(c.note)}</span>` : '<span class="btn btn-ghost btn-sm">+ Note</span>'}</td>
              <td>${dernieresRelances[c.apptraining_client_id] ? `<span class="badge badge-gold">Relancé</span> <span class="page-sub">${fmtDate(dernieresRelances[c.apptraining_client_id])}</span>` : '—'}</td>
              <td style="display:flex;gap:6px;">
                ${c.apptraining_client_id && c.mode_paiement !== 'Gocardless' ? `<button class="btn btn-ghost btn-sm" onclick="relancerPaiementClient('${c.apptraining_client_id}', '${esc(c.prenom)} ${esc(c.nom)}')">Relancer</button>` : ''}
                <button class="btn btn-primary btn-sm" onclick="ouvrirValidationPaiementClient('${c.id}')">Marquer payé</button>
              </td>
            </tr>`).join('') : `<tr><td colspan="7"><div class="empty">Tous les clients actifs ont payé pour ${_paMois} 🎉</div></td></tr>`}
        </tbody>
      </table>
    </div>

    <div class="page-sub" style="margin:0 0 10px;font-weight:700;">Encaissements validés — ${_paMois}</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Client</th><th>Date</th><th>Suivi</th><th>Séance</th><th>Banque</th><th>URSSAF</th><th></th></tr></thead>
        <tbody>
          ${_paRows.length ? _paRows.map(p => `
            <tr>
              <td><b>${esc(p.nom_client)}</b></td>
              <td>${fmtDate(p.date_paiement)}</td>
              <td>${p.mt_suivi ? fmtEUR(p.mt_suivi) : '—'}</td>
              <td>${p.mt_seance ? fmtEUR(p.mt_seance) : '—'}</td>
              <td>${esc(p.banque) || '—'}</td>
              <td>${p.decla_urssaf ? '<span class="badge badge-green">Oui</span>' : '<span class="badge badge-muted">Non</span>'}</td>
              <td><button class="btn btn-ghost btn-sm" onclick="deletePaiement('${p.id}')">Suppr.</button></td>
            </tr>`).join('') : `<tr><td colspan="7"><div class="empty">Aucun encaissement pour ${_paMois}</div></td></tr>`}
        </tbody>
      </table>
    </div>`;
}

async function relancerPaiementClient(apptrainingClientId, nomClient) {
  if (!confirm(`Envoyer un rappel de paiement push à ${nomClient} ?`)) return;
  try {
    const res = await fetch(RELANCE_PAIEMENT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sync-secret': SYNC_SHARED_SECRET },
      body: JSON.stringify({ client_id: apptrainingClientId }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) throw new Error(data?.error || `Erreur (${res.status})`);
    toast(data.sent > 0 ? 'Rappel envoyé' : 'Rappel enregistré (client sans notifications activées)', 'ok');
    await renderPaiements();
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
}

// Dernière relance de paiement envoyée par client — lue directement dans
// AppTrainingDatabase (client_notifications, source='rappel_paiement') puisque
// c'est là que relance-paiement les écrit ; pas de copie locale à tenir à jour.
async function _fetchDernieresRelances(apptrainingIds) {
  if (!apptrainingIds.length) return {};
  try {
    const res = await fetch(
      `${TRAINING_SUPABASE_URL}/rest/v1/client_notifications?source=eq.rappel_paiement&client_id=in.(${apptrainingIds.join(',')})&select=client_id,created_at&order=created_at.desc`,
      { headers: { apikey: TRAINING_ANON_KEY, Authorization: `Bearer ${TRAINING_ANON_KEY}` } }
    );
    if (!res.ok) return {};
    const rows = await res.json();
    const parClient = {};
    rows.forEach(r => { if (!parClient[r.client_id]) parClient[r.client_id] = r.created_at; });
    return parClient;
  } catch { return {}; }
}

function ouvrirNotePaiement(clientId, noteActuelle) {
  const c = S.clients.find(x => x.id === clientId);
  if (!c) return;
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">
    <h3>Note — ${esc(c.prenom)} ${esc(c.nom)} (${_paMois})</h3>
    <div class="field"><label>Note</label><textarea id="np-note" rows="3" placeholder="ex: a payé en avance le mois dernier, offert, etc.">${esc(noteActuelle || '')}</textarea></div>
    <div class="modal-actions">
      ${noteActuelle ? `<button class="btn btn-ghost" onclick="supprimerNotePaiement('${clientId}')">Supprimer</button>` : ''}
      <div style="flex:1;"></div>
      <button class="btn btn-ghost" onclick="this.closest('.modal-bg').remove()">Annuler</button>
      <button class="btn btn-primary" onclick="sauvegarderNotePaiement('${clientId}')">Enregistrer</button>
    </div>
  </div>`;
  bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
}

async function sauvegarderNotePaiement(clientId) {
  const note = document.getElementById('np-note').value.trim();
  if (!note) { toast('Note vide', 'err'); return; }
  try {
    const existantes = await sbSelect('compta_notes_paiement', `client_id=eq.${clientId}&mois=eq.${encodeURIComponent(_paMois)}&annee=eq.${_paAnnee}`);
    if (existantes.length) await sbUpdate('compta_notes_paiement', existantes[0].id, { note });
    else await sbInsert('compta_notes_paiement', { client_id: clientId, mois: _paMois, annee: _paAnnee, note });
    document.querySelector('.modal-bg')?.remove();
    toast('Note enregistrée', 'ok');
    await renderPaiements();
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
}

async function supprimerNotePaiement(clientId) {
  try {
    const existantes = await sbSelect('compta_notes_paiement', `client_id=eq.${clientId}&mois=eq.${encodeURIComponent(_paMois)}&annee=eq.${_paAnnee}`);
    for (const n of existantes) await sbDelete('compta_notes_paiement', n.id);
    document.querySelector('.modal-bg')?.remove();
    toast('Note supprimée', 'ok');
    await renderPaiements();
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
}

function ouvrirValidationPaiementClient(clientId) {
  const c = S.clients.find(x => x.id === clientId);
  if (!c) return;
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">
    <h3>Marquer payé — ${esc(c.prenom)} ${esc(c.nom)}</h3>
    <div class="field"><label>Date de paiement</label><input id="vp-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
    <div class="row2">
      <div class="field"><label>Montant suivi (€)</label><input id="vp-suivi" type="number" step="0.01" value="${c.tarif || 0}"></div>
      ${seancesActives(_paMois, _paAnnee) ? `<div class="field"><label>Montant séance (€)</label><input id="vp-seance" type="number" step="0.01" value="0"></div>` : ''}
    </div>
    <div class="field"><label>Banque</label>
      <select id="vp-banque">${['Qonto','Revolut','Crédit Agricole','Sumeria','Espèces','Paypal'].map(b => `<option ${c.moy_paiement===b?'selected':''}>${b}</option>`).join('')}</select>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="this.closest('.modal-bg').remove()">Annuler</button>
      <button class="btn btn-primary" onclick="validerPaiementClient('${clientId}')">Valider</button>
    </div>
  </div>`;
  bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
}

async function validerPaiementClient(clientId) {
  const c = S.clients.find(x => x.id === clientId);
  if (!c) return;
  try {
    await sbInsert('compta_paiements', {
      client_id: clientId, nom_client: `${c.prenom} ${c.nom}`, mois: _paMois, annee: _paAnnee,
      date_paiement: document.getElementById('vp-date').value,
      mt_suivi: parseFloat(document.getElementById('vp-suivi').value) || 0,
      mt_seance: parseFloat(document.getElementById('vp-seance')?.value) || 0,
      banque: document.getElementById('vp-banque').value,
      decla_urssaf: false,
    });
    document.querySelector('.modal-bg')?.remove();
    toast('Paiement validé', 'ok');
    await renderPaiements();
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
}

// ── GOCARDLESS — rapprochement ──────────────────────────────────────
let _gcRows = [];

function _normNom(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
}

// Exige que le NOM de famille corresponde exactement (normalisé) — le prénom seul
// ne suffit jamais à matcher (ex: "Thomas Granier" ne doit jamais matcher "Thomas GROCQ").
function _matchClientGC(nomGC) {
  const toks = _normNom(nomGC).split(/\s+/).filter(Boolean);
  if (!toks.length) return null;
  const prenomGC = toks[0];
  const nomGCFam = toks[toks.length - 1];

  const candidats = S.clients.filter(c => _normNom(c.nom) === nomGCFam);
  if (candidats.length === 1) return candidats[0];
  if (candidats.length > 1) {
    const avecPrenom = candidats.find(c => _normNom(c.prenom) === prenomGC);
    return avecPrenom || null; // plusieurs homonymes de nom sans prénom qui tranche -> pas de match auto
  }
  return null;
}

// ── PRÉVISIONNEL — fusionne les échéances GoCardless à venir (upcoming_payments
// des abonnements actifs, fournies telles quelles par l'API, aucun calcul à
// refaire) avec une projection simple des clients virement/espèces (leur tarif
// répété chaque mois tant qu'ils restent actifs) — pour savoir à l'avance combien
// de revenu coaching attendre sur les prochains mois.
async function _renderPrevisionnel() {
  document.getElementById('pa-body').innerHTML = `<div class="empty">Calcul du prévisionnel…</div>`;
  let previsionGC = {};
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/gocardless-sync?forecast=1`, { headers: supaHeaders() });
    const data = await res.json();
    if (data.ok) previsionGC = data.prevision;
  } catch { /* si GoCardless est injoignable, on affiche quand même le prévisionnel virement seul */ }

  const clientsManuels = S.clients.filter(c => c.statut === 'actif' && c.mode_paiement !== 'Gocardless' && Number(c.tarif) > 0);

  const aujourdhui = new Date();
  const moisListe = [];
  for (let i = 1; i <= 6; i++) {
    const d = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth() + i, 1);
    moisListe.push({ key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, label: `${MOIS[d.getMonth()]} ${d.getFullYear()}` });
  }

  const lignes = moisListe.map(({ key, label }) => {
    const gc = previsionGC[key] || { total: 0, lignes: [] };
    const actifsCeMois = clientsManuels.filter(c => !c.date_fin || c.date_fin.slice(0, 7) >= key);
    const manuelTotal = actifsCeMois.reduce((s, c) => s + Number(c.tarif || 0), 0);
    return { label, gcTotal: gc.total, gcLignes: gc.lignes, manuelTotal, nbClients: actifsCeMois.length, total: gc.total + manuelTotal };
  });

  document.getElementById('pa-body').innerHTML = `
    <div class="page-sub" style="margin:0 0 14px;">GoCardless : échéances réellement programmées (abonnements actifs). Virement/Espèces : projection sur la base du tarif des clients actifs, tant qu'ils le restent.</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Mois</th><th>GoCardless prévu</th><th>Virement/ESP prévu</th><th>Total prévisionnel</th></tr></thead>
        <tbody>
          ${lignes.map(l => `
            <tr>
              <td><b>${l.label}</b></td>
              <td>${fmtEUR(l.gcTotal)}${l.gcLignes.length ? `<div class="page-sub">${l.gcLignes.map(x=>esc(x.nom)).join(', ')}</div>` : ''}</td>
              <td>${fmtEUR(l.manuelTotal)}<div class="page-sub">${l.nbClients} client(s)</div></td>
              <td><b>${fmtEUR(l.total)}</b></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="page-sub" style="margin-top:14px;">Le prévisionnel virement/espèces suppose que ces clients restent actifs et payent leur tarif habituel — pense à vérifier une fin de coaching connue.</div>
  `;
}

async function _renderGoCardless() {
  _gcRows = await sbSelect('compta_gocardless_transactions', 'importe=eq.false&order=date_versement.desc');
  const total = _gcRows.reduce((s, r) => s + Number(r.montant || 0), 0);

  document.getElementById('pa-body').innerHTML = `
    <div class="toolbar">
      <button class="btn btn-primary" onclick="lancerSyncGoCardless()">Resynchroniser</button>
      <div style="flex:1;"></div>
      <button class="btn btn-ghost" onclick="importerToutGoCardless()">Importer tout (correspondances trouvées)</button>
    </div>
    <div class="page-sub" style="margin:-8px 0 14px;">Synchronisé automatiquement à l'ouverture — les correspondances certaines partent direct dans "Par mois". Seuls les paiements réellement <b>versés</b> apparaissent ici · ${_gcRows.length} sans correspondance sûre · ${fmtEUR(total)}</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date de versement</th><th>Client GoCardless</th><th>Montant</th><th>Rattacher à</th><th></th></tr></thead>
        <tbody>
          ${_gcRows.length ? _gcRows.map(r => {
            const match = _matchClientGC(r.nom_client_gc);
            return `
            <tr id="gc-row-${r.id}">
              <td>${fmtDate(r.date_versement || r.charge_date)}</td>
              <td>${esc(r.nom_client_gc) || '—'}<div class="page-sub">${esc(r.description) || ''}</div></td>
              <td>${fmtEUR(r.montant)}</td>
              <td>
                <select id="gc-client-${r.id}" style="background:var(--card2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:6px 8px;min-width:180px;">
                  <option value="">— Saisie libre —</option>
                  ${S.clients.map(c => `<option value="${c.id}" ${match && match.id===c.id ? 'selected' : ''}>${esc(c.prenom)} ${esc(c.nom)}</option>`).join('')}
                </select>
              </td>
              <td><button class="btn btn-primary btn-sm" onclick="importerGoCardless('${r.id}')">Importer</button></td>
            </tr>`;
          }).join('') : `<tr><td colspan="5"><div class="empty">Rien à rapprocher — clique "Synchroniser GoCardless"</div></td></tr>`}
        </tbody>
      </table>
    </div>`;
}

async function lancerSyncGoCardless() {
  toast('Synchronisation en cours…', 'ok');
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/gocardless-sync`, {
      method: 'POST', headers: supaHeaders(),
    });
    if (res.status === 401) throw new Error('Session expirée — reconnecte-toi puis réessaie.');
    let data;
    try { data = await res.json(); } catch { throw new Error(`Réponse invalide du serveur (${res.status})`); }
    if (!data.ok) throw new Error(data.error || 'Erreur de synchronisation');
    const importes = await _autoImporterMatchesGC();
    toast(importes > 0 ? `${importes} paiement(s) rattaché(s) automatiquement` : `${data.nouveaux} nouveau(x) paiement(s) versé(s)`, 'ok');
    _paDerniereSyncGC = Date.now();
    await renderPaiements();
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
}

async function _creerPaiementDepuisGC(row, clientId) {
  const client = clientId ? S.clients.find(c => c.id === clientId) : null;
  const dateVersement = row.date_versement || row.charge_date;
  const nomClient = client ? `${client.prenom} ${client.nom}` : (row.nom_client_gc || 'Inconnu');
  const mois = MOIS[new Date(dateVersement).getMonth()];
  const annee = new Date(dateVersement).getFullYear();
  const paiement = await sbInsert('compta_paiements', {
    client_id: clientId, nom_client: nomClient, mois, annee: annee || 2026,
    date_paiement: dateVersement, mt_suivi: row.montant, mt_seance: 0,
    banque: 'GoCardless', decla_urssaf: false,
  });
  await sbUpdate('compta_gocardless_transactions', row.id, { importe: true, client_id: clientId, paiement_id: paiement[0].id });
  return paiement[0];
}

async function importerGoCardless(id) {
  const row = _gcRows.find(r => r.id === id);
  if (!row) return;
  const clientId = document.getElementById(`gc-client-${id}`).value || null;
  try {
    await _creerPaiementDepuisGC(row, clientId);
    document.getElementById(`gc-row-${id}`)?.remove();
    toast('Paiement importé', 'ok');
    _gcRows = _gcRows.filter(r => r.id !== id);
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
}

// Importe automatiquement les paiements en attente dont le client correspond
// de façon certaine (nom de famille exact) — ils apparaissent directement dans
// "Par mois" et comptent dans les revenus, sans étape manuelle. Les paiements
// sans correspondance sûre restent dans l'onglet GoCardless pour rattachement à la main.
async function _autoImporterMatchesGC() {
  const enAttente = await sbSelect('compta_gocardless_transactions', 'importe=eq.false');
  let importes = 0;
  for (const row of enAttente) {
    const match = _matchClientGC(row.nom_client_gc);
    if (!match) continue;
    try { await _creerPaiementDepuisGC(row, match.id); importes++; }
    catch { /* on retentera au prochain cycle */ }
  }
  return importes;
}

// Synchronise GoCardless en silence et rattache automatiquement ce qui peut
// l'être — appelé à l'ouverture de la page Paiements.
async function _syncEtImporterAutoGoCardless() {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/gocardless-sync`, { method: 'POST', headers: supaHeaders() });
    if (!res.ok) return 0;
    const data = await res.json().catch(() => null);
    if (!data?.ok) return 0;
    const importes = await _autoImporterMatchesGC();
    if (importes > 0) toast(`${importes} paiement(s) GoCardless versé(s) rattaché(s) automatiquement`, 'ok');
    else if (data.nouveaux > 0) toast(`${data.nouveaux} nouveau(x) paiement(s) versé(s) — à rattacher dans l'onglet GoCardless`, 'ok');
    return importes + (data.nouveaux || 0);
  } catch { return 0; /* silencieux : la synchro manuelle affichera l'erreur si besoin */ }
}

async function importerToutGoCardless() {
  const avecMatch = _gcRows.filter(r => _matchClientGC(r.nom_client_gc));
  if (!avecMatch.length) { toast('Aucune correspondance trouvée', 'err'); return; }
  if (!confirm(`Importer ${avecMatch.length} paiement(s) avec correspondance automatique ?`)) return;
  for (const r of avecMatch) await importerGoCardless(r.id);
  toast(`${avecMatch.length} paiement(s) importé(s)`, 'ok');
  await renderPaiements();
}

function openPaiementModal() {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">
    <h3>Nouvel encaissement — ${_paMois}</h3>
    <div class="field"><label>Client</label>
      <select id="pf-client" onchange="_paAutofill()">
        <option value="">— Saisie libre —</option>
        ${S.clients.map(c => `<option value="${c.id}" data-tarif="${c.tarif||''}" data-nom="${esc(c.prenom)} ${esc(c.nom)}">${esc(c.prenom)} ${esc(c.nom)}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>Nom (si saisie libre)</label><input id="pf-nom"></div>
    <div class="field"><label>Date</label><input id="pf-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
    <div class="row2">
      <div class="field"><label>Montant suivi (€)</label><input id="pf-suivi" type="number" step="0.01" value="0"></div>
      ${seancesActives(_paMois, _paAnnee) ? `<div class="field"><label>Montant séance (€)</label><input id="pf-seance" type="number" step="0.01" value="0"></div>` : ''}
    </div>
    <div class="field"><label>Banque</label>
      <select id="pf-banque">${['Qonto','Revolut','Crédit Agricole','Sumeria','Espèces','Paypal'].map(b => `<option>${b}</option>`).join('')}</select>
    </div>
    <div class="checkbox-row"><input id="pf-urssaf" type="checkbox"> <label>Déclarer URSSAF</label></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="this.closest('.modal-bg').remove()">Annuler</button>
      <button class="btn btn-primary" onclick="savePaiement()">Enregistrer</button>
    </div>
  </div>`;
  bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
}

function _paAutofill() {
  const sel = document.getElementById('pf-client');
  const opt = sel.selectedOptions[0];
  if (opt && opt.value) {
    document.getElementById('pf-nom').value = opt.dataset.nom;
    if (opt.dataset.tarif) document.getElementById('pf-suivi').value = opt.dataset.tarif;
  }
}

async function savePaiement() {
  const clientId = document.getElementById('pf-client').value || null;
  const clientOpt = document.getElementById('pf-client').selectedOptions[0];
  const nom = document.getElementById('pf-nom').value.trim() || (clientId ? clientOpt.dataset.nom : '');
  if (!nom) { toast('Nom requis', 'err'); return; }
  const body = {
    client_id: clientId,
    nom_client: nom,
    mois: _paMois,
    annee: _paAnnee,
    date_paiement: document.getElementById('pf-date').value || null,
    mt_suivi: parseFloat(document.getElementById('pf-suivi').value) || 0,
    mt_seance: parseFloat(document.getElementById('pf-seance')?.value) || 0,
    banque: document.getElementById('pf-banque').value,
    decla_urssaf: document.getElementById('pf-urssaf').checked,
  };
  try {
    await sbInsert('compta_paiements', body);
    document.querySelector('.modal-bg')?.remove();
    toast('Encaissement enregistré', 'ok');
    await renderPaiements();
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
}

async function deletePaiement(id) {
  if (!confirm('Supprimer cet encaissement ?')) return;
  try { await sbDelete('compta_paiements', id); await renderPaiements(); toast('Supprimé', 'ok'); }
  catch (e) { toast('Erreur : ' + e.message, 'err'); }
}
