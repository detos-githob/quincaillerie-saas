import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Settings, Check, Lock, Sparkles, AlertTriangle } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { modifierSecteursActifs } from "../../services/entrepriseService";
import { listerOffresPubliques, type OffreAbonnement } from "../../services/offresService";
import { LABELS_SECTEUR_ACTIVITE, OPTIONS_SECTEUR_ACTIVITE, maxSecteurs } from "../../lib/secteurActivite";
import type { SecteurActivite } from "../../types";

// "autre" n'a pas de module dédié à activer/désactiver : rien à cocher.
const SECTEURS_ACTIVABLES = OPTIONS_SECTEUR_ACTIVITE.filter((s) => s !== "autre");

function messageErreur(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return "Impossible d'enregistrer. Réessaie.";
}

export function ParametresPage() {
  const { entreprise, offre, rafraichirProfil } = useAuth();
  const principal = entreprise?.secteur_activite;
  const [secteursActifs, setSecteursActifs] = useState<SecteurActivite[]>(() => {
    if (!entreprise) return [];
    const base = entreprise.secteurs_actifs?.length ? entreprise.secteurs_actifs : [entreprise.secteur_activite];
    return Array.from(new Set([entreprise.secteur_activite, ...base]));
  });
  const [enCours, setEnCours] = useState(false);
  const [enregistre, setEnregistre] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [offreSuperieure, setOffreSuperieure] = useState<OffreAbonnement | null>(null);

  const limite = maxSecteurs(offre);
  // Le secteur principal compte toujours dans le total.
  const selection = principal ? Array.from(new Set([principal, ...secteursActifs])) : secteursActifs;
  const nbChoisis = selection.length;
  const limiteAtteinte = nbChoisis >= limite;
  const depassement = nbChoisis > limite;

  // Suggère l'offre publique la moins chère qui autorise plus d'activités.
  useEffect(() => {
    let annule = false;
    listerOffresPubliques()
      .then(({ offres }) => {
        if (annule) return;
        const candidates = offres
          .filter((o) => (o.max_secteurs ?? 1) > limite)
          .sort((a, b) => a.prix_mensuel - b.prix_mensuel);
        setOffreSuperieure(candidates[0] ?? null);
      })
      .catch(() => {});
    return () => {
      annule = true;
    };
  }, [limite]);

  if (!entreprise) return null;

  function basculer(secteur: SecteurActivite) {
    setEnregistre(false);
    setErreur(null);
    setSecteursActifs((prev) => {
      if (prev.includes(secteur)) return prev.filter((s) => s !== secteur);
      if (limiteAtteinte) return prev;
      return [...prev, secteur];
    });
  }

  async function gererEnregistrement() {
    setEnCours(true);
    setErreur(null);
    try {
      await modifierSecteursActifs(entreprise!.id, entreprise!.secteur_activite, selection);
      await rafraichirProfil();
      setEnregistre(true);
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnCours(false);
    }
  }

  const nomOffre = offre?.nom ?? "actuelle";

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 pb-10">
      <div className="flex items-center gap-2 mb-4">
        <span className="flex items-center justify-center w-10 h-10 rounded-full bg-stone-100">
          <Settings size={18} className="text-stone-500" />
        </span>
        <h1 className="font-display text-2xl font-bold text-stone-900">Paramètres</h1>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <div className="flex items-start justify-between gap-3 mb-1">
          <p className="font-display text-lg font-bold text-stone-900">Activités de l'entreprise</p>
          <span
            className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-full ${
              depassement ? "bg-red-100 text-red-700" : "bg-stone-100 text-stone-600"
            }`}
          >
            {nbChoisis}/{limite} activité{limite > 1 ? "s" : ""}
          </span>
        </div>
        <p className="text-xs text-stone-500 mb-4">
          {limite <= 1 ? (
            <>
              Ton offre <strong>{nomOffre}</strong> comprend une seule activité : ton activité principale (
              {LABELS_SECTEUR_ACTIVITE[entreprise.secteur_activite]}).
            </>
          ) : (
            <>
              Ton offre <strong>{nomOffre}</strong> te permet de cumuler jusqu'à {limite} activités (ex : quincaillerie
              ET dépôt de boissons). Chaque activité ajoute ses modules à la navigation. Ton activité principale (
              {LABELS_SECTEUR_ACTIVITE[entreprise.secteur_activite]}) reste toujours active.
            </>
          )}
        </p>

        {depassement && (
          <div className="flex gap-2 items-start bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg p-3 mb-3">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <p>
              Tu as {nbChoisis} activités alors que ton offre en permet {limite}. Seules les {limite} premières restent
              visibles dans le menu. Décoche celles en trop ou passe à une offre supérieure. Tes données ne sont pas
              supprimées.
            </p>
          </div>
        )}

        <div className="space-y-2">
          {SECTEURS_ACTIVABLES.map((secteur) => {
            const estPrincipal = secteur === entreprise.secteur_activite;
            const actif = selection.includes(secteur);
            const bloque = !actif && limiteAtteinte;
            const desactive = estPrincipal || bloque;
            return (
              <button
                key={secteur}
                type="button"
                disabled={desactive}
                onClick={() => basculer(secteur)}
                title={bloque ? "Non inclus dans ton offre" : undefined}
                className={`w-full flex items-center justify-between p-3 rounded-lg border text-left transition ${
                  actif
                    ? "bg-amber-50 border-amber-200"
                    : bloque
                      ? "bg-stone-50 border-stone-200 cursor-not-allowed"
                      : "bg-white border-stone-200 hover:border-amber-200"
                } ${estPrincipal ? "opacity-70 cursor-default" : ""}`}
              >
                <div>
                  <p className={`text-sm font-medium ${bloque ? "text-stone-400" : "text-stone-900"}`}>
                    {LABELS_SECTEUR_ACTIVITE[secteur]}
                  </p>
                  {estPrincipal && <p className="text-[11px] text-stone-400">Activité principale</p>}
                  {bloque && <p className="text-[11px] text-stone-400">Verrouillé avec ton offre</p>}
                </div>
                {actif ? (
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white shrink-0">
                    <Check size={12} />
                  </span>
                ) : bloque ? (
                  <Lock size={15} className="text-stone-400 shrink-0" />
                ) : null}
              </button>
            );
          })}
        </div>

        {limiteAtteinte && offreSuperieure && (
          <Link
            to="/offres"
            className="mt-3 flex items-center gap-2 text-xs bg-navy/5 border border-navy/10 text-navy rounded-lg p-3 hover:bg-navy/10"
          >
            <Sparkles size={15} className="shrink-0" />
            <span>
              Besoin de plus d'activités ? L'offre <strong>{offreSuperieure.nom}</strong> permet jusqu'à{" "}
              {offreSuperieure.max_secteurs} activités. Voir les offres →
            </span>
          </Link>
        )}

        {erreur && <p className="mt-3 text-xs text-red-600">{erreur}</p>}

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
