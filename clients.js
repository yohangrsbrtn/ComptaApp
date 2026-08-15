let _clSearch = '';
let _clStatut = 'actif';

async function renderClients() {
  await loadClients();
  const term = _clSearch.toLowerCase();
  const list = S.clients
    .filter(c => (_clStatut === 'tous' || (c.statut || 'actif') === _clStatut))
    .filter(c => !term || `${c.prenom} ${c.nom}`.toLowerCase().includes(term));

  document.getElementById('root').innerHTML = shell(`
    <div class="topbar">
      <div><div class="page-title">Clients</div><div class="page-sub">${S.clients.length} client(s)</div></div>
      <button class="btn btn-primary" onclick="openClientModal()">+ Nouveau client</button>
    </div>
    <div class="toolbar">
      <div class="search"><input placeholder="Rechercher un client…" value="${esc(_clSearch)}" oninput="_clSearch=this.value;renderClients()"></div>
      <div class="pill-tabs">
        <div class="pill-tab ${_clStatut === 'actif' ? 'active' : ''}" onclick="_clStatut='actif';renderClients()">Actifs</div>
        <div class="pill-tab ${_clStatut === 'ancien' ? 'active' : ''}" onclick="_clStatut='ancien';renderClients()">Anciens</div>
        <div class="pill-tab ${_clStatut === 'tous' ? 'active' : ''}" onclick="_clStatut='tous';renderClients()">Tous</div>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Client</th><th>Tarif</th><th>Pack</th><th>Paiement</th><th>Fin coaching</th><th>Bilan</th><th></th></tr></thead>
        <tbody>
          ${list.length ? list.map(c => `
            <tr style="cursor:pointer" onclick="openClientModal('${c.id}')">
              <td><b>${esc(c.prenom)} ${esc(c.nom)}</b>${c.salle_sport ? `<div class="page-sub">${esc(c.salle_sport)}</div>` : ''}</td>
              <td>${c.tarif ? fmtEUR(c.tarif) : '—'}</td>
              <td>${esc(c.pack) || '—'}</td>
              <td><span class="badge ${c.mode_paiement === 'ESP' ? 'badge-gold' : c.mode_paiement === 'Gocardless' ? 'badge-blue' : 'badge-green'}">${esc(c.mode_paiement) || '—'}</span> ${c.moy_paiement ? `<span class="page-sub">${esc(c.moy_paiement)}</span>` : ''}</td>
              <td>${fmtDate(c.date_fin) || '—'}</td>
              <td>${c.bilan ? '<span class="badge badge-green">Oui</span>' : '<span class="badge badge-muted">Non</span>'}</td>
              <td onclick="event.stopPropagation()"><button class="btn btn-ghost btn-sm" onclick="deleteClient('${c.id}','${esc(c.prenom)} ${esc(c.nom)}')">Suppr.</button></td>
            </tr>`).join('') : `<tr><td colspan="7"><div class="empty">Aucun client</div></td></tr>`}
        </tbody>
      </table>
    </div>
  `);
}

