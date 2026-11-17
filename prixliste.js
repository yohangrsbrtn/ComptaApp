// Mise à jour des prix d'achat depuis la liste de prix du fournisseur (PDF).
// Le PDF est lu dans le navigateur, jamais envoyé ni stocké.

const _PL_ALIAS = {
  testosterone: 'testo', test: 'testo', testo: 'testo', propionate: 'prop', prop: 'prop', enanthate: 'enan', enan: 'enan',
  cypionate: 'cyp', cyp: 'cyp', trenbolone: 'tren', tren: 'tren', acetate: 'ace', ace: 'ace', nandrolone: 'deca', deca: 'deca',
  boldenone: 'bold', bold: 'bold', eq: 'bold', oxymetholone: 'anadrol', anadrol: 'anadrol', stanozolol: 'stano', winstrol: 'stano',
  winny: 'stano', stano: 'stano', turinabol: 'tbol', tbol: 'tbol', turina: 'tbol', oxandrolone: 'anavar', anavar: 'anavar', var: 'anavar',
  danabol: 'dbol', dianabol: 'dbol', dbol: 'dbol', clomiphene: 'clomid', clomid: 'clomid', anastrozol: 'arimidex', anastrozole: 'arimidex',
  arimidex: 'arimidex', tamoxifen: 'nolva', nolva: 'nolva', letrozol: 'letro', letrozole: 'letro', letro: 'letro', cabergoline: 'caber',
  caber: 'caber', dostinex: 'caber', sildenafil: 'viagra', viagra: 'viagra', tadalafil: 'cialis', cialis: 'cialis', masteron: 'mast',
  drostanolone: 'mast', mast: 'mast', primobolan: 'primo', primo: 'primo', sustanon: 'sust', sust: 'sust', somatropin: 'hgh', hgh: 'hgh',
  growth: 'hgh', melanotan: 'mt2', mt2: 'mt2', clenbuterol: 'clen', clen: 'clen', proviron: 'proviron', exemestane: 'aromasin', aromasin: 'aromasin',
  thyroxin: 'thyroxin', hcg: 'hcg', pregnyl: 'hcg', npp: 'npp', retatrutide: 'reta', reta: 'reta', bpc: 'bpc', ghk: 'ghk', cu: 'ghk',
};
const _PL_BRUIT = new Set(['inj', 'injectable', 'tabs', 'tab', 'tablets', 'mg', 'ml', 'iu', 'vial', 'vials', 'box', 'pen', 'de', 'la', 'le', 'the', 'aqua', 'exp', 'date', 'expect', 'soon']);
const _PL_TIERS = ['300–500 €', '501–1500 €', '1500–3000 €', '3001–5000 €'];

