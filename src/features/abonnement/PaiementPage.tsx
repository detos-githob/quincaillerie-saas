import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams, useNavigate, Navigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, ShieldCheck, Smartphone, Tag, X, XCircle } from "lucide-react";
import { apercuPrix, codeMemorise, oublierCodeMemorise, type ApercuPrix } from "../../services/promotionsService";
import { useAuth } from "../../hooks/useAuth";
import {
  confirmerPaiement,
  formaterTelephoneBenin,
  initierPaiementMomo,
  statutPaiementMomo,
} from "../../services/abonnementService";

declare global {
  interface Window {
    openKkiapayWidget?: (options: Record<string, unknown>) => void;
    addSuccessListener?: (cb: (response: { transactionId: string }) => void) => void;
    addFailedListener?: (cb: (error: unknown) => void) => void;
  }
}

const KKIAPAY_DISPONIBLE = !!import.meta.env.VITE_KKIAPAY_PUBLIC_KEY;
const MOMO_SANDBOX = import.meta.env.VITE_MOMO_SANDBOX === "true";
const INTERVALLE_SONDAGE_MS = 4000;
const DUREE_SONDAGE_MS = 3 * 60 * 1000;

type Methode = "momo" | "kkiapay";
type Etape =
  | { nom: "saisie" }
  | { nom: "attente"; paiementId: string; telephone: string; depuis: number; longue: boolean }
  | { nom: "reussi"; dateExpiration: string | null }
  | { nom: "echoue"; raison: string };

function formatFCFA(montant: number): string {
  return montant.toLocaleString("fr-FR") + " FCFA";
}

