const CATEGORIES = {
  revenu: ['ARE', 'Autre'],
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
let _buModeles = [];
let _buAuto = { coachingDistance: 0, coachingSeance: 0, chimie: 0, addict: 0, achatsFournisseur: 0 };

function _moisDateRange(mois) {
  const num = parseInt(MOIS_NUM[mois.toUpperCase()], 10);
  const debut = `2026-${String(num).padStart(2, '0')}-01`;
  const finMoisNum = num === 12 ? 1 : num + 1;
  const finAnnee = num === 12 ? 2027 : 2026;
  const fin = `${finAnnee}-${String(finMoisNum).padStart(2, '0')}-01`;
  return { debut, fin };
}

async function renderBudget() {
  const { debut, fin } = _moisDateRange(_buMois);
  let [lignes, treso, paiements, ventes, addict, achats, modeles] = await Promise.all([
    sbSelect('compta_budget_lignes', `mois=eq.${encodeURIComponent(_buMois)}&annee=eq.2026&order=created_at.asc`),
    sbSelect('compta_tresorerie', `mois=eq.${encodeURIComponent(_buMois)}&annee=eq.2026`),
    sbSelect('compta_paiements', `mois=eq.${encodeURIComponent(_buMois)}&annee=eq.2026`),
    sbSelect('compta_ventes', `annulee=eq.false&date=gte.${debut}&date=lt.${fin}`),
    sbSelect('compta_addict', `date=gte.${debut}&date=lt.${fin}`),
    sbSelect('compta_commandes_fournisseur', `recue=eq.true&date_reception=gte.${debut}&date_reception=lt.${fin}`),
    sbSelect('compta_depenses_fixes_modeles', 'actif=eq.true&order=categorie.asc'),
  ]);
  _buModeles = modeles;

  // Reconduction automatique : toute dépense fixe active sans ligne ce mois-ci est créée à la volée.
  const manquantes = modeles.filter(m => !lignes.some(l => l.modele_id === m.id));
  if (manquantes.length) {
    await Promise.all(manquantes.map(m => sbInsert('compta_budget_lignes', {
      mois: _buMois, annee: 2026, type: 'depense_fixe', modele_id: m.id,
      categorie: m.categorie, banque: m.banque, detail: m.detail, montant: m.montant, coche: false,
    })));
    lignes = await sbSelect('compta_budget_lignes', `mois=eq.${encodeURIComponent(_buMois)}&annee=eq.2026&order=created_at.asc`);
  }

  _buLignes = lignes;
  _buTreso = treso[0] || null;
  _buAuto = {
    coachingDistance: paiements.reduce((s, p) => s + Number(p.mt_suivi || 0), 0),
    coachingSeance: paiements.reduce((s, p) => s + Number(p.mt_seance || 0), 0),
    chimie: ventes.reduce((s, v) => s + (Number(v.total_vente || 0) - Number(v.total_achat || 0)), 0),
    addict: addict.reduce((s, a) => s + (Number(a.vente || 0) - Number(a.achat || 0)), 0),
    achatsFournisseur: achats.reduce((s, c) => s + Number(c.quantite || 0) * Number(c.prix_achat_unitaire || 0), 0),
  };
  const totalAutoRevenu = _buAuto.coachingDistance + _buAuto.coachingSeance + _buAuto.chimie + _buAuto.addict;

  const totRevenu = totalAutoRevenu + sum('revenu'), totFixe = sum('depense_fixe'), totVar = _buAuto.achatsFournisseur + sum('depense_variable'), totEparg = sum('epargne'), totCredit = sum('credit');
  const resultat = totRevenu - totFixe - totVar - totEparg - totCredit;

  const rowsType = _buLignes.filter(l => l.type === _buType);

  document.getElementById('root').innerHTML = shell(`
    <div class="topbar">
      <div><div class="page-title">Budget mensuel</div><div class="page-sub">${_buMois} 2026</div></div>
      <button class="btn btn-primary" onclick="${_buType==='depense_fixe' ? 'openDepenseFixeModeleModal()' : 'openLigneModal()'}">+ ${_buType==='depense_fixe' ? 'Dépense fixe récurrente' : 'Ligne'}</button>
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
      ${Object.keys(TYPE_LABELS).map(t => `<div class="pill-tab ${_buType===t?'active':''}" onclick="_buType='${t}';renderBudget()">${TYPE_LABELS[t]} · ${fmtEUR(t==='revenu' ? totalAutoRevenu + sum(t) : t==='depense_variable' ? _buAuto.achatsFournisseur + sum(t) : sum(t))}</div>`).join('')}
    </div>

    ${_buType === 'revenu' ? `
    <div class="table-wrap" style="margin-bottom:16px;">
      <table>
        <thead><tr><th>Catégorie</th><th>Source</th><th>Montant</th></tr></thead>
        <tbody>
          <tr><td><b>Coaching distance</b></td><td><span class="badge badge-blue">Auto · Paiements</span></td><td>${fmtEUR(_buAuto.coachingDistance)}</td></tr>
          <tr><td><b>Coaching séances</b></td><td><span class="badge badge-blue">Auto · Paiements</span></td><td>${fmtEUR(_buAuto.coachingSeance)}</td></tr>
          <tr><td><b>Chimie (bénéfice)</b></td><td><span class="badge badge-blue">Auto · Ventes − achats</span></td><td>${fmtEUR(_buAuto.chimie)}</td></tr>
          <tr><td><b>Addict nutrition (bénéfice)</b></td><td><span class="badge badge-blue">Auto · Ventes − achats</span></td><td>${fmtEUR(_buAuto.addict)}</td></tr>
        </tbody>
      </table>
    </div>
    <div class="page-sub" style="margin:-8px 0 10px;">Revenus manuels (ARE, etc.)</div>
    ` : ''}
    ${_buType === 'depense_variable' ? `
    <div class="table-wrap" style="margin-bottom:16px;">
      <table>
        <thead><tr><th>Catégorie</th><th>Source</th><th>Montant</th></tr></thead>
        <tbody>
          <tr><td><b>Commandes fournisseur (Chimie)</b></td><td><span class="badge badge-blue">Auto · Réceptions</span></td><td>${fmtEUR(_buAuto.achatsFournisseur)}</td></tr>
        </tbody>
      </table>
    </div>
    <div class="page-sub" style="margin:-8px 0 10px;">Dépenses variables manuelles</div>
    ` : ''}

    ${_buType === 'depense_fixe' ? `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Payé</th><th>Catégorie</th><th>Banque</th><th>Détail</th><th>Montant</th><th></th></tr></thead>
        <tbody>
          ${rowsType.length ? rowsType.map(l => `
            <tr>
              <td><input type="checkbox" ${l.coche ? 'checked' : ''} onchange="toggleCoche('${l.id}', this.checked)" style="width:18px;height:18px;"></td>
              <td><b>${esc(l.categorie)}</b></td>
              <td>${esc(l.banque) || '—'}</td>
              <td>${esc(l.detail) || '—'}</td>
              <td>${fmtEUR(l.montant)}</td>
              <td style="display:flex;gap:6px;">
                <button class="btn btn-ghost btn-sm" onclick="openDepenseFixeModeleModal('${l.modele_id || ''}', '${l.id}')">Éditer</button>
                <button class="btn btn-ghost btn-sm" onclick="supprimerDepenseFixeModele('${l.modele_id || ''}', '${l.id}')">Suppr.</button>
              </td>
            </tr>`).join('') : `<tr><td colspan="6"><div class="empty">Aucune dépense fixe — clique sur "+ Dépense fixe récurrente"</div></td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="page-sub" style="margin-top:8px;">Reconduites automatiquement chaque mois. "Payé" est juste un suivi, ne change pas le total.</div>
    ` : `
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
            </tr>`).join('') : `<tr><td colspan="6"><div class="empty">Aucune ligne manuelle</div></td></tr>`}
        </tbody>
      </table>
    </div>
    `}
  `);

  function sum(type) { return lignes.filter(l => l.type === type).reduce((s, l) => s + Number(l.montant || 0), 0); }
}

