import { useState } from "react";
import { Settings, Check } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { modifierSecteursActifs } from "../../services/entrepriseService";
import { LABELS_SECTEUR_ACTIVITE, OPTIONS_SECTEUR_ACTIVITE } from "../../lib/secteurActivite";
import type { SecteurActivite } from "../../types";

// "autre" n'a pas de module dédié à activer/désactiver : rien à cocher.
const SECTEURS_ACTIVABLES = OPTIONS_SECTEUR_ACTIVITE.filter((s) => s !== "autre");

export function ParametresPage() {
  const { entreprise, rafraichirProfil } = useAuth();
  const [secteursActifs, setSecteursActifs] = useState<SecteurActivite[]>(
    entreprise?.secteurs_actifs || (entreprise ? [entreprise.secteur_activite] : [])
  );
  const [enCours, setEnCours] = useState(false);
  const [enregistre, setEnregistre] = useState(false);

  if (!entreprise) return null;

  function basculer(secteur: SecteurActivite) {
    setEnregistre(false);
    setSecteursActifs((prev) =>
      prev.includes(secteur) ? prev.filter((s) => s !== secteur) : [...prev, secteur]
    );
  }

  async function gererEnregistrement() {
    setEnCours(true);
    try {
      await modifierSecteursActifs(entreprise!.id, entreprise!.secteur_activite, secteursActifs);
      await rafraichirProfil();
      setEnregistre(true);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 pb-10">
      <div className="flex items-center gap-2 mb-4">
        <span className="flex items-center justify-center w-10 h-10 rounded-full bg-stone-100">
          <Settings size={18} className="text-stone-500" />
        </span>
        <h1 className="font-display text-2xl font-bold text-stone-900">Paramètres</h1>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <p className="font-display text-lg font-bold text-stone-900 mb-1">Activités de l'entreprise</p>
        <p className="text-xs text-stone-500 mb-4">
          Active plusieurs activités en même temps si ton commerce en cumule
          plusieurs (ex : quincaillerie ET dépôt de boissons). Chaque activité
          ajoute ses modules dédiés à la navigation. Ton activité principale
          ({LABELS_SECTEUR_ACTIVITE[entreprise.secteur_activite]}) reste
          toujours active.
        </p>

        <div className="space-y-2">
          {SECTEURS_ACTIVABLES.map((secteur) => {
            const actif = secteursActifs.includes(secteur) || secteur === entreprise.secteur_activite;
            const verrouille = secteur === entreprise.secteur_activite;
            return (
              <button
                key={secteur}
                type="button"
                disabled={verrouille}
                onClick={() => basculer(secteur)}
                className={`w-full flex items-center justify-between p-3 rounded-lg border text-left ${
                  actif ? "bg-amber-50 border-amber-200" : "bg-white border-stone-200"
                } ${verrouille ? "opacity-70 cursor-default" : ""}`}
              >
                <div>
                  <p className="text-sm font-medium text-stone-900">{LABELS_SECTEUR_ACTIVITE[secteur]}</p>
                  {verrouille && <p className="text-[11px] text-stone-400">Activité principale</p>}
                </div>
                {actif && (
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white shrink-0">
                    <Check size={12} />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          onClick={gererEnregistrement}
          disabled={enCours}
          className="w-full mt-4 bg-navy text-white font-semibold py-2.5 rounded-xl disabled:opacity-60"
        >
          {enCours ? "Enregistrement..." : enregistre ? "Enregistré ✓" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
