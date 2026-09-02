import { useEffect, useState, type FormEvent } from "react";
import { Plus, X, User } from "lucide-react";
import { listerClients, creerClient, enregistrerPaiementClient } from "../../services/clientsService";
import { useAuth } from "../../hooks/useAuth";
import type { Client } from "../../types";

function formatFCFA(montant: number): string {
  return Math.round(montant).toLocaleString("fr-FR") + " F";
}

export function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [chargement, setChargement] = useState(true);
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [clientPaiement, setClientPaiement] = useState<Client | null>(null);

  useEffect(() => {
    listerClients()
      .then(setClients)
      .finally(() => setChargement(false));
  }, []);

  if (chargement) {
    return <div className="p-6 text-stone-400 text-sm">Chargement des clients...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-5">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl font-bold text-stone-900">Clients</h1>
        <button
          onClick={() => setModaleOuverte(true)}
          className="flex items-center gap-1.5 bg-stone-900 text-white text-sm font-medium px-3.5 py-2 rounded-lg"
        >
          <Plus size={16} /> Nouveau client
        </button>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
        {clients.map((client) => (
          <div key={client.id} className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex items-center justify-center w-9 h-9 rounded-full bg-stone-100 shrink-0">
                <User size={16} className="text-stone-400" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-stone-900 truncate">{client.nom}</p>
                <p className="text-xs text-stone-400">{client.telephone || "Pas de téléphone"}</p>
              </div>
            </div>
            {client.solde_credit > 0 ? (
              <button
                onClick={() => setClientPaiement(client)}
                className="text-right shrink-0"
              >
                <p className="text-sm font-semibold text-red-600">{formatFCFA(client.solde_credit)}</p>
                <p className="text-[11px] text-stone-400">Encaisser →</p>
              </button>
            ) : (
              <span className="text-xs text-stone-300 shrink-0">Aucune créance</span>
            )}
          </div>
        ))}
        {clients.length === 0 && (
          <p className="p-6 text-center text-stone-400 text-sm">Aucun client enregistré pour l'instant.</p>
        )}
      </div>

      {modaleOuverte && (
        <ModaleNouveauClient
          onFerme={() => setModaleOuverte(false)}
          onCree={(client) => setClients((prev) => [...prev, client])}
        />
      )}

      {clientPaiement && (
        <ModalePaiement
          client={clientPaiement}
          onFerme={() => setClientPaiement(null)}
          onPaye={(montant) =>
            setClients((prev) =>
              prev.map((c) =>
                c.id === clientPaiement.id
                  ? { ...c, solde_credit: Math.max(0, c.solde_credit - montant) }
                  : c
              )
            )
          }
        />
      )}
    </div>
  );
}

function ModaleNouveauClient({
  onFerme,
  onCree,
}: {
  onFerme: () => void;
  onCree: (c: Client) => void;
}) {
  const { entreprise } = useAuth();
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [enCours, setEnCours] = useState(false);

  async function gererSoumission(e: FormEvent) {
    e.preventDefault();
    if (!entreprise) return;
    setEnCours(true);
    const client = await creerClient(
      { nom, telephone: telephone || null, adresse: null, ifu: null },
      entreprise.id
    );
    onCree(client);
    onFerme();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-stone-900/40" onClick={onFerme} />
      <form onSubmit={gererSoumission} className="relative bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-stone-900">Nouveau client</h2>
          <button type="button" onClick={onFerme} className="text-stone-400">
            <X size={20} />
          </button>
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500">Nom</label>
          <input
            required
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500">Téléphone</label>
          <input
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={enCours}
          className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-2.5 rounded-xl disabled:opacity-60"
        >
          {enCours ? "Création..." : "Ajouter le client"}
        </button>
      </form>
    </div>
  );
}

function ModalePaiement({
  client,
  onFerme,
  onPaye,
}: {
  client: Client;
  onFerme: () => void;
  onPaye: (montant: number) => void;
}) {
  const { entreprise } = useAuth();
  const [montant, setMontant] = useState(String(client.solde_credit));
  const [mode, setMode] = useState<"especes" | "mobile_money">("especes");
  const [enCours, setEnCours] = useState(false);

  async function gererSoumission(e: FormEvent) {
    e.preventDefault();
    if (!entreprise) return;
    setEnCours(true);
    await enregistrerPaiementClient(entreprise.id, client.id, Number(montant), mode, client.solde_credit);
    onPaye(Number(montant));
    onFerme();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-stone-900/40" onClick={onFerme} />
      <form onSubmit={gererSoumission} className="relative bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-stone-900">Encaisser {client.nom}</h2>
          <button type="button" onClick={onFerme} className="text-stone-400">
            <X size={20} />
          </button>
        </div>
        <p className="text-sm text-stone-500">
          Créance actuelle : <strong>{formatFCFA(client.solde_credit)}</strong>
        </p>
        <div>
          <label className="text-xs font-medium text-stone-500">Montant reçu (F)</label>
          <input
            type="number"
            required
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(["especes", "mobile_money"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`py-2 rounded-lg text-sm font-medium border ${
                mode === m ? "bg-slate-700 text-white border-slate-700" : "bg-white text-stone-600 border-stone-300"
              }`}
            >
              {m === "especes" ? "Espèces" : "Mobile Money"}
            </button>
          ))}
        </div>
        <button
          type="submit"
          disabled={enCours}
          className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-2.5 rounded-xl disabled:opacity-60"
        >
          {enCours ? "Enregistrement..." : "Enregistrer le paiement"}
        </button>
      </form>
    </div>
  );
}
