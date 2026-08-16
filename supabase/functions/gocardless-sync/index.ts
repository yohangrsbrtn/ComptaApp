// Récupère les paiements confirmés/payés depuis GoCardless et les met en file
// d'attente de rapprochement (compta_gocardless_transactions) — jamais d'écriture
// directe dans compta_paiements, le coach valide/rattache chaque ligne dans l'app.
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

Deno.serve(async () => {
  try {
    let url = '/payments?limit=200&status=confirmed';
    const tousLesPaiements: any[] = [];

    // On récupère confirmed + paid_out (les deux états "argent effectivement reçu")
    for (const statut of ['confirmed', 'paid_out']) {
      let after: string | null = null;
      do {
        const qs = new URLSearchParams({ limit: '200', status: statut });
        if (after) qs.set('after', after);
        const data = await gcFetch(`/payments?${qs.toString()}`);
        tousLesPaiements.push(...data.payments);
        after = data.meta?.cursors?.after ?? null;
      } while (after);
    }

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
      await supabase.from('compta_gocardless_transactions').insert({
        gc_payment_id: p.id,
        montant: p.amount / 100,
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
