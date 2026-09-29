import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Pencil, Printer, ScrollText } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { modeleConditionsTontine } from "../../lib/legal";
import {
  LONGUEUR_MAX_CONDITIONS,
  LONGUEUR_MIN_CONDITIONS,
  definirConditionsTontine,
  obtenirConditionsTontine,
} from "../../services/tontineService";
import type { ConditionsTontine } from "../../types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export function ConditionsTontinePage() {
  const { entreprise, utilisateur } = useAuth();
  const estGerant = utilisateur?.role === "gerant";
  const [conditions, setConditions] = useState<ConditionsTontine | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);
  const [edition, setEdition] = useState(false);
  const [brouillon, setBrouillon] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    obtenirConditionsTontine()
      .then((c) => {
        setConditions(c);
        if (!c && estGerant) {
          setBrouillon(modeleConditionsTontine(entreprise?.nom || "notre commerce"));
          setEdition(true);
        }
      })
      .catch(() => setErreurChargement("Impossible de charger les conditions. Vérifie ta connexion."))
      .finally(() => setChargement(false));
  }, [estGerant, entreprise?.nom]);

  function commencerEdition() {
    setBrouillon(conditions?.contenu ?? modeleConditionsTontine(entreprise?.nom || "notre commerce"));
    setErreur(null);
    setMessage(null);
    setEdition(true);
  }

  async function enregistrer() {
    const texte = brouillon.trim();
    setErreur(null);
    if (texte.length < LONGUEUR_MIN_CONDITIONS) {
      setErreur(`Les conditions doivent contenir au moins ${LONGUEUR_MIN_CONDITIONS} caractères.`);
      return;
    }
    if (/\[[^\]]*\]/.test(texte)) {
      setErreur("Remplace les passages entre crochets [ ] par tes propres règles avant d'enregistrer.");
      return;
    }
    setEnCours(true);
    try {
      const version = await definirConditionsTontine(texte);
      setConditions({
        entreprise_id: entreprise?.id ?? "",
        contenu: texte,
        version,
        updated_at: new Date().toISOString(),
      });
      setEdition(false);
      setMessage(
        `Conditions enregistrées (version ${version}). Les tontines déjà ouvertes gardent la version acceptée par leur client.`
      );
    } catch (e: any) {
      setErreur(e.message || "Enregistrement impossible.");
    } finally {
      setEnCours(false);
    }
  }

  if (chargement) return <div className="p-6 text-stone-400 text-sm">Chargement des conditions...</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-5">
      <Link to="/tontines" className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 mb-3 print:hidden">
        <ArrowLeft size={16} /> Tontines
      </Link>

      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-stone-900">Conditions générales de la tontine</h1>
          {conditions && !edition && (
            <p className="text-xs text-stone-400 mt-0.5">
              {entreprise?.nom} · version {conditions.version} du {formatDate(conditions.updated_at)}
            </p>
          )}
        </div>
        {conditions && !edition && (
          <div className="flex gap-2 shrink-0 print:hidden">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 border border-stone-300 text-stone-700 text-sm font-medium px-3 py-2 rounded-lg bg-white"
            >
              <Printer size={15} /> <span className="hidden sm:inline">Imprimer</span>
            </button>
            {estGerant && (
              <button
                onClick={commencerEdition}
                className="flex items-center gap-1.5 bg-navy text-white text-sm font-medium px-3.5 py-2 rounded-lg"
              >
                <Pencil size={15} /> Modifier
              </button>
            )}
          </div>
        )}
      </div>

      {erreurChargement && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{erreurChargement}</p>
      )}

      {message && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-4 print:hidden">
          {message}
        </p>
      )}

      {edition ? (
        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-3">
          <p className="text-sm text-stone-600">
            {conditions
              ? "Toute modification crée une nouvelle version. Elle s'appliquera aux prochaines tontines ; les tontines en cours restent liées aux conditions acceptées par leur client."
              : "Rédige les règles de tes tontines. Un modèle est proposé : adapte-le et remplace les passages entre crochets. Ces conditions seront présentées et acceptées par chaque client à l'ouverture de sa tontine."}
          </p>
          <label htmlFor="texte-conditions" className="sr-only">
            Texte des conditions
          </label>
          <textarea
            id="texte-conditions"
            value={brouillon}
            onChange={(e) => setBrouillon(e.target.value)}
            maxLength={LONGUEUR_MAX_CONDITIONS}
            rows={18}
            className="w-full border border-stone-300 rounded-lg p-3 text-sm leading-relaxed font-body focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <p className="text-xs text-stone-400 text-right">
            {brouillon.length.toLocaleString("fr-FR")} / {LONGUEUR_MAX_CONDITIONS.toLocaleString("fr-FR")} caractères
          </p>
          {erreur && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erreur}</p>}
          <div className="flex gap-2 justify-end">
            {conditions && (
              <button
                onClick={() => setEdition(false)}
                disabled={enCours}
                className="border border-stone-300 text-stone-700 text-sm font-medium px-4 py-2.5 rounded-xl"
              >
                Annuler
              </button>
            )}
            <button
              onClick={enregistrer}
              disabled={enCours}
              className="bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold text-sm px-4 py-2.5 rounded-xl disabled:opacity-60"
            >
              {enCours ? "Enregistrement..." : "Enregistrer les conditions"}
            </button>
          </div>
        </div>
      ) : conditions ? (
        <article className="bg-white border border-stone-200 rounded-xl p-5">
          <p className="text-[15px] leading-relaxed text-stone-800 whitespace-pre-line max-w-prose">{conditions.contenu}</p>
        </article>
      ) : (
        !erreurChargement && (
          <div className="bg-white border border-stone-200 rounded-xl p-6 text-center">
            <ScrollText size={22} className="mx-auto text-stone-300" />
            <p className="text-sm text-stone-600 mt-2">Le gérant n'a pas encore défini les conditions de la tontine.</p>
            <p className="text-xs text-stone-400 mt-1">Aucune nouvelle tontine ne peut être ouverte tant qu'elles n'existent pas.</p>
          </div>
        )
      )}
    </div>
  );
}
