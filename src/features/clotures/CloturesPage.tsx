import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, FileDown, Lock, RotateCcw, X } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { peutEcrire } from "../../lib/permissions";
import {
  cloturerPeriode,
  listerClotures,
  obtenirApercuCloture,
  obtenirEtatClotures,
  rouvrirCloture,
} from "../../services/cloturesService";
import type { ApercuCloture, Cloture, EtatClotures, TypeCloture } from "../../types";
import { SyntheseCloture } from "./SyntheseCloture";
import { AlerteSynchro, useControleSynchro } from "./ControleSynchro";
import { genererRapportCloturePDF } from "./rapportCloturePdf";
import { TITRE_TYPE, dateDepuisIso, formatEcart, formatF, isoDepuisDate, libellePeriode } from "./formatCloture";

const ONGLETS: TypeCloture[] = ["jour", "mois", "annee"];

function messageErreur(e: unknown): string {
  return (e as { message?: string })?.message || "Une erreur est survenue. Réessaie.";
}

/** Options des sélecteurs mois / année (24 derniers mois, 6 dernières années). */
function optionsPeriodes(type: "mois" | "annee", aujourdhuiIso: string): { valeur: string; label: string }[] {
  const auj = dateDepuisIso(aujourdhuiIso);
  if (type === "mois") {
    return Array.from({ length: 24 }, (_, i) => {
      const d = new Date(auj.getFullYear(), auj.getMonth() - i, 1);
      const iso = isoDepuisDate(d);
      return { valeur: iso, label: libellePeriode("mois", iso) };
    });
  }
  return Array.from({ length: 6 }, (_, i) => {
    const iso = `${auj.getFullYear() - i}-01-01`;
    return { valeur: iso, label: iso.slice(0, 4) };
  });
}

