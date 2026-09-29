import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, X, PiggyBank, ScrollText } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { peutEcrire } from "../../lib/permissions";
import { listerClients, creerClient } from "../../services/clientsService";
import { listerTontines, creerTontine, obtenirConditionsTontine } from "../../services/tontineService";
import { CaseAcceptation } from "../auth/CaseAcceptationCgu";
import { LABELS_STATUT_TONTINE } from "../../types";
import type { Client, ConditionsTontine, Tontine } from "../../types";

function formatFCFA(montant: number): string {
  return Math.round(montant).toLocaleString("fr-FR") + " F";
}

export function TontinesPage() {
  const navigate = useNavigate();
  const { entreprise, utilisateur, permissions } = useAuth();
  const peutGerer = peutEcrire(permissions, "tontines");
  const [tontines, setTontines] = useState<Tontine[]>([]);
  const [chargement, setChargement] = useState(true);
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [filtre, setFiltre] = useState<"actives" | "toutes">("actives");

  useEffect(() => {
    listerTontines()
      .then(setTontines)
      .finally(() => setChargement(false));
  }, []);

  const tontinesAffichees = tontines.filter((t) =>
    filtre === "toutes" ? true : t.statut !== "cloturee"
  );

  if (chargement) return <div className="p-6 text-stone-400 text-sm">Chargement des tontines...</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-5">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl font-bold text-stone-900">Tontines clients</h1>
        <div className="flex items-center gap-2">
          <Link
            to="/tontines/conditions"
            className="flex items-center gap-1.5 border border-stone-300 bg-white text-stone-700 text-sm font-medium px-3 py-2 rounded-lg"
          >
            <ScrollText size={16} />
            <span className="hidden sm:inline">{utilisateur?.role === "gerant" ? "Mes conditions" : "Conditions"}</span>
          </Link>
          {peutGerer && (
            <button
              onClick={() => setModaleOuverte(true)}
              className="flex items-center gap-1.5 bg-navy text-white text-sm font-medium px-3.5 py-2 rounded-lg"
            >
              <Plus size={16} /> Nouvelle tontine
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {(["actives", "toutes"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltre(f)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border ${
              filtre === f ? "bg-navy text-white border-navy" : "bg-white text-stone-600 border-stone-300"
            }`}
          >
            {f === "actives" ? "En cours / Atteintes" : "Toutes"}
          </button>
        ))}
      </div>

      <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
        {tontinesAffichees.map((t) => {
          const style = LABELS_STATUT_TONTINE[t.statut];
          const progression = Math.min(100, Math.round((t.montant_cumule / t.plafond) * 100));
          return (
            <button
              key={t.id}
              onClick={() => navigate(`/tontines/${t.id}`)}
              className="w-full text-left p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex items-center justify-center w-9 h-9 rounded-full bg-stone-100 shrink-0">
                    <PiggyBank size={16} className="text-stone-400" />
                  </span>
                  <p className="text-sm font-medium text-stone-900 truncate">{t.client?.nom}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded shrink-0 ${style.bg} ${style.texte}`}>
                  {style.label}
                </span>
              </div>
              <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${t.statut === "en_cours" ? "bg-amber-400" : "bg-emerald-500"}`}
                  style={{ width: `${progression}%` }}
                />
              </div>
              <p className="text-xs text-stone-400 mt-1.5">
                {formatFCFA(t.montant_cumule)} / {formatFCFA(t.plafond)} ({progression}%)
              </p>
            </button>
          );
        })}
        {tontinesAffichees.length === 0 && (
          <p className="p-6 text-center text-stone-400 text-sm">Aucune tontine pour l'instant.</p>
        )}
      </div>

      {modaleOuverte && entreprise && (
        <ModaleNouvelleTontine
          entrepriseId={entreprise.id}
          utilisateurId={utilisateur?.id || null}
          estGerant={utilisateur?.role === "gerant"}
          onFerme={() => setModaleOuverte(false)}
          onCreee={(t) => setTontines((prev) => [t, ...prev])}
        />
      )}
    </div>
  );
}

function ModaleNouvelleTontine({
  entrepriseId,
  utilisateurId,
  estGerant,
  onFerme,
  onCreee,
}: {
  entrepriseId: string;
  utilisateurId: string | null;
  estGerant: boolean;
  onFerme: () => void;
  onCreee: (t: Tontine) => void;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [nouveauClientNom, setNouveauClientNom] = useState("");
  const [nouveauClientTelephone, setNouveauClientTelephone] = useState("");
  const [plafond, setPlafond] = useState("");
  const [conditions, setConditions] = useState<ConditionsTontine | null>(null);
  const [chargementConditions, setChargementConditions] = useState(true);
  const [conditionsAcceptees, setConditionsAcceptees] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    listerClients().then(setClients);
    obtenirConditionsTontine()
      .then(setConditions)
      .catch(() => setConditions(null))
      .finally(() => setChargementConditions(false));
  }, []);

  async function gererSoumission(e: FormEvent) {
    e.preventDefault();
    if (!clientId && !nouveauClientNom.trim()) {
      setErreur("Sélectionne un client existant ou saisis le nom d'un nouveau client.");
      return;
    }
    const montantPlafond = Number(plafond);
    if (!Number.isFinite(montantPlafond) || montantPlafond <= 0) {
      setErreur("Le plafond doit être un montant positif.");
      return;
    }
    if (!conditions) {
      setErreur("Les conditions de la tontine doivent d'abord être définies par le gérant.");
      return;
    }
    if (!conditionsAcceptees) {
      setErreur("Le client doit accepter les conditions générales de la tontine.");
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      let clientFinal = clientId;
      if (nouveauClientNom.trim()) {
        const nouveauClient = await creerClient(
          {
            nom: nouveauClientNom.trim(),
            telephone: nouveauClientTelephone.trim() || null,
            adresse: null,
            ifu: null,
            type_client: "detail",
          },
          entrepriseId
        );
        clientFinal = nouveauClient.id;
      }
      const tontine = await creerTontine(entrepriseId, clientFinal, montantPlafond, utilisateurId, conditionsAcceptees);
      onCreee(tontine);
      onFerme();
    } catch (e: any) {
      setErreur(e.message || "Erreur lors de la création de la tontine.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-navy/40" onClick={onFerme} />
      <form onSubmit={gererSoumission} className="relative bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-stone-900">Nouvelle tontine</h2>
          <button type="button" onClick={onFerme} className="text-stone-400">
            <X size={20} />
          </button>
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500">Client</label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            disabled={!!nouveauClientNom.trim()}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm bg-white disabled:bg-stone-100 disabled:text-stone-400"
          >
            <option value="">Choisir un client...</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>

          <p className="text-xs font-medium text-stone-500 mt-2.5">
            Ou nouveau client (créé automatiquement)
          </p>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <input
              value={nouveauClientNom}
              onChange={(e) => {
                setNouveauClientNom(e.target.value);
                if (e.target.value.trim()) setClientId("");
              }}
              disabled={!!clientId}
              placeholder="Nom"
              className="border border-stone-300 rounded-lg py-2 px-3 text-sm disabled:bg-stone-100 disabled:text-stone-400"
            />
            <input
              value={nouveauClientTelephone}
              onChange={(e) => setNouveauClientTelephone(e.target.value)}
              disabled={!!clientId}
              placeholder="Téléphone"
              className="border border-stone-300 rounded-lg py-2 px-3 text-sm disabled:bg-stone-100 disabled:text-stone-400"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500">Plafond visé (F)</label>
          <input
            type="number"
            required
            min={1}
            inputMode="numeric"
            value={plafond}
            onChange={(e) => setPlafond(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
            placeholder="Montant que le client souhaite atteindre"
          />
        </div>
        {chargementConditions ? (
          <p className="text-xs text-stone-400">Chargement des conditions...</p>
        ) : conditions ? (
          <div className="bg-stone-50 border border-stone-200 rounded-lg p-3">
            <CaseAcceptation
              id="accepter-conditions-tontine"
              cochee={conditionsAcceptees}
              onChange={setConditionsAcceptees}
              avantLien="Le client a pris connaissance et accepte les"
              texteLien="Conditions générales de la tontine"
              lienVers="/tontines/conditions"
            />
            <p className="text-[11px] text-stone-400 mt-1.5 pl-[26px]">
              Version {conditions.version} — elle sera enregistrée avec la tontine.
            </p>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            Aucune condition de tontine n'est encore définie.{" "}
            {estGerant ? (
              <Link to="/tontines/conditions" className="font-medium underline underline-offset-2">
                Rédiger mes conditions
              </Link>
            ) : (
              "Demande au gérant de les rédiger."
            )}
          </div>
        )}

        {erreur && <p className="text-sm text-red-600">{erreur}</p>}
        <button
          type="submit"
          disabled={enCours || !conditions}
          className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-2.5 rounded-xl disabled:opacity-60"
        >
          {enCours ? "Création..." : "Créer la tontine"}
        </button>
      </form>
    </div>
  );
}
