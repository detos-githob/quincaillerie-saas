import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { UserPlus, X, Users as UsersIcon, Lock, ShieldCheck } from "lucide-react";
import { listerEquipe, creerMembreEquipe } from "../../services/equipeService";
import { chargerSurchargesUtilisateur, definirPermissionsUtilisateur } from "../../services/permissionsService";
import { useAuth } from "../../hooks/useAuth";
import { limiteEquipe } from "../../lib/abonnement";
import { validerMotDePasse } from "../../lib/security";
import {
  LABELS_ROLE,
  LABELS_MODULE,
  TOUS_LES_MODULES,
  resoudrePermissions,
  peutModifierAccesDe,
  type NiveauAcces,
  type Module,
} from "../../lib/permissions";
import type { Utilisateur } from "../../types";

export function EquipePage() {
  const { utilisateur, entreprise } = useAuth();
  const [equipe, setEquipe] = useState<Utilisateur[]>([]);
  const [chargement, setChargement] = useState(true);
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [membrePourAcces, setMembrePourAcces] = useState<Utilisateur | null>(null);

  useEffect(() => {
    listerEquipe()
      .then(setEquipe)
      .finally(() => setChargement(false));
  }, []);

  if (chargement) {
    return <div className="p-6 text-stone-400 text-sm">Chargement de l'équipe...</div>;
  }

  const limite = entreprise ? limiteEquipe(entreprise.plan_abonnement) : 2;
  const plafondAtteint = equipe.length >= limite;

  return (
    <div className="max-w-3xl mx-auto px-4 py-5">
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display text-2xl font-bold text-stone-900">Équipe</h1>
        <button
          onClick={() => setModaleOuverte(true)}
          disabled={plafondAtteint}
          className="flex items-center gap-1.5 bg-stone-900 text-white text-sm font-medium px-3.5 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <UserPlus size={16} /> Ajouter un membre
        </button>
      </div>
      <p className="text-xs text-stone-400 mb-4">
        {equipe.length} / {limite} compte{limite > 1 ? "s" : ""} utilisé{equipe.length > 1 ? "s" : ""}
      </p>

      {plafondAtteint && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3.5 mb-4">
          <Lock size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            Tu as atteint la limite de comptes de ton palier d'abonnement.{" "}
            <Link to="/mon-abonnement" className="font-semibold underline">
              Passe sur un palier supérieur
            </Link>{" "}
            pour ajouter d'autres membres.
          </p>
        </div>
      )}

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
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-medium text-stone-600 bg-stone-100 px-2 py-1 rounded">
                {LABELS_ROLE[membre.role] || membre.role}
              </span>
              {peutModifierAccesDe(membre.role) && (
                <button
                  onClick={() => setMembrePourAcces(membre)}
                  className="flex items-center gap-1 text-xs font-medium text-stone-600 border border-stone-300 px-2 py-1 rounded-lg"
                  title="Gérer les accès"
                >
                  <ShieldCheck size={13} /> Accès
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {modaleOuverte && (
        <ModaleNouveauMembre
          onFerme={() => setModaleOuverte(false)}
          onCree={() => listerEquipe().then(setEquipe)}
        />
      )}

      {membrePourAcces && entreprise && (
        <ModaleGestionAcces
          membre={membrePourAcces}
          entrepriseId={entreprise.id}
          onFerme={() => setMembrePourAcces(null)}
        />
      )}
    </div>
  );
}

function ModaleGestionAcces({
  membre,
  entrepriseId,
  onFerme,
}: {
  membre: Utilisateur;
  entrepriseId: string;
  onFerme: () => void;
}) {
  const [niveaux, setNiveaux] = useState<Partial<Record<Module, NiveauAcces>>>({});
  const [chargement, setChargement] = useState(true);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  useEffect(() => {
    chargerSurchargesUtilisateur(membre.id)
      .then((surcharges) => setNiveaux(resoudrePermissions(membre.role, surcharges)))
      .finally(() => setChargement(false));
  }, [membre.id, membre.role]);

  function changer(module: Module, niveau: NiveauAcces) {
    setSucces(false);
    setNiveaux((prev) => ({ ...prev, [module]: niveau }));
  }

  async function gererEnregistrement() {
    setEnCours(true);
    setErreur(null);
    try {
      await definirPermissionsUtilisateur(entrepriseId, membre.id, niveaux);
      setSucces(true);
    } catch (e: any) {
      setErreur(e.message || "Erreur lors de l'enregistrement des accès.");
    } finally {
      setEnCours(false);
    }
  }

  const OPTIONS: { valeur: NiveauAcces; label: string }[] = [
    { valeur: "aucun", label: "Aucun" },
    { valeur: "lecture", label: "Lecture" },
    { valeur: "ecriture", label: "Écriture" },
  ];

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-stone-900/40" onClick={onFerme} />
      <div className="relative bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h2 className="font-display text-xl font-bold text-stone-900">Accès de {membre.nom}</h2>
            <p className="text-xs text-stone-400">
              Rôle {LABELS_ROLE[membre.role]} — ajuste chaque module à volonté.
            </p>
          </div>
          <button type="button" onClick={onFerme} className="text-stone-400">
            <X size={20} />
          </button>
        </div>

        {chargement ? (
          <p className="px-5 py-4 text-sm text-stone-400">Chargement...</p>
        ) : (
          <div className="overflow-y-auto flex-1 px-5 space-y-2.5">
            {TOUS_LES_MODULES.filter((m) => m !== "support" && m !== "abonnement").map((module) => (
              <div key={module} className="flex items-center justify-between gap-2">
                <span className="text-sm text-stone-700">{LABELS_MODULE[module]}</span>
                <div className="flex gap-1 shrink-0">
                  {OPTIONS.map((opt) => (
                    <button
                      key={opt.valeur}
                      onClick={() => changer(module, opt.valeur)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border ${
                        (niveaux[module] || "aucun") === opt.valeur
                          ? opt.valeur === "ecriture"
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : opt.valeur === "lecture"
                              ? "bg-amber-500 text-white border-amber-500"
                              : "bg-stone-400 text-white border-stone-400"
                          : "bg-white text-stone-500 border-stone-300"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="px-5 py-3 border-t border-stone-100 space-y-2">
          {erreur && <p className="text-sm text-red-600">{erreur}</p>}
          {succes && <p className="text-sm text-emerald-600">Accès mis à jour ✓</p>}
          <button
            onClick={gererEnregistrement}
            disabled={enCours || chargement}
            className="w-full bg-stone-900 text-white font-semibold py-2.5 rounded-xl disabled:opacity-60"
          >
            {enCours ? "Enregistrement..." : "Enregistrer les accès"}
          </button>
        </div>
      </div>
    </div>
  );
}
function ModaleNouveauMembre({ onFerme, onCree }: { onFerme: () => void; onCree: () => void }) {
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [role, setRole] = useState<"vendeur" | "comptable" | "magasinier">("vendeur");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  async function gererSoumission(e: FormEvent) {
    e.preventDefault();
    setErreur(null);

    const erreurMotDePasse = validerMotDePasse(motDePasse);
    if (erreurMotDePasse) {
      setErreur(erreurMotDePasse);
      return;
    }

    setEnCours(true);
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
          <div className="grid grid-cols-3 gap-2 mt-1">
            {(["vendeur", "comptable", "magasinier"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`py-2 rounded-lg text-xs font-medium border ${
                  role === r
                    ? "bg-slate-700 text-white border-slate-700"
                    : "bg-white text-stone-600 border-stone-300"
                }`}
              >
                {LABELS_ROLE[r]}
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
