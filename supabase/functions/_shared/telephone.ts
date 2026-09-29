// Numéros béninois : depuis le 30/11/2024, les mobiles ont 10 chiffres
// commençant par 01 (01 + ancien numéro à 8 chiffres). L'API MTN attend
// le format international sans « + » : 229 01XXXXXXXX.
export function normaliserTelephoneBenin(saisie: unknown, sandbox: boolean): string | null {
  if (typeof saisie !== "string") return null;
  let n = saisie.replace(/\D/g, "");
  // En sandbox, MTN fournit ses propres numéros de test (format libre).
  if (sandbox) return /^\d{8,15}$/.test(n) ? n : null;
  if (n.startsWith("00229")) n = n.slice(5);
  else if (n.startsWith("229")) n = n.slice(3);
  if (/^\d{8}$/.test(n)) n = "01" + n; // ancien format à 8 chiffres
  if (!/^01\d{8}$/.test(n)) return null;
  return "229" + n;
}