export function CloturesPage() {
  const { entreprise, utilisateur, permissions } = useAuth();
  const peutCloturer = peutEcrire(permissions, "clotures");
  const estGerant = utilisateur?.role === "gerant";

  const [onglet, setOnglet] = useState<TypeCloture>("jour");
  const [etat, setEtat] = useState<EtatClotures | null>(null);
  const [dates, setDates] = useState<Record<TypeCloture, string | null>>({ jour: null, mois: null, annee: null });
  const [apercu, setApercu] = useState<ApercuCloture | null>(null);
  const [historique, setHistorique] = useState<Cloture[]>([]);
  const [chargement, setChargement] = useState(true);
  const [chargementApercu, setChargementApercu] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [detail, setDetail] = useState<Cloture | null>(null);
  const [succes, setSucces] = useState<Cloture | null>(null);

  const dateCourante = dates[onglet];

  const chargerEtat = useCallback(async () => {
    const e = await obtenirEtatClotures();
    setEtat(e);
    setDates((prev) => ({
      jour: prev.jour ?? e.prochaine_journee ?? e.aujourdhui,
      mois: prev.mois ?? e.prochain_mois ?? `${e.aujourdhui.slice(0, 7)}-01`,
      annee: prev.annee ?? e.prochaine_annee ?? `${e.aujourdhui.slice(0, 4)}-01-01`,
    }));
    return e;
  }, []);

  useEffect(() => {
    chargerEtat()
      .catch((e) => setErreur(messageErreur(e)))
      .finally(() => setChargement(false));
  }, [chargerEtat]);

  const chargerApercu = useCallback(async () => {
    if (!dateCourante) return;
    setChargementApercu(true);
    setErreur(null);
    try {
      const [a, h] = await Promise.all([obtenirApercuCloture(onglet, dateCourante), listerClotures(onglet)]);
      setApercu(a);
      setHistorique(h);
    } catch (e) {
      setErreur(messageErreur(e));
      setApercu(null);
    } finally {
      setChargementApercu(false);
    }
  }, [onglet, dateCourante]);

  useEffect(() => {
    chargerApercu();
  }, [chargerApercu]);

  // Seule la clôture validée la plus récente d'un niveau est rouvrable.
  const idRouvrable = useMemo(
    () => historique.filter((c) => c.statut === "validee").sort((a, b) => b.date_debut.localeCompare(a.date_debut))[0]?.id,
    [historique]
  );

  async function apresCloture(id: string) {
    await Promise.all([chargerEtat(), chargerApercu()]);
    const liste = await listerClotures(onglet);
    setHistorique(liste);
    setSucces(liste.find((c) => c.id === id) ?? null);
  }

  async function apresReouverture() {
    setDetail(null);
    await chargerEtat();
    await chargerApercu();
  }

  if (chargement) return <div className="p-6 text-stone-400 text-sm">Chargement des clôtures...</div>;

  const joursEnRetard = (etat?.journees_en_attente ?? []).filter((j) => j < (etat?.aujourdhui ?? ""));

  return (
    <div className="max-w-4xl mx-auto px-4 py-5">
      <div className="mb-4">
        <h1 className="font-display text-2xl font-bold text-stone-900">Clôtures</h1>
        <p className="text-sm text-stone-500">
          Arrête tes comptes, vérifie ta caisse et fige les chiffres de chaque période.
        </p>
      </div>

      <div className="flex gap-2 mb-4" role="tablist">
        {ONGLETS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={onglet === t}
            onClick={() => {
              setOnglet(t);
              setApercu(null);
            }}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium border ${
              onglet === t ? "bg-navy text-white border-navy" : "bg-white text-stone-600 border-stone-300"
            }`}
          >
            {TITRE_TYPE[t]}
          </button>
        ))}
      </div>

      {onglet === "jour" && joursEnRetard.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle size={16} className="shrink-0" />
            {joursEnRetard.length === 1
              ? "Une journée avec des opérations n'est pas encore clôturée."
              : `${joursEnRetard.length} journées avec des opérations ne sont pas encore clôturées.`}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {joursEnRetard.slice(0, 8).map((j, i) => (
              <button
                key={j}
                onClick={() => setDates((d) => ({ ...d, jour: j }))}
                disabled={i > 0}
                title={i > 0 ? "Les journées se clôturent dans l'ordre" : undefined}
                className={`text-xs px-2.5 py-1 rounded-full border ${
                  dateCourante === j ? "bg-amber-500 border-amber-500 text-stone-900" : "bg-white border-amber-300 disabled:opacity-50"
                }`}
              >
                {libellePeriode("jour", j, true)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sélecteur de période */}
      <div className="bg-white border border-stone-200 rounded-xl p-3 mb-4 flex flex-wrap items-center gap-3 justify-between">
        <div>
          <p className="text-xs text-stone-500">{TITRE_TYPE[onglet]}</p>
          <p className="font-display text-xl font-bold text-stone-900 first-letter:uppercase">
            {dateCourante ? libellePeriode(onglet, dateCourante) : "—"}
          </p>
        </div>
        {onglet === "jour" && etat && (
          <input
            type="date"
            aria-label="Choisir la journée"
            value={dateCourante ?? ""}
            max={etat.aujourdhui}
            onChange={(e) => e.target.value && setDates((d) => ({ ...d, jour: e.target.value }))}
            className="border border-stone-300 rounded-lg py-2 px-3 text-sm bg-white"
          />
        )}
        {onglet !== "jour" && etat && (
          <select
            aria-label={onglet === "mois" ? "Choisir le mois" : "Choisir l'année"}
            value={dateCourante ?? ""}
            onChange={(e) => setDates((d) => ({ ...d, [onglet]: e.target.value }))}
            className="border border-stone-300 rounded-lg py-2 px-3 text-sm bg-white"
          >
            {optionsPeriodes(onglet, etat.aujourdhui).map((o) => (
              <option key={o.valeur} value={o.valeur}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {erreur && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{erreur}</p>
      )}

      {chargementApercu && !apercu && <p className="text-sm text-stone-400 mb-4">Calcul en cours...</p>}

      {apercu && dateCourante && (
        <div className={chargementApercu ? "opacity-60 pointer-events-none transition-opacity" : ""}>
          {apercu.cloture ? (
            <BandeauCloture cloture={apercu.cloture} onVoir={() => setDetail(apercu.cloture)} />
          ) : (
            <>
              {onglet === "jour" ? (
                <CaisseDuJour
                  key={dateCourante}
                  apercu={apercu}
                  date={dateCourante}
                  aujourdhui={etat?.aujourdhui ?? ""}
                  peutCloturer={peutCloturer}
                  onCloturee={apresCloture}
                />
              ) : (
                <ClotureMoisAnnee
                  type={onglet}
                  apercu={apercu}
                  date={dateCourante}
                  peutCloturer={peutCloturer}
                  onCloturee={apresCloture}
                />
              )}
            </>
          )}
          <div className="mt-4">
            <SyntheseCloture synthese={apercu.synthese} type={onglet} />
          </div>
        </div>
      )}

      <Historique clotures={historique} type={onglet} onOuvrir={setDetail} />

      {detail && entreprise && (
        <ModaleDetail
          cloture={detail}
          peutRouvrir={estGerant && detail.statut === "validee" && detail.id === idRouvrable}
          onFerme={() => setDetail(null)}
          onPdf={() => genererRapportCloturePDF(detail, entreprise)}
          onRouverte={apresReouverture}
        />
      )}

      {succes && entreprise && (
        <ModaleSucces
          cloture={succes}
          onPdf={() => genererRapportCloturePDF(succes, entreprise)}
          onFerme={() => setSucces(null)}
        />
      )}
    </div>
  );
}

// =====================================================================
// CLÔTURE DE LA JOURNÉE : comptage de caisse
// =====================================================================

function CaisseDuJour({
  apercu,
  date,
  aujourdhui,
  peutCloturer,
  onCloturee,
}: {
  apercu: ApercuCloture;
  date: string;
  aujourdhui: string;
  peutCloturer: boolean;
  onCloturee: (id: string) => Promise<void>;
}) {
  const s = apercu.synthese;
  const premiere = !!s.premiere_cloture;
  const [fondOuverture, setFondOuverture] = useState("");
  const [comptees, setComptees] = useState("");
  const [fondConserve, setFondConserve] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [confirmation, setConfirmation] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const { entreprise } = useAuth();
  const controle = useControleSynchro(entreprise?.id, date);

  const fond = premiere ? Number(fondOuverture) || 0 : Number(s.fond_ouverture) || 0;
  const attendu = fond + s.tresorerie.especes.flux;
  const saisi = comptees.trim() !== "";
  const compteesN = Number(comptees) || 0;
  const ecart = saisi ? compteesN - attendu : null;
  const fondConserveN = fondConserve.trim() === "" ? compteesN : Number(fondConserve) || 0;
  const retire = compteesN - fondConserveN;
  const ecartArrondi = ecart === null ? null : Math.round(ecart);

  function valider(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (!saisi || compteesN < 0) return setErreur("Saisis le montant des espèces comptées en caisse.");
    if (fondConserveN < 0 || fondConserveN > compteesN)
      return setErreur("Le fond conservé doit être compris entre 0 et les espèces comptées.");
    if (ecartArrondi !== 0 && !commentaire.trim())
      return setErreur("Explique l'écart de caisse en commentaire avant de clôturer.");
    setConfirmation(true);
  }

  async function confirmer() {
    setEnCours(true);
    setErreur(null);
    try {
      const id = await cloturerPeriode({
        type: "jour",
        date,
        especesComptees: compteesN,
        fondConserve: fondConserveN,
        fondOuverture: premiere ? fond : undefined,
        commentaire,
      });
      setConfirmation(false);
      await onCloturee(id);
    } catch (e) {
      setErreur(messageErreur(e));
      setConfirmation(false);
    } finally {
      setEnCours(false);
    }
  }

  const couleurEcart =
    ecartArrondi === null ? "text-stone-300" : ecartArrondi === 0 ? "text-emerald-700" : ecartArrondi > 0 ? "text-amber-700" : "text-red-600";

  return (
    <form onSubmit={valider} className="bg-white border-2 border-navy rounded-2xl overflow-hidden">
      <div className="bg-navy text-stone-50 px-4 py-3 flex items-center justify-between">
        <p className="font-display text-lg font-bold">Caisse espèces</p>
        <p className="text-xs text-stone-400">Mobile Money attendu : {formatEcart(s.tresorerie.mobile_money.flux)}</p>
      </div>

      <div className="grid md:grid-cols-2">
        {/* Ce que l'app a calculé */}
        <div className="p-4 md:border-r border-stone-100 space-y-1.5 text-sm">
          {premiere ? (
            <label className="flex items-center justify-between gap-3">
              <span className="text-stone-600">Fond de caisse ce matin</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={fondOuverture}
                onChange={(e) => setFondOuverture(e.target.value)}
                disabled={!peutCloturer}
                placeholder="0"
                className="w-32 border border-stone-300 rounded-lg py-1.5 px-2.5 text-right tabular-nums"
              />
            </label>
          ) : (
            <div className="flex justify-between text-stone-600">
              <span>Fond de caisse à l'ouverture</span>
              <span className="tabular-nums text-stone-800">{formatF(fond)}</span>
            </div>
          )}
          <div className="flex justify-between text-stone-600">
            <span>+ Entrées en espèces</span>
            <span className="tabular-nums text-stone-800">{formatF(s.tresorerie.especes.entrees)}</span>
          </div>
          <div className="flex justify-between text-stone-600">
            <span>− Sorties en espèces</span>
            <span className="tabular-nums text-stone-800">{formatF(s.tresorerie.especes.sorties)}</span>
          </div>
          <div className="flex justify-between items-baseline pt-2 mt-1 border-t border-stone-200">
            <span className="font-medium text-stone-900">Doit être en caisse</span>
            <span className="font-display text-2xl font-bold tabular-nums text-stone-900">{formatF(attendu)}</span>
          </div>
          {premiere && (
            <p className="text-xs text-stone-400 pt-1">
              Première clôture : indique l'argent qui était dans la caisse avant la première vente. Les jours suivants,
              ce montant sera repris automatiquement.
            </p>
          )}
        </div>

        {/* Ce que le gérant a compté */}
        <div className="p-4 bg-stone-50 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-stone-500">Espèces comptées dans la caisse</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              required
              value={comptees}
              onChange={(e) => setComptees(e.target.value)}
              disabled={!peutCloturer}
              className="w-full mt-1 border border-stone-300 rounded-lg py-2.5 px-3 text-lg tabular-nums bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="Montant compté"
            />
          </label>

          <div className="flex items-baseline justify-between" aria-live="polite">
            <span className="text-sm text-stone-600">Écart</span>
            <span className={`font-display text-3xl font-bold tabular-nums ${couleurEcart}`}>
              {ecart === null ? "—" : formatEcart(ecart)}
            </span>
          </div>
          {ecartArrondi !== null && ecartArrondi !== 0 && (
            <p className="text-xs text-stone-500 -mt-2 text-right">
              {ecartArrondi > 0 ? "Il y a plus d'argent que prévu." : "Il manque de l'argent dans la caisse."}
            </p>
          )}

          <label className="block">
            <span className="text-xs font-medium text-stone-500">Fond laissé en caisse pour demain</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={fondConserve}
              onChange={(e) => setFondConserve(e.target.value)}
              disabled={!peutCloturer}
              className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm tabular-nums bg-white"
              placeholder={saisi ? `Tout (${formatF(compteesN)})` : "Montant"}
            />
            {saisi && (
              <span className="text-xs text-stone-500 mt-1 block">
                À retirer ou verser à la banque : <strong className="text-stone-800">{formatF(retire)}</strong>
              </span>
            )}
          </label>

          <label className="block">
            <span className="text-xs font-medium text-stone-500">
              Commentaire {ecartArrondi !== null && ecartArrondi !== 0 ? "(obligatoire : explique l'écart)" : "(facultatif)"}
            </span>
            <textarea
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              maxLength={1000}
              rows={2}
              disabled={!peutCloturer}
              className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm bg-white"
            />
          </label>
        </div>
      </div>

      <div className="px-4 py-3 border-t border-stone-100 space-y-2">
        <AlerteSynchro enAttenteIci={controle.enAttenteIci} autres={controle.autres} />
        {apercu.raison_non_cloturable && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {apercu.raison_non_cloturable}
          </p>
        )}
        {erreur && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erreur}</p>}
        {peutCloturer ? (
          <button
            type="submit"
            disabled={!!apercu.raison_non_cloturable || enCours || controle.bloquant}
            className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-3 rounded-xl disabled:opacity-50"
          >
            <Lock size={16} /> Clôturer la journée
          </button>
        ) : (
          <p className="text-sm text-stone-500 text-center">Seul le gérant peut clôturer la journée.</p>
        )}
      </div>

      {confirmation && (
        <ModaleConfirmation
          titre={`Clôturer le ${libellePeriode("jour", date)} ?`}
          enCours={enCours}
          onAnnuler={() => setConfirmation(false)}
          onConfirmer={confirmer}
        >
          <ul className="text-sm text-stone-600 space-y-1.5">
            <li className="flex justify-between"><span>Espèces comptées</span><strong className="tabular-nums">{formatF(compteesN)}</strong></li>
            <li className="flex justify-between"><span>Écart</span><strong className={`tabular-nums ${couleurEcart}`}>{formatEcart(ecart)}</strong></li>
            <li className="flex justify-between"><span>Fond pour demain</span><strong className="tabular-nums">{formatF(fondConserveN)}</strong></li>
          </ul>
          <p className="text-sm text-stone-600 mt-3">
            Après la clôture, plus aucune vente, dépense, cotisation ou encaissement ne pourra être ajouté ou modifié
            sur cette journée.
            {date === aujourdhui &&
              " Comme c'est aujourd'hui, les nouvelles opérations seront refusées jusqu'à demain ; les ventes faites hors ligne seront enregistrées demain."}
          </p>
        </ModaleConfirmation>
      )}
    </form>
  );
}

// =====================================================================
// CLÔTURE DU MOIS / DE L'ANNÉE
// =====================================================================

function ClotureMoisAnnee({
  type,
  apercu,
  date,
  peutCloturer,
  onCloturee,
}: {
  type: TypeCloture;
  apercu: ApercuCloture;
  date: string;
  peutCloturer: boolean;
  onCloturee: (id: string) => Promise<void>;
}) {
  const [commentaire, setCommentaire] = useState("");
  const [confirmation, setConfirmation] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const libelle = type === "mois" ? `le mois de ${libellePeriode("mois", date).toLowerCase()}` : `l'année ${date.slice(0, 4)}`;

  async function confirmer() {
    setEnCours(true);
    setErreur(null);
    try {
      const id = await cloturerPeriode({ type, date, commentaire });
      setConfirmation(false);
      await onCloturee(id);
    } catch (e) {
      setErreur(messageErreur(e));
      setConfirmation(false);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="bg-white border-2 border-navy rounded-2xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="flex items-center justify-center w-9 h-9 rounded-full bg-stone-100 shrink-0">
          <Lock size={16} className="text-stone-500" />
        </span>
        <div>
          <p className="font-medium text-stone-900">Clôturer {libelle}</p>
          <p className="text-sm text-stone-500">
            Les chiffres ci-dessous seront figés dans un rapport, avec l'état de tes créances, de l'épargne tontine et
            de ton stock à ce jour.
          </p>
        </div>
      </div>
      {apercu.raison_non_cloturable && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {apercu.raison_non_cloturable}
        </p>
      )}
      {erreur && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erreur}</p>}
      {peutCloturer ? (
        <>
          <textarea
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="Commentaire (facultatif)"
            aria-label="Commentaire"
            className="w-full border border-stone-300 rounded-lg py-2 px-3 text-sm"
          />
          <button
            onClick={() => setConfirmation(true)}
            disabled={!!apercu.raison_non_cloturable || enCours}
            className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-3 rounded-xl disabled:opacity-50"
          >
            <Lock size={16} /> Clôturer {type === "mois" ? "le mois" : "l'année"}
          </button>
        </>
      ) : (
        <p className="text-sm text-stone-500 text-center">Seul le gérant peut clôturer cette période.</p>
      )}

      {confirmation && (
        <ModaleConfirmation
          titre={`Clôturer ${libelle} ?`}
          enCours={enCours}
          onAnnuler={() => setConfirmation(false)}
          onConfirmer={confirmer}
        >
          <p className="text-sm text-stone-600">
            Résultat estimé : <strong className="tabular-nums">{formatF(apercu.synthese.resultat.resultat_estime)}</strong>.
            {type === "mois"
              ? " Une fois le mois clôturé, ses journées ne pourront plus être rouvertes."
              : " Une fois l'année clôturée, ses mois ne pourront plus être rouverts."}
          </p>
        </ModaleConfirmation>
      )}
    </div>
  );
}

// =====================================================================
// AFFICHAGES ANNEXES
// =====================================================================

function BandeauCloture({ cloture, onVoir }: { cloture: Cloture; onVoir: () => void }) {
  return (
    <button
      onClick={onVoir}
      className="w-full text-left bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3"
    >
      <CheckCircle2 size={22} className="text-emerald-600 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-emerald-900">Période clôturée</p>
        <p className="text-sm text-emerald-800">
          Le {new Date(cloture.cloture_le).toLocaleDateString("fr-FR")}
          {cloture.type_cloture === "jour" && ` · écart de caisse ${formatEcart(cloture.ecart_especes)}`}
          {cloture.type_cloture !== "jour" && ` · résultat estimé ${formatF(cloture.resultat_estime)}`}
        </p>
      </div>
      <ChevronRight size={18} className="text-emerald-700" />
    </button>
  );
}

function Historique({
  clotures,
  type,
  onOuvrir,
}: {
  clotures: Cloture[];
  type: TypeCloture;
  onOuvrir: (c: Cloture) => void;
}) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-xl font-bold text-stone-900 mb-2">Historique</h2>
      <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
        {clotures.map((c) => (
          <button key={c.id} onClick={() => onOuvrir(c)} className="w-full text-left px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium first-letter:uppercase ${c.statut === "annulee" ? "text-stone-400 line-through" : "text-stone-900"}`}>
                {libellePeriode(type, c.date_debut, true)}
              </p>
              <p className="text-xs text-stone-400">
                CA net {formatF(c.chiffre_affaires_net)}
                {c.statut === "annulee" && " · rouverte"}
              </p>
            </div>
            <span
              className={`text-sm font-semibold tabular-nums ${
                type === "jour"
                  ? Math.round(Number(c.ecart_especes)) === 0
                    ? "text-emerald-700"
                    : "text-red-600"
                  : Number(c.resultat_estime) >= 0
                    ? "text-stone-900"
                    : "text-red-600"
              }`}
            >
              {type === "jour" ? formatEcart(c.ecart_especes) : formatF(c.resultat_estime)}
            </span>
            <ChevronRight size={16} className="text-stone-300" />
          </button>
        ))}
        {clotures.length === 0 && (
          <p className="p-5 text-center text-sm text-stone-400">
            Aucune clôture pour l'instant. Les rapports apparaîtront ici.
          </p>
        )}
      </div>
    </section>
  );
}

