let _chTab = 'ventes';
let _chProduits = [];
let _chFournisseur = [];
let _chClients = [];
let _chVentes = [];
let _chDepenseMois = 0;

async function renderChimie() {
  const { debut, fin } = _moisDateRange(moisActuel());
  const [prod, four, cli, ven, recuesMois] = await Promise.all([
    sbSelect('compta_produits', 'select=*&order=nom.asc'),
    sbSelect('compta_commandes_fournisseur', 'select=*&recue=eq.false&order=created_at.desc'),
    sbSelect('compta_commandes_clients', 'select=*&order=created_at.desc'),
    sbSelect('compta_ventes', 'select=*&order=date.desc&limit=300'),
    sbSelect('compta_commandes_fournisseur', `recue=eq.true&date_reception=gte.${debut}&date_reception=lt.${fin}`),
  ]);
  _chProduits = prod; _chFournisseur = four; _chClients = cli; _chVentes = ven;
  _chDepenseMois = recuesMois.reduce((s, c) => s + Number(c.quantite || 0) * Number(c.prix_achat_unitaire || 0), 0);

  document.getElementById('root').innerHTML = shell(`
    <div class="topbar">
      <div><div class="page-title">Chimie</div><div class="page-sub">Stock, commandes, ventes</div></div>
    </div>
    <div class="pill-tabs" style="margin-bottom:18px;">
      <div class="pill-tab ${_chTab==='ventes'?'active':''}" onclick="_chTab='ventes';renderChimie()">Ventes</div>
      <div class="pill-tab ${_chTab==='clients'?'active':''}" onclick="_chTab='clients';renderChimie()">Commandes clients</div>
      <div class="pill-tab ${_chTab==='fournisseur'?'active':''}" onclick="_chTab='fournisseur';renderChimie()">Commandes fournisseur</div>
      <div class="pill-tab ${_chTab==='stock'?'active':''}" onclick="_chTab='stock';renderChimie()">Stock</div>
      <div class="pill-tab ${_chTab==='benefices'?'active':''}" onclick="_chTab='benefices';renderChimie()">Bénéfices</div>
    </div>
    <div id="ch-body"></div>
  `);

  const body = document.getElementById('ch-body');
  if (_chTab === 'ventes') body.innerHTML = _tplVentes();
  else if (_chTab === 'clients') body.innerHTML = _tplClients();
  else if (_chTab === 'fournisseur') body.innerHTML = _tplFournisseur();
  else if (_chTab === 'stock') body.innerHTML = _tplStock();
  else { body.innerHTML = `<div class="empty">Chargement…</div>`; await _renderBenefices(); }
}

// ── BÉNÉFICES — regroupés par jour / mois / client, colonnes triables ──
let _chBenefGroupBy = 'mois';
let _chBenefSort = { col: 'benefice', dir: 'desc' };

