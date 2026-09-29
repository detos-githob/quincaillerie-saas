import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import logoAkweo from "../../assets/logo-akweo.png";

/**
 * Mise en page commune des écrans publics (connexion, inscription,
 * mot de passe oublié...) : logo Akweo sur son bandeau bleu nuit, titre,
 * puis le contenu (généralement la carte du formulaire).
 */
export function AuthLayout({
  titre,
  sousTitre,
  children,
}: {
  titre: string;
  sousTitre?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4 py-10 font-body">
      <PolicesAkweo />
      <div className="w-full max-w-sm">
        <Link
          to="/login"
          className="block bg-navy rounded-2xl px-6 py-5 mb-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          aria-label="Akweo — retour à la connexion"
        >
          <img src={logoAkweo} alt="Akweo" className="h-24 w-auto mx-auto" />
        </Link>
        <div className="text-center mb-6">
          <h1 className="font-display text-3xl font-bold text-stone-900">{titre}</h1>
          {sousTitre && <p className="text-stone-500 text-sm mt-1">{sousTitre}</p>}
        </div>
        {children}
        <p className="text-center text-xs text-stone-400 mt-6">
          <Link to="/conditions-generales" className="hover:text-stone-600 underline-offset-2 hover:underline">
            Conditions générales d'utilisation
          </Link>
        </p>
      </div>
    </div>
  );
}

export function PolicesAkweo() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
      .font-display { font-family: 'Barlow Condensed', sans-serif; }
      .font-body { font-family: 'Inter', sans-serif; }
    `}</style>
  );
}
