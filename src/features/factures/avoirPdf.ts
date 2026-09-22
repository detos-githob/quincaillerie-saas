import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Avoir, Entreprise } from "../../types";

function formatMontantPDF(montant: number): string {
  return Math.round(montant)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export interface LigneAvoirPourPDF {
  designation: string;
  unite: string;
  quantite: number;
  prix_unitaire: number;
  montant_ligne: number;
}

/**
 * Génère le PDF d'un avoir (note de crédit) suite à l'annulation totale
 * ou au retour partiel d'une vente, et déclenche son téléchargement.
 */
export function genererAvoirPDF(
  avoir: Avoir,
  numeroVenteOrigine: string,
  lignes: LigneAvoirPourPDF[],
  nomClient: string,
  ventePayeeACredit: boolean,
  entreprise: Entreprise
): void {
  const doc = new jsPDF();
  const marge = 14;
  let y = 18;

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

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("AVOIR", 196, 18, { align: "right" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`N° ${avoir.numero_avoir}`, 196, 24, { align: "right" });
  doc.text(`Date : ${new Date(avoir.created_at).toLocaleDateString("fr-FR")}`, 196, 29, { align: "right" });
  doc.text(`Réf. vente : ${numeroVenteOrigine}`, 196, 34, { align: "right" });

  y += 10;
  doc.setDrawColor(220, 220, 220);
  doc.line(marge, y, 196, y);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.text("Client", marge, y);
  doc.setFont("helvetica", "normal");
  y += 6;
  doc.text(nomClient, marge, y);
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.text("Motif :", marge, y);
  doc.setFont("helvetica", "normal");
  doc.text(avoir.motif, marge + 20, y);

  y += 8;

  autoTable(doc, {
    startY: y,
    head: [["Article", "Qté retournée", "Prix unit.", "Montant"]],
    body: lignes.map((l) => [
      `${l.designation} (${l.unite})`,
      String(l.quantite),
      formatMontantPDF(l.prix_unitaire),
      formatMontantPDF(l.montant_ligne),
    ]),
    theme: "grid",
    headStyles: { fillColor: [28, 25, 23] },
    styles: { fontSize: 9 },
  });

  const finTableau = (doc as any).lastAutoTable.finalY + 10;

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(`Total avoir : ${formatMontantPDF(avoir.montant_total)} F CFA`, marge, finTableau);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  if (ventePayeeACredit) {
    doc.text("Ce montant a été déduit de la créance du client.", marge, finTableau + 8);
  } else {
    doc.text("Vente initialement payée : montant à rembourser au client.", marge, finTableau + 8);
  }

  doc.save(`${avoir.numero_avoir}.pdf`);
}
