import { useState, type FormEvent } from "react";
import { useNavigate, Navigate, Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { AuthLayout } from "../../components/layout/AuthLayout";

export function LoginPage() {
  const { connexion, session, chargement } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  // Cas du lien de confirmation d'email : Supabase établit déjà une
  // session valide en arrivant ici. Inutile de faire ressaisir le mot
  // de passe — on renvoie directement vers "/", où ProtectedRoute
  // redirige vers /completer-inscription tant que l'entreprise n'est
  // pas encore créée.
  if (!chargement && session) {
    return <Navigate to="/" replace />;
  }

  async function gererSoumission(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    const { erreur } = await connexion(email, motDePasse);
    setEnCours(false);
    if (erreur) {
      setErreur(erreur);
    } else {
      navigate("/");
    }
  }

  return (
    <AuthLayout titre="Connexion" sousTitre="Connecte-toi à ton compte">
      <form onSubmit={gererSoumission} className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4">
        <div>
          <label htmlFor="email" className="text-xs font-medium text-stone-500">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            placeholder="toi@exemple.com"
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="mot-de-passe" className="text-xs font-medium text-stone-500">Mot de passe</label>
            <Link
              to="/mot-de-passe-oublie"
              state={{ email }}
              className="text-xs font-medium text-amber-600 hover:text-amber-700"
            >
              Mot de passe oublié ?
            </Link>
          </div>
          <input
            id="mot-de-passe"
            type="password"
            autoComplete="current-password"
            required
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            placeholder="••••••••"
          />
        </div>

        {erreur && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {erreur}
          </p>
        )}

        <button
          type="submit"
          disabled={enCours}
          className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-3 rounded-xl transition-colors disabled:opacity-60"
        >
          {enCours ? "Connexion..." : "Se connecter"}
        </button>

        <p className="text-center text-xs text-stone-400">
          Pas encore de compte ?{" "}
          <Link to="/signup" className="text-amber-600 font-medium">
            Créer mon entreprise
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
