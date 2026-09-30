import { useEffect, useState } from "react";
import { FileText, Download, RefreshCw, Undo2, X } from "lucide-react";
import {
  listerFacturesProvisoires,
  listerFacturesRecentes,
  type FactureAvecDetails,
} from "../../services/facturesService";
import { EVENEMENT_FILE } from "../../services/offlineQueue";
import { changerTypeFacture } from "../../services/typeFactureService";
import { creerAvoirVente, listerQuantitesRetourneesParLigne, obtenirAvoir } from "../../services/ventesService";
import { genererFacturePDF } from "./facturePdf";
import { genererAvoirPDF } from "./avoirPdf";
import { useAuth } from "../../hooks/useAuth";
import { peutEcrire } from "../../lib/permissions";

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
  const { entreprise, utilisateur, permissions } = useAuth();
  const [factures, setFactures] = useState<FactureAvecDetails[]>([]);
  const [chargement, setChargement] = useState(true);
  const [conversionEnCours, setConversionEnCours] = useState<string | null>(null);
  const [factureAvoir, setFactureAvoir] = useState<FactureAvecDetails | null>(null);

  const peutAnnuler = peutEcrire(permissions, "factures");

  const [erreurChargement, setErreurChargement] = useState<string | null>(null);

  useEffect(() => {
    if (!entreprise) return;
    let actif = true;
    async function charger() {
      const [provisoires, serveur] = await Promise.all([
        listerFacturesProvisoires(entreprise!.id).catch(() => [] as FactureAvecDetails[]),
        listerFacturesRecentes().catch((e) => {
          if (actif) setErreurChargement((e as Error).message || "Factures indisponibles.");
          return [] as FactureAvecDetails[];
        }),
      ]);
      if (!actif) return;
      // Provisoires en tête ; une fois la vente envoyée, elle disparaît
      // de la file et sa vraie facture apparaît au chargement suivant.
      setFactures([...provisoires, ...serveur]);
      setChargement(false);
    }
    charger();
    // Après une synchronisation, les factures provisoires sont remplacées.
    window.addEventListener(EVENEMENT_FILE, charger);
    return () => {
      actif = false;
      window.removeEventListener(EVENEMENT_FILE, charger);
    };
  }, [entreprise]);

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
      {erreurChargement && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{erreurChargement}</p>
      )}

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
                    {facture.provisoire && (
                      <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                        Provisoire · en attente d'envoi
                      </span>
                    )}
                    {facture.vente.statut === "annulee" && (
                      <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-red-50 text-red-600">
                        Annulée
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-display text-base font-bold text-stone-900">
                  {formatFCFA(facture.vente.montant_total)}
                </span>
                {peutAnnuler && !facture.provisoire && facture.vente.statut !== "annulee" && (
                  <button
                    onClick={() => setFactureAvoir(facture)}
                    className="p-2 rounded-lg border border-stone-300 text-stone-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                    title="Annuler / Avoir"
                  >
                    <Undo2 size={16} />
                  </button>
                )}
                {peutAnnuler && !facture.provisoire && (
                  <button
                    onClick={() => gererConversion(facture)}
                    disabled={conversionEnCours === facture.id}
                    className="p-2 rounded-lg border border-stone-300 text-stone-600 hover:bg-stone-50 disabled:opacity-50"
                    title={estNormalisee ? "Repasser en facture simple" : "Convertir en facture normalisée"}
                  >
                    <RefreshCw size={16} className={conversionEnCours === facture.id ? "animate-spin" : ""} />
                  </button>
                )}
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

      {factureAvoir && entreprise && (
        <ModaleAvoirVente
          facture={factureAvoir}
          entreprise={entreprise}
          utilisateurId={utilisateur?.id || null}
          onFerme={() => setFactureAvoir(null)}
          onAvoirCree={(statutMisAJour) =>
            setFactures((prev) =>
              prev.map((f) =>
                f.id === factureAvoir.id
                  ? { ...f, vente: { ...f.vente, statut: statutMisAJour ? "annulee" : f.vente.statut } }
                  : f
              )
            )
          }
        />
      )}
    </div>
  );
}

