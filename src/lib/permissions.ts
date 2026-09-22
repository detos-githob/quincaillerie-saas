import type { RoleUtilisateur } from "../types";

/**
 * Identifiant de module fonctionnel, indépendant des routes exactes.
 * Sert à la fois à filtrer la navigation (AppShell) et à bloquer l'accès
 * direct par URL (ProtectedRoute) — une seule matrice, une seule
 * vérité, pas de logique de permission dupliquée entre les deux.
 */
export type Module =
  | "dashboard"
  | "vente"
  | "stock"
  | "inventaire"
  | "fournisseurs"
  | "livraisons"
  | "depot_boissons"
  | "clients"
  | "tontines"
  | "factures"
  | "depenses"
  | "equipe"
  | "abonnement"
  | "support"
  | "parametres";

/**
 * Niveau d'accès à un module :
 *   - "aucun"    : invisible, route bloquée
 *   - "lecture"  : consultation seule, actions de création/modification
 *                  masquées
 *   - "ecriture" : accès complet
 */
export type NiveauAcces = "aucun" | "lecture" | "ecriture";

/** Permissions résolues pour l'utilisateur courant : un niveau par module. */
export type PermissionsResolues = Record<Module, NiveauAcces>;

/**
 * Niveau PAR DÉFAUT de chaque rôle pour chaque module, avant toute
 * personnalisation par le gérant. Raisonnement métier :
 *   - gérant : accès complet à tout, y compris les réglages de
 *     l'entreprise — jamais personnalisable (voir peutModifierAccesDe)
 *   - comptable : pilotage financier (créances, factures, personnel &
 *     dépenses, tontines) + lecture du stock pour la valorisation
 *     comptable — PAS la logistique opérationnelle (fournisseurs,
 *     livraisons, dépôt boissons), qui relève du magasinier
 *   - magasinier : gestion physique du stock (réception, inventaire,
 *     livraisons) — aucun module financier, ne fait pas de vente
 *   - vendeur : point de vente au quotidien (vente, clients, factures,
 *     tontines) — pas de gestion de stock ni de finances
 * Le gérant peut ensuite, pour chaque membre de son équipe, relever ou
 * abaisser individuellement chaque module ("à volonté") — voir
 * `resoudrePermissions` et la table `permissions_utilisateur`.
 */
const NIVEAU_PAR_DEFAUT: Record<RoleUtilisateur, Partial<Record<Module, NiveauAcces>>> = {
  gerant: {
    dashboard: "ecriture",
    vente: "ecriture",
    stock: "ecriture",
    inventaire: "ecriture",
    fournisseurs: "ecriture",
    livraisons: "ecriture",
    depot_boissons: "ecriture",
    clients: "ecriture",
    tontines: "ecriture",
    factures: "ecriture",
    depenses: "ecriture",
    equipe: "ecriture",
    abonnement: "ecriture",
    support: "ecriture",
    parametres: "ecriture",
  },
  comptable: {
    dashboard: "ecriture",
    stock: "lecture",
    inventaire: "lecture",
    clients: "ecriture",
    tontines: "ecriture",
    factures: "ecriture",
    depenses: "ecriture",
    abonnement: "lecture",
    support: "ecriture",
  },
  magasinier: {
    stock: "ecriture",
    inventaire: "ecriture",
    fournisseurs: "ecriture",
    livraisons: "ecriture",
    depot_boissons: "ecriture",
    support: "ecriture",
  },
  vendeur: {
    vente: "ecriture",
    clients: "ecriture",
    tontines: "ecriture",
    factures: "ecriture",
    support: "ecriture",
  },
};

export const TOUS_LES_MODULES: Module[] = [
  "dashboard",
  "vente",
  "stock",
  "inventaire",
  "fournisseurs",
  "livraisons",
  "depot_boissons",
  "clients",
  "tontines",
  "factures",
  "depenses",
  "equipe",
  "abonnement",
  "support",
  "parametres",
];

export const LABELS_MODULE: Record<Module, string> = {
  dashboard: "Tableau de bord",
  vente: "Vente",
  stock: "Stock",
  inventaire: "Inventaire",
  fournisseurs: "Fournisseurs",
  livraisons: "Livraisons",
  depot_boissons: "Dépôt boissons",
  clients: "Clients",
  tontines: "Tontines",
  factures: "Factures",
  depenses: "Personnel & Dépenses",
  equipe: "Équipe",
  abonnement: "Abonnement",
  support: "Support",
  parametres: "Paramètres",
};

