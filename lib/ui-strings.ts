/**
 * Strings UI centralisées (point d'entrée i18n futur).
 * Aucun texte visible utilisateur ne doit être hardcodé dans les composants —
 * tout passe par cet objet. Les clés techniques (ids, routes, classNames) restent inline.
 */
export const APP_NAME = "Real estate Agent";

export const UI = {
  app: {
    name: APP_NAME,
    description: "Real estate Agent — Cockpit",
  },
  nav: {
    home: "Accueil",
    dashboard: "Dashboard",
    profile: "Profil",
  },
  dashboard: {
    eyebrow: "Cockpit",
    title: APP_NAME,
    sub: "Tableau de bord — shell Cockpit, chat Kimi à droite.",
    kpis: {
      biens: "Biens suivis",
      leads: "Leads actifs",
      visites: "Visites planifiées",
      mandats: "Mandats signés",
    },
    cards: {
      startTitle: "Démarrer",
      assistantTitle: "Assistant Kimi",
    },
  },
  profile: {
    eyebrow: "Compte",
    title: "Profil",
    sub: "Session active. Identité et périmètre d'accès.",
    identityTitle: "Identité",
    scopesTitle: "Scopes",
    sessionTitle: "Session",
    sessionHint: "Fermer la session sur cet appareil.",
    fields: {
      email: "Email",
      userId: "User ID",
      tenant: "Tenant",
      role: "Rôle",
      issued: "Session émise",
    },
    empty: "—",
  },
  login: {
    eyebrow: "Connexion",
    title: APP_NAME,
    sub: "Identifiants requis pour accéder au dashboard.",
    emailLabel: "Email",
    passwordLabel: "Mot de passe",
    submit: "Se connecter",
    submitBusy: "Connexion…",
    errors: {
      invalid_credentials: "Email ou mot de passe incorrect.",
      invalid_body: "Formulaire invalide.",
      supabase_not_configured: "Backend indisponible. Réessaie dans 1 min.",
      jwt_not_configured: "Backend mal configuré (JWT).",
      rate_limited: "Trop de tentatives. Réessaie dans 1 min.",
      generic: "Erreur de connexion.",
      network: "Erreur réseau.",
    } as Record<string, string>,
  },
  chat: {
    status: "Kimi K2.6",
    title: "Assistant",
    collapse: "Replier",
    reopen: "Chat",
    placeholder: "Message à Kimi…",
    empty: "Pose une question, ou « mémorise : … » pour enregistrer un fait du tenant.",
    userAvatar: "VO",
    assistantAvatar: "KI",
    errorPrefix: "Erreur",
  },
  accent: {
    group: "Accent",
    custom: "Couleur libre",
    customAria: "Couleur personnalisée",
  },
  logout: "Se déconnecter",
} as const;
