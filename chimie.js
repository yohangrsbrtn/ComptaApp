let _chData = [];

async function renderChimie() {
  _chData = await sbSelect('compta_chimie', 'select=*&order=date.desc&limit=500');
  const totalAchat = _chData.reduce((s, c) => s + (Number(c.prix_achat_unitaire || 0) * Number(c.quantite || 0)), 0);
  const totalVente = _chData.reduce((s, c) => s + (Number(c.prix_vente_unitaire || 0) * Number(c.quantite || 0)), 0);
  const benef = totalVente - totalAchat;

  document.getElementById('root').innerHTML = shell(`
    <div class="topbar">
      <div><div class="page-title">Chimie</div><div class="page-sub">${_chData.length} vente(s)</div></div>
      <button class="btn btn-primary" onclick="openChimieModal()">+ Vente</button>
    </div>
    <div class="grid cards4" style="margin-bottom:18px;">
      <div class="card kpi"><div class="label">Total achat</div><div class="value">${fmtEUR(totalAchat)}</div></div>
      <div class="card kpi"><div class="label">Total vente</div><div class="value pos">${fmtEUR(totalVente)}</div></div>
      <div class="card kpi"><div class="label">Bénéfice</div><div class="value pos">${fmtEUR(benef)}</div></div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Client</th><th>Produit</th><th>Marque</th><th>Qté</th><th>Achat</th><th>Vente</th><th>Bénéfice</th><th></th></tr></thead>
        <tbody>
          ${_chData.length ? _chData.map(c => { const ben = (c.prix_vente_unitaire - c.prix_achat_unitaire) * c.quantite; return `
            <tr>
              <td>${fmtDate(c.date)}</td>
              <td>${esc(c.client) || '—'}</td>
              <td>${esc(c.produit)}</td>
              <td>${esc(c.marque) || '—'}</td>
              <td>${c.quantite}</td>
              <td>${fmtEUR(c.prix_achat_unitaire * c.quantite)}</td>
              <td>${fmtEUR(c.prix_vente_unitaire * c.quantite)}</td>
              <td class="${ben>=0?'':'neg'}" style="color:${ben>=0?'var(--accent2)':'var(--red)'}">${fmtEUR(ben)}</td>
              <td><button class="btn btn-ghost btn-sm" onclick="deleteChimie('${c.id}')">Suppr.</button></td>
            </tr>`; }).join('') : `<tr><td colspan="9"><div class="empty">Aucune vente</div></td></tr>`}
        </tbody>
      </table>
    </div>
  `);
}

function openChimieModal() {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">
    <h3>Nouvelle vente — Chimie</h3>
    <div class="row2">
      <div class="field"><label>Date</label><input id="ch-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
      <div class="field"><label>Client</label><input id="ch-client"></div>
    </div>
    <div class="row2">
      <div class="field"><label>Produit</label><input id="ch-produit"></div>
      <div class="field"><label>Marque</label><input id="ch-marque"></div>
    </div>
    <div class="row3">
      <div class="field"><label>Quantité</label><input id="ch-qte" type="number" value="1"></div>
      <div class="field"><label>Prix achat unit.</label><input id="ch-achat" type="number" step="0.01" value="0"></div>
      <div class="field"><label>Prix vente unit.</label><input id="ch-vente" type="number" step="0.01" value="0"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="this.closest('.modal-bg').remove()">Annuler</button>
      <button class="btn btn-primary" onclick="saveChimie()">Enregistrer</button>
    </div>
  </div>`;
  bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
}

async function saveChimie() {
  const body = {
    date: document.getElementById('ch-date').value,
    client: document.getElementById('ch-client').value.trim() || null,
    produit: document.getElementById('ch-produit').value.trim(),
    marque: document.getElementById('ch-marque').value.trim() || null,
    quantite: parseFloat(document.getElementById('ch-qte').value) || 1,
    prix_achat_unitaire: parseFloat(document.getElementById('ch-achat').value) || 0,
    prix_vente_unitaire: parseFloat(document.getElementById('ch-vente').value) || 0,
  };
  if (!body.produit) { toast('Produit requis', 'err'); return; }
  try {
    await sbInsert('compta_chimie', body);
    document.querySelector('.modal-bg')?.remove();
    toast('Vente enregistrée', 'ok');
    await renderChimie();
  } catch (e) { toast('Erreur : ' + e.message, 'err'); }
}

async function deleteChimie(id) {
  if (!confirm('Supprimer cette vente ?')) return;
  try { await sbDelete('compta_chimie', id); await renderChimie(); toast('Supprimé', 'ok'); }
  catch (e) { toast('Erreur : ' + e.message, 'err'); }
}
