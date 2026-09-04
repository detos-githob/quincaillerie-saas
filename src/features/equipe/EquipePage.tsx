import { useEffect, useState, type FormEvent } from "react";
import { UserPlus, X, Users as UsersIcon } from "lucide-react";
import { listerEquipe, creerMembreEquipe } from "../../services/equipeService";
import { useAuth } from "../../hooks/useAuth";
import type { Utilisateur } from "../../types";

const LABEL_ROLE: Record<string, string> = {
  gerant: "Gérant",
  comptable: "Comptable",
  vendeur: "Vendeur",
};

export function EquipePage() {
  const { utilisateur } = useAuth();
  const [equipe, setEquipe] = useState<Utilisateur[]>([]);
  const [chargement, setChargement] = useState(true);
  const [modaleOuverte, setModaleOuverte] = useState(false);

  useEffect(() => {
    listerEquipe()
      .then(setEquipe)
      .finally(() => setChargement(false));
  }, []);

  if (chargement) {
    return <div className="p-6 text-stone-400 text-sm">Chargement de l'équipe...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-5">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl font-bold text-stone-900">Équipe</h1>
        <button
          onClick={() => setModaleOuverte(true)}
          className="flex items-center gap-1.5 bg-stone-900 text-white text-sm font-medium px-3.5 py-2 rounded-lg"
        >
          <UserPlus size={16} /> Ajouter un membre
        </button>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
        {equipe.map((membre) => (
          <div key={membre.id} className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex items-center justify-center w-9 h-9 rounded-full bg-stone-100 shrink-0">
                <UsersIcon size={16} className="text-stone-400" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-stone-900 truncate">
                  {membre.nom}
                  {membre.id === utilisateur?.id && (
                    <span className="text-stone-400 font-normal"> (toi)</span>
                  )}
                </p>
                <p className="text-xs text-stone-400">{membre.telephone || "—"}</p>
              </div>
            </div>
            <span className="text-xs font-medium text-stone-600 bg-stone-100 px-2 py-1 rounded shrink-0">
              {LABEL_ROLE[membre.role] || membre.role}
            </span>
          </div>
        ))}
      </div>

      {modaleOuverte && (
        <ModaleNouveauMembre
          onFerme={() => setModaleOuverte(false)}
          onCree={() => listerEquipe().then(setEquipe)}
        />
      )}
    </div>
  );
}

function ModaleNouveauMembre({ onFerme, onCree }: { onFerme: () => void; onCree: () => void }) {
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [role, setRole] = useState<"vendeur" | "comptable">("vendeur");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  async function gererSoumission(e: FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    try {
      await creerMembreEquipe(nom, email, motDePasse, role);
      setSucces(true);
      onCree();
      setTimeout(onFerme, 1500);
    } catch (e: any) {
      setErreur(e.message || "Erreur lors de la création du compte.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-stone-900/40" onClick={onFerme} />
      <form onSubmit={gererSoumission} className="relative bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-stone-900">Nouveau membre</h2>
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
          <label className="text-xs font-medium text-stone-500">Rôle</label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            {(["vendeur", "comptable"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`py-2 rounded-lg text-sm font-medium border capitalize ${
                  role === r
                    ? "bg-slate-700 text-white border-slate-700"
                    : "bg-white text-stone-600 border-stone-300"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-stone-500">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-stone-500">Mot de passe provisoire</label>
          <input
            type="text"
            required
            minLength={6}
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
            placeholder="À communiquer à l'employé"
          />
        </div>

        {erreur && <p className="text-sm text-red-600">{erreur}</p>}
        {succes && <p className="text-sm text-emerald-600">Compte créé avec succès !</p>}

        <button
          type="submit"
          disabled={enCours || succes}
          className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-2.5 rounded-xl disabled:opacity-60"
        >
          {enCours ? "Création..." : "Créer le compte"}
        </button>
      </form>
    </div>
  );
}
