# Cockpit Immobilier — Dossier de présentation & proposition d'acquisition

> **Plateforme de pilotage du métier d'agent immobilier — déjà construite, déjà démontrable**
> Document de présentation et proposition commerciale d'acquisition

| | |
|---|---|
| **Destinataire** | _[Nom du client / de l'agence]_ |
| **Émis par** | _[Votre société]_ |
| **Date** | 11 juin 2026 |
| **Version du document** | 2.0 — proposition commerciale |
| **Statut** | En attente d'accord d'acquisition |
| **Confidentialité** | Document confidentiel — diffusion restreinte |

---

## 1. Résumé exécutif

Le **Cockpit Immobilier** est un logiciel unique qui réunit, dans un même poste de travail, **tout le quotidien de l'agent immobilier** : la prospection, le portefeuille de biens et de mandats, le suivi des clients acheteurs et vendeurs, l'agenda des visites, et l'estimation des biens.

Là où la plupart des agences jonglent aujourd'hui entre un tableur, une boîte mail, un agenda, un outil d'annonces et plusieurs sites de prospection, le Cockpit rassemble l'essentiel **au même endroit, avec une interface claire et un seul fil conducteur** : l'agent ouvre son cockpit le matin, voit ce qui compte (relances, visites, mandats à renouveler, estimations en cours), et agit.

Sa singularité tient à deux partis pris forts :

1. **Un assistant qui agit dans toute l'application — pas un chatbot dans un coin.** L'assistant ne se contente pas de répondre : il **exécute réellement les tâches** de l'agent — créer un contact, planifier une visite, lancer une estimation, comparer des prix de marché, préparer un email, poser un rendez-vous à l'agenda, générer le visuel d'un bien — et peut mener des missions de fond en autonomie. Cette intelligence n'est pas une « rubrique » : elle est **tissée dans chaque écran**.

2. **L'estimation comme geste central du métier.** Estimer un bien est l'acte qui ouvre la relation vendeur et qui crédibilise l'agent. Le Cockpit en fait **une action immédiate, accessible en un clic** depuis l'accueil, le portefeuille, la fiche d'un client vendeur et l'agenda — et même **déclenchée automatiquement** à partir d'une demande reçue par email. Elle s'appuie sur des **données officielles** (transactions réelles, cadastre, diagnostics énergétiques) et produit un **avis de valeur professionnel** prêt à être remis au client.

**État de la plateforme à ce jour :** le Cockpit n'est pas un projet à construire de zéro, c'est une **plateforme déjà bâtie et démontrable**. La présente proposition porte sur son **acquisition**, sa **mise en production pour votre agence**, sa **personnalisation** et son **transfert** — réglés en jalons adossés à des livraisons vérifiables (voir §20).

---

## 2. Objectifs du produit

| # | Objectif | Ce que ça change pour l'agent |
|---|---|---|
| **O1** | **Centraliser le quotidien** en un seul outil | Fini le va-et-vient entre tableur, mail, agenda et sites tiers. Un seul endroit, une seule vérité. |
| **O2** | **Faire gagner du temps** sur les tâches répétitives | L'assistant crée des fiches, planifie, rédige des messages, prépare les estimations et les visuels à la place de l'agent. |
| **O3** | **Professionnaliser la relation vendeur** par l'estimation | Un avis de valeur sérieux, sourcé sur des données réelles, remis vite et bien — argument décisif pour décrocher le mandat. |
| **O4** | **Ne rien laisser tomber** (relances, mandats, RDV) | L'accueil signale chaque jour ce qui doit être traité : leads à relancer, visites à venir, mandats qui expirent, estimations à terminer. |
| **O5** | **Donner une longueur d'avance** par l'intelligence intégrée | Détection d'opportunités, mise en relation acquéreur ↔ bien, données de marché à jour, missions autonomes de prospection. |

**Critère de réussite global :** un agent peut piloter l'intégralité de son activité courante dans le Cockpit, **sans recourir à un autre logiciel** pour les fonctions couvertes, et estimer un bien de bout en bout en quelques minutes.

---

## 3. Utilisateurs cibles

| Profil | Rôle | Attentes prioritaires |
|---|---|---|
| **Agent immobilier indépendant / mandataire** | Utilisateur principal au quotidien | Simplicité, rapidité, mobilité, estimation crédible, relances automatiques. |
| **Négociateur en agence** | Utilisateur intensif (terrain + bureau) | Gestion de portefeuille, agenda dense, suivi clients, productivité. |
| **Directeur / responsable d'agence** | Pilotage et supervision | Vision d'ensemble, suivi de l'activité, cadre et sécurité des données. |
| **Assistant(e) commercial(e)** | Saisie, organisation, support | Création rapide de fiches, planification, préparation des dossiers. |

**Profil-type retenu :** l'**agent au quotidien**, en mobilité, qui veut un outil rapide et qui valorise chaque minute. Toutes les décisions d'interface sont prises de son point de vue.

> _Niveau de compétence supposé : aisance numérique standard (smartphone, mail, web). Le Cockpit ne demande aucune compétence technique ; la prise en main se fait à l'usage._

---

## 4. Vision fonctionnelle

Le Cockpit repose sur **une idée simple** : *un poste de pilotage où l'agent voit, décide et agit*, avec une assistance intelligente toujours à portée de main.

```
┌────────────────────────────────────────────────────────────────┐
│  COCKPIT IMMOBILIER                                              │
│                                                                 │
│  Accueil  Prospection  Portefeuille  Clients  Agenda  [Assistant]│
│  ───────  ───────────  ────────────  ───────  ──────   (rail    │
│                                                         droit)   │
│  • Ce qui compte aujourd'hui (relances, visites, mandats…)      │
│  • Actions rapides — ESTIMER un bien en 1 clic                  │
│  • L'assistant AGIT dans chaque écran, à la demande             │
└────────────────────────────────────────────────────────────────┘
```

Trois principes structurent l'expérience :

- **Voir d'abord, agir ensuite.** L'accueil met en avant ce qui demande une décision *aujourd'hui*.
- **L'action à un clic.** Les gestes fréquents — estimer, créer, planifier, ouvrir une fiche — sont accessibles en permanence.
- **L'intelligence en soutien continu.** L'assistant prépare, rédige, recherche, planifie, exécute et, à la demande, mène des missions de fond.

L'objectif n'est pas de remplacer le jugement de l'agent, mais de **lui retirer la charge mentale et administrative** pour qu'il se concentre sur la relation client et la signature.

---

## 5. Navigation cible

La navigation principale tient en **cinq entrées**, lisibles d'un coup d'œil.

| Entrée | Rôle | Contenu |
|---|---|---|
| **Accueil** | Le poste de pilotage | Vue du jour, indicateurs clés, actions rapides (dont **Estimer**), portefeuille récent. |
| **Prospection** | Trouver des biens et des acquéreurs | Acquéreurs et critères, annonces du marché, matching automatique, missions de prospection. |
| **Portefeuille** | Les biens et les mandats | Biens, **Estimations**, mandats. Sous-onglets : *Biens · Estimations · Mandats*. |
| **Clients** | Le CRM acheteurs / vendeurs | Contacts, historique, visites. Sous-onglets : *Contacts · Visites*. |
| **Agenda** | L'organisation du temps | Visites et rendez-vous, vue calendrier, préparation des journées. |

**Toujours présent :** l'**assistant intelligent** (rail latéral repliable) et le bouton **« Créer »** (Nouvelle estimation, Nouveau client, Nouvelle visite, Nouveau bien).

> **Note de conception.** L'IA **n'a délibérément pas d'entrée dans la barre de navigation** : ce n'est pas un module à visiter, c'est une capacité présente *dans* chaque module. De même, l'**estimation** est accessible depuis plusieurs points parce que c'est un geste qui survient dans plusieurs contextes.

---

## 6. L'assistant qui agit (IA omni-action)

> **Principe directeur : l'IA n'est pas une rubrique, ni un simple chatbot. C'est un collaborateur qui exécute — intégré partout dans le Cockpit.**

Depuis le rail latéral, l'agent parle (ou dicte) en langage naturel ; l'assistant **réalise réellement les actions** dans l'application, en enchaînant **plusieurs étapes seul** jusqu'à accomplir la demande. Il ne décrit pas ce qu'il faudrait faire : il le fait.

### 6.1 Ce que l'assistant sait faire, concrètement

| Domaine | Actions exécutées par l'assistant |
|---|---|
| **CRM** | Créer / lister / modifier / supprimer un contact, un bien, une visite, un mandat. |
| **Estimation** | Lancer une estimation, renseigner ses caractéristiques, la transformer en fiche bien, l'envoyer au client. |
| **Prospection** | Créer un critère acquéreur, lister les correspondances (matchs), lancer une mission de recherche. |
| **Email & agenda** | Lire les mails, lire l'agenda, **préparer un brouillon d'email**, **poser un rendez-vous** (voir §10). |
| **Contenu & média** | Générer le **visuel d'un bien**, produire une voix de synthèse, transcrire un audio (voir §9). |
| **Recherche** | Interroger le web et le marché en direct, naviguer vers le bon écran, synthétiser une semaine d'activité. |
| **Missions autonomes** | Déléguer un objectif large à une équipe d'agents qui travaille en fond et rend compte. |

Au total, l'assistant pilote une **trentaine d'actions réelles** couvrant l'ensemble des modules du Cockpit.

### 6.2 Exemples de commandes

- *« Crée un contact vendeur, Mme Martin, 06 12 34 56 78, appartement à Lyon »* → la fiche est créée.
- *« Planifie une visite avec M. Dupont pour le bien rue de la République demain 15 h »* → la visite est planifiée, reliée au bon client et au bon bien.
- *« Lance une estimation pour ce bien et prépare un email au vendeur »* → l'estimation s'ouvre, un brouillon d'email est rédigé, prêt à valider.
- *« Génère un visuel de présentation pour l'appartement du 12 rue Voltaire »* → l'image est produite et rattachée au bien.
- *« Fais-moi un résumé de la semaine »* → leads, visites, mandats et estimations sont rassemblés et synthétisés.

### 6.3 Garde-fous & supervision humaine

L'assistant agit, mais **l'agent garde la main**. Les actions sensibles — **envoyer** un email ou un avis de valeur, supprimer une donnée, lancer une dépense (génération média) — demandent **toujours une confirmation explicite**. Les missions autonomes s'arrêtent et **sollicitent une validation humaine** avant toute décision engageante (supervision « human-in-the-loop »).

> **Règle de confiance :** l'assistant **n'invente jamais un chiffre de marché** — soit il le source, soit il le dit. Il ne décide pas à la place de l'agent, ne signe rien, n'envoie rien d'engageant sans validation.

---

## 7. Place de l'estimation

> **Principe directeur : l'estimation est une action forte, accessible immédiatement depuis plusieurs points du Cockpit — et déclenchable automatiquement depuis un email entrant.**

### 7.1 Cinq déclencheurs vers l'estimation

| Depuis… | Pourquoi |
|---|---|
| **L'accueil** | « Nouvelle estimation » est l'**action rapide mise en avant** (bouton principal). |
| **Le portefeuille** | Onglet **Estimations** dédié + création directe. |
| **La fiche d'un client vendeur** | Estimer le bien d'un vendeur **depuis son dossier**, sans ressaisie. |
| **L'agenda** | Préparer ou déclencher une estimation **autour d'un rendez-vous**. |
| **Un email entrant** *(nouveau)* | L'assistant **détecte une demande d'estimation reçue par email** et propose de **créer l'estimation automatiquement**, déjà pré-remplie (voir §10). |

### 7.2 Une estimation sérieuse, fondée sur des données officielles

Elle s'appuie sur des **sources publiques et officielles** : transactions réelles enregistrées, cadastre, diagnostics de performance énergétique (DPE), géolocalisation et comparables du secteur, indice de prix local.

**La méthode est transparente et défendable :** le Cockpit part du prix au m² réel du secteur (médiane des transactions comparables), applique des **ajustements clairs** (étiquette énergétique, étage et ascenseur, exposition, état, prestations…), valorise séparément les annexes (parking, cave, terrasse), et restitue une **valeur de marché assortie d'une fourchette et d'un niveau de confiance**. Il propose aussi une **stratégie de mise en vente**. L'agent garde toujours la main pour ajuster.

### 7.3 Un déroulé de bout en bout

```
  Lancer          Entretien            Avis de            Remettre
 l'estimation  →  guidé (assisté)  →   valeur       →     au client
 (ou depuis      (caractéristiques     professionnel      (email /
  un email)       + marché)            (document PDF)      lien / PDF)
                                                              │
                                                              ▼
                                   Convertir en fiche bien / mandat
```

1. **Lancement** en un clic (accueil, portefeuille, fiche vendeur, agenda) ou **automatique** depuis un email entrant.
2. **Entretien guidé** : caractéristiques + agrégation des données de marché.
3. **Avis de valeur** : génération d'un **document PDF professionnel** à la charte du client.
4. **Remise au client** : email (avec confirmation), **lien de consultation sécurisé** (30 jours) ou impression.
5. **Continuité commerciale** : transformation en **fiche bien** puis **mandat**, sans ressaisie.

---

## 8. Fonctionnalités détaillées par module

### 8.1 Accueil — le poste de pilotage
- **Indicateurs clés** : biens, leads actifs, visites à venir, mandats actifs.
- **« Aujourd'hui »** : leads à relancer (7 j), visites dans les 48 h, mandats qui expirent (30 j), estimations en cours.
- **Actions rapides** : Estimer (mise en avant), Nouveau client, Nouvelle visite, Nouveau bien, Lancer une prospection.
- **Portefeuille récent**.

### 8.2 Prospection — trouver biens et acquéreurs
- **Acquéreurs** et leurs **critères** (budget, zones, type, surface, pièces).
- **Annonces du marché** (repérage des annonces de particulier à particulier).
- **Matching automatique** annonce ↔ critère, avec **score** et alerte.
- **Missions de prospection** confiées à l'assistant.
- *Alertes acquéreurs : email opérationnel ; WhatsApp sous réserve des accès externes (§15).*

### 8.3 Portefeuille — biens, estimations, mandats
- **Biens** : fiche détaillée, parcours de statut, vues liste/kanban, photos et **visuels générés**.
- **Estimations** : voir §7.
- **Mandats** : création (simple / exclusif), référence, prix, commission, échéances, **alerte d'expiration**.

### 8.4 Clients — le CRM acheteurs / vendeurs
- **Contacts** : fiche unifiée acheteur **ou** vendeur, type, coordonnées, budget, source, notes.
- **Enrichissement** : complément automatique des coordonnées professionnelles à partir de bases externes.
- **Parcours commercial** : statut du lead (*nouveau → contacté → qualifié → visite → offre → gagné / perdu*).
- **Visites** : reliées à un client et un bien, statut (planifiée, confirmée, réalisée, annulée, no-show).
- **Estimation depuis la fiche vendeur**.

### 8.5 Agenda — l'organisation du temps
- **Vue calendrier** des visites et rendez-vous.
- **Planification** reliée aux clients et aux biens.
- **Préparation** des RDV + **déclenchement d'une estimation**.
- **Pose de RDV dans l'agenda externe** (Google Agenda), sur autorisation (§10).

### 8.6 Capacités transverses
- **Assistant intelligent** (§6), **recherche unifiée**, **mémoire de préférences**, **sécurité et cloisonnement** (§11).

---

## 9. Studio média & contenus *(nouveau)*

Le Cockpit intègre un **studio de génération de contenu** directement utile à la commercialisation d'un bien — piloté par l'assistant, sans quitter l'application.

| Contenu | Usage métier | Statut |
|---|---|---|
| **Visuel de bien** (image) | Illustration d'annonce, vignette, mise en valeur. | **Disponible** |
| **Voix de synthèse** (audio) | Narration de visite, message vocal, présentation. | **Disponible** |
| **Transcription** (audio → texte) | Retranscrire un appel ou un mémo vocal. | **Disponible** |
| **Vidéo** de présentation | Teaser vidéo d'un bien à partir d'images. | En option — à activer |
| **Visite 3D** | Modèle 3D / mise en volume d'un bien. | En option — à activer |
| **Avatar & présentateur** | Porte-parole vidéo pour une annonce. | En option — à activer |
| **Compte-rendu de réunion** | Capture et synthèse d'une visioconférence. | En option — à activer |
| **Analyse de tonalité** | Lecture du climat émotionnel d'un échange. | En option — à activer |

> **« Disponible »** = opérationnel dès la mise en production. **« En option »** = brique déjà construite, activée à la demande (Phase 3 et/ou option média). Chaque génération est **encadrée par un garde-fou de coût** et requiert une confirmation de l'agent.

---

## 10. Connecteurs email & agenda *(nouveau)*

Le Cockpit se connecte à la **boîte mail** et à l'**agenda** de l'agent (Google / Gmail) pour **supprimer les ressaisies** et faire entrer le travail là où il arrive : dans les emails.

| Capacité | Ce que ça fait |
|---|---|
| **Lecture des emails** | L'assistant lit la boîte de réception pour retrouver un échange, un contact, une demande. |
| **Détection des demandes d'estimation** *(clé)* | Repère **automatiquement** les emails demandant une estimation et propose de **créer l'estimation pré-remplie**. |
| **Brouillon d'email** | Rédige une réponse, une relance, un envoi d'avis de valeur — déposé en **brouillon**, jamais envoyé sans validation. |
| **Lecture de l'agenda** | Consulte les disponibilités, prépare une journée, évite les conflits. |
| **Création d'un rendez-vous** | Pose un évènement (titre, date, durée, invités) relié à un client / un bien. |

> **Sécurité & consentement.** La connexion à Gmail / Google Agenda se fait par **autorisation explicite du client** (compte Google de l'agence). L'assistant **ne rédige jamais d'envoi automatique** : il prépare brouillons et évènements, l'agent confirme. L'activation suppose la connexion du compte Google (§15).

---

## 11. Sécurité & conformité *(renforcé)*

| Mesure | Ce qu'elle garantit |
|---|---|
| **Connexion sécurisée** | Email + mot de passe ; pas d'inscription libre — seul l'administrateur crée les comptes. |
| **Double authentification (2FA)** *(nouveau)* | Code à usage unique (app d'authentification), **codes de secours**, **réinitialisation par l'administrateur**. |
| **Journal d'audit (traçabilité)** *(nouveau)* | Chaque connexion, activation 2FA et déconnexion est **horodatée et journalisée**, consultable par l'administrateur. |
| **Sessions révocables** | Une session peut être **coupée à distance** (déconnexion réelle, pas seulement côté navigateur). |
| **Cloisonnement par agence** | Isolation stricte : une agence ne voit **jamais** les données d'une autre. |
| **Hébergement maîtrisé (UE)** | Base hébergée en région Europe, conforme RGPD ; droit à l'effacement, réversibilité. |
| **Secrets protégés** | Aucune clé exposée côté utilisateur ; en-têtes de sécurité et contrôles à l'import de fichiers. |

> **Conformité RGPD** : cloisonnement strict, hébergement UE, droit à l'effacement, journalisation des accès et **réversibilité** (le client reste propriétaire de ses données et peut les récupérer à tout moment).

---

## 12. Parcours utilisateurs

### Parcours A — « Je décroche un mandat grâce à une estimation »
1. Un propriétaire contacte l'agent. Depuis l'**accueil**, il clique sur **Estimer**.
2. L'**entretien guidé** s'ouvre ; l'assistant aide et ramène les prix de marché.
3. L'agent obtient un **avis de valeur professionnel** et le **remet au vendeur**.
4. En deux clics, l'estimation devient une **fiche bien** puis un **mandat**.

### Parcours B — « Une demande d'estimation tombe dans ma boîte mail » *(nouveau)*
1. Un particulier envoie un email demandant une estimation. L'assistant le **détecte**.
2. Il propose de **créer l'estimation pré-remplie** et le **contact vendeur** associé.
3. L'agent complète l'entretien, génère l'avis de valeur et **répond depuis un brouillon** déjà rédigé.

### Parcours C — « Je ne laisse passer aucune relance »
1. Le matin : trois leads à relancer, deux visites à 48 h, un mandat qui expire.
2. L'agent demande à l'**assistant** de préparer les messages (en brouillon).
3. Il valide, planifie, et le tableau du jour se vide.

### Parcours D — « Je connecte un acheteur au bon bien »
1. L'agent saisit (ou dicte) les critères d'un acquéreur dans **Prospection**.
2. Le **matching** signale une annonce correspondante, avec un **score élevé**.
3. L'agent contacte l'acquéreur et planifie une visite.

### Parcours E — « Je délègue une recherche de vendeurs »
1. L'agent confie une **mission** : *« trouve des propriétaires susceptibles de vendre dans le 11ᵉ »*.
2. L'équipe d'agents travaille en fond et **sollicite une validation** avant toute action engageante.
3. L'agent récupère une liste qualifiée et une **approche prête** à personnaliser.

---

## 13. Périmètre livré

La plateforme est livrée **complète et utilisable en production** pour un agent ou une agence.

| Domaine | Contenu |
|---|---|
| **Socle & sécurité** | Connexion sécurisée, 2FA, journal d'audit, sessions révocables, cloisonnement par agence (§11). |
| **Accueil** | Pilotage du jour, indicateurs, actions rapides, portefeuille récent. |
| **Portefeuille** | Biens (fiche + statut + liste/kanban + photos/visuels), mandats (cycle complet + alerte d'expiration). |
| **Clients (CRM)** | Contacts acheteurs/vendeurs, enrichissement, parcours commercial, visites reliées aux biens. |
| **Agenda** | Calendrier des visites et RDV, planification, pose de RDV dans l'agenda externe. |
| **Estimation** | Parcours complet : lancement multi-contexte (dont email entrant), entretien guidé, avis de valeur PDF, remise, conversion en bien/mandat. |
| **Assistant omni-action** | ~30 actions réelles, recherche de marché à jour, missions autonomes supervisées, mémoire de préférences (§6). |
| **Connecteurs email & agenda** | Lecture mails/agenda, détection d'estimations, brouillons, création de RDV (§10, sur autorisation Google). |
| **Studio média** | Visuels, voix, transcription (disponibles) ; vidéo / 3D / avatar / réunion / tonalité en option (§9). |
| **Prospection** | Acquéreurs et critères, annonces, matching avec score, missions. *Flux d'annonces & alertes WhatsApp : selon accès externes (§15).* |
| **Application bureau** | Version Mac/PC (en complément du web), installable et signée. |

> **Niveaux de maturité :** *pleinement opérationnel* pour le socle, l'accueil, le portefeuille, les clients, l'agenda, l'estimation, l'assistant, la sécurité et le studio média (briques disponibles) ; *opérationnel sous condition d'accès / autorisations externes* pour la connexion Google, le flux automatique d'annonces et les alertes WhatsApp (§15).

---

## 14. Exclusions / hors périmètre

| Hors périmètre | Précision |
|---|---|
| **Produit d'investissement immobilier tokenisé** | Le volet « Invest » est un **produit distinct**, non couvert par ce dossier. |
| **Applications mobiles natives (iOS / Android)** | Cible web (responsive) + bureau Mac/PC. Apps natives = évolution ultérieure. |
| **Diffusion d'annonces vers les portails** (SeLoger, Leboncoin…) | Phase ultérieure (avenant). |
| **Signature électronique des mandats** | Non incluse (envisageable ensuite). |
| **Comptabilité / facturation / honoraires avancés** | Hors périmètre. |
| **Reprise / migration depuis un ancien logiciel** | À cadrer séparément si nécessaire (§22). |
| **Coûts d'accès tiers** | Abonnements externes (annonces, WhatsApp, IA, hébergement) refacturés au réel ou à la charge du client (§20). |

> Tout élément hors périmètre pourra faire l'objet d'un **avenant** ou d'une **phase ultérieure**.

---

## 15. Hypothèses et dépendances

### Hypothèses
- Connexion internet stable et postes récents (web moderne).
- Utilisateurs créés par un administrateur (pas d'inscription libre).
- Éléments de marque fournis au démarrage (logo, nom, couleur d'accent).
- Contenus de référence (mentions de l'avis de valeur, modèles de message) validés par le client.

### Dépendances externes

| Dépendance | Usage | Statut / impact |
|---|---|---|
| **Connexion Google** (Gmail / Agenda) | Lecture mails, détection d'estimations, brouillons, RDV (§10) | **Autorisation à fournir.** Sans elle, connecteurs inactifs ; le reste fonctionne. |
| **Source d'annonces du marché** (ex. MoteurImmo) | Alimenter la prospection | **Accès à fournir.** Sans accès, prospection sur données saisies, sans flux automatique. |
| **Canal d'alerte WhatsApp** (ex. Twilio) | Alerter les acquéreurs | **Compte à fournir.** Sinon alertes par email. |
| **Moteur d'intelligence** (modèles de langage) | Assistant, rédaction, estimation, missions, média | Intégrés ; consommation à provisionner (coûts d'accès, §20). |
| **Données publiques** (transactions, cadastre, DPE) | Estimation | Sources officielles ouvertes — intégrées par l'éditeur. |

> **Point d'attention :** la richesse de la prospection automatique (flux d'annonces + alertes WhatsApp) et l'activation des connecteurs Gmail/Agenda dépendent de la mise à disposition des **accès / autorisations tiers** par le client. À trancher avant la phase concernée (§22).

---

## 16. Spécifications techniques de haut niveau

> _Section synthétique et non technique : les grandes briques, pas le code._

| Brique | Choix | Bénéfice pour le client |
|---|---|---|
| **Application web** | Technologie web moderne, rapide, à jour. | Accessible partout, sans installation, toujours à jour. |
| **Application bureau** | Mac/PC installable, **signée**. | Confort d'un logiciel posé, distribuable simplement. |
| **Base de données** | Hébergée (UE), **cloisonnement par agence**, index optimisés. | Données protégées, isolées, RGPD, réactives. |
| **Intelligence** | Modèles de langage de premier plan, ~30 outils d'action, orchestrés côté serveur. | Assistant performant ; aucune clé exposée côté utilisateur. |
| **Connecteurs** | Email / agenda (Google), source d'annonces, alerte, enrichissement. | Le Cockpit dialogue avec les outils de l'agence. |
| **Média** | Image / voix / transcription (+ vidéo, 3D, avatar en option), garde-fou de coût. | Contenus produits sans outil tiers, dépense maîtrisée. |
| **Sécurité** | Chiffrement, 2FA, journal d'audit, sessions révocables, accès cloisonnés. | Confidentialité, traçabilité en cas de litige. |
| **Hébergement & supervision** | Cloud managé + temps réel + supervision (erreurs, performances). | Disponibilité, performance, détection proactive. |

> **Engagements de qualité de service** (à préciser au contrat) : sauvegardes régulières, supervision, plan de reprise, **réversibilité des données**.

---

## 17. Données principales

| Donnée | Description | Relations clés |
|---|---|---|
| **Biens** | Type, adresse, surface, pièces, prix, statut. | Reliés aux mandats, visites, estimations. |
| **Clients** | Acheteurs et vendeurs (coordonnées, type, budget, source, statut). | Reliés aux visites, aux estimations. |
| **Visites / RDV** | Rendez-vous reliés à un client et à un bien. | Bien ↔ Client. |
| **Mandats** | Contrat de vente (type, prix, commission, échéance). | Reliés à un bien. |
| **Estimations** | Évaluation d'un bien et avis de valeur. | Peut devenir un bien / un mandat. |
| **Prospection** | Critères acquéreurs, annonces, correspondances et scores. | Annonce ↔ Critère. |
| **Préférences / mémoire** | Consignes confiées à l'assistant. | Par agent. |
| **Journal d'audit** | Connexions, activations 2FA, déconnexions horodatées. | Par agence / utilisateur. |
| **Agences / utilisateurs** | Cadre multi-utilisateur et cloisonnement. | Isole toutes les données ci-dessus. |

> **Garantie transverse :** chaque donnée est rattachée à une agence et à un agent. Une agence ne voit jamais les données d'une autre.

---

## 18. Livrables

1. **Le Cockpit en ligne**, déployé et opérationnel (production).
2. **L'application bureau** Mac/PC, signée, prête à distribuer.
3. **Les comptes utilisateurs** initiaux (administrateur + agents), 2FA activable.
4. **L'avis de valeur** au format document professionnel (charte du client).
5. **Un guide de prise en main** synthétique.
6. **Une séance de prise en main** (à distance).
7. **La documentation de réversibilité**.
8. **Le transfert de propriété** de la plateforme au paiement complet (§20).
9. **Le présent dossier**, signé, faisant foi du périmètre convenu.

---

## 19. Planning par phases

> _Durées indicatives, à confirmer au lancement. Chaque phase est adossée à un jalon de paiement (§20)._

| Phase | Intitulé | Contenu | Durée | Jalon |
|---|---|---|---|---|
| **0** | Cadrage & acquisition | Validation du dossier, accès & autorisations, marque, questions ouvertes tranchées. | ~1 sem. | **Signature → J1** |
| **1** | Mise en production V1 | Socle sécurisé (2FA, audit), accueil, Portefeuille, Clients, Agenda, Estimation, assistant omni-action. | ~3–4 sem. | **Livraison → J2** |
| **2** | Prospection & connecteurs | Flux d'annonces & matching, alertes, connecteurs Gmail/Agenda. | ~2–3 sem. | **Démo → J3** |
| **3** | Studio média & IA avancée | Contenus média (visuels, voix, options vidéo/3D/avatar), missions étendues. | ~2–3 sem. | **Démo → J4** |
| **4** | Recette, durcissement & transfert | App Mac/PC signée, performances, sécurité, recette finale, formation, **transfert de propriété**. | ~2 sem. | **Recette → J5** |

**Durée totale indicative : ~10 à 13 semaines** à compter de la signature, sous réserve de la mise à disposition des accès / autorisations externes en temps utile.

---

## 20. Investissement & échéancier de paiement

La présente proposition porte sur l'**acquisition de la plateforme Cockpit Immobilier** — déjà construite et démontrable — assortie de sa mise en production, de sa personnalisation, de son durcissement et de son transfert. L'investissement est **échelonné en jalons** : chaque versement est **adossé à une livraison vérifiable**.

> ### 💶 150 000 € HT — acquisition complète, en 5 versements de 30 000 €
> **Option Année 1 : jusqu'à 160 000 € HT** (maintenance, support & évolutions, +10 000 €).

### 20.1 Échéancier (5 jalons de 30 000 €)

| Versement | Jalon déclencheur | Montant HT | Cumulé |
|---|---|---:|---:|
| **1 — Signature** | À la signature : engagement, lancement, mise à disposition des accès. | 30 000 € | 30 000 € |
| **2 — Livraison V1** | Mise en production du Cockpit pour votre agence (socle sécurisé, CRM, agenda, estimation, assistant). | 30 000 € | 60 000 € |
| **3 — Phase 2** | Prospection automatisée + connecteurs email/agenda activés (détection d'estimations, brouillons, RDV). | 30 000 € | 90 000 € |
| **4 — Phase 3** | Studio média & intelligence avancée déployés (visuels, voix, options vidéo/3D, missions étendues). | 30 000 € | 120 000 € |
| **5 — Recette & transfert** | Recette finale, application bureau signée, formation, **transfert de propriété** et réversibilité. | 30 000 € | 150 000 € |
| **Total acquisition** | | **150 000 €** | **150 000 €** |

### 20.2 Option : Maintenance & évolutions, Année 1

> **Option recommandée — +10 000 € HT (total porté à 160 000 € HT).** Douze mois de **support**, **corrections**, **mises à jour de sécurité** et **petites évolutions** après la mise en production. Souscriptible à la signature ou à la recette finale. Au-delà, un contrat de maintenance annuel peut prendre le relais.

### 20.3 Conditions

- Montants exprimés **hors taxes** ; TVA en sus selon la réglementation applicable.
- Chaque jalon est **facturé à son acceptation** (cf. §21) ; règlement à 30 jours, à préciser au contrat.
- Les **coûts d'accès tiers** (source d'annonces, WhatsApp, moteurs d'intelligence, hébergement, génération média) sont **refacturés au réel ou à la charge du client** — non inclus dans le forfait.
- À la **recette finale et au paiement complet**, le client devient **propriétaire** de la plateforme et de ses données (transfert + réversibilité).
- Ce dossier vaut **proposition commerciale** ; le **devis / contrat** associé fait foi des conditions définitives.

---

## 21. Modalités de validation

- **Validation par phase.** Chaque phase se clôt par une **démonstration** ; validation ou remarques sous délai convenu (par défaut 5 jours ouvrés). La validation **déclenche le jalon de paiement** correspondant (§20).
- **Critères d'acceptation.** Chaque module est accepté lorsqu'il couvre les fonctions décrites et passe la **recette** (parcours-types §12 réalisables de bout en bout).
- **Recette finale.** Validation d'ensemble : estimer → mandat ; piloter le jour ; matcher un acquéreur ; gérer biens / clients / visites / agenda ; sécurité & traçabilité.
- **Boucle de retours.** Remarques consignées et priorisées (corrections incluses ; évolutions hors périmètre → avenant).
- **Mise en production & transfert** prononcés conjointement à l'issue de la recette finale.

> _Sans retour du client dans le délai convenu, un jalon est réputé accepté afin de ne pas bloquer le planning et l'échéancier._

---

## 22. Questions ouvertes

À **trancher avant ou pendant la Phase 0** ; elles n'empêchent pas la signature mais conditionnent certains choix.

1. **Connexion Google.** L'agence autorise-t-elle la connexion Gmail / Agenda ?
2. **Source d'annonces de marché.** Quel fournisseur (ex. MoteurImmo) ? Accès déjà disponible ?
3. **Canal d'alerte acquéreurs.** WhatsApp (Twilio), email, ou SMS ?
4. **Options média.** Quelles briques activer (vidéo, 3D, avatar, compte-rendu de réunion) ?
5. **Option maintenance Année 1.** Souscrite (+10 000 €) ou contrat séparé ?
6. **Multi-agences / multi-utilisateurs.** Combien d'agences et d'utilisateurs ? Quels rôles et droits ?
7. **Marque.** Logo, nom commercial, couleur d'accent, mentions légales de l'avis de valeur.
8. **Hébergement & RGPD.** Localisation, durée de conservation, politique d'effacement, registre des traitements.
9. **Reprise de données.** Importer un portefeuille / des contacts ? Sous quel format ?
10. **Diffusion d'annonces / signature électronique.** À prévoir en évolution (avenant) ?

---

## 23. Synthèse — ce sur quoi nous demandons votre accord

En signant, le client **valide** :

- la **vision** et les **objectifs** du Cockpit Immobilier (§1–4) ;
- la **navigation cible** à cinq entrées (§5) ;
- l'**assistant omni-action**, le **studio média** et les **connecteurs email/agenda** (§6, §9, §10) ;
- la **place centrale de l'estimation** (dont email entrant) (§7) ;
- le niveau de **sécurité & conformité** (2FA, audit, cloisonnement, RGPD) (§11) ;
- le **périmètre livré** et ses **exclusions** (§13–14) ;
- le **déroulé en phases**, l'**investissement & l'échéancier** et les **modalités de validation** (§19–21).

Et **s'engage sur l'acquisition** de la plateforme aux conditions de la §20.

---

## 24. Accord formel d'acquisition & de lancement

> Le présent accord vaut validation du périmètre décrit dans ce dossier (version 2.0), engagement sur l'investissement de la §20, et autorisation de démarrage. Les modalités définitives (TVA, dates, conditions de règlement) sont précisées dans le devis / contrat associé.

**Périmètre de référence :** Dossier « Cockpit Immobilier » v2.0 du 11 juin 2026 (présent document).

**Investissement retenu :** ☐ 150 000 € HT (acquisition)  ☐ 160 000 € HT (avec option maintenance Année 1)

**Questions ouvertes (§22) :** ☐ tranchées et annexées  ☐ à traiter en Phase 0

<br>

| | **Pour le client** | **Pour l'éditeur** |
|---|---|---|
| **Société** | ____________________________ | ____________________________ |
| **Nom & prénom** | ____________________________ | ____________________________ |
| **Fonction** | ____________________________ | ____________________________ |
| **Date** | ______ / ______ / __________ | ______ / ______ / __________ |
| **Signature** _(« Bon pour accord, acquisition et lancement »)_ | <br><br>____________________________ | <br><br>____________________________ |

<br>

☐ **J'ai pris connaissance de l'intégralité du dossier, je m'engage sur l'acquisition de la plateforme et j'autorise le lancement.**

<br>

---

_Document confidentiel — © 2026 — Tous droits réservés. Établi pour présentation client. Les montants indiqués valent proposition commerciale ; le devis / contrat associé fait foi. Le périmètre fait foi ; toute évolution hors périmètre fera l'objet d'un avenant._
