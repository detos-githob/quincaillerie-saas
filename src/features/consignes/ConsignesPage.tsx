import { useEffect, useState } from "react";
import { PackageOpen, Check } from "lucide-react";
import { listerConsignesEnCours, solderConsigneManuelle, type ConsigneAvecDetails } from "../../services/consignesService";

function formatFCFA(montant: number): string {
  return Math.round(montant).toLocaleString("fr-FR") + " F";
}

export function ConsignesPage() {
  const [consignes, setConsignes] = useState<ConsigneAvecDetails[]>([]);
  const [chargement, setChargement] = useState(true);
  const [soldeEnCours, setSoldeEnCours] = useState<string | null>(null);

  useEffect(() => {
    listerConsignesEnCours()
      .then(setConsignes)
      .finally(() => setChargement(false));
  }, []);

  async function gererSolde(consigne: ConsigneAvecDetails) {
    const restant = consigne.quantite - consigne.quantite_rendue;
    setSoldeEnCours(consigne.id);
    try {
      await solderConsigneManuelle(consigne.id, restant);
      setConsignes((prev) => prev.filter((c) => c.id !== consigne.id));
    } catch (e) {
      console.error(e);
    } finally {
      setSoldeEnCours(null);
    }
  }

  if (chargement) {
    return <div className="p-6 text-stone-400 text-sm">Chargement des consignes...</div>;
  }

  const totalConsigne = consignes.reduce(
    (s, c) => s + (c.quantite - c.quantite_rendue) * c.montant_unitaire,
    0
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-5">
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display text-2xl font-bold text-stone-900">Consignes en cours</h1>
      </div>
      <p className="text-sm text-stone-500 mb-4">
        {consignes.length} consigne{consignes.length > 1 ? "s" : ""} ouverte{consignes.length > 1 ? "s" : ""} ·{" "}
        {formatFCFA(totalConsigne)} au total
      </p>

      <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
        {consignes.map((consigne) => {
          const restant = consigne.quantite - consigne.quantite_rendue;
          return (
            <div key={consigne.id} className="flex items-center justify-between p-4 gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-amber-50 shrink-0">
                  <PackageOpen size={16} className="text-amber-500" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-stone-900 truncate">
                    {consigne.client?.nom || "Client comptant"}
                  </p>
                  <p className="text-xs text-stone-400">
                    {restant} {consigne.article.unite}(s) de {consigne.article.designation}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-display text-base font-bold text-stone-900">
                  {formatFCFA(restant * consigne.montant_unitaire)}
                </span>
                <button
                  onClick={() => gererSolde(consigne)}
                  disabled={soldeEnCours === consigne.id}
                  className="flex items-center gap-1 text-xs font-medium text-emerald-600 border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                >
                  <Check size={13} /> Vides rendus
                </button>
              </div>
            </div>
          );
        })}
        {consignes.length === 0 && (
          <p className="p-6 text-center text-stone-400 text-sm">Aucune consigne en cours.</p>
        )}
      </div>
    </div>
  );
}
