import { useEffect, useState } from "react";
import { Beer, Undo2, PackageX, Settings2, X } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { listerArticles, modifierArticle } from "../../services/articlesService";
import { listerClients } from "../../services/clientsService";
import {
  listerMouvementsConsigne,
  enregistrerMouvementConsigne,
  listerCasses,
  enregistrerCasse,
} from "../../services/depotBoissonsService";
import type { Article, Casse, Client, MouvementConsigne, TypeMouvementConsigne } from "../../types";

function formatFCFA(montant: number): string {
  return Math.round(montant).toLocaleString("fr-FR") + " F";
}

type Onglet = "consignes" | "casses" | "articles";

export function DepotBoissonsPage() {
  const [onglet, setOnglet] = useState<Onglet>("consignes");

  return (
    <div className="max-w-3xl mx-auto px-4 py-5 pb-10">
      <h1 className="font-display text-2xl font-bold text-stone-900 mb-4">Dépôt de boissons</h1>

      <div className="flex gap-2 mb-4">
        {([
          ["consignes", "Consignes"],
          ["casses", "Casses"],
          ["articles", "Articles consignés"],
        ] as [Onglet, string][]).map(([val, label]) => (
          <button
            key={val}
            onClick={() => setOnglet(val)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border ${
              onglet === val ? "bg-stone-900 text-white border-stone-900" : "bg-white text-stone-600 border-stone-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {onglet === "consignes" && <OngletConsignes />}
      {onglet === "casses" && <OngletCasses />}
      {onglet === "articles" && <OngletArticlesConsignes />}
    </div>
  );
}

// =====================================================================
// ONGLET CONSIGNES
// =====================================================================

function OngletConsignes() {
  const { entreprise, utilisateur } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [mouvements, setMouvements] = useState<MouvementConsigne[]>([]);
  const [chargement, setChargement] = useState(true);
  const [modaleOuverte, setModaleOuverte] = useState<TypeMouvementConsigne | null>(null);

  useEffect(() => {
    Promise.all([listerClients(), listerArticles(), listerMouvementsConsigne()])
      .then(([c, a, m]) => {
        setClients(c);
        setArticles(a.filter((art) => art.gestion_consigne));
        setMouvements(m);
      })
      .finally(() => setChargement(false));
  }, []);

  const clientsAvecSolde = clients.filter(
    (c) => c.solde_consigne_casiers > 0 || c.solde_consigne_bouteilles > 0
  );

  if (chargement) return <p className="text-stone-400 text-sm p-4">Chargement...</p>;

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <button
          onClick={() => setModaleOuverte("sortie_consigne")}
          className="flex-1 flex items-center justify-center gap-1.5 bg-stone-900 text-white text-sm font-medium py-2.5 rounded-lg"
        >
          <Beer size={15} /> Sortie de casiers
        </button>
        <button
          onClick={() => setModaleOuverte("retour_consigne")}
          className="flex-1 flex items-center justify-center gap-1.5 bg-white border border-stone-300 text-stone-700 text-sm font-medium py-2.5 rounded-lg"
        >
          <Undo2 size={15} /> Retour de vides
        </button>
      </div>

      <div>
        <p className="font-display text-lg font-bold text-stone-900 mb-2">Clients avec consignes en cours</p>
        <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
          {clientsAvecSolde.map((c) => (
            <div key={c.id} className="flex items-center justify-between p-3.5">
              <span className="text-sm font-medium text-stone-900">{c.nom}</span>
              <span className="text-xs text-stone-500">
                {c.solde_consigne_casiers > 0 && `${c.solde_consigne_casiers} casier(s)`}
                {c.solde_consigne_casiers > 0 && c.solde_consigne_bouteilles > 0 && " · "}
                {c.solde_consigne_bouteilles > 0 && `${c.solde_consigne_bouteilles} bouteille(s)`}
              </span>
            </div>
          ))}
          {clientsAvecSolde.length === 0 && (
            <p className="p-4 text-center text-stone-400 text-sm">Aucun client n'a de consigne en cours.</p>
          )}
        </div>
      </div>

      <div>
        <p className="font-display text-lg font-bold text-stone-900 mb-2">Derniers mouvements</p>
        <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
          {mouvements.slice(0, 15).map((m) => (
            <div key={m.id} className="flex items-center justify-between p-3.5">
              <div>
                <p className="text-sm font-medium text-stone-900">
                  {m.client?.nom} — {LIBELLE_MOUVEMENT[m.type_mouvement]}
                </p>
                <p className="text-xs text-stone-400">
                  {m.article?.designation || "—"} · {new Date(m.created_at).toLocaleDateString("fr-FR")}
                </p>
              </div>
              <span className="text-xs text-stone-500 text-right">
                {m.quantite_casiers > 0 && `${m.quantite_casiers} casier(s)`}
                {m.quantite_casiers > 0 && m.quantite_bouteilles > 0 && " · "}
                {m.quantite_bouteilles > 0 && `${m.quantite_bouteilles} btl`}
              </span>
            </div>
          ))}
          {mouvements.length === 0 && (
            <p className="p-4 text-center text-stone-400 text-sm">Aucun mouvement de consigne encore.</p>
          )}
        </div>
      </div>

      {modaleOuverte && entreprise && (
        <ModaleMouvementConsigne
          type={modaleOuverte}
          clients={clients}
          articles={articles}
          entrepriseId={entreprise.id}
          utilisateurId={utilisateur?.id || null}
          onFerme={() => setModaleOuverte(null)}
          onEnregistre={async () => {
            setClients(await listerClients());
            setMouvements(await listerMouvementsConsigne());
          }}
        />
      )}
    </div>
  );
}

const LIBELLE_MOUVEMENT: Record<TypeMouvementConsigne, string> = {
  sortie_consigne: "Sortie de casiers",
  retour_consigne: "Retour de vides",
  rachat_consigne: "Consigne soldée",
};

function ModaleMouvementConsigne({
  type,
  clients,
  articles,
  entrepriseId,
  utilisateurId,
  onFerme,
  onEnregistre,
}: {
  type: TypeMouvementConsigne;
  clients: Client[];
  articles: Article[];
  entrepriseId: string;
  utilisateurId: string | null;
  onFerme: () => void;
  onEnregistre: () => void;
}) {
  const [clientId, setClientId] = useState("");
  const [articleId, setArticleId] = useState("");
  const [quantiteCasiers, setQuantiteCasiers] = useState("0");
  const [quantiteBouteilles, setQuantiteBouteilles] = useState("0");
  const [montant, setMontant] = useState("0");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const titres: Record<TypeMouvementConsigne, string> = {
    sortie_consigne: "Sortie de casiers consignés",
    retour_consigne: "Retour de casiers vides",
    rachat_consigne: "Solder une consigne",
  };

  async function gererSoumission() {
    if (!clientId) {
      setErreur("Sélectionne un client.");
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      await enregistrerMouvementConsigne(
        entrepriseId,
        clientId,
        articleId || null,
        type,
        Number(quantiteCasiers) || 0,
        Number(quantiteBouteilles) || 0,
        Number(montant) || 0,
        utilisateurId
      );
      onEnregistre();
      onFerme();
    } catch (e: any) {
      setErreur(e.message || "Erreur lors de l'enregistrement.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-stone-900/40" onClick={onFerme} />
      <div className="relative bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-stone-900">{titres[type]}</h2>
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
            <option value="">Choisir un client...</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500">Article (optionnel)</label>
          <select
            value={articleId}
            onChange={(e) => setArticleId(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm bg-white"
          >
            <option value="">—</option>
            {articles.map((a) => (
              <option key={a.id} value={a.id}>
                {a.designation}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-stone-500">Nb. casiers</label>
            <input
              type="number"
              value={quantiteCasiers}
              onChange={(e) => setQuantiteCasiers(e.target.value)}
              className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-stone-500">Nb. bouteilles</label>
            <input
              type="number"
              value={quantiteBouteilles}
              onChange={(e) => setQuantiteBouteilles(e.target.value)}
              className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500">
            Montant (F) {type === "sortie_consigne" ? "— consigne encaissée" : "— consigne remboursée"}
          </label>
          <input
            type="number"
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
          />
        </div>
        {erreur && <p className="text-sm text-red-600">{erreur}</p>}
        <button
          onClick={gererSoumission}
          disabled={enCours}
          className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-2.5 rounded-xl disabled:opacity-60"
        >
          {enCours ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}

// =====================================================================
// ONGLET CASSES
// =====================================================================

function OngletCasses() {
  const { entreprise, utilisateur } = useAuth();
  const [articles, setArticles] = useState<Article[]>([]);
  const [casses, setCasses] = useState<Casse[]>([]);
  const [chargement, setChargement] = useState(true);
  const [modaleOuverte, setModaleOuverte] = useState(false);

  useEffect(() => {
    Promise.all([listerArticles(), listerCasses()])
      .then(([a, c]) => {
        setArticles(a);
        setCasses(c);
      })
      .finally(() => setChargement(false));
  }, []);

  if (chargement) return <p className="text-stone-400 text-sm p-4">Chargement...</p>;

  const totalPertes = casses.reduce((s, c) => s + c.valeur_perte, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-stone-400">Total des pertes enregistrées</p>
          <p className="font-display text-xl font-bold text-red-600">{formatFCFA(totalPertes)}</p>
        </div>
        <button
          onClick={() => setModaleOuverte(true)}
          className="flex items-center gap-1.5 bg-stone-900 text-white text-sm font-medium px-3.5 py-2 rounded-lg"
        >
          <PackageX size={15} /> Déclarer une casse
        </button>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
        {casses.map((c) => (
          <div key={c.id} className="flex items-center justify-between p-3.5">
            <div>
              <p className="text-sm font-medium text-stone-900">{c.article?.designation}</p>
              <p className="text-xs text-stone-400">
                {c.quantite_casiers > 0 && `${c.quantite_casiers} casier(s)`}
                {c.quantite_casiers > 0 && c.quantite_bouteilles > 0 && " · "}
                {c.quantite_bouteilles > 0 && `${c.quantite_bouteilles} bouteille(s)`}
                {c.motif ? ` · ${c.motif}` : ""}
              </p>
            </div>
            <span className="text-sm font-medium text-red-600">{formatFCFA(c.valeur_perte)}</span>
          </div>
        ))}
        {casses.length === 0 && (
          <p className="p-4 text-center text-stone-400 text-sm">Aucune casse déclarée.</p>
        )}
      </div>

      {modaleOuverte && entreprise && (
        <ModaleCasse
          articles={articles}
          entrepriseId={entreprise.id}
          utilisateurId={utilisateur?.id || null}
          onFerme={() => setModaleOuverte(false)}
          onEnregistre={async () => setCasses(await listerCasses())}
        />
      )}
    </div>
  );
}

function ModaleCasse({
  articles,
  entrepriseId,
  utilisateurId,
  onFerme,
  onEnregistre,
}: {
  articles: Article[];
  entrepriseId: string;
  utilisateurId: string | null;
  onFerme: () => void;
  onEnregistre: () => void;
}) {
  const [articleId, setArticleId] = useState("");
  const [quantiteBouteilles, setQuantiteBouteilles] = useState("0");
  const [quantiteCasiers, setQuantiteCasiers] = useState("0");
  const [motif, setMotif] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function gererSoumission() {
    if (!articleId) {
      setErreur("Sélectionne un article.");
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      await enregistrerCasse(
        entrepriseId,
        articleId,
        Number(quantiteBouteilles) || 0,
        Number(quantiteCasiers) || 0,
        motif || null,
        utilisateurId
      );
      onEnregistre();
      onFerme();
    } catch (e: any) {
      setErreur(e.message || "Erreur lors de l'enregistrement de la casse.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-stone-900/40" onClick={onFerme} />
      <div className="relative bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-stone-900">Déclarer une casse</h2>
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
                {a.designation}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-stone-500">Casiers cassés</label>
            <input
              type="number"
              value={quantiteCasiers}
              onChange={(e) => setQuantiteCasiers(e.target.value)}
              className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-stone-500">Bouteilles cassées</label>
            <input
              type="number"
              value={quantiteBouteilles}
              onChange={(e) => setQuantiteBouteilles(e.target.value)}
              className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500">Motif</label>
          <input
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Chute pendant le déchargement..."
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
          />
        </div>
        {erreur && <p className="text-sm text-red-600">{erreur}</p>}
        <button
          onClick={gererSoumission}
          disabled={enCours}
          className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-2.5 rounded-xl disabled:opacity-60"
        >
          {enCours ? "Enregistrement..." : "Déclarer la casse"}
        </button>
      </div>
    </div>
  );
}

// =====================================================================
// ONGLET ARTICLES CONSIGNES (configuration)
// =====================================================================

function OngletArticlesConsignes() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [chargement, setChargement] = useState(true);
  const [articleAConfigurer, setArticleAConfigurer] = useState<Article | null>(null);

  useEffect(() => {
    listerArticles()
      .then(setArticles)
      .finally(() => setChargement(false));
  }, []);

  if (chargement) return <p className="text-stone-400 text-sm p-4">Chargement...</p>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-stone-400">
        Active la gestion de consigne sur les articles vendus en casiers pour pouvoir
        enregistrer des sorties, retours et casses les concernant.
      </p>
      <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
        {articles.map((a) => (
          <div key={a.id} className="flex items-center justify-between p-3.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-stone-900 truncate">{a.designation}</p>
              <p className="text-xs text-stone-400">
                {a.gestion_consigne
                  ? `Consigne active${a.capacite_casier ? ` · ${a.capacite_casier} btl/casier` : ""}`
                  : "Consigne non configurée"}
              </p>
            </div>
            <button
              onClick={() => setArticleAConfigurer(a)}
              className="flex items-center gap-1 text-xs font-medium text-stone-600 border border-stone-300 px-2.5 py-1.5 rounded-lg shrink-0"
            >
              <Settings2 size={13} /> Configurer
            </button>
          </div>
        ))}
        {articles.length === 0 && (
          <p className="p-4 text-center text-stone-400 text-sm">Aucun article. Ajoute d'abord tes articles dans Stock.</p>
        )}
      </div>

      {articleAConfigurer && (
        <ModaleConfigurationConsigne
          article={articleAConfigurer}
          onFerme={() => setArticleAConfigurer(null)}
          onEnregistre={(champs) =>
            setArticles((prev) =>
              prev.map((a) => (a.id === articleAConfigurer.id ? { ...a, ...champs } : a))
            )
          }
        />
      )}
    </div>
  );
}

function ModaleConfigurationConsigne({
  article,
  onFerme,
  onEnregistre,
}: {
  article: Article;
  onFerme: () => void;
  onEnregistre: (champs: Partial<Article>) => void;
}) {
  const [gestionConsigne, setGestionConsigne] = useState(article.gestion_consigne);
  const [capaciteCasier, setCapaciteCasier] = useState(String(article.capacite_casier ?? ""));
  const [prixConsigneCasier, setPrixConsigneCasier] = useState(String(article.prix_consigne_casier ?? ""));
  const [prixConsigneBouteille, setPrixConsigneBouteille] = useState(
    String(article.prix_consigne_bouteille ?? "")
  );
  const [enCours, setEnCours] = useState(false);

  async function gererSoumission() {
    setEnCours(true);
    const champs: Partial<Article> = {
      gestion_consigne: gestionConsigne,
      capacite_casier: capaciteCasier ? Number(capaciteCasier) : null,
      prix_consigne_casier: prixConsigneCasier ? Number(prixConsigneCasier) : null,
      prix_consigne_bouteille: prixConsigneBouteille ? Number(prixConsigneBouteille) : null,
    };
    await modifierArticle(article.id, champs);
    onEnregistre(champs);
    onFerme();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-stone-900/40" onClick={onFerme} />
      <div className="relative bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-stone-900">{article.designation}</h2>
          <button type="button" onClick={onFerme} className="text-stone-400">
            <X size={20} />
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            checked={gestionConsigne}
            onChange={(e) => setGestionConsigne(e.target.checked)}
            className="w-4 h-4"
          />
          Gérer la consigne pour cet article
        </label>
        {gestionConsigne && (
          <>
            <div>
              <label className="text-xs font-medium text-stone-500">Bouteilles par casier plein</label>
              <input
                type="number"
                value={capaciteCasier}
                onChange={(e) => setCapaciteCasier(e.target.value)}
                className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-stone-500">Consigne / casier (F)</label>
                <input
                  type="number"
                  value={prixConsigneCasier}
                  onChange={(e) => setPrixConsigneCasier(e.target.value)}
                  className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-stone-500">Consigne / bouteille (F)</label>
                <input
                  type="number"
                  value={prixConsigneBouteille}
                  onChange={(e) => setPrixConsigneBouteille(e.target.value)}
                  className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
                />
              </div>
            </div>
          </>
        )}
        <button
          onClick={gererSoumission}
          disabled={enCours}
          className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-2.5 rounded-xl disabled:opacity-60"
        >
          {enCours ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
