import { supabase } from "../lib/supabaseClient";
import { cleCache, ecrireLocal, estErreurReseau, lireLocal } from "../lib/baseLocale";
import { ajouterOperation, listerOperations, type Operation } from "./offlineQueue";
import { envoyerOperation } from "./synchroHorsLigne";
import type { ConditionsTontine, CotisationTontine, LignePanierTontine, Tontine } from "../types";

// ---------------------------------------------------------------------
// Cache hors ligne
// ---------------------------------------------------------------------
async function lireCache<T>(nom: string): Promise<T | undefined> {
  const cle = cleCache(nom);
  return cle ? lireLocal<T>(cle).catch(() => undefined) : undefined;
}
async function ecrireCache(nom: string, valeur: unknown): Promise<void> {
  const cle = cleCache(nom);
  if (cle) await ecrireLocal(cle, valeur).catch(() => undefined);
}

/** Met à jour une tontine dans la liste en cache (cumul, statut...). */
async function majTontineEnCache(tontine: Tontine): Promise<void> {
  const liste = (await lireCache<Tontine[]>("tontines")) ?? [];
  const existe = liste.some((t) => t.id === tontine.id);
  await ecrireCache("tontines", existe ? liste.map((t) => (t.id === tontine.id ? tontine : t)) : [tontine, ...liste]);
}

async function avecRepli<T>(enLigne: () => Promise<T>, nomCache: string, repli: () => Promise<T | undefined>): Promise<T> {
  try {
    const resultat = await enLigne();
    await ecrireCache(nomCache, resultat);
    return resultat;
  } catch (err) {
    if (estErreurReseau(err)) {
      const copie = await repli();
      if (copie !== undefined) return copie;
      throw new Error("Pas de connexion et ces données ne sont pas encore sur cet appareil.");
    }
    throw err;
  }
}

