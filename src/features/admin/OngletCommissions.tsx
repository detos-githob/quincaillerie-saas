import { useEffect, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { listerCommissionsAdmin, marquerCommissionsPayees, type CommissionAdmin } from "../../services/promotionsService";

function f(n: number): string {
  return Math.round(Number(n) || 0).toLocaleString("fr-FR") + " F";
}

export function OngletCommissions() {
  const [commissions, setCommissions] = useState<CommissionAdmin[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtreAgent, setFiltreAgent] = useState("tous");
  const [filtreStatut, setFiltreStatut] = useState<"due" | "payee" | "toutes">("due");
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [enCours, setEnCours] = useState(false);

  const charger = () =>
    listerCommissionsAdmin()
      .then((c) => {
        setCommissions(c);
        setSelection(new Set());
      })
      .catch((e) => setErreur(e.message));
  useEffect(() => {
    charger();
  }, []);

  const agents = useMemo(() => {
    const m = new Map<string, { nom: string; due: number; payee: number }>();
    for (const c of commissions ?? []) {
      const a = m.get(c.agent_id) ?? { nom: c.agent, due: 0, payee: 0 };
      if (c.statut === "due") a.due += Number(c.montant);
      else a.payee += Number(c.montant);
      m.set(c.agent_id, a);
    }
    return [...m.entries()].sort((a, b) => b[1].due - a[1].due);
  }, [commissions]);

  const visibles = (commissions ?? []).filter(
    (c) => (filtreAgent === "tous" || c.agent_id === filtreAgent) && (filtreStatut === "toutes" || c.statut === filtreStatut)
  );
  const totalSelection = visibles.filter((c) => selection.has(c.id)).reduce((s, c) => s + Number(c.montant), 0);

  async function payer() {
    if (!window.confirm(`Marquer ${selection.size} commission(s) comme payée(s), pour ${f(totalSelection)} ?`)) return;
    setEnCours(true);
    try {
      await marquerCommissionsPayees([...selection]);
      await charger();
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnCours(false);
    }
  }

  if (erreur) return <p className="text-sm text-red-600">{erreur}</p>;
  if (!commissions) return <p className="text-sm text-stone-400">Chargement...</p>;

  return (
    <div className="space-y-5">
      <p className="text-sm text-stone-600">
        Une commission est créée automatiquement à chaque paiement confirmé fait avec le code d'un agent. Après avoir
        versé l'argent à l'agent, coche les commissions et marque-les payées : il le verra dans son espace.
      </p>

      {agents.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {agents.map(([id, a]) => (
            <button
              key={id}
              onClick={() => setFiltreAgent(filtreAgent === id ? "tous" : id)}
              className={`text-left bg-white border rounded-xl p-4 ${filtreAgent === id ? "border-navy ring-1 ring-navy" : "border-stone-200"}`}
            >
              <p className="font-medium text-stone-900">{a.nom}</p>
              <p className="font-display text-2xl font-bold tabular-nums text-stone-900 mt-1">{f(a.due)}</p>
              <p className="text-xs text-stone-400">à payer · {f(a.payee)} déjà payés</p>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["due", "À payer"],
            ["payee", "Payées"],
            ["toutes", "Toutes"],
          ] as const
        ).map(([v, l]) => (
          <button
            key={v}
            onClick={() => setFiltreStatut(v)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border ${filtreStatut === v ? "bg-navy text-white border-navy" : "bg-white text-stone-600 border-stone-300"}`}
          >
            {l}
          </button>
        ))}
        {filtreAgent !== "tous" && (
          <button onClick={() => setFiltreAgent("tous")} className="text-sm text-amber-700 ml-1">
            Tous les agents
          </button>
        )}
      </div>

      <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
        {visibles.map((c) => (
          <label key={c.id} className="flex items-center gap-3 px-4 py-3">
            {c.statut === "due" ? (
              <input
                type="checkbox"
                className="h-4 w-4 accent-amber-500"
                checked={selection.has(c.id)}
                onChange={(e) =>
                  setSelection((s) => {
                    const n = new Set(s);
                    if (e.target.checked) n.add(c.id);
                    else n.delete(c.id);
                    return n;
                  })
                }
              />
            ) : (
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-stone-900 truncate">
                {c.entreprise} <span className="text-stone-400">· {c.agent}</span>
              </p>
              <p className="text-xs text-stone-400">
                {new Date(c.created_at).toLocaleDateString("fr-FR")} · {Number(c.taux)} % de {f(c.montant_base)}
                {c.payee_le ? ` · payée le ${new Date(c.payee_le).toLocaleDateString("fr-FR")}` : ""}
              </p>
            </div>
            <span className="text-sm font-semibold tabular-nums text-stone-900">{f(c.montant)}</span>
          </label>
        ))}
        {visibles.length === 0 && <p className="p-5 text-center text-sm text-stone-400">Aucune commission.</p>}
      </div>

      {selection.size > 0 && (
        <div className="sticky bottom-20 sm:bottom-4 bg-navy text-white rounded-xl p-3 flex items-center justify-between gap-3 shadow-xl">
          <span className="text-sm">
            {selection.size} sélectionnée{selection.size > 1 ? "s" : ""} · <strong className="tabular-nums">{f(totalSelection)}</strong>
          </span>
          <button onClick={payer} disabled={enCours} className="bg-amber-500 text-stone-900 font-semibold text-sm px-4 py-2 rounded-lg disabled:opacity-60">
            {enCours ? "..." : "Marquer payées"}
          </button>
        </div>
      )}
    </div>
  );
}
