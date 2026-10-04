import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import {
  Beer,
  Check,
  Handshake,
  Lock,
  Menu,
  Monitor,
  Package,
  ShieldCheck,
  Smartphone,
  Truck,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import logoAkweo from "../../assets/logo-akweo.png";
import logoMarque from "../../assets/logo-akweo-mark.png";
import { PolicesAkweo } from "../../components/layout/AuthLayout";
import { useInstallation } from "../../hooks/useInstallation";
import { avantagesAffiches, economieAnnuelle, listerOffresPubliques, type OffreAbonnement } from "../../services/offresService";
import { EDITEUR } from "../../lib/legal";
import { TicketCaisse } from "./TicketCaisse";

const LIEN_APK = import.meta.env.VITE_LIEN_APK as string | undefined;

function prix(n: number): string {
  return n.toLocaleString("fr-FR").replace(/\u202f/g, " ");
}

export function LandingPage() {
  // Offres et durée d'essai : gérées par le super admin, lues en base.
  const [catalogue, setCatalogue] = useState<{ essai: OffreAbonnement | null; offres: OffreAbonnement[] } | null>(null);
  useEffect(() => {
    listerOffresPubliques().then(setCatalogue).catch(() => setCatalogue({ essai: null, offres: [] }));
  }, []);
  const jours = catalogue?.essai?.duree_essai_jours ?? 7;

  useEffect(() => {
    const avant = document.title;
    document.title = "Akweo — ventes, stock, tontine et caisse pour votre commerce";
    return () => {
      document.title = avant;
    };
  }, []);

  return (
    <div className="landing font-body bg-white text-stone-900">
      <PolicesAkweo />
      <style>{`
        .landing { --nuit: #0E1424; --or: #ECA71E; --creme: #FCFAF3; --sable: #F4EFE4; }
        .landing :focus-visible { outline: 3px solid var(--or); outline-offset: 2px; border-radius: 6px; }
        .landing h1, .landing h2 { font-family: 'Barlow Condensed', sans-serif; letter-spacing: -0.01em; }
        .landing .conteneur { width: min(1140px, 100% - 40px); margin-inline: auto; }
        html { scroll-behavior: smooth; }
        @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
        .landing section[id] { scroll-margin-top: 72px; }
      `}</style>
      <Navigation />
      <main>
        <EnTete jours={jours} />
        <CeQueRemplace />
        <Fonctionnalites />
        <HorsLigne />
        <Tontine />
        <Securite />
        <Tarifs catalogue={catalogue} />
        <Installation />
        <Questions />
        <AppelFinal jours={jours} />
      </main>
      <PiedDePage />
    </div>
  );
}

// =====================================================================
// NAVIGATION
// =====================================================================
function Navigation() {
  const [ouvert, setOuvert] = useState(false);
  const liens = [
    ["#fonctionnalites", "Fonctionnalités"],
    ["#hors-ligne", "Hors connexion"],
    ["#tontine", "Tontine"],
    ["#tarifs", "Tarifs"],
    ["#installer", "Installer"],
  ];
  return (
    <header className="sticky top-0 z-40 bg-[#0E1424]/95 backdrop-blur text-stone-100 border-b border-white/5">
      <div className="conteneur flex items-center justify-between h-16">
        <a href="#haut" className="flex items-center gap-2.5" aria-label="Akweo, retour en haut">
          <img src={logoMarque} alt="" className="h-9 w-auto" />
          <span className="font-display text-2xl font-bold tracking-tight">Akweo</span>
        </a>
        <nav className="hidden md:flex items-center gap-7 text-sm text-stone-300" aria-label="Sections">
          {liens.map(([href, label]) => (
            <a key={href} href={href} className="hover:text-white">
              {label}
            </a>
          ))}
        </nav>
        <div className="hidden md:flex items-center gap-3">
          <Link to="/login" className="text-sm text-stone-300 hover:text-white px-3 py-2">
            Se connecter
          </Link>
          <Link to="/signup" className="text-sm font-semibold bg-[#ECA71E] hover:bg-[#f3b83d] text-[#0E1424] px-4 py-2.5 rounded-lg">
            Essai gratuit
          </Link>
        </div>
        <button
          className="md:hidden p-2 -mr-2 text-stone-200"
          onClick={() => setOuvert((o) => !o)}
          aria-expanded={ouvert}
          aria-label={ouvert ? "Fermer le menu" : "Ouvrir le menu"}
        >
          {ouvert ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {ouvert && (
        <div className="md:hidden border-t border-white/10 bg-[#0E1424]">
          <nav className="conteneur py-3 flex flex-col" aria-label="Sections">
            {liens.map(([href, label]) => (
              <a key={href} href={href} onClick={() => setOuvert(false)} className="py-2.5 text-stone-200">
                {label}
              </a>
            ))}
            <div className="flex gap-3 pt-3 pb-1">
              <Link to="/login" className="flex-1 text-center border border-white/20 rounded-lg py-2.5 text-sm">
                Se connecter
              </Link>
              <Link to="/signup" className="flex-1 text-center bg-[#ECA71E] text-[#0E1424] font-semibold rounded-lg py-2.5 text-sm">
                Essai gratuit
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

// =====================================================================
// EN-TÊTE
// =====================================================================
function EnTete({ jours }: { jours: number }) {
  return (
    <section id="haut" className="relative overflow-hidden bg-[#0E1424] text-stone-100">
      {/* Halo discret derrière le ticket */}
      <div
        aria-hidden="true"
        className="absolute -right-40 top-10 w-[640px] h-[640px] rounded-full opacity-[0.12]"
        style={{ background: "radial-gradient(circle, #ECA71E 0%, transparent 65%)" }}
      />
      <div className="conteneur relative grid lg:grid-cols-[1.15fr_1fr] gap-12 lg:gap-8 items-center pt-14 pb-20 lg:pt-20 lg:pb-28">
        <div>
          <h1 className="font-bold text-[3.1rem] leading-[0.95] sm:text-7xl lg:text-[5.4rem] text-white">
            Votre commerce, tenu au franc près.
          </h1>
          <p className="mt-6 text-lg text-stone-300 max-w-xl leading-relaxed">
            Ventes, stock, factures, crédits clients, tontines et clôture de caisse dans une seule application. Sur
            ordinateur, téléphone ou tablette, même quand internet coupe.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <Link
              to="/signup"
              className="inline-flex justify-center items-center bg-[#ECA71E] hover:bg-[#f3b83d] text-[#0E1424] font-semibold text-base px-6 py-3.5 rounded-xl"
            >
              Essayer gratuitement {jours} jours
            </Link>
            <a
              href="#tarifs"
              className="inline-flex justify-center items-center border border-white/25 hover:border-white/50 text-white font-medium px-6 py-3.5 rounded-xl"
            >
              Voir les tarifs
            </a>
          </div>
          <p className="mt-4 text-sm text-stone-400">Sans carte bancaire. Paiement ensuite par MTN Mobile Money.</p>
          <div className="mt-10 pt-6 border-t border-white/10">
            <BoutonsTelechargement sombre />
          </div>
        </div>
        <div className="relative flex justify-center lg:justify-end">
          <div className="relative">
            <MaquetteTelephone className="absolute -left-24 top-16 w-[190px] hidden sm:block rotate-[-6deg] opacity-95" />
            <TicketCaisse />
          </div>
        </div>
      </div>
    </section>
  );
}

function MaquetteTelephone({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-[2rem] bg-[#05080f] p-2 shadow-2xl ring-1 ring-white/10 ${className}`} aria-hidden="true">
      <div className="rounded-[1.6rem] overflow-hidden bg-stone-50 aspect-[390/844]">
        <img src="/screenshots/cloture-mobile.png" alt="" className="w-full h-full object-cover object-top" />
      </div>
    </div>
  );
}

// =====================================================================
// BOUTONS DE TÉLÉCHARGEMENT (PC / MOBILE)
// =====================================================================
function BoutonsTelechargement({ sombre = false }: { sombre?: boolean }) {
  const { plateforme, peutInstaller, installer, installee } = useInstallation();
  const navigate = useNavigate();
  const [qrOuvert, setQrOuvert] = useState(false);
  const surMobile = plateforme === "android" || plateforme === "ios";

  async function installerPC() {
    if (!surMobile && peutInstaller && (await installer())) return;
    navigate("/installer");
  }
  async function installerMobile() {
    if (surMobile) {
      if (plateforme === "android" && LIEN_APK) {
        window.location.href = LIEN_APK;
        return;
      }
      if (peutInstaller && (await installer())) return;
      navigate("/installer");
      return;
    }
    // Sur ordinateur : QR code à scanner avec le téléphone.
    setQrOuvert(true);
  }

  const base = sombre
    ? "bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-white"
    : "bg-white hover:bg-stone-50 border border-stone-300 text-stone-900";

  if (installee) {
    return (
      <p className={`flex items-center gap-2 text-sm ${sombre ? "text-stone-300" : "text-stone-600"}`}>
        <Check size={16} className="text-emerald-500" /> Akweo est installé sur cet appareil.
      </p>
    );
  }

  return (
    <>
      <p className={`text-sm mb-3 ${sombre ? "text-stone-400" : "text-stone-500"}`}>Téléchargez l'application</p>
      <div className="flex flex-col sm:flex-row gap-3">
        <button onClick={installerPC} className={`flex items-center gap-3 px-4 py-3 rounded-xl text-left ${base}`}>
          <Monitor size={26} className="shrink-0 text-[#ECA71E]" />
          <span className="leading-tight">
            <span className={`block text-xs ${sombre ? "text-stone-400" : "text-stone-500"}`}>Windows, Mac, Linux</span>
            <span className="block font-semibold">Pour ordinateur</span>
          </span>
        </button>
        <button onClick={installerMobile} className={`flex items-center gap-3 px-4 py-3 rounded-xl text-left ${base}`}>
          <Smartphone size={26} className="shrink-0 text-[#ECA71E]" />
          <span className="leading-tight">
            <span className={`block text-xs ${sombre ? "text-stone-400" : "text-stone-500"}`}>Android, iPhone, tablette</span>
            <span className="block font-semibold">Pour mobile</span>
          </span>
        </button>
      </div>
      {qrOuvert && <FenetreQr onFerme={() => setQrOuvert(false)} />}
    </>
  );
}

function FenetreQr({ onFerme }: { onFerme: () => void }) {
  const [svg, setSvg] = useState("");
  const url = `${window.location.origin}/installer`;
  useEffect(() => {
    QRCode.toString(url, { type: "svg", margin: 0, color: { dark: "#0E1424", light: "#FFFFFF" } }).then(setSvg);
    const echap = (e: KeyboardEvent) => e.key === "Escape" && onFerme();
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [url, onFerme]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" role="dialog" aria-modal="true" aria-labelledby="titre-qr">
      <div className="absolute inset-0 bg-[#0E1424]/70" onClick={onFerme} />
      <div className="relative bg-white text-stone-900 rounded-2xl p-6 w-full max-w-xs text-center">
        <button onClick={onFerme} className="absolute right-3 top-3 p-1 text-stone-400" aria-label="Fermer">
          <X size={20} />
        </button>
        <p id="titre-qr" className="font-display text-2xl font-bold">Scannez avec votre téléphone</p>
        <div className="mx-auto mt-4 w-48 h-48" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="mt-4 text-sm text-stone-600">
          Ouvrez l'appareil photo de votre téléphone et visez le code : la page d'installation s'ouvre.
        </p>
        <p className="mt-2 text-xs text-stone-400 break-all">{url}</p>
      </div>
    </div>
  );
}

// =====================================================================
// CE QU'AKWEO REMPLACE
// =====================================================================
function CeQueRemplace() {
  const paires = [
    ["Le cahier de ventes et les calculs du soir", "Chaque vente enregistrée, le total du jour prêt"],
    ["Les écarts de caisse qu'on n'explique pas", "L'app dit ce qui doit être en caisse, l'écart est justifié"],
    ["Les ruptures découvertes devant le client", "Le stock baisse à chaque vente, les alertes arrivent avant"],
    ["Les crédits notés sur des bouts de papier", "Chaque client a son solde et son historique"],
  ];
  return (
    <section className="bg-[#F4EFE4]">
      <div className="conteneur py-16 lg:py-20 grid lg:grid-cols-[0.8fr_1.2fr] gap-10">
        <h2 className="text-4xl sm:text-5xl font-bold leading-[1.02] text-[#0E1424]">
          Ce qu'Akweo remplace dans votre boutique
        </h2>
        <ul className="divide-y divide-[#0E1424]/10 border-y border-[#0E1424]/10">
          {paires.map(([avant, apres]) => (
            <li key={avant} className="grid sm:grid-cols-2 gap-1 sm:gap-6 py-4">
              <span className="text-stone-600 line-through decoration-[#B7800F]/60">{avant}</span>
              <span className="font-medium text-[#0E1424]">{apres}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// =====================================================================
// FONCTIONNALITÉS
// =====================================================================
function Fonctionnalites() {
  return (
    <section id="fonctionnalites" className="bg-white">
      <div className="conteneur py-20 lg:py-28">
        <div className="max-w-2xl">
          <h2 className="text-5xl sm:text-6xl font-bold leading-[0.98] text-[#0E1424]">Tout le comptoir, dans votre poche.</h2>
          <p className="mt-4 text-lg text-stone-600">
            Pensé pour les quincailleries, dépôts de boissons, boutiques et grossistes : ce que vous faites déjà, en
            plus rapide et sans erreur de calcul.
          </p>
        </div>

        <div className="mt-14 grid md:grid-cols-6 gap-x-8 gap-y-6">
          {/* Grande tuile : vente + facture */}
          <article className="md:col-span-4 md:row-span-2 bg-[#0E1424] text-white rounded-3xl p-7 sm:p-9 flex flex-col">
            <p className="font-display text-3xl sm:text-4xl font-bold">Vendre en quelques touches</p>
            <p className="mt-3 text-stone-300 max-w-md">
              Cherchez l'article, ajoutez-le au panier, encaissez en espèces, Mobile Money ou à crédit. La facture est prête aussitôt, en PDF, au nom de votre client.
            </p>
            <div className="mt-8 grow flex items-end">
              <MiniFacture />
            </div>
          </article>
          <Tuile
            classe="md:col-span-2"
            icone={<Package size={22} />}
            titre="Stock toujours juste"
            texte="Entrées, corrections, inventaires et alertes de rupture. Le stock suit chaque vente, sur tous vos appareils."
          />
          <Tuile
            classe="md:col-span-2"
            icone={<Users size={22} />}
            titre="Clients et crédits"
            texte="Soldes, historique des créances et retards repérés d'un coup d'œil. Vous savez qui vous doit quoi."
          />
          <Tuile
            classe="md:col-span-3"
            icone={<Lock size={22} />}
            titre="Clôture de caisse quotidienne"
            texte="Comptez vos espèces : l'app compare avec ce qui doit être en caisse. Mois et année se clôturent avec un rapport PDF à signer."
          />
          <Tuile
            classe="md:col-span-3"
            icone={<ShieldCheck size={22} />}
            titre="Votre équipe, vos règles"
            texte="Un compte par vendeur, magasinier ou comptable, avec des droits réglés module par module. Chaque opération garde son auteur."
          />
          <Tuile
            classe="md:col-span-2"
            icone={<Truck size={22} />}
            titre="Livraisons"
            texte="Suivez les commandes à livrer et leur statut jusqu'au client."
          />
          <Tuile
            classe="md:col-span-2"
            icone={<Handshake size={22} />}
            titre="Fournisseurs et dépenses"
            texte="Commandes fournisseurs, réceptions, salaires et dépenses du magasin. Offre Business."
          />
          <Tuile
            classe="md:col-span-2"
            icone={<Beer size={22} />}
            titre="Dépôt de boissons"
            texte="Casiers, bouteilles consignées et casses suivis par client. Offre Business."
          />
        </div>
      </div>
    </section>
  );
}

function Tuile({ classe, icone, titre, texte }: { classe: string; icone: ReactNode; titre: string; texte: string }) {
  return (
    <article className={`${classe} border-t border-stone-200 pt-5 pb-2 md:px-1`}>
      <span className="inline-flex text-[#B7800F]">{icone}</span>
      <p className="mt-3 font-display text-2xl font-bold text-[#0E1424]">{titre}</p>
      <p className="mt-1.5 text-stone-600 leading-relaxed">{texte}</p>
    </article>
  );
}

function MiniFacture() {
  const lignes = [
    ["Ciment CPJ 45", "10 sacs", "50 000"],
    ["Fer de 10", "12 barres", "54 000"],
    ["Pointes 70 mm", "3 kg", "4 500"],
  ];
  return (
    <div className="w-full max-w-md bg-white text-stone-900 rounded-2xl p-5 shadow-xl rotate-[-1.5deg]" aria-hidden="true">
      <div className="flex justify-between items-baseline">
        <p className="font-display text-xl font-bold">FACTURE</p>
        <p className="text-xs text-stone-500">F-V-20260929-0042</p>
      </div>
      <p className="text-xs text-stone-500 mt-0.5">Entreprise BTP Akpro</p>
      <div className="mt-3 divide-y divide-stone-100 text-sm">
        {lignes.map(([d, q, m]) => (
          <div key={d} className="flex justify-between py-1.5">
            <span>
              {d} <span className="text-stone-400">{q}</span>
            </span>
            <span className="tabular-nums">{m}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 pt-2 border-t-2 border-[#0E1424] flex justify-between font-bold">
        <span>Total</span>
        <span className="tabular-nums">108 500 F</span>
      </div>
    </div>
  );
}

// =====================================================================
// HORS CONNEXION — une journée type (vraie séquence : heures)
// =====================================================================
function HorsLigne() {
  const journee = [
    ["08:00", "Coupure internet", "L'application reste ouverte et continue de fonctionner."],
    ["08:05 — 18:30", "Vous vendez normalement", "Ventes, factures provisoires, cotisations, entrées de stock : tout est gardé sur l'appareil."],
    ["19:00", "Le réseau revient", "Tout part automatiquement, dans l'ordre, avec l'heure réelle de chaque vente. Jamais de doublon."],
    ["19:30", "Vous clôturez la journée", "La clôture attend que chaque appareil ait tout envoyé."],
  ];
  return (
    <section id="hors-ligne" className="bg-[#0E1424] text-stone-100">
      <div className="conteneur py-20 lg:py-28 grid lg:grid-cols-[1fr_1.1fr] gap-12 lg:gap-16 items-start">
        <div className="lg:sticky lg:top-28">
          <WifiOff size={30} className="text-[#ECA71E]" />
          <h2 className="mt-4 text-5xl sm:text-6xl font-bold leading-[0.98] text-white">
            Pas de réseau ? Vendez quand même.
          </h2>
          <p className="mt-5 text-lg text-stone-300 max-w-md">
            Akweo fonctionne toute la journée sans connexion, sur plusieurs appareils à la fois, et synchronise tout dès
            que le réseau revient. Aucune vente perdue, aucune vente comptée deux fois.
          </p>
        </div>
        <ol className="relative border-l border-white/15 ml-2">
          {journee.map(([heure, titre, texte]) => (
            <li key={heure} className="pl-8 pb-10 last:pb-0 relative">
              <span className="absolute -left-[7px] top-1.5 w-3.5 h-3.5 rounded-full bg-[#ECA71E] ring-4 ring-[#0E1424]" />
              <p className="text-sm tabular-nums text-[#ECA71E] font-semibold">{heure}</p>
              <p className="mt-1 font-display text-2xl font-bold text-white">{titre}</p>
              <p className="mt-1 text-stone-400">{texte}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// =====================================================================
// TONTINE
// =====================================================================
function Tontine() {
  return (
    <section id="tontine" className="bg-[#F4EFE4]">
      <div className="conteneur py-20 lg:py-28 grid lg:grid-cols-2 gap-12 items-center">
        <div className="order-2 lg:order-1 flex justify-center">
          <CarteTontine />
        </div>
        <div className="order-1 lg:order-2">
          <img src={logoMarque} alt="" className="h-12 w-auto" />
          <h2 className="mt-4 text-5xl sm:text-6xl font-bold leading-[0.98] text-[#0E1424]">
            La tontine de vos clients, sans le cahier.
          </h2>
          <p className="mt-5 text-lg text-stone-700 max-w-lg">
            Vos clients épargnent chez vous pour acheter plus tard. Akweo suit chaque versement, imprime le reçu et
            vous prévient quand le plafond est atteint.
          </p>
          <ul className="mt-6 space-y-3 text-stone-700">
            {[
              "Vos propres conditions, acceptées par le client à l'ouverture et conservées",
              "Un reçu numéroté à chaque cotisation, même hors connexion",
              "Un panier d'articles réservé, retiré en une fois quand l'épargne suffit",
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <Check size={20} className="shrink-0 mt-0.5 text-[#B7800F]" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function CarteTontine() {
  const cumul = 42000;
  const plafond = 50000;
  return (
    <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-xl" aria-hidden="true">
      <p className="text-sm text-stone-500">Tontine</p>
      <p className="font-display text-3xl font-bold text-[#0E1424]">Adjoa K.</p>
      <div className="mt-5 flex justify-between items-baseline">
        <span className="font-display text-4xl font-bold tabular-nums">{prix(cumul)} F</span>
        <span className="text-sm text-stone-500">sur {prix(plafond)} F</span>
      </div>
      <div className="mt-2 h-3 rounded-full bg-stone-100 overflow-hidden">
        <div className="h-full rounded-full bg-[#ECA71E]" style={{ width: `${(cumul / plafond) * 100}%` }} />
      </div>
      <div className="mt-5 divide-y divide-stone-100 text-sm">
        {[
          ["TR-20260929-0003", "29 sept.", "5 000"],
          ["TR-20260922-0011", "22 sept.", "5 000"],
          ["TR-20260915-0007", "15 sept.", "10 000"],
        ].map(([n, d, m]) => (
          <div key={n} className="flex justify-between py-2">
            <span>
              {n} <span className="text-stone-400">{d}</span>
            </span>
            <span className="tabular-nums font-medium">{m} F</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// =====================================================================
// SÉCURITÉ
// =====================================================================
function Securite() {
  const points = [
    ["Vos données sont à vous", "Chaque commerce est isolé : personne d'autre ne peut les voir, contrôle vérifié côté serveur."],
    ["Des droits précis", "Le vendeur vend, le comptable consulte, le gérant décide. Les accès se règlent pour chaque membre."],
    ["Des comptes qui ne mentent pas", "Une journée clôturée ne peut plus être modifiée. Toute réouverture est motivée et tracée."],
    ["Paiements vérifiés", "Chaque abonnement est confirmé directement auprès de l'opérateur avant d'être activé."],
  ];
  return (
    <section className="bg-white">
      <div className="conteneur py-20 lg:py-24">
        <h2 className="text-4xl sm:text-5xl font-bold leading-[1.02] text-[#0E1424] max-w-xl">
          Une caisse qui inspire confiance.
        </h2>
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-10">
          {points.map(([titre, texte]) => (
            <div key={titre} className="border-t-2 border-[#0E1424] pt-4">
              <p className="font-display text-2xl font-bold text-[#0E1424]">{titre}</p>
              <p className="mt-2 text-stone-600 leading-relaxed">{texte}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// =====================================================================
// TARIFS
// =====================================================================
function Tarifs({ catalogue }: { catalogue: { essai: OffreAbonnement | null; offres: OffreAbonnement[] } | null }) {
  const [annuel, setAnnuel] = useState(false);
  const essai = catalogue?.essai ?? null;
  const offres = catalogue?.offres ?? [];
  const jours = essai?.duree_essai_jours ?? 7;
  const nbCartes = offres.length + (essai ? 1 : 0);
  const grille = nbCartes >= 4 ? "lg:grid-cols-4" : nbCartes === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2";

  return (
    <section id="tarifs" className="bg-[#F4EFE4]">
      <div className="conteneur py-20 lg:py-28">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="max-w-xl">
            <h2 className="text-5xl sm:text-6xl font-bold leading-[0.98] text-[#0E1424]">Un prix simple, en francs CFA.</h2>
            <p className="mt-4 text-lg text-stone-700">
              {jours} jours gratuits pour essayer, puis l'offre qui correspond à votre commerce. Sans engagement.
            </p>
          </div>
          <div className="inline-flex self-start lg:self-auto bg-white rounded-full p-1 border border-stone-300" role="radiogroup" aria-label="Période de facturation">
            {[
              [false, "Mensuel"],
              [true, "Annuel"],
            ].map(([valeur, label]) => (
              <button
                key={String(label)}
                role="radio"
                aria-checked={annuel === valeur}
                onClick={() => setAnnuel(valeur as boolean)}
                className={`px-5 py-2 rounded-full text-sm font-medium ${annuel === valeur ? "bg-[#0E1424] text-white" : "text-stone-600"}`}
              >
                {label as string}
              </button>
            ))}
          </div>
        </div>

        {!catalogue && <p className="mt-12 text-stone-500">Chargement des tarifs...</p>}
        <div className={`mt-12 grid sm:grid-cols-2 ${grille} gap-5 items-stretch`}>
          {essai && (
            <CarteOffre
              nom={essai.nom}
              montant="0 F"
              periode={`pendant ${jours} jours`}
              pour={essai.description}
              points={avantagesAffiches(essai)}
              action="Commencer l'essai"
            />
          )}
          {offres.map((o) => {
            const eco = economieAnnuelle(o);
            const moisOfferts = o.prix_mensuel > 0 ? Math.floor(eco / o.prix_mensuel) : 0;
            return (
              <CarteOffre
                key={o.id}
                recommandee={o.recommandee}
                nom={o.nom}
                montant={`${prix(annuel ? o.prix_annuel : o.prix_mensuel)} F`}
                periode={annuel ? "par an" : "par mois"}
                note={
                  annuel && eco > 0
                    ? moisOfferts >= 1 && eco % o.prix_mensuel === 0
                      ? `${moisOfferts} mois offert${moisOfferts > 1 ? "s" : ""}`
                      : `${prix(eco)} F d'économie par an`
                    : undefined
                }
                pour={o.description}
                points={avantagesAffiches(o)}
                action={`Choisir ${o.nom}`}
              />
            );
          })}
        </div>
        <p className="mt-6 text-sm text-stone-600">
          Paiement par MTN Mobile Money, Moov Money ou carte. L'abonnement est prolongé dès la confirmation du paiement.
        </p>
      </div>
    </section>
  );
}

function CarteOffre({
  nom,
  montant,
  periode,
  note,
  pour,
  points,
  action,
  recommandee = false,
}: {
  nom: string;
  montant: string;
  periode: string;
  note?: string;
  pour: string;
  points: string[];
  action: string;
  recommandee?: boolean;
}) {
  return (
    <article
      className={`relative flex flex-col rounded-3xl p-7 ${
        recommandee ? "bg-[#0E1424] text-white lg:-my-4 lg:py-11 shadow-2xl" : "bg-white text-stone-900 border border-stone-200"
      }`}
    >
      {recommandee && (
        <span className="absolute -top-3 left-7 bg-[#ECA71E] text-[#0E1424] text-xs font-bold px-3 py-1 rounded-full">
          Recommandée
        </span>
      )}
      <p className="font-display text-3xl font-bold">{nom}</p>
      <p className={`mt-1 text-sm min-h-[2.5rem] ${recommandee ? "text-stone-400" : "text-stone-500"}`}>{pour}</p>
      <p className="mt-6">
        <span className="font-display text-5xl font-bold tabular-nums">{montant}</span>{" "}
        <span className={recommandee ? "text-stone-400" : "text-stone-500"}>{periode}</span>
      </p>
      <p className={`h-5 mt-1 text-sm font-medium ${recommandee ? "text-[#ECA71E]" : "text-[#B7800F]"}`}>{note ?? ""}</p>
      <ul className="mt-5 space-y-2.5 grow">
        {points.map((p) => (
          <li key={p} className="flex gap-2.5 text-sm">
            <Check size={17} className={`shrink-0 mt-0.5 ${recommandee ? "text-[#ECA71E]" : "text-[#B7800F]"}`} />
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <Link
        to="/signup"
        className={`mt-7 text-center font-semibold py-3.5 rounded-xl ${
          recommandee ? "bg-[#ECA71E] hover:bg-[#f3b83d] text-[#0E1424]" : "bg-[#0E1424] hover:bg-[#1A2238] text-white"
        }`}
      >
        {action}
      </Link>
    </article>
  );
}

// =====================================================================
// INSTALLATION
// =====================================================================
function Installation() {
  return (
    <section id="installer" className="bg-white">
      <div className="conteneur py-20 lg:py-24 grid lg:grid-cols-[1.1fr_1fr] gap-12 items-center">
        <div>
          <h2 className="text-5xl sm:text-6xl font-bold leading-[0.98] text-[#0E1424]">Installez Akweo là où vous vendez.</h2>
          <p className="mt-5 text-lg text-stone-600 max-w-lg">
            Sur l'ordinateur de la caisse, la tablette du magasin et le téléphone du gérant. Une seule application, vos
            données partout, et les mises à jour s'installent toutes seules.
          </p>
          <div className="mt-8">
            <BoutonsTelechargement />
          </div>
          <p className="mt-5 text-sm text-stone-500">
            Autre appareil ? <Link to="/installer" className="underline underline-offset-2 text-stone-700">Voir toutes les instructions</Link>.
          </p>
        </div>
        <div className="relative">
          <div className="rounded-2xl bg-[#05080f] p-2.5 shadow-2xl" aria-hidden="true">
            <div className="rounded-lg overflow-hidden bg-stone-50 aspect-[16/10]">
              <img src="/screenshots/cloture-large.png" alt="" className="w-full h-full object-cover object-top" />
            </div>
          </div>
          <MaquetteTelephone className="absolute -bottom-10 -right-2 sm:right-6 w-[130px] sm:w-[160px]" />
        </div>
      </div>
    </section>
  );
}

// =====================================================================
// QUESTIONS FRÉQUENTES
// =====================================================================
function Questions() {
  const questions: [string, string][] = [
    [
      "Faut-il internet pour utiliser Akweo ?",
      "Pour la première connexion sur un appareil, oui. Ensuite, vous pouvez vendre, facturer, encaisser les tontines et faire vos entrées de stock sans réseau toute la journée. Tout se synchronise au retour de la connexion.",
    ],
    [
      "Sur quels appareils fonctionne l'application ?",
      "Ordinateurs Windows, Mac et Linux, téléphones et tablettes Android, iPhone et iPad. Plusieurs appareils peuvent être utilisés en même temps dans le même commerce.",
    ],
    [
      "Comment payer mon abonnement ?",
      "Depuis l'application, par MTN Mobile Money, Moov Money ou carte. L'abonnement est prolongé dès que l'opérateur confirme le paiement.",
    ],
    [
      "Que se passe-t-il à la fin de l'essai ?",
      "Rien n'est facturé automatiquement. Vous choisissez une offre pour continuer ; vos données sont conservées.",
    ],
    [
      "Mes employés peuvent-ils voir mes chiffres ?",
      "Seulement si vous le décidez. Le vendeur vend, le comptable consulte ; vous réglez les accès de chaque membre de votre équipe.",
    ],
    [
      "Et les factures normalisées de la DGI ?",
      "Chaque vente produit sa facture en PDF, et vous pouvez déjà marquer celles à normaliser. La certification e-MECeF auprès de la DGI est en préparation.",
    ],
    ["Mes données sont-elles en sécurité ?", "Les données de chaque commerce sont isolées et accessibles uniquement à son équipe, avec des droits contrôlés par le serveur. Les échanges sont chiffrés."],
  ];
  return (
    <section className="bg-[#F4EFE4]">
      <div className="conteneur py-20 lg:py-24 grid lg:grid-cols-[0.8fr_1.2fr] gap-10">
        <h2 className="text-5xl font-bold leading-[0.98] text-[#0E1424]">Vos questions</h2>
        <div className="divide-y divide-[#0E1424]/10 border-y border-[#0E1424]/10">
          {questions.map(([q, r]) => (
            <details key={q} className="group py-5">
              <summary className="flex justify-between items-center gap-4 cursor-pointer list-none font-medium text-lg text-[#0E1424]">
                {q}
                <span className="shrink-0 text-2xl leading-none text-[#B7800F] group-open:rotate-45 transition-transform" aria-hidden="true">
                  +
                </span>
              </summary>
              <p className="mt-3 text-stone-700 leading-relaxed max-w-prose">{r}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

// =====================================================================
// APPEL FINAL + PIED DE PAGE
// =====================================================================
function AppelFinal({ jours }: { jours: number }) {
  return (
    <section className="bg-[#0E1424] text-white">
      <div className="conteneur py-20 lg:py-24 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
        <div>
          <h2 className="text-5xl sm:text-6xl font-bold leading-[0.98]">Ce soir, votre caisse tombe juste.</h2>
          <p className="mt-4 text-lg text-stone-300">Créez votre commerce en deux minutes, essai gratuit de {jours} jours.</p>
        </div>
        <Link
          to="/signup"
          className="shrink-0 inline-flex justify-center bg-[#ECA71E] hover:bg-[#f3b83d] text-[#0E1424] font-semibold text-lg px-8 py-4 rounded-xl"
        >
          Créer mon commerce
        </Link>
      </div>
    </section>
  );
}

function PiedDePage() {
  return (
    <footer className="bg-[#0A0F1C] text-stone-400">
      <div className="conteneur py-12 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <img src={logoAkweo} alt="Akweo" className="h-16 w-auto self-start" />
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label="Liens utiles">
          <Link to="/login" className="hover:text-white">Se connecter</Link>
          <Link to="/installer" className="hover:text-white">Installer l'application</Link>
          <Link to="/conditions-generales" className="hover:text-white">Conditions générales</Link>
        </nav>
      </div>
      <div className="conteneur pb-8 text-xs text-stone-500">
        © {new Date().getFullYear()} {EDITEUR.nom}. {EDITEUR.siege}.
      </div>
    </footer>
  );
}
