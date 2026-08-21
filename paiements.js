let _paMois = moisActuel();
let _paAnnee = 2026;
let _paRows = [];
let _paTab = 'mois';

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
    </div>
    <div id="pa-body"></div>
  `);

  const body = document.getElementById('pa-body');
  if (_paTab === 'mois') { body.innerHTML = ''; await _renderPaiementsMois(); }
  else { body.innerHTML = `<div class="empty">Chargement…</div>`; await _renderGoCardless(); }
}

async function _renderPaiementsMois() {
  _paRows = await sbSelect('compta_paiements', `mois=eq.${encodeURIComponent(_paMois)}&annee=eq.${_paAnnee}&order=date_paiement.asc`);
  const totalSuivi = _paRows.reduce((s, p) => s + Number(p.mt_suivi || 0), 0);
  const totalSeance = _paRows.reduce((s, p) => s + Number(p.mt_seance || 0), 0);
  const totalUrssaf = _paRows.filter(p => p.decla_urssaf).reduce((s, p) => s + Number(p.mt_suivi || 0) + Number(p.mt_seance || 0), 0);

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

async function _renderGoCardless() {
  await _syncGoCardlessSilencieux();
  _gcRows = await sbSelect('compta_gocardless_transactions', 'importe=eq.false&order=charge_date.desc');
  const total = _gcRows.reduce((s, r) => s + Number(r.montant || 0), 0);

  document.getElementById('pa-body').innerHTML = `
    <div class="toolbar">
      <button class="btn btn-primary" onclick="lancerSyncGoCardless()">Resynchroniser</button>
      <div style="flex:1;"></div>
      <button class="btn btn-ghost" onclick="importerToutGoCardless()">Importer tout (correspondances trouvées)</button>
    </div>
    <div class="page-sub" style="margin:-8px 0 14px;">Synchronisé automatiquement à l'ouverture — seuls les paiements réellement <b>versés</b> par GoCardless apparaissent ici · ${_gcRows.length} en attente de rapprochement · ${fmtEUR(total)}</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Client GoCardless</th><th>Montant</th><th>Rattacher à</th><th></th></tr></thead>
        <tbody>
          ${_gcRows.length ? _gcRows.map(r => {
            const match = _matchClientGC(r.nom_client_gc);
            return `
            <tr id="gc-row-${r.id}">
              <td>${fmtDate(r.charge_date)}</td>
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

async function _syncGoCardlessSilencieux() {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/gocardless-sync`, {
      method: 'POST', headers: supaHeaders(),
    });
    if (!res.ok) return;
    const data = await res.json().catch(() => null);
    if (data?.ok && data.nouveaux > 0) toast(`${data.nouveaux} nouveau(x) paiement(s) versé(s) par GoCardless`, 'ok');
  } catch { /* silencieux : la synchro manuelle affichera l'erreur si besoin */ }
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
    toast(`${data.nouveaux} nouveau(x) paiement(s) importé(s) de GoCardless`, 'ok');
    await renderPaiements();
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
}

async function importerGoCardless(id) {
  const row = _gcRows.find(r => r.id === id);
  if (!row) return;
  const clientId = document.getElementById(`gc-client-${id}`).value || null;
  const client = clientId ? S.clients.find(c => c.id === clientId) : null;
  const nomClient = client ? `${client.prenom} ${client.nom}` : (row.nom_client_gc || 'Inconnu');
  const mois = MOIS[new Date(row.charge_date).getMonth()];
  const annee = new Date(row.charge_date).getFullYear();
  try {
    const paiement = await sbInsert('compta_paiements', {
      client_id: clientId, nom_client: nomClient, mois, annee: annee || 2026,
      date_paiement: row.charge_date, mt_suivi: row.montant, mt_seance: 0,
      banque: 'GoCardless', decla_urssaf: false,
    });
    await sbUpdate('compta_gocardless_transactions', id, { importe: true, client_id: clientId, paiement_id: paiement[0].id });
    document.getElementById(`gc-row-${id}`)?.remove();
    toast('Paiement importé', 'ok');
    _gcRows = _gcRows.filter(r => r.id !== id);
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
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
      <div class="field"><label>Montant séance (€)</label><input id="pf-seance" type="number" step="0.01" value="0"></div>
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
    mt_seance: parseFloat(document.getElementById('pf-seance').value) || 0,
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
