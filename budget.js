const CATEGORIES = {
  revenu: ['Coaching distance', 'Coaching séances', 'Chimie', 'Addict nutrition'],
  depense_fixe: ['Appartement', 'Banque', 'Assurance', 'Pro', 'Crypto'],
  depense_variable: ['Alimentation', 'Voiture', 'Perso', 'Pro', 'Chat', 'Chimie', 'Santé', 'Soirées', 'Vape', 'Resto', 'Vêtements'],
  epargne: ['Epargne crypto'],
  credit: ['Crédit'],
};
const BANQUES = ['Crédit Agricole', 'Qonto', 'Revolut', 'Espèces', 'Sumeria', 'Paypal', 'Crypt'];
const TYPE_LABELS = { revenu: 'Revenus', depense_fixe: 'Dépenses fixes', depense_variable: 'Dépenses variables', epargne: 'Épargne', credit: 'Crédits' };

let _buMois = moisActuel();
let _buType = 'revenu';
let _buLignes = [];
let _buTreso = null;

async function renderBudget() {
  const [lignes, treso] = await Promise.all([
    sbSelect('compta_budget_lignes', `mois=eq.${encodeURIComponent(_buMois)}&annee=eq.2026&order=created_at.asc`),
    sbSelect('compta_tresorerie', `mois=eq.${encodeURIComponent(_buMois)}&annee=eq.2026`),
  ]);
  _buLignes = lignes;
  _buTreso = treso[0] || null;

  const totRevenu = sum('revenu'), totFixe = sum('depense_fixe'), totVar = sum('depense_variable'), totEparg = sum('epargne'), totCredit = sum('credit');
  const resultat = totRevenu - totFixe - totVar - totEparg - totCredit;

  const rowsType = _buLignes.filter(l => l.type === _buType);

  document.getElementById('root').innerHTML = shell(`
    <div class="topbar">
      <div><div class="page-title">Budget mensuel</div><div class="page-sub">${_buMois} 2026</div></div>
      <button class="btn btn-primary" onclick="openLigneModal()">+ Ligne</button>
    </div>
    <div class="toolbar">
      <select onchange="_buMois=this.value;renderBudget()" style="background:var(--card2);color:var(--text);border:1px solid var(--border);padding:9px 12px;border-radius:10px;">
        ${MOIS.map(m => `<option value="${m}" ${m===_buMois?'selected':''}>${m}</option>`).join('')}
      </select>
    </div>

    <div class="grid cards4" style="margin-bottom:18px;">
      <div class="card kpi"><div class="label">Revenus</div><div class="value pos">${fmtEUR(totRevenu)}</div></div>
      <div class="card kpi"><div class="label">Dépenses (fixes+var.)</div><div class="value neg">${fmtEUR(totFixe + totVar)}</div></div>
      <div class="card kpi"><div class="label">Épargne + crédit</div><div class="value">${fmtEUR(totEparg + totCredit)}</div></div>
      <div class="card kpi"><div class="label">Résultat</div><div class="value ${resultat>=0?'pos':'neg'}">${fmtEUR(resultat)}</div></div>
    </div>

    <div class="card" style="margin-bottom:18px;">
      <div style="font-weight:700;margin-bottom:12px;">Trésorerie</div>
      <div class="row3">
        <div class="field"><label>Départ</label><input id="tr-depart" type="number" step="0.01" value="${_buTreso?.depart ?? 0}"></div>
        <div class="field"><label>Prévue</label><input id="tr-prevue" type="number" step="0.01" value="${_buTreso?.prevue ?? 0}"></div>
        <div class="field"><label>Actuelle</label><input id="tr-actuelle" type="number" step="0.01" value="${_buTreso?.actuelle ?? 0}"></div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="saveTresorerie()">Enregistrer</button>
    </div>

    <div class="pill-tabs" style="margin-bottom:14px;flex-wrap:wrap;">
      ${Object.keys(TYPE_LABELS).map(t => `<div class="pill-tab ${_buType===t?'active':''}" onclick="_buType='${t}';renderBudget()">${TYPE_LABELS[t]} · ${fmtEUR(sum(t))}</div>`).join('')}
    </div>

    <div class="table-wrap">
      <table>
        <thead><tr><th>Catégorie</th><th>Banque</th><th>Détail</th><th>Date</th><th>Montant</th><th></th></tr></thead>
        <tbody>
          ${rowsType.length ? rowsType.map(l => `
            <tr>
              <td><b>${esc(l.categorie)}</b></td>
              <td>${esc(l.banque) || '—'}</td>
              <td>${esc(l.detail) || '—'}</td>
              <td>${fmtDate(l.date) || '—'}</td>
              <td>${fmtEUR(l.montant)}</td>
              <td><button class="btn btn-ghost btn-sm" onclick="deleteLigne('${l.id}')">Suppr.</button></td>
            </tr>`).join('') : `<tr><td colspan="6"><div class="empty">Aucune ligne</div></td></tr>`}
        </tbody>
      </table>
    </div>
  `);

  function sum(type) { return lignes.filter(l => l.type === type).reduce((s, l) => s + Number(l.montant || 0), 0); }
}

