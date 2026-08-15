let _adData = [];

async function renderAddict() {
  _adData = await sbSelect('compta_addict', 'select=*&order=date.desc&limit=500');
  const totalAchat = _adData.reduce((s, c) => s + Number(c.achat || 0), 0);
  const totalVente = _adData.reduce((s, c) => s + Number(c.vente || 0), 0);
  const benef = totalVente - totalAchat;

  document.getElementById('root').innerHTML = shell(`
    <div class="topbar">
      <div><div class="page-title">Addict Nutrition</div><div class="page-sub">${_adData.length} vente(s)</div></div>
      <button class="btn btn-primary" onclick="openAddictModal()">+ Vente</button>
    </div>
    <div class="grid cards4" style="margin-bottom:18px;">
      <div class="card kpi"><div class="label">Total achat</div><div class="value">${fmtEUR(totalAchat)}</div></div>
      <div class="card kpi"><div class="label">Total vente</div><div class="value pos">${fmtEUR(totalVente)}</div></div>
      <div class="card kpi"><div class="label">Bénéfice</div><div class="value pos">${fmtEUR(benef)}</div></div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Client</th><th>Produit</th><th>Qté</th><th>Achat</th><th>Vente</th><th>Bénéfice</th><th></th></tr></thead>
        <tbody>
          ${_adData.length ? _adData.map(c => { const ben = c.vente - c.achat; return `
            <tr>
              <td>${fmtDate(c.date)}</td>
              <td>${esc(c.client) || '—'}</td>
              <td>${esc(c.produit)}</td>
              <td>${c.quantite}</td>
              <td>${fmtEUR(c.achat)}</td>
              <td>${fmtEUR(c.vente)}</td>
              <td style="color:${ben>=0?'var(--accent2)':'var(--red)'}">${fmtEUR(ben)}</td>
              <td><button class="btn btn-ghost btn-sm" onclick="deleteAddict('${c.id}')">Suppr.</button></td>
            </tr>`; }).join('') : `<tr><td colspan="8"><div class="empty">Aucune vente</div></td></tr>`}
        </tbody>
      </table>
    </div>
  `);
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