export async function listerTontines(): Promise<Tontine[]> {
  return avecRepli(
    async () => {
      const { data, error } = await supabase
        .from("tontines")
        .select("*, client:clients(nom, telephone)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as unknown as Tontine[];
    },
    "tontines",
    () => lireCache<Tontine[]>("tontines")
  );
}

export async function obtenirTontine(id: string): Promise<Tontine> {
  try {
    const { data, error } = await supabase
      .from("tontines")
      .select("*, client:clients(nom, telephone)")
      .eq("id", id)
      .single();
    if (error) throw error;
    await majTontineEnCache(data as unknown as Tontine);
    return data as unknown as Tontine;
  } catch (err) {
    const t = ((await lireCache<Tontine[]>("tontines")) ?? []).find((x) => x.id === id);
    // Hors ligne, ou tontine créée hors ligne pas encore envoyée.
    if (t && (estErreurReseau(err) || (t as { en_attente_synchro?: boolean }).en_attente_synchro)) return t;
    if (estErreurReseau(err)) throw new Error("Pas de connexion et cette tontine n'est pas encore sur cet appareil.");
    throw err;
  }
}

/**
 * Ouvre une tontine. Hors ligne, elle est créée sur l'appareil (avec un
 * identifiant définitif) et envoyée à la synchronisation. Le serveur
 * fige alors le texte des conditions en vigueur.
 */
export async function creerTontine(
  entrepriseId: string,
  clientId: string,
  plafond: number,
  utilisateurId: string | null,
  conditionsAcceptees: boolean,
  client?: { nom: string; telephone: string | null }
): Promise<Tontine> {
  const id = crypto.randomUUID();

  const horsLigne = async (): Promise<Tontine> => {
    if (!conditionsAcceptees) throw new Error("Le client doit accepter les conditions générales de la tontine.");
    await ajouterOperation({
      type: "tontine",
      id_local: id,
      date: new Date().toISOString(),
      entreprise_id: entrepriseId,
      resume: `Nouvelle tontine : ${client?.nom ?? "client"} (plafond ${Math.round(plafond).toLocaleString("fr-FR")} F)`,
      montant: plafond,
      tentatives: 0,
      tontine: { id, entreprise_id: entrepriseId, client_id: clientId, plafond, utilisateur_id: utilisateurId },
    });
    const locale = {
      id,
      entreprise_id: entrepriseId,
      client_id: clientId,
      plafond,
      montant_cumule: 0,
      statut: "en_cours",
      utilisateur_id: utilisateurId,
      created_at: new Date().toISOString(),
      conditions_acceptees: true,
      client: client ?? { nom: "Client", telephone: null },
      en_attente_synchro: true,
    } as unknown as Tontine;
    await majTontineEnCache(locale);
    await ecrireCache(`cotisations:${id}`, []);
    await ecrireCache(`panier:${id}`, []);
    return locale;
  };

  if (!navigator.onLine) return horsLigne();
  try {
    const { data, error } = await supabase
      .from("tontines")
      .insert({
        id,
        entreprise_id: entrepriseId,
        client_id: clientId,
        plafond,
        montant_cumule: 0,
        statut: "en_cours",
        utilisateur_id: utilisateurId,
        // Le serveur refuse l'insertion si false, puis fige lui-même le
        // texte, la version et l'horodatage des conditions acceptées.
        conditions_acceptees: conditionsAcceptees,
      })
      .select("*, client:clients(nom, telephone)")
      .single();
    if (error) throw error;
    await majTontineEnCache(data as unknown as Tontine);
    return data as unknown as Tontine;
  } catch (err) {
    if (estErreurReseau(err)) return horsLigne();
    throw err;
  }
}

export async function listerCotisations(tontineId: string): Promise<CotisationTontine[]> {
  const enAttente = await cotisationsEnAttente(tontineId);
  const serveur = await avecRepli(
    async () => {
      const { data, error } = await supabase
        .from("cotisations_tontine")
        .select("*")
        .eq("tontine_id", tontineId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as CotisationTontine[];
    },
    `cotisations:${tontineId}`,
    () => lireCache<CotisationTontine[]>(`cotisations:${tontineId}`)
  );
  // Les versements pas encore envoyés s'affichent en tête, marqués.
  return [...enAttente, ...serveur.filter((c) => !enAttente.some((e) => e.id === c.id))];
}

/** Cotisations de cette tontine encore dans la file hors ligne. */
async function cotisationsEnAttente(tontineId: string): Promise<CotisationTontine[]> {
  const file: Operation[] = await listerOperations().catch(() => [] as Operation[]);
  return file
    .filter((o): o is Extract<Operation, { type: "cotisation" }> => o.type === "cotisation" && o.cotisation.tontine_id === tontineId)
    .reverse()
    .map((o) => versCotisationProvisoire(o));
}

function versCotisationProvisoire(o: Extract<Operation, { type: "cotisation" }>): CotisationTontine {
  return {
    id: o.id_local,
    tontine_id: o.cotisation.tontine_id,
    entreprise_id: o.entreprise_id,
    numero_recu: `PROV-${o.id_local.slice(0, 8).toUpperCase()}`,
    montant: o.cotisation.montant,
    mode_paiement: o.cotisation.mode_paiement,
    utilisateur_id: null,
    created_at: o.date,
    en_attente_synchro: true,
  } as unknown as CotisationTontine;
}

export interface ResultatCotisation {
  cotisation: CotisationTontine;
  horsLigne: boolean;
  /** Tontine telle qu'elle est après ce versement (cumul, statut). */
  tontine?: Tontine;
}

/**
 * Enregistre un versement. Identifiant unique et heure réelle fixés ici :
 * renvoyé après une coupure, il n'est jamais compté deux fois. Hors
 * ligne, un reçu PROVISOIRE est produit et le cumul de la tontine est
 * mis à jour sur l'appareil.
 */
export async function enregistrerCotisation(
  tontineId: string,
  entrepriseId: string,
  montant: number,
  modePaiement: "especes" | "mobile_money",
  _utilisateurId: string | null
): Promise<ResultatCotisation> {
  const op: Extract<Operation, { type: "cotisation" }> = {
    type: "cotisation",
    id_local: crypto.randomUUID(),
    date: new Date().toISOString(),
    entreprise_id: entrepriseId,
    resume: "Cotisation tontine",
    montant,
    tentatives: 0,
    cotisation: { tontine_id: tontineId, montant, mode_paiement: modePaiement },
  };

  const horsLigne = async (): Promise<ResultatCotisation> => {
    const tontine = ((await lireCache<Tontine[]>("tontines")) ?? []).find((t) => t.id === tontineId);
    if (tontine?.statut === "cloturee") throw new Error("Cette tontine est déjà clôturée.");
    op.resume = `Cotisation tontine : ${tontine?.client?.nom ?? "client"}`;
    await ajouterOperation(op);
    let tontineApres: Tontine | undefined;
    if (tontine) {
      const cumul = Number(tontine.montant_cumule) + montant;
      tontineApres = { ...tontine, montant_cumule: cumul, statut: cumul >= Number(tontine.plafond) ? "atteint" : tontine.statut };
      await majTontineEnCache(tontineApres);
    }
    return { cotisation: versCotisationProvisoire(op), horsLigne: true, tontine: tontineApres };
  };

  if (!navigator.onLine) return horsLigne();
  try {
    const { donnees } = await envoyerOperation(op);
    const { data, error: erreurLecture } = await supabase
      .from("cotisations_tontine")
      .select("*")
      .eq("id", donnees?.cotisation_id as string)
      .single();
    if (erreurLecture) throw erreurLecture;
    return { cotisation: data as CotisationTontine, horsLigne: false };
  } catch (err) {
    if (estErreurReseau(err)) {
      // La cotisation a peut-être été reçue avant la coupure : même
      // identifiant, donc pas de double comptage au renvoi.
      return horsLigne();
    }
    throw err;
  }
}

export async function listerPanierTontine(tontineId: string): Promise<LignePanierTontine[]> {
  return avecRepli(() => listerPanierTontineEnLigne(tontineId), `panier:${tontineId}`, () =>
    lireCache<LignePanierTontine[]>(`panier:${tontineId}`)
  );
}

async function listerPanierTontineEnLigne(tontineId: string): Promise<LignePanierTontine[]> {
  const { data, error } = await supabase
    .from("panier_tontine")
    .select("*, article:articles(designation, unite, prix_vente)")
    .eq("tontine_id", tontineId);
  if (error) throw error;
  return data as unknown as LignePanierTontine[];
}

export async function ajouterProduitPanier(
  tontineId: string,
  entrepriseId: string,
  articleId: string,
  quantite: number
): Promise<void> {
  const { error } = await supabase.rpc("ajouter_produit_panier_tontine", {
    p_tontine_id: tontineId,
    p_entreprise_id: entrepriseId,
    p_article_id: articleId,
    p_quantite: quantite,
  });
  if (error) throw error;
}

export async function retirerProduitPanier(ligneId: string): Promise<void> {
  const { error } = await supabase.from("panier_tontine").delete().eq("id", ligneId);
  if (error) throw error;
}

/**
 * Récupère les produits du panier une fois le plafond atteint : sort la
 * marchandise du stock, vide le panier et clôture la tontine — via la
 * fonction RPC atomique `recuperer_produits_tontine`.
 */
export async function recupererProduitsTontine(
  tontineId: string,
  entrepriseId: string,
  utilisateurId: string | null
): Promise<void> {
  const { error } = await supabase.rpc("recuperer_produits_tontine", {
    p_tontine_id: tontineId,
    p_entreprise_id: entrepriseId,
    p_utilisateur_id: utilisateurId,
  });
  if (error) throw error;
}

// =====================================================================
// CONDITIONS DE TONTINE (définies par le gérant)
// =====================================================================

export const LONGUEUR_MIN_CONDITIONS = 50;
export const LONGUEUR_MAX_CONDITIONS = 10000;

export async function obtenirConditionsTontine(): Promise<ConditionsTontine | null> {
  return avecRepli(obtenirConditionsTontineEnLigne, "conditions_tontine", async () => {
    const copie = await lireCache<ConditionsTontine | null>("conditions_tontine");
    return copie === undefined ? undefined : copie;
  });
}

async function obtenirConditionsTontineEnLigne(): Promise<ConditionsTontine | null> {
  const { data, error } = await supabase
    .from("conditions_tontine")
    .select("entreprise_id, contenu, version, updated_at")
    .maybeSingle();
  if (error) throw error;
  return (data as ConditionsTontine) ?? null;
}

/**
 * Enregistre les conditions (gérant uniquement, vérifié côté serveur).
 * Renvoie le numéro de version en vigueur après enregistrement.
 */
export async function definirConditionsTontine(contenu: string): Promise<number> {
  const { data, error } = await supabase.rpc("definir_conditions_tontine", { p_contenu: contenu });
  if (error) throw error;
  return data as number;
}
