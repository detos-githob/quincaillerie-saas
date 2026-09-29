import type { ReactNode } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { LABELS_CATEGORIE_DEPENSE } from "../../types";
import type { CategorieDepense, SyntheseCloture as Synthese, TypeCloture } from "../../types";
import { dateDepuisIso, formatEcart, formatF } from "./formatCloture";

function Ligne({ label, valeur, attenue, fort }: { label: ReactNode; valeur: ReactNode; attenue?: boolean; fort?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 text-sm ${attenue ? "text-stone-400" : "text-stone-600"}`}>
      <span>{label}</span>
      <span className={`tabular-nums text-right ${fort ? "font-semibold text-stone-900" : attenue ? "" : "text-stone-800"}`}>{valeur}</span>
    </div>
  );
}

function Bloc({ titre, children, pied }: { titre: string; children: ReactNode; pied?: ReactNode }) {
  return (
    <section className="bg-white border border-stone-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-stone-900 mb-1">{titre}</h3>
      <div className="divide-y divide-stone-100">{children}</div>
      {pied}
    </section>
  );
}

/** N'affiche une ligne que si elle porte une valeur (évite les murs de zéros). */
function si(valeur: number, noeud: ReactNode) {
  return Math.round(valeur) !== 0 ? noeud : null;
}

export function SyntheseCloture({ synthese: s, type }: { synthese: Synthese; type: TypeCloture }) {
  const categories = Object.entries(s.depenses.par_categorie ?? {}) as [CategorieDepense, number][];
  const resultat = s.resultat.resultat_estime;

  return (
    <div className="space-y-3">
      {/* Indicateurs clés */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "Chiffre d'affaires net", valeur: formatF(s.resultat.chiffre_affaires_net) },
          { label: "Marge brute", valeur: formatF(s.resultat.marge_brute) },
          { label: "Charges", valeur: formatF(s.resultat.charges) },
          {
            label: "Résultat estimé",
            valeur: formatF(resultat),
            couleur: resultat > 0 ? "text-emerald-700" : resultat < 0 ? "text-red-600" : "text-stone-900",
          },
        ].map((k) => (
          <div key={k.label} className="bg-white border border-stone-200 rounded-xl px-3 py-2.5">
            <p className="text-[11px] text-stone-500">{k.label}</p>
            <p className={`font-display text-xl font-bold tabular-nums ${k.couleur ?? "text-stone-900"}`}>{k.valeur}</p>
          </div>
        ))}
      </div>

      {type === "annee" && s.par_mois && s.par_mois.length > 0 && (
        <section className="bg-white border border-stone-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-stone-900 mb-2">Mois par mois</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={s.par_mois.map((m) => ({
                  mois: dateDepuisIso(m.mois).toLocaleDateString("fr-FR", { month: "short" }),
                  ca: Number(m.chiffre_affaires_net),
                  resultat: Number(m.resultat_estime),
                }))}
                margin={{ top: 4, right: 4, left: 4, bottom: 0 }}
              >
                <CartesianGrid vertical={false} stroke="#f5f5f4" />
                <XAxis dataKey="mois" tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: "#a8a29e" }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                  tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                />
                <Tooltip formatter={(v) => formatF(Number(v))} cursor={{ fill: "#f5f5f4" }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="ca" name="CA net" fill="#0E1424" radius={[3, 3, 0, 0]} />
                <Bar dataKey="resultat" name="Résultat" fill="#ECA71E" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <Bloc titre={`Ventes (${s.ventes.nombre})`}>
          <Ligne label="Total des ventes" valeur={formatF(s.ventes.total)} fort />
          <Ligne label="Payées en espèces" valeur={formatF(s.ventes.especes)} />
          <Ligne label="Payées en Mobile Money" valeur={formatF(s.ventes.mobile_money)} />
          <Ligne label="À crédit" valeur={formatF(s.ventes.a_credit)} />
          {si(s.avoirs.total, <Ligne label={`Avoirs émis (${s.avoirs.nombre})`} valeur={`− ${formatF(s.avoirs.total)}`} />)}
          {s.ventes.nombre_annulees > 0 && (
            <Ligne label="Dont ventes annulées depuis" valeur={s.ventes.nombre_annulees} attenue />
          )}
        </Bloc>

        <Bloc titre="Autres encaissements">
          <Ligne
            label={`Créances clients (${s.encaissements_creances.nombre})`}
            valeur={formatF(s.encaissements_creances.total)}
          />
          <Ligne label={`Cotisations tontine (${s.tontine.nombre})`} valeur={formatF(s.tontine.total)} />
          {si(s.consignes.rachats, <Ligne label="Rachats de consignes" valeur={formatF(s.consignes.rachats)} />)}
          {s.tontine.tontines_soldees > 0 && (
            <Ligne label="Tontines soldées par retrait" valeur={s.tontine.tontines_soldees} attenue />
          )}
        </Bloc>

        <Bloc titre="Sorties d'argent">
          {categories.length === 0 && s.personnel.total === 0 && s.avoirs.especes + s.avoirs.mobile_money === 0 ? (
            <Ligne label="Aucune dépense" valeur="—" attenue />
          ) : (
            <>
              {categories.map(([cat, montant]) => (
                <Ligne key={cat} label={LABELS_CATEGORIE_DEPENSE[cat] ?? cat} valeur={formatF(montant)} />
              ))}
              {si(s.personnel.total, <Ligne label={`Personnel (${s.personnel.nombre})`} valeur={formatF(s.personnel.total)} />)}
              {si(
                s.avoirs.especes + s.avoirs.mobile_money,
                <Ligne label="Remboursements (avoirs)" valeur={formatF(s.avoirs.especes + s.avoirs.mobile_money)} />
              )}
            </>
          )}
          {si(s.casses, <Ligne label="Casses (valeur d'achat)" valeur={formatF(s.casses)} attenue />)}
        </Bloc>

        <Bloc titre="Mouvements de trésorerie">
          <Ligne label="Espèces entrées" valeur={formatF(s.tresorerie.especes.entrees)} />
          <Ligne label="Espèces sorties" valeur={`− ${formatF(s.tresorerie.especes.sorties)}`} />
          <Ligne label="Solde espèces" valeur={formatEcart(s.tresorerie.especes.flux)} fort />
          <Ligne label="Mobile Money net" valeur={formatEcart(s.tresorerie.mobile_money.flux)} fort />
        </Bloc>

        {s.etat && (
          <Bloc
            titre="Situation à la date de clôture"
            pied={
              s.journees && (
                <p className="text-xs text-stone-400 mt-2">
                  {s.journees.nombre} journée{s.journees.nombre > 1 ? "s" : ""} clôturée{s.journees.nombre > 1 ? "s" : ""} ·
                  écarts de caisse cumulés {formatEcart(s.journees.ecart_total)}
                </p>
              )
            }
          >
            <Ligne label="Créances clients à recouvrer" valeur={formatF(s.etat.creances_clients)} />
            <Ligne label="Épargne tontine due aux clients" valeur={formatF(s.etat.epargne_tontine)} />
            <Ligne label="Valeur du stock (prix d'achat)" valeur={formatF(s.etat.valeur_stock_achat)} />
          </Bloc>
        )}

        {s.etat && s.etat.top_articles.length > 0 && (
          <Bloc titre="Articles les plus vendus">
            {s.etat.top_articles.map((a) => (
              <Ligne
                key={a.designation}
                label={
                  <span>
                    {a.designation} <span className="text-stone-400">× {Number(a.quantite).toLocaleString("fr-FR")}</span>
                  </span>
                }
                valeur={formatF(a.montant)}
              />
            ))}
          </Bloc>
        )}
      </div>

      <p className="text-xs text-stone-400">
        Le résultat estimé = marge sur les ventes − dépenses − salaires − casses. Les cotisations tontine sont une
        épargne due aux clients : elles entrent en caisse mais pas dans le chiffre d'affaires.
      </p>
    </div>
  );
}
