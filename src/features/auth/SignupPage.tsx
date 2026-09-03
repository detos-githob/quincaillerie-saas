import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabaseClient";

export function SignupPage() {
  const { inscription } = useAuth();
  const navigate = useNavigate();

  const [nomEntreprise, setNomEntreprise] = useState("");
  const [regimeFiscal, setRegimeFiscal] = useState<"forfait" | "reel">("forfait");
  const [telephoneEntreprise, setTelephoneEntreprise] = useState("");
  const [nomGerant, setNomGerant] = useState("");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");

  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmationEnvoyee, setConfirmationEnvoyee] = useState(false);

  async function gererSoumission(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);

    try {
      const { erreur: erreurInscription, confirmationRequise } = await inscription(
        email,
        motDePasse
      );
      if (erreurInscription) {
        setErreur(erreurInscription);
        return;
      }

      if (confirmationRequise) {
        // Le projet Supabase exige de confirmer l'email avant de pouvoir
        // se connecter. On ne peut pas créer l'entreprise tout de suite
        // (pas de session active) : l'utilisateur la complètera après
        // confirmation, via l'écran "Compléter l'inscription".
        setConfirmationEnvoyee(true);
        return;
      }

      // Session immédiatement disponible : on finalise la création de
      // l'entreprise et du compte gérant dans la foulée.
      const { error } = await supabase.rpc("creer_entreprise_et_gerant", {
        p_nom_entreprise: nomEntreprise,
        p_regime_fiscal: regimeFiscal,
        p_telephone: telephoneEntreprise || null,
        p_nom_gerant: nomGerant,
      });
      if (error) throw error;

      navigate("/");
    } catch (e: any) {
      setErreur(e.message || "Une erreur est survenue lors de la création de l'entreprise.");
    } finally {
      setEnCours(false);
    }
  }

  if (confirmationEnvoyee) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4 font-body">
        <FontImport />
        <div className="w-full max-w-sm bg-white border border-stone-200 rounded-2xl p-6 text-center space-y-3">
          <h1 className="font-display text-2xl font-bold text-stone-900">Vérifie ta boîte mail</h1>
          <p className="text-sm text-stone-600">
            Un lien de confirmation a été envoyé à <strong>{email}</strong>. Clique dessus, puis
            reviens te connecter pour terminer la création de ton entreprise.
          </p>
          <Link
            to="/login"
            className="inline-block mt-2 text-amber-600 font-medium text-sm"
          >
            Aller à la connexion
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4 py-10 font-body">
      <FontImport />
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="font-display text-3xl font-bold text-stone-900">
            Créer ton entreprise
          </h1>
          <p className="text-stone-500 text-sm mt-1">
            Quelques informations pour démarrer
          </p>
        </div>

        <form onSubmit={gererSoumission} className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-stone-500">Nom de l'entreprise</label>
            <input
              required
              value={nomEntreprise}
              onChange={(e) => setNomEntreprise(e.target.value)}
              className="w-full mt-1 border border-stone-300 rounded-lg py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="Quincaillerie ATTIOGBE"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-stone-500">Régime fiscal</label>
              <select
                value={regimeFiscal}
                onChange={(e) => setRegimeFiscal(e.target.value as "forfait" | "reel")}
                className="w-full mt-1 border border-stone-300 rounded-lg py-2.5 px-3 text-sm bg-white"
              >
                <option value="forfait">Forfait (TPS)</option>
                <option value="reel">Réel (TVA)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-stone-500">Téléphone</label>
              <input
                value={telephoneEntreprise}
                onChange={(e) => setTelephoneEntreprise(e.target.value)}
                className="w-full mt-1 border border-stone-300 rounded-lg py-2.5 px-3 text-sm"
                placeholder="+229 ..."
              />
            </div>
          </div>

          <hr className="border-stone-100" />

          <div>
            <label className="text-xs font-medium text-stone-500">Ton nom (gérant)</label>
            <input
              required
              value={nomGerant}
              onChange={(e) => setNomGerant(e.target.value)}
              className="w-full mt-1 border border-stone-300 rounded-lg py-2.5 px-3 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-stone-500">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full mt-1 border border-stone-300 rounded-lg py-2.5 px-3 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-stone-500">Mot de passe</label>
            <input
              type="password"
              required
              minLength={6}
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              className="w-full mt-1 border border-stone-300 rounded-lg py-2.5 px-3 text-sm"
              placeholder="6 caractères minimum"
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
            {enCours ? "Création..." : "Créer mon entreprise"}
          </button>

          <p className="text-center text-xs text-stone-400">
            Déjà un compte ? <Link to="/login" className="text-amber-600 font-medium">Se connecter</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

function FontImport() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
      .font-display { font-family: 'Barlow Condensed', sans-serif; }
      .font-body { font-family: 'Inter', sans-serif; }
    `}</style>
  );
}
