let _chTab = 'ventes';
let _chInventaireMode = false;
let _chProduits = [];
let _chFournisseur = [];
let _chFournisseurRecues = [];
let _chClients = [];
let _chVentes = [];
let _chDepenseMois = 0;

async function renderChimie() {
  const { debut, fin } = _moisDateRange(moisActuel());
  const [prod, four, cli, ven, recuesMois, recuesRecent] = await Promise.all([
    sbSelect('compta_produits', 'select=*&order=nom.asc'),
    sbSelect('compta_commandes_fournisseur', 'select=*&recue=eq.false&order=date_commande.desc,created_at.desc'),
    sbSelect('compta_commandes_clients', 'select=*&order=created_at.desc'),
    sbSelect('compta_ventes', 'select=*&order=date.desc&limit=300'),
    sbSelect('compta_commandes_fournisseur', `recue=eq.true&date_reception=gte.${debut}&date_reception=lt.${fin}`),
    sbSelect('compta_commandes_fournisseur', 'select=*&recue=eq.true&order=date_reception.desc&limit=30'),
  ]);
  _chProduits = prod; _chFournisseur = four; _chClients = cli; _chVentes = ven;
  _chFournisseurRecues = recuesRecent;
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
  else if (_chTab === 'stock') body.innerHTML = _chInventaireMode ? _tplInventaire() : _tplStock();
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
  const totalAchat = _chProduits.reduce((s, p) => s + Number(p.stock_reel || 0) * Number(p.prix_achat || 0), 0);
  const totalVente = _chProduits.reduce((s, p) => s + Number(p.stock_reel || 0) * Number(p.prix_vente || 0), 0);
  return `
    <div class="toolbar">
      <button class="btn btn-ghost" onclick="lancerInventaire()">Faire l'inventaire</button>
      <div style="flex:1;"></div>
      <button class="btn btn-primary" onclick="openProduitModal()">+ Produit</button>
    </div>
    <div class="grid cards4" style="margin-bottom:18px;">
      <div class="card kpi"><div class="label">Valeur stock à l'achat</div><div class="value" id="stock-total-achat">${fmtEUR(totalAchat)}</div></div>
      <div class="card kpi"><div class="label">Valeur stock à la revente</div><div class="value" id="stock-total-vente">${fmtEUR(totalVente)}</div></div>
      <div class="card kpi"><div class="label">Bénéfice estimé</div><div class="value pos" id="stock-total-benef">${fmtEUR(totalVente - totalAchat)}</div></div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>${th('nom', 'Produit')}${th('marque', 'Marque')}${th('type', 'Type')}<th>Prix achat</th><th>Prix vente</th>${th('stock_reel', 'Stock')}<th>Dernier inventaire</th><th></th></tr></thead>
        <tbody>
          ${sorted.length ? sorted.map(p => `
            <tr>
              <td><b>${esc(p.nom)}</b></td>
              <td>${esc(p.marque) || '—'}</td>
              <td>${esc(p.type) || '—'}</td>
              <td>${p.prix_achat ? fmtEUR(p.prix_achat) : '—'}</td>
              <td>${p.prix_vente ? fmtEUR(p.prix_vente) : '—'}</td>
              <td>
                <div style="display:flex;align-items:center;gap:6px;">
                  <button class="btn btn-ghost btn-sm" style="padding:2px 8px;" onclick="ajusterStockProduit('${p.id}', -1)">−</button>
                  <input id="stock-input-${p.id}" type="number" step="0.01" value="${p.stock_reel}" style="width:64px;background:var(--card2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:4px 6px;text-align:center;" onchange="modifierStockProduit('${p.id}', this.value)">
                  <button class="btn btn-ghost btn-sm" style="padding:2px 8px;" onclick="ajusterStockProduit('${p.id}', 1)">+</button>
                </div>
              </td>
              <td class="page-sub">${p.dernier_inventaire ? fmtDate(p.dernier_inventaire) : '<span style="color:var(--red);">Jamais</span>'}</td>
              <td><button class="btn btn-ghost btn-sm" onclick="openProduitModal('${p.id}')">Éditer</button></td>
            </tr>`).join('') : `<tr><td colspan="8"><div class="empty">Aucun produit</div></td></tr>`}
        </tbody>
      </table>
    </div>`;
}

