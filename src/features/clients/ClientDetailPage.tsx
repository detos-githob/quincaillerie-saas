import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, TrendingUp, TrendingDown } from "lucide-react";
import { obtenirClient, listerMouvementsCreance } from "../../services/clientsService";
import { LABELS_TYPE_MOUVEMENT_CREANCE } from "../../types";
import type { Client, MouvementCreance } from "../../types";

function formatFCFA(montant: number): string {
  return Math.round(montant).toLocaleString("fr-FR") + " F";
}

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [mouvements, setMouvements] = useState<MouvementCreance[]>([]);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([obtenirClient(id), listerMouvementsCreance(id)])
      .then(([c, m]) => {
        setClient(c);
        setMouvements(m);
      })
      .finally(() => setChargement(false));
  }, [id]);

  if (chargement) {
    return <div className="p-6 text-stone-400 text-sm">Chargement...</div>;
  }
  if (!client) {
    return <div className="p-6 text-stone-400 text-sm">Client introuvable.</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-5 pb-10">
      <button
        onClick={() => navigate("/clients")}
        className="flex items-center gap-1.5 text-sm text-stone-500 mb-3"
      >
        <ArrowLeft size={15} /> Retour aux clients
      </button>

      <h1 className="font-display text-2xl font-bold text-stone-900 mb-1">{client.nom}</h1>
      <p className="text-sm text-stone-500 mb-4">{client.telephone || "—"}</p>

      <div className="bg-white border border-stone-200 rounded-xl p-4 mb-5">
        <p className="text-xs text-stone-500">Créance actuelle</p>
        <p className={`font-display text-3xl font-bold mt-0.5 ${client.solde_credit > 0 ? "text-red-600" : "text-stone-900"}`}>
          {formatFCFA(client.solde_credit)}
        </p>
      </div>

      <p className="font-display text-lg font-bold text-stone-900 mb-2">Grand livre — historique complet</p>
      <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
        {mouvements.map((m) => {
          const augmente = m.montant > 0;
          return (
            <div key={m.id} className="flex items-center justify-between p-3.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`flex items-center justify-center w-7 h-7 rounded-full shrink-0 ${
                    augmente ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                  }`}
                >
                  {augmente ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-stone-900 truncate">
                    {LABELS_TYPE_MOUVEMENT_CREANCE[m.type_mouvement]}
                  </p>
                  <p className="text-xs text-stone-400 truncate">
                    {m.motif || "—"} · {new Date(m.created_at).toLocaleDateString("fr-FR")}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0 ml-2">
                <p className={`text-sm font-semibold ${augmente ? "text-red-600" : "text-emerald-600"}`}>
                  {augmente ? "+" : ""}
                  {formatFCFA(m.montant)}
                </p>
                <p className="text-[11px] text-stone-400">solde : {formatFCFA(m.solde_apres)}</p>
              </div>
            </div>
          );
        })}
        {mouvements.length === 0 && (
          <p className="p-6 text-center text-stone-400 text-sm">Aucun mouvement de créance pour ce client.</p>
        )}
      </div>
    </div>
  );
}