async function _renderBenefices() {
  const [ventesAll, achatsAll] = await Promise.all([
    sbSelect('compta_ventes', 'annulee=eq.false&select=date,client,total_vente,total_achat'),
    sbSelect('compta_commandes_fournisseur', 'recue=eq.true&select=date_reception,quantite,prix_achat_unitaire'),
  ]);

  const groupes = {};
  const keyOf = d => {
    if (_chBenefGroupBy === 'jour') return { key: d, sortKey: new Date(d).getTime() };
    const dt = new Date(d);
    return { key: `${MOIS[dt.getMonth()]} ${dt.getFullYear()}`, sortKey: dt.getFullYear() * 100 + dt.getMonth() };
  };
  ventesAll.forEach(v => {
    const { key: k, sortKey } = _chBenefGroupBy === 'client' ? { key: v.client || '— Sans client —', sortKey: null } : keyOf(v.date);
    const g = groupes[k] = groupes[k] || { label: k, sortKey, nb: 0, vente: 0, achat: 0, achatFourn: 0 };
    g.nb++; g.vente += Number(v.total_vente || 0); g.achat += Number(v.total_achat || 0);
  });

  if (_chBenefGroupBy !== 'client') {
    achatsAll.forEach(c => {
      if (!c.date_reception) return;
      const { key: k, sortKey } = keyOf(c.date_reception);
      const g = groupes[k] = groupes[k] || { label: k, sortKey, nb: 0, vente: 0, achat: 0, achatFourn: 0 };
      g.achatFourn += Number(c.quantite || 0) * Number(c.prix_achat_unitaire || 0);
    });
  }

  let rows = Object.values(groupes).map(g => ({ ...g, benefice: g.vente - g.achat }));
  const { col, dir } = _chBenefSort;
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

  const th = (col, label) => {
    const active = _chBenefSort.col === col;
    const arrow = active ? (_chBenefSort.dir === 'asc' ? ' ▲' : ' ▼') : '';
    return `<th style="cursor:pointer;user-select:none;" onclick="_chBenefTri('${col}')">${label}${arrow}</th>`;
  };

  document.getElementById('ch-body').innerHTML = `
    <div class="pill-tabs" style="margin-bottom:16px;">
      <div class="pill-tab ${_chBenefGroupBy==='jour'?'active':''}" onclick="_chBenefGroupBy='jour';renderChimie()">Par jour</div>
      <div class="pill-tab ${_chBenefGroupBy==='mois'?'active':''}" onclick="_chBenefGroupBy='mois';renderChimie()">Par mois</div>
      <div class="pill-tab ${_chBenefGroupBy==='client'?'active':''}" onclick="_chBenefGroupBy='client';renderChimie()">Par client</div>
    </div>
    <div class="grid cards4" style="margin-bottom:18px;">
      ${_chBenefGroupBy !== 'client' ? `<div class="card kpi"><div class="label">Achats fournisseur</div><div class="value">${fmtEUR(totAchatFourn)}</div></div>` : ''}
      <div class="card kpi"><div class="label">Ventes</div><div class="value pos">${fmtEUR(totVente)}</div></div>
      <div class="card kpi"><div class="label">Bénéfice</div><div class="value pos">${fmtEUR(totBenef)}</div></div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          ${th('label', _chBenefGroupBy === 'jour' ? 'Date' : _chBenefGroupBy === 'mois' ? 'Mois' : 'Client')}
          ${th('nb', 'Nb ventes')}
          ${_chBenefGroupBy !== 'client' ? th('achatFourn', 'Achats fournisseur') : ''}
          ${th('vente', 'Ventes')}
          ${th('benefice', 'Bénéfice')}
        </tr></thead>
        <tbody>
          ${rows.length ? rows.map(r => `
            <tr>
              <td><b>${esc(_chBenefGroupBy === 'jour' ? fmtDate(r.label) : r.label)}</b></td>
              <td>${r.nb}</td>
              ${_chBenefGroupBy !== 'client' ? `<td>${fmtEUR(r.achatFourn)}</td>` : ''}
              <td>${fmtEUR(r.vente)}</td>
              <td style="color:${r.benefice>=0?'var(--accent2)':'var(--red)'}">${fmtEUR(r.benefice)}</td>
            </tr>`).join('') : `<tr><td colspan="5"><div class="empty">Aucune donnée</div></td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="page-sub" style="margin-top:8px;">Clique un en-tête de colonne pour trier. Un achat fournisseur compte à sa date de réception.</div>
  `;
}

function _chBenefTri(col) {
  if (_chBenefSort.col === col) _chBenefSort.dir = _chBenefSort.dir === 'asc' ? 'desc' : 'asc';
  else _chBenefSort = { col, dir: 'desc' };
  _renderBenefices();
}

// ── VENTES ───────────────────────────────────────────────────────────
let _chVentesSearch = '';

function _tplVentes() {
  const actives = _chVentes.filter(v => !v.annulee);
  const totalAchat = actives.reduce((s, v) => s + Number(v.total_achat || 0), 0);
  const totalVente = actives.reduce((s, v) => s + Number(v.total_vente || 0), 0);
  const benef = totalVente - totalAchat;

  const term = _chVentesSearch.toLowerCase();
  const filtered = _chVentes.filter(v => !term || (v.client || '').toLowerCase().includes(term));

  // Tri principal par date décroissante ; à date égale, les lignes d'un même client restent groupées.
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
    <div class="toolbar"><div class="search"><input placeholder="Rechercher un client…" value="${esc(_chVentesSearch)}" oninput="_chVentesSearch=this.value;renderChimie()"></div></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Client</th><th>Produit</th><th>Qté</th><th>Achat</th><th>Vente</th><th>Bénéfice</th><th></th></tr></thead>
        <tbody>
          ${sorted.length ? sorted.map((v, i) => {
            const memeGroupe = i > 0 && sorted[i-1].date === v.date && sorted[i-1].client === v.client;
            return `
            <tr style="${v.annulee ? 'opacity:.45;' : ''}${memeGroupe ? 'border-top:none;' : ''}">
              <td>${memeGroupe ? '' : fmtDate(v.date)}</td>
              <td>${memeGroupe ? '' : (esc(v.client) || '—')}</td>
              <td>${esc(v.produit_nom)}${v.marque ? `<div class="page-sub">${esc(v.marque)}</div>` : ''}</td>
              <td>${v.quantite}</td>
              <td>${fmtEUR(v.total_achat)}</td>
              <td>${fmtEUR(v.total_vente)}</td>
              <td style="color:${v.benefice>=0?'var(--accent2)':'var(--red)'}">${fmtEUR(v.benefice)}</td>
              <td>${v.annulee ? '<span class="badge badge-muted">Annulée</span>' : `<button class="btn btn-ghost btn-sm" onclick="annulerVente('${v.id}')">Annuler</button>`}</td>
            </tr>`;
          }).join('') : `<tr><td colspan="8"><div class="empty">Aucune vente</div></td></tr>`}
        </tbody>
      </table>
    </div>`;
}

