export type RegimeFiscal = "forfait" | "reel";
export type RoleUtilisateur = "gerant" | "comptable" | "vendeur" | "magasinier";
export type ModePaiement = "especes" | "mobile_money" | "credit" | "mixte";
export type StatutVente = "payee" | "partielle" | "creance" | "annulee";
export type TypeFacture = "simple" | "normalisee";
export type NiveauAlerte = "info" | "warning" | "critique";
export type TypeAlerte =
  | "stock_bas"
  | "rupture"
  | "marge_faible"
  | "creance_retard"
  | "ca_baisse";

/** Niveau tarifaire appliqué à un client : détail, demi-gros ou gros. */
export type TypeClient = "detail" | "demi_gros" | "gros";

/** Statut du cycle de vie d'une commande passée à un fournisseur. */
export type StatutCommandeFournisseur =
  | "brouillon"
  | "envoyee"
  | "receptionnee_partielle"
  | "receptionnee"
  | "annulee";

/** Statut d'une livraison, qu'elle vienne d'une vente en gros ou d'un dépôt de boissons. */
export type StatutLivraison =
  | "en_attente"
  | "en_cours"
  | "livree"
  | "annulee";

/** Mouvements possibles sur le solde de consignes (casiers/bouteilles) d'un client. */
export type TypeMouvementConsigne = "sortie_consigne" | "retour_consigne" | "rachat_consigne";

/**
 * Secteur d'activité de l'entreprise, choisi à l'inscription. Détermine
 * quels modules (fournisseurs/gros, dépôt boissons...) apparaissent dans
 * la navigation. "autre" laisse l'utilisateur préciser son activité en
 * texte libre (voir Entreprise.secteur_activite_autre) ; les modules
 * spécifiques ne sont pas encore proposés pour ce cas ni pour
 * "alimentation_generale" / "pieces_detachees" (seuls les modules de
 * base — vente, stock, clients, factures... — y sont disponibles).
 */
export type SecteurActivite =
  | "quincaillerie"
  | "depot_boissons"
  | "alimentation_generale"
  | "pieces_detachees"
  | "autre";

export interface Entreprise {
  id: string;
  nom: string;
  ifu: string | null;
  regime_fiscal: RegimeFiscal;
  adresse: string | null;
  telephone: string | null;
  email: string | null;
  logo_url: string | null;
  plan_abonnement: string;
  periodicite_abonnement: "mensuel" | "annuel" | null;
  date_expiration_abonnement: string | null;
  actif: boolean;
  created_at?: string;
  secteur_activite: SecteurActivite;
  // Renseigné uniquement quand secteur_activite = "autre" : le libellé
  // que l'utilisateur a saisi lui-même pour décrire son activité.
  secteur_activite_autre: string | null;
  // Activités simultanément actives (gestion multi-activités) : peut
  // contenir plusieurs secteurs en plus du secteur principal
  // (secteur_activite), ex : une quincaillerie qui gère aussi un dépôt
  // de boissons. Toujours au moins secteur_activite dedans.
  secteurs_actifs: SecteurActivite[];
  // Preuve d'acceptation des CGU Akweo par le gérant (horodatage serveur).
  cgu_version?: string | null;
  cgu_acceptees_le?: string | null;
}

export interface Utilisateur {
  id: string;
  entreprise_id: string;
  auth_user_id: string;
  nom: string;
  telephone: string | null;
  role: RoleUtilisateur;
  actif: boolean;
}

export interface Categorie {
  id: string;
  entreprise_id: string;
  nom: string;
}

export interface Article {
  id: string;
  entreprise_id: string;
  categorie_id: string | null;
  reference: string | null;
  designation: string;
  unite: string;
  prix_achat: number;
  prix_vente: number;
  stock_actuel: number;
  seuil_alerte: number;
  actif: boolean;
  // Tarification gros / demi-gros (nullable = pallier non configuré,
  // l'article reste vendu au prix détail dans ce cas).
  prix_demi_gros: number | null;
  prix_gros: number | null;
  seuil_demi_gros: number | null; // quantité à partir de laquelle le prix demi-gros s'applique
  seuil_gros: number | null; // quantité à partir de laquelle le prix gros s'applique
  // Consigne (dépôt de boissons) : désactivée par défaut, sans effet
  // sur les articles d'un commerce qui n'en a pas besoin.
  gestion_consigne: boolean;
  prix_consigne_casier: number | null;
  prix_consigne_bouteille: number | null;
  capacite_casier: number | null; // nb de bouteilles par casier plein
  // Date de péremption (alimentation générale principalement) : permet
  // de repérer les produits à évacuer avant expiration.
  date_expiration: string | null;
}

