// Récupère les paiements payés (paid_out) depuis GoCardless et les met en file
// d'attente de rapprochement (compta_gocardless_transactions) — jamais d'écriture
// directe dans compta_paiements, le coach valide/rattache chaque ligne dans l'app.
//
// Montant importé = NET de la commission GoCardless (le coach veut voir directement
// ce qu'il encaisse réellement par client, pas le brut avec la commission à part).
// On attend le statut "paid_out" (pas "confirmed") car la commission exacte n'est
// connue qu'une fois le virement effectué (payout_items), pas au moment du prélèvement.
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

// Récupère (et met en cache) la commission exacte prélevée pour chaque paiement
// d'un virement (payout) donné — évite de refaire l'appel pour chaque paiement
// d'un même virement groupé.
async function feesDuPayout(payoutId: string): Promise<Map<string, number>> {
  if (payoutFeesCache.has(payoutId)) return payoutFeesCache.get(payoutId)!;
  const fees = new Map<string, number>();
  try {
    let after: string | null = null;
    do {
      const qs = new URLSearchParams({ payout: payoutId, limit: '500' });
      if (after) qs.set('after', after);
      const data = await gcFetch(`/payout_items?${qs.toString()}`);
      for (const item of data.payout_items) {
        if (item.type === 'gocardless_fee' && item.links?.payment) {
          fees.set(item.links.payment, (fees.get(item.links.payment) || 0) + Math.round(parseFloat(item.amount)));
        }
      }
      after = data.meta?.cursors?.after ?? null;
    } while (after);
  } catch {
    // pas grave : on retombera sur le montant brut pour ce paiement
  }
  payoutFeesCache.set(payoutId, fees);
  return fees;
}

Deno.serve(async () => {
  try {
    const tousLesPaiements: any[] = [];
    let after: string | null = null;
    do {
      const qs = new URLSearchParams({ limit: '200', status: 'paid_out' });
      if (after) qs.set('after', after);
      const data = await gcFetch(`/payments?${qs.toString()}`);
      tousLesPaiements.push(...data.payments);
      after = data.meta?.cursors?.after ?? null;
    } while (after);

    let nouveaux = 0;
    for (const p of tousLesPaiements) {
      const { data: existant } = await supabase
        .from('compta_gocardless_transactions')
        .select('id')
        .eq('gc_payment_id', p.id)
        .maybeSingle();
      if (existant) continue;

      const customerId = await customerIdViaMandate(p.links?.mandate);
      const nom = await nomClient(customerId);

      let montantCentimes = p.amount;
      if (p.links?.payout) {
        const fees = await feesDuPayout(p.links.payout);
        const feeCentimes = fees.get(p.id); // négatif
        if (feeCentimes) montantCentimes = p.amount + feeCentimes;
      }

      await supabase.from('compta_gocardless_transactions').insert({
        gc_payment_id: p.id,
        montant: montantCentimes / 100,
        devise: p.currency,
        statut: p.status,
        charge_date: p.charge_date,
        description: p.description || null,
        gc_customer_id: customerId,
        nom_client_gc: nom,
      });
      nouveaux++;
    }

    return new Response(JSON.stringify({ ok: true, total: tousLesPaiements.length, nouveaux }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
