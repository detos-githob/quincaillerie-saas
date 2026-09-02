/**
 * Gestion simple de la file d'attente hors-ligne.
 *
 * Quand une vente ne peut pas être envoyée à Supabase (pas de réseau),
 * on la stocke dans le localStorage. Dès que la connexion revient,
 * on rejoue chaque vente en attente dans l'ordre.
 *
 * Pour une V2 plus robuste (gros volumes, plusieurs types de données
 * en attente), remplacer par IndexedDB (ex: librairie idb) plutôt
 * que localStorage.
 */

const CLE_FILE_VENTES = "quincaillerie_file_ventes_en_attente";

export interface VenteEnAttente {
  id_local: string;
  payload: unknown;
  cree_le: string;
}

export function ajouterVenteEnAttente(payload: unknown): void {
  const file = listerVentesEnAttente();
  file.push({
    id_local: crypto.randomUUID(),
    payload,
    cree_le: new Date().toISOString(),
  });
  localStorage.setItem(CLE_FILE_VENTES, JSON.stringify(file));
}

export function listerVentesEnAttente(): VenteEnAttente[] {
  const brut = localStorage.getItem(CLE_FILE_VENTES);
  return brut ? (JSON.parse(brut) as VenteEnAttente[]) : [];
}

export function retirerVenteEnAttente(idLocal: string): void {
  const file = listerVentesEnAttente().filter((v) => v.id_local !== idLocal);
  localStorage.setItem(CLE_FILE_VENTES, JSON.stringify(file));
}

export function nombreVentesEnAttente(): number {
  return listerVentesEnAttente().length;
}
