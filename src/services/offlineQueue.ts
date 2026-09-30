/**
 * File d'attente des opérations faites hors connexion (IndexedDB).
 *
 * Une seule file, dans l'ordre où les opérations ont été faites : un
 * client créé hors ligne part avant la vente ou la tontine qui
 * l'utilise, une tontine avant sa première cotisation.
 *
 * Chaque opération porte un identifiant unique créé sur l'appareil
 * (id_local) : le serveur s'en sert pour ne jamais l'enregistrer deux
 * fois, même si elle est renvoyée après une coupure.
 *
 * Réseau absent : l'opération reste en file indéfiniment. Refus du
 * serveur pour une autre raison : retentée, puis mise de côté dans
 * « rejetées » — jamais effacée sans action du gérant.
 */
import { ecrireLocal, lireLocal } from "../lib/baseLocale";

const CLE_FILE = "file_operations";
const CLE_REJETS = "operations_rejetees";
// Versions précédentes (reprises automatiquement) :
const CLE_FILE_V1 = "file_ventes";
const CLE_REJETS_V1 = "ventes_rejetees";
const CLE_LOCALSTORAGE_V0 = "akweo_file_ventes_en_attente";

export interface PayloadVente {
  p_entreprise_id: string;
  p_client_id: string | null;
  p_utilisateur_id: string | null;
  p_mode_paiement: string;
  p_type_facture: string;
  p_lignes: Array<Record<string, unknown>>;
}

export interface ClientHorsLigne {
  id: string;
  entreprise_id: string;
  nom: string;
  telephone: string | null;
  adresse: string | null;
  ifu: string | null;
  type_client: string;
}

export interface TontineHorsLigne {
  id: string;
  entreprise_id: string;
  client_id: string;
  plafond: number;
  utilisateur_id: string | null;
}

export interface MouvementStockHorsLigne {
  article_id: string;
  type: "entree" | "correction_manuelle";
  /** Variation : +20 pour une entrée, -3 pour une correction. */
  quantite: number;
  motif: string;
}

export interface CotisationHorsLigne {
  tontine_id: string;
  montant: number;
  mode_paiement: "especes" | "mobile_money";
}

interface Base {
  id_local: string;
  /** Moment réel de l'opération sur l'appareil (ISO). */
  date: string;
  entreprise_id: string;
  /** Description lisible pour le gérant (ex : « 2 × Ciment »). */
  resume: string;
  montant?: number;
  tentatives: number;
  derniere_erreur?: string;
}

export type Operation =
  | (Base & { type: "vente"; payload: PayloadVente })
  | (Base & { type: "client"; client: ClientHorsLigne })
  | (Base & { type: "tontine"; tontine: TontineHorsLigne })
  | (Base & { type: "cotisation"; cotisation: CotisationHorsLigne })
  | (Base & { type: "stock"; mouvement: MouvementStockHorsLigne });

export type OperationRejetee = Operation & { rejetee_le: string };

export const EVENEMENT_FILE = "akweo:file-ventes";

function notifier() {
  window.dispatchEvent(new Event(EVENEMENT_FILE));
}

// Sérialise les lectures-modifications-écritures dans cet onglet.
let chaine: Promise<unknown> = Promise.resolve();
function enSerie<T>(action: () => Promise<T>): Promise<T> {
  const suite = chaine.then(action, action);
  chaine = suite.catch(() => undefined);
  return suite;
}

export function resumeVente(payload: PayloadVente): { resume: string; montant: number } {
  const montant = payload.p_lignes.reduce(
    (s, l) => s + Number(l.quantite) * Number(l.prix_unitaire) - Number(l.remise ?? 0),
    0
  );
  const resume = payload.p_lignes.map((l) => `${l.quantite} × ${String(l.designation ?? "article")}`).join(", ");
  return { resume: `Vente : ${resume}`, montant };
}

// ---------------------------------------------------------------------
// Reprise des files des versions précédentes
// ---------------------------------------------------------------------
interface VenteV1 {
  id_local: string;
  vendu_le: string;
  payload: PayloadVente;
  tentatives: number;
  derniere_erreur?: string;
  rejetee_le?: string;
}

function venteV1VersOperation(v: VenteV1): Operation {
  return {
    type: "vente",
    id_local: v.id_local,
    date: v.vendu_le,
    entreprise_id: v.payload.p_entreprise_id,
    payload: v.payload,
    tentatives: v.tentatives ?? 0,
    derniere_erreur: v.derniere_erreur,
    ...resumeVente(v.payload),
  };
}

