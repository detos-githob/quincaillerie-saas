import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// Les prix ne sont plus écrits dans le code : ils sont dans la table
// « offres », gérée depuis l'espace super admin. Le calcul (offre + code
// promo) est fait par la base (calculer_prix_abonnement), toujours côté
// serveur : le navigateur n'envoie jamais de montant.

export interface PrixCalcule {
  montant: number;
  montantBase: number;
  reduction: number;
  offreNom: string;
  codePromoId: string | null;
}

export async function calculerPrix(
  admin: SupabaseClient,
  entrepriseId: string,
  plan: unknown,
  periodicite: unknown,
  code: unknown
): Promise<{ prix?: PrixCalcule; erreur?: string }> {
  if (typeof plan !== "string" || (periodicite !== "mensuel" && periodicite !== "annuel")) {
    return { erreur: "Offre invalide." };
  }
  const { data, error } = await admin.rpc("calculer_prix_abonnement", {
    p_entreprise_id: entrepriseId,
    p_plan: plan,
    p_periodicite: periodicite,
    p_code: typeof code === "string" ? code.slice(0, 40) : null,
  });
  if (error) throw error;
  if (data?.erreur) return { erreur: data.erreur };
  return {
    prix: {
      montant: Number(data.montant),
      montantBase: Number(data.montant_base),
      reduction: Number(data.reduction ?? 0),
      offreNom: String(data.offre_nom),
      codePromoId: data.code_promo_id ?? null,
    },
  };
}
