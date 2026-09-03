import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

export function LoginPage() {
  const { connexion } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

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
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4 font-body">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
        .font-display { font-family: 'Barlow Condensed', sans-serif; }
        .font-body { font-family: 'Inter', sans-serif; }
      `}</style>

      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-bold text-stone-900">
            Gestion Quincaillerie
          </h1>
          <p className="text-stone-500 text-sm mt-1">Connecte-toi à ton compte</p>
        </div>

        <form onSubmit={gererSoumission} className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-stone-500">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full mt-1 border border-stone-300 rounded-lg py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="toi@exemple.com"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-stone-500">Mot de passe</label>
            <input
              type="password"
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
      </div>
    </div>
  );
}
