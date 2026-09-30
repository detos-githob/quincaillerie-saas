/**
 * Ticket « Z de caisse » de l'en-tête : il s'imprime ligne par ligne,
 * puis le tampon « Écart 0 F » s'applique. Seule animation de la page ;
 * désactivée si l'utilisateur a demandé à réduire les animations.
 */
const LIGNES: { libelle: string; montant: string; fort?: boolean; separateur?: boolean }[] = [
  { libelle: "Fond de caisse", montant: "25 000" },
  { libelle: "Ventes espèces", montant: "+ 186 500" },
  { libelle: "Créances encaissées", montant: "+ 40 000" },
  { libelle: "Cotisations tontine", montant: "+ 12 000" },
  { libelle: "Dépenses", montant: "− 7 500" },
  { libelle: "Doit être en caisse", montant: "256 000", fort: true, separateur: true },
  { libelle: "Compté", montant: "256 000", fort: true },
];

export function TicketCaisse() {
  return (
    <div className="ticket-scene" aria-label="Exemple de clôture de caisse : écart de 0 franc">
      <style>{`
        .ticket-scene { position: relative; width: min(100%, 330px); }
        .ticket {
          position: relative;
          background: #FCFAF3;
          color: #1C1917;
          font-family: ui-monospace, "Cascadia Mono", "Segoe UI Mono", Menlo, Consolas, monospace;
          font-size: 13px;
          line-height: 1.55;
          padding: 22px 20px 74px;
          box-shadow: 0 30px 60px -20px rgba(0,0,0,.55);
          transform: rotate(-2deg);
          /* Bord déchiré du papier thermique */
          -webkit-mask: linear-gradient(#000 0 0) top/100% calc(100% - 10px) no-repeat,
            conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) bottom/16px 10px repeat-x;
                  mask: linear-gradient(#000 0 0) top/100% calc(100% - 10px) no-repeat,
            conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) bottom/16px 10px repeat-x;
        }
        .ticket-ligne { display: flex; justify-content: space-between; gap: 12px; white-space: nowrap; }
        .ticket-sep { border-top: 1px dashed #A8A29E; margin: 8px 0; }
        .tampon {
          position: absolute; left: 50%; bottom: 22px; white-space: nowrap;
          border: 3px solid #0F7A4B; color: #0F7A4B; border-radius: 6px;
          padding: 4px 10px; font-weight: 700; font-size: 15px; letter-spacing: .02em;
          transform: translateX(-50%) rotate(-6deg); background: rgba(252,250,243,.85);
          font-family: inherit;
        }
        @media (prefers-reduced-motion: no-preference) {
          .ticket { animation: imprimer 1.1s cubic-bezier(.2,.7,.2,1) both; }
          .ticket-ligne, .ticket-sep, .ticket-entete { opacity: 0; animation: apparaitre .25s ease-out forwards; }
          .tampon { opacity: 0; animation: tamponner .35s cubic-bezier(.3,1.6,.5,1) forwards; animation-delay: 2.9s; }
          @keyframes imprimer { from { clip-path: inset(0 0 100% 0); } to { clip-path: inset(0 0 0 0); } }
          @keyframes apparaitre { to { opacity: 1; } }
          @keyframes tamponner { from { opacity: 0; transform: translateX(-50%) rotate(-6deg) scale(1.8); } to { opacity: 1; transform: translateX(-50%) rotate(-6deg) scale(1); } }
        }
      `}</style>
      <div className="ticket">
        <div className="ticket-entete text-center" style={{ animationDelay: "0.3s" }}>
          <p style={{ fontWeight: 700 }}>QUINCAILLERIE LA PERSÉVÉRANCE</p>
          <p>Clôture du jour — Z n° 214</p>
          <p style={{ color: "#78716C" }}>Mardi 29/09 · 19:42</p>
        </div>
        <div className="ticket-sep" style={{ animationDelay: "0.5s" }} />
        {LIGNES.map((l, i) => (
          <div key={l.libelle}>
            {l.separateur && <div className="ticket-sep" style={{ animationDelay: `${0.6 + i * 0.28}s` }} />}
            <div
              className="ticket-ligne"
              style={{ animationDelay: `${0.65 + i * 0.28}s`, fontWeight: l.fort ? 700 : 400 }}
            >
              <span>{l.libelle}</span>
              <span>{l.montant}</span>
            </div>
          </div>
        ))}
        <div className="ticket-sep" style={{ animationDelay: "2.7s" }} />
        <div className="ticket-ligne" style={{ animationDelay: "2.75s" }}>
          <span>Écart</span>
          <span style={{ fontWeight: 700 }}>0 F</span>
        </div>
        <div className="tampon">CAISSE JUSTE</div>
      </div>
    </div>
  );
}
