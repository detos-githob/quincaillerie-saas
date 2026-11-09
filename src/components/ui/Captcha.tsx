import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

/**
 * Protection anti-robot (Cloudflare Turnstile) pour l'inscription, la
 * connexion et le mot de passe oublié. La plupart du temps, la vérification
 * est invisible : aucune image à déchiffrer.
 *
 * Activée seulement si VITE_TURNSTILE_SITE_KEY est renseignée. Dans
 * Supabase (Authentication › Attack Protection), activer le CAPTCHA avec
 * la clé SECRÈTE Turnstile APRÈS avoir déployé cette version de l'appli.
 */
export const CLE_CAPTCHA = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || "";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}

export interface CaptchaRef {
  /** Un jeton ne sert qu'une fois : à rappeler après chaque tentative. */
  reinitialiser: () => void;
}

let chargement: Promise<void> | null = null;
function chargerScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!chargement) {
    chargement = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        chargement = null;
        reject(new Error("Captcha indisponible"));
      };
      document.head.appendChild(s);
    });
  }
  return chargement;
}

export const Captcha = forwardRef<CaptchaRef, { onJeton: (jeton: string | null) => void }>(function Captcha({ onJeton }, ref) {
  const zone = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const rappel = useRef(onJeton);
  rappel.current = onJeton;
  const [etat, setEtat] = useState<"attente" | "ok" | "erreur">("attente");
  const signaler = (jeton: string | null, nouvelEtat: "attente" | "ok" | "erreur") => {
    setEtat(nouvelEtat);
    rappel.current(jeton);
  };

  useImperativeHandle(ref, () => ({
    reinitialiser: () => {
      signaler(null, "attente");
      if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
    },
  }));

  useEffect(() => {
    if (!CLE_CAPTCHA) return;
    let actif = true;
    chargerScript()
      .then(() => {
        if (!actif || !zone.current || !window.turnstile) return;
        widget.current = window.turnstile.render(zone.current, {
          sitekey: CLE_CAPTCHA,
          language: "fr",
          appearance: "interaction-only",
          callback: (jeton: string) => signaler(jeton, "ok"),
          "expired-callback": () => signaler(null, "attente"),
          "error-callback": () => signaler(null, "erreur"),
        });
      })
      .catch(() => signaler(null, "erreur"));
    return () => {
      actif = false;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, []);

  if (!CLE_CAPTCHA) return null;
  return (
    <div>
      <div ref={zone} className="flex justify-center min-h-0" />
      {etat === "attente" && <p className="text-[11px] text-center text-stone-400">Vérification de sécurité en cours…</p>}
      {etat === "erreur" && (
        <p className="text-xs text-center text-red-600">
          La vérification anti-robot n'a pas abouti. Vérifie ta connexion internet, puis recharge la page.
        </p>
      )}
    </div>
  );
});