export function PaiementPage() {
  const { utilisateur, entreprise, rafraichirProfil } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [methode, setMethode] = useState<Methode>("momo");

  const planId = searchParams.get("plan");
  const periode = (searchParams.get("periode") as "mensuel" | "annuel") || "mensuel";

  // Le prix affiché vient du serveur (offre + code promo) : c'est le même
  // calcul que celui qui sera appliqué au paiement.
  const [codeSaisi, setCodeSaisi] = useState(codeMemorise());
  const [codeApplique, setCodeApplique] = useState<string | null>(null);
  const [prix, setPrix] = useState<ApercuPrix | null>(null);
  const [erreurCode, setErreurCode] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState(false);

  useEffect(() => {
    if (!planId) return;
    let actif = true;
    (async () => {
      const base = await apercuPrix(planId, periode, null).catch(() => ({ erreur: "Offre indisponible." }));
      if (!actif) return;
      setPrix(base);
      // Code transmis par un agent (lien ?code=…) : appliqué d'office.
      const memorise = codeMemorise();
      if (memorise && !base.erreur) {
        const avecCode = await apercuPrix(planId, periode, memorise).catch(() => null);
        if (actif && avecCode && !avecCode.erreur) {
          setPrix(avecCode);
          setCodeApplique(memorise);
        }
      }
    })();
    return () => {
      actif = false;
    };
  }, [planId, periode]);

  async function appliquerCode() {
    if (!planId) return;
    const code = codeSaisi.trim().toUpperCase();
    if (!code) return;
    setErreurCode(null);
    setVerificationCode(true);
    try {
      const resultat = await apercuPrix(planId, periode, code);
      if (resultat.erreur) {
        setErreurCode(resultat.erreur);
      } else {
        setPrix(resultat);
        setCodeApplique(code);
      }
    } catch {
      setErreurCode("Vérification impossible. Vérifie ta connexion.");
    } finally {
      setVerificationCode(false);
    }
  }

  async function retirerCode() {
    if (!planId) return;
    setCodeApplique(null);
    setCodeSaisi("");
    setErreurCode(null);
    oublierCodeMemorise();
    setPrix(await apercuPrix(planId, periode, null));
  }

  if (utilisateur && utilisateur.role !== "gerant") return <Navigate to="/" replace />;
  if (!planId) return <Navigate to="/offres" replace />;
  if (!prix) return <div className="p-6 text-sm text-stone-400">Calcul du prix...</div>;
  if (prix.erreur && !codeApplique) {
    return (
      <div className="max-w-md mx-auto px-4 py-8 text-sm">
        <p className="text-red-600">{prix.erreur}</p>
        <button onClick={() => navigate("/offres")} className="mt-3 text-amber-600 font-medium">
          Voir les offres
        </button>
      </div>
    );
  }
  const montant = Number(prix.montant);
  const surReussite = async () => {
    oublierCodeMemorise();
    await rafraichirProfil();
  };

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <button onClick={() => navigate("/offres")} className="flex items-center gap-1.5 text-sm text-stone-500 mb-4">
        <ArrowLeft size={15} /> Changer d'offre
      </button>

      <div className="bg-white border border-stone-200 rounded-2xl p-5">
        <p className="text-xs font-medium text-stone-500">Récapitulatif</p>
        <p className="font-display text-2xl font-bold text-stone-900 mt-1">
          {prix.offre_nom} — {periode === "annuel" ? "annuel" : "mensuel"}
        </p>
        {Number(prix.reduction) > 0 ? (
          <div className="mt-3">
            <p className="text-sm text-stone-400 line-through tabular-nums">{formatFCFA(Number(prix.montant_base))}</p>
            <p className="font-display text-4xl font-bold text-amber-600 tabular-nums">{formatFCFA(montant)}</p>
            <p className="text-sm text-emerald-700 mt-1">
              Code {prix.code} : {prix.description_reduction} (économie de {formatFCFA(Number(prix.reduction))})
            </p>
          </div>
        ) : (
          <p className="font-display text-4xl font-bold text-amber-600 mt-3 tabular-nums">{formatFCFA(montant)}</p>
        )}

        {/* Code promo */}
        <div className="mt-4">
          {codeApplique ? (
            <div className="flex items-center justify-between gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <span className="flex items-center gap-2 text-sm text-emerald-800">
                <Tag size={15} /> {codeApplique}
              </span>
              <button onClick={retirerCode} className="p-1 text-emerald-700" aria-label="Retirer le code promo">
                <X size={16} />
              </button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                appliquerCode();
              }}
              className="flex gap-2"
            >
              <label htmlFor="code-promo" className="sr-only">
                Code promo
              </label>
              <input
                id="code-promo"
                value={codeSaisi}
                onChange={(e) => setCodeSaisi(e.target.value.toUpperCase())}
                maxLength={20}
                autoComplete="off"
                placeholder="Code promo"
                className="flex-1 min-w-0 border border-stone-300 rounded-lg py-2 px-3 text-sm uppercase tracking-wide"
              />
              <button
                type="submit"
                disabled={!codeSaisi.trim() || verificationCode}
                className="shrink-0 border border-stone-300 rounded-lg px-3 text-sm font-medium text-stone-700 disabled:opacity-50"
              >
                {verificationCode ? "..." : "Appliquer"}
              </button>
            </form>
          )}
          {erreurCode && <p className="text-xs text-red-600 mt-1.5">{erreurCode}</p>}
        </div>

        {MOMO_SANDBOX && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-4">
            Mode test MTN : aucun argent réel n'est débité. Utilise un numéro de test MTN.
          </p>
        )}

        {KKIAPAY_DISPONIBLE && (
          <div className="grid grid-cols-2 gap-2 mt-5" role="radiogroup" aria-label="Moyen de paiement">
            {(
              [
                ["momo", "MTN MoMo"],
                ["kkiapay", "Moov, carte…"],
              ] as const
            ).map(([valeur, label]) => (
              <button
                key={valeur}
                role="radio"
                aria-checked={methode === valeur}
                onClick={() => setMethode(valeur)}
                className={`py-2.5 rounded-xl text-sm font-medium border ${
                  methode === valeur ? "bg-navy text-white border-navy" : "bg-white text-stone-600 border-stone-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {methode === "momo" ? (
          <PaiementMomo
            key={codeApplique ?? "sans-code"}
            plan={planId}
            periode={periode}
            montant={montant}
            code={codeApplique}
            telephoneInitial={entreprise?.telephone ?? ""}
            onReussi={surReussite}
          />
        ) : (
          <PaiementKkiapay
            montant={montant}
            plan={planId}
            periode={periode}
            code={codeApplique}
            onReussi={async () => {
              await surReussite();
              navigate("/mon-abonnement");
            }}
          />
        )}

        <p className="flex items-center justify-center gap-1.5 text-xs text-stone-400 mt-4">
          <ShieldCheck size={13} /> Paiement vérifié par nos serveurs auprès de l'opérateur
        </p>
      </div>
    </div>
  );
}

// =====================================================================
// MTN MoMo : demande envoyée sur le téléphone, puis suivi du statut
// =====================================================================

function PaiementMomo({
  plan,
  periode,
  montant,
  code,
  telephoneInitial,
  onReussi,
}: {
  plan: string;
  periode: "mensuel" | "annuel";
  montant: number;
  code: string | null;
  telephoneInitial: string;
  onReussi: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const [telephone, setTelephone] = useState(telephoneInitial);
  const [etape, setEtape] = useState<Etape>({ nom: "saisie" });
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const actif = useRef(true);
  const onReussiRef = useRef(onReussi);

  useEffect(() => {
    onReussiRef.current = onReussi;
  }, [onReussi]);

  useEffect(() => {
    actif.current = true;
    return () => {
      actif.current = false;
    };
  }, []);

  // Sondage du statut tant que la demande est en attente.
  useEffect(() => {
    if (etape.nom !== "attente" || etape.longue) return;
    const minuterie = setTimeout(async () => {
      try {
        const r = await statutPaiementMomo(etape.paiementId);
        if (!actif.current) return;
        if (r.statut === "reussi") {
          await onReussiRef.current();
          setEtape({ nom: "reussi", dateExpiration: r.dateExpiration });
        } else if (r.statut === "echoue" || r.statut === "expire") {
          setEtape({ nom: "echoue", raison: r.raison || "Le paiement n'a pas abouti." });
        } else {
          const longue = Date.now() - etape.depuis > DUREE_SONDAGE_MS;
          setEtape({ ...etape, longue });
        }
      } catch {
        // Coupure réseau passagère : on réessaie au tour suivant.
        if (actif.current) setEtape({ ...etape });
      }
    }, INTERVALLE_SONDAGE_MS);
    return () => clearTimeout(minuterie);
  }, [etape]);

  const telephoneFormate = MOMO_SANDBOX ? telephone.replace(/\D/g, "") || null : formaterTelephoneBenin(telephone);

  async function payer(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (!telephoneFormate) {
      setErreur("Saisis ton numéro MTN à 10 chiffres (01 XX XX XX XX).");
      return;
    }
    setEnCours(true);
    try {
      const { paiementId } = await initierPaiementMomo(plan, periode, telephone, code);
      setEtape({ nom: "attente", paiementId, telephone: telephoneFormate, depuis: Date.now(), longue: false });
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnCours(false);
    }
  }

  if (etape.nom === "attente") {
    return (
      <div className="mt-5 text-center space-y-3" aria-live="polite">
        <span className="relative inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-50">
          {!etape.longue && <span className="absolute inset-0 rounded-full bg-amber-200 animate-ping opacity-40" />}
          <Smartphone size={28} className="relative text-amber-600" />
        </span>
        <p className="font-medium text-stone-900">Valide le paiement sur ton téléphone</p>
        <p className="text-sm text-stone-600">
          Une demande de <strong>{formatFCFA(montant)}</strong> a été envoyée au <strong>{etape.telephone}</strong>.
          Confirme-la avec ton code secret Mobile Money.
        </p>
        <p className="text-xs text-stone-400">
          Pas de notification ? Ouvre ton application ou ton menu MoMo : la demande apparaît parmi les paiements à
          approuver.
        </p>
        {etape.longue ? (
          <div className="space-y-2 pt-1">
            <p className="text-sm text-stone-600">
              Toujours pas de validation. Si tu confirmes plus tard, ton abonnement sera activé automatiquement.
            </p>
            <button
              onClick={() => setEtape({ ...etape, depuis: Date.now(), longue: false })}
              className="w-full border border-stone-300 text-stone-700 font-medium py-2.5 rounded-xl text-sm"
            >
              Vérifier à nouveau
            </button>
          </div>
        ) : (
          <p className="text-xs text-stone-400">En attente de confirmation…</p>
        )}
      </div>
    );
  }

  if (etape.nom === "reussi") {
    return (
      <div className="mt-5 text-center space-y-3">
        <CheckCircle2 size={40} className="mx-auto text-emerald-600" />
        <p className="font-display text-xl font-bold text-stone-900">Paiement confirmé</p>
        {etape.dateExpiration && (
          <p className="text-sm text-stone-600">
            Ton abonnement est actif jusqu'au{" "}
            <strong>{new Date(etape.dateExpiration + "T00:00:00").toLocaleDateString("fr-FR")}</strong>.
          </p>
        )}
        <button
          onClick={() => navigate("/mon-abonnement")}
          className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-3 rounded-xl"
        >
          Voir mon abonnement
        </button>
      </div>
    );
  }

  if (etape.nom === "echoue") {
    return (
      <div className="mt-5 text-center space-y-3">
        <XCircle size={40} className="mx-auto text-red-500" />
        <p className="font-medium text-stone-900">Le paiement n'a pas abouti</p>
        <p className="text-sm text-stone-600">{etape.raison}</p>
        <p className="text-xs text-stone-400">Aucun montant n'a été prélevé pour cette demande.</p>
        <button
          onClick={() => setEtape({ nom: "saisie" })}
          className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-3 rounded-xl"
        >
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={payer} className="mt-5 space-y-3">
      <label className="block">
        <span className="text-xs font-medium text-stone-500">Numéro MTN Mobile Money à débiter</span>
        <input
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          required
          value={telephone}
          onChange={(e) => setTelephone(e.target.value)}
          placeholder={MOMO_SANDBOX ? "Numéro de test MTN" : "01 XX XX XX XX"}
          className="w-full mt-1 border border-stone-300 rounded-lg py-2.5 px-3 text-lg tracking-wide tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
        {!MOMO_SANDBOX && telephone && telephoneFormate && (
          <span className="text-xs text-stone-400 mt-1 block">Numéro : +229 {telephoneFormate}</span>
        )}
      </label>

      {erreur && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erreur}</p>
      )}

      <button
        type="submit"
        disabled={enCours}
        className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-3.5 rounded-xl disabled:opacity-60"
      >
        {enCours ? "Envoi de la demande…" : `Payer ${formatFCFA(montant)}`}
      </button>
    </form>
  );
}

// =====================================================================
// Kkiapay (Moov Money, carte…) — flux existant
// =====================================================================

function PaiementKkiapay({
  montant,
  plan,
  periode,
  code,
  onReussi,
}: {
  montant: number;
  plan: string;
  periode: "mensuel" | "annuel";
  code: string | null;
  onReussi: () => Promise<void>;
}) {
  const { entreprise } = useAuth();
  const [scriptCharge, setScriptCharge] = useState(false);
  const [enVerification, setEnVerification] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // Le script Kkiapay ne permet pas de retirer un écouteur : on les
  // enregistre UNE fois et on lit les valeurs à jour via cette référence.
  const contexte = useRef({ entreprise, plan, periode, code, onReussi });
  useEffect(() => {
    contexte.current = { entreprise, plan, periode, code, onReussi };
  }, [entreprise, plan, periode, code, onReussi]);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://cdn.kkiapay.me/k.js";
    script.async = true;
    script.onload = () => setScriptCharge(true);
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  useEffect(() => {
    if (!scriptCharge || !window.addSuccessListener || !window.addFailedListener) return;

    window.addSuccessListener(async (response) => {
      const { entreprise, plan, periode, code, onReussi } = contexte.current;
      if (!entreprise) return;
      setEnVerification(true);
      setErreur(null);
      try {
        await confirmerPaiement(response.transactionId, entreprise.id, plan, periode, code);
        await onReussi();
      } catch (e) {
        setErreur(
          (e as Error).message ||
            "Le paiement a été reçu mais n'a pas pu être confirmé automatiquement. Contacte le support avec ta référence de transaction : " +
              response.transactionId
        );
      } finally {
        setEnVerification(false);
      }
    });

    window.addFailedListener(() => {
      setErreur("Le paiement a échoué ou a été annulé. Réessaie quand tu veux.");
    });
  }, [scriptCharge]);

  function ouvrirWidget() {
    if (!window.openKkiapayWidget) return;
    window.openKkiapayWidget({
      amount: montant,
      api_key: import.meta.env.VITE_KKIAPAY_PUBLIC_KEY,
      sandbox: import.meta.env.VITE_KKIAPAY_SANDBOX === "true",
      phone: entreprise?.telephone || "",
      data: JSON.stringify({ entrepriseId: entreprise?.id, plan, periode }),
    });
  }

  return (
    <div className="mt-5">
      {erreur && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{erreur}</p>
      )}
      <button
        onClick={ouvrirWidget}
        disabled={!scriptCharge || enVerification}
        className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-3.5 rounded-xl disabled:opacity-60"
      >
        {enVerification ? "Vérification du paiement…" : scriptCharge ? `Payer ${formatFCFA(montant)}` : "Chargement…"}
      </button>
      <p className="text-xs text-stone-400 text-center mt-2">Moov Money, carte bancaire et autres moyens via Kkiapay.</p>
    </div>
  );
}
