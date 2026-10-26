import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Globe2, Loader2, Smartphone, XCircle } from "lucide-react";
import {
  COULEURS_OPERATEUR,
  initierPaiementAbonnement,
  statutPaiementAbonnement,
  verifierPaiementKkiapay,
  type MoyenPaiementPlateforme,
  type OperateurPlateforme,
} from "../../services/plateformePaiementsService";

// Paiement de l'abonnement avec les moyens configurés par le super admin.

const LIBELLE_COURT: Record<OperateurPlateforme, string> = {
  mtn: "MTN MoMo",
  moov: "Moov Money",
  celtiis: "Celtiis Cash",
  international: "Autre pays / carte",
  widget: "Kkiapay",
};

interface Option {
  cle: string;
  moyen: MoyenPaiementPlateforme;
  operateur: OperateurPlateforme;
  libelle: string;
}

type Etape =
  | { nom: "saisie" }
  | { nom: "attente"; paiementId: string; depuis: number; longue: boolean }
  | { nom: "reussi"; dateExpiration: string | null }
  | { nom: "echoue"; raison: string };

const formatFCFA = (m: number) => m.toLocaleString("fr-FR") + " FCFA";

export function PaiementPlateforme({
  moyens, plan, periode, montant, code, telephoneInitial, onReussi, paiementRetour,
}: {
  moyens: MoyenPaiementPlateforme[];
  plan: string;
  periode: "mensuel" | "annuel";
  montant: number;
  code: string | null;
  telephoneInitial: string;
  onReussi: () => Promise<void>;
  /** Retour de la page de paiement FedaPay : identifiant du paiement à vérifier. */
  paiementRetour?: string | null;
}) {
  const options = useMemo<Option[]>(() => {
    const liste: Option[] = [];
    const compte = new Map<OperateurPlateforme, number>();
    moyens.forEach((m) => m.operateurs.forEach((o) => compte.set(o, (compte.get(o) ?? 0) + 1)));
    for (const m of moyens) {
      for (const o of m.operateurs) {
        liste.push({ cle: `${m.id}:${o}`, moyen: m, operateur: o, libelle: (compte.get(o) ?? 0) > 1 ? `${LIBELLE_COURT[o]} · ${m.libelle}` : LIBELLE_COURT[o] });
      }
    }
    const ordre: OperateurPlateforme[] = ["mtn", "moov", "celtiis", "widget", "international"];
    return liste.sort((a, b) => a.moyen.ordre - b.moyen.ordre || ordre.indexOf(a.operateur) - ordre.indexOf(b.operateur));
  }, [moyens]);

  const [choix, setChoix] = useState<string | null>(options.length === 1 ? options[0].cle : null);
  const [telephone, setTelephone] = useState(telephoneInitial);
  const [etape, setEtape] = useState<Etape>(paiementRetour ? { nom: "attente", paiementId: paiementRetour, depuis: Date.now(), longue: false } : { nom: "saisie" });
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const option = options.find((o) => o.cle === choix) ?? null;

  // Sondage du statut tant que le paiement est en attente.
  useEffect(() => {
    if (etape.nom !== "attente") return;
    let fini = false;
    const tour = async () => {
      try {
        const s = await statutPaiementAbonnement(etape.paiementId);
        if (fini) return;
        if (s.statut === "reussi") {
          fini = true;
          setEtape({ nom: "reussi", dateExpiration: s.dateExpiration });
          await onReussi();
        } else if (s.statut === "echoue" || s.statut === "expire") {
          fini = true;
          setEtape({ nom: "echoue", raison: s.raison || "Le paiement n'a pas abouti." });
        } else if (Date.now() - etape.depuis > 3 * 60_000) {
          setEtape((e) => (e.nom === "attente" ? { ...e, longue: true } : e));
        }
      } catch {
        /* réseau : on réessaie au prochain tour */
      }
    };
    tour();
    const id = setInterval(tour, 4000);
    return () => {
      fini = true;
      clearInterval(id);
    };
  }, [etape.nom === "attente" ? etape.paiementId : null]); // eslint-disable-line react-hooks/exhaustive-deps

  async function payer() {
    if (!option) return;
    setErreur(null);
    setEnvoi(true);
    try {
      const r = await initierPaiementAbonnement({
        moyenId: option.moyen.id, operateur: option.operateur, plan, periodicite: periode, code,
        telephone: option.operateur === "international" ? undefined : telephone,
      });
      if (r.redirection) {
        window.location.href = r.redirection; // page de paiement FedaPay, retour sur /paiement?retour=…
        return;
      }
      setEtape({ nom: "attente", paiementId: r.paiementId, depuis: Date.now(), longue: false });
    } catch (e: any) {
      setErreur(e.message || "Paiement impossible.");
    } finally {
      setEnvoi(false);
    }
  }

  if (etape.nom === "reussi") {
    return (
      <div className="mt-5 text-center">
        <CheckCircle2 size={44} className="mx-auto text-emerald-500" />
        <p className="font-display text-xl font-bold text-stone-900 mt-2">Paiement confirmé</p>
        {etape.dateExpiration && <p className="text-sm text-stone-600 mt-1">Abonnement actif jusqu'au {new Date(etape.dateExpiration).toLocaleDateString("fr-FR")}.</p>}
      </div>
    );
  }

  if (etape.nom === "attente") {
    return (
      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
        <Loader2 size={28} className="mx-auto animate-spin text-amber-600" />
        <p className="text-sm font-semibold text-stone-900 mt-2">{paiementRetour ? "Vérification du paiement…" : "Confirme le paiement sur ton téléphone"}</p>
        <p className="text-xs text-stone-600 mt-1">
          {etape.longue ? "La confirmation tarde. Tu peux laisser cette page ouverte : la vérification continue." : "Saisis ton code secret Mobile Money quand la demande s'affiche."}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-3">
      {etape.nom === "echoue" && (
        <p className="flex gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"><XCircle size={16} className="shrink-0 mt-0.5" /> {etape.raison}</p>
      )}
      <div>
        <p className="text-xs font-medium text-stone-500 mb-1">Moyen de paiement</p>
        <div className="grid grid-cols-2 gap-2" role="radiogroup">
          {options.map((o) => (
            <button key={o.cle} role="radio" aria-checked={choix === o.cle} onClick={() => { setChoix(o.cle); setErreur(null); }}
              className={`relative py-2.5 px-2 rounded-xl text-sm font-medium border flex items-center justify-center gap-2 ${choix === o.cle ? "border-navy ring-1 ring-navy bg-white text-stone-900" : "bg-white text-stone-600 border-stone-300"}`}>
              {o.operateur === "international" ? <Globe2 size={15} className="text-stone-500" /> : <span className="w-2.5 h-2.5 rounded-full" style={{ background: COULEURS_OPERATEUR[o.operateur] }} />}
              <span className="truncate">{o.libelle}</span>
              {o.moyen.environnement === "test" && <span className="absolute -top-1.5 -right-1 text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded">TEST</span>}
            </button>
          ))}
        </div>
      </div>

      {option && ["mtn", "moov", "celtiis"].includes(option.operateur) && (
        <label className="block">
          <span className="text-xs font-medium text-stone-500">Ton numéro {LIBELLE_COURT[option.operateur]}</span>
          <input type="tel" inputMode="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="01 97 00 00 00"
            className="w-full mt-1 border border-stone-300 rounded-lg py-2.5 px-3 text-base tracking-wide" />
        </label>
      )}
      {option?.operateur === "international" && (
        <p className="text-xs text-stone-500">Tu seras dirigé vers la page sécurisée FedaPay pour payer depuis un autre pays ou par carte bancaire, puis ramené ici.</p>
      )}

      {erreur && <p className="text-sm text-red-600">{erreur}</p>}

      {option?.operateur === "widget" ? (
        <BoutonKkiapay moyen={option.moyen} montant={montant} plan={plan} periode={periode} code={code} telephone={telephone}
          onReussi={async (date) => { setEtape({ nom: "reussi", dateExpiration: date }); await onReussi(); }}
          onErreur={setErreur} />
      ) : (
        <button onClick={payer} disabled={!option || envoi || (option && ["mtn", "moov", "celtiis"].includes(option.operateur) && telephone.replace(/\D/g, "").length < 8)}
          className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60">
          {envoi ? <Loader2 size={18} className="animate-spin" /> : option?.operateur === "international" ? <Globe2 size={18} /> : <Smartphone size={18} />}
          {!option ? "Choisis un moyen de paiement" : envoi ? "Envoi…" : `Payer ${formatFCFA(montant)}`}
        </button>
      )}
    </div>
  );
}

declare global {
  interface Window {
    openKkiapayWidget?: (options: Record<string, unknown>) => void;
    addSuccessListener?: (cb: (response: { transactionId: string }) => void) => void;
    addFailedListener?: (cb: (error: unknown) => void) => void;
  }
}

function BoutonKkiapay({ moyen, montant, plan, periode, code, telephone, onReussi, onErreur }: {
  moyen: MoyenPaiementPlateforme; montant: number; plan: string; periode: "mensuel" | "annuel"; code: string | null; telephone: string;
  onReussi: (dateExpiration: string | null) => Promise<void>; onErreur: (m: string | null) => void;
}) {
  const [pret, setPret] = useState(!!window.openKkiapayWidget);
  const [verification, setVerification] = useState(false);
  const ctx = useRef({ moyen, plan, periode, code, onReussi, onErreur });
  useEffect(() => { ctx.current = { moyen, plan, periode, code, onReussi, onErreur }; }, [moyen, plan, periode, code, onReussi, onErreur]);

  useEffect(() => {
    if (window.openKkiapayWidget) { setPret(true); return; }
    const script = document.createElement("script");
    script.src = "https://cdn.kkiapay.me/k.js";
    script.async = true;
    script.onload = () => setPret(true);
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    if (!pret || !window.addSuccessListener || !window.addFailedListener) return;
    window.addSuccessListener(async (response) => {
      const c = ctx.current;
      setVerification(true);
      c.onErreur(null);
      try {
        const r = await verifierPaiementKkiapay({ moyenId: c.moyen.id, transactionId: response.transactionId, plan: c.plan, periodicite: c.periode, code: c.code });
        await c.onReussi(r.nouvelleDateExpiration ?? null);
      } catch (e: any) {
        c.onErreur(e.message || `Paiement reçu mais non confirmé. Référence : ${response.transactionId}`);
      } finally {
        setVerification(false);
      }
    });
    window.addFailedListener(() => ctx.current.onErreur("Le paiement a échoué ou a été annulé."));
  }, [pret]);

  return (
    <button
      onClick={() => window.openKkiapayWidget?.({ amount: montant, api_key: moyen.cle_publique, sandbox: moyen.environnement === "test", phone: telephone })}
      disabled={!pret || verification || !moyen.cle_publique}
      className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-3.5 rounded-xl disabled:opacity-60">
      {verification ? "Vérification du paiement…" : pret ? `Payer ${formatFCFA(montant)}` : "Chargement…"}
    </button>
  );
}
