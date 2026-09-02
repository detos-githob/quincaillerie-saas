import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { FactureAvecDetails } from "../../services/facturesService";
import type { Entreprise } from "../../types";

/**
 * Génère un PDF de facture simple et déclenche son téléchargement.
 *
 * La facture "normalisée" (Phase 3) réutilisera cette même mise en page
 * en ajoutant le NIM, le sceau électronique et le QR code renvoyés par
 * l'API e-MECeF, comme l'exige la DGI pour les entreprises au régime réel.
 */
export function genererFacturePDF(facture: FactureAvecDetails, entreprise: Entreprise): void {
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
  if (entreprise.ifu) {
    doc.text(`IFU : ${entreprise.ifu}`, marge, y);
    y += 5;
  }
  if (entreprise.telephone) {
    doc.text(`Tél : ${entreprise.telephone}`, marge, y);
    y += 5;
  }

  // Titre facture
  y += 6;
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  const titre =
    facture.type_facture === "normalisee" ? "FACTURE NORMALISÉE" : "FACTURE";
  doc.text(titre, 196, 18, { align: "right" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`N° ${facture.numero_facture}`, 196, 24, { align: "right" });
  doc.text(
    `Date : ${new Date(facture.date_emission).toLocaleDateString("fr-FR")}`,
    196,
    29,
    { align: "right" }
  );

  // Client
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.text("Client", marge, y);
  doc.setFont("helvetica", "normal");
  y += 5;
  const client = facture.vente.client;
  doc.text(client ? client.nom : "Client comptant", marge, y);
  if (client?.ifu) {
    y += 5;
    doc.text(`IFU : ${client.ifu}`, marge, y);
  }

  // Tableau des lignes
  y += 8;
  autoTable(doc, {
    startY: y,
    head: [["Désignation", "Qté", "Unité", "Prix unitaire", "Remise", "Montant"]],
    body: facture.vente.lignes_vente.map((l) => [
      l.article.designation,
      String(l.quantite),
      l.article.unite,
      `${l.prix_unitaire.toLocaleString("fr-FR")} F`,
      `${l.remise.toLocaleString("fr-FR")} F`,
      `${l.montant_ligne.toLocaleString("fr-FR")} F`,
    ]),
    headStyles: { fillColor: [28, 25, 23] },
    styles: { fontSize: 9 },
  });

  // Total
  // @ts-expect-error - lastAutoTable est ajouté dynamiquement par le plugin
  const finTableau = doc.lastAutoTable.finalY || y + 20;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(
    `Total : ${facture.vente.montant_total.toLocaleString("fr-FR")} F`,
    196,
    finTableau + 10,
    { align: "right" }
  );
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Mode de paiement : ${facture.vente.mode_paiement}`,
    marge,
    finTableau + 10
  );

  // Mention obligation e-MECeF si facture normalisée (placeholder Phase 3)
  if (facture.type_facture === "normalisee") {
    doc.setFontSize(8);
    doc.text(
      "NIM et sceau électronique e-MECeF à intégrer (module Phase 3).",
      marge,
      finTableau + 20
    );
  }

  doc.save(`${facture.numero_facture}.pdf`);
}
