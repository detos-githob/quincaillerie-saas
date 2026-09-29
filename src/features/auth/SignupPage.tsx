import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabaseClient";
import { SelecteurSecteurActivite } from "./SelecteurSecteurActivite";
import { POLITIQUE_MOT_DE_PASSE, validerMotDePasse } from "../../lib/security";
import { CGU_VERSION } from "../../lib/legal";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { CaseAcceptationCgu } from "./CaseAcceptationCgu";
import type { SecteurActivite } from "../../types";

export function SignupPage() {
  const { inscription } = useAuth();
  const navigate = useNavigate();

  const [nomEntreprise, setNomEntreprise] = useState("");
  const [regimeFiscal, setRegimeFiscal] = useState<"forfait" | "reel">("forfait");
  const [telephoneEntreprise, setTelephoneEntreprise] = useState("");
  const [secteurActivite, setSecteurActivite] = useState<SecteurActivite>("quincaillerie");
  const [secteurActiviteAutre, setSecteurActiviteAutre] = useState("");
  const [nomGerant, setNomGerant] = useState("");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [cguAcceptees, setCguAcceptees] = useState(false);

  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmationEnvoyee, setConfirmationEnvoyee] = useState(false);

  async function gererSoumission(e: FormEvent) {
    e.preventDefault();
    setErreur(null);

    if (!cguAcceptees) {
      setErreur("Tu dois accepter les conditions générales pour créer ton entreprise.");
      return;
    }

    const erreurMotDePasse = validerMotDePasse(motDePasse);
    if (erreurMotDePasse) {
      setErreur(erreurMotDePasse);
      return;
    }

    setEnCours(true);

    try {
      const { erreur: erreurInscription, confirmationRequise } = await inscription(
        email,
        motDePasse,
        CGU_VERSION
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
        p_secteur_activite: secteurActivite,
        p_secteur_activite_autre: secteurActivite === "autre" ? secteurActiviteAutre : null,
      });
      if (error) throw error;

      // Horodatage serveur de l'acceptation des CGU. Non bloquant :
      // l'entreprise est déjà créée et la version acceptée reste
      // mémorisée sur le compte (métadonnées) en cas d'échec ponctuel.
      const { error: erreurCgu } = await supabase.rpc("enregistrer_acceptation_cgu", {
        p_version: CGU_VERSION,
      });
      if (erreurCgu) console.warn("Enregistrement de l'acceptation des CGU impossible :", erreurCgu.message);

      navigate("/");
    } catch (e: any) {
      setErreur(e.message || "Une erreur est survenue lors de la création de l'entreprise.");
    } finally {
      setEnCours(false);
    }
  }

  if (confirmationEnvoyee) {
    return (
      <AuthLayout titre="Vérifie ta boîte mail">
        <div className="bg-white border border-stone-200 rounded-2xl p-6 text-center space-y-3">
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
      </AuthLayout>
    );
  }

  return (
    <AuthLayout titre="Créer ton entreprise" sousTitre="Quelques informations pour démarrer">
      <form onSubmit={gererSoumission} className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4">
        <div>
          <label className="text-xs font-medium text-stone-500">Nom de l'entreprise</label>
          <input
            required
            value={nomEntreprise}
            onChange={(e) => setNomEntreprise(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            placeholder="Quincaillerie ATTIOGBE, Dépôt Boissons ATTIOGBE..."
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

        <SelecteurSecteurActivite
          valeur={secteurActivite}
          onChange={setSecteurActivite}
          valeurAutre={secteurActiviteAutre}
          onChangeAutre={setSecteurActiviteAutre}
        />

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
            autoComplete="new-password"
            required
            minLength={POLITIQUE_MOT_DE_PASSE.longueurMinimale}
            maxLength={POLITIQUE_MOT_DE_PASSE.longueurMaximale}
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2.5 px-3 text-sm"
            placeholder={`${POLITIQUE_MOT_DE_PASSE.longueurMinimale} caractères minimum`}
          />
          <p className="text-[11px] text-stone-400 mt-1">
            Majuscule, minuscule, chiffre et caractère spécial requis.
          </p>
        </div>

        <CaseAcceptationCgu cochee={cguAcceptees} onChange={setCguAcceptees} />

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
    </AuthLayout>
  );
}

