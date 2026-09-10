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

  // Mention honnête de l'état de validation DGI pour une facture
  // normalisée — on n'invente JAMAIS de QR code ni de NIM tant que la
  // validation e-MECeF réelle n'a pas eu lieu, ce serait un faux
  // document fiscal.
  if (facture.type_facture === "normalisee") {
    doc.setFontSize(8);
    if (facture.statut_emecef === "validee" && facture.nim) {
      doc.text(`NIM : ${facture.nim}`, marge, finTableau + 20);
    } else {
      doc.setTextColor(180, 120, 0);
      doc.text(
        "Facture normalisée en attente de validation e-MECeF (DGI) — NIM non encore attribué.",
        marge,
        finTableau + 20
      );
      doc.setTextColor(0, 0, 0);
    }
  }

  doc.save(`${facture.numero_facture}.pdf`);
}
