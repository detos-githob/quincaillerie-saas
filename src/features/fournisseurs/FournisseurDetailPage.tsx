import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, X, PackageCheck } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { listerArticles } from "../../services/articlesService";
import {
  listerCommandesFournisseur,
  creerCommandeFournisseur,
  listerLignesCommandeFournisseur,
  receptionnerCommandeFournisseur,
} from "../../services/fournisseursService";
import { supabase } from "../../lib/supabaseClient";
import type { Article, CommandeFournisseur, Fournisseur, LigneCommandeFournisseur } from "../../types";

function formatFCFA(montant: number): string {
  return Math.round(montant).toLocaleString("fr-FR") + " F";
}

const LABELS_STATUT: Record<string, { label: string; style: string }> = {
  brouillon: { label: "Brouillon", style: "bg-stone-100 text-stone-500" },
  envoyee: { label: "Envoyée", style: "bg-amber-50 text-amber-700" },
  receptionnee_partielle: { label: "Réception partielle", style: "bg-slate-100 text-slate-700" },
  receptionnee: { label: "Réceptionnée", style: "bg-emerald-50 text-emerald-600" },
  annulee: { label: "Annulée", style: "bg-red-50 text-red-600" },
};

export function FournisseurDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { entreprise, utilisateur } = useAuth();
  const navigate = useNavigate();

  const [fournisseur, setFournisseur] = useState<Fournisseur | null>(null);
  const [commandes, setCommandes] = useState<CommandeFournisseur[]>([]);
  const [chargement, setChargement] = useState(true);
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [commandeReception, setCommandeReception] = useState<CommandeFournisseur | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      supabase.from("fournisseurs").select("*").eq("id", id).single(),
      listerCommandesFournisseur(id),
    ])
      .then(([{ data }, cmds]) => {
        setFournisseur(data as Fournisseur);
        setCommandes(cmds);
      })
      .finally(() => setChargement(false));
  }, [id]);

  async function rafraichirCommandes() {
    if (!id) return;
    setCommandes(await listerCommandesFournisseur(id));
  }

  if (chargement) {
    return <div className="p-6 text-stone-400 text-sm">Chargement...</div>;
  }

  if (!fournisseur) {
    return <div className="p-6 text-stone-400 text-sm">Fournisseur introuvable.</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-5 pb-10">
      <button
        onClick={() => navigate("/fournisseurs")}
        className="flex items-center gap-1.5 text-sm text-stone-500 mb-3"
      >
        <ArrowLeft size={15} /> Retour aux fournisseurs
      </button>

      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display text-2xl font-bold text-stone-900">{fournisseur.nom}</h1>
      </div>
      <p className="text-sm text-stone-500 mb-4">
        {fournisseur.telephone || "—"}
        {fournisseur.solde_du > 0 && (
          <span className="text-red-600 font-medium"> · Dette : {formatFCFA(fournisseur.solde_du)}</span>
        )}
      </p>

      <div className="flex items-center justify-between mb-3">
        <p className="font-display text-lg font-bold text-stone-900">Commandes</p>
        <button
          onClick={() => setModaleOuverte(true)}
          className="flex items-center gap-1.5 bg-stone-900 text-white text-sm font-medium px-3.5 py-2 rounded-lg"
        >
          <Plus size={16} /> Nouvelle commande
        </button>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
        {commandes.map((cmd) => {
          const statut = LABELS_STATUT[cmd.statut];
          const peutReceptionner = cmd.statut === "envoyee" || cmd.statut === "receptionnee_partielle";
          return (
            <div key={cmd.id} className="flex items-center justify-between p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-stone-900">{cmd.numero_commande}</p>
                <p className="text-xs text-stone-400">
                  {new Date(cmd.date_commande).toLocaleDateString("fr-FR")} · {formatFCFA(cmd.montant_total)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs font-medium px-2 py-1 rounded ${statut.style}`}>{statut.label}</span>
                {peutReceptionner && (
                  <button
                    onClick={() => setCommandeReception(cmd)}
                    className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded"
                  >
                    <PackageCheck size={13} /> Réceptionner
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {commandes.length === 0 && (
          <p className="p-6 text-center text-stone-400 text-sm">Aucune commande pour ce fournisseur.</p>
        )}
      </div>

      {modaleOuverte && entreprise && (
        <ModaleNouvelleCommande
          entrepriseId={entreprise.id}
          fournisseurId={fournisseur.id}
          utilisateurId={utilisateur?.id || null}
          onFerme={() => setModaleOuverte(false)}
          onCreee={rafraichirCommandes}
        />
      )}

      {commandeReception && (
        <ModaleReception
          commande={commandeReception}
          utilisateurId={utilisateur?.id || null}
          onFerme={() => setCommandeReception(null)}
          onReceptionnee={rafraichirCommandes}
        />
      )}
    </div>
  );
}

interface LigneSaisie {
  article: Article;
  quantite: string;
  prixAchat: string;
}

function ModaleNouvelleCommande({
  entrepriseId,
  fournisseurId,
  utilisateurId,
  onFerme,
  onCreee,
}: {
  entrepriseId: string;
  fournisseurId: string;
  utilisateurId: string | null;
  onFerme: () => void;
  onCreee: () => void;
}) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [lignes, setLignes] = useState<LigneSaisie[]>([]);
  const [dateReceptionPrevue, setDateReceptionPrevue] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    listerArticles().then(setArticles);
  }, []);

  function ajouterLigne(articleId: string) {
    const article = articles.find((a) => a.id === articleId);
    if (!article || lignes.some((l) => l.article.id === articleId)) return;
    setLignes((prev) => [...prev, { article, quantite: "1", prixAchat: String(article.prix_achat) }]);
  }

  function modifierLigne(articleId: string, champ: "quantite" | "prixAchat", valeur: string) {
    setLignes((prev) => prev.map((l) => (l.article.id === articleId ? { ...l, [champ]: valeur } : l)));
  }

  function retirerLigne(articleId: string) {
    setLignes((prev) => prev.filter((l) => l.article.id !== articleId));
  }

  async function gererSoumission() {
    if (lignes.length === 0) {
      setErreur("Ajoute au moins un article à la commande.");
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      const id = await creerCommandeFournisseur(
        entrepriseId,
        fournisseurId,
        utilisateurId,
        dateReceptionPrevue || null,
        lignes.map((l) => ({
          article_id: l.article.id,
          quantite_commandee: Number(l.quantite),
          prix_achat_unitaire: Number(l.prixAchat),
        }))
      );
      if (id) onCreee();
      onFerme();
    } catch (e: any) {
      setErreur(e.message || "Erreur lors de la création de la commande.");
    } finally {
      setEnCours(false);
    }
  }

  const total = lignes.reduce((s, l) => s + Number(l.quantite || 0) * Number(l.prixAchat || 0), 0);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-stone-900/40" onClick={onFerme} />
      <div className="relative bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="font-display text-xl font-bold text-stone-900">Nouvelle commande</h2>
          <button type="button" onClick={onFerme} className="text-stone-400">
            <X size={20} />
          </button>
        </div>

        <div className="px-5 pb-3">
          <label className="text-xs font-medium text-stone-500">Ajouter un article</label>
          <select
            value=""
            onChange={(e) => ajouterLigne(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm bg-white"
          >
            <option value="">Choisir un article...</option>
            {articles
              .filter((a) => !lignes.some((l) => l.article.id === a.id))
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.designation}
                </option>
              ))}
          </select>
        </div>

        <div className="overflow-y-auto flex-1 px-5 space-y-2">
          {lignes.map((l) => (
            <div key={l.article.id} className="flex items-center gap-2 border border-stone-200 rounded-lg p-2.5">
              <span className="flex-1 min-w-0 text-sm font-medium text-stone-900 truncate">
                {l.article.designation}
              </span>
              <input
                type="number"
                value={l.quantite}
                onChange={(e) => modifierLigne(l.article.id, "quantite", e.target.value)}
                placeholder="Qté"
                className="w-16 text-center text-sm border border-stone-300 rounded-lg py-1.5"
              />
              <input
                type="number"
                value={l.prixAchat}
                onChange={(e) => modifierLigne(l.article.id, "prixAchat", e.target.value)}
                placeholder="Prix achat"
                className="w-24 text-center text-sm border border-stone-300 rounded-lg py-1.5"
              />
              <button onClick={() => retirerLigne(l.article.id)} className="text-stone-300 hover:text-red-500">
                <X size={16} />
              </button>
            </div>
          ))}
          {lignes.length === 0 && (
            <p className="text-center text-stone-400 text-sm py-4">Aucun article ajouté.</p>
          )}
        </div>

        <div className="px-5 py-3 border-t border-stone-100 space-y-3">
          <div>
            <label className="text-xs font-medium text-stone-500">Date de réception prévue (optionnel)</label>
            <input
              type="date"
              value={dateReceptionPrevue}
              onChange={(e) => setDateReceptionPrevue(e.target.value)}
              className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-stone-500">Total commande</span>
            <span className="font-display text-xl font-bold text-stone-900">{formatFCFA(total)}</span>
          </div>
          {erreur && <p className="text-sm text-red-600">{erreur}</p>}
          <button
            onClick={gererSoumission}
            disabled={enCours}
            className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-2.5 rounded-xl disabled:opacity-60"
          >
            {enCours ? "Création..." : "Créer la commande"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModaleReception({
  commande,
  utilisateurId,
  onFerme,
  onReceptionnee,
}: {
  commande: CommandeFournisseur;
  utilisateurId: string | null;
  onFerme: () => void;
  onReceptionnee: () => void;
}) {
  const [lignes, setLignes] = useState<LigneCommandeFournisseur[]>([]);
  const [quantitesRecues, setQuantitesRecues] = useState<Record<string, string>>({});
  const [chargement, setChargement] = useState(true);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    listerLignesCommandeFournisseur(commande.id)
      .then((data) => {
        setLignes(data);
        const initial: Record<string, string> = {};
        data.forEach((l) => {
          const restant = l.quantite_commandee - l.quantite_recue;
          initial[l.id] = restant > 0 ? String(restant) : "0";
        });
        setQuantitesRecues(initial);
      })
      .finally(() => setChargement(false));
  }, [commande.id]);

  async function gererSoumission() {
    setEnCours(true);
    setErreur(null);
    try {
      const payload = lignes
        .map((l) => ({ ligne_id: l.id, quantite_recue: Number(quantitesRecues[l.id] || 0) }))
        .filter((l) => l.quantite_recue > 0);
      if (payload.length === 0) {
        setErreur("Renseigne au moins une quantité reçue.");
        setEnCours(false);
        return;
      }
      await receptionnerCommandeFournisseur(commande.id, utilisateurId, payload);
      onReceptionnee();
      onFerme();
    } catch (e: any) {
      setErreur(e.message || "Erreur lors de l'enregistrement de la réception.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-stone-900/40" onClick={onFerme} />
      <div className="relative bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="font-display text-xl font-bold text-stone-900">
            Réceptionner {commande.numero_commande}
          </h2>
          <button type="button" onClick={onFerme} className="text-stone-400">
            <X size={20} />
          </button>
        </div>
        <p className="px-5 text-xs text-stone-400 pb-2">
          Indique la quantité livrée maintenant. Une réception partielle reste possible :
          le reliquat pourra être réceptionné plus tard.
        </p>

        {chargement ? (
          <p className="px-5 py-4 text-sm text-stone-400">Chargement...</p>
        ) : (
          <div className="overflow-y-auto flex-1 px-5 space-y-2">
            <div className="grid grid-cols-[1fr_auto_auto] gap-2 text-xs font-medium text-stone-400 px-1">
              <span>Article</span>
              <span className="w-20 text-center">Restant</span>
              <span className="w-20 text-center">Reçu</span>
            </div>
            {lignes.map((l) => {
              const restant = l.quantite_commandee - l.quantite_recue;
              return (
                <div key={l.id} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center px-1 py-1.5">
                  <span className="text-sm font-medium text-stone-900 truncate">
                    {l.article?.designation}
                  </span>
                  <span className="w-20 text-center text-sm text-stone-500">
                    {restant} {l.article?.unite}
                  </span>
                  <input
                    type="number"
                    value={quantitesRecues[l.id] ?? ""}
                    onChange={(e) => setQuantitesRecues((prev) => ({ ...prev, [l.id]: e.target.value }))}
                    className="w-20 text-center text-sm border border-stone-300 rounded-lg py-1.5"
                  />
                </div>
              );
            })}
          </div>
        )}

        <div className="px-5 py-3 border-t border-stone-100 space-y-3">
          {erreur && <p className="text-sm text-red-600">{erreur}</p>}
          <button
            onClick={gererSoumission}
            disabled={enCours || chargement}
            className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-2.5 rounded-xl disabled:opacity-60"
          >
            {enCours ? "Enregistrement..." : "Confirmer la réception"}
          </button>
        </div>
      </div>
    </div>
  );
}
