import { useEffect, useState } from "react";
import { FileText, Download, RefreshCw } from "lucide-react";
import { listerFacturesRecentes, type FactureAvecDetails } from "../../services/facturesService";
import { changerTypeFacture } from "../../services/typeFactureService";
import { genererFacturePDF } from "./facturePdf";
import { useAuth } from "../../hooks/useAuth";

function formatFCFA(montant: number): string {
  return Math.round(montant).toLocaleString("fr-FR") + " F";
}

const STYLE_STATUT_EMECEF: Record<string, { texte: string; classe: string }> = {
  non_applicable: { texte: "", classe: "" },
  en_attente: { texte: "En attente DGI", classe: "text-amber-700 bg-amber-50" },
  validee: { texte: "Validée DGI", classe: "text-emerald-700 bg-emerald-50" },
  echec: { texte: "Échec transmission", classe: "text-red-700 bg-red-50" },
};

export function FacturesPage() {
  const { entreprise } = useAuth();
  const [factures, setFactures] = useState<FactureAvecDetails[]>([]);
  const [chargement, setChargement] = useState(true);
  const [conversionEnCours, setConversionEnCours] = useState<string | null>(null);

  useEffect(() => {
    listerFacturesRecentes()
      .then(setFactures)
      .finally(() => setChargement(false));
  }, []);

  async function gererConversion(facture: FactureAvecDetails) {
    const nouveauType = facture.type_facture === "simple" ? "normalisee" : "simple";
    setConversionEnCours(facture.id);
    try {
      await changerTypeFacture(facture.id, nouveauType);
      setFactures((prev) =>
        prev.map((f) =>
          f.id === facture.id
            ? { ...f, type_facture: nouveauType, statut_emecef: nouveauType === "normalisee" ? "en_attente" : "non_applicable" }
            : f
        )
      );
    } catch (e) {
      console.error(e);
    } finally {
      setConversionEnCours(null);
    }
  }

  if (chargement) {
    return <div className="p-6 text-stone-400 text-sm">Chargement des factures...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-5">
      <h1 className="font-display text-2xl font-bold text-stone-900 mb-4">Factures</h1>

      <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
        {factures.map((facture) => {
          const estNormalisee = facture.type_facture === "normalisee";
          const styleStatut = STYLE_STATUT_EMECEF[facture.statut_emecef] || STYLE_STATUT_EMECEF.non_applicable;
          return (
            <div key={facture.id} className="flex items-center justify-between p-4 gap-3">
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
                  <div className="flex items-center gap-1.5 mt-1">
                    <span
                      className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${
                        estNormalisee ? "bg-slate-100 text-slate-600" : "bg-stone-100 text-stone-500"
                      }`}
                    >
                      {estNormalisee ? "Normalisée" : "Simple"}
                    </span>
                    {styleStatut.texte && (
                      <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${styleStatut.classe}`}>
                        {styleStatut.texte}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-display text-base font-bold text-stone-900">
                  {formatFCFA(facture.vente.montant_total)}
                </span>
                <button
                  onClick={() => gererConversion(facture)}
                  disabled={conversionEnCours === facture.id}
                  className="p-2 rounded-lg border border-stone-300 text-stone-600 hover:bg-stone-50 disabled:opacity-50"
                  title={estNormalisee ? "Repasser en facture simple" : "Convertir en facture normalisée"}
                >
                  <RefreshCw size={16} className={conversionEnCours === facture.id ? "animate-spin" : ""} />
                </button>
                <button
                  onClick={() => entreprise && genererFacturePDF(facture, entreprise)}
                  className="p-2 rounded-lg border border-stone-300 text-stone-600 hover:bg-stone-50"
                  title="Télécharger le PDF"
                >
                  <Download size={16} />
                </button>
              </div>
            </div>
          );
        })}
        {factures.length === 0 && (
          <p className="p-6 text-center text-stone-400 text-sm">
            Aucune facture pour le moment — elles sont générées automatiquement à chaque vente.
          </p>
        )}
      </div>
    </div>
  );
}
