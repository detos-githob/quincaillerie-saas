import { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Navigate } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { trouverOffre, calculerMontant, confirmerPaiement } from "../../services/abonnementService";

declare global {
  interface Window {
    openKkiapayWidget?: (options: Record<string, unknown>) => void;
    addSuccessListener?: (cb: (response: { transactionId: string }) => void) => void;
    addFailedListener?: (cb: (error: unknown) => void) => void;
  }
}

function formatFCFA(montant: number): string {
  return montant.toLocaleString("fr-FR") + " FCFA";
}

export function PaiementPage() {
  const { utilisateur, entreprise, rafraichirProfil } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [scriptCharge, setScriptCharge] = useState(false);
  const [enVerification, setEnVerification] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const planId = searchParams.get("plan") as "starter" | "business" | null;
  const periode = (searchParams.get("periode") as "mensuel" | "annuel") || "mensuel";
  const offre = planId ? trouverOffre(planId) : undefined;
  const montant = offre ? calculerMontant(offre, periode) : 0;

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
      if (!entreprise || !offre) return;
      setEnVerification(true);
      setErreur(null);
      try {
        await confirmerPaiement(response.transactionId, entreprise.id, offre.id, periode);
        await rafraichirProfil();
        navigate("/mon-abonnement");
      } catch (e: any) {
        setErreur(
          e.message ||
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
  }, [scriptCharge, entreprise, offre, periode, navigate, rafraichirProfil]);

  if (utilisateur && utilisateur.role !== "gerant") {
    return <Navigate to="/" replace />;
  }

  if (!offre) {
    return <Navigate to="/offres" replace />;
  }

  function ouvrirWidget() {
    if (!window.openKkiapayWidget || !offre) return;
    window.openKkiapayWidget({
      amount: montant,
      api_key: import.meta.env.VITE_KKIAPAY_PUBLIC_KEY,
      sandbox: import.meta.env.VITE_KKIAPAY_SANDBOX === "true",
      phone: entreprise?.telephone || "",
      data: JSON.stringify({ entrepriseId: entreprise?.id, plan: offre.id, periode }),
    });
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <button
        onClick={() => navigate("/offres")}
        className="flex items-center gap-1.5 text-sm text-stone-500 mb-4"
      >
        <ArrowLeft size={15} /> Changer d'offre
      </button>

      <div className="bg-white border border-stone-200 rounded-2xl p-5">
        <p className="text-xs font-medium text-stone-500">Récapitulatif</p>
        <p className="font-display text-2xl font-bold text-stone-900 mt-1">
          {offre.nom} — {periode === "annuel" ? "annuel" : "mensuel"}
        </p>
        <p className="font-display text-4xl font-bold text-amber-600 mt-3">{formatFCFA(montant)}</p>

        {erreur && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-4">
            {erreur}
          </p>
        )}

        <button
          onClick={ouvrirWidget}
          disabled={!scriptCharge || enVerification}
          className="w-full mt-5 bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-3.5 rounded-xl disabled:opacity-60"
        >
          {enVerification
            ? "Vérification du paiement..."
            : scriptCharge
            ? "Payer avec Mobile Money"
            : "Chargement..."}
        </button>

        <p className="flex items-center justify-center gap-1.5 text-xs text-stone-400 mt-3">
          <ShieldCheck size={13} /> Paiement sécurisé — MTN Mobile Money & Moov Money
        </p>
      </div>
    </div>
  );
}