export interface Client {
  id: string;
  entreprise_id: string;
  nom: string;
  telephone: string | null;
  adresse: string | null;
  ifu: string | null;
  solde_credit: number;
  type_client: TypeClient;
  // Solde de consignes dues par le client (dépôt de boissons) : nombre
  // de casiers vides / bouteilles consignées qu'il doit encore rendre.
  solde_consigne_casiers: number;
  solde_consigne_bouteilles: number;
}

export interface LigneVenteInput {
  article_id: string;
  designation: string;
  quantite: number;
  prix_unitaire: number;
  prix_achat_unitaire: number;
  remise: number;
}

export interface LigneVente {
  id: string;
  vente_id: string;
  article_id: string;
  quantite: number;
  prix_unitaire: number;
  prix_achat_unitaire: number;
  remise: number;
  montant_ligne: number;
  article?: { designation: string; unite: string };
}

export interface Vente {
  id: string;
  entreprise_id: string;
  numero_vente: string;
  client_id: string | null;
  utilisateur_id: string | null;
  montant_total: number;
  montant_paye: number;
  mode_paiement: ModePaiement;
  statut: StatutVente;
  created_at: string;
}

export interface Facture {
  id: string;
  entreprise_id: string;
  vente_id: string;
  type_facture: TypeFacture;
  numero_facture: string;
  date_emission: string;
  nim: string | null;
  qr_code_url: string | null;
  statut_emecef: string;
}

export interface Alerte {
  id: string;
  entreprise_id: string;
  type_alerte: TypeAlerte;
  article_id: string | null;
  client_id: string | null;
  message: string;
  niveau: NiveauAlerte;
  lue: boolean;
  created_at: string;
}

// =====================================================================
// FOURNISSEURS, VENTE EN GROS / DEMI-GROS & LIVRAISON
// =====================================================================

export interface Fournisseur {
  id: string;
  entreprise_id: string;
  nom: string;
  contact_nom: string | null;
  telephone: string | null;
  adresse: string | null;
  ifu: string | null;
  delai_livraison_jours: number | null;
  solde_du: number; // ce que l'entreprise doit encore payer à ce fournisseur
  actif: boolean;
  created_at: string;
}

export interface LigneCommandeFournisseurInput {
  article_id: string;
  quantite_commandee: number;
  prix_achat_unitaire: number;
}

export interface CommandeFournisseur {
  id: string;
  entreprise_id: string;
  fournisseur_id: string;
  numero_commande: string;
  statut: StatutCommandeFournisseur;
  date_commande: string;
  date_reception_prevue: string | null;
  montant_total: number;
  utilisateur_id: string | null;
  created_at: string;
}

export interface LigneCommandeFournisseur {
  id: string;
  commande_id: string;
  article_id: string;
  quantite_commandee: number;
  quantite_recue: number;
  prix_achat_unitaire: number;
  article?: { designation: string; unite: string };
}

export interface Livraison {
  id: string;
  entreprise_id: string;
  vente_id: string | null;
  client_id: string | null;
  adresse_livraison: string | null;
  statut: StatutLivraison;
  livreur_nom: string | null;
  livreur_telephone: string | null;
  date_prevue: string | null;
  date_livraison: string | null;
  notes: string | null;
  utilisateur_id: string | null;
  created_at: string;
  client?: { nom: string; telephone: string | null } | null;
}

// =====================================================================
// DEPOT DE BOISSONS : CASIERS, CONSIGNES, RETOURS, CASSES
// =====================================================================

export interface MouvementConsigne {
  id: string;
  entreprise_id: string;
  client_id: string;
  article_id: string | null;
  type_mouvement: TypeMouvementConsigne;
  quantite_casiers: number;
  quantite_bouteilles: number;
  montant: number;
  utilisateur_id: string | null;
  created_at: string;
  client?: { nom: string };
  article?: { designation: string };
}

