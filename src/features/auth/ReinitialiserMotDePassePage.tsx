import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Check } from "lucide-react";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { useAuth } from "../../hooks/useAuth";
import { supabase, contexteLienAuth } from "../../lib/supabaseClient";
import { CARACTERE_SPECIAL, POLITIQUE_MOT_DE_PASSE, validerMotDePasse } from "../../lib/security";
import { definirNouveauMotDePasse } from "../../services/authService";

const CRITERES = [
  { label: `${POLITIQUE_MOT_DE_PASSE.longueurMinimale} caractères minimum`, test: (m: string) => m.length >= POLITIQUE_MOT_DE_PASSE.longueurMinimale },
  { label: "Une majuscule et une minuscule", test: (m: string) => /[A-Z]/.test(m) && /[a-z]/.test(m) },
  { label: "Un chiffre", test: (m: string) => /[0-9]/.test(m) },
  { label: "Un caractère spécial", test: (m: string) => CARACTERE_SPECIAL.test(m) },
];

export function ReinitialiserMotDePassePage() {
  const { session, chargement } = useAuth();
  const navigate = useNavigate();
  const [lienRecuperation, setLienRecuperation] = useState(contexteLienAuth.recuperation);
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [termine, setTermine] = useState(false);

  // Filet de sécurité : Supabase émet PASSWORD_RECOVERY quand il traite
  // le lien reçu par email.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((evenement) => {
      if (evenement === "PASSWORD_RECOVERY") setLienRecuperation(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function gererSoumission(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    const erreurPolitique = validerMotDePasse(motDePasse);
    if (erreurPolitique) {
      setErreur(erreurPolitique);
      return;
    }
    if (motDePasse !== confirmation) {
      setErreur("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setEnCours(true);
    const { erreur } = await definirNouveauMotDePasse(motDePasse);
    setEnCours(false);
    if (erreur) {
      setErreur(erreur);
      return;
    }
    setTermine(true);
    setTimeout(() => navigate("/", { replace: true }), 2000);
  }

  if (chargement) {
    return (
      <AuthLayout titre="Nouveau mot de passe">
        <p className="text-center text-sm text-stone-400">Vérification du lien...</p>
      </AuthLayout>
    );
  }

  if (termine) {
    return (
      <AuthLayout titre="Mot de passe modifié">
        <div className="bg-white border border-stone-200 rounded-2xl p-6 text-center space-y-3">
          <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-50">
            <Check size={22} className="text-emerald-600" />
          </span>
          <p className="text-sm text-stone-600">
            Ton nouveau mot de passe est actif. Tes autres appareils ont été déconnectés par sécurité.
          </p>
          <p className="text-xs text-stone-400">Redirection vers ton espace...</p>
        </div>
      </AuthLayout>
    );
  }

  // Lien absent, invalide ou expiré : pas de session de récupération.
  if (contexteLienAuth.erreur || !session || !lienRecuperation) {
    return (
      <AuthLayout titre="Lien invalide ou expiré">
        <div className="bg-white border border-stone-200 rounded-2xl p-6 text-center space-y-4">
          <p className="text-sm text-stone-600">
            Ce lien de réinitialisation n'est plus valable. Les liens expirent au bout d'une heure et ne
            servent qu'une seule fois.
          </p>
          <Link
            to="/mot-de-passe-oublie"
            className="block w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-3 rounded-xl transition-colors"
          >
            Demander un nouveau lien
          </Link>
          <Link to="/login" className="inline-block text-amber-600 font-medium text-sm">
            Retour à la connexion
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout titre="Nouveau mot de passe" sousTitre={`Pour le compte ${session.user.email ?? ""}`}>
      <form onSubmit={gererSoumission} className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4">
        <div>
          <label htmlFor="nouveau-mdp" className="text-xs font-medium text-stone-500">
            Nouveau mot de passe
          </label>
          <div className="relative mt-1">
            <input
              id="nouveau-mdp"
              type={visible ? "text" : "password"}
              autoComplete="new-password"
              required
              autoFocus
              maxLength={POLITIQUE_MOT_DE_PASSE.longueurMaximale}
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              className="w-full border border-stone-300 rounded-lg py-2.5 pl-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              className="absolute inset-y-0 right-0 px-3 text-stone-400 hover:text-stone-600"
              aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            >
              {visible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <ul className="mt-2 space-y-1">
            {CRITERES.map((c) => {
              const ok = c.test(motDePasse);
              return (
                <li key={c.label} className={`flex items-center gap-1.5 text-xs ${ok ? "text-emerald-600" : "text-stone-400"}`}>
                  <Check size={12} className={ok ? "opacity-100" : "opacity-30"} />
                  {c.label}
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <label htmlFor="confirmation-mdp" className="text-xs font-medium text-stone-500">
            Confirme le mot de passe
          </label>
          <input
            id="confirmation-mdp"
            type={visible ? "text" : "password"}
            autoComplete="new-password"
            required
            maxLength={POLITIQUE_MOT_DE_PASSE.longueurMaximale}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
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
          {enCours ? "Enregistrement..." : "Enregistrer le mot de passe"}
        </button>
      </form>
    </AuthLayout>
  );
}