function _plNorm(s) {
  return (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
function _plTokens(s) {
  return _plNorm(s).replace(/\d+([.,]\d+)?\s*(mg|ml|iu|mcg|tabs?|%)?/g, ' ').split(/[^a-z0-9]+/)
    .filter(t => t && !_PL_BRUIT.has(t)).map(t => _PL_ALIAS[t] || t);
}
function _plScore(ligne, p) {
  const a = new Set(_plTokens(ligne.nom)), b = new Set(_plTokens(p.nom));
  if (!a.size || !b.size) return 0;
  const inter = [...a].filter(t => b.has(t)).length;
  let score = inter / new Set([...a, ...b]).size;
  const marque = _plTokens(p.marque).filter(t => !['pharm', 'lab', 'life', 'science'].includes(t));
  const contexte = _plNorm(ligne.marque + ' ' + ligne.section);
  if (marque.some(t => contexte.includes(t))) score += 0.25;
  else if (marque.length && ligne.marque + ligne.section) score -= 0.1;
  return score;
}

// Lecture des lignes de produits : une ligne = au moins 4 cellules "NN €" (les 4 paliers de quantité).
function _plParse(pages) {
  const lignes = [];
  let section = '', enAttente = [];
  const bruit = /quan|order|product|dosage|brand|exhausted|whatsapp|telegram|price\s*list|produced|expect soon|^\W*$/i;
  pages.forEach(items => {
    const rows = {};
    items.forEach(i => { if (!i.s.trim()) return; const y = Math.round(i.y / 3); (rows[y] = rows[y] || []).push(i); });
    Object.keys(rows).map(Number).sort((a, b) => b - a).forEach(y => {
      const txt = rows[y].sort((a, b) => a.x - b.x).map(i => i.s.trim()).join(' | ').replace(/(\d)\s*\|\s*€/g, '$1 €');
      const cells = txt.split(' | ').map(c => c.trim()).filter(Boolean);
      const prix = cells.filter(c => /^\d+(?:[.,]\d+)?\s*€$/.test(c));
      if (prix.length >= 4) {
        const autres = cells.filter(c => !/^\d+(?:[.,]\d+)?\s*€$/.test(c));
        const reDose = /\d\s*(ml|mg|tabs?|tablets|iu|mcg|vials?|sachets?)/i;
        const dose = autres.filter(c => reDose.test(c));
        let nom = autres.filter(c => !reDose.test(c)).join(' ').trim();
        let marque = '';
        const m = dose.join(' ').match(/^([A-Za-z][A-Za-z\- ]*?)[\s\/-]*\d/);
        if (m) marque = m[1].replace(/[\/\- ]+$/, '').trim();
        if (!nom) nom = enAttente.join(' ').trim();
        else if (!marque && enAttente.length === 1 && /pharm/i.test(enAttente[0])) marque = enAttente[0];
        enAttente = [];
        if (nom) lignes.push({ nom: nom.replace(/\s+/g, ' '), dosage: dose.join(' '), marque, section, prix: prix.slice(-4).map(c => parseFloat(c.replace(',', '.'))) });
      } else if (/^(status\s*pharm|zphc|max\s*lab|zycare)/i.test(txt.replace(/[\s|(]+/g, ' ').trim())) {
        section = txt.replace(/[\s|]+/g, ' ').replace(/\s*-\s*un.*$/i, '').replace(/^\W+/, '').trim(); enAttente = [];
      } else if (/^[A-Z][A-Z\s]{20,}$/.test(txt.replace(/ \| /g, ' ').trim())) {
        section = ''; enAttente = [];
      } else if (!bruit.test(txt) && prix.length === 0 && cells.length <= 2) {
        enAttente.push(txt.replace(/ \| /g, ' '));
      }
    });
  });
  return lignes;
}

// Le texte du PDF perd certaines ligatures (« ti », « tt ») : on les remet, et on retire les mentions de péremption.
const _PL_CORR = [[/Retatru de/gi, 'Retatrutide'], [/Cu ng/gi, 'Cutting'], [/halotes n/gi, 'Halotestin'], [/Dos nex/gi, 'Dostinex'], [/\s*-\s*exp\.?\s*date.*$/i, '']];
function _plNomPropre(nom) {
  let n = nom;
  _PL_CORR.forEach(([re, rep]) => { n = n.replace(re, rep); });
  return n.replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
}
const _plTitre = s => (s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

let _plLignes = [], _plProduits = [];

function ouvrirImportPrix() {
  const palier = (() => { try { return localStorage.getItem('pl_palier') || '0'; } catch { return '0'; } })();
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">
    <h3>Mettre à jour les prix d'achat (liste fournisseur)</h3>
    <div class="field"><label>Palier de commande utilisé</label>
      <select id="pl-palier">${_PL_TIERS.map((t, i) => `<option value="${i}" ${String(i) === palier ? 'selected' : ''}>${t}</option>`).join('')}</select>
    </div>
    <div class="field"><label>Liste de prix (PDF)</label><input type="file" accept=".pdf" onchange="_plAnalyser(this.files[0])"></div>
    <div class="page-sub" id="pl-statut">Le fichier est lu dans ton navigateur, il n'est envoyé nulle part.</div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="this.closest('.modal-bg').remove()">Fermer</button></div>
  </div>`;
  document.body.appendChild(bg);
}

async function _plAnalyser(file) {
  if (!file) return;
  const statut = document.getElementById('pl-statut');
  statut.textContent = 'Lecture du PDF…';
  try {
    try { localStorage.setItem('pl_palier', document.getElementById('pl-palier').value); } catch { /* pas grave */ }
    await _rvChargerPdfJs();
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const tc = await (await doc.getPage(p)).getTextContent();
      pages.push(tc.items.map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5] })));
    }
    _plLignes = _plParse(pages);
    if (!_plLignes.length) { statut.textContent = 'Aucune ligne de prix reconnue dans ce PDF.'; return; }
    _plProduits = await sbSelect('compta_produits', 'select=*&order=nom.asc');
    _plAfficherRevue(parseInt(document.getElementById('pl-palier').value, 10) || 0);
  } catch (e) { statut.textContent = 'Erreur : ' + e.message; }
}

let _plPalier = 0;
function _plActuelHtml(l, p) {
  if (!p) return '';
  const diff = _plNorm(p.nom) !== _plNorm(_plNomPropre(l.nom));
  return `${diff ? `<span class="page-sub">${esc(p.nom)} →</span>` : ''} ${fmtEUR(Number(p.prix_achat || 0))}`;
}
// Choix manuel d'un produit : on affiche son prix actuel et on coche la ligne.
function _plChoix(i, id) {
  const p = _plProduits.find(x => x.id === id);
  document.getElementById('pl-act-' + i).innerHTML = id === '__new__' ? '<span class="badge badge-green">Nouveau produit</span>' : _plActuelHtml(_plLignes[i], p);
  const chk = document.querySelector(`.pl-chk[data-i="${i}"]`);
  if (chk) chk.checked = !!id;
  document.getElementById('pl-vente-' + i).value = p?.prix_vente ?? '';
  // Un produit rattaché à une ligne du PDF ne peut plus être supprimé comme « disparu ».
  const choisis = new Set([...document.querySelectorAll('.pl-sel')].map(x => x.value).filter(Boolean));
  document.querySelectorAll('.pl-del').forEach(c => {
    const pris = choisis.has(c.dataset.id);
    if (pris) c.checked = false;
    c.disabled = pris;
    c.closest('tr').style.opacity = pris ? '.4' : '';
  });
}

function _plAfficherRevue(palier) {
  _plPalier = palier;
  // Meilleur produit pour chaque ligne du PDF ; un produit n'est proposé qu'une fois (la meilleure ligne gagne).
  const propositions = _plLignes.map((l, i) => {
    let best = null, bs = 0;
    _plProduits.forEach(p => { const s = _plScore(l, p); if (s > bs) { bs = s; best = p; } });
    return { i, p: bs >= 0.5 ? best : null, s: bs };
  });
  const meilleurPar = {};
  propositions.forEach(pr => { if (pr.p && (!meilleurPar[pr.p.id] || pr.s > meilleurPar[pr.p.id].s)) meilleurPar[pr.p.id] = pr; });
  propositions.forEach(pr => { if (pr.p && meilleurPar[pr.p.id] !== pr) pr.p = null; });
  const trouves = new Set(propositions.filter(pr => pr.p).map(pr => pr.p.id));
  const options = sel => `<option value="">— Ignorer —</option><option value="__new__">+ Ajouter comme nouveau produit</option>` + _plProduits.map(p => `<option value="${p.id}" ${sel === p.id ? 'selected' : ''}>${esc(p.nom)}${p.marque ? ' · ' + esc(p.marque) : ''}</option>`).join('');

  const lignesHtml = propositions.map(pr => {
    const l = _plLignes[pr.i], nouveau = l.prix[palier];
    const ancien = pr.p ? Number(pr.p.prix_achat || 0) : null;
    const change = pr.p && Math.abs(nouveau - ancien) > 0.001;
    return `<tr>
      <td><input type="checkbox" class="pl-chk" data-i="${pr.i}" ${change || (pr.p && _plNorm(pr.p.nom) !== _plNorm(_plNomPropre(l.nom))) ? 'checked' : ''}></td>
      <td><b>${esc(_plNomPropre(l.nom))}</b><div class="page-sub">${esc(l.section)}${l.marque ? ' · ' + esc(l.marque) : ''} ${esc(l.dosage)}</div></td>
      <td><select class="pl-sel" data-i="${pr.i}" onchange="_plChoix(${pr.i}, this.value)" style="max-width:190px;background:var(--card2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:4px;">${options(pr.p?.id)}</select></td>
      <td id="pl-act-${pr.i}">${pr.p && _plNorm(pr.p.nom) !== _plNorm(_plNomPropre(l.nom)) ? `<span class="page-sub">${esc(pr.p.nom)} →</span>` : ''}${ancien === null ? '' : ' ' + fmtEUR(ancien)}</td>
      <td style="font-weight:700;color:${change ? (nouveau > ancien ? 'var(--red)' : 'var(--accent2)') : 'inherit'};">${fmtEUR(nouveau)}</td>
      <td><input type="number" step="0.01" class="pl-vente" id="pl-vente-${pr.i}" data-i="${pr.i}" value="${pr.p?.prix_vente ?? ''}" placeholder="inchangé" style="width:80px;background:var(--card2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:4px 6px;" oninput="document.querySelector('.pl-chk[data-i=&quot;${pr.i}&quot;]').checked = true"></td>
    </tr>`;
  }).join('');

  const absents = _plProduits.filter(p => !trouves.has(p.id));
  document.querySelector('.modal-bg')?.remove();
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" style="max-width:960px;width:96vw;max-height:90vh;overflow:auto;">
    <h3>Liste de prix — palier ${_PL_TIERS[palier]}</h3>
    <label style="display:flex;gap:8px;align-items:center;margin-bottom:10px;"><input type="checkbox" id="pl-renommer" checked> Remplacer aussi mes noms de produits par ceux du PDF</label>
    <div class="page-sub" style="margin-bottom:10px;">Coche les lignes à mettre à jour. Corrige la correspondance avec le menu si elle est fausse. Le prix de vente reste le tien : modifie-le dans la colonne si tu veux le changer en même temps.</div>
    <div class="table-wrap"><table>
      <thead><tr><th></th><th>Ligne du PDF</th><th>Produit chez toi</th><th>Achat actuel</th><th>Nouvel achat</th><th>Prix de vente</th></tr></thead>
      <tbody>${lignesHtml}</tbody>
    </table></div>
    <h3 style="margin-top:20px;">Chez toi mais plus dans la liste (${absents.length})</h3>
    ${absents.length ? `<div class="page-sub" style="margin-bottom:6px;">Aucune ligne du PDF ne correspond. Coche ceux à supprimer (vérifie qu'ils ne sont pas juste nommés autrement).</div>
    <div class="table-wrap"><table>
      <thead><tr><th></th><th>Produit</th><th>Marque</th><th>Stock</th></tr></thead>
      <tbody>${absents.map(p => `<tr><td><input type="checkbox" class="pl-del" data-id="${p.id}"></td><td><b>${esc(p.nom)}</b></td><td>${esc(p.marque) || '—'}</td><td>${p.stock_reel}${Number(p.stock_reel) > 0 ? ' <span class="badge badge-gold">en stock</span>' : ''}</td></tr>`).join('')}</tbody>
    </table></div>` : '<div class="page-sub">Tous tes produits sont dans la liste.</div>'}
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="this.closest('.modal-bg').remove()">Annuler</button>
      <button class="btn btn-primary" onclick="_plAppliquer(${palier})">Appliquer</button>
    </div>
  </div>`;
  document.body.appendChild(bg);
}

async function _plAppliquer(palier) {
  const maj = {}, nouveaux = [];
  document.querySelectorAll('.pl-chk:checked').forEach(c => {
    const i = c.dataset.i, id = document.querySelector(`.pl-sel[data-i="${i}"]`).value;
    if (id === '__new__') nouveaux.push({ ligne: _plLignes[i], prix: _plLignes[i].prix[palier], vente: parseFloat(document.getElementById('pl-vente-' + i).value) });
    else if (id) maj[id] = { prix: _plLignes[i].prix[palier], ligne: _plLignes[i], vente: parseFloat(document.getElementById('pl-vente-' + i).value) };
  });
  // Nouveaux noms : en cas de doublon (même produit chez plusieurs marques), on ajoute la marque.
  const renommer = document.getElementById('pl-renommer')?.checked;
  const pris = new Set(_plProduits.filter(p => !maj[p.id]).map(p => _plNorm(p.nom)));
  const noms = {};
  if (renommer) Object.entries(maj).forEach(([id, m]) => {
    let n = _plNomPropre(m.ligne.nom);
    if (pris.has(_plNorm(n))) n += ` (${_plTitre(m.ligne.section || m.ligne.marque)})`;
    if (pris.has(_plNorm(n))) n += ' ' + m.ligne.dosage.replace(/\s+/g, '');
    pris.add(_plNorm(n)); noms[id] = n;
  });
  const suppr = [...document.querySelectorAll('.pl-del:checked')].map(c => c.dataset.id);
  nouveaux.forEach(n => {
    let nom = _plNomPropre(n.ligne.nom);
    if (pris.has(_plNorm(nom))) nom += ` (${_plTitre(n.ligne.section || n.ligne.marque)})`;
    if (pris.has(_plNorm(nom))) nom += ' ' + n.ligne.dosage.replace(/\s+/g, '');
    pris.add(_plNorm(nom)); n.nom = nom;
  });
  if (!Object.keys(maj).length && !suppr.length && !nouveaux.length) { toast('Rien de coché', 'err'); return; }
  if (suppr.length && !confirm(`Supprimer ${suppr.length} produit(s) ? Les anciennes ventes et commandes gardent leur nom.`)) return;
  try {
    for (const [id, m] of Object.entries(maj)) {
      const p = _plProduits.find(x => x.id === id);
      const body = { prix_achat: m.prix };
      if (!isNaN(m.vente) && m.vente !== Number(p?.prix_vente)) body.prix_vente = m.vente;
      if (noms[id] && p && noms[id] !== p.nom) {
        body.nom = noms[id];
        // Les commandes/ventes retrouvent parfois le produit par son nom : on les aligne.
        for (const t of ['compta_commandes_clients', 'compta_commandes_fournisseur', 'compta_ventes']) {
          const r = await authFetch(`${SUPABASE_URL}/rest/v1/${t}?produit_nom=eq.${encodeURIComponent(p.nom)}`, { method: 'PATCH', headers: supaHeaders(), body: JSON.stringify({ produit_nom: noms[id] }) });
          if (!r.ok) throw new Error(await r.text());
        }
      }
      await sbUpdate('compta_produits', id, body);
    }
    for (const n of nouveaux) {
      const body = { nom: n.nom, marque: _plTitre(n.ligne.section) || n.ligne.marque || null, prix_achat: n.prix, stock_reel: 0 };
      if (!isNaN(n.vente)) body.prix_vente = n.vente;
      await sbInsert('compta_produits', body);
    }
    for (const id of suppr) await sbDelete('compta_produits', id);
    document.querySelector('.modal-bg')?.remove();
    toast(`${Object.keys(maj).length} produit(s) mis à jour, ${nouveaux.length} ajouté(s), ${suppr.length} produit(s) supprimé(s)`, 'ok');
    await renderChimie();
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
}
