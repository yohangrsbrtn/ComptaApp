// Rapprochement d'un relevé Crédit Agricole (PDF) avec les lignes du Budget.
// Tout se passe dans le navigateur : le PDF n'est jamais envoyé nulle part.

const _RV_MOIS = { JANVIER: 0, FEVRIER: 1, MARS: 2, AVRIL: 3, MAI: 4, JUIN: 5, JUILLET: 6, AOUT: 7, SEPTEMBRE: 8, OCTOBRE: 9, NOVEMBRE: 10, DECEMBRE: 11 };
const _rvNorm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const _RV_MONTANT = /^\d{1,3}(?: \d{3})*,\d{2}$/;

// pages : [{ items: [{ s, x, y }] }] — positions issues de pdf.js
function parseReleveCA(pages) {
  let arreteMois = null, arreteAnnee = null, section = 'compte';
  const ops = [];
  let courante = null;

  for (const page of pages) {
    const rows = {};
    page.items.filter(i => i.s.trim()).forEach(i => { (rows[i.y] = rows[i.y] || []).push(i); });
    const ys = Object.keys(rows).map(Number).sort((a, b) => b - a);
    for (const y of ys) {
      const items = rows[y].sort((a, b) => a.x - b.x);
      const texte = items.map(i => i.s).join(' ').replace(/\s+/g, ' ').trim();

      const arr = texte.match(/Date d'arrêté\s*:\s*(\d+)\s+(\S+)\s+(\d{4})/i);
      if (arr) { arreteMois = _RV_MOIS[_rvNorm(arr[2]).toUpperCase()]; arreteAnnee = Number(arr[3]); continue; }
      if (/Mastercard|Mastercar/i.test(texte) && /n°/.test(texte)) { section = 'carte'; courante = null; continue; }
      if (/^(Solde au|Total des op|Nouveau solde|Ancien solde|Montant pr)/i.test(texte) || /Solde au/.test(texte)) { if (/^Solde au|Nouveau solde|Total des op/i.test(texte)) courante = null; continue; }
      if (/Vos réserves financières|Pour information/i.test(texte)) { courante = null; continue; }

      const premier = items[0];
      const montantsItems = items.filter(i => i.x > 400 && _RV_MONTANT.test(i.s.replace(/[+¨]/g, '').trim()));
      const debutOp = /^\d\d\.\d\d$/.test(premier.s) && premier.x < 30;

      if (debutOp) {
        const [jj, mm] = premier.s.split('.').map(Number);
        const labelItems = items.filter(i => i.x >= (section === 'carte' ? 60 : 110) && i.x < 400 && !/^\d\d\.\d\d$/.test(i.s));
        const type = section === 'compte' ? (items.find(i => i.x >= 70 && i.x < 110)?.s || '') : 'Carte';
        let annee = arreteAnnee || new Date().getFullYear();
        if (arreteMois != null && mm - 1 > arreteMois) annee -= 1;
        courante = { section, type, jour: jj, mois: mm, annee, label: labelItems.map(i => i.s).join(' ').trim(), details: [], montant: null, sens: null };
        ops.push(courante);
        if (montantsItems.length) _rvAffecterMontant(courante, montantsItems[0]);
        continue;
      }
      if (courante) {
        if (montantsItems.length && courante.montant == null && items.every(i => i.x > 400 || /[¨+]/.test(i.s))) {
          _rvAffecterMontant(courante, montantsItems[0]);
        } else if (montantsItems.length === 0 && courante.details.length < 3 && premier.x < 110) {
          courante.details.push(texte);
        }
      }
    }
  }
  return {
    mois: arreteMois, annee: arreteAnnee,
    ops: ops.filter(o => o.montant != null && o.montant > 0).map(o => ({ ...o, date: `${o.annee}-${String(o.mois).padStart(2, '0')}-${String(o.jour).padStart(2, '0')}` })),
  };
}

function _rvAffecterMontant(op, item) {
  op.montant = Number(item.s.replace(/[+¨]/g, '').trim().replace(/ /g, '').replace(',', '.'));
  op.sens = item.x < 480 ? 'debit' : 'credit';
}


// ── Rapprochement avec les lignes du Budget ──────────────────────────
const _RV_GENERIQUES = ['autre', 'perso', 'fixe', 'frais', 'paiement', 'virement'];
const _RV_ALIAS = [
  [/france travail|pole emploi/, 'are chomage'],
  [/aksport|fitness/, 'sport fitness salle'],
  [/bitstack/, 'bitstack crypto bitcoin epargne'],
  [/carrefour|leclerc|auchan|lidl|intermarche|monoprix|casino|franprix/, 'alimentation courses carrefour'],
  [/paypal/, 'paypal'],
  [/mutuelle/, 'mutuelle sante'],
  [/gmf/, 'gmf assurance'],
  [/assur-connect|assur connect/, 'assurance assur'],
  [/urssaf/, 'urssaf cotisation'],
  [/bouygues/, 'bouygues telephone forfait mobile internet'],
  [/totalenergies|total energies/, 'total elec electricite energie'],
  [/cotisation carte|offre compte/, 'banque carte compte'],
];

function _rvTokens(texte) {
  return _rvNorm(texte).split(/[^a-z0-9]+/).filter(t => t.length >= 3 && !_RV_GENERIQUES.includes(t));
}

function _rvTexteOp(op) {
  let t = _rvNorm(op.label + ' ' + op.details.join(' '));
  _RV_ALIAS.forEach(([re, extra]) => { if (re.test(t)) t += ' ' + extra; });
  return t;
}

function _rvProposer(ops, lignes) {
  const typesDebit = ['depense_fixe', 'depense_variable', 'credit', 'epargne'];
  const ok = l => !l.banque || l.banque === 'Crédit Agricole';
  const paires = [];
  ops.forEach((op, oi) => {
    const texte = _rvTexteOp(op);
    const types = op.sens === 'debit' ? typesDebit : ['revenu'];
    lignes.filter(l => types.includes(l.type) && ok(l)).forEach(l => {
      const toks = _rvTokens((l.categorie || '') + ' ' + (l.detail || ''));
      const kw = toks.some(t => texte.includes(t));
      const ecart = Math.abs(Number(l.montant || 0) - op.montant);
      const exact = ecart < 0.01;
      const proche = !exact && Number(l.montant) > 0 && ecart / Number(l.montant) <= 0.25;
      const scoreMontant = exact ? 4 : proche ? 2 : 0;
      const score = (kw ? 3 : 0) + scoreMontant;
      if (score > 0) paires.push({ oi, lid: l.id, kw, exact, proche, score });
    });
  });
  const nbMemeMontant = m => ops.filter(o => Math.abs(o.montant - m) < 0.01).length;
  paires.sort((a, b) => b.score - a.score);
  const opPris = new Set(), lignePris = new Set(), res = [];
  paires.forEach(p => {
    if (opPris.has(p.oi) || lignePris.has(p.lid)) return;
    const op = ops[p.oi];
    let confiance = null;
    if (p.kw && p.exact) confiance = 'haute';
    else if (p.kw && p.proche) confiance = 'moyenne';
    else if (p.kw) confiance = 'faible';
    else if (p.exact && nbMemeMontant(op.montant) === 1) confiance = 'moyenne';
    if (!confiance) return;
    opPris.add(p.oi); lignePris.add(p.lid);
    res.push({ op, ligne: lignes.find(l => l.id === p.lid), confiance });
  });
  return { rapprochements: res, opsLibres: ops.filter((o, i) => !opPris.has(i)), lignesLibres: lignes.filter(l => !lignePris.has(l.id)) };
}

function _rvDevinerCategorie(op) {
  const t = _rvNorm(op.label);
  if (/bitstack/.test(t)) return { type: 'epargne', cat: 'Epargne crypto' };
  if (/carrefour|leclerc|auchan|lidl|intermarche|monoprix|casino|franprix/.test(t)) return { type: 'depense_variable', cat: 'Alimentation' };
  return { type: 'depense_variable', cat: 'Perso' };
}

let _rv = null;

function ouvrirRapprochementReleve() {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">
    <h3>Rapprocher un relevé Crédit Agricole</h3>
    <div class="page-sub" style="margin-bottom:12px;">Choisis le PDF du relevé. Il est lu dans ton navigateur, il n'est envoyé nulle part. Rien n'est modifié avant que tu valides la liste.</div>
    <div class="field"><input id="rv-file" type="file" accept="application/pdf" onchange="_rvAnalyser(this.files[0])"></div>
    <div id="rv-statut" class="page-sub"></div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="this.closest('.modal-bg').remove()">Fermer</button></div>
  </div>`;
  bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
}

function _rvChargerPdfJs() {
  if (window.pdfjsLib) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
    s.onload = () => { pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'; resolve(); };
    s.onerror = () => reject(new Error('Impossible de charger le lecteur PDF'));
    document.head.appendChild(s);
  });
}

async function _rvAnalyser(file) {
  if (!file) return;
  const statut = document.getElementById('rv-statut');
  statut.textContent = 'Lecture du relevé…';
  try {
    await _rvChargerPdfJs();
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const tc = await (await doc.getPage(p)).getTextContent();
      pages.push({ items: tc.items.map(i => ({ s: i.str, x: Math.round(i.transform[4]), y: Math.round(i.transform[5]) })) });
    }
    const releve = parseReleveCA(pages);
    if (!releve.ops.length) { statut.textContent = 'Aucune opération trouvée — est-ce bien un relevé Crédit Agricole ?'; return; }
    _rvAfficherRevue(releve);
  } catch (e) { statut.textContent = 'Erreur : ' + e.message; }
}

function _rvAfficherRevue(releve) {
  const moisReleve = MOIS[releve.mois];
  const horsMois = [], ops = [];
  releve.ops.forEach(o => {
    if (o.section === 'compte' && /^D[ée]penses Carte/i.test(o.label)) return;
    if (o.mois - 1 !== releve.mois) horsMois.push(o); else ops.push(o);
  });
  const prop = _rvProposer(ops, _buLignes);
  _rv = { releve, ops, prop, moisReleve };

  const libresDebit = prop.opsLibres.filter(o => o.sens === 'debit');
  const libresCredit = prop.opsLibres.filter(o => o.sens === 'credit');
  const lignesNonVues = prop.lignesLibres.filter(l => ['depense_fixe', 'depense_variable', 'credit', 'epargne'].includes(l.type) && (!l.banque || l.banque === 'Crédit Agricole'));
  const mauvaisMois = moisReleve !== _buMois;
  const badge = c => `<span class="badge ${c === 'haute' ? 'badge-green' : c === 'moyenne' ? 'badge-gold' : 'badge-red'}">${c}</span>`;

  const html = `
    ${mauvaisMois ? `<div class="card" style="border-color:var(--red);margin-bottom:12px;">Ce relevé est celui de <b>${moisReleve}</b> mais le Budget affiché est <b>${_buMois}</b>. Change de mois en haut de la page avant d'appliquer.</div>` : ''}
    <div class="page-sub" style="margin-bottom:10px;">Relevé de ${moisReleve} ${releve.annee} · ${ops.length} opérations${horsMois.length ? ` · ${horsMois.length} hors du mois (ignorée${horsMois.length > 1 ? 's' : ''})` : ''}</div>

    <div style="font-weight:700;margin:12px 0 6px;">1. Lignes du budget retrouvées sur le relevé (${prop.rapprochements.length})</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Pointer</th><th>Date</th><th>Opération</th><th>Ligne du budget</th><th>Montant</th><th>Fiabilité</th></tr></thead>
      <tbody>${prop.rapprochements.map((r, i) => {
        const diff = Math.abs(Number(r.ligne.montant || 0) - r.op.montant) >= 0.01;
        return `<tr>
          <td><input type="checkbox" id="rv-m-${i}" ${r.confiance !== 'faible' ? 'checked' : ''} style="width:18px;height:18px;"></td>
          <td>${fmtDate(r.op.date)}</td>
          <td>${esc(r.op.label)}</td>
          <td>${esc(TYPE_LABELS[r.ligne.type])} · <b>${esc(r.ligne.categorie)}</b>${r.ligne.detail ? ' · ' + esc(r.ligne.detail) : ''}</td>
          <td>${diff ? `${fmtEUR(r.ligne.montant)} → <b>${fmtEUR(r.op.montant)}</b><br><label class="page-sub"><input type="checkbox" id="rv-mt-${i}" checked> corriger le montant</label>` : fmtEUR(r.op.montant)}</td>
          <td>${badge(r.confiance)}</td></tr>`;
      }).join('') || `<tr><td colspan="6"><div class="empty">Aucun rapprochement</div></td></tr>`}</tbody>
    </table></div>

    <div style="font-weight:700;margin:16px 0 6px;">2. Dépenses du relevé absentes du budget (${libresDebit.length})</div>
    <div class="page-sub" style="margin-bottom:6px;">Coche celles à ajouter. Les virements sortants sont décochés par défaut (à toi de voir si c'est une dépense).</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Ajouter</th><th>Date</th><th>Opération</th><th>Montant</th><th>Type</th><th>Catégorie</th></tr></thead>
      <tbody>${libresDebit.map((o, i) => {
        const g = _rvDevinerCategorie(o);
        return `<tr>
          <td><input type="checkbox" id="rv-n-${i}" ${/^vir/i.test(o.label) ? '' : 'checked'} style="width:18px;height:18px;"></td>
          <td>${fmtDate(o.date)}</td><td>${esc(o.label)}</td><td>${fmtEUR(o.montant)}</td>
          <td><select id="rv-nt-${i}">${['depense_variable', 'depense_fixe', 'epargne', 'credit'].map(t => `<option value="${t}" ${t === g.type ? 'selected' : ''}>${TYPE_LABELS[t]}</option>`).join('')}</select></td>
          <td><input id="rv-nc-${i}" value="${esc(g.cat)}" style="width:130px;"></td></tr>`;
      }).join('') || `<tr><td colspan="6"><div class="empty">Tout est déjà dans ton budget</div></td></tr>`}</tbody>
    </table></div>

    ${lignesNonVues.length ? `
    <div style="font-weight:700;margin:16px 0 6px;">3. Lignes du budget non retrouvées sur le relevé (${lignesNonVues.length})</div>
    <div class="page-sub">Pas forcément une erreur (autre compte, paiement en espèces, prélèvement pas encore passé…).</div>
    <div class="page-sub" style="margin-top:4px;">${lignesNonVues.map(l => `${esc(l.categorie)}${l.detail ? ' (' + esc(l.detail) + ')' : ''} ${fmtEUR(l.montant)}`).join(' · ')}</div>` : ''}

    ${libresCredit.length ? `
    <div style="font-weight:700;margin:16px 0 6px;">4. Entrées non rattachées (${libresCredit.length}) — rien n'est modifié</div>
    <div class="page-sub">${libresCredit.map(o => `${fmtDate(o.date)} ${esc(o.label)} ${fmtEUR(o.montant)}`).join(' · ')}</div>` : ''}

    <div class="modal-actions" style="margin-top:16px;">
      <button class="btn btn-ghost" onclick="this.closest('.modal-bg').remove()">Annuler</button>
      <button class="btn btn-primary" ${mauvaisMois ? 'disabled' : ''} onclick="_rvAppliquer()">Appliquer</button>
    </div>`;
  const modal = document.querySelector('.modal-bg .modal');
  modal.style.maxWidth = '1000px';
  modal.innerHTML = `<h3>Rapprochement — relevé de ${moisReleve}</h3>` + html;
  _rv.libresDebit = libresDebit;
}

async function _rvAppliquer() {
  const { prop, libresDebit } = _rv;
  let pointes = 0, montants = 0, crees = 0;
  try {
    for (let i = 0; i < prop.rapprochements.length; i++) {
      if (!document.getElementById(`rv-m-${i}`)?.checked) continue;
      const { op, ligne } = prop.rapprochements[i];
      const maj = { coche: true, date: op.date };
      if (document.getElementById(`rv-mt-${i}`)?.checked) { maj.montant = op.montant; montants++; }
      await sbUpdate('compta_budget_lignes', ligne.id, maj);
      if (ligne.type === 'depense_fixe' && ligne.modele_id) await sbUpdate('compta_depenses_fixes_modeles', ligne.modele_id, { jour: Number(op.date.slice(8, 10)) });
      pointes++;
    }
    for (let i = 0; i < libresDebit.length; i++) {
      if (!document.getElementById(`rv-n-${i}`)?.checked) continue;
      const o = libresDebit[i];
      await sbInsert('compta_budget_lignes', {
        mois: _buMois, annee: 2026, type: document.getElementById(`rv-nt-${i}`).value,
        categorie: document.getElementById(`rv-nc-${i}`).value.trim() || 'Perso',
        banque: 'Crédit Agricole', detail: o.label, montant: o.montant, date: o.date, coche: true,
      });
      crees++;
    }
    document.querySelector('.modal-bg')?.remove();
    toast(`${pointes} ligne(s) pointée(s), ${montants} montant(s) corrigé(s), ${crees} ajoutée(s)`, 'ok');
    await renderBudget();
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
}

if (typeof module !== 'undefined') module.exports = { parseReleveCA, _rvProposer };
