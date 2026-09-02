import { useEffect, useMemo, useState } from "react";
import { Search, Plus, Minus, X, ChevronUp, Check } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { listerArticles } from "../../services/articlesService";
import { listerClients, creerClient } from "../../services/clientsService";
import { enregistrerVente } from "../../services/ventesService";
import type { Article, Client, ModePaiement } from "../../types";

function formatFCFA(montant: number): string {
  return Math.round(montant).toLocaleString("fr-FR") + " F";
}

interface LigneCourante {
  article: Article;
  quantite: number;
}

export function VentePage() {
  const { entreprise, utilisateur } = useAuth();
  const [articles, setArticles] = useState<Article[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [recherche, setRecherche] = useState("");
  const [categorieChoisie, setCategorieChoisie] = useState<string | null>(null);
  const [panier, setPanier] = useState<LigneCourante[]>([]);
  const [cartOuvert, setCartOuvert] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [nouveauClientNom, setNouveauClientNom] = useState("");
  const [nouveauClientTelephone, setNouveauClientTelephone] = useState("");
  const [modePaiement, setModePaiement] = useState<ModePaiement>("especes");
  const [enCours, setEnCours] = useState(false);
  const [messageFinal, setMessageFinal] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listerArticles(), listerClients()])
      .then(([a, c]) => {
        setArticles(a);
        setClients(c);
      })
      .catch((e) => setErreur(String(e.message || e)));
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(articles.map((a) => a.categorie_id).filter(Boolean))),
    [articles]
  );

  const articlesFiltres = useMemo(() => {
    return articles.filter((a) => {
      const matchCategorie = !categorieChoisie || a.categorie_id === categorieChoisie;
      const matchRecherche = a.designation.toLowerCase().includes(recherche.toLowerCase());
      return matchCategorie && matchRecherche;
    });
  }, [articles, categorieChoisie, recherche]);

  const total = panier.reduce((s, l) => s + l.article.prix_vente * l.quantite, 0);
  const nombreArticles = panier.reduce((s, l) => s + l.quantite, 0);

  function ajouterAuPanier(article: Article) {
    if (article.stock_actuel <= 0) return;
    setPanier((prev) => {
      const existant = prev.find((l) => l.article.id === article.id);
      if (existant) {
        return prev.map((l) =>
          l.article.id === article.id ? { ...l, quantite: l.quantite + 1 } : l
        );
      }
      return [...prev, { article, quantite: 1 }];
    });
  }

  function changerQuantite(articleId: string, delta: number) {
    setPanier((prev) =>
      prev
        .map((l) => (l.article.id === articleId ? { ...l, quantite: l.quantite + delta } : l))
        .filter((l) => l.quantite > 0)
    );
  }

  function definirQuantite(articleId: string, valeurTexte: string) {
    setPanier((prev) =>
      prev.map((l) => {
        if (l.article.id !== articleId) return l;
        const valeur = parseInt(valeurTexte, 10);
        if (isNaN(valeur) || valeur < 1) return { ...l, quantite: 1 };
        return { ...l, quantite: Math.min(valeur, l.article.stock_actuel) };
      })
    );
  }

  function retirerDuPanier(articleId: string) {
    setPanier((prev) => prev.filter((l) => l.article.id !== articleId));
  }

  async function validerVente() {
    if (!entreprise || panier.length === 0) return;
    setEnCours(true);
    setErreur(null);

    try {
      // Si un nom de nouveau client a été saisi directement, on le crée
      // d'abord et on l'utilise à la place du client sélectionné dans
      // le menu déroulant.
      let clientFinal = clientId;
      if (nouveauClientNom.trim()) {
        const nouveauClient = await creerClient(
          { nom: nouveauClientNom.trim(), telephone: nouveauClientTelephone.trim() || null, adresse: null, ifu: null },
          entreprise.id
        );
        clientFinal = nouveauClient.id;
        setClients((prev) => [...prev, nouveauClient]);
      }

      const resultat = await enregistrerVente({
        p_entreprise_id: entreprise.id,
        p_client_id: clientFinal,
        p_utilisateur_id: utilisateur?.id || null,
        p_mode_paiement: modePaiement,
        p_lignes: panier.map((l) => ({
          article_id: l.article.id,
          designation: l.article.designation,
          quantite: l.quantite,
          prix_unitaire: l.article.prix_vente,
          prix_achat_unitaire: l.article.prix_achat,
          remise: 0,
        })),
      });

      setMessageFinal(
        resultat.horsLigne
          ? "Vente enregistrée hors ligne — sera synchronisée automatiquement"
          : "Vente enregistrée"
      );

      // Mise à jour optimiste du stock affiché localement
      setArticles((prev) =>
        prev.map((a) => {
          const ligne = panier.find((l) => l.article.id === a.id);
          return ligne ? { ...a, stock_actuel: a.stock_actuel - ligne.quantite } : a;
        })
      );

      setTimeout(() => {
        setMessageFinal(null);
        setPanier([]);
        setCartOuvert(false);
        setClientId(null);
        setNouveauClientNom("");
        setNouveauClientTelephone("");
        setModePaiement("especes");
      }, 1800);
    } catch (e: any) {
      setErreur(e.message || "Erreur lors de l'enregistrement de la vente.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-56px)]">
      {/* Recherche */}
      <div className="px-4 pt-4 pb-2 bg-stone-50 sticky top-0 z-20">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Chercher un article..."
            className="w-full bg-white border border-stone-300 rounded-lg py-2.5 pl-10 pr-4 text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500 text-base"
          />
        </div>

        {categories.length > 0 && (
          <div className="flex gap-2 mt-3 overflow-x-auto pb-1 -mx-4 px-4">
            <button
              onClick={() => setCategorieChoisie(null)}
              className={`whitespace-nowrap px-3.5 py-1.5 rounded-full text-sm font-medium border ${
                !categorieChoisie ? "bg-stone-900 text-white border-stone-900" : "bg-white text-stone-600 border-stone-300"
              }`}
            >
              Tout
            </button>
          </div>
        )}
      </div>

      {erreur && (
        <p className="mx-4 mb-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {erreur}
        </p>
      )}

      {/* Grille articles */}
      <main className="flex-1 px-4 pb-32 pt-2">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {articlesFiltres.map((article) => {
            const enPanier = panier.find((l) => l.article.id === article.id);
            const rupture = article.stock_actuel <= 0;
            const stockFaible = article.stock_actuel > 0 && article.stock_actuel <= article.seuil_alerte;
            return (
              <button
                key={article.id}
                onClick={() => ajouterAuPanier(article)}
                disabled={rupture}
                className={`text-left bg-white border rounded-xl p-3 flex flex-col justify-between min-h-[128px] ${
                  rupture ? "border-stone-200 opacity-50 cursor-not-allowed" : "border-stone-200 hover:border-stone-300 hover:shadow-sm"
                } ${enPanier ? "ring-2 ring-amber-500" : ""}`}
              >
                <div>
                  <p className="text-sm font-semibold text-stone-900 leading-snug">{article.designation}</p>
                  {rupture && (
                    <span className="inline-block mt-1 text-[11px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                      Rupture de stock
                    </span>
                  )}
                  {stockFaible && !rupture && (
                    <span className="inline-block mt-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                      Stock faible · {article.stock_actuel} {article.unite}
                    </span>
                  )}
                </div>
                <div className="flex items-end justify-between mt-2">
                  <span className="font-display text-xl font-bold text-stone-900">
                    {formatFCFA(article.prix_vente)}
                  </span>
                  {!rupture && (
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-500 text-white">
                      {enPanier ? (
                        <span className="text-xs font-bold">{enPanier.quantite}</span>
                      ) : (
                        <Plus size={16} />
                      )}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        {articlesFiltres.length === 0 && (
          <p className="text-center text-stone-400 mt-12 text-sm">Aucun article trouvé.</p>
        )}
      </main>

      {/* Barre panier */}
      {panier.length > 0 && !cartOuvert && (
        <button
          onClick={() => setCartOuvert(true)}
          className="fixed bottom-14 sm:bottom-0 left-0 right-0 sm:left-56 bg-stone-900 text-white px-4 py-3.5 flex items-center justify-between z-30"
        >
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-500 text-stone-900 font-bold text-sm">
              {nombreArticles}
            </span>
            <span className="font-medium">Voir le panier</span>
            <ChevronUp size={18} className="text-stone-400" />
          </div>
          <span className="font-display text-2xl font-bold">{formatFCFA(total)}</span>
        </button>
      )}

      {/* Panneau panier */}
      {cartOuvert && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end">
          <div className="absolute inset-0 bg-stone-900/40" onClick={() => setCartOuvert(false)} />
          <div className="relative bg-white rounded-t-2xl max-h-[85vh] flex flex-col sm:max-w-md sm:mx-auto sm:w-full">
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-stone-100">
              <h2 className="font-display text-xl font-bold text-stone-900">Panier ({nombreArticles})</h2>
              <button onClick={() => setCartOuvert(false)} className="text-stone-400 hover:text-stone-700">
                <X size={22} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-4 py-2">
              {panier.map((ligne) => (
                <div key={ligne.article.id} className="flex items-center justify-between py-3 border-b border-stone-100 last:border-0">
                  <div className="flex-1 min-w-0 pr-2">
                    <p className="text-sm font-medium text-stone-900 truncate">{ligne.article.designation}</p>
                    <p className="text-xs text-stone-400 mt-0.5">
                      {formatFCFA(ligne.article.prix_vente)} / {ligne.article.unite}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => changerQuantite(ligne.article.id, -1)} className="w-7 h-7 flex items-center justify-center rounded-full border border-stone-300 text-stone-600">
                      <Minus size={14} />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={ligne.article.stock_actuel}
                      value={ligne.quantite}
                      onChange={(e) => definirQuantite(ligne.article.id, e.target.value)}
                      onFocus={(e) => e.target.select()}
                      className="w-12 text-center text-sm font-semibold border border-stone-300 rounded-lg py-1"
                    />
                    <button onClick={() => changerQuantite(ligne.article.id, 1)} className="w-7 h-7 flex items-center justify-center rounded-full border border-stone-300 text-stone-600">
                      <Plus size={14} />
                    </button>
                    <span className="font-display text-lg font-bold text-stone-900 w-20 text-right">
                      {formatFCFA(ligne.article.prix_vente * ligne.quantite)}
                    </span>
                    <button onClick={() => retirerDuPanier(ligne.article.id)} className="text-stone-300 hover:text-red-500 ml-1">
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-stone-100 px-4 py-3 space-y-3">
              <div>
                <label className="text-xs font-medium text-stone-500">Client</label>
                <select
                  value={clientId || ""}
                  onChange={(e) => setClientId(e.target.value || null)}
                  className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm bg-white"
                >
                  <option value="">Client comptant</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom}
                    </option>
                  ))}
                </select>

                <p className="text-xs font-medium text-stone-500 mt-2.5">
                  Ou nouveau client (rempli automatiquement à l'encaissement)
                </p>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <input
                    value={nouveauClientNom}
                    onChange={(e) => setNouveauClientNom(e.target.value)}
                    placeholder="Nom"
                    className="border border-stone-300 rounded-lg py-2 px-3 text-sm"
                  />
                  <input
                    value={nouveauClientTelephone}
                    onChange={(e) => setNouveauClientTelephone(e.target.value)}
                    placeholder="Téléphone"
                    className="border border-stone-300 rounded-lg py-2 px-3 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-stone-500">Mode de paiement</label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {(
                    [
                      { id: "especes", label: "Espèces" },
                      { id: "mobile_money", label: "Mobile Money" },
                      { id: "credit", label: "Crédit" },
                    ] as { id: ModePaiement; label: string }[]
                  ).map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setModePaiement(m.id)}
                      className={`py-2 rounded-lg text-sm font-medium border ${
                        modePaiement === m.id ? "bg-slate-700 text-white border-slate-700" : "bg-white text-stone-600 border-stone-300"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-stone-500 text-sm">Total à payer</span>
                <span className="font-display text-3xl font-bold text-stone-900">{formatFCFA(total)}</span>
              </div>

              {erreur && <p className="text-sm text-red-600">{erreur}</p>}

              <button
                onClick={validerVente}
                disabled={enCours || !!messageFinal}
                className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {messageFinal ? (
                  <>
                    <Check size={18} /> {messageFinal}
                  </>
                ) : enCours ? (
                  "Enregistrement..."
                ) : (
                  "Encaisser"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
