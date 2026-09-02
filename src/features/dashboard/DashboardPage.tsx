import { useEffect, useMemo, useState } from "react";
import {
  Package,
  AlertTriangle,
  TrendingUp,
  Users,
  CircleCheck,
} from "lucide-react";
import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../hooks/useAuth";
import { listerArticles, articlesEnAlerte } from "../../services/articlesService";
import { listerClients, clientsAvecCreanceEnRetard } from "../../services/clientsService";
import type { Article, Client } from "../../types";

function formatFCFA(montant: number): string {
  return Math.round(montant).toLocaleString("fr-FR") + " F";
}

const NOMS_JOURS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

export function DashboardPage() {
  const { entreprise } = useAuth();
  const [chargement, setChargement] = useState(true);
  const [ventes7Jours, setVentes7Jours] = useState<{ jour: string; montant: number }[]>([]);
  const [caJour, setCaJour] = useState(0);
  const [nombreVentesJour, setNombreVentesJour] = useState(0);
  const [margeJour, setMargeJour] = useState(0);
  const [articles, setArticles] = useState<Article[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [topArticles, setTopArticles] = useState<{ nom: string; quantite: number; montant: number }[]>([]);

  useEffect(() => {
    if (!entreprise) return;

    async function charger() {
      setChargement(true);

      const ilYA7Jours = new Date();
      ilYA7Jours.setDate(ilYA7Jours.getDate() - 6);
      ilYA7Jours.setHours(0, 0, 0, 0);

      const [{ data: ventes }, articlesData, clientsData, { data: lignesSemaine }] =
        await Promise.all([
          supabase
            .from("ventes")
            .select("montant_total, created_at")
            .eq("entreprise_id", entreprise!.id)
            .gte("created_at", ilYA7Jours.toISOString())
            .neq("statut", "annulee"),
          listerArticles(),
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
      setArticles(articlesData);
      setClients(clientsData);
      setTopArticles(top);
      setChargement(false);
    }

    charger().catch(console.error);
  }, [entreprise]);

  const enRupture = useMemo(() => articles.filter((a) => a.stock_actuel <= 0), [articles]);
  const enAlerte = useMemo(
    () => articlesEnAlerte(articles).filter((a) => a.stock_actuel > 0),
    [articles]
  );
  const creances = useMemo(() => clientsAvecCreanceEnRetard(clients), [clients]);
  const totalCreances = creances.reduce((s, c) => s + c.solde_credit, 0);

  const nombreCritiques = enRupture.length;
  const statutSante = nombreCritiques > 0 ? "attention" : "bon";

  if (chargement) {
    return <div className="p-6 text-stone-400 text-sm">Chargement du tableau de bord...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-5 space-y-5">
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
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <p className="text-xs text-stone-500">Marge du jour</p>
          <p className="font-display text-2xl font-bold text-stone-900 mt-1">{formatFCFA(margeJour)}</p>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <p className="text-xs text-stone-500">Ventes enregistrées</p>
          <p className="font-display text-2xl font-bold text-stone-900 mt-1">{nombreVentesJour}</p>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <p className="text-xs text-stone-500">Créances en cours</p>
          <p className="font-display text-2xl font-bold text-stone-900 mt-1">{formatFCFA(totalCreances)}</p>
        </div>
      </div>

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
          <p className="font-display text-lg font-bold text-stone-900 mb-3">Alertes stock</p>
          <div className="space-y-2">
            {enRupture.map((a) => (
              <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg border bg-red-50 border-red-200">
                <Package size={17} className="mt-0.5 shrink-0 text-red-500" />
                <div>
                  <p className="text-sm font-semibold text-red-700">{a.designation}</p>
                  <p className="text-xs text-stone-500">Rupture de stock</p>
                </div>
              </div>
            ))}
            {enAlerte.map((a) => (
              <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg border bg-amber-50 border-amber-200">
                <Package size={17} className="mt-0.5 shrink-0 text-amber-500" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">{a.designation}</p>
                  <p className="text-xs text-stone-500">
                    Il reste {a.stock_actuel} {a.unite} — seuil {a.seuil_alerte}
                  </p>
                </div>
              </div>
            ))}
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
            {enRupture.length === 0 && enAlerte.length === 0 && creances.length === 0 && (
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