function ModaleAvoirVente({
  facture,
  entreprise,
  utilisateurId,
  onFerme,
  onAvoirCree,
}: {
  facture: FactureAvecDetails;
  entreprise: import("../../types").Entreprise;
  utilisateurId: string | null;
  onFerme: () => void;
  onAvoirCree: (venteEntierementAnnulee: boolean) => void;
}) {
  const [quantitesDejaRetournees, setQuantitesDejaRetournees] = useState<Record<string, number>>({});
  const [quantitesARetourner, setQuantitesARetourner] = useState<Record<string, string>>({});
  const [motif, setMotif] = useState("");
  const [chargement, setChargement] = useState(true);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    listerQuantitesRetourneesParLigne(facture.vente.id)
      .then(setQuantitesDejaRetournees)
      .finally(() => setChargement(false));
  }, [facture.vente.id]);

  function restant(ligneId: string, quantiteOriginale: number) {
    return quantiteOriginale - (quantitesDejaRetournees[ligneId] || 0);
  }

  function toutRetourner() {
    const valeurs: Record<string, string> = {};
    facture.vente.lignes_vente.forEach((l) => {
      valeurs[l.id] = String(restant(l.id, l.quantite));
    });
    setQuantitesARetourner(valeurs);
  }

  async function gererSoumission() {
    if (!motif.trim()) {
      setErreur("Indique le motif de l'annulation / du retour.");
      return;
    }
    const lignes = Object.entries(quantitesARetourner)
      .map(([ligne_vente_id, q]) => ({ ligne_vente_id, quantite: Number(q) || 0 }))
      .filter((l) => l.quantite > 0);
    if (lignes.length === 0) {
      setErreur("Indique au moins une quantité à retourner.");
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      const avoirId = await creerAvoirVente(facture.vente.id, entreprise.id, motif.trim(), lignes, utilisateurId);
      const avoirCree = await obtenirAvoir(avoirId);

      const totalOriginal = facture.vente.lignes_vente.reduce((s, l) => s + l.quantite, 0);
      const totalRetourneApres =
        Object.values(quantitesDejaRetournees).reduce((s, q) => s + q, 0) +
        lignes.reduce((s, l) => s + l.quantite, 0);
      const venteEntierementAnnulee = totalRetourneApres >= totalOriginal;

      genererAvoirPDF(
        avoirCree,
        facture.vente.numero_vente,
        lignes.map((l) => {
          const ligneOriginale = facture.vente.lignes_vente.find((lv) => lv.id === l.ligne_vente_id)!;
          return {
            designation: ligneOriginale.article.designation,
            unite: ligneOriginale.article.unite,
            quantite: l.quantite,
            prix_unitaire: ligneOriginale.prix_unitaire,
            montant_ligne: l.quantite * ligneOriginale.prix_unitaire,
          };
        }),
        facture.vente.client?.nom || "Client comptant",
        facture.vente.mode_paiement === "credit",
        entreprise
      );

      onAvoirCree(venteEntierementAnnulee);
      onFerme();
    } catch (e: any) {
      setErreur(e.message || "Erreur lors de la création de l'avoir.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-navy/40" onClick={onFerme} />
      <div className="relative bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="font-display text-xl font-bold text-stone-900">
            Annuler / Avoir — {facture.vente.numero_vente}
          </h2>
          <button type="button" onClick={onFerme} className="text-stone-400">
            <X size={20} />
          </button>
        </div>

        {chargement ? (
          <p className="px-5 py-4 text-sm text-stone-400">Chargement...</p>
        ) : (
          <>
            <div className="px-5 pb-2 flex justify-end">
              <button onClick={toutRetourner} className="text-xs font-medium text-amber-700 underline">
                Tout retourner (annulation totale)
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 space-y-2">
              <div className="grid grid-cols-[1fr_auto_auto] gap-2 text-xs font-medium text-stone-400 px-1">
                <span>Article</span>
                <span className="w-16 text-center">Reste</span>
                <span className="w-16 text-center">Retour</span>
              </div>
              {facture.vente.lignes_vente.map((l) => {
                const reste = restant(l.id, l.quantite);
                return (
                  <div key={l.id} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center px-1 py-1.5">
                    <span className="text-sm font-medium text-stone-900 truncate">{l.article.designation}</span>
                    <span className="w-16 text-center text-sm text-stone-500">{reste}</span>
                    <input
                      type="number"
                      min={0}
                      max={reste}
                      disabled={reste <= 0}
                      value={quantitesARetourner[l.id] ?? ""}
                      onChange={(e) =>
                        setQuantitesARetourner((prev) => ({ ...prev, [l.id]: e.target.value }))
                      }
                      className="w-16 text-center text-sm border border-stone-300 rounded-lg py-1.5 disabled:bg-stone-100"
                    />
                  </div>
                );
              })}
            </div>

            <div className="px-5 py-3 border-t border-stone-100 space-y-3">
              <div>
                <label className="text-xs font-medium text-stone-500">Motif</label>
                <input
                  value={motif}
                  onChange={(e) => setMotif(e.target.value)}
                  placeholder="Erreur de saisie, produit défectueux, client insatisfait..."
                  className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
                />
              </div>
              {erreur && <p className="text-sm text-red-600">{erreur}</p>}
              <button
                onClick={gererSoumission}
                disabled={enCours}
                className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl disabled:opacity-60"
              >
                <Undo2 size={16} />
                {enCours ? "Traitement..." : "Confirmer le retour et générer l'avoir"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
