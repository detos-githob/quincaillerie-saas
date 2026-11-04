import { supabase } from "../lib/supabaseClient";

// =====================================================================
// Contenu de la page Support : coordonnées, questions fréquentes et
// guides PDF. Lecture pour tous ; écriture réservée au super admin
// (contrôlée par la base, pas seulement par l'interface).
// =====================================================================

export interface SupportParametres {
  message_accueil: string;
  whatsapp: string | null;
  telephone: string | null;
  email: string | null;
  horaires: string | null;
  updated_at?: string;
}

export interface SupportFaq {
  id: string;
  question: string;
  reponse: string;
  ordre: number;
  visible: boolean;
}

export interface SupportGuide {
  id: string;
  titre: string;
  description: string | null;
  fichier: string;
  nom_fichier: string | null;
  taille_octets: number | null;
  ordre: number;
  visible: boolean;
  updated_at: string;
}

export interface ContenuSupport {
  parametres: SupportParametres;
  faq: SupportFaq[];
  guides: SupportGuide[];
}

const BUCKET = "support";
export const TAILLE_MAX_GUIDE = 20 * 1024 * 1024;
const CLE_CACHE = "akweo-support-contenu";

// Coordonnées de secours (variables de build) tant que le super admin
// n'a rien saisi.
const SECOURS: SupportParametres = {
  message_accueil: "Une question, un blocage, une envie de faire évoluer l'appli ? On est là.",
  whatsapp: (import.meta.env.VITE_SUPPORT_TELEPHONE as string | undefined) ?? null,
  telephone: (import.meta.env.VITE_SUPPORT_TELEPHONE as string | undefined) ?? null,
  email: (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined) ?? null,
  horaires: null,
};

function completer(p: Partial<SupportParametres> | null): SupportParametres {
  return {
    message_accueil: p?.message_accueil || SECOURS.message_accueil,
    whatsapp: p?.whatsapp || SECOURS.whatsapp,
    telephone: p?.telephone || SECOURS.telephone,
    email: p?.email || SECOURS.email,
    horaires: p?.horaires || null,
    updated_at: p?.updated_at,
  };
}

/** Dernier contenu chargé, pour afficher la page même hors connexion. */
export function contenuEnCache(): ContenuSupport | null {
  try {
    const brut = localStorage.getItem(CLE_CACHE);
    return brut ? (JSON.parse(brut) as ContenuSupport) : null;
  } catch {
    return null;
  }
}

export async function chargerSupport(): Promise<ContenuSupport> {
  const [p, f, g] = await Promise.all([
    supabase.from("support_parametres").select("message_accueil, whatsapp, telephone, email, horaires, updated_at").eq("id", 1).maybeSingle(),
    supabase.from("support_faq").select("id, question, reponse, ordre, visible").order("ordre").order("created_at"),
    supabase
      .from("support_guides")
      .select("id, titre, description, fichier, nom_fichier, taille_octets, ordre, visible, updated_at")
      .order("ordre")
      .order("created_at"),
  ]);
  if (p.error) throw p.error;
  if (f.error) throw f.error;
  if (g.error) throw g.error;
  const contenu: ContenuSupport = {
    parametres: completer(p.data),
    faq: (f.data ?? []) as SupportFaq[],
    guides: (g.data ?? []) as SupportGuide[],
  };
  try {
    // Seul le contenu public est gardé (le super admin voit aussi les éléments masqués).
    localStorage.setItem(
      CLE_CACHE,
      JSON.stringify({ ...contenu, faq: contenu.faq.filter((q) => q.visible), guides: contenu.guides.filter((x) => x.visible) })
    );
  } catch {
    /* stockage indisponible : sans effet */
  }
  return contenu;
}

/** Adresse de lecture d'un guide (fichier livré avec l'appli ou stocké dans Supabase). */
export function urlGuide(guide: Pick<SupportGuide, "fichier" | "updated_at">): string {
  if (guide.fichier.startsWith("/")) return guide.fichier;
  const url = supabase.storage.from(BUCKET).getPublicUrl(guide.fichier).data.publicUrl;
  // Le paramètre de version évite qu'un ancien PDF reste en cache après remplacement.
  return `${url}?v=${encodeURIComponent(guide.updated_at)}`;
}

/** Adresse de téléchargement (force l'enregistrement du fichier plutôt que son ouverture). */
export function urlTelechargement(guide: Pick<SupportGuide, "fichier" | "nom_fichier" | "titre">): string {
  const nom = guide.nom_fichier || `${guide.titre}.pdf`;
  if (guide.fichier.startsWith("/")) return guide.fichier;
  return supabase.storage.from(BUCKET).getPublicUrl(guide.fichier, { download: nom }).data.publicUrl;
}

export function formatTaille(octets: number | null): string {
  if (!octets) return "PDF";
  return octets >= 1024 * 1024 ? `PDF · ${(octets / 1024 / 1024).toFixed(1).replace(".", ",")} Mo` : `PDF · ${Math.ceil(octets / 1024)} Ko`;
}

