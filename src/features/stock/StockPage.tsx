import { useEffect, useState } from "react";
import { Plus, Package, Search, Pencil } from "lucide-react";
import { listerArticles, ajusterStock } from "../../services/articlesService";
import { useAuth } from "../../hooks/useAuth";
import { ArticleFormModal } from "./ArticleFormModal";
import type { Article } from "../../types";

function formatFCFA(montant: number): string {
  return Math.round(montant).toLocaleString("fr-FR") + " F";
}

export function StockPage() {
  const { entreprise, utilisateur } = useAuth();
  const peutGererArticles = utilisateur?.role === "gerant" || utilisateur?.role === "comptable";
  const [articles, setArticles] = useState<Article[]>([]);
  const [recherche, setRecherche] = useState("");
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [articleAModifier, setArticleAModifier] = useState<Article | null>(null);
  const [chargement, setChargement] = useState(true);
  // Quantité à ajuster, saisie librement par article (par défaut 1).
  // Ce n'est PAS le stock lui-même : c'est le nombre à ajouter ou
  // retirer quand on clique sur + ou -.
  const [quantitesSaisies, setQuantitesSaisies] = useState<Record<string, string>>({});

  useEffect(() => {
    listerArticles()
      .then(setArticles)
      .finally(() => setChargement(false));
  }, []);

  function quantiteSaisie(articleId: string): number {
    const brut = quantitesSaisies[articleId];
    const valeur = brut !== undefined ? parseInt(brut, 10) : 1;
    return isNaN(valeur) || valeur < 1 ? 1 : valeur;
  }

  async function gererAjustement(article: Article, sens: 1 | -1) {
    if (!entreprise) return;
    const quantite = quantiteSaisie(article.id);
    const delta = sens * quantite;
    const motif = sens > 0 ? "Réapprovisionnement" : "Correction manuelle";

    await ajusterStock(
      entreprise.id,
      article,
      delta,
      sens > 0 ? "entree" : "correction_manuelle",
      motif,
      utilisateur?.id || null
    );
    setArticles((prev) =>
      prev.map((a) => (a.id === article.id ? { ...a, stock_actuel: a.stock_actuel + delta } : a))
    );
  }

  const articlesFiltres = articles.filter((a) =>
    a.designation.toLowerCase().includes(recherche.toLowerCase())
  );

  if (chargement) {
    return <div className="p-6 text-stone-400 text-sm">Chargement du stock...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-5">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl font-bold text-stone-900">Stock</h1>
        {peutGererArticles && (
          <button
            onClick={() => setModaleOuverte(true)}
            className="flex items-center gap-1.5 bg-stone-900 text-white text-sm font-medium px-3.5 py-2 rounded-lg"
          >
            <Plus size={16} /> Nouvel article
          </button>
        )}
      </div>

      <div className="relative mb-4">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Chercher un article..."
          className="w-full bg-white border border-stone-300 rounded-lg py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
      </div>

      <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
        {articlesFiltres.map((article) => {
          const rupture = article.stock_actuel <= 0;
          const stockFaible = article.stock_actuel > 0 && article.stock_actuel <= article.seuil_alerte;
          return (
            <div key={article.id} className="flex items-center justify-between p-4 gap-3">
              <button
                onClick={() => peutGererArticles && setArticleAModifier(article)}
                className={`flex items-center gap-3 min-w-0 text-left flex-1 group ${
                  peutGererArticles ? "" : "cursor-default"
                }`}
                title={peutGererArticles ? "Modifier cet article" : undefined}
              >
                <span
                  className={`flex items-center justify-center w-9 h-9 rounded-lg shrink-0 ${
                    rupture ? "bg-red-50" : stockFaible ? "bg-amber-50" : "bg-stone-100"
                  }`}
                >
                  <Package
                    size={16}
                    className={rupture ? "text-red-500" : stockFaible ? "text-amber-500" : "text-stone-400"}
                  />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-stone-900 truncate flex items-center gap-1.5">
                    {article.designation}
                    {peutGererArticles && (
                      <Pencil size={11} className="text-stone-300 opacity-0 group-hover:opacity-100 shrink-0" />
                    )}
                  </p>
                  <p className="text-xs text-stone-400">
                    {formatFCFA(article.prix_vente)} · {article.stock_actuel} {article.unite} en stock
                  </p>
                </div>
              </button>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => gererAjustement(article, -1)}
                  className="w-7 h-7 flex items-center justify-center rounded-full border border-stone-300 text-stone-600 text-sm shrink-0"
                  title={`Retirer ${quantiteSaisie(article.id)} ${article.unite}`}
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  value={quantitesSaisies[article.id] ?? "1"}
                  onChange={(e) =>
                    setQuantitesSaisies((prev) => ({ ...prev, [article.id]: e.target.value }))
                  }
                  onFocus={(e) => e.target.select()}
                  className="w-14 text-center text-sm border border-stone-300 rounded-lg py-1 shrink-0"
                />
                <button
                  onClick={() => gererAjustement(article, 1)}
                  className="w-7 h-7 flex items-center justify-center rounded-full border border-stone-300 text-stone-600 text-sm shrink-0"
                  title={`Ajouter ${quantiteSaisie(article.id)} ${article.unite}`}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
        {articlesFiltres.length === 0 && (
          <p className="p-6 text-center text-stone-400 text-sm">Aucun article. Ajoute ton premier article.</p>
        )}
      </div>

      {modaleOuverte && (
        <ArticleFormModal
          onFerme={() => setModaleOuverte(false)}
          onCree={(article) => setArticles((prev) => [...prev, article])}
        />
      )}

      {articleAModifier && (
        <ArticleFormModal
          articleAModifier={articleAModifier}
          onFerme={() => setArticleAModifier(null)}
          onModifie={(id, champs) =>
            setArticles((prev) => prev.map((a) => (a.id === id ? { ...a, ...champs } : a)))
          }
          onSupprime={(id) => setArticles((prev) => prev.filter((a) => a.id !== id))}
        />
      )}
    </div>
  );
}
