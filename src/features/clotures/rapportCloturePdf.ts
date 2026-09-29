import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { LABELS_CATEGORIE_DEPENSE } from "../../types";
import type { CategorieDepense, Cloture, Entreprise } from "../../types";
import { dateDepuisIso, libellePeriode } from "./formatCloture";

const NAVY: [number, number, number] = [14, 20, 36];

function f(montant: number | null | undefined): string {
  const n = Math.round(Number(montant) || 0);
  const abs = Math.abs(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${n < 0 ? "-" : ""}${abs} F`;
}

const TITRES = { jour: "RAPPORT DE CLÔTURE JOURNALIÈRE", mois: "RAPPORT DE CLÔTURE MENSUELLE", annee: "RAPPORT DE CLÔTURE ANNUELLE" };

/** Génère et télécharge le rapport PDF d'une clôture validée. */
export function genererRapportCloturePDF(cloture: Cloture, entreprise: Entreprise): void {
  const s = cloture.donnees;
  const doc = new jsPDF();
  const marge = 14;
  const droite = 196;

  // En-tête
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.text(entreprise.nom, marge, 18);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  let yEntete = 23;
  if (entreprise.adresse) {
    doc.text(entreprise.adresse, marge, yEntete);
    yEntete += 4.5;
  }
  if (entreprise.telephone) doc.text(`Tél : ${entreprise.telephone}`, marge, yEntete);

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(TITRES[cloture.type_cloture], droite, 18, { align: "right" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(libellePeriode(cloture.type_cloture, cloture.date_debut), droite, 24, { align: "right" });
  doc.setFontSize(8);
  doc.setTextColor(120, 113, 108);
  doc.text(
    `Clôturé le ${new Date(cloture.cloture_le).toLocaleString("fr-FR")}${cloture.auteur?.nom ? ` par ${cloture.auteur.nom}` : ""}`,
    droite,
    29,
    { align: "right" }
  );
  doc.setTextColor(0, 0, 0);

  let y = 36;
  const tableau = (titre: string, lignes: [string, string][]) => {
    autoTable(doc, {
      startY: y,
      margin: { left: marge, right: marge },
      head: [[titre, ""]],
      body: lignes,
      theme: "grid",
      headStyles: { fillColor: NAVY, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 1: { halign: "right", cellWidth: 45 } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
  };

  tableau("Résultat de la période", [
    ["Chiffre d'affaires net (ventes - avoirs)", f(s.resultat.chiffre_affaires_net)],
    ["Marge brute", f(s.resultat.marge_brute)],
    ["Charges (dépenses + personnel)", f(s.resultat.charges)],
    ["Pertes (casses)", f(s.resultat.pertes)],
    ["Résultat estimé", f(s.resultat.resultat_estime)],
  ]);

  tableau(`Ventes (${s.ventes.nombre})`, [
    ["Espèces", f(s.ventes.especes)],
    ["Mobile Money", f(s.ventes.mobile_money)],
    ["À crédit", f(s.ventes.a_credit)],
    ["Total des ventes", f(s.ventes.total)],
    [`Avoirs émis (${s.avoirs.nombre})`, f(-s.avoirs.total)],
  ]);

  tableau("Autres encaissements", [
    [`Créances clients (${s.encaissements_creances.nombre})`, f(s.encaissements_creances.total)],
    [`Cotisations tontine (${s.tontine.nombre})`, f(s.tontine.total)],
    ["Rachats de consignes", f(s.consignes.rachats)],
  ]);

  const categories = Object.entries(s.depenses.par_categorie ?? {}) as [CategorieDepense, number][];
  tableau("Sorties d'argent", [
    ...categories.map(([c, m]) => [`Dépense : ${LABELS_CATEGORIE_DEPENSE[c] ?? c}`, f(m)] as [string, string]),
    [`Personnel (${s.personnel.nombre})`, f(s.personnel.total)],
    ["Remboursements d'avoirs", f(s.avoirs.especes + s.avoirs.mobile_money)],
  ]);

  if (cloture.type_cloture === "jour") {
    tableau("Caisse espèces", [
      ["Fond de caisse à l'ouverture", f(cloture.fond_ouverture)],
      ["+ Entrées en espèces", f(s.tresorerie.especes.entrees)],
      ["- Sorties en espèces", f(s.tresorerie.especes.sorties)],
      ["= Espèces attendues", f(cloture.especes_theoriques)],
      ["Espèces comptées", f(cloture.especes_comptees)],
      ["Écart", f(cloture.ecart_especes)],
      ["Fond conservé pour le lendemain", f(cloture.fond_conserve)],
      ["Espèces retirées / versées", f(cloture.especes_retirees)],
      ["Mobile Money attendu (solde de la journée)", f(cloture.mobile_money_theorique)],
    ]);
  } else if (s.etat) {
    tableau("Situation à la date de clôture", [
      ["Créances clients à recouvrer", f(s.etat.creances_clients)],
      ["Épargne tontine due aux clients", f(s.etat.epargne_tontine)],
      ["Valeur du stock (prix d'achat)", f(s.etat.valeur_stock_achat)],
      [`Écarts de caisse cumulés (${s.journees?.nombre ?? 0} journées)`, f(s.journees?.ecart_total)],
    ]);
    if (cloture.type_cloture === "annee" && s.par_mois?.length) {
      autoTable(doc, {
        startY: y,
        margin: { left: marge, right: marge },
        head: [["Mois", "CA net", "Résultat estimé"]],
        body: s.par_mois.map((m) => [
          dateDepuisIso(m.mois).toLocaleDateString("fr-FR", { month: "long" }),
          f(m.chiffre_affaires_net),
          f(m.resultat_estime),
        ]),
        theme: "grid",
        headStyles: { fillColor: NAVY, fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
    }
  }

  if (cloture.commentaire) {
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Commentaire", marge, y);
    doc.setFont("helvetica", "normal");
    const lignes = doc.splitTextToSize(cloture.commentaire, droite - marge);
    doc.text(lignes, marge, y + 5);
    y += 7 + lignes.length * 4.5;
  }

  if (y > 255) {
    doc.addPage();
    y = 20;
  }
  y += 8;
  doc.setDrawColor(...NAVY);
  doc.line(marge, y + 12, marge + 70, y + 12);
  doc.setFontSize(8);
  doc.text("Signature du gérant", marge, y + 17);

  if (cloture.statut === "annulee") {
    doc.setTextColor(200, 30, 30);
    doc.setFontSize(40);
    doc.text("ROUVERTE", 105, 150, { align: "center", angle: 30 });
  }

  const suffixe = cloture.date_debut.slice(0, cloture.type_cloture === "jour" ? 10 : cloture.type_cloture === "mois" ? 7 : 4);
  doc.save(`cloture-${cloture.type_cloture}-${suffixe}.pdf`);
}