// ------------------------------------------------------------ super admin
export async function enregistrerParametres(p: Omit<SupportParametres, "updated_at">): Promise<void> {
  const vide = (v: string | null) => (v && v.trim() ? v.trim() : null);
  const { data, error } = await supabase
    .from("support_parametres")
    .update({
      message_accueil: p.message_accueil.trim() || SECOURS.message_accueil,
      whatsapp: vide(p.whatsapp),
      telephone: vide(p.telephone),
      email: vide(p.email),
      horaires: vide(p.horaires),
    })
    .eq("id", 1)
    .select("id");
  verifier(data, error);
}

export async function enregistrerFaq(q: { id?: string; question: string; reponse: string; visible: boolean; ordre?: number }): Promise<void> {
  const ligne = { question: q.question.trim(), reponse: q.reponse.trim(), visible: q.visible };
  const { data, error } = q.id
    ? await supabase.from("support_faq").update(ligne).eq("id", q.id).select("id")
    : await supabase.from("support_faq").insert({ ...ligne, ordre: q.ordre ?? 0 }).select("id");
  verifier(data, error);
}

export async function basculerFaq(id: string, visible: boolean): Promise<void> {
  const { data, error } = await supabase.from("support_faq").update({ visible }).eq("id", id).select("id");
  verifier(data, error);
}

export async function supprimerFaq(id: string): Promise<void> {
  const { data, error } = await supabase.from("support_faq").delete().eq("id", id).select("id");
  verifier(data, error);
}

/** Réécrit l'ordre d'une liste après un déplacement. */
export async function reordonner(table: "support_faq" | "support_guides", ids: string[]): Promise<void> {
  const resultats = await Promise.all(ids.map((id, ordre) => supabase.from(table).update({ ordre }).eq("id", id).select("id")));
  resultats.forEach((r) => verifier(r.data, r.error));
}

async function verifierPdf(fichier: File): Promise<void> {
  if (fichier.size > TAILLE_MAX_GUIDE) throw new Error("Le fichier dépasse 20 Mo.");
  if (fichier.size < 100) throw new Error("Ce fichier est vide.");
  const entete = new Uint8Array(await fichier.slice(0, 5).arrayBuffer());
  const estPdf = String.fromCharCode(...entete) === "%PDF-";
  if (!estPdf) throw new Error("Ce fichier n'est pas un PDF.");
}

async function envoyerPdf(fichier: File): Promise<string> {
  await verifierPdf(fichier);
  const chemin = `guides/${crypto.randomUUID()}.pdf`;
  const { error } = await supabase.storage.from(BUCKET).upload(chemin, fichier, {
    contentType: "application/pdf",
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw new Error(`Envoi du PDF impossible : ${error.message}`);
  return chemin;
}

async function retirerFichier(fichier: string | null | undefined): Promise<void> {
  // Les guides livrés avec l'appli (/guides/…) ne sont jamais supprimés.
  if (!fichier || fichier.startsWith("/")) return;
  await supabase.storage.from(BUCKET).remove([fichier]);
}

export async function enregistrerGuide(g: {
  id?: string;
  titre: string;
  description: string;
  visible: boolean;
  ordre?: number;
  fichier?: File | null;
  ancienFichier?: string;
}): Promise<void> {
  if (!g.id && !g.fichier) throw new Error("Choisis le fichier PDF du guide.");
  let chemin: string | null = null;
  if (g.fichier) chemin = await envoyerPdf(g.fichier);

  const ligne: Record<string, unknown> = {
    titre: g.titre.trim(),
    description: g.description.trim() || null,
    visible: g.visible,
  };
  if (chemin && g.fichier) {
    ligne.fichier = chemin;
    ligne.nom_fichier = g.fichier.name.replace(/[^\w.\- ()À-ÿ]/g, "_").slice(0, 150);
    ligne.taille_octets = g.fichier.size;
  }

  const { data, error } = g.id
    ? await supabase.from("support_guides").update(ligne).eq("id", g.id).select("id")
    : await supabase.from("support_guides").insert({ ...ligne, ordre: g.ordre ?? 0 }).select("id");
  try {
    verifier(data, error);
  } catch (e) {
    await retirerFichier(chemin); // pas de fichier orphelin
    throw e;
  }
  if (chemin && g.ancienFichier) await retirerFichier(g.ancienFichier);
}

export async function basculerGuide(id: string, visible: boolean): Promise<void> {
  const { data, error } = await supabase.from("support_guides").update({ visible }).eq("id", id).select("id");
  verifier(data, error);
}

export async function supprimerGuide(guide: SupportGuide): Promise<void> {
  const { data, error } = await supabase.from("support_guides").delete().eq("id", guide.id).select("id");
  verifier(data, error);
  await retirerFichier(guide.fichier);
}

/** Une écriture refusée par la sécurité de la base ne renvoie aucune ligne : on le signale. */
function verifier(data: unknown[] | null, error: { message: string; code?: string } | null): void {
  if (error) throw traduire(error);
  if (!data || data.length === 0) throw new Error("Action réservée au super admin.");
}

function traduire(e: { message: string; code?: string }): Error {
  if (e.code === "42501" || /row-level security|permission denied/i.test(e.message)) {
    return new Error("Action réservée au super admin.");
  }
  if (e.code === "23514") return new Error("Une valeur n'est pas au bon format (email, téléphone ou longueur du texte).");
  return new Error(e.message);
}