function ModaleConfirmation({
  titre,
  children,
  enCours,
  onAnnuler,
  onConfirmer,
}: {
  titre: string;
  children: ReactNode;
  enCours: boolean;
  onAnnuler: () => void;
  onConfirmer: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-navy/40" onClick={enCours ? undefined : onAnnuler} />
      <div className="relative bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
        <h2 className="font-display text-xl font-bold text-stone-900 first-letter:uppercase">{titre}</h2>
        {children}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onAnnuler}
            disabled={enCours}
            className="flex-1 border border-stone-300 text-stone-700 font-medium py-2.5 rounded-xl"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirmer}
            disabled={enCours}
            className="flex-1 bg-navy text-white font-semibold py-2.5 rounded-xl disabled:opacity-60"
          >
            {enCours ? "Clôture..." : "Clôturer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModaleSucces({ cloture, onPdf, onFerme }: { cloture: Cloture; onPdf: () => void; onFerme: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-navy/40" onClick={onFerme} />
      <div className="relative bg-white rounded-2xl w-full max-w-sm p-5 text-center space-y-3">
        <CheckCircle2 size={36} className="mx-auto text-emerald-600" />
        <h2 className="font-display text-xl font-bold text-stone-900">
          {TITRE_TYPE[cloture.type_cloture]} clôturé{cloture.type_cloture === "jour" ? "e" : ""}
        </h2>
        <p className="text-sm text-stone-600 first-letter:uppercase">{libellePeriode(cloture.type_cloture, cloture.date_debut)}</p>
        <button
          onClick={onPdf}
          className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-3 rounded-xl"
        >
          <FileDown size={16} /> Télécharger le rapport PDF
        </button>
        <button onClick={onFerme} className="text-sm text-stone-500">
          Fermer
        </button>
      </div>
    </div>
  );
}

