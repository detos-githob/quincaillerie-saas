import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Package,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Users,
  CircleCheck,
  Handshake,
  Beer,
  Bell,
  CalendarClock,
  PackageX,
} from "lucide-react";
import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../hooks/useAuth";
import { listerClients, clientsAvecCreanceEnRetard } from "../../services/clientsService";
import { calculerStatutAbonnement, STYLES_STATUT_ABONNEMENT } from "../../lib/abonnement";
import type { Alerte, Article, Client } from "../../types";

function formatFCFA(montant: number): string {
  return Math.round(montant).toLocaleString("fr-FR") + " F";
}

const NOMS_JOURS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

const ICONES_ALERTE: Record<string, typeof Package> = {
  rupture: Package,
  stock_bas: Package,
  marge_faible: TrendingDown,
};

export function DashboardPage() {
  const { entreprise, utilisateur } = useAuth();
  const peutVoirMarge = utilisateur?.role !== "vendeur";
  const [chargement, setChargement] = useState(true);
  const [ventes7Jours, setVentes7Jours] = useState<{ jour: string; montant: number }[]>([]);
  const [caJour, setCaJour] = useState(0);
  const [nombreVentesJour, setNombreVentesJour] = useState(0);
  const [margeJour, setMargeJour] = useState(0);
  const [alertesStock, setAlertesStock] = useState<Alerte[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [topArticles, setTopArticles] = useState<{ nom: string; quantite: number; montant: number }[]>([]);
  const [detteFournisseurs, setDetteFournisseurs] = useState(0);
  const [commandesFournisseurEnAttente, setCommandesFournisseurEnAttente] = useState(0);
  const [produitsAEvacuer, setProduitsAEvacuer] = useState<Article[]>([]);
  const [produitsExpires, setProduitsExpires] = useState<Article[]>([]);

  useEffect(() => {
    if (!entreprise) return;

    async function charger() {
      setChargement(true);

      const ilYA7Jours = new Date();
      ilYA7Jours.setDate(ilYA7Jours.getDate() - 6);
      ilYA7Jours.setHours(0, 0, 0, 0);

      const [{ data: ventes }, { data: alertesData }, clientsData, { data: lignesSemaine }] =
        await Promise.all([
          supabase
            .from("ventes")
            .select("montant_total, created_at")
            .eq("entreprise_id", entreprise!.id)
            .gte("created_at", ilYA7Jours.toISOString())
            .neq("statut", "annulee"),
          // Les alertes de stock sont désormais générées automatiquement
          // par un trigger PostgreSQL (voir migration_phase2.sql) dès
          // qu'un article passe sous son seuil ou en rupture.
          supabase
            .from("alertes")
            .select("*")
            .eq("entreprise_id", entreprise!.id)
            .eq("lue", false)
            .order("created_at", { ascending: false }),
          listerClients(),
          supabase
            .from("lignes_vente")
            .select(
              "quantite, prix_unitaire, prix_achat_unitaire, remise, montant_ligne, article:articles(designation), vente:ventes!inner(entreprise_id, created_at)"
            )
            .eq("vente.entreprise_id", entreprise!.id)
            .gte("vente.created_at", ilYA7Jours.toISOString()),
        ]);

      // Regroupement des ventes par jour pour le graphique
      const parJour = new Map<string, number>();
      for (let i = 0; i < 7; i++) {
        const d = new Date(ilYA7Jours);
        d.setDate(d.getDate() + i);
        parJour.set(d.toDateString(), 0);
      }
      let totalAujourdhui = 0;
      let nombreAujourdhui = 0;
      const aujourdhui = new Date().toDateString();

      (ventes || []).forEach((v) => {
        const cle = new Date(v.created_at).toDateString();
        parJour.set(cle, (parJour.get(cle) || 0) + Number(v.montant_total));
        if (cle === aujourdhui) {
          totalAujourdhui += Number(v.montant_total);
          nombreAujourdhui++;
        }
      });

      const graphique = Array.from(parJour.entries()).map(([cle, montant]) => {
        const d = new Date(cle);
        const estAujourdhui = cle === aujourdhui;
        return {
          jour: estAujourdhui ? "Auj." : NOMS_JOURS[d.getDay()],
          montant,
        };
      });

      // Marge et top articles de la semaine, à partir des lignes de vente
      let margeAujourdhui = 0;
      const parArticle = new Map<string, { quantite: number; montant: number }>();

      (lignesSemaine || []).forEach((l: any) => {
        const marge =
          (Number(l.prix_unitaire) - Number(l.prix_achat_unitaire)) * Number(l.quantite) -
          Number(l.remise);
        const dateVente = new Date(l.vente.created_at).toDateString();
        if (dateVente === aujourdhui) margeAujourdhui += marge;

        const nomArticle = l.article?.designation || "Article supprimé";
        const existant = parArticle.get(nomArticle) || { quantite: 0, montant: 0 };
        parArticle.set(nomArticle, {
          quantite: existant.quantite + Number(l.quantite),
          montant: existant.montant + Number(l.montant_ligne),
        });
      });

      const top = Array.from(parArticle.entries())
        .map(([nom, v]) => ({ nom, ...v }))
        .sort((a, b) => b.montant - a.montant)
        .slice(0, 5);

      setVentes7Jours(graphique);
      setCaJour(totalAujourdhui);
      setNombreVentesJour(nombreAujourdhui);
      setMargeJour(margeAujourdhui);
      setAlertesStock((alertesData || []) as Alerte[]);
      setClients(clientsData);
      setTopArticles(top);

      // Widget sectoriel : dette fournisseurs, uniquement pour les
      // entreprises du secteur quincaillerie.
      if (entreprise!.secteur_activite === "quincaillerie") {
        const [{ data: fournisseurs }, { count: commandesEnAttente }] = await Promise.all([
          supabase.from("fournisseurs").select("solde_du").eq("entreprise_id", entreprise!.id),
          supabase
            .from("commandes_fournisseur")
            .select("id", { count: "exact", head: true })
            .eq("entreprise_id", entreprise!.id)
            .in("statut", ["envoyee", "receptionnee_partielle"]),
        ]);
        setDetteFournisseurs((fournisseurs || []).reduce((s, f: any) => s + Number(f.solde_du), 0));
        setCommandesFournisseurEnAttente(commandesEnAttente || 0);
      }

      // Widget sectoriel : produits proches de péremption / déjà expirés,
      // uniquement pour les entreprises du secteur alimentation générale.
      if (entreprise!.secteur_activite === "alimentation_generale") {
        const aujourdhuiStr = new Date().toISOString().slice(0, 10);
        const dansTroisMois = new Date();
        dansTroisMois.setMonth(dansTroisMois.getMonth() + 3);
        const dansTroisMoisStr = dansTroisMois.toISOString().slice(0, 10);

        const [{ data: aEvacuer }, { data: expires }] = await Promise.all([
          supabase
            .from("articles")
            .select("*")
            .eq("entreprise_id", entreprise!.id)
            .eq("actif", true)
            .gte("date_expiration", aujourdhuiStr)
            .lte("date_expiration", dansTroisMoisStr)
            .order("date_expiration", { ascending: true }),
          supabase
            .from("articles")
            .select("*")
            .eq("entreprise_id", entreprise!.id)
            .eq("actif", true)
            .lt("date_expiration", aujourdhuiStr)
            .order("date_expiration", { ascending: true }),
        ]);
        setProduitsAEvacuer((aEvacuer || []) as Article[]);
        setProduitsExpires((expires || []) as Article[]);
      }

      setChargement(false);
    }

    charger().catch(console.error);
  }, [entreprise]);

  const creances = useMemo(() => clientsAvecCreanceEnRetard(clients), [clients]);
  const totalCreances = creances.reduce((s, c) => s + c.solde_credit, 0);

  const clientsAvecConsigne = useMemo(
    () => clients.filter((c) => c.solde_consigne_casiers > 0 || c.solde_consigne_bouteilles > 0),
    [clients]
  );
  const totalCasiersConsignes = clientsAvecConsigne.reduce((s, c) => s + c.solde_consigne_casiers, 0);

  const nombreCritiques = alertesStock.filter((a) => a.niveau === "critique").length;
  const statutSante = nombreCritiques > 0 ? "attention" : "bon";

  const [clocheOuverte, setClocheOuverte] = useState(false);
  const infoAbonnement = entreprise ? calculerStatutAbonnement(entreprise) : null;
  const abonnementAAlerter = infoAbonnement?.statut === "alerte" || infoAbonnement?.statut === "expire";

  if (chargement) {
    return <div className="p-6 text-stone-400 text-sm">Chargement du tableau de bord...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-5 space-y-5">
      {/* En-tête avec cloche de notification abonnement */}
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-stone-900">Tableau de bord</h1>
        {infoAbonnement && (
          <div className="relative">
            <button
              onClick={() => setClocheOuverte((v) => !v)}
              className="relative flex items-center justify-center w-10 h-10 rounded-full bg-white border border-stone-200"
            >
              <Bell size={18} className="text-stone-500" />
              {abonnementAAlerter && (
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 border-2 border-white" />
              )}
            </button>
            {clocheOuverte && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setClocheOuverte(false)} />
                <div className="absolute right-0 top-12 z-40 w-72 bg-white rounded-xl shadow-xl border border-stone-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-2">
                    Mon abonnement
                  </p>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-stone-600 capitalize">{entreprise?.plan_abonnement}</span>
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded ${STYLES_STATUT_ABONNEMENT[infoAbonnement.statut].bg} ${STYLES_STATUT_ABONNEMENT[infoAbonnement.statut].texte}`}
                    >
                      {STYLES_STATUT_ABONNEMENT[infoAbonnement.statut].label}
                    </span>
                  </div>
                  <p className="text-sm text-stone-500 mb-3">
                    {infoAbonnement.joursRestants === null &&
                      "Aucune date d'expiration — abonnement illimité."}
                    {infoAbonnement.joursRestants !== null && infoAbonnement.joursRestants >= 0 &&
                      `${infoAbonnement.joursRestants} jour${infoAbonnement.joursRestants > 1 ? "s" : ""} restant${infoAbonnement.joursRestants > 1 ? "s" : ""} avant expiration.`}
                    {infoAbonnement.joursRestants !== null && infoAbonnement.joursRestants < 0 &&
                      `Expiré depuis ${Math.abs(infoAbonnement.joursRestants)} jour${Math.abs(infoAbonnement.joursRestants) > 1 ? "s" : ""}.`}
                  </p>
                  {utilisateur?.role === "gerant" ? (
                    <Link
                      to="/mon-abonnement"
                      onClick={() => setClocheOuverte(false)}
                      className="block text-center bg-stone-900 text-white text-sm font-medium py-2 rounded-lg"
                    >
                      Gérer mon abonnement
                    </Link>
                  ) : (
                    <p className="text-xs text-stone-400">Contacte le gérant pour renouveler.</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Bandeau santé */}
      <div
        className={`rounded-2xl border-2 p-5 flex items-start gap-4 ${
          statutSante === "bon" ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-300"
        }`}
      >
        <span
          className={`flex items-center justify-center w-11 h-11 rounded-full shrink-0 ${
            statutSante === "bon" ? "bg-emerald-500" : "bg-amber-500"
          }`}
        >
          {statutSante === "bon" ? (
            <CircleCheck size={22} className="text-white" />
          ) : (
            <AlertTriangle size={22} className="text-white" />
          )}
        </span>
        <div>
          <p
            className={`font-display text-xl font-bold ${
              statutSante === "bon" ? "text-emerald-800" : "text-amber-900"
            }`}
          >
            {statutSante === "bon" ? "Situation saine" : "Points à surveiller"}
          </p>
          <p className="text-sm text-stone-600 mt-0.5">
            {statutSante === "bon"
              ? "Aucun signal critique aujourd'hui."
              : `${nombreCritiques} article(s) en rupture de stock nécessitent une action.`}
          </p>
        </div>
      </div>

      {/* Indicateurs clés */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <p className="text-xs text-stone-500">Ventes du jour</p>
          <p className="font-display text-2xl font-bold text-stone-900 mt-1">{formatFCFA(caJour)}</p>
        </div>
        {peutVoirMarge && (
          <div className="bg-white border border-stone-200 rounded-xl p-4">
            <p className="text-xs text-stone-500">Marge du jour</p>
            <p className="font-display text-2xl font-bold text-stone-900 mt-1">{formatFCFA(margeJour)}</p>
          </div>
        )}
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <p className="text-xs text-stone-500">Ventes enregistrées</p>
          <p className="font-display text-2xl font-bold text-stone-900 mt-1">{nombreVentesJour}</p>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <p className="text-xs text-stone-500">Créances en cours</p>
          <p className="font-display text-2xl font-bold text-stone-900 mt-1">{formatFCFA(totalCreances)}</p>
        </div>
      </div>

      {/* Widget spécifique au secteur d'activité */}
      {entreprise?.secteur_activite === "quincaillerie" && (
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Handshake size={16} className="text-slate-500" />
            <p className="font-display text-lg font-bold text-stone-900">Fournisseurs</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-stone-500">Dette totale envers tes fournisseurs</p>
              <p className="font-display text-xl font-bold text-stone-900 mt-0.5">
                {formatFCFA(detteFournisseurs)}
              </p>
            </div>
            <div>
              <p className="text-xs text-stone-500">Commandes en attente / partielles</p>
              <p className="font-display text-xl font-bold text-stone-900 mt-0.5">
                {commandesFournisseurEnAttente}
              </p>
            </div>
          </div>
        </div>
      )}

      {entreprise?.secteur_activite === "depot_boissons" && (
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Beer size={16} className="text-slate-500" />
            <p className="font-display text-lg font-bold text-stone-900">Consignes en cours</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-stone-500">Clients avec des casiers à rendre</p>
              <p className="font-display text-xl font-bold text-stone-900 mt-0.5">
                {clientsAvecConsigne.length}
              </p>
            </div>
            <div>
              <p className="text-xs text-stone-500">Total casiers consignés</p>
              <p className="font-display text-xl font-bold text-stone-900 mt-0.5">
                {totalCasiersConsignes}
              </p>
            </div>
          </div>
        </div>
      )}

      {entreprise?.secteur_activite === "alimentation_generale" && (
        <div className="space-y-3">
          <div className="bg-white border border-amber-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <CalendarClock size={16} className="text-amber-600" />
              <p className="font-display text-lg font-bold text-stone-900">
                À évacuer sous 3 mois ({produitsAEvacuer.length})
              </p>
            </div>
            {produitsAEvacuer.length === 0 ? (
              <p className="text-xs text-stone-400">Aucun produit proche de la péremption.</p>
            ) : (
              <div className="divide-y divide-stone-100">
                {produitsAEvacuer.map((a) => (
                  <div key={a.id} className="flex items-center justify-between py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-stone-900 truncate">{a.designation}</p>
                      <p className="text-xs text-stone-400">Stock : {a.stock_actuel} {a.unite}</p>
                    </div>
                    <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 shrink-0">
                      {a.date_expiration && new Date(a.date_expiration).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-red-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <PackageX size={16} className="text-red-600" />
              <p className="font-display text-lg font-bold text-stone-900">
                Produits expirés ({produitsExpires.length})
              </p>
            </div>
            {produitsExpires.length === 0 ? (
              <p className="text-xs text-stone-400">Aucun produit expiré dans le stock.</p>
            ) : (
              <div className="divide-y divide-stone-100">
                {produitsExpires.map((a) => (
                  <div key={a.id} className="flex items-center justify-between py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-stone-900 truncate">{a.designation}</p>
                      <p className="text-xs text-stone-400">Stock : {a.stock_actuel} {a.unite}</p>
                    </div>
                    <span className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 shrink-0">
                      {a.date_expiration && new Date(a.date_expiration).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Graphique */}
      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="font-display text-lg font-bold text-stone-900">Ventes des 7 derniers jours</p>
          <TrendingUp size={16} className="text-emerald-500" />
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={ventes7Jours} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <XAxis dataKey="jour" axisLine={false} tickLine={false} tick={{ fill: "#78716c", fontSize: 12 }} />
            <Tooltip
              cursor={{ fill: "#f5f5f4" }}
              formatter={(v: any) => [formatFCFA(Number(v)), "Ventes"]}
              contentStyle={{ borderRadius: 8, border: "1px solid #e7e5e4", fontSize: 13 }}
            />
            <Bar dataKey="montant" radius={[6, 6, 0, 0]}>
              {ventes7Jours.map((entry, i) => (
                <Cell key={i} fill={entry.jour === "Auj." ? "#f59e0b" : "#e7e5e4"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        {/* Alertes stock */}
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <p className="font-display text-lg font-bold text-stone-900 mb-3">Alertes</p>
          <div className="space-y-2">
            {alertesStock.map((alerte) => {
              const Icone = ICONES_ALERTE[alerte.type_alerte] || AlertTriangle;
              const style =
                alerte.niveau === "critique"
                  ? { bg: "bg-red-50", border: "border-red-200", texte: "text-red-700", icone: "text-red-500" }
                  : alerte.niveau === "warning"
                  ? { bg: "bg-amber-50", border: "border-amber-200", texte: "text-amber-800", icone: "text-amber-500" }
                  : { bg: "bg-slate-50", border: "border-slate-200", texte: "text-slate-700", icone: "text-slate-400" };
              return (
                <div
                  key={alerte.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${style.bg} ${style.border}`}
                >
                  <Icone size={17} className={`mt-0.5 shrink-0 ${style.icone}`} />
                  <p className={`text-sm font-medium ${style.texte}`}>{alerte.message}</p>
                </div>
              );
            })}
            {creances.map((c) => (
              <div key={c.id} className="flex items-start gap-3 p-3 rounded-lg border bg-slate-50 border-slate-200">
                <Users size={17} className="mt-0.5 shrink-0 text-slate-400" />
                <div>
                  <p className="text-sm font-semibold text-slate-700">{c.nom}</p>
                  <p className="text-xs text-stone-500">
                    Créance en cours : {formatFCFA(c.solde_credit)}
                  </p>
                </div>
              </div>
            ))}
            {alertesStock.length === 0 && creances.length === 0 && (
              <p className="text-sm text-stone-400">Aucune alerte pour le moment.</p>
            )}
          </div>
        </div>

        {/* Top articles */}
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <p className="font-display text-lg font-bold text-stone-900 mb-3">
            Meilleures ventes de la semaine
          </p>
          <div className="space-y-1">
            {topArticles.length === 0 && (
              <p className="text-sm text-stone-400">Pas encore de ventes cette semaine.</p>
            )}
            {topArticles.map((article, i) => (
              <div
                key={article.nom}
                className="flex items-center justify-between py-2.5 border-b border-stone-100 last:border-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-display text-base font-bold text-stone-300 w-5">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-900 truncate">{article.nom}</p>
                    <p className="text-xs text-stone-400">{article.quantite} vendus</p>
                  </div>
                </div>
                <span className="font-display text-base font-bold text-stone-900 shrink-0">
                  {formatFCFA(article.montant)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
