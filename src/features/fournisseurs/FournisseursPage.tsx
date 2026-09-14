import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, X, Truck } from "lucide-react";
import {
  listerFournisseurs,
  creerFournisseur,
  enregistrerReglementFournisseur,
} from "../../services/fournisseursService";
import { useAuth } from "../../hooks/useAuth";
import type { Fournisseur } from "../../types";

function formatFCFA(montant: number): string {
  return Math.round(montant).toLocaleString("fr-FR") + " F";
}

export function FournisseursPage() {
  const navigate = useNavigate();
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [chargement, setChargement] = useState(true);
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [fournisseurReglement, setFournisseurReglement] = useState<Fournisseur | null>(null);

  useEffect(() => {
    listerFournisseurs()
      .then(setFournisseurs)
      .finally(() => setChargement(false));
  }, []);

  if (chargement) {
    return <div className="p-6 text-stone-400 text-sm">Chargement des fournisseurs...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-5">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl font-bold text-stone-900">Fournisseurs</h1>
        <button
          onClick={() => setModaleOuverte(true)}
          className="flex items-center gap-1.5 bg-stone-900 text-white text-sm font-medium px-3.5 py-2 rounded-lg"
        >
          <Plus size={16} /> Nouveau fournisseur
        </button>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
        {fournisseurs.map((f) => (
          <div key={f.id} className="flex items-center justify-between p-4">
            <button
              onClick={() => navigate(`/fournisseurs/${f.id}`)}
              className="flex items-center gap-3 min-w-0 text-left flex-1"
            >
              <span className="flex items-center justify-center w-9 h-9 rounded-full bg-stone-100 shrink-0">
                <Truck size={16} className="text-stone-400" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-stone-900 truncate">{f.nom}</p>
                <p className="text-xs text-stone-400">
                  {f.telephone || "Pas de téléphone"}
                  {f.delai_livraison_jours ? ` · ${f.delai_livraison_jours}j de délai` : ""}
                </p>
              </div>
            </button>
            {f.solde_du > 0 ? (
              <button onClick={() => setFournisseurReglement(f)} className="text-right shrink-0 ml-2">
                <p className="text-sm font-semibold text-red-600">{formatFCFA(f.solde_du)}</p>
                <p className="text-[11px] text-stone-400">Régler →</p>
              </button>
            ) : (
              <span className="text-xs text-stone-300 shrink-0 ml-2">Aucune dette</span>
            )}
          </div>
        ))}
        {fournisseurs.length === 0 && (
          <p className="p-6 text-center text-stone-400 text-sm">Aucun fournisseur enregistré pour l'instant.</p>
        )}
      </div>

      {modaleOuverte && (
        <ModaleNouveauFournisseur
          onFerme={() => setModaleOuverte(false)}
          onCree={(f) => setFournisseurs((prev) => [...prev, f].sort((a, b) => a.nom.localeCompare(b.nom)))}
        />
      )}

      {fournisseurReglement && (
        <ModaleReglement
          fournisseur={fournisseurReglement}
          onFerme={() => setFournisseurReglement(null)}
          onRegle={(montant) =>
            setFournisseurs((prev) =>
              prev.map((f) =>
                f.id === fournisseurReglement.id
                  ? { ...f, solde_du: Math.max(0, f.solde_du - montant) }
                  : f
              )
            )
          }
        />
      )}
    </div>
  );
}

function ModaleNouveauFournisseur({
  onFerme,
  onCree,
}: {
  onFerme: () => void;
  onCree: (f: Fournisseur) => void;
}) {
  const { entreprise } = useAuth();
  const [nom, setNom] = useState("");
  const [contactNom, setContactNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [delaiLivraison, setDelaiLivraison] = useState("");
  const [enCours, setEnCours] = useState(false);

  async function gererSoumission(e: FormEvent) {
    e.preventDefault();
    if (!entreprise) return;
    setEnCours(true);
    const fournisseur = await creerFournisseur(
      {
        nom,
        contact_nom: contactNom || null,
        telephone: telephone || null,
        adresse: null,
        ifu: null,
        delai_livraison_jours: delaiLivraison ? Number(delaiLivraison) : null,
      },
      entreprise.id
    );
    onCree(fournisseur);
    onFerme();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-stone-900/40" onClick={onFerme} />
      <form onSubmit={gererSoumission} className="relative bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-stone-900">Nouveau fournisseur</h2>
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
            placeholder="Ex : Brasserie du Bénin, Grossiste FADOUL..."
          />
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500">Contact (nom)</label>
          <input
            value={contactNom}
            onChange={(e) => setContactNom(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-stone-500">Téléphone</label>
            <input
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-stone-500">Délai livraison (j)</label>
            <input
              type="number"
              value={delaiLivraison}
              onChange={(e) => setDelaiLivraison(e.target.value)}
              className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={enCours}
          className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-2.5 rounded-xl disabled:opacity-60"
        >
          {enCours ? "Création..." : "Ajouter le fournisseur"}
        </button>
      </form>
    </div>
  );
}

function ModaleReglement({
  fournisseur,
  onFerme,
  onRegle,
}: {
  fournisseur: Fournisseur;
  onFerme: () => void;
  onRegle: (montant: number) => void;
}) {
  const [montant, setMontant] = useState(String(fournisseur.solde_du));
  const [enCours, setEnCours] = useState(false);

  async function gererSoumission(e: FormEvent) {
    e.preventDefault();
    setEnCours(true);
    await enregistrerReglementFournisseur(fournisseur.id, Number(montant), fournisseur.solde_du);
    onRegle(Number(montant));
    onFerme();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-stone-900/40" onClick={onFerme} />
      <form onSubmit={gererSoumission} className="relative bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-stone-900">Régler {fournisseur.nom}</h2>
          <button type="button" onClick={onFerme} className="text-stone-400">
            <X size={20} />
          </button>
        </div>
        <p className="text-sm text-stone-500">
          Dette actuelle : <strong>{formatFCFA(fournisseur.solde_du)}</strong>
        </p>
        <div>
          <label className="text-xs font-medium text-stone-500">Montant payé (F)</label>
          <input
            type="number"
            required
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={enCours}
          className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-2.5 rounded-xl disabled:opacity-60"
        >
          {enCours ? "Enregistrement..." : "Enregistrer le règlement"}
        </button>
      </form>
    </div>
  );
}
