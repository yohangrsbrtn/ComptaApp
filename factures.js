const COACH_INFO = {
  nom: 'Yohan Grosbertin',
  adresse1: '18 rue bir hakeim Apt. 37',
  adresse2: '33700 Mérignac',
  tel: '0673596195',
  siret: 'SIRET : 80455574600010',
  tva: 'TVA non applicable, art. L. 223 et s. du code des impositions sur les biens et services (CIBS)',
};

let _facMois = moisActuel();
let _facAll = [];

async function renderFactures() {
  _facAll = await sbSelect('compta_factures', 'select=*&annee=eq.2026&order=numero.desc');
  const list = _facAll.filter(f => f.mois === _facMois);
  const total = list.reduce((s, f) => s + Number(f.montant_total || 0), 0);

  document.getElementById('root').innerHTML = shell(`
    <div class="topbar">
      <div><div class="page-title">Factures</div><div class="page-sub">${_facAll.length} facture(s) en 2026</div></div>
      <button class="btn btn-primary" onclick="openGenerationFactures()">+ Générer des factures</button>
    </div>
    <div class="toolbar">
      <select onchange="_facMois=this.value;renderFactures()" style="background:var(--card2);color:var(--text);border:1px solid var(--border);padding:9px 12px;border-radius:10px;">
        ${MOIS.map(m => `<option value="${m}" ${m===_facMois?'selected':''}>${m}</option>`).join('')}
      </select>
      <div class="page-sub">Total ${_facMois} : <b style="color:var(--accent2)">${fmtEUR(total)}</b></div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>N°</th><th>Client</th><th>Date</th><th>Montant</th><th></th></tr></thead>
        <tbody>
          ${list.length ? list.map(f => `
            <tr>
              <td><b>${esc(f.numero)}</b></td>
              <td>${esc(f.nom_client)}</td>
              <td>${fmtDate(f.date_envoi)}</td>
              <td>${fmtEUR(f.montant_total)}</td>
              <td><button class="btn btn-ghost btn-sm" onclick="downloadFacture('${f.id}')">Télécharger PDF</button></td>
            </tr>`).join('') : `<tr><td colspan="5"><div class="empty">Aucune facture pour ${_facMois}</div></td></tr>`}
        </tbody>
      </table>
    </div>
  `);
}

async function downloadFacture(id) {
  const f = _facAll.find(x => x.id === id);
  if (!f || !f.pdf_path) { toast('PDF introuvable', 'err'); return; }
  const win = window.open('', '_blank');
  try {
    const url = await sbSignedUrl('factures', f.pdf_path);
    if (win) win.location.href = url; else window.open(url, '_blank');
  } catch (e) { win?.close(); toast('Erreur : ' + e.message, 'err'); }
}

