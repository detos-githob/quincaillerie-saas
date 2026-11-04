// Limite de débit des demandes de paiement : empêche d'envoyer des
// demandes Mobile Money en rafale (harcèlement d'un numéro, coûts
// opérateur, blocage du compte marchand).
// deno-lint-ignore no-explicit-any
type Client = any;

export async function tropDeDemandes(
  admin: Client,
  table: string,
  filtres: Record<string, string>,
  maximum: number,
  fenetreMinutes: number,
): Promise<boolean> {
  let requete = admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .gte("created_at", new Date(Date.now() - fenetreMinutes * 60_000).toISOString());
  for (const [colonne, valeur] of Object.entries(filtres)) requete = requete.eq(colonne, valeur);
  const { count, error } = await requete;
  if (error) return false; // en cas de doute, on ne bloque pas un vrai paiement
  return (count ?? 0) >= maximum;
}

export const MESSAGE_TROP_DE_DEMANDES =
  "Trop de demandes de paiement en peu de temps. Patiente quelques minutes avant de réessayer.";
