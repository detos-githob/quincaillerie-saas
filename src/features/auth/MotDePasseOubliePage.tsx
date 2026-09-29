import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { demanderReinitialisationMotDePasse } from "../../services/authService";

const DELAI_RENVOI_SECONDES = 60;

export function MotDePasseOubliePage() {
  const location = useLocation();
  const emailInitial = (location.state as { email?: string } | null)?.email ?? "";
  const [email, setEmail] = useState(emailInitial);
  const [enCours, setEnCours] = useState(false);
  const [envoye, setEnvoye] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [attente, setAttente] = useState(0);

  useEffect(() => {
    if (attente <= 0) return;
    const minuterie = setTimeout(() => setAttente((s) => s - 1), 1000);
    return () => clearTimeout(minuterie);
  }, [attente]);

  async function gererSoumission(e?: { preventDefault(): void }) {
    e?.preventDefault();
    if (attente > 0) return;
    setErreur(null);
    setEnCours(true);
    const { erreur } = await demanderReinitialisationMotDePasse(email);
    setEnCours(false);
    if (erreur) {
      setErreur(erreur);
      return;
    }
    setEnvoye(true);
    setAttente(DELAI_RENVOI_SECONDES);
  }

  if (envoye) {
    return (
      <AuthLayout titre="Vérifie ta boîte mail">
        <div className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4 text-center">
          <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-50">
            <MailCheck size={22} className="text-amber-600" />
          </span>
          <p className="text-sm text-stone-600">
            Si un compte existe pour <strong className="text-stone-900">{email}</strong>, tu vas recevoir un
            lien pour choisir un nouveau mot de passe. Il est valable une heure.
          </p>
          <p className="text-xs text-stone-400">Pense à regarder dans les courriers indésirables.</p>
          <button
            type="button"
            onClick={() => gererSoumission()}
            disabled={attente > 0 || enCours}
            className="w-full border border-stone-300 text-stone-700 font-medium py-2.5 rounded-xl text-sm disabled:opacity-50"
          >
            {attente > 0 ? `Renvoyer le lien (${attente} s)` : enCours ? "Envoi..." : "Renvoyer le lien"}
          </button>
          {erreur && <p className="text-sm text-red-600">{erreur}</p>}
          <Link to="/login" className="inline-block text-amber-600 font-medium text-sm">
            Retour à la connexion
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout titre="Mot de passe oublié" sousTitre="Saisis ton email pour recevoir un lien de réinitialisation">
      <form onSubmit={gererSoumission} className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4">
        <div>
          <label htmlFor="email" className="text-xs font-medium text-stone-500">
            Email du compte
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            placeholder="toi@exemple.com"
          />
        </div>

        {erreur && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erreur}</p>
        )}

        <button
          type="submit"
          disabled={enCours}
          className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-3 rounded-xl transition-colors disabled:opacity-60"
        >
          {enCours ? "Envoi..." : "Envoyer le lien"}
        </button>

        <p className="text-center text-xs text-stone-400">
          Tu t'en souviens ?{" "}
          <Link to="/login" className="text-amber-600 font-medium">
            Se connecter
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
