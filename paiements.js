let _paMois = moisActuel();
let _paAnnee = 2026;
let _paRows = [];

async function renderPaiements() {
  await loadClients();
  _paRows = await sbSelect('compta_paiements', `mois=eq.${encodeURIComponent(_paMois)}&annee=eq.${_paAnnee}&order=date_paiement.asc`);
  const totalSuivi = _paRows.reduce((s, p) => s + Number(p.mt_suivi || 0), 0);
  const totalSeance = _paRows.reduce((s, p) => s + Number(p.mt_seance || 0), 0);
  const totalUrssaf = _paRows.filter(p => p.decla_urssaf).reduce((s, p) => s + Number(p.mt_suivi || 0) + Number(p.mt_seance || 0), 0);

  document.getElementById('root').innerHTML = shell(`
    <div class="topbar">
      <div><div class="page-title">Paiements clients</div><div class="page-sub">Encaissements par mois</div></div>
      <div style="display:flex;gap:10px;">
        <button class="btn btn-ghost" onclick="openGenerationFactures()">Générer les factures</button>
        <button class="btn btn-primary" onclick="openPaiementModal()">+ Encaissement</button>
      </div>
    </div>
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
    </div>
  `);
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
