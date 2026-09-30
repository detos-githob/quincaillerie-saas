import { useEffect, useState } from "react";

interface EvenementInstallation extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type Plateforme = "ios" | "android" | "windows" | "mac" | "autre";

export function detecterPlateforme(): Plateforme {
  const ua = navigator.userAgent;
  // iPadOS se présente comme un Mac : on le repère par l'écran tactile.
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh/i.test(ua)) return "mac";
  return "autre";
}

export function estInstallee(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

// L'événement peut arriver avant le montage de React : on le capte dès
// le chargement du module.
let invitationEnAttente: EvenementInstallation | null = null;
const abonnes = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    invitationEnAttente = e as EvenementInstallation;
    abonnes.forEach((f) => f());
  });
  window.addEventListener("appinstalled", () => {
    invitationEnAttente = null;
    abonnes.forEach((f) => f());
  });
}

/**
 * Installation de l'application sur l'appareil.
 * - Chrome / Edge / Android : le navigateur propose une installation en
 *   un clic (peutInstaller = true).
 * - iPhone / iPad (Safari) : pas d'installation automatique ; il faut
 *   passer par « Partager > Sur l'écran d'accueil » (à expliquer).
 */
export function useInstallation() {
  const [, forcer] = useState(0);
  const [installee, setInstallee] = useState(estInstallee());

  useEffect(() => {
    const maj = () => {
      forcer((n) => n + 1);
      setInstallee(estInstallee());
    };
    abonnes.add(maj);
    const media = window.matchMedia("(display-mode: standalone)");
    media.addEventListener?.("change", maj);
    return () => {
      abonnes.delete(maj);
      media.removeEventListener?.("change", maj);
    };
  }, []);

  async function installer(): Promise<boolean> {
    if (!invitationEnAttente) return false;
    await invitationEnAttente.prompt();
    const { outcome } = await invitationEnAttente.userChoice;
    invitationEnAttente = null;
    forcer((n) => n + 1);
    return outcome === "accepted";
  }

  return {
    plateforme: detecterPlateforme(),
    installee,
    peutInstaller: !!invitationEnAttente && !installee,
    installer,
  };
}
