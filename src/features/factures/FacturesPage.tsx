import { useEffect, useState } from "react";
import { FileText, Download } from "lucide-react";
import { listerFacturesRecentes, type FactureAvecDetails } from "../../services/facturesService";
import { genererFacturePDF } from "./facturePdf";
import { useAuth } from "../../hooks/useAuth";

function formatFCFA(montant: number): string {
  return Math.round(montant).toLocaleString("fr-FR") + " F";
}

export function FacturesPage() {
  const { entreprise } = useAuth();
  const [factures, setFactures] = useState<FactureAvecDetails[]>([]);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    listerFacturesRecentes()
      .then(setFactures)
      .finally(() => setChargement(false));
  }, []);

  if (chargement) {
    return <div className="p-6 text-stone-400 text-sm">Chargement des factures...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-5">
      <h1 className="font-display text-2xl font-bold text-stone-900 mb-4">Factures</h1>

      <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
        {factures.map((facture) => (
          <div key={facture.id} className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-stone-100 shrink-0">
                <FileText size={16} className="text-stone-400" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-stone-900 truncate">{facture.numero_facture}</p>
                <p className="text-xs text-stone-400">
                  {facture.vente.client?.nom || "Client comptant"} ·{" "}
                  {new Date(facture.date_emission).toLocaleDateString("fr-FR")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="font-display text-base font-bold text-stone-900">
                {formatFCFA(facture.vente.montant_total)}
              </span>
              <button
                onClick={() => entreprise && genererFacturePDF(facture, entreprise)}
                className="p-2 rounded-lg border border-stone-300 text-stone-600 hover:bg-stone-50"
                title="Télécharger le PDF"
              >
                <Download size={16} />
              </button>
            </div>
          </div>
        ))}
        {factures.length === 0 && (
          <p className="p-6 text-center text-stone-400 text-sm">
            Aucune facture pour le moment — elles sont générées automatiquement à chaque vente.
          </p>
        )}
      </div>
    </div>
  );
}
