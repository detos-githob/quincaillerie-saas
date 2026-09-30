import { supabase } from "../lib/supabaseClient";
import { cleCache, ecrireLocal, estErreurReseau, lireLocal } from "../lib/baseLocale";
import { listerOperations, type Operation } from "./offlineQueue";
import type { Article, Client } from "../types";

export interface FactureAvecDetails {
  id: string;
  numero_facture: string;
  type_facture: string;
  statut_emecef: string;
  nim: string | null;
  date_emission: string;
  /** Facture construite sur l'appareil pour une vente pas encore envoyée. */
  provisoire?: boolean;
  vente: {
    id: string;
    numero_vente: string;
    montant_total: number;
    mode_paiement: string;
    statut: string;
    client_id: string | null;
    client: { nom: string; ifu: string | null; adresse: string | null } | null;
    lignes_vente: {
      id: string;
      article_id: string;
      quantite: number;
      prix_unitaire: number;
      remise: number;
      montant_ligne: number;
      article: { designation: string; unite: string };
    }[];
  };
}

export async function listerFacturesRecentes(limite = 50): Promise<FactureAvecDetails[]> {
  const cle = cleCache("factures");
  try {
    const { data, error } = await supabase
      .from("factures")
      .select(
        `
        id, numero_facture, type_facture, statut_emecef, nim, date_emission,
        vente:ventes (
          id, numero_vente, montant_total, mode_paiement, statut, client_id,
          client:clients ( nom, ifu, adresse ),
          lignes_vente (
            id, article_id, quantite, prix_unitaire, remise, montant_ligne,
            article:articles ( designation, unite )
          )
        )
      `
      )
      .order("date_emission", { ascending: false })
      .limit(limite);
    if (error) throw error;
    if (cle) await ecrireLocal(cle, data).catch(() => undefined);
    return data as unknown as FactureAvecDetails[];
  } catch (err) {
    if (cle && estErreurReseau(err)) {
      return (await lireLocal<FactureAvecDetails[]>(cle).catch(() => undefined)) ?? [];
    }
    throw err;
  }
}

/**
 * Factures PROVISOIRES des ventes faites hors ligne et pas encore
 * envoyées. Construites sur l'appareil à partir de la vente en attente :
 * le numéro définitif est attribué par le serveur à la synchronisation.
 */
export async function listerFacturesProvisoires(entrepriseId: string): Promise<FactureAvecDetails[]> {
  const ventes = (await listerOperations()).filter(
    (o): o is Extract<Operation, { type: "vente" }> => o.type === "vente" && o.entreprise_id === entrepriseId
  );
  if (ventes.length === 0) return [];
  const [clients, articles] = await Promise.all([
    lireCacheListe<Client>("clients"),
    lireCacheListe<Article>("articles"),
  ]);

  return ventes.reverse().map((o) => {
    const p = o.payload;
    const client = p.p_client_id ? clients.find((c) => c.id === p.p_client_id) : undefined;
    const lignes = p.p_lignes.map((l, i) => {
      const article = articles.find((a) => a.id === l.article_id);
      const quantite = Number(l.quantite);
      const prix = Number(l.prix_unitaire);
      const remise = Number(l.remise ?? 0);
      return {
        id: `${o.id_local}-${i}`,
        article_id: String(l.article_id),
        quantite,
        prix_unitaire: prix,
        remise,
        montant_ligne: quantite * prix - remise,
        article: { designation: String(l.designation ?? article?.designation ?? "Article"), unite: article?.unite ?? "" },
      };
    });
    return {
      id: o.id_local,
      numero_facture: `PROV-${o.id_local.slice(0, 8).toUpperCase()}`,
      type_facture: p.p_type_facture,
      statut_emecef: "provisoire",
      nim: null,
      date_emission: o.date,
      provisoire: true,
      vente: {
        id: o.id_local,
        numero_vente: "en attente",
        montant_total: lignes.reduce((s, l) => s + l.montant_ligne, 0),
        mode_paiement: p.p_mode_paiement,
        statut: "en_attente",
        client_id: p.p_client_id,
        client: client ? { nom: client.nom, ifu: client.ifu ?? null, adresse: client.adresse ?? null } : null,
        lignes_vente: lignes,
      },
    };
  });
}

async function lireCacheListe<T>(nom: string): Promise<T[]> {
  const cle = cleCache(nom);
  return (cle ? await lireLocal<T[]>(cle).catch(() => undefined) : undefined) ?? [];
}