export interface Casse {
  id: string;
  entreprise_id: string;
  article_id: string;
  quantite_bouteilles: number;
  quantite_casiers: number;
  valeur_perte: number;
  motif: string | null;
  utilisateur_id: string | null;
  created_at: string;
  article?: { designation: string };
}

// =====================================================================
// PERSONNEL (PAIEMENTS + QUITTANCE) & DEPENSES CONNEXES
// =====================================================================

export type MotifPaiementPersonnel = "salaire" | "prime" | "avance" | "autre";
export type ModePaiementSortie = "especes" | "mobile_money" | "virement";
export type CategorieDepense =
  | "loyer"
  | "electricite"
  | "eau"
  | "transport"
  | "fournitures"
  | "entretien"
  | "communication"
  | "autre";

export interface Employe {
  id: string;
  entreprise_id: string;
  nom: string;
  poste: string | null;
  telephone: string | null;
  salaire_reference: number | null;
  actif: boolean;
  created_at: string;
}

export interface PaiementPersonnel {
  id: string;
  entreprise_id: string;
  employe_id: string;
  numero_quittance: string;
  montant: number;
  periode: string | null;
  motif: MotifPaiementPersonnel;
  mode_paiement: ModePaiementSortie;
  utilisateur_id: string | null;
  created_at: string;
  employe?: { nom: string; poste: string | null };
}

export interface Depense {
  id: string;
  entreprise_id: string;
  categorie: CategorieDepense;
  description: string | null;
  montant: number;
  mode_paiement: ModePaiementSortie;
  utilisateur_id: string | null;
  created_at: string;
}

export const LABELS_CATEGORIE_DEPENSE: Record<CategorieDepense, string> = {
  loyer: "Loyer",
  electricite: "Électricité",
  eau: "Eau",
  transport: "Transport",
  fournitures: "Fournitures",
  entretien: "Entretien",
  communication: "Communication",
  autre: "Autre",
};

export const LABELS_MOTIF_PAIEMENT: Record<MotifPaiementPersonnel, string> = {
  salaire: "Salaire",
  prime: "Prime",
  avance: "Avance",
  autre: "Autre",
};

// =====================================================================
// TONTINE CLIENT
// =====================================================================

export type StatutTontine = "en_cours" | "atteint" | "cloturee";

export interface Tontine {
  id: string;
  entreprise_id: string;
  client_id: string;
  plafond: number;
  montant_cumule: number;
  statut: StatutTontine;
  date_debut: string;
  date_atteinte: string | null;
  utilisateur_id: string | null;
  created_at: string;
  // Snapshot figé côté serveur des conditions acceptées par le client.
  conditions_acceptees?: boolean;
  conditions_version?: number | null;
  conditions_texte?: string | null;
  conditions_acceptees_le?: string | null;
  client?: { nom: string; telephone: string | null };
}

export interface ConditionsTontine {
  entreprise_id: string;
  contenu: string;
  version: number;
  updated_at: string;
}

export interface CotisationTontine {
  id: string;
  tontine_id: string;
  entreprise_id: string;
  numero_recu: string;
  montant: number;
  mode_paiement: "especes" | "mobile_money";
  utilisateur_id: string | null;
  created_at: string;
}

export interface LignePanierTontine {
  id: string;
  tontine_id: string;
  entreprise_id: string;
  article_id: string;
  quantite: number;
  created_at: string;
  article?: { designation: string; unite: string; prix_vente: number };
}

export const LABELS_STATUT_TONTINE: Record<StatutTontine, { label: string; bg: string; texte: string }> = {
  en_cours: { label: "En cours", bg: "bg-amber-50", texte: "text-amber-700" },
  atteint: { label: "Plafond atteint", bg: "bg-emerald-50", texte: "text-emerald-700" },
  cloturee: { label: "Clôturée", bg: "bg-stone-100", texte: "text-stone-500" },
};

// =====================================================================
// ANNULATION / AVOIR DE VENTE
// =====================================================================

export interface Avoir {
  id: string;
  entreprise_id: string;
  vente_id: string;
  numero_avoir: string;
  motif: string;
  montant_total: number;
  utilisateur_id: string | null;
  created_at: string;
}

