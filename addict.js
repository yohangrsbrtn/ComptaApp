let _adTab = 'ventes';
let _adData = [];
let _adAchats = [];
let _adSearch = '';

async function renderAddict() {
  const [ventes, achats] = await Promise.all([
    sbSelect('compta_addict', 'select=*&order=date.desc&limit=500'),
    sbSelect('compta_addict_achats', "statut=neq.recue&order=created_at.desc"),
  ]);
  _adData = ventes; _adAchats = achats;

  document.getElementById('root').innerHTML = shell(`
    <div class="topbar">
      <div><div class="page-title">Addict Nutrition</div><div class="page-sub">${_adData.length} vente(s)</div></div>
    </div>
    <div class="pill-tabs" style="margin-bottom:18px;">
      <div class="pill-tab ${_adTab==='ventes'?'active':''}" onclick="_adTab='ventes';renderAddict()">Ventes</div>
      <div class="pill-tab ${_adTab==='achats'?'active':''}" onclick="_adTab='achats';renderAddict()">Achats</div>
      <div class="pill-tab ${_adTab==='benefices'?'active':''}" onclick="_adTab='benefices';renderAddict()">Bénéfices</div>
    </div>
    <div id="ad-body"></div>
  `);

  const body = document.getElementById('ad-body');
  if (_adTab === 'ventes') body.innerHTML = _tplAdVentes();
  else if (_adTab === 'achats') body.innerHTML = _tplAdAchats();
  else { body.innerHTML = `<div class="empty">Chargement…</div>`; await _renderAdBenefices(); }
}

