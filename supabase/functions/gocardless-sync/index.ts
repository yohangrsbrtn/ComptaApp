// Récupère les VIREMENTS réellement arrivés sur le compte bancaire (payouts
// status=paid — pas juste payment status=paid_out, qui peut être atteint avant
// que l'argent soit effectivement là) et met en file d'attente de rapprochement
// (compta_gocardless_transactions) — jamais d'écriture directe dans compta_paiements,
// c'est paiements.js qui rapproche/importe ensuite.
//
// Montant importé = NET de la commission GoCardless (le coach veut voir directement
// ce qu'il encaisse réellement par client, pas le brut avec la commission à part).
// La date retenue (date_versement) est celle du virement (payout.arrival_date),
// pas la date de prélèvement chez le client (charge_date) — c'est cette date de
// versement qui doit apparaître et compter dans les paiements clients.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GC_TOKEN = Deno.env.get('GOCARDLESS_ACCESS_TOKEN')!;
const GC_BASE = 'https://api.gocardless.com';
const GC_VERSION = '2015-07-06';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

async function gcFetch(path: string) {
  const res = await fetch(`${GC_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${GC_TOKEN}`,
      'GoCardless-Version': GC_VERSION,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`GoCardless ${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

const mandateCustomerCache = new Map<string, string>();
const customerNameCache = new Map<string, string>();
const payoutFeesCache = new Map<string, Map<string, number>>(); // payoutId -> (paymentId -> fee en centimes, négatif)

// Le paiement ne lie que le mandat (links.mandate) — le client s'obtient en deux
// sauts : mandat -> customer_id, puis customer_id -> nom.
async function customerIdViaMandate(mandateId: string | undefined): Promise<string | null> {
  if (!mandateId) return null;
  if (mandateCustomerCache.has(mandateId)) return mandateCustomerCache.get(mandateId)!;
  try {
    const data = await gcFetch(`/mandates/${mandateId}`);
    const cid = data.mandates?.links?.customer ?? null;
    if (cid) mandateCustomerCache.set(mandateId, cid);
    return cid;
  } catch {
    return null;
  }
}

async function nomClient(customerId: string | null): Promise<string | null> {
  if (!customerId) return null;
  if (customerNameCache.has(customerId)) return customerNameCache.get(customerId)!;
  try {
    const data = await gcFetch(`/customers/${customerId}`);
    const c = data.customers;
    const nom = [c.given_name, c.family_name].filter(Boolean).join(' ') || c.company_name || null;
    if (nom) customerNameCache.set(customerId, nom);
    return nom;
  } catch {
    return null;
  }
}

// Pour un virement (payout) donné : le montant brut de chaque paiement inclus
// (type "payment") et la commission GoCardless exacte prélevée dessus (type
// "gocardless_fee", en centimes négatifs). Tout vient de payout_items — pas
// besoin de re-questionner /payments pour le montant, seulement pour les
// métadonnées (client, description).
async function itemsDuPayout(payoutId: string): Promise<{ montants: Map<string, number>; fees: Map<string, number> }> {
  const montants = new Map<string, number>();
  const fees = new Map<string, number>();
  let after: string | null = null;
  do {
    const qs = new URLSearchParams({ payout: payoutId, limit: '500' });
    if (after) qs.set('after', after);
    const data = await gcFetch(`/payout_items?${qs.toString()}`);
    for (const item of data.payout_items) {
      if (!item.links?.payment) continue;
      if (item.type === 'payment_paid_out') {
        montants.set(item.links.payment, (montants.get(item.links.payment) || 0) + Math.round(parseFloat(item.amount)));
      } else if (item.type === 'gocardless_fee') {
        fees.set(item.links.payment, (fees.get(item.links.payment) || 0) + Math.round(parseFloat(item.amount)));
      }
    }
    after = data.meta?.cursors?.after ?? null;
  } while (after);
  return { montants, fees };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Prévisionnel : chaque abonnement GoCardless actif porte ses 10 prochaines
// échéances (upcoming_payments, déjà fournies par l'API — aucun calcul à refaire).
// Regroupées par mois, avec le client résolu via son mandat, pour fusionner ensuite
// côté app avec le prévisionnel des clients virement/espèces (paiements.js).
async function previsionGoCardless(): Promise<Record<string, { total: number; lignes: { nom: string; montant: number }[] }>> {
  const parMois: Record<string, { total: number; lignes: { nom: string; montant: number }[] }> = {};
  let after: string | null = null;
  do {
    const qs = new URLSearchParams({ limit: '100', status: 'active' });
    if (after) qs.set('after', after);
    const data = await gcFetch(`/subscriptions?${qs.toString()}`);
    for (const sub of data.subscriptions) {
      if (!sub.upcoming_payments?.length) continue;
      const customerId = await customerIdViaMandate(sub.links?.mandate);
      const nom = (await nomClient(customerId)) || sub.name || 'Client GoCardless';
      for (const up of sub.upcoming_payments) {
        const moisKey = up.charge_date.slice(0, 7); // YYYY-MM
        const entry = parMois[moisKey] = parMois[moisKey] || { total: 0, lignes: [] };
        const montant = up.amount / 100;
        entry.total += montant;
        entry.lignes.push({ nom, montant });
      }
    }
    after = data.meta?.cursors?.after ?? null;
  } while (after);

  // Prélèvements individuels programmés (paiement en plusieurs fois créé d'un coup,
  // sans passer par un abonnement) : pas encore soumis à la banque du client, donc
  // absents de tout ce qui précède, mais bien réels et à échéance connue. On exclut
  // ceux rattachés à un abonnement (links.subscription) pour ne jamais les compter
  // deux fois avec les upcoming_payments déjà agrégés ci-dessus.
  for (const statut of ['pending_customer_approval', 'pending_submission', 'submitted', 'confirmed']) {
    let afterP: string | null = null;
    do {
      const qs = new URLSearchParams({ limit: '100', status: statut });
      if (afterP) qs.set('after', afterP);
      const data = await gcFetch(`/payments?${qs.toString()}`);
      for (const p of data.payments) {
        if (p.links?.subscription) continue;
        const customerId = await customerIdViaMandate(p.links?.mandate);
        const nom = (await nomClient(customerId)) || 'Client GoCardless';
        const moisKey = p.charge_date.slice(0, 7);
        const entry = parMois[moisKey] = parMois[moisKey] || { total: 0, lignes: [] };
        entry.total += p.amount / 100;
        entry.lignes.push({ nom, montant: p.amount / 100 });
      }
      afterP = data.meta?.cursors?.after ?? null;
    } while (afterP);
  }

  return parMois;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const url = new URL(req.url);
  if (url.searchParams.get('forecast') === '1') {
    try {
      const prevision = await previsionGoCardless();
      return new Response(JSON.stringify({ ok: true, prevision }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: corsHeaders });
    }
  }
  try {
    const tousLesPayouts: any[] = [];
    let afterPayout: string | null = null;
    do {
      const qs = new URLSearchParams({ limit: '200', status: 'paid' });
      if (afterPayout) qs.set('after', afterPayout);
      const data = await gcFetch(`/payouts?${qs.toString()}`);
      tousLesPayouts.push(...data.payouts);
      afterPayout = data.meta?.cursors?.after ?? null;
    } while (afterPayout);

    let nouveaux = 0;
    let totalPaiements = 0;
    for (const payout of tousLesPayouts) {
      let montants: Map<string, number>, fees: Map<string, number>;
      try {
        ({ montants, fees } = await itemsDuPayout(payout.id));
      } catch {
        continue; // virement archivé ou inaccessible : on l'ignore plutôt que de tout stopper
      }
      for (const [paymentId, montantBrut] of montants) {
        totalPaiements++;
        const { data: existant } = await supabase
          .from('compta_gocardless_transactions')
          .select('id')
          .eq('gc_payment_id', paymentId)
          .maybeSingle();
        if (existant) continue;

        const p = (await gcFetch(`/payments/${paymentId}`)).payments;
        const customerId = await customerIdViaMandate(p.links?.mandate);
        const nom = await nomClient(customerId);
        const feeCentimes = fees.get(paymentId) || 0; // négatif
        const montantCentimes = montantBrut + feeCentimes;

        await supabase.from('compta_gocardless_transactions').insert({
          gc_payment_id: paymentId,
          montant: montantCentimes / 100,
          devise: p.currency,
          statut: p.status,
          charge_date: p.charge_date,
          date_versement: payout.arrival_date,
          payout_id: payout.id,
          description: p.description || null,
          gc_customer_id: customerId,
          nom_client_gc: nom,
        });
        nouveaux++;
      }
    }

    return new Response(JSON.stringify({ ok: true, total: totalPaiements, nouveaux }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