function _clientForm(c) {
  c = c || {};
  return `
    <div class="row2">
      <div class="field"><label>Prénom</label><input id="cf-prenom" value="${esc(c.prenom)}"></div>
      <div class="field"><label>Nom</label><input id="cf-nom" value="${esc(c.nom)}"></div>
    </div>
    <div class="row2">
      <div class="field"><label>Tarif (€)</label><input id="cf-tarif" type="number" step="0.01" value="${c.tarif ?? ''}"></div>
      <div class="field"><label>Pack</label><input id="cf-pack" value="${esc(c.pack)}" placeholder="Suivi 3 mois"></div>
    </div>
    <div class="row2">
      <div class="field"><label>Début coaching</label><input id="cf-debut" type="date" value="${c.date_debut ? c.date_debut.slice(0,10) : ''}"></div>
      <div class="field"><label>Fin coaching</label><input id="cf-fin" type="date" value="${c.date_fin ? c.date_fin.slice(0,10) : ''}"></div>
    </div>
    <div class="row2">
      <div class="field"><label>Mode de paiement</label>
        <select id="cf-mode">
          ${['Virement','ESP','Gocardless'].map(m => `<option value="${m}" ${c.mode_paiement===m?'selected':''}>${m}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Banque</label>
        <select id="cf-banque">
          ${['','Qonto','Revolut','Crédit Agricole','Sumeria'].map(m => `<option value="${m}" ${c.moy_paiement===m?'selected':''}>${m || '—'}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="row2">
      <div class="field"><label>Jour de paiement</label><input id="cf-jourpaiement" type="number" value="${c.jour_paiement ?? ''}"></div>
      <div class="field"><label>Jour de bilan</label>
        <select id="cf-jourbilan">
          ${['','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'].map(j => `<option value="${j}" ${c.jour_bilan===j?'selected':''}>${j || '—'}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field"><label>Salle de sport</label><input id="cf-salle" value="${esc(c.salle_sport)}"></div>
    <div class="field"><label>Objectifs</label><input id="cf-objectifs" value="${esc(c.objectifs)}"></div>
    <div class="field"><label>Adresse (pour facture)</label><textarea id="cf-adresse" rows="2">${esc(c.adresse)}</textarea></div>
    <div class="row2">
      <div class="checkbox-row"><input id="cf-bilan" type="checkbox" ${c.bilan?'checked':''}> <label>Bilan activé</label></div>
      <div class="field"><label>Statut</label>
        <select id="cf-statut">
          <option value="actif" ${(c.statut||'actif')==='actif'?'selected':''}>Actif</option>
          <option value="ancien" ${c.statut==='ancien'?'selected':''}>Ancien</option>
        </select>
      </div>
    </div>
    <div class="field"><label>Notes</label><textarea id="cf-notes" rows="2">${esc(c.notes)}</textarea></div>
  `;
}

function openClientModal(id) {
  const c = id ? S.clients.find(x => x.id === id) : null;
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">
    <h3>${c ? 'Modifier' : 'Nouveau'} client</h3>
    ${_clientForm(c)}
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="this.closest('.modal-bg').remove()">Annuler</button>
      <button class="btn btn-primary" onclick="saveClient('${id || ''}')">Enregistrer</button>
    </div>
  </div>`;
  bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
}

async function saveClient(id) {
  const body = {
    prenom: document.getElementById('cf-prenom').value.trim(),
    nom: document.getElementById('cf-nom').value.trim(),
    tarif: parseFloat(document.getElementById('cf-tarif').value) || null,
    pack: document.getElementById('cf-pack').value.trim() || null,
    date_debut: document.getElementById('cf-debut').value || null,
    date_fin: document.getElementById('cf-fin').value || null,
    mode_paiement: document.getElementById('cf-mode').value,
    moy_paiement: document.getElementById('cf-banque').value || null,
    jour_paiement: parseInt(document.getElementById('cf-jourpaiement').value) || null,
    jour_bilan: document.getElementById('cf-jourbilan').value || null,
    salle_sport: document.getElementById('cf-salle').value.trim() || null,
    objectifs: document.getElementById('cf-objectifs').value.trim() || null,
    adresse: document.getElementById('cf-adresse').value.trim() || null,
    bilan: document.getElementById('cf-bilan').checked,
    statut: document.getElementById('cf-statut').value,
    notes: document.getElementById('cf-notes').value.trim() || null,
    updated_at: new Date().toISOString(),
  };
  if (!body.prenom || !body.nom) { toast('Prénom et nom requis', 'err'); return; }
  try {
    if (id) await sbUpdate('compta_clients', id, body);
    else await sbInsert('compta_clients', body);
    document.querySelector('.modal-bg')?.remove();
    toast('Client enregistré', 'ok');
    await loadClients(true);
    await renderClients();
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
}

async function deleteClient(id, name) {
  if (!confirm(`Supprimer ${name} ?`)) return;
  try {
    await sbDelete('compta_clients', id);
    await loadClients(true);
    await renderClients();
    toast('Client supprimé', 'ok');
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
}
