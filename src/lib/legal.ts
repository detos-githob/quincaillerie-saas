/**
 * Version des CGU Akweo en vigueur. À incrémenter à chaque modification
 * du texte de /conditions-generales : la version acceptée est
 * enregistrée côté serveur sur l'entreprise, ce qui permet de savoir
 * quels clients ont accepté quelle version.
 */
export const CGU_VERSION = "2026-09-29";
export const CGU_DATE_MISE_A_JOUR = "29 septembre 2026";

/**
 * Informations de l'éditeur affichées dans les CGU.
 * À compléter avec les informations légales réelles avant la mise en
 * production (RCCM, IFU, adresse du siège).
 */
export const EDITEUR = {
  nom: "Akweo",
  formeJuridique: "Ets La persévérance solution",
  rccm: "RB/ABC/26 A 142785",
  ifu: "0202661295552",
  siege: "Cotonou, République du Bénin",
  emailSupport: "jerbtos@gmail.com",
} as const;

/**
 * Modèle proposé au gérant lorsqu'il rédige ses conditions de tontine
 * pour la première fois. Entièrement modifiable.
 */
export function modeleConditionsTontine(nomEntreprise: string): string {
  return `1. Objet
La tontine proposée par ${nomEntreprise} permet au client d'épargner progressivement, par versements libres, jusqu'à un montant (plafond) fixé à la souscription, afin de retirer des articles du magasin.

2. Versements
Chaque versement donne lieu à un reçu numéroté. Le client conserve ses reçus. Les versements sont acceptés en espèces ou par Mobile Money.

3. Retrait des articles
Les articles ne peuvent être retirés qu'une fois le plafond atteint. La valeur des articles retirés, calculée au prix de vente du jour du retrait, ne peut pas dépasser le montant épargné.

4. Prix
Les prix des articles peuvent évoluer entre la souscription et le retrait. Le prix appliqué est celui en vigueur le jour du retrait.

5. Abandon et remboursement
En cas d'abandon avant d'atteindre le plafond, les sommes versées [sont remboursées / sont converties en bon d'achat] dans un délai de [X] jours, après déduction de [frais éventuels].

6. Durée
La tontine doit être soldée dans un délai de [X] mois à compter de la souscription. Passé ce délai, [préciser ce qui s'applique].

7. Litiges
Tout différend sera réglé à l'amiable en priorité, sur présentation des reçus de versement.`;
}
