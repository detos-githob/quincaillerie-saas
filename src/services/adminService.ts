import { supabase } from "../lib/supabaseClient";
import type { Entreprise } from "../types";

export async function listerEntreprisesAdmin(): Promise<Entreprise[]> {
  const { data, error } = await supabase.rpc("lister_entreprises_admin");
  if (error) throw error;
  return data as Entreprise[];
}

export async function modifierAbonnement(
  entrepriseId: string,
  plan: string,
  periodicite: "mensuel" | "annuel",
  dateExpiration: string | null,
  actif: boolean
): Promise<void> {
  const { error } = await supabase.rpc("modifier_abonnement_entreprise", {
    p_entreprise_id: entrepriseId,
    p_plan: plan,
    p_periodicite: periodicite,
    p_date_expiration: dateExpiration,
    p_actif: actif,
  });
  if (error) throw error;
}
