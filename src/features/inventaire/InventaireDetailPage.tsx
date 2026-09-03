import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Check } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import {
  obtenirInventaire,
  listerLignesInventaire,
  enregistrerComptage,
  validerInventaire,
  type Inventaire,
  type LigneInventaire,
} from "../../services/inventairesService";

export function InventaireDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { utilisateur } = useAuth();
  const navigate = useNavigate();

  const [inventaire, setInventaire] = useState<Inventaire | null>(null);
  const [lignes, setLignes] = useState<LigneInventaire[]>([]);
  const [chargement, setChargement] = useState(true);
  const [validationEnCours, setValidationEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([obtenirInventaire(id), listerLignesInventaire(id)])
      .then(([inv, lignesData]) => {
        setInventaire(inv);
        setLignes(lignesData);
      })
      .finally(() => setChargement(false));
  }, [id]);

  const enLecture = inventaire?.statut === "valide";

  function gererSaisie(ligneId: string, valeurTexte: string) {
    const valeur = valeurTexte === "" ? null : Number(valeurTexte);
    setLignes((prev) => prev.map((l) => (l.id === ligneId ? { ...l, quantite_comptee: valeur } : l)));
  }

  async function gererValidationLigne(ligne: LigneInventaire) {
    try {
      await enregistrerComptage(ligne.id, ligne.quantite_comptee);
    } catch (e: any) {
      setErreur(e.message || "Erreur lors de l'enregistrement du comptage.");
    }
  }

  async function gererValidationInventaire() {
    if (!id) return;
    const confirme = window.confirm(
      "Valider cet inventaire ? Les écarts saisis vont ajuster le stock réel des articles concernés. Cette action est définitive."
    );
    if (!confirme) return;

    setValidationEnCours(true);
    setErreur(null);
    try {
      await validerInventaire(id, utilisateur?.id || null);
      const inv = await obtenirInventaire(id);
      setInventaire(inv);
    } catch (e: any) {
      setErreur(e.message || "Erreur lors de la validation de l'inventaire.");
    } finally {
      setValidationEnCours(false);
    }
  }

  const lignesAvecEcart = lignes.filter(
    (l) => l.quantite_comptee !== null && l.quantite_comptee !== l.quantite_theorique
  );

  if (chargement) {
    return <div className="p-6 text-stone-400 text-sm">Chargement de l'inventaire...</div>;
  }

  if (!inventaire) {
    return <div className="p-6 text-stone-400 text-sm">Inventaire introuvable.</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-5 pb-24">
      <button
        onClick={() => navigate("/inventaire")}
        className="flex items-center gap-1.5 text-sm text-stone-500 mb-3"
      >
        <ArrowLeft size={15} /> Retour aux inventaires
      </button>

      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display text-2xl font-bold text-stone-900">
          Inventaire du {new Date(inventaire.date_debut).toLocaleDateString("fr-FR")}
        </h1>
        <span
          className={`text-xs font-medium px-2 py-1 rounded ${
            enLecture ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-700"
          }`}
        >
          {enLecture ? "Validé" : "En cours"}
        </span>
      </div>
      <p className="text-sm text-stone-500 mb-4">
        {enLecture
          ? "Cet inventaire a déjà été validé — les quantités comptées ont ajusté le stock."
          : "Renseigne la quantité réellement comptée pour chaque article. Laisse vide si tu n'as pas encore vérifié."}
      </p>

      {erreur && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {erreur}
        </p>
      )}

      <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2 text-xs font-medium text-stone-400">
          <span>Article</span>
          <span className="text-center w-20">Théorique</span>
          <span className="text-center w-24">Compté</span>
        </div>
        {lignes.map((ligne) => {
          const ecart =
            ligne.quantite_comptee !== null ? ligne.quantite_comptee - ligne.quantite_theorique : null;
          return (
            <div key={ligne.id} className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-3 items-center">
              <div className="min-w-0">
                <p className="text-sm font-medium text-stone-900 truncate">{ligne.article.designation}</p>
                {ecart !== null && ecart !== 0 && (
                  <p className={`text-xs font-medium ${ecart > 0 ? "text-emerald-600" : "text-red-600"}`}>
                    Écart : {ecart > 0 ? "+" : ""}
                    {ecart} {ligne.article.unite}
                  </p>
                )}
              </div>
              <span className="text-sm text-stone-500 text-center w-20">
                {ligne.quantite_theorique} {ligne.article.unite}
              </span>
              <input
                type="number"
                disabled={enLecture}
                value={ligne.quantite_comptee ?? ""}
                onChange={(e) => gererSaisie(ligne.id, e.target.value)}
                onBlur={() => gererValidationLigne(ligne)}
                placeholder="—"
                className="w-24 text-center text-sm border border-stone-300 rounded-lg py-1.5 disabled:bg-stone-50 disabled:text-stone-400"
              />
            </div>
          );
        })}
      </div>

      {!enLecture && (
        <div className="fixed bottom-16 sm:bottom-0 left-0 right-0 sm:left-56 bg-white border-t border-stone-200 px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-stone-500">
            {lignesAvecEcart.length} article(s) avec un écart saisi
          </p>
          <button
            onClick={gererValidationInventaire}
            disabled={validationEnCours}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold px-5 py-2.5 rounded-xl disabled:opacity-60"
          >
            <Check size={16} />
            {validationEnCours ? "Validation..." : "Valider l'inventaire"}
          </button>
        </div>
      )}
    </div>
  );
}
