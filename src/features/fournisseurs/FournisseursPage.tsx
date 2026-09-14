import { useEffect, useState, type FormEvent } from "react";
import { Plus, Truck, X, PackagePlus } from "lucide-react";
import {
  listerFournisseurs,
  creerFournisseur,
  receptionnerLivraisonFournisseur,
} from "../../services/fournisseursService";
import { listerArticles } from "../../services/articlesService";
import { useAuth } from "../../hooks/useAuth";
import type { Article, Fournisseur } from "../../types";

export function FournisseursPage() {
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [chargement, setChargement] = useState(true);
  const [modaleNouveau, setModaleNouveau] = useState(false);
  const [fournisseurReception, setFournisseurReception] = useState<Fournisseur | null>(null);

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
          onClick={() => setModaleNouveau(true)}
          className="flex items-center gap-1.5 bg-stone-900 text-white text-sm font-medium px-3.5 py-2 rounded-lg"
        >
          <Plus size={16} /> Nouveau fournisseur
        </button>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
        {fournisseurs.map((f) => (
          <div key={f.id} className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex items-center justify-center w-9 h-9 rounded-full bg-stone-100 shrink-0">
                <Truck size={16} className="text-stone-400" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-stone-900 truncate">{f.nom}</p>
                <p className="text-xs text-stone-400">{f.telephone || "Pas de téléphone"}</p>
              </div>
            </div>
            <button
              onClick={() => setFournisseurReception(f)}
              className="flex items-center gap-1.5 text-xs font-medium text-amber-600 border border-amber-200 bg-amber-50 px-2.5 py-1.5 rounded-lg shrink-0"
            >
              <PackagePlus size={14} /> Réceptionner
            </button>
          </div>
        ))}
        {fournisseurs.length === 0 && (
          <p className="p-6 text-center text-stone-400 text-sm">Aucun fournisseur enregistré pour l'instant.</p>
        )}
      </div>

      {modaleNouveau && (
        <ModaleNouveauFournisseur
          onFerme={() => setModaleNouveau(false)}
          onCree={(f) => setFournisseurs((prev) => [...prev, f])}
        />
      )}

      {fournisseurReception && (
        <ModaleReception
          fournisseur={fournisseurReception}
          onFerme={() => setFournisseurReception(null)}
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
  const [telephone, setTelephone] = useState("");
  const [adresse, setAdresse] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function gererSoumission(e: FormEvent) {
    e.preventDefault();
    if (!entreprise) return;
    setEnCours(true);
    setErreur(null);
    try {
      const fournisseur = await creerFournisseur(
        { nom, telephone: telephone || null, adresse: adresse || null, ifu: null },
        entreprise.id
      );
      onCree(fournisseur);
      onFerme();
    } catch (e: any) {
      setErreur(e.message || "Erreur lors de la création du fournisseur.");
    } finally {
      setEnCours(false);
    }
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
        <div>
          <label className="text-xs font-medium text-stone-500">Adresse</label>
          <input
            value={adresse}
            onChange={(e) => setAdresse(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
          />
        </div>
        {erreur && <p className="text-sm text-red-600">{erreur}</p>}
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

function ModaleReception({ fournisseur, onFerme }: { fournisseur: Fournisseur; onFerme: () => void }) {
  const { entreprise, utilisateur } = useAuth();
  const [articles, setArticles] = useState<Article[]>([]);
  const [quantites, setQuantites] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  useEffect(() => {
    listerArticles().then(setArticles);
  }, []);

  async function gererValidation() {
    if (!entreprise) return;
    const lignes = Object.entries(quantites)
      .map(([articleId, q]) => ({ article_id: articleId, quantite: Number(q) }))
      .filter((l) => l.quantite > 0);

    if (lignes.length === 0) {
      setErreur("Renseigne au moins une quantité reçue.");
      return;
    }

    setEnCours(true);
    setErreur(null);
    try {
      await receptionnerLivraisonFournisseur(entreprise.id, fournisseur.id, utilisateur?.id || null, lignes);
      setSucces(true);
      setTimeout(onFerme, 1500);
    } catch (e: any) {
      setErreur(e.message || "Erreur lors de la réception.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4 py-8">
      <div className="absolute inset-0 bg-stone-900/40" onClick={onFerme} />
      <div className="relative bg-white rounded-2xl w-full max-w-md p-5 max-h-full overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-display text-xl font-bold text-stone-900">Réception</h2>
          <button onClick={onFerme} className="text-stone-400">
            <X size={20} />
          </button>
        </div>
        <p className="text-sm text-stone-500 mb-4">Livraison de {fournisseur.nom}</p>

        <div className="space-y-2 max-h-80 overflow-y-auto">
          {articles.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3">
              <p className="text-sm text-stone-700 truncate flex-1">{a.designation}</p>
              <input
                type="number"
                min={0}
                placeholder="0"
                value={quantites[a.id] || ""}
                onChange={(e) => setQuantites((prev) => ({ ...prev, [a.id]: e.target.value }))}
                className="w-20 text-center text-sm border border-stone-300 rounded-lg py-1.5"
              />
            </div>
          ))}
        </div>

        {erreur && <p className="text-sm text-red-600 mt-3">{erreur}</p>}
        {succes && <p className="text-sm text-emerald-600 mt-3">Stock mis à jour avec succès !</p>}

        <button
          onClick={gererValidation}
          disabled={enCours || succes}
          className="w-full mt-4 bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-2.5 rounded-xl disabled:opacity-60"
        >
          {enCours ? "Enregistrement..." : "Valider la réception"}
        </button>
      </div>
    </div>
  );
}
