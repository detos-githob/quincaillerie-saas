import jsPDF from "jspdf";
import type { CotisationTontine, Entreprise, Tontine } from "../../types";

function formatMontantPDF(montant: number): string {
  return Math.round(montant)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

const LABELS_MODE_PAIEMENT: Record<string, string> = {
  especes: "Espèces",
  mobile_money: "Mobile Money",
};

/**
 * Génère le reçu PDF d'une cotisation versée sur une tontine client et
 * déclenche son téléchargement.
 */
export function genererRecuTontinePDF(
  cotisation: CotisationTontine,
  tontine: Tontine,
  nomClient: string,
  entreprise: Entreprise
): void {
  const doc = new jsPDF();
  const marge = 14;
  let y = 18;

  // En-tête entreprise
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(entreprise.nom, marge, y);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  y += 6;
  if (entreprise.adresse) {
    doc.text(entreprise.adresse, marge, y);
    y += 5;
  }
  if (entreprise.telephone) {
    doc.text(`Tél : ${entreprise.telephone}`, marge, y);
    y += 5;
  }

  // Titre
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("REÇU DE COTISATION — TONTINE", 196, 18, { align: "right" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`N° ${cotisation.numero_recu}`, 196, 24, { align: "right" });
  doc.text(`Date : ${new Date(cotisation.created_at).toLocaleDateString("fr-FR")}`, 196, 29, {
    align: "right",
  });

  y += 10;
  doc.setDrawColor(220, 220, 220);
  doc.line(marge, y, 196, y);
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.text("Reçu de", marge, y);
  doc.setFont("helvetica", "normal");
  y += 6;
  doc.setFontSize(12);
  doc.text(nomClient, marge, y);
  doc.setFontSize(10);

  // Détails
  y += 12;
  const lignes: [string, string][] = [
    ["Mode de paiement", LABELS_MODE_PAIEMENT[cotisation.mode_paiement] || cotisation.mode_paiement],
    ["Plafond de la tontine", `${formatMontantPDF(tontine.plafond)} F CFA`],
    ["Cumul après ce versement", `${formatMontantPDF(tontine.montant_cumule)} F CFA`],
  ];
  for (const [label, valeur] of lignes) {
    doc.setFont("helvetica", "bold");
    doc.text(`${label} :`, marge, y);
    doc.setFont("helvetica", "normal");
    doc.text(valeur, marge + 55, y);
    y += 7;
  }

  // Montant versé
  y += 8;
  doc.setDrawColor(28, 25, 23);
  doc.setLineWidth(0.5);
  doc.line(marge, y, 196, y);
  y += 12;
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(`Montant versé : ${formatMontantPDF(cotisation.montant)} F CFA`, marge, y);

  // Reste à verser / statut
  y += 10;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const reste = Math.max(0, tontine.plafond - tontine.montant_cumule);
  if (tontine.statut === "en_cours") {
    doc.text(`Reste à verser pour atteindre le plafond : ${formatMontantPDF(reste)} F CFA`, marge, y);
  } else {
    doc.setTextColor(5, 150, 105);
    doc.text("Plafond atteint — les produits réservés peuvent être récupérés.", marge, y);
    doc.setTextColor(0, 0, 0);
  }

  // Signature
  y += 25;
  doc.setFontSize(9);
  doc.text("Signature du client", marge, y);
  doc.text("Signature du gérant", 140, y);
  doc.line(marge, y + 15, marge + 60, y + 15);
  doc.line(140, y + 15, 140 + 56, y + 15);

  doc.save(`${cotisation.numero_recu}.pdf`);
}
