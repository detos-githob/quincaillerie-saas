export type RegimeFiscal = "forfait" | "reel";
export type RoleUtilisateur = "gerant" | "comptable" | "vendeur";
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
