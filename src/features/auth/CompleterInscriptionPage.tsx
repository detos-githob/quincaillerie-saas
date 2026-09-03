import { useState, type FormEvent } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../hooks/useAuth";

export function CompleterInscriptionPage() {
  const { session, rafraichirProfil, deconnexion } = useAuth();
  const navigate = useNavigate();

  const [nomEntreprise, setNomEntreprise] = useState("");
  const [regimeFiscal, setRegimeFiscal] = useState<"forfait" | "reel">("forfait");
  const [telephoneEntreprise, setTelephoneEntreprise] = useState("");
  const [nomGerant, setNomGerant] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  async function gererSoumission(e: FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    try {
      const { error } = await supabase.rpc("creer_entreprise_et_gerant", {
        p_nom_entreprise: nomEntreprise,
        p_regime_fiscal: regimeFiscal,
        p_telephone: telephoneEntreprise || null,
        p_nom_gerant: nomGerant,
      });
      if (error) throw error;

      await rafraichirProfil();
      navigate("/");
    } catch (e: any) {
      setErreur(e.message || "Une erreur est survenue.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4 py-10 font-body">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
        .font-display { font-family: 'Barlow Condensed', sans-serif; }
        .font-body { font-family: 'Inter', sans-serif; }
      `}</style>
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="font-display text-3xl font-bold text-stone-900">Encore une étape</h1>
          <p className="text-stone-500 text-sm mt-1">
            Ton email est confirmé — crée maintenant ton entreprise
          </p>
        </div>

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

          <div>
            <label className="text-xs font-medium text-stone-500">Ton nom (gérant)</label>
            <input
              required
              value={nomGerant}
              onChange={(e) => setNomGerant(e.target.value)}
              className="w-full mt-1 border border-stone-300 rounded-lg py-2.5 px-3 text-sm"
            />
          </div>

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
      </div>
    </div>
  );
}