function ModaleDetail({
  cloture,
  peutRouvrir,
  onFerme,
  onPdf,
  onRouverte,
}: {
  cloture: Cloture;
  peutRouvrir: boolean;
  onFerme: () => void;
  onPdf: () => void;
  onRouverte: () => Promise<void>;
}) {
  const [modeReouverture, setModeReouverture] = useState(false);
  const [motif, setMotif] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function rouvrir() {
    if (motif.trim().length < 5) return setErreur("Indique le motif de la réouverture (5 caractères minimum).");
    setEnCours(true);
    setErreur(null);
    try {
      await rouvrirCloture(cloture.id, motif);
      await onRouverte();
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:px-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-navy/40" onClick={onFerme} />
      <div className="relative bg-stone-50 w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl">
        <div className="sticky top-0 z-10 bg-white border-b border-stone-200 px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-stone-500">Clôture · {TITRE_TYPE[cloture.type_cloture]}</p>
            <h2 className="font-display text-xl font-bold text-stone-900 truncate first-letter:uppercase">
              {libellePeriode(cloture.type_cloture, cloture.date_debut)}
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onPdf}
              className="flex items-center gap-1.5 border border-stone-300 bg-white text-stone-700 text-sm font-medium px-3 py-2 rounded-lg"
            >
              <FileDown size={15} /> PDF
            </button>
            <button onClick={onFerme} className="p-2 text-stone-400" aria-label="Fermer">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-stone-500">
            Clôturée le {new Date(cloture.cloture_le).toLocaleString("fr-FR")}
            {cloture.auteur?.nom && ` par ${cloture.auteur.nom}`}
          </p>

          {cloture.statut === "annulee" && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              Rouverte le {cloture.annulee_le ? new Date(cloture.annulee_le).toLocaleDateString("fr-FR") : "—"} :{" "}
              {cloture.motif_annulation}
            </p>
          )}

          {cloture.type_cloture === "jour" && (
            <section className="bg-white border border-stone-200 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              {[
                ["Attendu en caisse", formatF(cloture.especes_theoriques)],
                ["Compté", formatF(cloture.especes_comptees)],
                ["Écart", formatEcart(cloture.ecart_especes)],
                ["Fond pour le lendemain", formatF(cloture.fond_conserve)],
              ].map(([l, v]) => (
                <div key={l}>
                  <p className="text-xs text-stone-500">{l}</p>
                  <p
                    className={`font-semibold tabular-nums ${
                      l === "Écart" && Math.round(Number(cloture.ecart_especes)) !== 0 ? "text-red-600" : "text-stone-900"
                    }`}
                  >
                    {v}
                  </p>
                </div>
              ))}
            </section>
          )}

          {cloture.commentaire && (
            <p className="text-sm text-stone-700 bg-white border border-stone-200 rounded-xl p-3 whitespace-pre-line">
              {cloture.commentaire}
            </p>
          )}

          <SyntheseCloture synthese={cloture.donnees} type={cloture.type_cloture} />

          {peutRouvrir && (
            <section className="bg-white border border-stone-200 rounded-xl p-4">
              {!modeReouverture ? (
                <button
                  onClick={() => setModeReouverture(true)}
                  className="flex items-center gap-2 text-sm font-medium text-red-600"
                >
                  <RotateCcw size={15} /> Rouvrir cette période
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-stone-600">
                    La réouverture permet de corriger une erreur. Elle est enregistrée dans le journal d'audit avec son
                    motif, et la période devra être clôturée de nouveau.
                  </p>
                  <textarea
                    value={motif}
                    onChange={(e) => setMotif(e.target.value)}
                    maxLength={500}
                    rows={2}
                    placeholder="Motif de la réouverture"
                    aria-label="Motif de la réouverture"
                    className="w-full border border-stone-300 rounded-lg py-2 px-3 text-sm"
                  />
                  {erreur && <p className="text-sm text-red-600">{erreur}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setModeReouverture(false)}
                      disabled={enCours}
                      className="flex-1 border border-stone-300 text-stone-700 text-sm font-medium py-2 rounded-lg"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={rouvrir}
                      disabled={enCours}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2 rounded-lg disabled:opacity-60"
                    >
                      {enCours ? "Réouverture..." : "Rouvrir"}
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
