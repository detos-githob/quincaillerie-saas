import { Link } from "react-router-dom";

/**
 * Case à cocher d'acceptation de conditions, suivie du lien vers le
 * texte. Le lien s'ouvre dans un nouvel onglet pour ne pas perdre la
 * saisie du formulaire en cours.
 */
export function CaseAcceptation({
  id,
  cochee,
  onChange,
  avantLien,
  texteLien,
  lienVers,
  desactivee = false,
}: {
  id: string;
  cochee: boolean;
  onChange: (valeur: boolean) => void;
  avantLien: string;
  texteLien: string;
  lienVers: string;
  desactivee?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        checked={cochee}
        required
        disabled={desactivee}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-stone-300 accent-amber-500 focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
      />
      <label htmlFor={id} className="text-sm text-stone-600 leading-snug">
        {avantLien}{" "}
        <Link
          to={lienVers}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-amber-600 underline underline-offset-2 hover:text-amber-700"
        >
          {texteLien}
        </Link>
      </label>
    </div>
  );
}

export function CaseAcceptationCgu({ cochee, onChange }: { cochee: boolean; onChange: (v: boolean) => void }) {
  return (
    <CaseAcceptation
      id="accepter-cgu"
      cochee={cochee}
      onChange={onChange}
      avantLien="J'accepte les"
      texteLien="Conditions générales"
      lienVers="/conditions-generales"
    />
  );
}
