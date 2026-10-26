// Chiffrement des clés API des comptes marchands (AES-256-GCM).
//
// Secret obligatoire (supabase secrets set ...) :
//   CLE_CHIFFREMENT_PAIEMENTS   32 octets aléatoires encodés en base64
//
// Générer une clé (PowerShell ou terminal) :
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
//
// ⚠️ Ne JAMAIS changer cette clé une fois des comptes enregistrés : les clés
// déjà chiffrées deviendraient illisibles (il faudrait les ressaisir).
//
// Le texte chiffré est lié à l'identifiant du compte (données associées) :
// copier le secret d'un compte sur un autre le rend indéchiffrable.

const encodeur = new TextEncoder();
const decodeur = new TextDecoder();

function versBase64(octets: Uint8Array): string {
  let s = "";
  for (const o of octets) s += String.fromCharCode(o);
  return btoa(s);
}

function depuisBase64(texte: string): Uint8Array<ArrayBuffer> {
  const s = atob(texte);
  const octets = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) octets[i] = s.charCodeAt(i);
  return octets;
}

let cleEnCache: CryptoKey | null = null;

async function cle(): Promise<CryptoKey> {
  if (cleEnCache) return cleEnCache;
  const brute = Deno.env.get("CLE_CHIFFREMENT_PAIEMENTS");
  if (!brute) throw new Error("Configuration incomplète : secret CLE_CHIFFREMENT_PAIEMENTS manquant.");
  const octets = depuisBase64(brute.trim());
  if (octets.length !== 32) throw new Error("CLE_CHIFFREMENT_PAIEMENTS doit faire 32 octets (base64).");
  cleEnCache = await crypto.subtle.importKey("raw", octets, "AES-GCM", false, ["encrypt", "decrypt"]);
  return cleEnCache;
}

export async function chiffrer(donnees: unknown, lieA: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const chiffre = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encodeur.encode(lieA) },
    await cle(),
    encodeur.encode(JSON.stringify(donnees)),
  );
  return `v1:${versBase64(iv)}:${versBase64(new Uint8Array(chiffre))}`;
}

export async function dechiffrer<T>(texte: string, lieA: string): Promise<T> {
  const [version, iv, chiffre] = texte.split(":");
  if (version !== "v1" || !iv || !chiffre) throw new Error("Format de clé chiffrée inconnu.");
  try {
    const clair = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: depuisBase64(iv), additionalData: encodeur.encode(lieA) },
      await cle(),
      depuisBase64(chiffre),
    );
    return JSON.parse(decodeur.decode(clair)) as T;
  } catch {
    throw new Error("Impossible de lire les clés de ce compte. Ressaisis-les dans Paramètres.");
  }
}
