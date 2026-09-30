/**
 * Identité de cet appareil (générée une fois, conservée). Sert à savoir
 * quel appareil a fait une vente et lesquels n'ont pas encore
 * synchronisé au moment de la clôture.
 */
const CLE = "akweo_appareil_id";

export function identifiantAppareil(): string {
  let id = localStorage.getItem(CLE);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CLE, id);
  }
  return id;
}

export function libelleAppareil(): string {
  const ua = navigator.userAgent;
  const type = /iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))
    ? "Tablette"
    : /Mobi|iPhone|Android/i.test(ua)
      ? "Téléphone"
      : "Ordinateur";
  const systeme = /Android/i.test(ua)
    ? "Android"
    : /iPhone|iPad/i.test(ua)
      ? "iOS"
      : /Windows/i.test(ua)
        ? "Windows"
        : /Mac/i.test(ua)
          ? "Mac"
          : /Linux/i.test(ua)
            ? "Linux"
            : "";
  return `${type}${systeme ? " " + systeme : ""}`;
}
