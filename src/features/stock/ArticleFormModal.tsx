import { useEffect, useState, type FormEvent } from "react";
import { X, Trash2 } from "lucide-react";
import { creerArticle, modifierArticle, desactiverArticle } from "../../services/articlesService";
import { listerFournisseurs } from "../../services/fournisseursService";
import { useAuth } from "../../hooks/useAuth";
import type { Article, Fournisseur } from "../../types";

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
  const [prixDemiGros, setPrixDemiGros] = useState(String(articleAModifier?.prix_demi_gros ?? ""));
  const [prixGros, setPrixGros] = useState(String(articleAModifier?.prix_gros ?? ""));
  const [fournisseurId, setFournisseurId] = useState(articleAModifier?.fournisseur_id || "");
  const [seuilAlerte, setSeuilAlerte] = useState(String(articleAModifier?.seuil_alerte ?? "5"));
  const [montantConsigne, setMontantConsigne] = useState(String(articleAModifier?.montant_consigne ?? "0"));
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [enCours, setEnCours] = useState(false);
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    listerFournisseurs().then(setFournisseurs).catch(() => {});
  }, []);

  async function gererSoumission(e: FormEvent) {
    e.preventDefault();
    if (!entreprise) return;
    setEnCours(true);
    setErreur(null);
    try {
      const champsCommuns = {
        designation,
        unite,
        prix_achat: Number(prixAchat),
        prix_vente: Number(prixVente),
        prix_demi_gros: prixDemiGros ? Number(prixDemiGros) : null,
        prix_gros: prixGros ? Number(prixGros) : null,
        fournisseur_id: fournisseurId || null,
        seuil_alerte: Number(seuilAlerte),
        montant_consigne: Number(montantConsigne) || 0,
      };

      if (modeEdition && articleAModifier) {
        await modifierArticle(articleAModifier.id, champsCommuns);
        onModifie?.(articleAModifier.id, champsCommuns);
      } else {
        const article = await creerArticle(
          { ...champsCommuns, categorie_id: null, reference: null },
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
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4 py-8 overflow-y-auto">
      <div className="absolute inset-0 bg-stone-900/40" onClick={onFerme} />
      <form
        onSubmit={gererSoumission}
        className="relative bg-white rounded-2xl w-full max-w-sm p-5 space-y-4 max-h-full overflow-y-auto"
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

        {entreprise?.secteur_activite === "depot_boissons" && (
          <div>
            <label className="text-xs font-medium text-stone-500">Montant de la consigne (F)</label>
            <input
              type="number"
              value={montantConsigne}
              onChange={(e) => setMontantConsigne(e.target.value)}
              className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
              placeholder="0 si pas de consigne"
            />
          </div>
        )}

        <div>
          <p className="text-xs font-medium text-stone-500 mb-1">Tarifs de vente</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[11px] text-stone-400">Détail *</label>
              <input
                type="number"
                required
                value={prixVente}
                onChange={(e) => setPrixVente(e.target.value)}
                className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-2 text-sm"
              />
            </div>
            <div>
              <label className="text-[11px] text-stone-400">Demi-gros</label>
              <input
                type="number"
                value={prixDemiGros}
                onChange={(e) => setPrixDemiGros(e.target.value)}
                className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-2 text-sm"
                placeholder="optionnel"
              />
            </div>
            <div>
              <label className="text-[11px] text-stone-400">Gros</label>
              <input
                type="number"
                value={prixGros}
                onChange={(e) => setPrixGros(e.target.value)}
                className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-2 text-sm"
                placeholder="optionnel"
              />
            </div>
          </div>
          <p className="text-[11px] text-stone-400 mt-1">
            Laisse vide si ce tarif ne s'applique pas à cet article — le prix détail sera utilisé par défaut.
          </p>
        </div>

        <div>
          <label className="text-xs font-medium text-stone-500">Fournisseur habituel</label>
          <select
            value={fournisseurId}
            onChange={(e) => setFournisseurId(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm bg-white"
          >
            <option value="">Aucun</option>
            {fournisseurs.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nom}
              </option>
            ))}
          </select>
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
