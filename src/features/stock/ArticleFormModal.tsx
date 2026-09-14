import { useState, type FormEvent } from "react";
import { X, Trash2, ChevronDown } from "lucide-react";
import { creerArticle, modifierArticle, desactiverArticle } from "../../services/articlesService";
import { useAuth } from "../../hooks/useAuth";
import type { Article } from "../../types";

interface Props {
  onFerme: () => void;
  onCree?: (article: Article) => void;
  onModifie?: (id: string, champs: Partial<Article>) => void;
  onSupprime?: (id: string) => void;
  articleAModifier?: Article | null;
}

export function ArticleFormModal({ onFerme, onCree, onModifie, onSupprime, articleAModifier }: Props) {
  const { entreprise } = useAuth();
  const modeEdition = !!articleAModifier;

  const [designation, setDesignation] = useState(articleAModifier?.designation || "");
  const [unite, setUnite] = useState(articleAModifier?.unite || "unité");
  const [prixAchat, setPrixAchat] = useState(String(articleAModifier?.prix_achat ?? ""));
  const [prixVente, setPrixVente] = useState(String(articleAModifier?.prix_vente ?? ""));
  const [seuilAlerte, setSeuilAlerte] = useState(String(articleAModifier?.seuil_alerte ?? "5"));
  const [tarificationOuverte, setTarificationOuverte] = useState(
    !!(articleAModifier?.prix_demi_gros || articleAModifier?.prix_gros)
  );
  const [prixDemiGros, setPrixDemiGros] = useState(String(articleAModifier?.prix_demi_gros ?? ""));
  const [seuilDemiGros, setSeuilDemiGros] = useState(String(articleAModifier?.seuil_demi_gros ?? ""));
  const [prixGros, setPrixGros] = useState(String(articleAModifier?.prix_gros ?? ""));
  const [seuilGros, setSeuilGros] = useState(String(articleAModifier?.seuil_gros ?? ""));
  const [enCours, setEnCours] = useState(false);
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function gererSoumission(e: FormEvent) {
    e.preventDefault();
    if (!entreprise) return;
    setEnCours(true);
    setErreur(null);
    try {
      if (modeEdition && articleAModifier) {
        const champs: Partial<Article> = {
          designation,
          unite,
          prix_achat: Number(prixAchat),
          prix_vente: Number(prixVente),
          seuil_alerte: Number(seuilAlerte),
          prix_demi_gros: prixDemiGros ? Number(prixDemiGros) : null,
          seuil_demi_gros: seuilDemiGros ? Number(seuilDemiGros) : null,
          prix_gros: prixGros ? Number(prixGros) : null,
          seuil_gros: seuilGros ? Number(seuilGros) : null,
        };
        await modifierArticle(articleAModifier.id, champs);
        onModifie?.(articleAModifier.id, champs);
      } else {
        const article = await creerArticle(
          {
            designation,
            unite,
            prix_achat: Number(prixAchat),
            prix_vente: Number(prixVente),
            seuil_alerte: Number(seuilAlerte),
            categorie_id: null,
            reference: null,
            prix_demi_gros: prixDemiGros ? Number(prixDemiGros) : null,
            seuil_demi_gros: seuilDemiGros ? Number(seuilDemiGros) : null,
            prix_gros: prixGros ? Number(prixGros) : null,
            seuil_gros: seuilGros ? Number(seuilGros) : null,
          },
          entreprise.id
        );
        onCree?.(article);
      }
      onFerme();
    } catch (e: any) {
      setErreur(e.message || "Une erreur est survenue.");
    } finally {
      setEnCours(false);
    }
  }

  async function gererSuppression() {
    if (!articleAModifier) return;
    const confirme = window.confirm(
      `Supprimer "${articleAModifier.designation}" ? Il n'apparaîtra plus dans le stock ni à la vente, mais son historique de ventes est conservé.`
    );
    if (!confirme) return;

    setSuppressionEnCours(true);
    setErreur(null);
    try {
      await desactiverArticle(articleAModifier.id);
      onSupprime?.(articleAModifier.id);
      onFerme();
    } catch (e: any) {
      setErreur(e.message || "Erreur lors de la suppression.");
    } finally {
      setSuppressionEnCours(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-stone-900/40" onClick={onFerme} />
      <form
        onSubmit={gererSoumission}
        className="relative bg-white rounded-2xl w-full max-w-sm p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-stone-900">
            {modeEdition ? "Modifier l'article" : "Nouvel article"}
          </h2>
          <button type="button" onClick={onFerme} className="text-stone-400">
            <X size={20} />
          </button>
        </div>

        <div>
          <label className="text-xs font-medium text-stone-500">Désignation</label>
          <input
            required
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
            placeholder="Ex : Ciment CIMBENIN 50kg"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-stone-500">Unité</label>
            <input
              value={unite}
              onChange={(e) => setUnite(e.target.value)}
              className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
              placeholder="sac, pièce, mètre..."
            />
          </div>
          <div>
            <label className="text-xs font-medium text-stone-500">Seuil d'alerte</label>
            <input
              type="number"
              value={seuilAlerte}
              onChange={(e) => setSeuilAlerte(e.target.value)}
              className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-stone-500">Prix d'achat (F)</label>
            <input
              type="number"
              required
              value={prixAchat}
              onChange={(e) => setPrixAchat(e.target.value)}
              className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-stone-500">Prix de vente (F)</label>
            <input
              type="number"
              required
              value={prixVente}
              onChange={(e) => setPrixVente(e.target.value)}
              className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
            />
          </div>
        </div>

        <div className="border border-stone-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setTarificationOuverte((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-stone-600 bg-stone-50"
          >
            Tarification gros / demi-gros (optionnel)
            <ChevronDown size={16} className={`transition-transform ${tarificationOuverte ? "rotate-180" : ""}`} />
          </button>
          {tarificationOuverte && (
            <div className="p-3 space-y-3">
              <p className="text-[11px] text-stone-400">
                Laisse vide pour vendre uniquement au prix détail. Le tarif se
                déclenche soit par quantité (seuil), soit automatiquement pour
                un client classé "demi-gros" ou "gros".
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-stone-500">Prix demi-gros (F)</label>
                  <input
                    type="number"
                    value={prixDemiGros}
                    onChange={(e) => setPrixDemiGros(e.target.value)}
                    className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-stone-500">À partir de (qté)</label>
                  <input
                    type="number"
                    value={seuilDemiGros}
                    onChange={(e) => setSeuilDemiGros(e.target.value)}
                    className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-stone-500">Prix gros (F)</label>
                  <input
                    type="number"
                    value={prixGros}
                    onChange={(e) => setPrixGros(e.target.value)}
                    className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-stone-500">À partir de (qté)</label>
                  <input
                    type="number"
                    value={seuilGros}
                    onChange={(e) => setSeuilGros(e.target.value)}
                    className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {erreur && <p className="text-sm text-red-600">{erreur}</p>}

        <button
          type="submit"
          disabled={enCours || suppressionEnCours}
          className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-2.5 rounded-xl disabled:opacity-60"
        >
          {enCours ? "Enregistrement..." : modeEdition ? "Enregistrer les modifications" : "Ajouter l'article"}
        </button>

        {modeEdition && (
          <button
            type="button"
            onClick={gererSuppression}
            disabled={enCours || suppressionEnCours}
            className="w-full flex items-center justify-center gap-1.5 text-red-600 text-sm font-medium py-2 disabled:opacity-60"
          >
            <Trash2 size={15} />
            {suppressionEnCours ? "Suppression..." : "Supprimer cet article"}
          </button>
        )}
      </form>
    </div>
  );
}