/**
 * Résout le niveau d'accès effectif de chaque module pour un
 * utilisateur : ses surcharges explicites (`overrides`, chargées depuis
 * la table `permissions_utilisateur`) l'emportent module par module sur
 * le défaut de son rôle. Le gérant n'a jamais de surcharge applicable
 * (toujours accès complet, quoi que contienne la table).
 */
export function resoudrePermissions(
  role: RoleUtilisateur | undefined,
  overrides: Partial<Record<Module, NiveauAcces>> = {}
): PermissionsResolues {
  const resolues = {} as PermissionsResolues;
  for (const module of TOUS_LES_MODULES) {
    if (role === "gerant") {
      resolues[module] = "ecriture";
    } else {
      resolues[module] = overrides[module] ?? NIVEAU_PAR_DEFAUT[role as RoleUtilisateur]?.[module] ?? "aucun";
    }
  }
  return resolues;
}

export function peutAcceder(permissions: PermissionsResolues | undefined, module: Module): boolean {
  return !!permissions && permissions[module] !== "aucun";
}

export function peutEcrire(permissions: PermissionsResolues | undefined, module: Module): boolean {
  return !!permissions && permissions[module] === "ecriture";
}

/** Le rôle gérant n'est jamais restreignable — toujours accès complet. */
export function peutModifierAccesDe(role: RoleUtilisateur): boolean {
  return role !== "gerant";
}

/**
 * Page d'atterrissage par défaut selon les permissions résolues —
 * utilisée par ProtectedRoute quand une redirection est nécessaire :
 * la première page à laquelle l'utilisateur a effectivement accès,
 * pour ne jamais le rediriger vers une page qui, elle aussi, lui est
 * fermée (ce qui créerait une boucle infinie).
 */
const ORDRE_PREFERENCE_ATTERRISSAGE: Module[] = [
  "dashboard",
  "vente",
  "stock",
  "inventaire",
  "clients",
  "factures",
  "tontines",
  "fournisseurs",
  "livraisons",
  "depot_boissons",
  "depenses",
  "support",
];

export function routeParDefaut(permissions: PermissionsResolues | undefined): string {
  if (!permissions) return "/support";
  for (const module of ORDRE_PREFERENCE_ATTERRISSAGE) {
    if (permissions[module] !== "aucun") {
      return CHEMIN_PAR_MODULE[module];
    }
  }
  return "/support";
}

export const LABELS_ROLE: Record<RoleUtilisateur, string> = {
  gerant: "Gérant",
  comptable: "Comptable",
  magasinier: "Magasinier",
  vendeur: "Vendeur",
};

const CHEMIN_PAR_MODULE: Record<Module, string> = {
  dashboard: "/",
  vente: "/vente",
  stock: "/stock",
  inventaire: "/inventaire",
  fournisseurs: "/fournisseurs",
  livraisons: "/livraisons",
  depot_boissons: "/depot-boissons",
  clients: "/clients",
  tontines: "/tontines",
  factures: "/factures",
  depenses: "/depenses",
  equipe: "/equipe",
  abonnement: "/mon-abonnement",
  support: "/support",
  parametres: "/parametres",
};

/**
 * Association chemin de route → module, utilisée par ProtectedRoute
 * pour bloquer l'accès direct (lien, favori...) à une page que
 * l'utilisateur courant n'est pas censé voir. Triée en interne par
 * longueur de préfixe décroissante pour que "/" ne masque pas les
 * routes plus spécifiques.
 */
const MODULE_PAR_PREFIXE_ROUTE: [string, Module][] = [
  ["/", "dashboard"],
  ["/vente", "vente"],
  ["/stock", "stock"],
  ["/inventaire", "inventaire"],
  ["/fournisseurs", "fournisseurs"],
  ["/livraisons", "livraisons"],
  ["/depot-boissons", "depot_boissons"],
  ["/clients", "clients"],
  ["/tontines", "tontines"],
  ["/factures", "factures"],
  ["/depenses", "depenses"],
  ["/equipe", "equipe"],
  ["/mon-abonnement", "abonnement"],
  ["/offres", "abonnement"],
  ["/paiement", "abonnement"],
  ["/support", "support"],
  ["/parametres", "parametres"],
];

export function moduleDeLaRoute(chemin: string): Module | null {
  const correspondances = MODULE_PAR_PREFIXE_ROUTE.filter(([prefixe]) =>
    prefixe === "/" ? chemin === "/" : chemin.startsWith(prefixe)
  ).sort((a, b) => b[0].length - a[0].length);
  return correspondances[0]?.[1] ?? null;
}
