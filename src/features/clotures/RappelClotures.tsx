import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, ChevronRight } from "lucide-react";
import { obtenirEtatClotures } from "../../services/cloturesService";
import { libellePeriode } from "./formatCloture";

/**
 * Rappel discret sur le tableau de bord : journées passées qui ont eu
 * des opérations mais ne sont pas clôturées. Invisible si tout est à
 * jour, si les clôtures n'ont jamais été utilisées ou en cas d'erreur.
 */
export function RappelClotures() {
  const [enRetard, setEnRetard] = useState<string[]>([]);

  useEffect(() => {
    let actif = true;
    obtenirEtatClotures()
      .then((e) => {
        if (actif && e.derniere_journee) {
          setEnRetard(e.journees_en_attente.filter((j) => j < e.aujourdhui));
        }
      })
      .catch(() => undefined);
    return () => {
      actif = false;
    };
  }, []);

  if (enRetard.length === 0) return null;

  return (
    <Link
      to="/clotures"
      className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-900"
    >
      <CalendarCheck size={18} className="shrink-0 text-amber-600" />
      <span className="flex-1">
        {enRetard.length === 1
          ? `La journée du ${libellePeriode("jour", enRetard[0], true)} n'est pas clôturée.`
          : `${enRetard.length} journées ne sont pas clôturées, la plus ancienne date du ${libellePeriode("jour", enRetard[0], true)}.`}
      </span>
      <ChevronRight size={16} className="text-amber-700" />
    </Link>
  );
}
