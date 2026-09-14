import { useEffect, useState } from "react";
import { Truck, MapPin } from "lucide-react";
import { listerLivraisons, changerStatutLivraison, type LivraisonAvecDetails } from "../../services/livraisonsService";
import type { StatutLivraison } from "../../types";

function formatFCFA(montant: number): string {
  return Math.round(montant).toLocaleString("fr-FR") + " F";
}

const LABEL_STATUT: Record<StatutLivraison, { texte: string; classe: string }> = {
  en_attente: { texte: "En attente", classe: "bg-stone-100 text-stone-600" },
  en_cours: { texte: "En cours", classe: "bg-amber-50 text-amber-700" },
  livree: { texte: "Livrée", classe: "bg-emerald-50 text-emerald-700" },
  annulee: { texte: "Annulée", classe: "bg-red-50 text-red-700" },
};

const PROCHAIN_STATUT: Partial<Record<StatutLivraison, { suivant: StatutLivraison; label: string }>> = {
  en_attente: { suivant: "en_cours", label: "Démarrer" },
  en_cours: { suivant: "livree", label: "Marquer livrée" },
};

export function LivraisonsPage() {
  const [livraisons, setLivraisons] = useState<LivraisonAvecDetails[]>([]);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    listerLivraisons()
      .then(setLivraisons)
      .finally(() => setChargement(false));
  }, []);

  async function gererChangementStatut(livraison: LivraisonAvecDetails, statut: StatutLivraison) {
    await changerStatutLivraison(livraison.id, statut);
    setLivraisons((prev) => prev.map((l) => (l.id === livraison.id ? { ...l, statut } : l)));
  }

  if (chargement) {
    return <div className="p-6 text-stone-400 text-sm">Chargement des livraisons...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-5">
      <h1 className="font-display text-2xl font-bold text-stone-900 mb-4">Livraisons</h1>

      <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
        {livraisons.map((livraison) => {
          const style = LABEL_STATUT[livraison.statut];
          const action = PROCHAIN_STATUT[livraison.statut];
          return (
            <div key={livraison.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-stone-100 shrink-0">
                    <Truck size={16} className="text-stone-400" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-900">
                      {livraison.vente.numero_vente} · {livraison.client?.nom || "Client comptant"}
                    </p>
                    <p className="text-xs text-stone-500 flex items-center gap-1 mt-0.5">
                      <MapPin size={11} /> {livraison.adresse_livraison}
                    </p>
                    {livraison.date_prevue && (
                      <p className="text-xs text-stone-400 mt-0.5">
                        Prévue le {new Date(livraison.date_prevue).toLocaleDateString("fr-FR")}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-display text-base font-bold text-stone-900">
                    {formatFCFA(livraison.vente.montant_total)}
                  </p>
                  <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${style.classe}`}>
                    {style.texte}
                  </span>
                </div>
              </div>

              {action && (
                <button
                  onClick={() => gererChangementStatut(livraison, action.suivant)}
                  className="mt-2 text-xs font-medium text-amber-600 border border-amber-200 bg-amber-50 px-2.5 py-1.5 rounded-lg"
                >
                  {action.label}
                </button>
              )}
            </div>
          );
        })}
        {livraisons.length === 0 && (
          <p className="p-6 text-center text-stone-400 text-sm">Aucune livraison pour le moment.</p>
        )}
      </div>
    </div>
  );
}
