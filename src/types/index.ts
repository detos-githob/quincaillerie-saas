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
  created_at?: string;
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