let migrationFaite = false;
async function migrer(): Promise<void> {
  if (migrationFaite) return;
  migrationFaite = true;
  try {
    const file = (await lireLocal<Operation[]>(CLE_FILE)) ?? [];
    const ajouter = (op: Operation) => {
      if (!file.some((o) => o.id_local === op.id_local)) file.push(op);
    };
    const brutV0 = localStorage.getItem(CLE_LOCALSTORAGE_V0);
    if (brutV0) {
      for (const a of JSON.parse(brutV0) as { id_local: string; payload: PayloadVente; cree_le: string }[]) {
        ajouter(venteV1VersOperation({ id_local: a.id_local, vendu_le: a.cree_le, payload: a.payload, tentatives: 0 }));
      }
    }
    for (const v of (await lireLocal<VenteV1[]>(CLE_FILE_V1)) ?? []) ajouter(venteV1VersOperation(v));
    file.sort((a, b) => a.date.localeCompare(b.date));
    await ecrireLocal(CLE_FILE, file);

    const rejetsV1 = (await lireLocal<VenteV1[]>(CLE_REJETS_V1)) ?? [];
    if (rejetsV1.length) {
      const rejets = (await lireLocal<OperationRejetee[]>(CLE_REJETS)) ?? [];
      for (const r of rejetsV1) {
        if (!rejets.some((o) => o.id_local === r.id_local)) {
          rejets.push({ ...venteV1VersOperation(r), rejetee_le: r.rejetee_le ?? new Date().toISOString() });
        }
      }
      await ecrireLocal(CLE_REJETS, rejets);
    }
    // On ne supprime les anciennes données qu'une fois la nouvelle file écrite.
    localStorage.removeItem(CLE_LOCALSTORAGE_V0);
    await ecrireLocal(CLE_FILE_V1, []);
    await ecrireLocal(CLE_REJETS_V1, []);
  } catch (e) {
    migrationFaite = false;
    console.error("Reprise de l'ancienne file hors ligne impossible", e);
  }
}

// ---------------------------------------------------------------------
// API
// ---------------------------------------------------------------------
export function listerOperations(): Promise<Operation[]> {
  return enSerie(async () => {
    await migrer();
    return (await lireLocal<Operation[]>(CLE_FILE)) ?? [];
  });
}

export function ajouterOperation(op: Operation): Promise<void> {
  return enSerie(async () => {
    await migrer();
    const file = (await lireLocal<Operation[]>(CLE_FILE)) ?? [];
    if (!file.some((o) => o.id_local === op.id_local)) file.push(op);
    await ecrireLocal(CLE_FILE, file);
  }).then(notifier);
}

export function retirerOperation(idLocal: string): Promise<void> {
  return enSerie(async () => {
    const file = (await lireLocal<Operation[]>(CLE_FILE)) ?? [];
    await ecrireLocal(
      CLE_FILE,
      file.filter((o) => o.id_local !== idLocal)
    );
  }).then(notifier);
}

export function noterEchec(idLocal: string, erreur: string, maxTentatives: number): Promise<"retente" | "rejetee"> {
  return enSerie(async () => {
    const file = (await lireLocal<Operation[]>(CLE_FILE)) ?? [];
    const op = file.find((o) => o.id_local === idLocal);
    if (!op) return "retente" as const;
    op.tentatives += 1;
    op.derniere_erreur = erreur;
    if (op.tentatives < maxTentatives) {
      await ecrireLocal(CLE_FILE, file);
      return "retente" as const;
    }
    const rejets = (await lireLocal<OperationRejetee[]>(CLE_REJETS)) ?? [];
    rejets.push({ ...op, rejetee_le: new Date().toISOString() });
    await ecrireLocal(CLE_REJETS, rejets);
    await ecrireLocal(
      CLE_FILE,
      file.filter((o) => o.id_local !== idLocal)
    );
    return "rejetee" as const;
  }).then((r) => {
    notifier();
    return r;
  });
}

export function listerOperationsRejetees(): Promise<OperationRejetee[]> {
  return enSerie(async () => {
    await migrer();
    return (await lireLocal<OperationRejetee[]>(CLE_REJETS)) ?? [];
  });
}

/** Le gérant a traité l'opération rejetée (ressaisie ou abandonnée). */
export function retirerOperationRejetee(idLocal: string): Promise<void> {
  return enSerie(async () => {
    const rejets = (await lireLocal<OperationRejetee[]>(CLE_REJETS)) ?? [];
    await ecrireLocal(
      CLE_REJETS,
      rejets.filter((o) => o.id_local !== idLocal)
    );
  }).then(notifier);
}

/** Remet une opération rejetée dans la file (après correction). */
export function relancerOperationRejetee(idLocal: string): Promise<void> {
  return enSerie(async () => {
    const rejets = (await lireLocal<OperationRejetee[]>(CLE_REJETS)) ?? [];
    const op = rejets.find((o) => o.id_local === idLocal);
    if (!op) return;
    const file = (await lireLocal<Operation[]>(CLE_FILE)) ?? [];
    const { rejetee_le: _ignore, ...reste } = op;
    file.push({ ...(reste as Operation), tentatives: 0 });
    file.sort((a, b) => a.date.localeCompare(b.date));
    await ecrireLocal(CLE_FILE, file);
    await ecrireLocal(
      CLE_REJETS,
      rejets.filter((o) => o.id_local !== idLocal)
    );
  }).then(notifier);
}
