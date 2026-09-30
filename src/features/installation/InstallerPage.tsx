import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Copy, Download, Monitor, Smartphone, Tablet } from "lucide-react";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { useInstallation, type Plateforme } from "../../hooks/useInstallation";

interface Guide {
  id: Plateforme;
  titre: string;
  icone: ReactNode;
  navigateur: string;
  etapes: ReactNode[];
}

const GUIDES: Guide[] = [
  {
    id: "android",
    titre: "Téléphone ou tablette Android",
    icone: <Smartphone size={18} />,
    navigateur: "avec Chrome",
    etapes: [
      "Ouvre ce lien dans Chrome.",
      <>
        Appuie sur <strong>Installer l'application</strong> ci-dessus, ou sur le menu <strong>⋮</strong> puis{" "}
        <strong>Installer l'application</strong> (ou « Ajouter à l'écran d'accueil »).
      </>,
      "Confirme : l'icône Akweo apparaît avec tes autres applications.",
    ],
  },
  {
    id: "ios",
    titre: "iPhone ou iPad",
    icone: <Tablet size={18} />,
    navigateur: "avec Safari",
    etapes: [
      "Ouvre ce lien dans Safari.",
      <>
        Appuie sur le bouton <strong>Partager</strong> (le carré avec une flèche vers le haut).
      </>,
      <>
        Choisis <strong>Sur l'écran d'accueil</strong>, puis <strong>Ajouter</strong>.
      </>,
    ],
  },
  {
    id: "windows",
    titre: "Ordinateur (Windows, Linux)",
    icone: <Monitor size={18} />,
    navigateur: "avec Chrome ou Edge",
    etapes: [
      "Ouvre ce lien dans Chrome ou Microsoft Edge.",
      <>
        Clique sur <strong>Installer l'application</strong> ci-dessus, ou sur l'icône d'installation à droite de la
        barre d'adresse (un écran avec une flèche).
      </>,
      "Akweo s'ouvre dans sa propre fenêtre et apparaît dans le menu Démarrer et sur le bureau.",
    ],
  },
  {
    id: "mac",
    titre: "Mac",
    icone: <Monitor size={18} />,
    navigateur: "avec Chrome, Edge ou Safari",
    etapes: [
      <>
        Chrome ou Edge : icône d'installation dans la barre d'adresse, ou <strong>Installer l'application</strong>{" "}
        ci-dessus.
      </>,
      <>
        Safari (macOS Sonoma et plus) : menu <strong>Fichier</strong> puis <strong>Ajouter au Dock</strong>.
      </>,
    ],
  },
];

export function InstallerPage() {
  const { plateforme, installee, peutInstaller, installer } = useInstallation();
  const [copie, setCopie] = useState(false);
  const url = `${window.location.origin}/installer`;
  // Système non reconnu (Linux, ChromeOS...) : guide « ordinateur ».
  const idPrincipal: Plateforme = plateforme === "autre" ? "windows" : plateforme;
  const guidePrincipal = GUIDES.find((g) => g.id === idPrincipal);
  const autres = GUIDES.filter((g) => g.id !== idPrincipal);

  async function copierLien() {
    try {
      await navigator.clipboard.writeText(url);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      /* presse-papiers indisponible : le lien reste affiché */
    }
  }

  return (
    <AuthLayout titre="Installer Akweo" sousTitre="Sur ordinateur, téléphone ou tablette — gratuit et sans store">
      <div className="space-y-4">
        {installee ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3">
            <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-emerald-900">Akweo est installé sur cet appareil.</p>
              <Link to="/" className="text-sm text-emerald-800 underline underline-offset-2">
                Ouvrir mon espace
              </Link>
            </div>
          </div>
        ) : peutInstaller ? (
          <button
            onClick={installer}
            className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-3.5 rounded-xl"
          >
            <Download size={18} /> Installer l'application
          </button>
        ) : null}

        {guidePrincipal && !installee && <CarteGuide guide={guidePrincipal} miseEnAvant />}

        <div className="bg-white border border-stone-200 rounded-2xl p-4 text-sm text-stone-600 space-y-1.5">
          <p className="font-medium text-stone-900">Bon à savoir</p>
          <p>
            Connecte-toi <strong>une première fois avec internet</strong> sur chaque appareil : il télécharge alors tes
            articles et clients et peut ensuite fonctionner hors connexion.
          </p>
          <p>Les mises à jour s'installent automatiquement : rien à retélécharger.</p>
        </div>

        {autres.length > 0 && (
          <details className="bg-white border border-stone-200 rounded-2xl group">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-stone-700 flex justify-between">
              Autres appareils
              <span className="text-stone-400 group-open:rotate-90 transition-transform">›</span>
            </summary>
            <div className="px-4 pb-4 space-y-3">
              {autres.map((g) => (
                <CarteGuide key={g.id} guide={g} />
              ))}
            </div>
          </details>
        )}

        <div className="bg-white border border-stone-200 rounded-2xl p-4">
          <p className="text-xs font-medium text-stone-500 mb-1.5">Lien à envoyer à ton équipe</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 truncate text-sm bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-2">
              {url}
            </code>
            <button
              onClick={copierLien}
              className="shrink-0 flex items-center gap-1.5 border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-700"
            >
              {copie ? <CheckCircle2 size={15} className="text-emerald-600" /> : <Copy size={15} />}
              {copie ? "Copié" : "Copier"}
            </button>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}

function CarteGuide({ guide, miseEnAvant = false }: { guide: Guide; miseEnAvant?: boolean }) {
  return (
    <section className={miseEnAvant ? "bg-white border-2 border-navy rounded-2xl p-4" : "border border-stone-200 rounded-xl p-3"}>
      <p className="flex items-center gap-2 font-medium text-stone-900">
        <span className="text-amber-600">{guide.icone}</span>
        {guide.titre}
        <span className="text-xs font-normal text-stone-400">{guide.navigateur}</span>
      </p>
      <ol className="mt-2 space-y-1.5 text-sm text-stone-600 list-decimal list-inside marker:text-stone-400">
        {guide.etapes.map((e, i) => (
          <li key={i}>{e}</li>
        ))}
      </ol>
    </section>
  );
}