function openLigneModal() {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">
    <h3>Nouvelle ligne — ${_buMois}</h3>
    <div class="field"><label>Type</label>
      <select id="lg-type" onchange="_lgReloadCat()">
        ${Object.keys(TYPE_LABELS).map(t => `<option value="${t}" ${t===_buType?'selected':''}>${TYPE_LABELS[t]}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>Catégorie</label><select id="lg-cat"></select></div>
    <div class="row2">
      <div class="field"><label>Banque</label><select id="lg-banque"><option value="">—</option>${BANQUES.map(b => `<option>${b}</option>`).join('')}</select></div>
      <div class="field"><label>Montant (€)</label><input id="lg-montant" type="number" step="0.01" value="0"></div>
    </div>
    <div class="field"><label>Détail</label><input id="lg-detail" placeholder="ex: Loyer, Total-elec…"></div>
    <div class="field"><label>Date</label><input id="lg-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="this.closest('.modal-bg').remove()">Annuler</button>
      <button class="btn btn-primary" onclick="saveLigne()">Enregistrer</button>
    </div>
  </div>`;
  bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
  _lgReloadCat();
}

function _lgReloadCat() {
  const type = document.getElementById('lg-type').value;
  document.getElementById('lg-cat').innerHTML = CATEGORIES[type].map(c => `<option>${c}</option>`).join('');
}

async function saveLigne() {
  const body = {
    mois: _buMois, annee: 2026,
    type: document.getElementById('lg-type').value,
    categorie: document.getElementById('lg-cat').value,
    banque: document.getElementById('lg-banque').value || null,
    detail: document.getElementById('lg-detail').value.trim() || null,
    montant: parseFloat(document.getElementById('lg-montant').value) || 0,
    date: document.getElementById('lg-date').value || null,
  };
  try {
    await sbInsert('compta_budget_lignes', body);
    document.querySelector('.modal-bg')?.remove();
    toast('Ligne enregistrée', 'ok');
    await renderBudget();
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
}

async function deleteLigne(id) {
  if (!confirm('Supprimer cette ligne ?')) return;
  try { await sbDelete('compta_budget_lignes', id); await renderBudget(); toast('Supprimé', 'ok'); }
  catch (e) { toast('Erreur : ' + e.message, 'err'); }
}

async function saveTresorerie() {
  const body = {
    mois: _buMois, annee: 2026,
    depart: parseFloat(document.getElementById('tr-depart').value) || 0,
    prevue: parseFloat(document.getElementById('tr-prevue').value) || 0,
    actuelle: parseFloat(document.getElementById('tr-actuelle').value) || 0,
  };
  try {
    if (_buTreso) await sbUpdate('compta_tresorerie', _buTreso.id, body);
    else await sbInsert('compta_tresorerie', body);
    toast('Trésorerie enregistrée', 'ok');
    await renderBudget();
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
}