// ── VENTES ───────────────────────────────────────────────────────────
function _tplAdVentes() {
  const totalAchat = _adData.reduce((s, c) => s + Number(c.achat || 0), 0);
  const totalVente = _adData.reduce((s, c) => s + Number(c.vente || 0), 0);
  const benef = totalVente - totalAchat;

  const term = _adSearch.toLowerCase();
  const filtered = _adData.filter(v => !term || (v.client || '').toLowerCase().includes(term));
  const sorted = [...filtered].sort((a, b) => {
    const dd = new Date(b.date) - new Date(a.date);
    if (dd !== 0) return dd;
    return (a.client || '').localeCompare(b.client || '');
  });

  return `
    <div class="grid cards4" style="margin-bottom:18px;">
      <div class="card kpi"><div class="label">Total achat</div><div class="value">${fmtEUR(totalAchat)}</div></div>
      <div class="card kpi"><div class="label">Total vente</div><div class="value pos">${fmtEUR(totalVente)}</div></div>
      <div class="card kpi"><div class="label">Bénéfice</div><div class="value pos">${fmtEUR(benef)}</div></div>
    </div>
    <div class="toolbar">
      <div class="search"><input placeholder="Rechercher un client…" value="${esc(_adSearch)}" oninput="_adSearch=this.value;renderAddict()"></div>
      <button class="btn btn-primary" onclick="openAddictModal()">+ Vente</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Client</th><th>Produit</th><th>Qté</th><th>Achat</th><th>Vente</th><th>Bénéfice</th><th></th></tr></thead>
        <tbody>
          ${sorted.length ? sorted.map((c, i) => {
            const ben = c.vente - c.achat;
            const memeGroupe = i > 0 && sorted[i-1].date === c.date && sorted[i-1].client === c.client;
            return `
            <tr>
              <td>${memeGroupe ? '' : fmtDate(c.date)}</td>
              <td>${memeGroupe ? '' : (esc(c.client) || '—')}</td>
              <td>${esc(c.produit)}</td>
              <td>${c.quantite}</td>
              <td>${fmtEUR(c.achat)}</td>
              <td>${fmtEUR(c.vente)}</td>
              <td style="color:${ben>=0?'var(--accent2)':'var(--red)'}">${fmtEUR(ben)}</td>
              <td><button class="btn btn-ghost btn-sm" onclick="deleteAddict('${c.id}')">Suppr.</button></td>
            </tr>`; }).join('') : `<tr><td colspan="8"><div class="empty">Aucune vente</div></td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function openAddictModal() {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">
    <h3>Nouvelle vente — Addict Nutrition</h3>
    <div class="row2">
      <div class="field"><label>Date</label><input id="ad-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
      <div class="field"><label>Client</label><input id="ad-client"></div>
    </div>
    <div class="field"><label>Produit</label><input id="ad-produit"></div>
    <div class="row3">
      <div class="field"><label>Quantité</label><input id="ad-qte" type="number" value="1"></div>
      <div class="field"><label>Prix achat</label><input id="ad-achat" type="number" step="0.01" value="0"></div>
      <div class="field"><label>Prix vente</label><input id="ad-vente" type="number" step="0.01" value="0"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="this.closest('.modal-bg').remove()">Annuler</button>
      <button class="btn btn-primary" onclick="saveAddict()">Enregistrer</button>
    </div>
  </div>`;
  bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
}

async function saveAddict() {
  const body = {
    date: document.getElementById('ad-date').value,
    client: document.getElementById('ad-client').value.trim() || null,
    produit: document.getElementById('ad-produit').value.trim(),
    quantite: parseFloat(document.getElementById('ad-qte').value) || 1,
    achat: parseFloat(document.getElementById('ad-achat').value) || 0,
    vente: parseFloat(document.getElementById('ad-vente').value) || 0,
  };
  if (!body.produit) { toast('Produit requis', 'err'); return; }
  try {
    await sbInsert('compta_addict', body);
    document.querySelector('.modal-bg')?.remove();
    toast('Vente enregistrée', 'ok');
    await renderAddict();
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
}

async function deleteAddict(id) {
  if (!confirm('Supprimer cette vente ?')) return;
  try { await sbDelete('compta_addict', id); await renderAddict(); toast('Supprimé', 'ok'); }
  catch (e) { toast('Erreur : ' + e.message, 'err'); }
}

// ── ACHATS (commandes fournisseur) ──────────────────────────────────
const STATUT_AD_ACHAT = { a_passer: 'À passer', en_cours: 'En cours', recue: 'Reçue' };

function _tplAdAchats() {
  return `
    <div class="toolbar"><div></div><button class="btn btn-primary" onclick="openAdAchatModal()">+ Achat</button></div>
    <div class="page-sub" style="margin:-6px 0 10px;">La dépense ne compte qu'au passage au statut "Reçue"</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Statut</th><th>Produit</th><th>Qté</th><th>Prix achat unit.</th><th>Total</th><th></th></tr></thead>
        <tbody>
          ${_adAchats.length ? _adAchats.map(a => `
            <tr>
              <td>
                <select onchange="changerStatutAdAchat('${a.id}', this.value)" style="background:var(--card2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:5px 8px;font-size:12.5px;">
                  ${Object.keys(STATUT_AD_ACHAT).filter(s => s !== 'recue').map(s => `<option value="${s}" ${a.statut===s?'selected':''}>${STATUT_AD_ACHAT[s]}</option>`).join('')}
                </select>
              </td>
              <td><b>${esc(a.produit)}</b>${a.est_frais ? ' <span class="badge badge-gold">Frais</span>' : ''}</td>
              <td>${a.quantite}</td>
              <td>${fmtEUR(a.prix_achat_unitaire)}</td>
              <td>${fmtEUR(a.quantite * a.prix_achat_unitaire)}</td>
              <td style="display:flex;gap:6px;">
                <button class="btn btn-primary btn-sm" onclick="ouvrirReceptionAdAchat('${a.id}')">Réceptionner</button>
                <button class="btn btn-ghost btn-sm" onclick="deleteAdAchat('${a.id}')">Suppr.</button>
              </td>
            </tr>`).join('') : `<tr><td colspan="6"><div class="empty">Aucun achat en attente</div></td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function openAdAchatModal() {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">
    <h3>Nouvel achat — Addict Nutrition</h3>
    <div class="field"><label>Produit</label><input id="aa-produit" placeholder="ex: Iso CFM vanille"></div>
    <div class="row2">
      <div class="field"><label>Quantité</label><input id="aa-qte" type="number" value="1"></div>
      <div class="field"><label>Prix achat unit.</label><input id="aa-prix" type="number" step="0.01" value="0"></div>
    </div>
    <div class="field"><label>Statut</label>
      <select id="aa-statut">
        <option value="a_passer">À passer</option>
        <option value="en_cours" selected>En cours (déjà commandé)</option>
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="this.closest('.modal-bg').remove()">Annuler</button>
      <button class="btn btn-primary" onclick="saveAdAchat()">Enregistrer</button>
    </div>
  </div>`;
  bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
}

async function saveAdAchat() {
  const produit = document.getElementById('aa-produit').value.trim();
  if (!produit) { toast('Produit requis', 'err'); return; }
  const body = {
    produit,
    quantite: parseFloat(document.getElementById('aa-qte').value) || 1,
    prix_achat_unitaire: parseFloat(document.getElementById('aa-prix').value) || 0,
    statut: document.getElementById('aa-statut').value,
  };
  try {
    await sbInsert('compta_addict_achats', body);
    document.querySelector('.modal-bg')?.remove();
    toast('Achat enregistré', 'ok');
    await renderAddict();
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
}

async function deleteAdAchat(id) {
  if (!confirm('Supprimer cet achat ?')) return;
  try { await sbDelete('compta_addict_achats', id); await renderAddict(); toast('Supprimé', 'ok'); }
  catch (e) { toast('Erreur : ' + e.message, 'err'); }
}

async function changerStatutAdAchat(id, statut) {
  try {
    await sbUpdate('compta_addict_achats', id, { statut });
    const a = _adAchats.find(x => x.id === id);
    if (a) a.statut = statut;
    toast('Statut mis à jour', 'ok');
  } catch (e) { toast('Erreur : ' + e.message, 'err'); await renderAddict(); }
}

function ouvrirReceptionAdAchat(id) {
  const a = _adAchats.find(x => x.id === id);
  if (!a) return;
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">
    <h3>Réceptionner — ${esc(a.produit)}</h3>
    <div class="page-sub" style="margin-bottom:14px;">${a.quantite} × ${fmtEUR(a.prix_achat_unitaire)} = ${fmtEUR(a.quantite * a.prix_achat_unitaire)}</div>
    <div class="field"><label>Date de réception</label><input id="ra-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
    <div class="page-sub" style="margin-bottom:10px;">Détermine dans quel mois cette dépense est comptabilisée.</div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="this.closest('.modal-bg').remove()">Annuler</button>
      <button class="btn btn-primary" onclick="receptionnerAdAchat('${id}')">Confirmer la réception</button>
    </div>
  </div>`;
  bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
}

async function receptionnerAdAchat(id) {
  const dateReception = document.getElementById('ra-date')?.value || new Date().toISOString().slice(0, 10);
  try {
    await sbUpdate('compta_addict_achats', id, { statut: 'recue', date_reception: dateReception });
    document.querySelector('.modal-bg')?.remove();
    toast('Achat réceptionné, dépense enregistrée', 'ok');
    await renderAddict();
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
}

// ── BÉNÉFICES — jour / mois / client ────────────────────────────────
let _adBenefGroupBy = 'mois';
let _adBenefSort = { col: 'benefice', dir: 'desc' };

async function _renderAdBenefices() {
  const achatsRecus = await sbSelect('compta_addict_achats', 'statut=eq.recue&select=date_reception,quantite,prix_achat_unitaire');

  const groupes = {};
  const keyOf = d => {
    if (_adBenefGroupBy === 'jour') return { key: d, sortKey: new Date(d).getTime() };
    const dt = new Date(d);
    return { key: `${MOIS[dt.getMonth()]} ${dt.getFullYear()}`, sortKey: dt.getFullYear() * 100 + dt.getMonth() };
  };
  _adData.forEach(v => {
    const { key: k, sortKey } = _adBenefGroupBy === 'client' ? { key: v.client || '— Sans client —', sortKey: null } : keyOf(v.date);
    const g = groupes[k] = groupes[k] || { label: k, sortKey, nb: 0, vente: 0, achat: 0, achatFourn: 0 };
    g.nb++; g.vente += Number(v.vente || 0); g.achat += Number(v.achat || 0);
  });
  if (_adBenefGroupBy !== 'client') {
    achatsRecus.forEach(a => {
      if (!a.date_reception) return;
      const { key: k, sortKey } = keyOf(a.date_reception);
      const g = groupes[k] = groupes[k] || { label: k, sortKey, nb: 0, vente: 0, achat: 0, achatFourn: 0 };
      g.achatFourn += Number(a.quantite || 0) * Number(a.prix_achat_unitaire || 0);
    });
  }

  let rows = Object.values(groupes).map(g => ({ ...g, benefice: g.vente - g.achat }));
  const { col, dir } = _adBenefSort;
  rows.sort((a, b) => {
    if (col === 'label') {
      if (a.sortKey != null && b.sortKey != null) return dir === 'asc' ? a.sortKey - b.sortKey : b.sortKey - a.sortKey;
      return dir === 'asc' ? String(a.label).localeCompare(b.label) : String(b.label).localeCompare(a.label);
    }
    return dir === 'asc' ? a[col] - b[col] : b[col] - a[col];
  });

  const totVente = rows.reduce((s, r) => s + r.vente, 0);
  const totAchatFourn = rows.reduce((s, r) => s + r.achatFourn, 0);
  const totBenef = rows.reduce((s, r) => s + r.benefice, 0);

  const th = (c, label) => {
    const active = _adBenefSort.col === c;
    const arrow = active ? (_adBenefSort.dir === 'asc' ? ' ▲' : ' ▼') : '';
    return `<th style="cursor:pointer;user-select:none;" onclick="_adBenefTri('${c}')">${label}${arrow}</th>`;
  };

  document.getElementById('ad-body').innerHTML = `
    <div class="pill-tabs" style="margin-bottom:16px;">
      <div class="pill-tab ${_adBenefGroupBy==='jour'?'active':''}" onclick="_adBenefGroupBy='jour';renderAddict()">Par jour</div>
      <div class="pill-tab ${_adBenefGroupBy==='mois'?'active':''}" onclick="_adBenefGroupBy='mois';renderAddict()">Par mois</div>
      <div class="pill-tab ${_adBenefGroupBy==='client'?'active':''}" onclick="_adBenefGroupBy='client';renderAddict()">Par client</div>
    </div>
    <div class="grid cards4" style="margin-bottom:18px;">
      ${_adBenefGroupBy !== 'client' ? `<div class="card kpi"><div class="label">Achats</div><div class="value">${fmtEUR(totAchatFourn)}</div></div>` : ''}
      <div class="card kpi"><div class="label">Ventes</div><div class="value pos">${fmtEUR(totVente)}</div></div>
      <div class="card kpi"><div class="label">Bénéfice</div><div class="value pos">${fmtEUR(totBenef)}</div></div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          ${th('label', _adBenefGroupBy === 'jour' ? 'Date' : _adBenefGroupBy === 'mois' ? 'Mois' : 'Client')}
          ${th('nb', 'Nb ventes')}
          ${_adBenefGroupBy !== 'client' ? th('achatFourn', 'Achats') : ''}
          ${th('vente', 'Ventes')}
          ${th('benefice', 'Bénéfice')}
        </tr></thead>
        <tbody>
          ${rows.length ? rows.map(r => `
            <tr>
              <td><b>${esc(_adBenefGroupBy === 'jour' ? fmtDate(r.label) : r.label)}</b></td>
              <td>${r.nb}</td>
              ${_adBenefGroupBy !== 'client' ? `<td>${fmtEUR(r.achatFourn)}</td>` : ''}
              <td>${fmtEUR(r.vente)}</td>
              <td style="color:${r.benefice>=0?'var(--accent2)':'var(--red)'}">${fmtEUR(r.benefice)}</td>
            </tr>`).join('') : `<tr><td colspan="5"><div class="empty">Aucune donnée</div></td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="page-sub" style="margin-top:8px;">Clique un en-tête de colonne pour trier. Un achat compte à sa date de réception.</div>
  `;
}

function _adBenefTri(col) {
  if (_adBenefSort.col === col) _adBenefSort.dir = _adBenefSort.dir === 'asc' ? 'desc' : 'asc';
  else _adBenefSort = { col, dir: 'desc' };
  _renderAdBenefices();
}
