/**
 * File d'attente des ventes faites hors connexion (IndexedDB).
 *
 * Chaque vente reçoit sur l'appareil un identifiant unique (id_local) et
 * son heure réelle (vendu_le). Le serveur (RPC synchroniser_vente) s'en
 * sert pour ne jamais l'enregistrer deux fois et la dater correctement.
 *
 * Une vente qui ne peut pas être envoyée à cause du réseau reste en file
 * indéfiniment. Une vente refusée par le serveur pour une autre raison
 * (ex : article supprimé entre-temps) est retentée puis, après plusieurs
 * refus, mise de côté dans « rejetées » : elle n'est jamais effacée sans
 * que le gérant l'ait vue.
 */
import { ecrireLocal, lireLocal } from "../lib/baseLocale";

const CLE_FILE = "file_ventes";
const CLE_REJETS = "ventes_rejetees";
const CLE_ANCIENNE_FILE = "akweo_file_ventes_en_attente"; // localStorage, version précédente

export interface PayloadVente {
  p_entreprise_id: string;
  p_client_id: string | null;
  p_utilisateur_id: string | null;
  p_mode_paiement: string;
  p_type_facture: string;
  p_lignes: Array<Record<string, unknown>>;
}

export interface VenteEnAttente {
  id_local: string;
  vendu_le: string;
  payload: PayloadVente;
  tentatives: number;
  derniere_erreur?: string;
}

export interface VenteRejetee extends VenteEnAttente {
  rejetee_le: string;
}

export const EVENEMENT_FILE = "akweo:file-ventes";

function notifier() {
  window.dispatchEvent(new Event(EVENEMENT_FILE));
}

// Sérialise les écritures dans cet onglet (lecture-modification-écriture).
let chaine: Promise<unknown> = Promise.resolve();
function enSerie<T>(action: () => Promise<T>): Promise<T> {
  const suite = chaine.then(action, action);
  chaine = suite.catch(() => undefined);
  return suite;
}

let migrationFaite = false;
async function migrerAncienneFile(): Promise<void> {
  if (migrationFaite) return;
  migrationFaite = true;
  const brut = localStorage.getItem(CLE_ANCIENNE_FILE);
  if (!brut) return;
  try {
    const anciennes = JSON.parse(brut) as { id_local: string; payload: PayloadVente; cree_le: string }[];
    const file = (await lireLocal<VenteEnAttente[]>(CLE_FILE)) ?? [];
    for (const a of anciennes) {
      if (!file.some((v) => v.id_local === a.id_local)) {
        file.push({ id_local: a.id_local, vendu_le: a.cree_le, payload: a.payload, tentatives: 0 });
      }
    }
    await ecrireLocal(CLE_FILE, file);
    localStorage.removeItem(CLE_ANCIENNE_FILE);
  } catch (e) {
    console.error("Migration de l'ancienne file hors ligne impossible", e);
  }
}

export function listerVentesEnAttente(): Promise<VenteEnAttente[]> {
  return enSerie(async () => {
    await migrerAncienneFile();
    return (await lireLocal<VenteEnAttente[]>(CLE_FILE)) ?? [];
  });
}

export function ajouterVenteEnAttente(vente: VenteEnAttente): Promise<void> {
  return enSerie(async () => {
    await migrerAncienneFile();
    const file = (await lireLocal<VenteEnAttente[]>(CLE_FILE)) ?? [];
    if (!file.some((v) => v.id_local === vente.id_local)) file.push(vente);
    await ecrireLocal(CLE_FILE, file);
  }).then(notifier);
}

export function retirerVenteEnAttente(idLocal: string): Promise<void> {
  return enSerie(async () => {
    const file = (await lireLocal<VenteEnAttente[]>(CLE_FILE)) ?? [];
    await ecrireLocal(CLE_FILE, file.filter((v) => v.id_local !== idLocal));
  }).then(notifier);
}

export function noterEchec(idLocal: string, erreur: string, maxTentatives: number): Promise<"retente" | "rejetee"> {
  return enSerie(async () => {
    const file = (await lireLocal<VenteEnAttente[]>(CLE_FILE)) ?? [];
    const vente = file.find((v) => v.id_local === idLocal);
    if (!vente) return "retente" as const;
    vente.tentatives += 1;
    vente.derniere_erreur = erreur;
    if (vente.tentatives < maxTentatives) {
      await ecrireLocal(CLE_FILE, file);
      return "retente" as const;
    }
    const rejets = (await lireLocal<VenteRejetee[]>(CLE_REJETS)) ?? [];
    rejets.push({ ...vente, rejetee_le: new Date().toISOString() });
    await ecrireLocal(CLE_REJETS, rejets);
    await ecrireLocal(CLE_FILE, file.filter((v) => v.id_local !== idLocal));
    return "rejetee" as const;
  }).then((r) => {
    notifier();
    return r;
  });
}

export function listerVentesRejetees(): Promise<VenteRejetee[]> {
  return enSerie(async () => (await lireLocal<VenteRejetee[]>(CLE_REJETS)) ?? []);
}

/** Le gérant a traité une vente rejetée (ressaisie ou abandonnée). */
export function retirerVenteRejetee(idLocal: string): Promise<void> {
  return enSerie(async () => {
    const rejets = (await lireLocal<VenteRejetee[]>(CLE_REJETS)) ?? [];
    await ecrireLocal(CLE_REJETS, rejets.filter((v) => v.id_local !== idLocal));
  }).then(notifier);
}

/** Remet une vente rejetée dans la file (après correction côté serveur). */
export function relancerVenteRejetee(idLocal: string): Promise<void> {
  return enSerie(async () => {
    const rejets = (await lireLocal<VenteRejetee[]>(CLE_REJETS)) ?? [];
    const vente = rejets.find((v) => v.id_local === idLocal);
    if (!vente) return;
    const file = (await lireLocal<VenteEnAttente[]>(CLE_FILE)) ?? [];
    const { rejetee_le: _ignore, ...reste } = vente;
    file.push({ ...reste, tentatives: 0 });
    await ecrireLocal(CLE_FILE, file);
    await ecrireLocal(CLE_REJETS, rejets.filter((v) => v.id_local !== idLocal));
  }).then(notifier);
}