async function toggleCoche(id, coche) {
  try { await sbUpdate('compta_budget_lignes', id, { coche }); const l = _buLignes.find(x => x.id === id); if (l) l.coche = coche; }
  catch (e) { toast('Erreur : ' + e.message, 'err'); await renderBudget(); }
}

function openDepenseFixeModeleModal(modeleId, ligneId) {
  const modele = modeleId ? _buModeles.find(m => m.id === modeleId) : null;
  const ligne = ligneId ? _buLignes.find(l => l.id === ligneId) : null;
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">
    <h3>${modele ? 'Modifier' : 'Nouvelle'} dépense fixe récurrente</h3>
    <div class="field"><label>Catégorie</label><input id="df-cat" value="${esc(ligne?.categorie ?? modele?.categorie)}" placeholder="ex: Appartement, Assurance…"></div>
    <div class="row2">
      <div class="field"><label>Banque</label><select id="df-banque"><option value="">—</option>${BANQUES.map(b => `<option ${((ligne?.banque ?? modele?.banque)===b)?'selected':''}>${b}</option>`).join('')}</select></div>
      <div class="field"><label>Montant (€)</label><input id="df-montant" type="number" step="0.01" value="${ligne?.montant ?? modele?.montant ?? 0}"></div>
    </div>
    <div class="field"><label>Détail</label><input id="df-detail" value="${esc(ligne?.detail ?? modele?.detail)}" placeholder="ex: Loyer, Total-elec…"></div>
    <div class="page-sub" style="margin-bottom:10px;">${modele ? "Modifier le montant/détail ici change ce mois-ci ET les mois suivants (c'est le modèle récurrent)." : "Sera reconduite automatiquement chaque mois à partir de maintenant."}</div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="this.closest('.modal-bg').remove()">Annuler</button>
      <button class="btn btn-primary" onclick="saveDepenseFixeModele('${modeleId || ''}', '${ligneId || ''}')">Enregistrer</button>
    </div>
  </div>`;
  bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
}

async function saveDepenseFixeModele(modeleId, ligneId) {
  const categorie = document.getElementById('df-cat').value.trim();
  const banque = document.getElementById('df-banque').value || null;
  const detail = document.getElementById('df-detail').value.trim() || null;
  const montant = parseFloat(document.getElementById('df-montant').value) || 0;
  if (!categorie) { toast('Catégorie requise', 'err'); return; }
  try {
    let mid = modeleId;
    if (mid) {
      await sbUpdate('compta_depenses_fixes_modeles', mid, { categorie, banque, detail, montant });
    } else {
      const created = await sbInsert('compta_depenses_fixes_modeles', { categorie, banque, detail, montant, actif: true });
      mid = created[0].id;
    }
    if (ligneId) {
      await sbUpdate('compta_budget_lignes', ligneId, { categorie, banque, detail, montant, modele_id: mid });
    } else {
      await sbInsert('compta_budget_lignes', { mois: _buMois, annee: 2026, type: 'depense_fixe', modele_id: mid, categorie, banque, detail, montant, coche: false });
    }
    document.querySelector('.modal-bg')?.remove();
    toast('Dépense fixe enregistrée', 'ok');
    await renderBudget();
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
}

async function supprimerDepenseFixeModele(modeleId, ligneId) {
  if (!confirm("Supprimer définitivement cette dépense fixe récurrente ? Elle n'apparaîtra plus les mois suivants.")) return;
  try {
    if (modeleId) await sbUpdate('compta_depenses_fixes_modeles', modeleId, { actif: false });
    if (ligneId) await sbDelete('compta_budget_lignes', ligneId);
    toast('Dépense fixe supprimée', 'ok');
    await renderBudget();
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
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