async function annulerVente(id) {
  const v = _chVentes.find(x => x.id === id);
  if (!v || !confirm(`Annuler la vente de ${v.produit_nom} ?`)) return;
  try {
    await sbUpdate('compta_ventes', id, { annulee: true });
    const p = _chProduits.find(x => x.nom === v.produit_nom);
    if (p) await sbUpdate('compta_produits', p.id, { stock_reel: Number(p.stock_reel || 0) + Number(v.quantite || 0) });
    toast('Vente annulée, stock remis à jour', 'ok');
    await renderChimie();
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
}

// ── STOCK ────────────────────────────────────────────────────────────
let _chStockSort = { col: 'nom', dir: 'asc' };

function _tplStock() {
  const { col, dir } = _chStockSort;
  const sorted = [..._chProduits].sort((a, b) => {
    let va = a[col], vb = b[col];
    if (col === 'stock_reel') return dir === 'asc' ? (va || 0) - (vb || 0) : (vb || 0) - (va || 0);
    va = (va || '').toString().toLowerCase(); vb = (vb || '').toString().toLowerCase();
    return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
  });
  const th = (c, label) => {
    const active = col === c;
    const arrow = active ? (dir === 'asc' ? ' ▲' : ' ▼') : '';
    return `<th style="cursor:pointer;user-select:none;" onclick="_chStockTri('${c}')">${label}${arrow}</th>`;
  };
  return `
    <div class="toolbar"><div></div><button class="btn btn-primary" onclick="openProduitModal()">+ Produit</button></div>
    <div class="table-wrap">
      <table>
        <thead><tr>${th('nom', 'Produit')}${th('marque', 'Marque')}${th('type', 'Type')}<th>Prix achat</th><th>Prix vente</th>${th('stock_reel', 'Stock')}<th></th></tr></thead>
        <tbody>
          ${sorted.length ? sorted.map(p => `
            <tr>
              <td><b>${esc(p.nom)}</b></td>
              <td>${esc(p.marque) || '—'}</td>
              <td>${esc(p.type) || '—'}</td>
              <td>${p.prix_achat ? fmtEUR(p.prix_achat) : '—'}</td>
              <td>${p.prix_vente ? fmtEUR(p.prix_vente) : '—'}</td>
              <td><span class="badge ${p.stock_reel < 0 ? 'badge-red' : p.stock_reel === 0 ? 'badge-muted' : 'badge-green'}">${p.stock_reel}</span></td>
              <td><button class="btn btn-ghost btn-sm" onclick="openProduitModal('${p.id}')">Éditer</button></td>
            </tr>`).join('') : `<tr><td colspan="7"><div class="empty">Aucun produit</div></td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function _chStockTri(col) {
  if (_chStockSort.col === col) _chStockSort.dir = _chStockSort.dir === 'asc' ? 'desc' : 'asc';
  else _chStockSort = { col, dir: 'asc' };
  document.getElementById('ch-body').innerHTML = _tplStock();
}

function openProduitModal(id) {
  const p = id ? _chProduits.find(x => x.id === id) : null;
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">
    <h3>${p ? 'Modifier' : 'Nouveau'} produit</h3>
    <div class="field"><label>Nom</label><input id="pr-nom" value="${esc(p?.nom)}"></div>
    <div class="row2">
      <div class="field"><label>Marque</label><input id="pr-marque" value="${esc(p?.marque)}"></div>
      <div class="field"><label>Type</label><input id="pr-type" value="${esc(p?.type)}"></div>
    </div>
    <div class="row3">
      <div class="field"><label>Prix achat</label><input id="pr-achat" type="number" step="0.01" value="${p?.prix_achat ?? ''}"></div>
      <div class="field"><label>Prix vente</label><input id="pr-vente" type="number" step="0.01" value="${p?.prix_vente ?? ''}"></div>
      <div class="field"><label>Stock réel</label><input id="pr-stock" type="number" step="0.01" value="${p?.stock_reel ?? 0}"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="this.closest('.modal-bg').remove()">Annuler</button>
      ${p ? `<button class="btn btn-danger" onclick="deleteProduit('${id}')">Supprimer</button>` : ''}
      <button class="btn btn-primary" onclick="saveProduit('${id || ''}')">Enregistrer</button>
    </div>
  </div>`;
  bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
}

async function saveProduit(id) {
  const body = {
    nom: document.getElementById('pr-nom').value.trim(),
    marque: document.getElementById('pr-marque').value.trim() || null,
    type: document.getElementById('pr-type').value.trim() || null,
    prix_achat: parseFloat(document.getElementById('pr-achat').value) || null,
    prix_vente: parseFloat(document.getElementById('pr-vente').value) || null,
    stock_reel: parseFloat(document.getElementById('pr-stock').value) || 0,
    updated_at: new Date().toISOString(),
  };
  if (!body.nom) { toast('Nom requis', 'err'); return; }
  try {
    if (id) await sbUpdate('compta_produits', id, body);
    else await sbInsert('compta_produits', body);
    document.querySelector('.modal-bg')?.remove();
    toast('Produit enregistré', 'ok');
    await renderChimie();
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
}

async function deleteProduit(id) {
  if (!confirm('Supprimer ce produit ?')) return;
  try { await sbDelete('compta_produits', id); document.querySelector('.modal-bg')?.remove(); await renderChimie(); toast('Supprimé', 'ok'); }
  catch (e) { toast('Erreur : ' + e.message, 'err'); }
}

// ── COMMANDES FOURNISSEUR ───────────────────────────────────────────
const STATUT_FOURN = {
  a_passer: { label: 'À passer', badge: 'badge-muted' },
  en_cours: { label: 'En cours', badge: 'badge-gold' },
  recue: { label: 'Reçue', badge: 'badge-green' },
};

function _tplFournisseur() {
  return `
    <div class="card kpi" style="margin-bottom:16px;max-width:280px;">
      <div class="label">Dépensé ce mois-ci (réceptionné)</div>
      <div class="value">${fmtEUR(_chDepenseMois)}</div>
      <div class="sub">Compté au moment de la réception, pas de la commande</div>
    </div>
    <div class="toolbar">
      <button class="btn btn-primary" onclick="ouvrirReceptionModal(null, true)">Réceptionner la sélection</button>
      <div style="flex:1;"></div>
      <button class="btn btn-ghost" onclick="openFraisPortModal()">+ Frais de port</button>
      <button class="btn btn-primary" onclick="openCmdFournisseurModal()">+ Commande</button>
    </div>
    <div class="page-sub" style="margin:-6px 0 10px;">Le stock et la dépense ne bougent qu'au passage au statut "Reçue"</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th><input type="checkbox" onchange="_chToggleAllFournisseur(this.checked)" style="width:18px;height:18px;"></th><th>Statut</th><th>Produit</th><th>Marque</th><th>Qté</th><th>Prix achat unit.</th><th>Total</th><th></th></tr></thead>
        <tbody>
          ${_chFournisseur.length ? _chFournisseur.map(c => `
            <tr>
              <td><input type="checkbox" class="ch-cf-sel" value="${c.id}" style="width:18px;height:18px;"></td>
              <td>
                <select onchange="changerStatutFournisseur('${c.id}', this.value)" style="background:var(--card2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:5px 8px;font-size:12.5px;">
                  ${Object.keys(STATUT_FOURN).filter(s => s !== 'recue').map(s => `<option value="${s}" ${c.statut===s?'selected':''}>${STATUT_FOURN[s].label}</option>`).join('')}
                </select>
              </td>
              <td><b>${esc(c.produit_nom)}</b>${c.est_frais ? ' <span class="badge badge-gold">Frais</span>' : ''}</td>
              <td>${esc(c.marque) || '—'}</td>
              <td>${c.quantite}</td>
              <td>${fmtEUR(c.prix_achat_unitaire)}</td>
              <td>${fmtEUR(c.quantite * c.prix_achat_unitaire)}</td>
              <td style="display:flex;gap:6px;">
                <button class="btn btn-primary btn-sm" onclick="ouvrirReceptionModal('${c.id}')">Réceptionner</button>
                <button class="btn btn-ghost btn-sm" onclick="deleteCmdFournisseur('${c.id}')">Suppr.</button>
              </td>
            </tr>`).join('') : `<tr><td colspan="8"><div class="empty">Aucune commande en attente</div></td></tr>`}
        </tbody>
      </table>
    </div>`;
}

async function changerStatutFournisseur(id, statut) {
  try {
    await sbUpdate('compta_commandes_fournisseur', id, { statut });
    const c = _chFournisseur.find(x => x.id === id);
    if (c) c.statut = statut;
    toast('Statut mis à jour', 'ok');
  } catch (e) { toast('Erreur : ' + e.message, 'err'); await renderChimie(); }
}

function _chToggleAllFournisseur(checked) {
  document.querySelectorAll('.ch-cf-sel').forEach(el => el.checked = checked);
}

function openCmdFournisseurModal() {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">
    <h3>Nouvelle commande fournisseur</h3>
    <div class="field"><label>Produit</label>
      <select id="cf-produit" onchange="_cfAutofill()">
        <option value="">— Nouveau produit —</option>
        ${_chProduits.map(p => `<option value="${p.id}" data-marque="${esc(p.marque)}" data-achat="${p.prix_achat||''}">${esc(p.nom)}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>Nom du produit (si nouveau)</label><input id="cf-nom"></div>
    <div class="row3">
      <div class="field"><label>Marque</label><input id="cf-marque"></div>
      <div class="field"><label>Quantité</label><input id="cf-qte" type="number" value="1"></div>
      <div class="field"><label>Prix achat unit.</label><input id="cf-prix" type="number" step="0.01" value="0"></div>
    </div>
    <div class="field"><label>Statut</label>
      <select id="cf-statut">
        <option value="a_passer">À passer</option>
        <option value="en_cours" selected>En cours (déjà commandée)</option>
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="this.closest('.modal-bg').remove()">Annuler</button>
      <button class="btn btn-primary" onclick="saveCmdFournisseur()">Enregistrer</button>
    </div>
  </div>`;
  bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
}

function openFraisPortModal() {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">
    <h3>Nouveau frais de port</h3>
    <div class="field"><label>Détail (optionnel)</label><input id="fp-detail" placeholder="ex: Colissimo commande du 15/08"></div>
    <div class="field"><label>Montant (€)</label><input id="fp-montant" type="number" step="0.01" value="0"></div>
    <div class="field"><label>Statut</label>
      <select id="fp-statut">
        <option value="a_passer">À passer</option>
        <option value="en_cours" selected>En cours (déjà payé)</option>
      </select>
    </div>
    <div class="page-sub" style="margin-bottom:10px;">N'affecte aucun stock — compte uniquement comme dépense à la réception.</div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="this.closest('.modal-bg').remove()">Annuler</button>
      <button class="btn btn-primary" onclick="saveFraisPort()">Enregistrer</button>
    </div>
  </div>`;
  bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
}

async function saveFraisPort() {
  const body = {
    produit_nom: 'Frais de port' + (document.getElementById('fp-detail').value.trim() ? ' — ' + document.getElementById('fp-detail').value.trim() : ''),
    quantite: 1,
    prix_achat_unitaire: parseFloat(document.getElementById('fp-montant').value) || 0,
    statut: document.getElementById('fp-statut').value,
    est_frais: true,
    date: new Date().toISOString().slice(0, 10),
  };
  try {
    await sbInsert('compta_commandes_fournisseur', body);
    document.querySelector('.modal-bg')?.remove();
    toast('Frais de port enregistré', 'ok');
    await renderChimie();
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
}

function _cfAutofill() {
  const opt = document.getElementById('cf-produit').selectedOptions[0];
  if (opt && opt.value) {
    document.getElementById('cf-nom').value = opt.textContent;
    document.getElementById('cf-marque').value = opt.dataset.marque || '';
    if (opt.dataset.achat) document.getElementById('cf-prix').value = opt.dataset.achat;
  }
}

async function saveCmdFournisseur() {
  const produitId = document.getElementById('cf-produit').value || null;
  const opt = document.getElementById('cf-produit').selectedOptions[0];
  const nom = document.getElementById('cf-nom').value.trim() || (produitId ? opt.textContent : '');
  if (!nom) { toast('Produit requis', 'err'); return; }
  const body = {
    produit_id: produitId,
    produit_nom: nom,
    marque: document.getElementById('cf-marque').value.trim() || null,
    quantite: parseFloat(document.getElementById('cf-qte').value) || 0,
    prix_achat_unitaire: parseFloat(document.getElementById('cf-prix').value) || 0,
    statut: document.getElementById('cf-statut').value,
    date: new Date().toISOString().slice(0, 10),
  };
  try {
    await sbInsert('compta_commandes_fournisseur', body);
    document.querySelector('.modal-bg')?.remove();
    toast('Commande enregistrée', 'ok');
    await renderChimie();
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
}

async function deleteCmdFournisseur(id) {
  if (!confirm('Supprimer cette commande ?')) return;
  try { await sbDelete('compta_commandes_fournisseur', id); await renderChimie(); toast('Supprimé', 'ok'); }
  catch (e) { toast('Erreur : ' + e.message, 'err'); }
}

function ouvrirReceptionModal(id, groupe) {
  let ids = [];
  let titre, sousTitre;
  if (groupe) {
    ids = [...document.querySelectorAll('.ch-cf-sel:checked')].map(el => el.value);
    if (!ids.length) { toast('Sélectionne au moins une commande', 'err'); return; }
    const lignes = _chFournisseur.filter(c => ids.includes(c.id));
    const total = lignes.reduce((s, c) => s + c.quantite * c.prix_achat_unitaire, 0);
    titre = `Réceptionner ${lignes.length} commande(s)`;
    sousTitre = `${lignes.map(l => esc(l.produit_nom)).join(', ')} — total ${fmtEUR(total)}`;
  } else {
    const c = _chFournisseur.find(x => x.id === id);
    if (!c) return;
    ids = [id];
    titre = `Réceptionner — ${esc(c.produit_nom)}`;
    sousTitre = `${c.quantite} × ${fmtEUR(c.prix_achat_unitaire)} = ${fmtEUR(c.quantite * c.prix_achat_unitaire)}`;
  }
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">
    <h3>${titre}</h3>
    <div class="page-sub" style="margin-bottom:14px;">${sousTitre}</div>
    <div class="field"><label>Date de réception</label><input id="rc-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
    <div class="page-sub" style="margin-bottom:10px;">Détermine dans quel mois cette dépense et ce stock sont comptabilisés. Même date appliquée à toute la sélection.</div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="this.closest('.modal-bg').remove()">Annuler</button>
      <button class="btn btn-primary" onclick='receptionnerCommandes(${JSON.stringify(ids)})'>Confirmer la réception</button>
    </div>
  </div>`;
  bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
}

async function receptionnerCommandes(ids) {
  const dateReception = document.getElementById('rc-date')?.value || new Date().toISOString().slice(0, 10);
  try {
    for (const id of ids) {
      const c = _chFournisseur.find(x => x.id === id);
      if (!c) continue;
      if (!c.est_frais) {
        let produit = c.produit_id ? _chProduits.find(p => p.id === c.produit_id) : _chProduits.find(p => p.nom === c.produit_nom);
        if (produit) {
          const nouveauStock = Number(produit.stock_reel || 0) + Number(c.quantite || 0);
          await sbUpdate('compta_produits', produit.id, { stock_reel: nouveauStock });
          produit.stock_reel = nouveauStock;
        } else {
          produit = (await sbInsert('compta_produits', { nom: c.produit_nom, marque: c.marque, prix_achat: c.prix_achat_unitaire, stock_reel: c.quantite }))[0];
          _chProduits.push(produit);
        }
      }
      // Réception = statut réel de la dépense (pas la commande) : le stock ET la dépense
      // mensuelle ne bougent qu'ici, jamais à la simple création de la commande.
      await sbUpdate('compta_commandes_fournisseur', id, { recue: true, statut: 'recue', date_reception: dateReception });
    }
    document.querySelector('.modal-bg')?.remove();
    toast(`${ids.length} commande(s) réceptionnée(s), stock mis à jour`, 'ok');
    await renderChimie();
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
}

// ── COMMANDES CLIENTS → VALIDATION EN VENTES ────────────────────────
function _tplClients() {
  const parClient = {};
  _chClients.forEach(c => { (parClient[c.client] = parClient[c.client] || []).push(c); });
  const clients = Object.keys(parClient);
  return `
    <div class="toolbar"><div></div><button class="btn btn-primary" onclick="openCmdClientModal()">+ Ligne commande</button></div>
    ${clients.length ? clients.map(cl => {
      const lignes = parClient[cl];
      const totalBrut = lignes.reduce((s, l) => s + l.quantite * l.prix_vente_unitaire, 0);
      return `
      <div class="card" style="margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;cursor:pointer;" onclick='ouvrirDetailClient(${JSON.stringify(cl)})'>
          <div style="font-weight:700;">${esc(cl)}</div>
          <div style="display:flex;gap:8px;align-items:center;">
            <span class="page-sub">Total brut : ${fmtEUR(totalBrut)}</span>
            <button class="btn btn-primary btn-sm" onclick='event.stopPropagation();ouvrirValidationClient(${JSON.stringify(cl)})'>Valider la vente</button>
          </div>
        </div>
        <table>
          <thead><tr><th>Produit</th><th>Qté</th><th>PU vente</th><th>Total</th><th></th></tr></thead>
          <tbody>
            ${lignes.map(l => `
              <tr>
                <td>${esc(l.produit_nom)}</td>
                <td>
                  <div style="display:flex;align-items:center;gap:6px;">
                    <button class="btn btn-ghost btn-sm" style="padding:2px 8px;" onclick="ajusterQteCmdClient('${l.id}', -1)">−</button>
                    <span style="min-width:20px;text-align:center;">${l.quantite}</span>
                    <button class="btn btn-ghost btn-sm" style="padding:2px 8px;" onclick="ajusterQteCmdClient('${l.id}', 1)">+</button>
                  </div>
                </td>
                <td>${fmtEUR(l.prix_vente_unitaire)}</td>
                <td>${fmtEUR(l.quantite * l.prix_vente_unitaire)}</td>
                <td><button class="btn btn-ghost btn-sm" onclick="deleteCmdClient('${l.id}')">Suppr.</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    }).join('') : `<div class="empty">Aucune commande client en attente</div>`}
  `;
}

function openCmdClientModal() {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">
    <h3>Nouvelle ligne — Commande client</h3>
    <div class="field"><label>Client</label><input id="cc-client"></div>
    <div class="field"><label>Produit</label>
      <select id="cc-produit" onchange="_ccAutofill()">
        ${_chProduits.map(p => `<option value="${p.id}" data-marque="${esc(p.marque)}" data-vente="${p.prix_vente||''}">${esc(p.nom)}</option>`).join('')}
      </select>
    </div>
    <div class="row2">
      <div class="field"><label>Quantité</label><input id="cc-qte" type="number" value="1"></div>
      <div class="field"><label>Prix vente unit.</label><input id="cc-prix" type="number" step="0.01" value="0"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="this.closest('.modal-bg').remove()">Annuler</button>
      <button class="btn btn-primary" onclick="saveCmdClient()">Ajouter</button>
    </div>
  </div>`;
  bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
  _ccAutofill();
}

function _ccAutofill() {
  const opt = document.getElementById('cc-produit').selectedOptions[0];
  if (opt && opt.dataset.vente) document.getElementById('cc-prix').value = opt.dataset.vente;
}

async function saveCmdClient() {
  const opt = document.getElementById('cc-produit').selectedOptions[0];
  const client = document.getElementById('cc-client').value.trim();
  if (!client || !opt) { toast('Client et produit requis', 'err'); return; }
  const body = {
    client,
    produit_id: opt.value,
    produit_nom: opt.textContent,
    marque: opt.dataset.marque || null,
    quantite: parseFloat(document.getElementById('cc-qte').value) || 1,
    prix_vente_unitaire: parseFloat(document.getElementById('cc-prix').value) || 0,
  };
  try {
    await sbInsert('compta_commandes_clients', body);
    document.querySelector('.modal-bg')?.remove();
    toast('Ligne ajoutée', 'ok');
    await renderChimie();
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
}

async function deleteCmdClient(id) {
  try { await sbDelete('compta_commandes_clients', id); await renderChimie(); }
  catch (e) { toast('Erreur : ' + e.message, 'err'); }
}

async function ajusterQteCmdClient(id, delta) {
  const l = _chClients.find(c => c.id === id);
  if (!l) return;
  const nouvelleQte = Math.max(1, Number(l.quantite || 1) + delta);
  try {
    await sbUpdate('compta_commandes_clients', id, { quantite: nouvelleQte });
    await renderChimie();
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
}

function ouvrirDetailClient(client) {
  const lignes = _chClients.filter(c => c.client === client);
  let totalVente = 0, totalAchat = 0;
  const rows = lignes.map(l => {
    const produit = l.produit_id ? _chProduits.find(p => p.id === l.produit_id) : _chProduits.find(p => p.nom === l.produit_nom);
    const prixAchat = produit?.prix_achat || 0;
    const vente = l.quantite * l.prix_vente_unitaire;
    const achat = l.quantite * prixAchat;
    totalVente += vente; totalAchat += achat;
    return `<tr>
      <td>${esc(l.produit_nom)}</td>
      <td>${l.quantite}</td>
      <td>${fmtEUR(l.prix_vente_unitaire)}</td>
      <td>${fmtEUR(vente)}</td>
      <td>${fmtEUR(vente - achat)}</td>
    </tr>`;
  }).join('');
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">
    <h3>Détail — ${esc(client)}</h3>
    <table>
      <thead><tr><th>Produit</th><th>Qté</th><th>PU vente</th><th>Total</th><th>Bénéfice</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="page-sub" style="margin:14px 0;display:flex;justify-content:space-between;">
      <span>Total vente : <b>${fmtEUR(totalVente)}</b></span>
      <span>Bénéfice estimé : <b>${fmtEUR(totalVente - totalAchat)}</b></span>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="this.closest('.modal-bg').remove()">Fermer</button>
      <button class="btn btn-primary" onclick='this.closest(".modal-bg").remove();ouvrirValidationClient(${JSON.stringify(client)})'>Valider la vente</button>
    </div>
  </div>`;
  bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
}

function ouvrirValidationClient(client) {
  const lignes = _chClients.filter(c => c.client === client);
  const totalBrut = lignes.reduce((s, l) => s + l.quantite * l.prix_vente_unitaire, 0);
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">
    <h3>Valider la vente — ${esc(client)}</h3>
    <div class="page-sub" style="margin-bottom:14px;">Total brut : <b>${fmtEUR(totalBrut)}</b></div>
    <div class="field"><label>Frais d'envoi / majoration (%)</label><input id="vc-remise" type="number" step="0.1" value="0" oninput="_vcRecalc(${totalBrut})"></div>
    <div class="field"><label>Montant réel encaissé (€) — c'est ce total qui sera comptabilisé</label><input id="vc-montant" type="number" step="0.01" value="${totalBrut.toFixed(2)}"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="this.closest('.modal-bg').remove()">Annuler</button>
      <button class="btn btn-primary" onclick='confirmerValidationClient(${JSON.stringify(client)}, ${totalBrut})'>Valider</button>
    </div>
  </div>`;
  bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
}

function _vcRecalc(totalBrut) {
  const remise = parseFloat(document.getElementById('vc-remise').value) || 0;
  document.getElementById('vc-montant').value = (totalBrut * (1 + remise / 100)).toFixed(2);
}

async function confirmerValidationClient(client, totalBrut) {
  const montantReel = parseFloat(document.getElementById('vc-montant').value) || totalBrut;
  const ratio = totalBrut > 0 ? montantReel / totalBrut : 1;
  const lignes = _chClients.filter(c => c.client === client);
  const today = new Date().toISOString().slice(0, 10);

  try {
    for (const l of lignes) {
      const produit = l.produit_id ? _chProduits.find(p => p.id === l.produit_id) : _chProduits.find(p => p.nom === l.produit_nom);
      const prixAchat = produit?.prix_achat || 0;
      const prixVenteAjuste = Math.round(l.prix_vente_unitaire * ratio * 100) / 100;
      const totalAchat = Math.round(prixAchat * l.quantite * 100) / 100;
      const totalVente = Math.round(prixVenteAjuste * l.quantite * 100) / 100;

      await sbInsert('compta_ventes', {
        date: today, client, produit_nom: l.produit_nom, marque: l.marque,
        quantite: l.quantite, prix_achat_unitaire: prixAchat, prix_vente_unitaire: prixVenteAjuste,
        total_achat: totalAchat, total_vente: totalVente, benefice: Math.round((totalVente - totalAchat) * 100) / 100,
      });

      if (produit) await sbUpdate('compta_produits', produit.id, { stock_reel: Number(produit.stock_reel || 0) - Number(l.quantite || 0) });
      await sbDelete('compta_commandes_clients', l.id);
    }
    document.querySelector('.modal-bg')?.remove();
    toast(`Vente validée pour ${client}`, 'ok');
    await renderChimie();
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
}
