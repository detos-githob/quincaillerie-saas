import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, Plus } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { listerInventaires, demarrerInventaire, type Inventaire } from "../../services/inventairesService";

export function InventairePage() {
  const { entreprise, utilisateur } = useAuth();
  const [inventaires, setInventaires] = useState<Inventaire[]>([]);
  const [chargement, setChargement] = useState(true);
  const [demarrageEnCours, setDemarrageEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    listerInventaires()
      .then(setInventaires)
      .finally(() => setChargement(false));
  }, []);

  async function gererNouvelInventaire() {
    if (!entreprise) return;
    setDemarrageEnCours(true);
    setErreur(null);
    try {
      const id = await demarrerInventaire(entreprise.id, utilisateur?.id || null);
      navigate(`/inventaire/${id}`);
    } catch (e: any) {
      setErreur(e.message || "Erreur lors du démarrage de l'inventaire.");
    } finally {
      setDemarrageEnCours(false);
    }
  }

  const enCours = inventaires.find((i) => i.statut === "en_cours");

  if (chargement) {
    return <div className="p-6 text-stone-400 text-sm">Chargement des inventaires...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-5">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl font-bold text-stone-900">Inventaire</h1>
        {!enCours && (
          <button
            onClick={gererNouvelInventaire}
            disabled={demarrageEnCours}
            className="flex items-center gap-1.5 bg-stone-900 text-white text-sm font-medium px-3.5 py-2 rounded-lg disabled:opacity-60"
          >
            <Plus size={16} /> {demarrageEnCours ? "Démarrage..." : "Nouvel inventaire"}
          </button>
        )}
      </div>

      {erreur && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {erreur}
        </p>
      )}

      {enCours && (
        <button
          onClick={() => navigate(`/inventaire/${enCours.id}`)}
          className="w-full text-left bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-center gap-3"
        >
          <ClipboardList size={20} className="text-amber-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Inventaire en cours</p>
            <p className="text-xs text-stone-600">
              Démarré le {new Date(enCours.date_debut).toLocaleDateString("fr-FR")} — continuer le comptage
            </p>
          </div>
        </button>
      )}

      <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
        {inventaires
          .filter((i) => i.statut === "valide")
          .map((inv) => (
            <button
              key={inv.id}
              onClick={() => navigate(`/inventaire/${inv.id}`)}
              className="w-full flex items-center justify-between p-4 text-left"
            >
              <div className="flex items-center gap-3">
                <ClipboardList size={16} className="text-stone-400" />
                <div>
                  <p className="text-sm font-medium text-stone-900">
                    Inventaire du {new Date(inv.date_debut).toLocaleDateString("fr-FR")}
                  </p>
                  <p className="text-xs text-stone-400">
                    Validé le {inv.date_fin ? new Date(inv.date_fin).toLocaleDateString("fr-FR") : "—"}
                  </p>
                </div>
              </div>
              <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                Validé
              </span>
            </button>
          ))}
        {inventaires.filter((i) => i.statut === "valide").length === 0 && (
          <p className="p-6 text-center text-stone-400 text-sm">Aucun inventaire validé pour l'instant.</p>
        )}
      </div>
    </div>
  );
}
