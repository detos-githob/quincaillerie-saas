import { useEffect, useState } from "react";
import { Plus, Star, X } from "lucide-react";
import {
  MODULES_OFFRE,
  enregistrerOffre,
  listerToutesLesOffres,
  type ModuleOffre,
  type OffreAbonnement,
} from "../../services/offresService";

function f(n: number): string {
  return Math.round(n).toLocaleString("fr-FR") + " F";
}

export function OngletOffres() {
  const [offres, setOffres] = useState<OffreAbonnement[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [edition, setEdition] = useState<OffreAbonnement | "nouvelle" | null>(null);

  const charger = () =>
    listerToutesLesOffres()
      .then(setOffres)
      .catch((e) => setErreur(e.message));

  useEffect(() => {
    charger();
  }, []);

  if (erreur) return <p className="text-sm text-red-600">{erreur}</p>;
  if (!offres) return <p className="text-sm text-stone-400">Chargement des offres...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-stone-600 max-w-lg">
          Prix, nombre de comptes et modules de chaque offre. Un changement s'applique immédiatement : page d'accueil,
          page Offres, droits des commerces et prochains paiements.
        </p>
        <button
          onClick={() => setEdition("nouvelle")}
          className="shrink-0 flex items-center gap-1.5 bg-navy text-white text-sm font-medium px-3.5 py-2 rounded-lg"
        >
          <Plus size={16} /> Nouvelle offre
        </button>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {offres.map((o) => (
          <button
            key={o.id}
            onClick={() => setEdition(o)}
            className={`flex flex-col items-stretch text-left bg-white border rounded-xl p-4 hover:border-stone-400 ${
              o.active ? "border-stone-200" : "border-dashed border-stone-300 opacity-70"
            }`}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-display text-xl font-bold text-stone-900">{o.nom}</p>
              <span className="text-[11px] text-stone-400 font-mono">{o.id}</span>
              {o.recommandee && <Star size={14} className="text-amber-500 fill-amber-400" />}
            </div>
            <div className="flex gap-1.5 mt-1 flex-wrap">
              {o.est_essai && <Badge texte={`Essai · ${o.duree_essai_jours} jours`} couleur="amber" />}
              {!o.est_essai && o.publique && o.active && <Badge texte="En vente" couleur="emerald" />}
              {!o.est_essai && !o.publique && <Badge texte="Masquée" couleur="stone" />}
              {!o.active && <Badge texte="Désactivée" couleur="stone" />}
            </div>
            {!o.est_essai && (
              <p className="mt-2 text-sm text-stone-700 tabular-nums">
                {f(o.prix_mensuel)} / mois · {f(o.prix_annuel)} / an
              </p>
            )}
            <p className="text-xs text-stone-500 mt-1">
              {o.max_utilisateurs} compte{o.max_utilisateurs > 1 ? "s" : ""}
              {` · ${o.max_secteurs ?? 1} activité${(o.max_secteurs ?? 1) > 1 ? "s" : ""}`}
              {o.modules.length > 0
                ? ` · ${o.modules.map((m) => MODULES_OFFRE.find((x) => x.id === m)?.label).join(", ")}`
                : " · modules de base"}
            </p>
          </button>
        ))}
      </div>

      {edition && (
        <ModaleOffre
          offre={edition === "nouvelle" ? null : edition}
          onFerme={() => setEdition(null)}
          onEnregistree={async () => {
            setEdition(null);
            await charger();
          }}
        />
      )}
    </div>
  );
}