export interface LigneAvoir {
  id: string;
  avoir_id: string;
  ligne_vente_id: string;
  article_id: string;
  quantite: number;
  prix_unitaire: number;
  montant_ligne: number;
}

// =====================================================================
// LEDGER DES CRÉANCES CLIENTS
// =====================================================================

export type TypeMouvementCreance = "vente_credit" | "paiement" | "avoir" | "ajustement";

export interface MouvementCreance {
  id: string;
  entreprise_id: string;
  client_id: string;
  type_mouvement: TypeMouvementCreance;
  montant: number; // signé : positif = augmente la créance, négatif = la diminue
  solde_apres: number;
  reference_vente_id: string | null;
  reference_avoir_id: string | null;
  motif: string | null;
  utilisateur_id: string | null;
  created_at: string;
}

export const LABELS_TYPE_MOUVEMENT_CREANCE: Record<TypeMouvementCreance, string> = {
  vente_credit: "Vente à crédit",
  paiement: "Paiement reçu",
  avoir: "Avoir",
  ajustement: "Ajustement",
};

// =====================================================================
// TABLEAU DE BORD DÉCISIONNEL AKWEO
// =====================================================================

export interface TableauDecisionnel {
  ca_mois: number;
  marge_mois: number;
  total_creances: number;
  argent_immobilise: number;
  nombre_ruptures: number;
  nombre_stock_dormant: number;
}

// =====================================================================
// CLÔTURES (journée / mois / année)
// =====================================================================

export type TypeCloture = "jour" | "mois" | "annee";

interface VentilationModes {
  nombre: number;
  total: number;
  especes: number;
  mobile_money: number;
}

export interface SyntheseCloture {
  periode: { debut: string; fin: string; fuseau: string };
  ventes: {
    nombre: number;
    nombre_annulees: number;
    total: number;
    especes: number;
    mobile_money: number;
    a_credit: number;
  };
  avoirs: VentilationModes & { credit: number };
  encaissements_creances: VentilationModes;
  tontine: VentilationModes & { tontines_soldees: number };
  depenses: VentilationModes & { virement: number; par_categorie: Record<string, number> };
  personnel: VentilationModes & { virement: number };
  consignes: { rachats: number; casiers_sortis: number; casiers_retournes: number };
  casses: number;
  tresorerie: {
    especes: { entrees: number; sorties: number; flux: number };
    mobile_money: { entrees: number; sorties: number; flux: number };
  };
  resultat: {
    chiffre_affaires_net: number;
    marge_brute: number;
    charges: number;
    pertes: number;
    resultat_estime: number;
  };
  // Journée (avant clôture)
  fond_ouverture?: number | null;
  premiere_cloture?: boolean;
  // Mois / année
  etat?: {
    creances_clients: number;
    epargne_tontine: number;
    valeur_stock_achat: number;
    top_articles: { designation: string; quantite: number; montant: number }[];
    releve_le: string;
  };
  journees?: { nombre: number; ecart_total: number };
  par_mois?: { mois: string; chiffre_affaires_net: number; resultat_estime: number }[];
}

export interface Cloture {
  id: string;
  entreprise_id: string;
  type_cloture: TypeCloture;
  date_debut: string;
  date_fin: string;
  statut: "validee" | "annulee";
  fond_ouverture: number | null;
  especes_theoriques: number | null;
  especes_comptees: number | null;
  ecart_especes: number | null;
  fond_conserve: number | null;
  especes_retirees: number | null;
  mobile_money_theorique: number | null;
  chiffre_affaires_net: number;
  marge_brute: number;
  charges: number;
  resultat_estime: number;
  donnees: SyntheseCloture;
  commentaire: string | null;
  cloture_par: string | null;
  cloture_le: string;
  annulee_le: string | null;
  motif_annulation: string | null;
  auteur?: { nom: string } | null;
}

export interface ApercuCloture {
  cloture: Cloture | null;
  synthese: SyntheseCloture;
  raison_non_cloturable?: string | null;
}

export interface EtatClotures {
  aujourdhui: string;
  derniere_journee: string | null;
  dernier_mois: string | null;
  derniere_annee: string | null;
  journees_en_attente: string[];
  prochaine_journee: string | null;
  prochain_mois: string | null;
  prochain_mois_raison: string | null;
  prochaine_annee: string | null;
  prochaine_annee_raison: string | null;
}
