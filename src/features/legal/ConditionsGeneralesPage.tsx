import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import logoMarque from "../../assets/logo-akweo-mark.png";
import { PolicesAkweo } from "../../components/layout/AuthLayout";
import { CGU_DATE_MISE_A_JOUR, CGU_VERSION, EDITEUR } from "../../lib/legal";

interface Article {
  id: string;
  titre: string;
  paragraphes: string[];
}

const ARTICLES: Article[] = [
  {
    id: "objet",
    titre: "Objet",
    paragraphes: [
      `Les présentes conditions générales d'utilisation (CGU) encadrent l'accès et l'utilisation de ${EDITEUR.nom}, application en ligne de gestion commerciale (ventes, stock, inventaires, clients, factures, fournisseurs, livraisons, équipe, dépenses et tontines) destinée aux commerces.`,
      "La création d'un compte entreprise vaut acceptation pleine et entière des présentes CGU. Si tu n'acceptes pas ces conditions, tu ne dois pas utiliser le service.",
    ],
  },
  {
    id: "editeur",
    titre: "Éditeur du service",
    paragraphes: [
      `Le service est édité par ${EDITEUR.nom}, ${EDITEUR.formeJuridique}, immatriculée sous le numéro ${EDITEUR.rccm}, IFU ${EDITEUR.ifu}, dont le siège est situé à ${EDITEUR.siege}.`,
      `Pour toute question : ${EDITEUR.emailSupport}, ou depuis l'onglet Support de l'application.`,
    ],
  },
  {
    id: "definitions",
    titre: "Définitions",
    paragraphes: [
      "« Entreprise » : le commerce qui souscrit au service. « Gérant » : la personne qui crée le compte de l'Entreprise et l'administre. « Membre » : tout utilisateur ajouté par le Gérant (vendeur, comptable, magasinier…). « Données » : toutes les informations saisies dans le service par l'Entreprise et ses Membres.",
    ],
  },
  {
    id: "compte",
    titre: "Création du compte et accès",
    paragraphes: [
      "Le Gérant déclare être majeur et habilité à engager l'Entreprise. Il s'engage à fournir des informations exactes et à les tenir à jour.",
      "Les identifiants sont personnels et confidentiels. Chaque utilisateur est responsable de l'usage fait de son compte et doit signaler sans délai toute utilisation non autorisée. Le Gérant est responsable des comptes qu'il crée pour ses Membres et des droits d'accès qu'il leur attribue.",
    ],
  },
  {
    id: "offres",
    titre: "Offres, période d'essai et paiement",
    paragraphes: [
      "Le service est proposé sous forme d'abonnement (offres Starter et Business), mensuel ou annuel, aux prix indiqués en francs CFA sur la page Offres de l'application au moment de la souscription. Une période d'essai gratuite peut être accordée à la création du compte ; son contenu et sa durée sont indiqués dans l'application.",
      "Le paiement s'effectue en ligne via le prestataire de paiement intégré à l'application. L'abonnement n'est prolongé qu'après confirmation du paiement par nos serveurs. Il n'y a pas de reconduction automatique : à l'échéance, l'accès aux fonctionnalités est suspendu jusqu'au renouvellement, les Données étant conservées dans les conditions de l'article « Suspension et résiliation ».",
      "Sauf disposition légale contraire, les sommes versées pour une période entamée ne sont pas remboursables.",
    ],
  },
  {
    id: "utilisation",
    titre: "Utilisation du service",
    paragraphes: [
      "L'Entreprise s'engage à utiliser le service de manière loyale et conforme aux lois en vigueur. Sont notamment interdits : toute tentative d'accès aux données d'une autre entreprise, de contournement des mesures de sécurité ou des limites de l'offre souscrite, l'envoi de contenus illicites et toute utilisation susceptible de perturber le fonctionnement du service.",
      "Tout manquement peut entraîner la suspension immédiate du compte, sans préjudice d'éventuelles poursuites.",
    ],
  },
  {
    id: "fiscalite",
    titre: "Factures et obligations de l'Entreprise",
    paragraphes: [
      "Le service aide l'Entreprise à produire ses documents commerciaux (factures, reçus, avoirs, quittances). L'Entreprise reste seule responsable de l'exactitude des informations saisies et du respect de ses obligations comptables, fiscales et sociales, notamment en matière de facturation normalisée.",
    ],
  },
  {
    id: "tontines",
    titre: "Module tontine",
    paragraphes: [
      `Le module tontine permet à l'Entreprise de suivre l'épargne que ses propres clients constituent auprès d'elle en vue d'un retrait d'articles. ${EDITEUR.nom} fournit uniquement l'outil de suivi : il ne collecte, ne détient et ne garantit aucune somme versée par les clients de l'Entreprise et n'est pas un établissement financier.`,
      "L'Entreprise définit seule les conditions de ses tontines, les fait accepter à ses clients et répond seule de leur exécution, des fonds collectés et de leur éventuelle restitution.",
    ],
  },
  {
    id: "donnees",
    titre: "Données personnelles",
    paragraphes: [
      "Les données personnelles sont traitées conformément à la loi n° 2017-20 du 20 avril 2018 portant code du numérique en République du Bénin.",
      `Pour les données du Gérant et des Membres (identité, email, connexions), ${EDITEUR.nom} agit en tant que responsable de traitement, afin de fournir le service, de le sécuriser et de gérer l'abonnement. Pour les données que l'Entreprise enregistre sur ses propres clients, fournisseurs et personnel, l'Entreprise est responsable de traitement et ${EDITEUR.nom} agit pour son compte, uniquement sur ses instructions.`,
      "Les Données sont hébergées chez un prestataire d'infrastructure cloud offrant des garanties de sécurité reconnues ; elles peuvent être stockées hors du Bénin. Elles ne sont jamais vendues ni utilisées à des fins publicitaires.",
      `Chaque personne concernée dispose d'un droit d'accès, de rectification, d'opposition et d'effacement de ses données, qu'elle peut exercer auprès de ${EDITEUR.emailSupport}. Elle peut également saisir l'Autorité de Protection des Données à caractère Personnel (APDP).`,
    ],
  },
  {
    id: "securite",
    titre: "Sécurité et disponibilité",
    paragraphes: [
      `${EDITEUR.nom} met en œuvre des mesures techniques et organisationnelles adaptées pour protéger les Données : chiffrement des échanges, isolation des données de chaque entreprise, contrôle des accès par rôle, politique de mots de passe robustes.`,
      "Le service est accessible en continu, sous réserve des opérations de maintenance et des incidents indépendants de notre volonté (réseau, fournisseurs, force majeure). Le mode hors ligne permet de poursuivre certaines opérations ; elles sont synchronisées au retour de la connexion.",
    ],
  },
  {
    id: "propriete",
    titre: "Propriété intellectuelle",
    paragraphes: [
      `L'application, sa marque, son logo et ses contenus sont la propriété exclusive de ${EDITEUR.nom}. L'abonnement confère un droit d'utilisation personnel, non exclusif et non transférable, pour la durée de l'abonnement. Les Données restent la propriété de l'Entreprise.`,
    ],
  },
  {
    id: "responsabilite",
    titre: "Responsabilité",
    paragraphes: [
      `${EDITEUR.nom} est tenu d'une obligation de moyens. Sa responsabilité ne saurait être engagée pour les dommages indirects (perte de chiffre d'affaires, de clientèle…), ni pour les conséquences d'une saisie erronée, d'un mauvais usage du service ou d'identifiants divulgués.`,
      "En tout état de cause, la responsabilité de l'éditeur est limitée au montant payé par l'Entreprise au cours des douze derniers mois.",
    ],
  },
  {
    id: "resiliation",
    titre: "Suspension et résiliation",
    paragraphes: [
      "L'Entreprise peut cesser d'utiliser le service à tout moment en ne renouvelant pas son abonnement, ou demander la suppression de son compte auprès du support.",
      "Après l'expiration de l'abonnement, les Données sont conservées pendant 12 mois afin de permettre une reprise d'activité, puis supprimées, sauf obligation légale de conservation. L'Entreprise peut en demander une copie avant suppression.",
    ],
  },
  {
    id: "modification",
    titre: "Modification des CGU",
    paragraphes: [
      "Les CGU peuvent évoluer. Chaque version est datée. En cas de modification substantielle, le Gérant en est informé dans l'application et une nouvelle acceptation peut lui être demandée.",
    ],
  },
  {
    id: "droit",
    titre: "Droit applicable et litiges",
    paragraphes: [
      "Les présentes CGU sont soumises au droit béninois. En cas de différend, les parties recherchent d'abord une solution amiable. À défaut, le litige est porté devant les juridictions compétentes de Cotonou.",
    ],
  },
];