function Badge({ texte, couleur }: { texte: string; couleur: "amber" | "emerald" | "stone" }) {
  const classes = {
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    stone: "bg-stone-100 text-stone-600 border-stone-200",
  }[couleur];
  return <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded border ${classes}`}>{texte}</span>;
}

function slug(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
}

function ModaleOffre({
  offre,
  onFerme,
  onEnregistree,
}: {
  offre: OffreAbonnement | null;
  onFerme: () => void;
  onEnregistree: () => Promise<void>;
}) {
  const nouvelle = !offre;
  const [nom, setNom] = useState(offre?.nom ?? "");
  const [id, setId] = useState(offre?.id ?? "");
  const [idModifie, setIdModifie] = useState(false);
  const [description, setDescription] = useState(offre?.description ?? "");
  const [prixMensuel, setPrixMensuel] = useState(String(offre?.prix_mensuel ?? ""));
  const [prixAnnuel, setPrixAnnuel] = useState(String(offre?.prix_annuel ?? ""));
  const [maxUtilisateurs, setMaxUtilisateurs] = useState(String(offre?.max_utilisateurs ?? 2));
  const [maxSecteurs, setMaxSecteurs] = useState(String(offre?.max_secteurs ?? 1));
  const [modules, setModules] = useState<ModuleOffre[]>(offre?.modules ?? []);
  const [avantages, setAvantages] = useState((offre?.avantages ?? []).join("\n"));
  const [publique, setPublique] = useState(offre?.publique ?? true);
  const [recommandee, setRecommandee] = useState(offre?.recommandee ?? false);
  const [active, setActive] = useState(offre?.active ?? true);
  const [dureeEssai, setDureeEssai] = useState(String(offre?.duree_essai_jours ?? 7));
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const essai = !!offre?.est_essai;

  async function enregistrer() {
    setErreur(null);
    setEnCours(true);
    try {
      await enregistrerOffre({
        id: nouvelle ? id : offre!.id,
        nom: nom.trim(),
        description: description.trim(),
        prix_mensuel: Number(prixMensuel) || 0,
        prix_annuel: Number(prixAnnuel) || 0,
        max_utilisateurs: Number(maxUtilisateurs) || 1,
        max_secteurs: Math.min(5, Math.max(1, Number(maxSecteurs) || 1)),
        modules,
        avantages: avantages.split("\n").map((l) => l.trim()).filter(Boolean),
        publique,
        recommandee,
        active,
        duree_essai_jours: essai ? Number(dureeEssai) || 7 : null,
      });
      await onEnregistree();
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnCours(false);
    }
  }

  const champ = "w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm";
  const prixM = Number(prixMensuel) || 0;
  const prixA = Number(prixAnnuel) || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:px-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-navy/40" onClick={onFerme} />
      <div className="relative bg-white w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold text-stone-900">
            {nouvelle ? "Nouvelle offre" : `Offre ${offre!.nom}`}
          </h2>
          <button onClick={onFerme} className="p-1 text-stone-400" aria-label="Fermer">
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 sm:col-span-1">
            <span className="text-xs font-medium text-stone-500">Nom affiché</span>
            <input
              value={nom}
              onChange={(e) => {
                setNom(e.target.value);
                if (nouvelle && !idModifie) setId(slug(e.target.value));
              }}
              maxLength={40}
              className={champ}
            />
          </label>
          <label className="col-span-2 sm:col-span-1">
            <span className="text-xs font-medium text-stone-500">Identifiant {nouvelle ? "" : "(non modifiable)"}</span>
            <input
              value={id}
              disabled={!nouvelle}
              onChange={(e) => {
                setIdModifie(true);
                setId(slug(e.target.value));
              }}
              className={`${champ} font-mono disabled:bg-stone-50 disabled:text-stone-500`}
            />
          </label>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-stone-500">Pour qui (phrase courte)</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={160} className={champ} />
        </label>

        {essai ? (
          <label className="block">
            <span className="text-xs font-medium text-stone-500">Durée de l'essai gratuit (jours)</span>
            <input type="number" min={1} max={365} value={dureeEssai} onChange={(e) => setDureeEssai(e.target.value)} className={champ} />
            <span className="text-[11px] text-stone-400">S'applique aux prochaines inscriptions.</span>
          </label>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="text-xs font-medium text-stone-500">Prix mensuel (F)</span>
              <input type="number" min={0} inputMode="numeric" value={prixMensuel} onChange={(e) => setPrixMensuel(e.target.value)} className={`${champ} tabular-nums`} />
            </label>
            <label>
              <span className="text-xs font-medium text-stone-500">Prix annuel (F)</span>
              <input type="number" min={0} inputMode="numeric" value={prixAnnuel} onChange={(e) => setPrixAnnuel(e.target.value)} className={`${champ} tabular-nums`} />
            </label>
            <p className="col-span-2 text-[11px] text-stone-400 -mt-1">
              {prixM > 0 && prixA > 0
                ? prixA < prixM * 12
                  ? `L'annuel fait économiser ${f(prixM * 12 - prixA)} (soit ${(((prixM * 12 - prixA) / (prixM * 12)) * 100).toFixed(0)} %).`
                  : "Attention : l'annuel n'est pas moins cher que 12 mois."
                : "Les commerces déjà abonnés gardent leur échéance ; le nouveau prix s'applique à leur prochain paiement."}
            </p>
          </div>
        )}

        <label className="block">
          <span className="text-xs font-medium text-stone-500">Nombre de comptes utilisateurs (gérant compris)</span>
          <input type="number" min={1} max={500} value={maxUtilisateurs} onChange={(e) => setMaxUtilisateurs(e.target.value)} className={champ} />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-stone-500">Nombre d'activités (secteurs) cumulables</span>
          <select value={maxSecteurs} onChange={(e) => setMaxSecteurs(e.target.value)} className={champ}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "1 seule activité" : `Jusqu'à ${n} activités`}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-stone-400">
            Ex : quincaillerie + dépôt de boissons = 2 activités. Affiché automatiquement dans les forfaits et
            appliqué aussitôt aux commerces abonnés.
          </span>
        </label>

        <fieldset>
          <legend className="text-xs font-medium text-stone-500">Modules inclus</legend>
          <p className="text-[11px] text-stone-400">
            Ventes, stock, clients, factures, tontine, livraisons, clôtures et équipe sont inclus dans toutes les offres.
          </p>
          <div className="mt-2 space-y-2">
            {MODULES_OFFRE.map((m) => (
              <label key={m.id} className="flex items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-amber-500"
                  checked={modules.includes(m.id)}
                  onChange={(e) =>
                    setModules((prev) => (e.target.checked ? [...prev, m.id] : prev.filter((x) => x !== m.id)))
                  }
                />
                <span>
                  <span className="text-stone-900">{m.label}</span>
                  <span className="block text-xs text-stone-400">{m.detail}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className="text-xs font-medium text-stone-500">Avantages affichés (un par ligne)</span>
          <textarea value={avantages} onChange={(e) => setAvantages(e.target.value)} rows={5} className={champ} />
        </label>

        {!essai && (
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2.5">
              <input type="checkbox" className="h-4 w-4 accent-amber-500" checked={publique} onChange={(e) => setPublique(e.target.checked)} />
              Proposée à la vente (page d'accueil et page Offres)
            </label>
            <label className="flex items-center gap-2.5">
              <input type="checkbox" className="h-4 w-4 accent-amber-500" checked={recommandee} onChange={(e) => setRecommandee(e.target.checked)} />
              Mise en avant « Recommandée » (une seule offre)
            </label>
            <label className="flex items-center gap-2.5">
              <input type="checkbox" className="h-4 w-4 accent-amber-500" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Active
            </label>
            {!active && (
              <p className="text-[11px] text-stone-500 pl-6">
                Désactivée : plus proposée, mais les commerces qui l'ont gardent leurs droits jusqu'à leur échéance.
              </p>
            )}
          </div>
        )}

        {erreur && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erreur}</p>}

        <button
          onClick={enregistrer}
          disabled={enCours || nom.trim().length < 2 || (nouvelle && id.length < 2)}
          className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-3 rounded-xl disabled:opacity-60"
        >
          {enCours ? "Enregistrement..." : "Enregistrer l'offre"}
        </button>
      </div>
    </div>
  );
}
