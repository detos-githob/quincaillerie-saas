import { useState, type FormEvent } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../hooks/useAuth";
import { SelecteurSecteurActivite } from "./SelecteurSecteurActivite";
import type { SecteurActivite } from "../../types";
import { CGU_VERSION } from "../../lib/legal";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { CaseAcceptationCgu } from "./CaseAcceptationCgu";

export function CompleterInscriptionPage() {
  const { session, rafraichirProfil, deconnexion } = useAuth();
  const navigate = useNavigate();

  const [nomEntreprise, setNomEntreprise] = useState("");
  const [regimeFiscal, setRegimeFiscal] = useState<"forfait" | "reel">("forfait");
  const [telephoneEntreprise, setTelephoneEntreprise] = useState("");
  const [secteurActivite, setSecteurActivite] = useState<SecteurActivite>("quincaillerie");
  const [secteurActiviteAutre, setSecteurActiviteAutre] = useState("");
  const [nomGerant, setNomGerant] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // Acceptation déjà donnée sur le formulaire d'inscription (avant la
  // confirmation de l'email) : inutile de la redemander.
  const cguDejaAcceptees = session?.user.user_metadata?.cgu_version === CGU_VERSION;
  const [cguAcceptees, setCguAcceptees] = useState(cguDejaAcceptees);

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  async function gererSoumission(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (!cguAcceptees) {
      setErreur("Tu dois accepter les conditions générales pour créer ton entreprise.");
      return;
    }
    setEnCours(true);
    try {
      const { error } = await supabase.rpc("creer_entreprise_et_gerant", {
        p_nom_entreprise: nomEntreprise,
        p_regime_fiscal: regimeFiscal,
        p_telephone: telephoneEntreprise || null,
        p_nom_gerant: nomGerant,
        p_secteur_activite: secteurActivite,
        p_secteur_activite_autre: secteurActivite === "autre" ? secteurActiviteAutre : null,
      });
      if (error) throw error;

      const { error: erreurCgu } = await supabase.rpc("enregistrer_acceptation_cgu", {
        p_version: CGU_VERSION,
      });
      if (erreurCgu) console.warn("Enregistrement de l'acceptation des CGU impossible :", erreurCgu.message);

      await rafraichirProfil();
      navigate("/");
    } catch (e: any) {
      setErreur(e.message || "Une erreur est survenue.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <AuthLayout titre="Encore une étape" sousTitre="Ton email est confirmé — crée maintenant ton entreprise">
      <form onSubmit={gererSoumission} className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4">
        <div>
          <label className="text-xs font-medium text-stone-500">Nom de l'entreprise</label>
          <input
            required
            value={nomEntreprise}
            onChange={(e) => setNomEntreprise(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2.5 px-3 text-sm"
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
            />
          </div>
        </div>

        <SelecteurSecteurActivite
          valeur={secteurActivite}
          onChange={setSecteurActivite}
          valeurAutre={secteurActiviteAutre}
          onChangeAutre={setSecteurActiviteAutre}
        />

        <div>
          <label className="text-xs font-medium text-stone-500">Ton nom (gérant)</label>
          <input
            required
            value={nomGerant}
            onChange={(e) => setNomGerant(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2.5 px-3 text-sm"
          />
        </div>

        {!cguDejaAcceptees && <CaseAcceptationCgu cochee={cguAcceptees} onChange={setCguAcceptees} />}

        {erreur && <p className="text-sm text-red-600">{erreur}</p>}

        <button
          type="submit"
          disabled={enCours}
          className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-3 rounded-xl disabled:opacity-60"
        >
          {enCours ? "Création..." : "Créer mon entreprise"}
        </button>

        <button
          type="button"
          onClick={deconnexion}
          className="w-full text-center text-xs text-stone-400"
        >
          Se déconnecter
        </button>
      </form>
    </AuthLayout>
  );
}
