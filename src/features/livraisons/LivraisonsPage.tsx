import { useEffect, useState, type FormEvent } from "react";
import { Plus, X, Truck, MapPin, Phone } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { listerClients } from "../../services/clientsService";
import { listerLivraisons, creerLivraison, changerStatutLivraison } from "../../services/livraisonsService";
import type { Client, Livraison, StatutLivraison } from "../../types";

const LABELS_STATUT: Record<StatutLivraison, { label: string; style: string }> = {
  en_attente: { label: "En attente", style: "bg-stone-100 text-stone-500" },
  en_cours: { label: "En cours", style: "bg-amber-50 text-amber-700" },
  livree: { label: "Livrée", style: "bg-emerald-50 text-emerald-600" },
  annulee: { label: "Annulée", style: "bg-red-50 text-red-600" },
};

const PROCHAIN_STATUT: Partial<Record<StatutLivraison, StatutLivraison>> = {
  en_attente: "en_cours",
  en_cours: "livree",
};

const LABEL_ACTION: Partial<Record<StatutLivraison, string>> = {
  en_attente: "Démarrer",
  en_cours: "Marquer livrée",
};

export function LivraisonsPage() {
  const { entreprise, utilisateur } = useAuth();
  const [livraisons, setLivraisons] = useState<Livraison[]>([]);
  const [chargement, setChargement] = useState(true);
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [filtre, setFiltre] = useState<"actives" | "toutes">("actives");

  useEffect(() => {
    listerLivraisons()
      .then(setLivraisons)
      .finally(() => setChargement(false));
  }, []);

  async function gererChangementStatut(livraison: Livraison, statut: StatutLivraison) {
    setLivraisons((prev) => prev.map((l) => (l.id === livraison.id ? { ...l, statut } : l)));
    try {
      await changerStatutLivraison(livraison.id, statut);
    } catch {
      // En cas d'échec, on resynchronise la liste plutôt que de laisser un état incohérent.
      setLivraisons(await listerLivraisons());
    }
  }

  const livraisonsAffichees = livraisons.filter((l) =>
    filtre === "toutes" ? true : l.statut === "en_attente" || l.statut === "en_cours"
  );

  if (chargement) {
    return <div className="p-6 text-stone-400 text-sm">Chargement des livraisons...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-5">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl font-bold text-stone-900">Livraisons</h1>
        <button
          onClick={() => setModaleOuverte(true)}
          className="flex items-center gap-1.5 bg-stone-900 text-white text-sm font-medium px-3.5 py-2 rounded-lg"
        >
          <Plus size={16} /> Nouvelle livraison
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        {(["actives", "toutes"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltre(f)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border ${
              filtre === f ? "bg-stone-900 text-white border-stone-900" : "bg-white text-stone-600 border-stone-300"
            }`}
          >
            {f === "actives" ? "En cours" : "Toutes"}
          </button>
        ))}
      </div>

      <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
        {livraisonsAffichees.map((liv) => {
          const statut = LABELS_STATUT[liv.statut];
          const prochain = PROCHAIN_STATUT[liv.statut];
          return (
            <div key={liv.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="flex items-center justify-center w-9 h-9 rounded-full bg-stone-100 shrink-0 mt-0.5">
                    <Truck size={16} className="text-stone-400" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-900 truncate">
                      {liv.client?.nom || "Client comptant"}
                    </p>
                    {liv.adresse_livraison && (
                      <p className="text-xs text-stone-400 flex items-center gap-1 mt-0.5">
                        <MapPin size={11} /> {liv.adresse_livraison}
                      </p>
                    )}
                    {liv.livreur_nom && (
                      <p className="text-xs text-stone-400 flex items-center gap-1 mt-0.5">
                        <Phone size={11} /> {liv.livreur_nom}
                        {liv.livreur_telephone ? ` · ${liv.livreur_telephone}` : ""}
                      </p>
                    )}
                  </div>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded shrink-0 ${statut.style}`}>
                  {statut.label}
                </span>
              </div>
              {prochain && (
                <div className="flex justify-end mt-2">
                  <button
                    onClick={() => gererChangementStatut(liv, prochain)}
                    className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-lg"
                  >
                    {LABEL_ACTION[liv.statut]} →
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {livraisonsAffichees.length === 0 && (
          <p className="p-6 text-center text-stone-400 text-sm">Aucune livraison pour l'instant.</p>
        )}
      </div>

      {modaleOuverte && entreprise && (
        <ModaleNouvelleLivraison
          entrepriseId={entreprise.id}
          utilisateurId={utilisateur?.id || null}
          onFerme={() => setModaleOuverte(false)}
          onCreee={(liv) => setLivraisons((prev) => [liv, ...prev])}
        />
      )}
    </div>
  );
}

function ModaleNouvelleLivraison({
  entrepriseId,
  utilisateurId,
  onFerme,
  onCreee,
}: {
  entrepriseId: string;
  utilisateurId: string | null;
  onFerme: () => void;
  onCreee: (l: Livraison) => void;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [adresse, setAdresse] = useState("");
  const [datePrevue, setDatePrevue] = useState("");
  const [livreurNom, setLivreurNom] = useState("");
  const [livreurTelephone, setLivreurTelephone] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    listerClients().then(setClients);
  }, []);

  async function gererSoumission(e: FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    try {
      const livraison = await creerLivraison(
        {
          vente_id: null,
          client_id: clientId || null,
          adresse_livraison: adresse || null,
          date_prevue: datePrevue ? new Date(datePrevue).toISOString() : null,
          livreur_nom: livreurNom || null,
          livreur_telephone: livreurTelephone || null,
          notes: null,
        },
        entrepriseId,
        utilisateurId
      );
      onCreee(livraison);
      onFerme();
    } catch (e: any) {
      setErreur(e.message || "Erreur lors de la création de la livraison.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-stone-900/40" onClick={onFerme} />
      <form onSubmit={gererSoumission} className="relative bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-stone-900">Nouvelle livraison</h2>
          <button type="button" onClick={onFerme} className="text-stone-400">
            <X size={20} />
          </button>
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500">Client</label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm bg-white"
          >
            <option value="">Client comptant</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500">Adresse de livraison</label>
          <input
            value={adresse}
            onChange={(e) => setAdresse(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
            placeholder="Chantier, quartier, dépôt du client..."
          />
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500">Date prévue</label>
          <input
            type="datetime-local"
            value={datePrevue}
            onChange={(e) => setDatePrevue(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-stone-500">Livreur</label>
            <input
              value={livreurNom}
              onChange={(e) => setLivreurNom(e.target.value)}
              className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-stone-500">Téléphone livreur</label>
            <input
              value={livreurTelephone}
              onChange={(e) => setLivreurTelephone(e.target.value)}
              className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
            />
          </div>
        </div>
        {erreur && <p className="text-sm text-red-600">{erreur}</p>}
        <button
          type="submit"
          disabled={enCours}
          className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-2.5 rounded-xl disabled:opacity-60"
        >
          {enCours ? "Création..." : "Créer la livraison"}
        </button>
      </form>
    </div>
  );
}
