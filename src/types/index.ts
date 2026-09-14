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
  secteur_activite: "quincaillerie" | "depot_boissons";
  created_at?: string;
}

export interface Fournisseur {
  id: string;
  entreprise_id: string;
  nom: string;
  telephone: string | null;
  adresse: string | null;
  ifu: string | null;
  actif: boolean;
}

export type TypeVente = "detail" | "demi_gros" | "gros";

export type StatutLivraison = "en_attente" | "en_cours" | "livree" | "annulee";

export interface Livraison {
  id: string;
  entreprise_id: string;
  vente_id: string;
  client_id: string | null;
  adresse_livraison: string;
  date_prevue: string | null;
  date_livraison: string | null;
  statut: StatutLivraison;
  notes: string | null;
  created_at: string;
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
  fournisseur_id: string | null;
  reference: string | null;
  designation: string;
  unite: string;
  prix_achat: number;
  prix_vente: number;
  prix_demi_gros: number | null;
  prix_gros: number | null;
  stock_actuel: number;
  stock_vides: number;
  montant_consigne: number;
  seuil_alerte: number;
  actif: boolean;
}

export type StatutConsigne = "en_cours" | "soldee";

export interface Consigne {
  id: string;
  entreprise_id: string;
  client_id: string | null;
  vente_id: string | null;
  article_id: string;
  quantite: number;
  quantite_rendue: number;
  montant_unitaire: number;
  statut: StatutConsigne;
  created_at: string;
  solde_le: string | null;
}

export interface Casse {
  id: string;
  entreprise_id: string;
  article_id: string;
  quantite: number;
  motif: string | null;
  utilisateur_id: string | null;
  created_at: string;
}

export interface Client {
  id: string;
  entreprise_id: string;
  nom: string;
  telephone: string | null;
  adresse: string | null;
  ifu: string | null;
  solde_credit: number;
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
  type_vente: TypeVente;
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