async function openGenerationFactures() {
  await loadClients();
  const mois = _facMois || _paMois || moisActuel();
  const paiements = await sbSelect('compta_paiements', `mois=eq.${encodeURIComponent(mois)}&annee=eq.2026`);
  const rows = paiements.filter(p => Number(p.mt_suivi || 0) > 0 || Number(p.mt_seance || 0) > 0);

  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" style="max-width:640px;">
    <h3>Générer les factures</h3>
    <div class="row2">
      <div class="field"><label>Mois</label>
        <select id="gf-mois" onchange="_gfReload()">${MOIS.map(m => `<option value="${m}" ${m===mois?'selected':''}>${m}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Date d'envoi</label><input id="gf-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
    </div>
    <div id="gf-list" style="max-height:340px;overflow-y:auto;border:1px solid var(--border);border-radius:12px;padding:10px;margin-bottom:14px;">
      ${rows.length ? rows.map(p => `
        <div class="checkbox-row" style="justify-content:space-between;padding:8px 4px;border-bottom:1px solid rgba(255,255,255,.05);">
          <label style="display:flex;align-items:center;gap:8px;flex:1;">
            <input type="checkbox" class="gf-sel" data-nom="${esc(p.nom_client)}" data-suivi="${p.mt_suivi||0}" data-seance="${p.mt_seance||0}" data-clientid="${p.client_id||''}" checked>
            <b>${esc(p.nom_client)}</b>
          </label>
          <span class="page-sub">${p.mt_suivi ? 'Suivi ' + fmtEUR(p.mt_suivi) : ''} ${p.mt_seance ? 'Séance ' + fmtEUR(p.mt_seance) : ''}</span>
        </div>`).join('') : `<div class="empty">Aucun encaissement pour ${mois}</div>`}
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="this.closest('.modal-bg').remove()">Annuler</button>
      <button class="btn btn-primary" id="gf-go" onclick="lancerGenerationFactures()">Générer</button>
    </div>
  </div>`;
  bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
}

async function _gfReload() {
  const mois = document.getElementById('gf-mois').value;
  const paiements = await sbSelect('compta_paiements', `mois=eq.${encodeURIComponent(mois)}&annee=eq.2026`);
  const rows = paiements.filter(p => Number(p.mt_suivi || 0) > 0 || Number(p.mt_seance || 0) > 0);
  document.getElementById('gf-list').innerHTML = rows.length ? rows.map(p => `
    <div class="checkbox-row" style="justify-content:space-between;padding:8px 4px;border-bottom:1px solid rgba(255,255,255,.05);">
      <label style="display:flex;align-items:center;gap:8px;flex:1;">
        <input type="checkbox" class="gf-sel" data-nom="${esc(p.nom_client)}" data-suivi="${p.mt_suivi||0}" data-seance="${p.mt_seance||0}" data-clientid="${p.client_id||''}" checked>
        <b>${esc(p.nom_client)}</b>
      </label>
      <span class="page-sub">${p.mt_suivi ? 'Suivi ' + fmtEUR(p.mt_suivi) : ''} ${p.mt_seance ? 'Séance ' + fmtEUR(p.mt_seance) : ''}</span>
    </div>`).join('') : `<div class="empty">Aucun encaissement pour ${mois}</div>`;
}

function _construireModePaiement(client) {
  const mode = (client?.mode_paiement || '').toUpperCase();
  const banque = (client?.moy_paiement || '').toUpperCase();
  if (mode.includes('ESP')) return 'Paiement par espèces';
  if (banque.includes('GOCARDLESS') || mode.includes('GOCARDLESS')) return 'Paiement par mandat SEPA via GoCardless';
  if (client?.moy_paiement) return `Paiement par virement via ${client.moy_paiement}`;
  return 'Paiement par virement';
}

function _trouverClientLocal(nomComplet) {
  const up = nomComplet.toUpperCase();
  return S.clients.find(c => up.includes((c.nom || '').toUpperCase()) && (c.nom || '')) ||
         S.clients.find(c => up.includes((c.nom || '').toUpperCase()));
}

async function lancerGenerationFactures() {
  const mois = document.getElementById('gf-mois').value;
  const dateEnvoi = document.getElementById('gf-date').value;
  const moisNum = MOIS_NUM[mois.toUpperCase()] || '01';
  const selected = [...document.querySelectorAll('.gf-sel:checked')].map(el => ({
    nom: el.dataset.nom, suivi: parseFloat(el.dataset.suivi) || 0, seance: parseFloat(el.dataset.seance) || 0, clientId: el.dataset.clientid || null,
  }));
  if (!selected.length) { toast('Aucun client sélectionné', 'err'); return; }

  const btn = document.getElementById('gf-go');
  btn.disabled = true; btn.textContent = 'Génération…';

  try {
    const existantes = await sbSelect('compta_factures', `numero=like.FAC-2026-${moisNum}*`);
    let numCourant = existantes.reduce((max, f) => {
      const m = f.numero.match(new RegExp(`FAC-2026-${moisNum}(\\d+)`));
      return m ? Math.max(max, parseInt(m[1])) : max;
    }, 0);

    let compteur = 0;
    for (const sel of selected) {
      if (!sel.suivi && !sel.seance) continue;
      const client = sel.clientId ? S.clients.find(c => c.id === sel.clientId) : _trouverClientLocal(sel.nom);
      numCourant++;
      const numero = `FAC-2026-${moisNum}${String(numCourant).padStart(2, '0')}`;
      const lignes = [];
      if (sel.suivi) lignes.push({ description: 'Prestation de services - Suivi mensuel coaching', qte: 1, prix_unitaire: sel.suivi, prix_total: sel.suivi });
      if (sel.seance) lignes.push({ description: 'Prestation de services - Séances en présentiel', qte: 1, prix_unitaire: sel.seance, prix_total: sel.seance });
      const montantTotal = sel.suivi + sel.seance;
      const modePaiement = _construireModePaiement(client);
      const dateEcheance = new Date(dateEnvoi + 'T12:00:00');
      dateEcheance.setDate(dateEcheance.getDate() + 14);

      const pdfBlob = _genererPdfFacture({
        numero, nomClient: client ? `${client.prenom} ${client.nom}` : sel.nom,
        adresse: client?.adresse || '', dateEnvoi, dateEcheance, modePaiement, lignes, montantTotal,
      });

      const path = `${numero}_${(client ? client.nom : sel.nom).replace(/\s+/g, '_')}.pdf`;
      await sbUpload('factures', path, pdfBlob);

      await sbInsert('compta_factures', {
        numero, client_id: client?.id || null, nom_client: client ? `${client.prenom} ${client.nom}` : sel.nom,
        adresse: client?.adresse || null, mois, annee: 2026, date_envoi: dateEnvoi, date_echeance: dateEcheance.toISOString().slice(0,10),
        mode_paiement: modePaiement, lignes, montant_total: montantTotal, pdf_path: path,
      });
      compteur++;
    }

    document.querySelector('.modal-bg')?.remove();
    toast(`${compteur} facture(s) générée(s)`, 'ok');
    _facMois = mois;
    await renderFactures();
  } catch (e) {
    toast('Erreur : ' + e.message, 'err');
    btn.disabled = false; btn.textContent = 'Générer';
  }
}

function _genererPdfFacture(d) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const fmt = n => (Number(n) || 0).toFixed(2) + ' €';
  const fmtD = s => new Date(s).toLocaleDateString('fr-FR');

  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(COACH_INFO.nom, 20, 22);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(COACH_INFO.adresse1, 20, 28);
  doc.text(COACH_INFO.adresse2, 20, 33);
  doc.text(COACH_INFO.tel, 20, 38);
  doc.text(COACH_INFO.siret, 20, 43);
  doc.setFontSize(8);
  doc.text(doc.splitTextToSize(COACH_INFO.tva, 90), 20, 48);

  doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text('Facture', 190, 22, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(`Envoyée le ${fmtD(d.dateEnvoi)}`, 190, 29, { align: 'right' });
  doc.text('N° de facture', 190, 38, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.text(d.numero, 190, 44, { align: 'right' });

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text('Facturée à', 20, 62);
  doc.text("Date d'échéance", 140, 62);
  doc.setFont('helvetica', 'normal');
  doc.text(d.nomClient, 20, 68);
  const adrLines = (d.adresse || '').split(',').map(s => s.trim()).filter(Boolean);
  adrLines.forEach((l, i) => doc.text(l, 20, 73 + i * 5));
  doc.text(fmtD(d.dateEcheance), 140, 68);

  doc.setFont('helvetica', 'bold');
  doc.text('Mode de paiement', 20, 92);
  doc.setFont('helvetica', 'normal');
  doc.text(d.modePaiement, 20, 98);

  let y = 112;
  doc.setDrawColor(210); doc.line(20, y - 4, 190, y - 4);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text('Description', 20, y);
  doc.text('Qté', 135, y, { align: 'right' });
  doc.text('Prix unitaire', 165, y, { align: 'right' });
  doc.text('Prix total', 190, y, { align: 'right' });
  doc.line(20, y + 3, 190, y + 3);

  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  y += 10;
  d.lignes.forEach(l => {
    doc.text(l.description, 20, y);
    doc.text(String(l.qte), 135, y, { align: 'right' });
    doc.text(fmt(l.prix_unitaire), 165, y, { align: 'right' });
    doc.text(fmt(l.prix_total), 190, y, { align: 'right' });
    y += 8;
  });

  y += 4; doc.line(120, y, 190, y); y += 7;
  doc.text('Sous-total', 165, y, { align: 'right' });
  doc.text(fmt(d.montantTotal), 190, y, { align: 'right' });
  y += 9;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text('Total', 165, y, { align: 'right' });
  doc.text(fmt(d.montantTotal), 190, y, { align: 'right' });

  return doc.output('blob');
}
