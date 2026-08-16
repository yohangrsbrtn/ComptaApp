// Reçoit un client créé/modifié côté AppTrainingDatabase et le répercute dans
// compta_clients — identité (prénom/nom/statut) seulement, jamais les champs
// de facturation (tarif, mode de paiement, adresse...) qui restent propres à Compta.
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

Deno.serve(async (req) => {
  if (req.headers.get('x-sync-secret') !== SHARED_SECRET) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401 });
  }
  try {
    const { client_id, prenom, nom, statut } = await req.json();
    if (!client_id || !nom) {
      return new Response(JSON.stringify({ ok: false, error: 'client_id et nom requis' }), { status: 400 });
    }

    const { data: existant } = await supabase
      .from('compta_clients')
      .select('id')
      .eq('apptraining_client_id', client_id)
      .maybeSingle();

    if (existant) {
      await supabase.from('compta_clients').update({
        prenom: prenom || '', nom, statut: mapStatut(statut),
      }).eq('id', existant.id);
      return new Response(JSON.stringify({ ok: true, action: 'updated', id: existant.id }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { data: cree, error } = await supabase.from('compta_clients').insert({
      apptraining_client_id: client_id, prenom: prenom || '', nom, statut: mapStatut(statut),
    }).select('id').single();
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, action: 'created', id: cree.id }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