// ── INVENTAIRE — passe en revue TOUS les produits un par un (pas seulement ceux
// qu'on pense à vérifier) pour éviter le vrai piège : un produit qu'on n'a plus
// physiquement ne donne aucune raison d'aller le corriger dans l'app spontanément,
// donc son stock reste faux indéfiniment tant qu'il n'est pas passé en revue ici.
function lancerInventaire() {
  _chInventaireMode = true;
  renderChimie();
}

function annulerInventaire() {
  _chInventaireMode = false;
  renderChimie();
}

function _tplInventaire() {
  const tries = [..._chProduits].sort((a, b) => {
    const m = (a.marque || '').localeCompare(b.marque || '');
    return m !== 0 ? m : (a.nom || '').localeCompare(b.nom || '');
  });
  return `
    <div class="page-sub" style="margin-bottom:14px;">Passe en revue chaque produit, coche-le au fur et à mesure — même ceux que tu n'as plus, mets-les à 0 et coche-les quand même. C'est le seul moyen de repérer les stocks tombés à zéro sans que tu aies pensé à les corriger.</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th style="width:36px;"></th><th>Produit</th><th>Marque</th><th>Stock actuel (app)</th><th>Stock réel compté</th></tr></thead>
        <tbody>
          ${tries.map(p => `
            <tr id="inv-row-${p.id}">
              <td><input id="inv-chk-${p.id}" type="checkbox" style="width:18px;height:18px;"></td>
              <td><b>${esc(p.nom)}</b></td>
              <td>${esc(p.marque) || '—'}</td>
              <td class="page-sub">${p.stock_reel}</td>
              <td>
                <input id="inv-val-${p.id}" type="number" step="0.01" value="${p.stock_reel}" style="width:80px;background:var(--card2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:5px 8px;" oninput="document.getElementById('inv-chk-${p.id}').checked = true">
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="modal-actions" style="margin-top:16px;">
      <button class="btn btn-ghost" onclick="annulerInventaire()">Annuler</button>
      <button class="btn btn-primary" onclick="validerInventaire()">Valider l'inventaire</button>
    </div>`;
}

async function validerInventaire() {
  const produitsVerifies = _chProduits.filter(p => document.getElementById(`inv-chk-${p.id}`)?.checked);
  if (!produitsVerifies.length) { toast('Coche au moins un produit vérifié', 'err'); return; }
  const nonVerifies = _chProduits.length - produitsVerifies.length;
  if (nonVerifies > 0 && !confirm(`${nonVerifies} produit(s) pas cochés ne seront pas mis à jour ni marqués vérifiés. Continuer ?`)) return;

  const today = new Date().toISOString().slice(0, 10);
  const changements = [];
  try {
    for (const p of produitsVerifies) {
      const nouvelleValeur = parseFloat(document.getElementById(`inv-val-${p.id}`).value);
      if (isNaN(nouvelleValeur)) continue;
      if (nouvelleValeur !== Number(p.stock_reel || 0)) changements.push({ nom: p.nom, avant: p.stock_reel, apres: nouvelleValeur });
      await sbUpdate('compta_produits', p.id, { stock_reel: nouvelleValeur, dernier_inventaire: today });
    }
    _chInventaireMode = false;
    toast(changements.length ? `Inventaire enregistré — ${changements.length} stock(s) corrigé(s)` : 'Inventaire enregistré, aucun écart', 'ok');
    await renderChimie();
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
}

async function ajusterStockProduit(id, delta) {
  const p = _chProduits.find(x => x.id === id);
  if (!p) return;
  await modifierStockProduit(id, Number(p.stock_reel || 0) + delta);
}

async function modifierStockProduit(id, valeur) {
  const p = _chProduits.find(x => x.id === id);
  if (!p) return;
  const nouveauStock = parseFloat(valeur);
  if (isNaN(nouveauStock)) return;
  try {
    await sbUpdate('compta_produits', id, { stock_reel: nouveauStock });
    p.stock_reel = nouveauStock;
    // Met juste à jour ce champ et les totaux, sans réafficher tout le tableau —
    // sinon, trié par la colonne Stock, la ligne changerait de place à chaque clic.
    const input = document.getElementById(`stock-input-${id}`);
    if (input) input.value = nouveauStock;
    const totalAchat = _chProduits.reduce((s, x) => s + Number(x.stock_reel || 0) * Number(x.prix_achat || 0), 0);
    const totalVente = _chProduits.reduce((s, x) => s + Number(x.stock_reel || 0) * Number(x.prix_vente || 0), 0);
    document.getElementById('stock-total-achat').textContent = fmtEUR(totalAchat);
    document.getElementById('stock-total-vente').textContent = fmtEUR(totalVente);
    document.getElementById('stock-total-benef').textContent = fmtEUR(totalVente - totalAchat);
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
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
  // Groupé par date de commande : deux blocs mis à la même date fusionnent
  // automatiquement (ex: après une annulation de réception qui recrée une
  // ligne par produit à l'identique).
  const parLot = {};
  _chFournisseur.forEach(c => { const k = c.date_commande || `nodate-${c.lot_id || c.id}`; (parLot[k] = parLot[k] || []).push(c); });
  const lots = Object.values(parLot).sort((a, b) => (b[0].date_commande || '').localeCompare(a[0].date_commande || ''));

  const parLotRecu = {};
  _chFournisseurRecues.forEach(c => { const k = c.date_reception || `nodate-${c.id}`; (parLotRecu[k] = parLotRecu[k] || []).push(c); });
  const lotsRecus = Object.values(parLotRecu).sort((a, b) => (b[0].date_reception || '').localeCompare(a[0].date_reception || ''));

  // Besoins clients en attente : agrège les commandes clients pas encore validées en
  // vente, par produit, et compare au stock réel — pour savoir quoi commander (et
  // combien) sans repasser par l'onglet Commandes clients pendant qu'on prépare la
  // commande fournisseur.
  const besoins = {};
  _chClients.forEach(c => {
    const cle = c.produit_id || `nom-${c.produit_nom}`;
    const b = besoins[cle] = besoins[cle] || { nom: c.produit_nom, marque: c.marque, produitId: c.produit_id || null, demande: 0 };
    b.demande += Number(c.quantite || 0);
  });
  // Trié par nom (pas par quantité à commander) — sinon la ligne saute de place
  // dans le classement à chaque clic sur +/-, ce qui rend l'ajustement pénible.
  const besoinsListe = Object.values(besoins).map(b => {
    const produit = b.produitId ? _chProduits.find(p => p.id === b.produitId) : _chProduits.find(p => p.nom === b.nom);
    const stock = Number(produit?.stock_reel || 0);
    return { ...b, stock, aCommander: Math.max(0, b.demande - stock) };
  }).sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));

  return `
    <div class="card kpi" style="margin-bottom:16px;max-width:280px;">
      <div class="label">Dépensé ce mois-ci (réceptionné)</div>
      <div class="value">${fmtEUR(_chDepenseMois)}</div>
      <div class="sub">Compté au moment de la réception, pas de la commande</div>
    </div>

    ${besoinsListe.length ? `
    <div class="card" style="margin-bottom:16px;">
      <div style="font-weight:700;margin-bottom:4px;">Besoins clients en attente</div>
      <div class="page-sub" style="margin-bottom:12px;">Ce que tes commandes clients en cours demandent, comparé à ton stock réel — "À commander" tient déjà compte de ce que tu as en stock.</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Produit</th><th>Marque</th><th>Demandé par clients</th><th>En stock</th><th>À commander</th><th></th></tr></thead>
          <tbody>
            ${besoinsListe.map(b => `
              <tr>
                <td><b>${esc(b.nom)}</b></td>
                <td>${esc(b.marque) || '—'}</td>
                <td>${b.demande}</td>
                <td>${b.stock}</td>
                <td>${b.aCommander > 0 ? `<span class="badge badge-gold">${b.aCommander}</span>` : '<span class="badge badge-green">0 — couvert par le stock</span>'}</td>
                <td>${b.aCommander > 0 ? `<button class="btn btn-ghost btn-sm" onclick='commanderBesoinClient(${JSON.stringify(b.produitId)}, ${JSON.stringify(b.nom)}, ${b.aCommander})'>Commander</button>` : ''}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    <div class="toolbar">
      <div></div>
      <div style="flex:1;"></div>
      <button class="btn btn-ghost" onclick="openFraisPortModal()">+ Frais de port</button>
      <button class="btn btn-primary" onclick="openCmdFournisseurModal()">+ Nouvelle commande (nouveau bloc)</button>
    </div>
    <div class="page-sub" style="margin:-6px 0 14px;">Le stock et la dépense ne bougent qu'au passage au statut "Reçue". Chaque commande forme un bloc indépendant : réceptionner un bloc ne touche pas les autres.</div>

    ${lots.length ? lots.map(lignes => {
      const dateGroupe = lignes[0].date_commande || '';
      const total = lignes.reduce((s, c) => s + c.quantite * c.prix_achat_unitaire, 0);
      return `
      <div class="card" style="margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <label class="page-sub" style="margin:0;">Date de commande</label>
            <input type="date" value="${dateGroupe}" onchange='_cfDateLot(${JSON.stringify(lignes.map(l=>l.id))}, this.value)' style="background:var(--card2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:5px 8px;">
            <button class="btn btn-ghost btn-sm" onclick='openCmdFournisseurModal(${JSON.stringify(dateGroupe)})'>+ Ligne</button>
            <button class="btn btn-ghost btn-sm" onclick='openFraisPortModal(${JSON.stringify(dateGroupe)})'>+ Frais de port</button>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <select onchange='changerStatutBloc(${JSON.stringify(lignes.map(l=>l.id))}, this.value)' style="background:var(--card2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:6px 8px;font-size:12.5px;">
              <option value="">Statut du bloc…</option>
              ${Object.keys(STATUT_FOURN).filter(s => s !== 'recue').map(s => `<option value="${s}">Tout passer en « ${STATUT_FOURN[s].label} »</option>`).join('')}
            </select>
            <button class="btn btn-ghost btn-sm" onclick='copierCommandeFournisseur(${JSON.stringify(lignes.map(l=>l.id))})'>Copier</button>
            <button class="btn btn-primary btn-sm" onclick='ouvrirReceptionModal(null, ${JSON.stringify(lignes.map(l=>l.id))})'>Réceptionner le bloc</button>
          </div>
        </div>
        <table>
          <thead><tr><th>Statut</th><th>Produit</th><th>Marque</th><th>Qté</th><th>Prix achat unit.</th><th>Total</th><th></th></tr></thead>
          <tbody>
            ${lignes.map(c => `
              <tr>
                <td>
                  <select onchange="changerStatutFournisseur('${c.id}', this.value)" style="background:var(--card2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:5px 8px;font-size:12.5px;">
                    ${Object.keys(STATUT_FOURN).filter(s => s !== 'recue').map(s => `<option value="${s}" ${c.statut===s?'selected':''}>${STATUT_FOURN[s].label}</option>`).join('')}
                  </select>
                </td>
                <td><b>${esc(c.produit_nom)}</b>${c.est_frais ? ' <span class="badge badge-gold">Frais</span>' : ''}</td>
                <td>${esc(c.marque) || '—'}</td>
                <td>
                  <div style="display:flex;align-items:center;gap:6px;">
                    <button class="btn btn-ghost btn-sm" style="padding:2px 8px;" onclick="ajusterQteCmdFournisseur('${c.id}', -1)">−</button>
                    <span style="min-width:20px;text-align:center;">${c.quantite}</span>
                    <button class="btn btn-ghost btn-sm" style="padding:2px 8px;" onclick="ajusterQteCmdFournisseur('${c.id}', 1)">+</button>
                  </div>
                </td>
                <td><input type="number" step="0.01" value="${c.prix_achat_unitaire}" style="width:72px;background:var(--card2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:4px 6px;" onchange="modifierPrixCmdFournisseur('${c.id}', this.value)"></td>
                <td>${fmtEUR(c.quantite * c.prix_achat_unitaire)}</td>
                <td style="display:flex;gap:6px;">
                  <button class="btn btn-primary btn-sm" onclick="ouvrirReceptionModal('${c.id}')">Réceptionner</button>
                  <button class="btn btn-ghost btn-sm" onclick="deleteCmdFournisseur('${c.id}')">Suppr.</button>
                </td>
              </tr>`).join('')}
          </tbody>
          <tfoot><tr><td colspan="4" style="text-align:right;">Total du bloc</td><td colspan="2" style="font-weight:700;">${fmtEUR(total)}</td><td></td></tr></tfoot>
        </table>
      </div>`;
    }).join('') : `<div class="empty">Aucune commande en attente</div>`}

    ${lotsRecus.length ? `
    <div class="page-sub" style="margin:22px 0 10px;font-weight:700;">Reçues récemment</div>
    ${lotsRecus.map(lignes => {
      const total = lignes.reduce((s, c) => s + c.quantite * c.prix_achat_unitaire, 0);
      return `
      <div class="card" style="margin-bottom:10px;opacity:0.85;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div class="page-sub">Reçue le ${fmtDate(lignes[0].date_reception)} — ${lignes.map(l=>esc(l.produit_nom)).join(', ')}</div>
          <div style="display:flex;gap:8px;align-items:center;">
            <span class="page-sub">${fmtEUR(total)}</span>
            <button class="btn btn-ghost btn-sm" onclick='annulerReceptionLot(${JSON.stringify(lignes.map(l=>l.id))})'>Annuler la réception</button>
          </div>
        </div>
      </div>`;
    }).join('')}` : ''}
  `;
}

async function changerStatutFournisseur(id, statut) {
  try {
    await sbUpdate('compta_commandes_fournisseur', id, { statut });
    const c = _chFournisseur.find(x => x.id === id);
    if (c) c.statut = statut;
    toast('Statut mis à jour', 'ok');
  } catch (e) { toast('Erreur : ' + e.message, 'err'); await renderChimie(); }
}

async function changerStatutBloc(ids, statut) {
  if (!statut) return;
  try {
    for (const id of ids) await sbUpdate('compta_commandes_fournisseur', id, { statut });
    toast('Statut du bloc mis à jour', 'ok');
    await renderChimie();
  } catch (e) { toast('Erreur : ' + e.message, 'err'); await renderChimie(); }
}

function commanderBesoinClient(produitId, nom, qte) {
  openCmdFournisseurModal(null, { produitId, nom, qte });
}

function openCmdFournisseurModal(dateGroupe, prefill) {
  const today = new Date().toISOString().slice(0, 10);
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" data-date-groupe="${dateGroupe || ''}">
    <h3>${dateGroupe ? 'Ajouter une ligne au bloc' : 'Nouvelle commande (nouveau bloc)'}</h3>
    ${!dateGroupe ? `<div class="field"><label>Date de commande</label><input id="cf-date-commande" type="date" value="${today}"></div>` : `<div class="page-sub" style="margin-bottom:10px;">Rejoint le bloc du ${fmtDate(dateGroupe)} — même date = fusion automatique.</div>`}
    <div class="field"><label>Produit</label>
      <select id="cf-produit" onchange="_cfAutofill()">
        <option value="">— Nouveau produit —</option>
        ${_chProduits.map(p => `<option value="${p.id}" data-marque="${esc(p.marque)}" data-achat="${p.prix_achat||''}" ${prefill && prefill.produitId===p.id?'selected':''}>${esc(p.nom)}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>Nom du produit (si nouveau)</label><input id="cf-nom" value="${prefill && !prefill.produitId ? esc(prefill.nom) : ''}"></div>
    <div class="row3">
      <div class="field"><label>Marque</label><input id="cf-marque"></div>
      <div class="field"><label>Quantité</label><input id="cf-qte" type="number" value="${prefill?.qte ?? 1}"></div>
      <div class="field"><label>Prix achat unit.</label><input id="cf-prix" type="number" step="0.01" value="0"></div>
    </div>
    <div class="field"><label>Statut</label>
      <select id="cf-statut">
        <option value="a_passer">À passer</option>
        <option value="en_cours" selected>En cours (déjà commandée)</option>
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="this.closest('.modal-bg').remove();renderChimie()">Terminé</button>
      <button class="btn btn-primary" onclick="saveCmdFournisseur()">Ajouter (et continuer)</button>
    </div>
  </div>`;
  bg.addEventListener('click', e => { if (e.target === bg) { bg.remove(); renderChimie(); } });
  document.body.appendChild(bg);
  if (prefill?.produitId) _cfAutofill();
}

function openFraisPortModal(dateGroupe) {
  const today = new Date().toISOString().slice(0, 10);
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">
    <h3>Nouveau frais de port</h3>
    ${dateGroupe
      ? `<div class="page-sub" style="margin-bottom:10px;">Rejoint le bloc du ${fmtDate(dateGroupe)}.</div>`
      : `<div class="field"><label>Date de commande</label><input id="fp-date-commande" type="date" value="${today}"></div>`}
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
      <button class="btn btn-primary" onclick='saveFraisPort(${JSON.stringify(dateGroupe || '')})'>Enregistrer</button>
    </div>
  </div>`;
  bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
}

async function saveFraisPort(dateGroupe) {
  const today = new Date().toISOString().slice(0, 10);
  const dateCommande = dateGroupe || document.getElementById('fp-date-commande')?.value || today;
  const body = {
    produit_nom: 'Frais de port' + (document.getElementById('fp-detail').value.trim() ? ' — ' + document.getElementById('fp-detail').value.trim() : ''),
    quantite: 1,
    prix_achat_unitaire: parseFloat(document.getElementById('fp-montant').value) || 0,
    statut: document.getElementById('fp-statut').value,
    est_frais: true,
    date: today,
    date_commande: dateCommande,
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
  const modal = document.querySelector('.modal-bg .modal');
  const dateGroupe = modal.dataset.dateGroupe;
  const produitId = document.getElementById('cf-produit').value || null;
  const opt = document.getElementById('cf-produit').selectedOptions[0];
  const nom = document.getElementById('cf-nom').value.trim() || (produitId ? opt.textContent : '');
  if (!nom) { toast('Produit requis', 'err'); return; }
  const dateCommandeInput = document.getElementById('cf-date-commande');
  const dateCommande = dateCommandeInput ? dateCommandeInput.value : (dateGroupe || new Date().toISOString().slice(0, 10));
  const body = {
    date_commande: dateCommande,
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
    toast('Ligne ajoutée au bloc', 'ok');
    _chFournisseur = await sbSelect('compta_commandes_fournisseur', 'select=*&recue=eq.false&order=date_commande.desc,created_at.desc');
    document.getElementById('cf-produit').value = '';
    document.getElementById('cf-nom').value = '';
    document.getElementById('cf-marque').value = '';
    document.getElementById('cf-qte').value = 1;
    document.getElementById('cf-prix').value = 0;
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
}

async function deleteCmdFournisseur(id) {
  if (!confirm('Supprimer cette commande ?')) return;
  try { await sbDelete('compta_commandes_fournisseur', id); await renderChimie(); toast('Supprimé', 'ok'); }
  catch (e) { toast('Erreur : ' + e.message, 'err'); }
}

function ouvrirReceptionModal(id, lotIds) {
  let ids = [];
  let titre, sousTitre;
  if (lotIds) {
    ids = lotIds;
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

async function ajusterQteCmdFournisseur(id, delta) {
  const c = _chFournisseur.find(x => x.id === id);
  if (!c) return;
  const nouvelleQte = Math.max(1, Number(c.quantite || 1) + delta);
  try {
    await sbUpdate('compta_commandes_fournisseur', id, { quantite: nouvelleQte });
    await renderChimie();
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
}

async function modifierPrixCmdFournisseur(id, valeur) {
  const nouveauPrix = parseFloat(valeur);
  if (isNaN(nouveauPrix)) return;
  try {
    await sbUpdate('compta_commandes_fournisseur', id, { prix_achat_unitaire: nouveauPrix });
    await renderChimie();
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
}

async function copierCommandeFournisseur(ids) {
  const lignes = _chFournisseur.filter(c => ids.includes(c.id) && !c.est_frais);
  if (!lignes.length) { toast('Rien à copier dans ce bloc', 'err'); return; }
  const texte = lignes.map(l => `${l.produit_nom}${l.marque ? ' (' + l.marque + ')' : ''} x${l.quantite}`).join('\n');
  try {
    await navigator.clipboard.writeText(texte);
    toast('Commande copiée dans le presse-papier', 'ok');
  } catch (e) { toast('Erreur copie : ' + e.message, 'err'); }
}

async function _cfDateLot(ids, date) {
  try {
    for (const id of ids) await sbUpdate('compta_commandes_fournisseur', id, { date_commande: date });
    toast('Date mise à jour — fusionné avec le bloc existant si la date correspond', 'ok');
    await renderChimie();
  } catch (e) { toast('Erreur : ' + e.message, 'err'); await renderChimie(); }
}

async function annulerReceptionLot(ids) {
  if (!confirm('Annuler la réception de ce bloc ? Le stock reçu sera retiré et il repassera en "En cours".')) return;
  try {
    for (const id of ids) {
      const c = _chFournisseurRecues.find(x => x.id === id);
      if (!c) continue;
      if (!c.est_frais) {
        const produit = c.produit_id ? _chProduits.find(p => p.id === c.produit_id) : _chProduits.find(p => p.nom === c.produit_nom);
        if (produit) {
          const nouveauStock = Number(produit.stock_reel || 0) - Number(c.quantite || 0);
          await sbUpdate('compta_produits', produit.id, { stock_reel: nouveauStock });
        }
      }
      await sbUpdate('compta_commandes_fournisseur', id, { recue: false, statut: 'en_cours', date_reception: null });
    }
    toast('Réception annulée, commande remise en cours', 'ok');
    await renderChimie();
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
}

// ── COMMANDES CLIENTS → VALIDATION EN VENTES ────────────────────────
let _ccFrais = {};

function _ccTotalAvecFrais(cl, totalBrut) {
  const frais = Number(_ccFrais[cl] || 0);
  return totalBrut * (1 + frais / 100);
}

function _ccFraisChange(cl, totalBrut, val) {
  _ccFrais[cl] = parseFloat(val) || 0;
  const total = _ccTotalAvecFrais(cl, totalBrut);
  const idSafe = cl.replace(/[^a-zA-Z0-9]/g, '_');
  const span = document.getElementById(`cc-total-${idSafe}`);
  if (span) span.textContent = fmtEUR(total);
}

function _tplClients() {
  const parClient = {};
  _chClients.forEach(c => { (parClient[c.client] = parClient[c.client] || []).push(c); });
  const clients = Object.keys(parClient);
  return `
    <div class="toolbar"><div></div><button class="btn btn-primary" onclick="openCmdClientModal()">+ Ligne commande</button></div>
    ${clients.length ? clients.map(cl => {
      const lignes = parClient[cl];
      const totalBrut = lignes.reduce((s, l) => s + l.quantite * l.prix_vente_unitaire, 0);
      const idSafe = cl.replace(/[^a-zA-Z0-9]/g, '_');
      return `
      <div class="card" style="margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="font-weight:700;cursor:pointer;" onclick='ouvrirDetailClient(${JSON.stringify(cl)})'>${esc(cl)}</div>
            <button class="btn btn-ghost btn-sm" style="padding:2px 8px;" title="Ajouter une ligne pour ce client" onclick='openCmdClientModal(${JSON.stringify(cl)})'>+</button>
          </div>
          <button class="btn btn-primary btn-sm" onclick='ouvrirValidationClient(${JSON.stringify(cl)})'>Valider la vente</button>
        </div>
        <table>
          <thead><tr><th>Produit</th><th>Qté</th><th>PU vente</th><th>Total</th><th></th></tr></thead>
          <tbody>
            ${lignes.map(l => `
              <tr>
                <td style="cursor:pointer;" onclick="openCmdClientModal(null, '${l.id}')">${esc(l.produit_nom)}</td>
                <td>
                  <div style="display:flex;align-items:center;gap:6px;">
                    <button class="btn btn-ghost btn-sm" style="padding:2px 8px;" onclick="event.stopPropagation();ajusterQteCmdClient('${l.id}', -1)">−</button>
                    <span style="min-width:20px;text-align:center;cursor:pointer;" onclick="openCmdClientModal(null, '${l.id}')">${l.quantite}</span>
                    <button class="btn btn-ghost btn-sm" style="padding:2px 8px;" onclick="event.stopPropagation();ajusterQteCmdClient('${l.id}', 1)">+</button>
                  </div>
                </td>
                <td style="cursor:pointer;" onclick="openCmdClientModal(null, '${l.id}')">${fmtEUR(l.prix_vente_unitaire)}</td>
                <td style="cursor:pointer;" onclick="openCmdClientModal(null, '${l.id}')">${fmtEUR(l.quantite * l.prix_vente_unitaire)}</td>
                <td><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();deleteCmdClient('${l.id}')">Suppr.</button></td>
              </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="text-align:right;">Total avant frais</td>
              <td>${fmtEUR(totalBrut)}</td>
              <td></td>
            </tr>
            <tr>
              <td colspan="3" style="text-align:right;font-weight:600;">Frais</td>
              <td>
                <input type="number" step="0.1" value="${_ccFrais[cl] || 0}" style="width:70px;background:var(--card2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:4px 6px;" oninput='_ccFraisChange(${JSON.stringify(cl)}, ${totalBrut}, this.value)'> %
              </td>
              <td></td>
            </tr>
            <tr>
              <td colspan="3" style="text-align:right;font-weight:700;">Total après frais</td>
              <td id="cc-total-${idSafe}" style="font-weight:700;">${fmtEUR(_ccTotalAvecFrais(cl, totalBrut))}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>`;
    }).join('') : `<div class="empty">Aucune commande client en attente</div>`}
  `;
}

function openCmdClientModal(clientPrefill, editId) {
  const editLigne = editId ? _chClients.find(c => c.id === editId) : null;
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" data-edit-id="${editId || ''}">
    <h3>${editLigne ? 'Modifier la ligne' : 'Nouvelle ligne'} — Commande client</h3>
    <div class="field"><label>Client</label><input id="cc-client" value="${esc(editLigne?.client || clientPrefill || '')}"></div>
    <div class="field"><label>Produit</label>
      <select id="cc-produit" onchange="_ccAutofill()">
        ${_chProduits.map(p => `<option value="${p.id}" data-marque="${esc(p.marque)}" data-vente="${p.prix_vente||''}" ${editLigne && editLigne.produit_id===p.id ? 'selected' : ''}>${esc(p.nom)}</option>`).join('')}
      </select>
    </div>
    <div class="row2">
      <div class="field"><label>Quantité</label><input id="cc-qte" type="number" value="${editLigne?.quantite ?? 1}"></div>
      <div class="field"><label>Prix vente unit.</label><input id="cc-prix" type="number" step="0.01" value="${editLigne?.prix_vente_unitaire ?? 0}"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="this.closest('.modal-bg').remove();renderChimie()">${editLigne ? 'Annuler' : 'Terminé'}</button>
      ${editLigne
        ? `<button class="btn btn-primary" onclick="saveCmdClient('${editId}')">Enregistrer</button>`
        : `<button class="btn btn-primary" onclick="saveCmdClient()">Ajouter (et continuer)</button>`}
    </div>
  </div>`;
  bg.addEventListener('click', e => { if (e.target === bg) { bg.remove(); renderChimie(); } });
  document.body.appendChild(bg);
  if (!editLigne) _ccAutofill();
}

function _ccAutofill() {
  const opt = document.getElementById('cc-produit').selectedOptions[0];
  if (opt && opt.dataset.vente) document.getElementById('cc-prix').value = opt.dataset.vente;
}

async function saveCmdClient(editId) {
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
    if (editId) {
      await sbUpdate('compta_commandes_clients', editId, body);
      document.querySelector('.modal-bg')?.remove();
      toast('Ligne modifiée', 'ok');
      await renderChimie();
    } else {
      await sbInsert('compta_commandes_clients', body);
      toast('Ligne ajoutée', 'ok');
      _chClients = await sbSelect('compta_commandes_clients', 'select=*&order=created_at.desc');
      document.getElementById('cc-qte').value = 1;
      document.getElementById('cc-prix').value = document.getElementById('cc-produit').selectedOptions[0]?.dataset.vente || 0;
    }
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
  const frais = Number(_ccFrais[client] || 0);
  const totalAvecFrais = totalBrut * (1 + frais / 100);
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">
    <h3>Valider la vente — ${esc(client)}</h3>
    <div class="page-sub" style="margin-bottom:14px;">Total avant frais : <b>${fmtEUR(totalBrut)}</b></div>
    <div class="field"><label>Frais d'envoi / majoration (%)</label><input id="vc-remise" type="number" step="0.1" value="${frais}" oninput="_vcRecalc(${totalBrut})"></div>
    <div class="field"><label>Montant réel encaissé (€) — c'est ce total qui sera comptabilisé</label><input id="vc-montant" type="number" step="0.01" value="${totalAvecFrais.toFixed(2)}"></div>
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
    delete _ccFrais[client];
    document.querySelector('.modal-bg')?.remove();
    toast(`Vente validée pour ${client}`, 'ok');
    await renderChimie();
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
}
