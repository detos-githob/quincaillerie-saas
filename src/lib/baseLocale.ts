/**
 * Petite base clé → valeur sur l'appareil (IndexedDB).
 *
 * Pourquoi IndexedDB et pas localStorage : capacité bien supérieure
 * (quelques Mo pour localStorage, largement de quoi stocker des milliers
 * d'articles et une journée de ventes ici), écriture asynchrone qui ne
 * fige pas l'interface, et données moins exposées aux nettoyages.
 */

const NOM_BASE = "akweo";
const VERSION = 1;
const MAGASIN = "kv";

let ouverture: Promise<IDBDatabase> | null = null;

function ouvrir(): Promise<IDBDatabase> {
  if (!ouverture) {
    ouverture = new Promise((resolve, reject) => {
      const requete = indexedDB.open(NOM_BASE, VERSION);
      requete.onupgradeneeded = () => {
        if (!requete.result.objectStoreNames.contains(MAGASIN)) requete.result.createObjectStore(MAGASIN);
      };
      requete.onsuccess = () => resolve(requete.result);
      requete.onerror = () => {
        ouverture = null;
        reject(requete.error);
      };
    });
  }
  return ouverture;
}

function transaction<T>(mode: IDBTransactionMode, action: (magasin: IDBObjectStore) => IDBRequest): Promise<T> {
  return ouvrir().then(
    (base) =>
      new Promise<T>((resolve, reject) => {
        const tx = base.transaction(MAGASIN, mode);
        const requete = action(tx.objectStore(MAGASIN));
        tx.oncomplete = () => resolve(requete.result as T);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

export function lireLocal<T>(cle: string): Promise<T | undefined> {
  return transaction<T | undefined>("readonly", (m) => m.get(cle));
}

export function ecrireLocal(cle: string, valeur: unknown): Promise<void> {
  return transaction<IDBValidKey>("readwrite", (m) => m.put(valeur, cle)).then(() => undefined);
}

export function supprimerLocal(cle: string): Promise<void> {
  return transaction<undefined>("readwrite", (m) => m.delete(cle)).then(() => undefined);
}

export async function supprimerParPrefixe(prefixe: string): Promise<void> {
  const cles = await transaction<IDBValidKey[]>("readonly", (m) => m.getAllKeys());
  await Promise.all(cles.filter((c) => String(c).startsWith(prefixe)).map((c) => supprimerLocal(String(c))));
}

/** Vrai si l'erreur vient du réseau (et non d'un refus du serveur). */
export function estErreurReseau(erreur: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const e = erreur as { message?: string; name?: string; code?: string; status?: number } | null;
  if (!e) return false;
  const message = `${e.name ?? ""} ${e.message ?? ""}`;
  return /Failed to fetch|NetworkError|Load failed|fetch failed|Network request failed|ERR_INTERNET|ERR_NETWORK|timeout/i.test(
    message
  );
}

// ---------------------------------------------------------------------
// Espace de cache : les données mises en cache (articles, clients) sont
// rangées par entreprise, pour qu'un changement de compte sur le même
// appareil ne montre jamais les données d'un autre commerce.
// ---------------------------------------------------------------------
let entrepriseCourante: string | null = null;

export function definirEntrepriseCourante(id: string | null): void {
  entrepriseCourante = id;
}

export function cleCache(nom: string): string | null {
  return entrepriseCourante ? `cache:${entrepriseCourante}:${nom}` : null;
}
