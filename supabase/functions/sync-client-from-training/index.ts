// Reçoit un client créé/modifié côté AppTrainingDatabase et le répercute dans
// compta_clients — identité (prénom/nom/statut) toujours, plus jour de paiement /
// mode / banque quand la fiche facturation d'AppTrainingDatabase les fournit (ils
// restent alors la source de vérité pour ces 3 champs précis ; tarif et adresse
// restent propres à Compta et ne sont jamais écrasés par cette synchro).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SHARED_SECRET = Deno.env.get('SYNC_SHARED_SECRET')!;

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// AppTrainingDatabase : 'actif' | 'pause' | 'ancien'. ComptaApp : 'actif' | 'ancien' seulement
// (pas de notion de "pause" côté facturation) — une pause reste "actif" pour la compta.
function mapStatut(statutTraining: string | undefined): 'actif' | 'ancien' {
  return statutTraining === 'ancien' ? 'ancien' : 'actif';
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-secret',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.headers.get('x-sync-secret') !== SHARED_SECRET) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401, headers: corsHeaders });
  }
  try {
    const { client_id, prenom, nom, statut, jour_paiement, mode_paiement, moy_paiement, date_fin } = await req.json();
    if (!client_id || !nom) {
      return new Response(JSON.stringify({ ok: false, error: 'client_id et nom requis' }), { status: 400, headers: corsHeaders });
    }

    // N'écrase que les champs facturation explicitement transmis (fiche sauvegardée
    // côté AppTrainingDatabase) — un appel de simple changement de statut n'inclut
    // pas ces clés et ne doit surtout pas réinitialiser une valeur déjà saisie.
    const champsFacturation: Record<string, unknown> = {};
    if (jour_paiement !== undefined) champsFacturation.jour_paiement = jour_paiement;
    if (mode_paiement !== undefined) champsFacturation.mode_paiement = mode_paiement;
    if (moy_paiement !== undefined) champsFacturation.moy_paiement = moy_paiement;
    if (date_fin !== undefined) champsFacturation.date_fin = date_fin;

    const { data: existant } = await supabase
      .from('compta_clients')
      .select('id')
      .eq('apptraining_client_id', client_id)
      .maybeSingle();

    if (existant) {
      await supabase.from('compta_clients').update({
        prenom: prenom || '', nom, statut: mapStatut(statut), ...champsFacturation,
      }).eq('id', existant.id);
      return new Response(JSON.stringify({ ok: true, action: 'updated', id: existant.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: cree, error } = await supabase.from('compta_clients').insert({
      apptraining_client_id: client_id, prenom: prenom || '', nom, statut: mapStatut(statut), ...champsFacturation,
    }).select('id').single();
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, action: 'created', id: cree.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
