import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, X, Receipt, ShoppingBasket, PackageCheck, Trash2 } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { peutEcrire } from "../../lib/permissions";
import { listerArticles } from "../../services/articlesService";
import {
  obtenirTontine,
  listerCotisations,
  enregistrerCotisation,
  listerPanierTontine,
  ajouterProduitPanier,
  retirerProduitPanier,
  recupererProduitsTontine,
} from "../../services/tontineService";
import { genererRecuTontinePDF } from "./recuTontinePdf";
import { LABELS_STATUT_TONTINE } from "../../types";
import type { Article, CotisationTontine, LignePanierTontine, Tontine } from "../../types";

function formatFCFA(montant: number): string {
  return Math.round(montant).toLocaleString("fr-FR") + " F";
}

export function TontineDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { entreprise, utilisateur, permissions } = useAuth();
  const peutGerer = peutEcrire(permissions, "tontines");
  const navigate = useNavigate();

  const [tontine, setTontine] = useState<Tontine | null>(null);
  const [cotisations, setCotisations] = useState<CotisationTontine[]>([]);
  const [panier, setPanier] = useState<LignePanierTontine[]>([]);
  const [chargement, setChargement] = useState(true);
  const [modaleCotisationOuverte, setModaleCotisationOuverte] = useState(false);
  const [modaleAjoutArticleOuverte, setModaleAjoutArticleOuverte] = useState(false);
  const [recuperationEnCours, setRecuperationEnCours] = useState(false);
  const [erreurRecuperation, setErreurRecuperation] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    rafraichir();
  }, [id]);

  async function rafraichir() {
    if (!id) return;
    setChargement(true);
    const [t, c, p] = await Promise.all([obtenirTontine(id), listerCotisations(id), listerPanierTontine(id)]);
    setTontine(t);
    setCotisations(c);
    setPanier(p);
    setChargement(false);
  }

  async function gererRecuperation() {
    if (!tontine || !entreprise) return;
    setRecuperationEnCours(true);
    setErreurRecuperation(null);
    try {
      await recupererProduitsTontine(tontine.id, entreprise.id, utilisateur?.id || null);
      await rafraichir();
    } catch (e: any) {
      setErreurRecuperation(e.message || "Erreur lors de la récupération des produits.");
    } finally {
      setRecuperationEnCours(false);
    }
  }

  if (chargement || !tontine) {
    return <div className="p-6 text-stone-400 text-sm">Chargement...</div>;
  }

  const style = LABELS_STATUT_TONTINE[tontine.statut];
  const progression = Math.min(100, Math.round((tontine.montant_cumule / tontine.plafond) * 100));
  const valeurPanier = panier.reduce((s, l) => s + (l.article?.prix_vente || 0) * l.quantite, 0);

  return (
    <div className="max-w-3xl mx-auto px-4 py-5 pb-10">
      <button
        onClick={() => navigate("/tontines")}
        className="flex items-center gap-1.5 text-sm text-stone-500 mb-3"
      >
        <ArrowLeft size={15} /> Retour aux tontines
      </button>

      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display text-2xl font-bold text-stone-900">{tontine.client?.nom}</h1>
        <span className={`text-xs font-medium px-2 py-1 rounded ${style.bg} ${style.texte}`}>{style.label}</span>
      </div>
      <p className="text-sm text-stone-500 mb-3">{tontine.client?.telephone || "—"}</p>

      <div className="bg-white border border-stone-200 rounded-xl p-4 mb-5">
        <div className="w-full h-3 bg-stone-100 rounded-full overflow-hidden mb-2">
          <div
            className={`h-full rounded-full ${tontine.statut === "en_cours" ? "bg-amber-400" : "bg-emerald-500"}`}
            style={{ width: `${progression}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-stone-500">
            {formatFCFA(tontine.montant_cumule)} / {formatFCFA(tontine.plafond)}
          </span>
          <span className="font-semibold text-stone-900">{progression}%</span>
        </div>
        {tontine.statut !== "cloturee" && peutGerer && (
          <button
            onClick={() => setModaleCotisationOuverte(true)}
            className="w-full mt-3 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-2.5 rounded-xl"
          >
            <Receipt size={16} /> Enregistrer une cotisation
          </button>
        )}
        {tontine.statut === "atteint" && peutGerer && (
          <div className="mt-3">
            <button
              onClick={gererRecuperation}
              disabled={recuperationEnCours || panier.length === 0}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-xl disabled:opacity-60"
            >
              <PackageCheck size={16} />
              {recuperationEnCours ? "Récupération..." : "Récupérer les produits du panier"}
            </button>
            {panier.length === 0 && (
              <p className="text-xs text-stone-400 mt-1.5 text-center">
                Ajoute des produits au panier avant de pouvoir les récupérer.
              </p>
            )}
            {erreurRecuperation && (
              <p className="text-xs text-red-600 mt-1.5 text-center">{erreurRecuperation}</p>
            )}
          </div>
        )}
      </div>

      {/* Panier privé */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <p className="font-display text-lg font-bold text-stone-900">Panier privé</p>
          {tontine.statut !== "cloturee" && peutGerer && (
            <button
              onClick={() => setModaleAjoutArticleOuverte(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-stone-600 border border-stone-300 px-2.5 py-1.5 rounded-lg"
            >
              <ShoppingBasket size={13} /> Ajouter un article
            </button>
          )}
        </div>
        <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
          {panier.map((l) => (
            <div key={l.id} className="flex items-center justify-between p-3.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-stone-900 truncate">{l.article?.designation}</p>
                <p className="text-xs text-stone-400">
                  {l.quantite} {l.article?.unite} · {formatFCFA((l.article?.prix_vente || 0) * l.quantite)}
                </p>
              </div>
              {tontine.statut !== "cloturee" && peutGerer && (
                <button
                  onClick={async () => {
                    await retirerProduitPanier(l.id);
                    setPanier((prev) => prev.filter((x) => x.id !== l.id));
                  }}
                  className="text-stone-300 hover:text-red-500 shrink-0"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
          {panier.length === 0 && (
            <p className="p-4 text-center text-stone-400 text-sm">Panier vide pour l'instant.</p>
          )}
        </div>
        {panier.length > 0 && (
          <p className="text-xs text-stone-400 mt-1.5 text-right">
            Valeur du panier : {formatFCFA(valeurPanier)}
            {valeurPanier > tontine.montant_cumule && (
              <span className="text-red-600 font-medium"> — dépasse le montant épargné</span>
            )}
          </p>
        )}
      </div>

      {/* Historique cotisations */}
      <div>
        <p className="font-display text-lg font-bold text-stone-900 mb-2">Historique des cotisations</p>
        <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
          {cotisations.map((c) => (
            <div key={c.id} className="flex items-center justify-between p-3.5">
              <div>
                <p className="text-sm font-medium text-stone-900">{c.numero_recu}</p>
                <p className="text-xs text-stone-400">{new Date(c.created_at).toLocaleDateString("fr-FR")}</p>
              </div>
              <span className="text-sm font-semibold text-stone-900">{formatFCFA(c.montant)}</span>
            </div>
          ))}
          {cotisations.length === 0 && (
            <p className="p-4 text-center text-stone-400 text-sm">Aucune cotisation encore.</p>
          )}
        </div>
      </div>

      {modaleCotisationOuverte && entreprise && (
        <ModaleCotisation
          tontine={tontine}
          entreprise={entreprise}
          utilisateurId={utilisateur?.id || null}
          onFerme={() => setModaleCotisationOuverte(false)}
          onEnregistree={rafraichir}
        />
      )}

      {modaleAjoutArticleOuverte && entreprise && (
        <ModaleAjoutArticle
          tontine={tontine}
          entrepriseId={entreprise.id}
          onFerme={() => setModaleAjoutArticleOuverte(false)}
          onAjoute={rafraichir}
        />
      )}
    </div>
  );
}

function ModaleCotisation({
  tontine,
  entreprise,
  utilisateurId,
  onFerme,
  onEnregistree,
}: {
  tontine: Tontine;
  entreprise: import("../../types").Entreprise;
  utilisateurId: string | null;
  onFerme: () => void;
  onEnregistree: () => Promise<void>;
}) {
  const [montant, setMontant] = useState("");
  const [modePaiement, setModePaiement] = useState<"especes" | "mobile_money">("especes");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function gererSoumission() {
    if (!montant || Number(montant) <= 0) {
      setErreur("Renseigne un montant valide.");
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      const cotisation = await enregistrerCotisation(
        tontine.id,
        entreprise.id,
        Number(montant),
        modePaiement,
        utilisateurId
      );
      await onEnregistree();
      genererRecuTontinePDF(
        cotisation,
        { ...tontine, montant_cumule: tontine.montant_cumule + Number(montant) },
        tontine.client?.nom || "Client",
        entreprise
      );
      onFerme();
    } catch (e: any) {
      setErreur(e.message || "Erreur lors de l'enregistrement de la cotisation.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-stone-900/40" onClick={onFerme} />
      <div className="relative bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-stone-900">Enregistrer une cotisation</h2>
          <button type="button" onClick={onFerme} className="text-stone-400">
            <X size={20} />
          </button>
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500">Montant versé (F)</label>
          <input
            type="number"
            required
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500">Mode de paiement</label>
          <select
            value={modePaiement}
            onChange={(e) => setModePaiement(e.target.value as "especes" | "mobile_money")}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm bg-white"
          >
            <option value="especes">Espèces</option>
            <option value="mobile_money">Mobile Money</option>
          </select>
        </div>
        {erreur && <p className="text-sm text-red-600">{erreur}</p>}
        <button
          onClick={gererSoumission}
          disabled={enCours}
          className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-2.5 rounded-xl disabled:opacity-60"
        >
          <Receipt size={16} />
          {enCours ? "Enregistrement..." : "Encaisser et générer le reçu"}
        </button>
      </div>
    </div>
  );
}

function ModaleAjoutArticle({
  tontine,
  entrepriseId,
  onFerme,
  onAjoute,
}: {
  tontine: Tontine;
  entrepriseId: string;
  onFerme: () => void;
  onAjoute: () => Promise<void>;
}) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [articleId, setArticleId] = useState("");
  const [quantite, setQuantite] = useState("1");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    listerArticles().then(setArticles);
  }, []);

  async function gererSoumission() {
    if (!articleId) {
      setErreur("Sélectionne un article.");
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      await ajouterProduitPanier(tontine.id, entrepriseId, articleId, Number(quantite));
      await onAjoute();
      onFerme();
    } catch (e: any) {
      setErreur(e.message || "Erreur lors de l'ajout au panier.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-stone-900/40" onClick={onFerme} />
      <div className="relative bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-stone-900">Ajouter au panier</h2>
          <button type="button" onClick={onFerme} className="text-stone-400">
            <X size={20} />
          </button>
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500">Article</label>
          <select
            value={articleId}
            onChange={(e) => setArticleId(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm bg-white"
          >
            <option value="">Choisir un article...</option>
            {articles.map((a) => (
              <option key={a.id} value={a.id}>
                {a.designation} — {formatFCFA(a.prix_vente)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500">Quantité</label>
          <input
            type="number"
            min={1}
            value={quantite}
            onChange={(e) => setQuantite(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
          />
        </div>
        {erreur && <p className="text-sm text-red-600">{erreur}</p>}
        <button
          onClick={gererSoumission}
          disabled={enCours}
          className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-2.5 rounded-xl disabled:opacity-60"
        >
          {enCours ? "Ajout..." : "Ajouter au panier"}
        </button>
      </div>
    </div>
  );
}