export function ConditionsGeneralesPage() {
  const navigate = useNavigate();

  function retour() {
    // Ouverte depuis un formulaire dans un nouvel onglet : pas
    // d'historique, on renvoie vers la connexion.
    if (window.history.length > 1) navigate(-1);
    else navigate("/login");
  }

  return (
    <div className="min-h-screen bg-stone-50 font-body">
      <PolicesAkweo />

      <header className="bg-navy text-stone-50 sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={retour}
            className="p-1.5 -ml-1.5 rounded text-stone-400 hover:text-stone-100 hover:bg-navy-800"
            aria-label="Retour"
          >
            <ArrowLeft size={18} />
          </button>
          <img src={logoMarque} alt="" className="h-8 w-auto" />
          <p className="font-display text-xl font-bold tracking-tight">Akweo</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="font-display text-4xl font-bold text-stone-900 leading-tight">
          Conditions générales d'utilisation
        </h1>
        <p className="text-sm text-stone-500 mt-2">
          Version du {CGU_DATE_MISE_A_JOUR} (réf. {CGU_VERSION})
        </p>

        <nav aria-label="Sommaire" className="mt-6 bg-white border border-stone-200 rounded-xl p-4">
          <p className="text-xs font-medium text-stone-500 mb-2">Sommaire</p>
          <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm list-decimal list-inside marker:text-stone-400">
            {ARTICLES.map((a) => (
              <li key={a.id}>
                <a href={`#${a.id}`} className="text-stone-700 hover:text-amber-700">
                  {a.titre}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-8 space-y-8">
          {ARTICLES.map((a, index) => (
            <section key={a.id} id={a.id} className="scroll-mt-20">
              <h2 className="font-display text-2xl font-bold text-stone-900 flex items-baseline gap-2.5">
                <span className="text-amber-600">{index + 1}.</span>
                {a.titre}
              </h2>
              <div className="mt-2 space-y-3 max-w-prose">
                {a.paragraphes.map((p, i) => (
                  <p key={i} className="text-[15px] leading-relaxed text-stone-700">
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-12 pt-6 border-t border-stone-200 flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-stone-400">© {new Date().getFullYear()} {EDITEUR.nom}</p>
          <Link to="/login" className="text-amber-600 font-medium">
            Aller à la connexion
          </Link>
        </footer>
      </main>
    </div>
  );
}
