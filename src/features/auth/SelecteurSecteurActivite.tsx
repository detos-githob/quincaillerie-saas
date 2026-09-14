import { LABELS_SECTEUR_ACTIVITE, OPTIONS_SECTEUR_ACTIVITE } from "../../lib/secteurActivite";
import type { SecteurActivite } from "../../types";

export function SelecteurSecteurActivite({
  valeur,
  onChange,
  valeurAutre,
  onChangeAutre,
}: {
  valeur: SecteurActivite;
  onChange: (v: SecteurActivite) => void;
  valeurAutre: string;
  onChangeAutre: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-stone-500">Secteur d'activité</label>
      <div className="grid grid-cols-2 gap-2 mt-1">
        {OPTIONS_SECTEUR_ACTIVITE.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className={`py-2 px-2 rounded-lg text-xs font-medium border text-left ${
              valeur === s
                ? "bg-slate-700 text-white border-slate-700"
                : "bg-white text-stone-600 border-stone-300"
            }`}
          >
            {LABELS_SECTEUR_ACTIVITE[s]}
          </button>
        ))}
      </div>
      {valeur === "autre" && (
        <input
          required
          value={valeurAutre}
          onChange={(e) => onChangeAutre(e.target.value)}
          placeholder="Précise ton activité..."
          className="w-full mt-2 border border-stone-300 rounded-lg py-2.5 px-3 text-sm"
        />
      )}
      <p className="text-[11px] text-stone-400 mt-1">
        Adapte les modules disponibles à ton activité. Les modules spécifiques
        à "Alimentation générale", "Pièces détachées" et "Autre" arriveront
        prochainement — tu as déjà accès à tous les modules de base.
      </p>
    </div>
  );
}
