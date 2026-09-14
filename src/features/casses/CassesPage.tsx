import { useEffect, useState, type FormEvent } from "react";
import { AlertOctagon, Plus, X } from "lucide-react";
import { listerCassesRecentes, enregistrerCasse, type CasseAvecDetails } from "../../services/cassesService";
import { listerArticles } from "../../services/articlesService";
import { useAuth } from "../../hooks/useAuth";
import type { Article } from "../../types";

export function CassesPage() {
  const [casses, setCasses] = useState<CasseAvecDetails[]>([]);
  const [chargement, setChargement] = useState(true);
  const [modaleOuverte, setModaleOuverte] = useState(false);

  useEffect(() => {
    listerCassesRecentes()
      .then(setCasses)
      .finally(() => setChargement(false));
  }, []);

  if (chargement) {
    return <div className="p-6 text-stone-400 text-sm">Chargement des casses...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-5">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl font-bold text-stone-900">Casses</h1>
        <button
          onClick={() => setModaleOuverte(true)}
          className="flex items-center gap-1.5 bg-stone-900 text-white text-sm font-medium px-3.5 py-2 rounded-lg"
        >
          <Plus size={16} /> Enregistrer une casse
        </button>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
        {casses.map((casse) => (
          <div key={casse.id} className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-red-50 shrink-0">
                <AlertOctagon size={16} className="text-red-500" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-stone-900 truncate">{casse.article.designation}</p>
                <p className="text-xs text-stone-400">
                  {casse.motif || "Sans motif"} · {new Date(casse.created_at).toLocaleDateString("fr-FR")}
                </p>
              </div>
            </div>
            <span className="font-display text-base font-bold text-red-600 shrink-0">
              -{casse.quantite} {casse.article.unite}
            </span>
          </div>
        ))}
        {casses.length === 0 && (
          <p className="p-6 text-center text-stone-400 text-sm">Aucune casse enregistrée.</p>
        )}
      </div>

      {modaleOuverte && (
        <ModaleCasse
          onFerme={() => setModaleOuverte(false)}
          onCree={() => listerCassesRecentes().then(setCasses)}
        />
      )}
    </div>
  );
}

function ModaleCasse({ onFerme, onCree }: { onFerme: () => void; onCree: () => void }) {
  const { entreprise, utilisateur } = useAuth();
  const [articles, setArticles] = useState<Article[]>([]);
  const [articleId, setArticleId] = useState("");
  const [quantite, setQuantite] = useState("1");
  const [motif, setMotif] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    listerArticles().then(setArticles);
  }, []);

  async function gererSoumission(e: FormEvent) {
    e.preventDefault();
    if (!entreprise || !articleId) return;
    setEnCours(true);
    setErreur(null);
    try {
      await enregistrerCasse(entreprise.id, articleId, Number(quantite), motif, utilisateur?.id || null);
      onCree();
      onFerme();
    } catch (e: any) {
      setErreur(e.message || "Erreur lors de l'enregistrement.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-stone-900/40" onClick={onFerme} />
      <form onSubmit={gererSoumission} className="relative bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-stone-900">Enregistrer une casse</h2>
          <button type="button" onClick={onFerme} className="text-stone-400">
            <X size={20} />
          </button>
        </div>

        <div>
          <label className="text-xs font-medium text-stone-500">Article</label>
          <select
            required
            value={articleId}
            onChange={(e) => setArticleId(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm bg-white"
          >
            <option value="">Sélectionner...</option>
            {articles.map((a) => (
              <option key={a.id} value={a.id}>
                {a.designation}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-stone-500">Quantité cassée</label>
          <input
            type="number"
            min={1}
            required
            value={quantite}
            onChange={(e) => setQuantite(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-stone-500">Motif</label>
          <input
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Ex : chute pendant le déchargement"
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
          />
        </div>

        {erreur && <p className="text-sm text-red-600">{erreur}</p>}

        <button
          type="submit"
          disabled={enCours}
          className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-2.5 rounded-xl disabled:opacity-60"
        >
          {enCours ? "Enregistrement..." : "Enregistrer la casse"}
        </button>
      </form>
    </div>
  );
}
