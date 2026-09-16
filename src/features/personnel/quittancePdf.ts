import jsPDF from "jspdf";
import type { Employe, Entreprise, PaiementPersonnel } from "../../types";
import { LABELS_MOTIF_PAIEMENT } from "../../types";

/**
 * Formate un montant avec des points comme séparateurs de milliers.
 * On n'utilise PAS toLocaleString("fr-FR") : voir note dans facturePdf.ts.
 */
function formatMontantPDF(montant: number): string {
  return Math.round(montant)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

const LABELS_MODE_PAIEMENT: Record<string, string> = {
  especes: "Espèces",
  mobile_money: "Mobile Money",
  virement: "Virement",
};

/**
 * Génère la quittance PDF d'un paiement fait à un employé et déclenche
 * son téléchargement. Document simple, format reçu (pas de tableau
 * multi-lignes nécessaire, un paiement = un montant).
 */
export function genererQuittancePersonnelPDF(
  paiement: PaiementPersonnel,
  employe: Employe,
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
  doc.text("QUITTANCE DE PAIEMENT", 196, 18, { align: "right" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`N° ${paiement.numero_quittance}`, 196, 24, { align: "right" });
  doc.text(`Date : ${new Date(paiement.created_at).toLocaleDateString("fr-FR")}`, 196, 29, {
    align: "right",
  });

  // Bénéficiaire
  y += 10;
  doc.setDrawColor(220, 220, 220);
  doc.line(marge, y, 196, y);
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.text("Reçu de", marge, y);
  doc.setFont("helvetica", "normal");
  y += 6;
  doc.setFontSize(12);
  doc.text(employe.nom, marge, y);
  doc.setFontSize(10);
  if (employe.poste) {
    y += 5;
    doc.text(employe.poste, marge, y);
  }

  // Détails du paiement
  y += 12;
  const lignes: [string, string][] = [
    ["Motif", LABELS_MOTIF_PAIEMENT[paiement.motif]],
    ["Période concernée", paiement.periode || "—"],
    ["Mode de paiement", LABELS_MODE_PAIEMENT[paiement.mode_paiement] || paiement.mode_paiement],
  ];
  for (const [label, valeur] of lignes) {
    doc.setFont("helvetica", "bold");
    doc.text(`${label} :`, marge, y);
    doc.setFont("helvetica", "normal");
    doc.text(valeur, marge + 45, y);
    y += 7;
  }

  // Montant
  y += 8;
  doc.setDrawColor(28, 25, 23);
  doc.setLineWidth(0.5);
  doc.line(marge, y, 196, y);
  y += 12;
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(`Montant versé : ${formatMontantPDF(paiement.montant)} F CFA`, marge, y);

  // Signature
  y += 25;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Signature de l'employé", marge, y);
  doc.text("Signature du gérant", 140, y);
  doc.line(marge, y + 15, marge + 60, y + 15);
  doc.line(140, y + 15, 140 + 56, y + 15);

  doc.save(`${paiement.numero_quittance}.pdf`);
}
