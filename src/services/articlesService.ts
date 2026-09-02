import { supabase } from "../lib/supabaseClient";
import type { Article } from "../types";

export async function listerArticles(): Promise<Article[]> {
  const { data, error } = await supabase
    .from("articles")
    .select("*")
    .eq("actif", true)
    .order("designation", { ascending: true });

  if (error) throw error;
  return data as Article[];
}

export async function creerArticle(
  article: Omit<Article, "id" | "entreprise_id" | "stock_actuel" | "actif">,
  entrepriseId: string
): Promise<Article> {
  const { data, error } = await supabase
    .from("articles")
    .insert({ ...article, entreprise_id: entrepriseId, stock_actuel: 0, actif: true })
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
 * Enregistre un mouvement de stock manuel (entrée fournisseur ou
 * correction) et met à jour le stock affiché de l'article.
 *
 * NOTE : dans une V2, ce calcul devrait être déplacé côté base de
 * données via un trigger PostgreSQL sur mouvements_stock, pour
 * garantir l'atomicité même en cas d'écritures concurrentes
 * (deux vendeurs qui vendent le même article en même temps).
 */
export async function ajusterStock(
  entrepriseId: string,
  article: Article,
  quantiteDelta: number,
  typeMouvement: "entree" | "correction_manuelle",
  motif: string,
  utilisateurId: string | null
): Promise<void> {
  const quantiteApres = article.stock_actuel + quantiteDelta;

  const { error: erreurMouvement } = await supabase.from("mouvements_stock").insert({
    entreprise_id: entrepriseId,
    article_id: article.id,
    type_mouvement: typeMouvement,
    quantite: quantiteDelta,
    quantite_avant: article.stock_actuel,
    quantite_apres: quantiteApres,
    motif,
    utilisateur_id: utilisateurId,
  });
  if (erreurMouvement) throw erreurMouvement;

  const { error: erreurArticle } = await supabase
    .from("articles")
    .update({ stock_actuel: quantiteApres })
    .eq("id", article.id);
  if (erreurArticle) throw erreurArticle;
}

export function articlesEnAlerte(articles: Article[]): Article[] {
  return articles.filter((a) => a.stock_actuel <= a.seuil_alerte);
}
