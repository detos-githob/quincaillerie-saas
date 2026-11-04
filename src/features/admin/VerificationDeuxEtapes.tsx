import { useEffect, useState } from "react";
import { KeyRound, Loader2, ShieldCheck, Smartphone } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../hooks/useAuth";

/**
 * Double authentification du super admin (code à 6 chiffres d'une
 * application Authenticator : Google Authenticator, Microsoft
 * Authenticator, 2FAS…). Sans ce code, la base refuse toute action
 * d'administration, même avec le bon mot de passe.
 */
type Etat =
  | { nom: "chargement" }
  | { nom: "inscription"; facteurId: string; qr: string; secret: string }
  | { nom: "verification"; facteurId: string }
  | { nom: "erreur"; message: string };

export function VerificationDeuxEtapes() {
  const { rafraichirAdmin, deconnexion } = useAuth();
  const [etat, setEtat] = useState<Etat>({ nom: "chargement" });
  const [code, setCode] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.auth.mfa.listFactors();
        if (error) throw error;
        const verifie = data.totp.find((f) => f.status === "verified");
        if (verifie) {
          setEtat({ nom: "verification", facteurId: verifie.id });
          return;
        }
        // Inscriptions commencées mais jamais terminées : on les retire.
        for (const f of data.all.filter((x) => x.status !== "verified")) {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
        const { data: nouveau, error: e2 } = await supabase.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: `AKWEO admin ${new Date().toISOString().slice(0, 10)}`,
        });
        if (e2) throw e2;
        setEtat({ nom: "inscription", facteurId: nouveau.id, qr: nouveau.totp.qr_code, secret: nouveau.totp.secret });
      } catch (e: any) {
        setEtat({ nom: "erreur", message: e?.message || "Double authentification indisponible." });
      }
    })();
  }, []);

  async function valider(e: React.FormEvent) {
    e.preventDefault();
    if (etat.nom !== "inscription" && etat.nom !== "verification") return;
    setEnvoi(true);
    setErreur(null);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: etat.facteurId, code: code.replace(/\s/g, "") });
      if (error) throw error;
      await rafraichirAdmin();
    } catch {
      setErreur("Code incorrect ou expiré. Saisis le code affiché en ce moment dans l'application.");
      setCode("");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white border border-stone-200 rounded-2xl p-6">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-xl bg-navy text-amber-400 flex items-center justify-center shrink-0">
            <ShieldCheck size={22} />
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold text-stone-900">Vérification en deux étapes</h1>
            <p className="text-xs text-stone-500">Obligatoire pour l'espace administrateur</p>
          </div>
        </div>

        {etat.nom === "chargement" && (
          <p className="flex items-center gap-2 text-sm text-stone-500 mt-6"><Loader2 size={16} className="animate-spin" /> Préparation…</p>
        )}

        {etat.nom === "erreur" && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-5">{etat.message}</p>
        )}

        {etat.nom === "inscription" && (
          <div className="mt-5 space-y-4">
            <ol className="text-sm text-stone-700 space-y-2 list-decimal pl-5">
              <li>Installe une application d'authentification sur ton téléphone (Google Authenticator, Microsoft Authenticator ou 2FAS).</li>
              <li>Dans l'application, ajoute un compte en scannant ce code.</li>
              <li>Saisis ci-dessous le code à 6 chiffres qu'elle affiche.</li>
            </ol>
            <div className="flex justify-center">
              <img src={etat.qr} alt="Code QR à scanner avec l'application d'authentification" className="w-48 h-48 border border-stone-200 rounded-lg p-2 bg-white" />
            </div>
            <details className="text-xs text-stone-500">
              <summary className="cursor-pointer">Impossible de scanner ? Saisir la clé à la main</summary>
              <p className="mt-2 font-mono break-all bg-stone-100 rounded px-2 py-1.5 text-stone-800 select-all">{etat.secret}</p>
            </details>
          </div>
        )}

        {etat.nom === "verification" && (
          <p className="flex gap-2 text-sm text-stone-600 mt-5">
            <Smartphone size={18} className="shrink-0 text-stone-400" />
            Ouvre ton application d'authentification et saisis le code à 6 chiffres d'AKWEO.
          </p>
        )}

        {(etat.nom === "inscription" || etat.nom === "verification") && (
          <form onSubmit={valider} className="mt-4 space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-stone-500">Code à 6 chiffres</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                placeholder="123456"
                className="w-full mt-1 border border-stone-300 rounded-lg py-3 px-3 text-center text-2xl tracking-[0.4em] font-semibold"
              />
            </label>
            {erreur && <p className="text-sm text-red-600">{erreur}</p>}
            <button disabled={envoi || code.length !== 6}
              className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
              {envoi ? <Loader2 size={18} className="animate-spin" /> : <KeyRound size={18} />} Vérifier
            </button>
          </form>
        )}

        <p className="text-[11px] text-stone-400 mt-5">
          Téléphone perdu ? Un autre super admin, ou toi depuis le tableau de bord Supabase (Authentication › Users),
          peut supprimer le facteur de double authentification ; tu en configureras un nouveau ici.
        </p>
        <button onClick={() => deconnexion()} className="mt-3 text-xs text-stone-500 underline">Se déconnecter</button>
      </div>
    </div>
  );
}
