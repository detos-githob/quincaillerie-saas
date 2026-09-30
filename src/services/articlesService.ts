import { supabase } from "../lib/supabaseClient";
import { cleCache, ecrireLocal, estErreurReseau, lireLocal } from "../lib/baseLocale";
import { ajouterOperation, type Operation } from "./offlineQueue";
import { envoyerOperation } from "./synchroHorsLigne";
import type { Article } from "../types";

/**
 * Liste les articles actifs. Chaque chargement réussi est copié sur
 * l'appareil ; sans réseau, on sert cette copie (avec les déductions de
 * stock des ventes faites hors ligne depuis).
 */
export async function listerArticles(): Promise<Article[]> {
  const cle = cleCache("articles");
  try {
    const { data, error } = await supabase
      .from("articles")
      .select("*")
      .eq("actif", true)
      .order("designation", { ascending: true })
      .limit(3000);
    if (error) throw error;
    if (cle) await ecrireLocal(cle, data).catch(() => undefined);
    return data as Article[];
  } catch (err) {
    if (cle && estErreurReseau(err)) {
      const copie = await lireLocal<Article[]>(cle).catch(() => undefined);
      if (copie) return copie;
      throw new Error("Pas de connexion et aucune liste d'articles sur cet appareil. Connecte-toi une première fois pour la télécharger.");
    }
    throw err;
  }
}

/** Déduit du stock en cache les quantités d'une vente faite hors ligne. */
export async function ajusterStockEnCache(lignes: Array<{ article_id: string; quantite: number }>): Promise<void> {
  const cle = cleCache("articles");
  if (!cle) return;
  const copie = await lireLocal<Article[]>(cle).catch(() => undefined);
  if (!copie) return;
  const parArticle = new Map<string, number>();
  for (const l of lignes) parArticle.set(l.article_id, (parArticle.get(l.article_id) ?? 0) + Number(l.quantite));
  await ecrireLocal(
    cle,
    copie.map((a) => (parArticle.has(a.id) ? { ...a, stock_actuel: Number(a.stock_actuel) - parArticle.get(a.id)! } : a))
  ).catch(() => undefined);
}

export async function creerArticle(
  article: Omit<
    Article,
    | "id"
    | "entreprise_id"
    | "stock_actuel"
    | "actif"
    | "prix_demi_gros"
    | "prix_gros"
    | "seuil_demi_gros"
    | "seuil_gros"
    | "gestion_consigne"
    | "prix_consigne_casier"
    | "prix_consigne_bouteille"
    | "capacite_casier"
    | "date_expiration"
  > &
    Partial<
      Pick<
        Article,
        | "prix_demi_gros"
        | "prix_gros"
        | "seuil_demi_gros"
        | "seuil_gros"
        | "gestion_consigne"
        | "prix_consigne_casier"
        | "prix_consigne_bouteille"
        | "capacite_casier"
        | "date_expiration"
      >
    >,
  entrepriseId: string
): Promise<Article> {
  const { data, error } = await supabase
    .from("articles")
    .insert({
      ...article,
      entreprise_id: entrepriseId,
      stock_actuel: 0,
      actif: true,
      prix_demi_gros: article.prix_demi_gros ?? null,
      prix_gros: article.prix_gros ?? null,
      seuil_demi_gros: article.seuil_demi_gros ?? null,
      seuil_gros: article.seuil_gros ?? null,
      gestion_consigne: article.gestion_consigne ?? false,
      prix_consigne_casier: article.prix_consigne_casier ?? null,
      prix_consigne_bouteille: article.prix_consigne_bouteille ?? null,
      capacite_casier: article.capacite_casier ?? null,
      date_expiration: article.date_expiration ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Article;
}

export async function modifierArticle(
  id: string,
  champs: Partial<Article>
): Promise<void> {
  const { error } = await supabase.from("articles").update(champs).eq("id", id);
  if (error) throw error;
}

/**
 * "Supprime" un article en le désactivant (actif = false) plutôt que de
 * le supprimer réellement de la base. On garde ainsi l'historique des
 * ventes et mouvements de stock passés qui référencent cet article,
 * tout en le faisant disparaître des écrans de vente et de stock
 * (listerArticles filtre déjà sur actif = true).
 */
export async function desactiverArticle(id: string): Promise<void> {
  const { error } = await supabase.from("articles").update({ actif: false }).eq("id", id);
  if (error) throw error;
}

/**
 * Entrée (+) ou correction (-) de stock.
 *
 * Le serveur applique la VARIATION sur le stock réel (fonction
 * synchroniser_mouvement_stock), sous le même verrou que les ventes :
 * une vente faite au même moment sur un autre appareil n'est jamais
 * écrasée. Sans réseau, le mouvement part dans la file hors ligne et le
 * stock affiché est mis à jour sur l'appareil.
 */
export async function ajusterStock(
  entrepriseId: string,
  article: Article,
  quantiteDelta: number,
  typeMouvement: "entree" | "correction_manuelle",
  motif: string,
  _utilisateurId: string | null
): Promise<{ horsLigne: boolean; stockApres?: number }> {
  const op: Operation = {
    type: "stock",
    id_local: crypto.randomUUID(),
    date: new Date().toISOString(),
    entreprise_id: entrepriseId,
    resume: `${quantiteDelta > 0 ? "Entrée" : "Correction"} de stock : ${quantiteDelta > 0 ? "+" : ""}${quantiteDelta} ${article.designation}`,
    tentatives: 0,
    mouvement: { article_id: article.id, type: typeMouvement, quantite: quantiteDelta, motif },
  };

  const horsLigne = async () => {
    await ajouterOperation(op);
    // ajusterStockEnCache déduit : on lui passe l'opposé de la variation.
    await ajusterStockEnCache([{ article_id: article.id, quantite: -quantiteDelta }]);
    return { horsLigne: true };
  };

  if (!navigator.onLine) return horsLigne();
  try {
    const { donnees } = await envoyerOperation(op);
    return { horsLigne: false, stockApres: Number(donnees?.stock_apres) };
  } catch (err) {
    if (estErreurReseau(err)) return horsLigne();
    throw err;
  }
}

export function articlesEnAlerte(articles: Article[]): Article[] {
  return articles.filter((a) => a.stock_actuel <= a.seuil_alerte);
}
