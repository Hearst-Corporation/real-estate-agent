# Cockpit Immobilier — Dossier de présentation client

> **Plateforme de pilotage du métier d'agent immobilier**
> Document de présentation et d'accord de lancement

| | |
|---|---|
| **Destinataire** | _[Nom du client / de l'agence]_ |
| **Émis par** | _[Votre société]_ |
| **Date** | 8 juin 2026 |
| **Version du document** | 1.0 — pour validation |
| **Statut** | En attente d'accord de lancement |
| **Confidentialité** | Document confidentiel — diffusion restreinte |

---

## 1. Résumé exécutif

Le **Cockpit Immobilier** est un logiciel unique qui réunit, dans un même poste de travail, **tout le quotidien de l'agent immobilier** : la prospection, le portefeuille de biens et de mandats, le suivi des clients acheteurs et vendeurs, l'agenda des visites, et l'estimation des biens.

Là où la plupart des agences jonglent aujourd'hui entre un tableur, une boîte mail, un agenda, un outil d'annonces et plusieurs sites de prospection, le Cockpit rassemble l'essentiel **au même endroit, avec une interface claire et un seul fil conducteur** : l'agent ouvre son cockpit le matin, voit ce qui compte (relances, visites, mandats à renouveler, estimations en cours), et agit.

Sa singularité tient à deux partis pris forts :

1. **Une assistance intelligente présente partout, pas dans un coin.** Le Cockpit embarque un assistant qui ne se contente pas de répondre : il **agit dans l'application** pour l'agent — créer un contact, planifier une visite, rédiger une approche, lancer une estimation, comparer des prix de marché — et peut mener des recherches de fond en autonomie. Cette intelligence n'est pas une « rubrique » à part : elle est **tissée dans chaque écran**.

2. **L'estimation comme geste central du métier.** Estimer un bien est l'acte qui ouvre la relation vendeur et qui crédibilise l'agent. Le Cockpit en fait **une action immédiate, accessible en un clic** depuis l'accueil, le portefeuille, la fiche d'un client vendeur et l'agenda. L'estimation s'appuie sur des **données officielles** (transactions réelles, cadastre, diagnostics énergétiques) et produit un **avis de valeur professionnel** prêt à être remis au client.

Le présent dossier décrit la vision, le périmètre de la première version (V1), le déroulé du projet et les modalités de validation. Il se conclut par un **accord formel de lancement** à signer pour démarrer le développement.

**Ce que le client obtient à l'issue de la V1 :** un cockpit web (et application bureau Mac/PC) opérationnel, sécurisé, prêt à équiper un agent ou une agence, couvrant la gestion complète des biens, des clients, des visites et des mandats, une estimation de bout en bout, et une assistance intelligente intégrée.

---

## 2. Objectifs du produit

Le Cockpit poursuit cinq objectifs concrets, mesurables, alignés sur la réalité du métier.

| # | Objectif | Ce que ça change pour l'agent |
|---|---|---|
| **O1** | **Centraliser le quotidien** en un seul outil | Fini le va-et-vient entre tableur, mail, agenda et sites tiers. Un seul endroit, une seule vérité. |
| **O2** | **Faire gagner du temps** sur les tâches répétitives | L'assistant crée des fiches, planifie, rédige des messages et prépare les estimations à la place de l'agent. |
| **O3** | **Professionnaliser la relation vendeur** par l'estimation | Un avis de valeur sérieux, sourcé sur des données réelles, remis vite et bien — argument décisif pour décrocher le mandat. |
| **O4** | **Ne rien laisser tomber** (relances, mandats, RDV) | L'accueil signale chaque jour ce qui doit être traité : leads à relancer, visites à venir, mandats qui expirent, estimations à terminer. |
| **O5** | **Donner une longueur d'avance** par l'intelligence intégrée | Détection d'opportunités, mise en relation acquéreur ↔ bien, données de marché à jour, missions autonomes de prospection. |

**Critère de réussite global de la V1 :** un agent immobilier peut piloter l'intégralité de son activité courante dans le Cockpit, **sans recourir à un autre logiciel** pour les fonctions couvertes, et estimer un bien de bout en bout en quelques minutes.

---

## 3. Utilisateurs cibles

| Profil | Rôle | Attentes prioritaires |
|---|---|---|
| **Agent immobilier indépendant / mandataire** | Utilisateur principal au quotidien | Simplicité, rapidité, mobilité, estimation crédible, relances automatiques. |
| **Négociateur en agence** | Utilisateur intensif (terrain + bureau) | Gestion de portefeuille, agenda dense, suivi clients, productivité. |
| **Directeur / responsable d'agence** | Pilotage et supervision | Vision d'ensemble, suivi de l'activité, cadre et sécurité des données. |
| **Assistant(e) commercial(e)** | Saisie, organisation, support | Création rapide de fiches, planification, préparation des dossiers. |

**Profil-type retenu pour la conception V1 :** l'**agent au quotidien**, en mobilité, qui veut un outil rapide, qui ne se perd pas dans des menus, et qui valorise chaque minute. Toutes les décisions d'interface sont prises de son point de vue.

> _Niveau de compétence supposé : aisance numérique standard (smartphone, mail, web). Le Cockpit ne demande aucune compétence technique. Aucune formation longue n'est requise — la prise en main se fait à l'usage._

---

## 4. Vision fonctionnelle

Le Cockpit est organisé autour d'**une idée simple** : *un poste de pilotage où l'agent voit, décide et agit*, avec une assistance intelligente toujours à portée de main.

```
┌──────────────────────────────────────────────────────────────────────┐
│  COCKPIT IMMOBILIER                                                     │
│                                                                        │
│   Accueil   Prospection   Portefeuille   Clients   Agenda     [Assistant] │
│   ───────   ───────────   ────────────   ───────   ──────       (rail   │
│                                                                  droit) │
│   • Ce qui compte aujourd'hui (relances, visites, mandats, estim.)     │
│   • Actions rapides — ESTIMER un bien en 1 clic                        │
│   • L'assistant agit dans chaque écran, à la demande                   │
└──────────────────────────────────────────────────────────────────────┘
```

Trois principes structurent l'expérience :

- **Voir d'abord, agir ensuite.** L'accueil met en avant ce qui demande une décision *aujourd'hui*. L'agent n'a pas à chercher : l'outil lui présente.
- **L'action à un clic.** Les gestes fréquents — estimer, créer un contact, planifier une visite, ouvrir une fiche — sont accessibles en permanence, sans détour.
- **L'intelligence en soutien continu.** L'assistant accompagne l'agent dans chaque module : il prépare, rédige, recherche, planifie et, à la demande, mène des missions de fond.

L'objectif n'est pas de remplacer le jugement de l'agent, mais de **lui retirer la charge mentale et administrative** pour qu'il se concentre sur ce qui compte : la relation client et la signature.

---

## 5. Navigation cible

La navigation principale tient en **cinq entrées**, lisibles d'un coup d'œil. C'est volontaire : un agent doit pouvoir tout atteindre sans réfléchir.

| Entrée | Rôle | Contenu |
|---|---|---|
| **Accueil** | Le poste de pilotage | Vue du jour, indicateurs clés, actions rapides (dont **Estimer**), portefeuille récent. |
| **Prospection** | Trouver des biens et des acquéreurs | Acquéreurs et leurs critères, annonces du marché, mise en relation automatique (matching), missions de prospection. |
| **Portefeuille** | Les biens et les mandats | Biens gérés, **Estimations**, mandats. Sous-onglets : *Biens · Estimations · Mandats*. |
| **Clients** | Le CRM acheteurs / vendeurs | Contacts (acheteurs et vendeurs), historique, visites. Sous-onglets : *Contacts · Visites*. |
| **Agenda** | L'organisation du temps | Visites et rendez-vous, vue calendrier, préparation des journées. |

**Toujours présent, en complément de ces cinq entrées :**

- **L'assistant intelligent**, dans un rail latéral repliable, accessible depuis n'importe quel écran.
- **Le bouton « Créer »**, qui propose les gestes fréquents : **Nouvelle estimation**, Nouveau client, Nouvelle visite, Nouveau bien.

> **Note de conception importante.** L'intelligence artificielle **n'a délibérément pas d'entrée dans cette barre de navigation**. Ce n'est pas un module à visiter : c'est une capacité présente *dans* chaque module. De même, l'**estimation** est volontairement rendue accessible depuis plusieurs points d'entrée (accueil, portefeuille, fiche client vendeur, agenda) parce que c'est un geste qui survient dans plusieurs contextes du métier — pas une page que l'on « va chercher ».

---

## 6. Rôle transversal de l'intelligence artificielle

> **Principe directeur : l'IA n'est pas une rubrique. C'est une capacité intégrée partout dans le Cockpit.**

L'agent ne « va pas dans l'IA ». L'intelligence est **disponible dans le contexte de chaque écran**, comme un collaborateur silencieux qui connaît le dossier en cours et sait agir.

Concrètement, l'assistance intelligente se manifeste de quatre façons :

### 6.1 Un assistant qui agit (pas seulement qui répond)

Depuis le rail latéral, l'agent parle en langage naturel et l'assistant **exécute réellement les actions** dans l'application :

- *« Crée un contact vendeur, Mme Martin, 06 12 34 56 78, appartement à Lyon »* → la fiche est créée.
- *« Planifie une visite avec M. Dupont pour le bien rue de la République demain 15h »* → la visite est planifiée, reliée au bon client et au bon bien.
- *« Lance une estimation pour ce bien »* → l'entretien d'estimation s'ouvre directement.
- *« Fais-moi un résumé de la semaine »* → l'assistant rassemble leads, visites, mandats et estimations et synthétise.

L'assistant enchaîne **plusieurs étapes seul**, sans redemander à chaque fois, jusqu'à accomplir la demande complète. Les actions sensibles (envoi d'un avis de valeur par email, suppression) demandent **toujours une confirmation explicite**.

### 6.2 Une intelligence présente dans chaque module

| Module | Apport de l'intelligence intégrée |
|---|---|
| **Accueil** | Hiérarchise ce qui compte aujourd'hui ; suggère les prochaines actions. |
| **Prospection** | Met en relation automatiquement les biens du marché avec les critères des acquéreurs (*matching*) ; mène des missions de recherche de vendeurs. |
| **Portefeuille** | Aide à rédiger une annonce, à préparer un mandat, à comparer un bien au marché. |
| **Clients** | Rédige messages et relances ; prépare l'argumentaire d'une visite. |
| **Agenda** | Prépare les rendez-vous (fiche du bien, points clés, itinéraire d'argumentation). |
| **Estimation** | Conduit l'entretien, agrège les données de marché, rédige l'avis de valeur. |

### 6.3 Des données de marché toujours à jour

L'assistant peut **interroger le web et le marché en direct** pour ramener des éléments factuels et sourcés : prix au m² d'un secteur, annonces concurrentes, tendance d'un quartier, informations locales (écoles, transports, projets urbains). **Règle de confiance : l'assistant n'invente jamais un chiffre de marché** — soit il le source, soit il le dit.

### 6.4 Des missions autonomes

Pour les objectifs larges — *« trouve des propriétaires susceptibles de vendre dans le 11e et prépare une approche »* — l'agent peut **déléguer une mission** à une équipe d'agents intelligents qui travaille en fond et rend compte de son avancement.

> **Ce que l'IA ne fait pas :** elle ne décide pas à la place de l'agent, ne signe rien, n'envoie rien d'engageant sans validation. Elle prépare, propose, exécute les tâches confiées — l'agent garde la main.

---

## 7. Place de l'estimation

> **Principe directeur : l'estimation est une action forte, accessible immédiatement depuis plusieurs points du Cockpit.**

Estimer un bien est le geste qui **ouvre la relation vendeur** et qui **distingue l'agent**. Le Cockpit le traite en conséquence : non comme une page enfouie, mais comme **une action proéminente, déclenchable depuis les contextes où le besoin surgit**.

### 7.1 Quatre points d'entrée vers l'estimation

| Depuis… | Pourquoi |
|---|---|
| **L'accueil** | « Nouvelle estimation » est l'**action rapide mise en avant** (bouton principal). C'est le premier geste proposé chaque matin. |
| **Le portefeuille** | Onglet **Estimations** dédié + création directe. L'estimation vit au cœur de la gestion des biens. |
| **La fiche d'un client vendeur** | Estimer le bien d'un vendeur **depuis son dossier**, sans ressaisir ses informations. |
| **L'agenda** | Préparer ou déclencher une estimation **autour d'un rendez-vous** (avant une visite vendeur, par exemple). |

### 7.2 Une estimation sérieuse, fondée sur des données officielles

L'estimation ne repose pas sur une simple intuition de prix. Elle s'appuie sur des **sources de données publiques et officielles** :

- **Transactions réelles** (valeurs foncières effectivement enregistrées) ;
- **Cadastre** (identification et caractéristiques du bien) ;
- **Diagnostics de performance énergétique** (étiquette DPE) ;
- **Géolocalisation et comparables** du secteur ;
- **Indice de prix** local (pour ramener les transactions anciennes à aujourd'hui).

**La méthode est transparente et défendable :** le Cockpit part du prix au m² réel du secteur (médiane des transactions comparables), applique des **ajustements clairs** (étiquette énergétique, étage et ascenseur, exposition, état, prestations…), valorise séparément les annexes (parking, cave, terrasse), et restitue une **valeur de marché assortie d'une fourchette et d'un niveau de confiance**. Il propose aussi une **stratégie de mise en vente** (prix conseillé, positionnement). L'agent garde toujours la main pour ajuster.

### 7.3 Un déroulé de bout en bout

```
   Lancer          Entretien            Avis de            Remettre
  l'estimation  →  guidé (assisté)  →   valeur       →     au client
                    (caractéristiques    professionnel       (email)
                     + marché)           (document PDF)         │
                                                               ▼
                                              Convertir en fiche bien / mandat
```

1. **Lancement** en un clic (accueil, portefeuille, fiche vendeur, agenda).
2. **Entretien guidé** : l'assistant aide à renseigner les caractéristiques (type, surface, pièces, étage, état, DPE, occupation…) et agrège les données de marché.
3. **Avis de valeur** : génération d'un **document professionnel** prêt à présenter.
4. **Remise au client** : envoi par email (avec confirmation), **lien de consultation sécurisé** (valable 30 jours) ou impression du document.
5. **Continuité commerciale** : transformation de l'estimation en **fiche bien** puis en **mandat**, sans ressaisie.

> L'estimation n'est donc pas une fin en soi : c'est **le point de départ d'un parcours commercial** qui se prolonge naturellement vers le mandat et la mise en vente.

---

## 8. Fonctionnalités détaillées par module

### 8.1 Accueil — le poste de pilotage

- **Indicateurs clés** en un coup d'œil : nombre de biens, leads actifs, visites à venir, mandats actifs.
- **« Aujourd'hui »** : les quatre listes qui demandent une décision —
  - leads à relancer (sans contact depuis 7 jours) ;
  - visites dans les 48 h ;
  - mandats qui expirent sous 30 jours ;
  - estimations en cours à terminer.
- **Actions rapides** : **Estimer** (mise en avant), Nouveau client, Nouvelle visite, Nouveau bien, Lancer une prospection.
- **Portefeuille récent** : les derniers biens, accès direct à leur fiche.

### 8.2 Prospection — trouver biens et acquéreurs

- **Acquéreurs** : les clients en recherche et leurs **critères** (budget, zones, type de bien, surface, pièces).
- **Annonces du marché** : les biens collectés sur le marché (avec repérage des annonces de particulier à particulier).
- **Matching automatique** : mise en relation **annonce ↔ critère acquéreur**, avec **score de correspondance** et alerte au-delà d'un seuil.
- **Missions de prospection** : objectifs de recherche confiés à l'assistant (ex. trouver des vendeurs sur un secteur).
- _Alertes acquéreurs (email / WhatsApp) :_ prévues, sous réserve des accès externes (voir §11–12).

### 8.3 Portefeuille — biens, estimations, mandats

- **Biens** : liste et fiche détaillée (type, adresse, surface, pièces, prix, statut), parcours de statut (*prospect → estimation → mandat → en vente → sous offre → vendu*), vues liste et tableau visuel (kanban).
- **Estimations** : voir §7 — création, entretien guidé, avis de valeur, suivi des estimations en cours.
- **Mandats** : création (simple / exclusif), référence, prix, commission, dates de signature et d'expiration, **alerte d'expiration**.

### 8.4 Clients — le CRM acheteurs / vendeurs

- **Contacts** : fiche unifiée acheteur **ou** vendeur, type (particulier, professionnel, société, SCI…), coordonnées, budget, source, notes.
- **Parcours commercial** : statut du lead (*nouveau → contacté → qualifié → visite → offre → gagné / perdu*).
- **Visites** : rendez-vous reliés à un client et à un bien, statut (planifiée, confirmée, réalisée, annulée, no-show).
- **Estimation depuis la fiche vendeur** : lancement direct (voir §7).

### 8.5 Agenda — l'organisation du temps

- **Vue calendrier** des visites et rendez-vous.
- **Planification** reliée aux clients et aux biens.
- **Préparation** des rendez-vous (assistance contextuelle).
- **Déclenchement d'une estimation** en lien avec un rendez-vous vendeur.

### 8.6 Capacités transverses (présentes dans tous les modules)

- **Assistant intelligent** (rail latéral) — voir §6.
- **Recherche** unifiée des biens, clients, visites, mandats.
- **Mémoire de préférences** : l'assistant retient les consignes de l'agent (« mémorise : … ») et les applique.
- **Sécurité et cloisonnement** : chaque agent / agence ne voit que ses propres données.

---

## 9. Parcours utilisateurs

### Parcours A — « Je décroche un mandat grâce à une estimation »

1. Un propriétaire contacte l'agent. Depuis l'**accueil**, l'agent clique sur **Estimer**.
2. L'**entretien guidé** s'ouvre ; l'assistant aide à renseigner le bien et ramène les prix de marché du secteur.
3. L'agent obtient un **avis de valeur professionnel** et le **remet au vendeur** (email).
4. Le vendeur accepte ; en deux clics, l'estimation devient une **fiche bien** puis un **mandat**.
5. Le bien apparaît au **portefeuille** ; le mandat est suivi avec son échéance.

### Parcours B — « Je ne laisse passer aucune relance »

1. Le matin, l'agent ouvre l'**accueil** : trois leads à relancer, deux visites à 48 h, un mandat qui expire.
2. Il demande à l'**assistant** : *« prépare un message de relance pour ces leads »*.
3. Il valide, planifie une visite, et le tableau du jour se vide au fil de la journée.

### Parcours C — « Je connecte un acheteur au bon bien »

1. Un acquéreur précise ses critères ; l'agent les saisit (ou dicte à l'assistant) dans **Prospection**.
2. Le **matching** signale une annonce du marché qui correspond, avec un **score élevé**.
3. L'agent contacte l'acquéreur et planifie une visite — le tout depuis le Cockpit.

### Parcours D — « Je délègue une recherche de vendeurs »

1. L'agent confie une **mission** : *« trouve des propriétaires susceptibles de vendre dans le 11e »*.
2. L'équipe d'agents intelligents travaille en fond et rend compte.
3. L'agent récupère une liste qualifiée et une **approche prête** à personnaliser.

---

## 10. Périmètre de la V1

La V1 livre un **cockpit complet et utilisable en production** pour un agent ou une agence.

### Inclus dans la V1

| Domaine | Contenu |
|---|---|
| **Socle & sécurité** | Connexion sécurisée (email + mot de passe), cloisonnement des données par agent/agence, sessions maîtrisées. |
| **Accueil** | Pilotage du jour, indicateurs, actions rapides, portefeuille récent. |
| **Portefeuille** | Biens (fiche complète + parcours de statut + vues liste/kanban), mandats (cycle complet + alerte d'expiration). |
| **Clients (CRM)** | Contacts acheteurs/vendeurs, parcours commercial, visites reliées aux biens. |
| **Agenda** | Calendrier des visites et rendez-vous, planification. |
| **Estimation** | Parcours complet : lancement multi-contexte, entretien guidé, avis de valeur, remise par email, conversion en bien/mandat — sur données officielles. |
| **Intelligence intégrée** | Assistant qui agit dans tous les modules, recherche de marché à jour, missions autonomes, mémoire de préférences. |
| **Prospection** | Acquéreurs et critères, annonces du marché, matching avec score. *Ingestion d'annonces et alertes WhatsApp : selon disponibilité des accès externes (voir §11–12).* |
| **Application bureau** | Version Mac/PC (en complément du web), installable et signée. |

### Niveaux de maturité à la livraison V1

- **Pleinement opérationnel :** socle, accueil, portefeuille, clients, agenda, estimation, assistant.
- **Opérationnel sous condition d'accès externes :** ingestion automatique d'annonces de marché et alertes acquéreurs par WhatsApp (dépendent des fournisseurs tiers, voir §11–12).

---

## 11. Exclusions / hors périmètre

Pour cadrer clairement l'engagement, **ne font pas partie de la V1** :

| Hors périmètre V1 | Précision |
|---|---|
| **Produit d'investissement immobilier tokenisé** | Le volet « Invest » (souscription, conformité, registre on-chain) est un **produit distinct**, non couvert par ce dossier. |
| **Applications mobiles natives (iOS / Android)** | La V1 cible le web (responsive mobile) et le bureau Mac/PC. Les apps natives sont une évolution ultérieure. |
| **Diffusion d'annonces vers les portails** (SeLoger, Leboncoin, etc.) | La publication multi-portails est envisagée en phase ultérieure. |
| **Lecture automatique des emails et de l'agenda externe** (Gmail / Outlook) | Annoncé « bientôt » dans le produit ; intégration en phase 2. |
| **Signature électronique des mandats** | Non incluse en V1 (envisageable ensuite). |
| **Comptabilité / facturation / honoraires avancés** | Hors périmètre. |
| **Reprise/migration de données depuis un ancien logiciel** | À cadrer séparément si nécessaire (voir §22). |

> Tout élément hors périmètre pourra faire l'objet d'un **avenant** ou d'une **phase ultérieure** après la V1.

---

## 12. Hypothèses et dépendances

### Hypothèses

- L'agence dispose d'une connexion internet stable et de postes récents (web moderne).
- Les utilisateurs sont créés par un administrateur (pas d'inscription libre) — modèle adapté à une agence.
- Le client fournit, au démarrage, les éléments de marque souhaités (logo, nom, couleur d'accent) le cas échéant.
- Les contenus de référence (mentions légales de l'avis de valeur, modèles de message) sont validés par le client.

### Dépendances externes

| Dépendance | Usage | Statut / impact |
|---|---|---|
| **Source d'annonces du marché** (ex. agrégateur type MoteurImmo) | Alimenter la prospection en annonces | **Accès à fournir.** Sans accès, la prospection fonctionne sur les données saisies/disponibles, sans flux automatique. |
| **Canal d'alerte WhatsApp** (ex. Twilio) | Alerter les acquéreurs sur un bien correspondant | **Compte à fournir.** Sans cela, les alertes se font par email. |
| **Moteur d'intelligence** (modèles de langage) | Assistant, rédaction, estimation, missions | Fournisseurs déjà identifiés ; clés à provisionner. |
| **Données publiques** (transactions, cadastre, DPE) | Estimation | Sources officielles ouvertes — intégrées par l'éditeur. |
| **Connexion email / agenda externe** (phase 2) | Scan des mails, lecture d'agenda | Hors V1 ; nécessitera une autorisation du client. |

> **Point d'attention :** la **richesse de la prospection automatique** (flux d'annonces + alertes WhatsApp) dépend directement de la mise à disposition des **accès tiers**. Ce point fait l'objet d'une question ouverte (voir §22) à trancher avant le démarrage de la phase concernée.

---

## 13. Contraintes

| Type | Contrainte | Implication |
|---|---|---|
| **Confidentialité / RGPD** | Les données (clients, biens, estimations) sont des données personnelles et commerciales sensibles. | Cloisonnement strict par agence, hébergement maîtrisé, droit à l'effacement, journalisation des accès. |
| **Sécurité** | Accès réservé aux utilisateurs autorisés. | Authentification robuste, sessions révocables, aucune donnée d'une agence visible par une autre. |
| **Fiabilité de l'estimation** | Un avis de valeur engage la crédibilité de l'agent. | Données sourcées, **jamais de chiffre inventé**, mentions et réserves claires sur le document. |
| **Simplicité d'usage** | L'agent n'est pas un informaticien. | Zéro jargon, parcours courts, prise en main immédiate. |
| **Disponibilité** | Outil utilisé en mobilité, toute la journée. | Bonnes performances, fonctionnement fluide sur mobile et bureau. |
| **Cohérence visuelle** | Image professionnelle. | Charte graphique unifiée sur tous les écrans et documents produits. |

---

## 14. Spécifications UX / UI

### Principes

- **Clarté avant tout.** Cinq entrées de navigation, des écrans aérés, une information hiérarchisée.
- **L'action toujours à portée.** Gestes fréquents (estimer, créer, planifier) accessibles en un clic depuis n'importe où.
- **Cohérence totale.** Une charte unique (couleurs, typographie, composants) sur l'ensemble des écrans et des documents.
- **Responsive.** Pensé pour le bureau **et** le mobile (l'agent est sur le terrain).
- **Rassurant.** Confirmations explicites pour les actions sensibles ; messages clairs ; jamais de surprise.

### Identité visuelle

- **Design system « Cockpit »** : interface sobre et moderne, ambiance verre dépoli, accent de marque personnalisable.
- **Assistant en rail latéral repliable** : présent sans être envahissant.
- **Documents produits** (avis de valeur) à la **même identité** que l'application : cohérence de marque jusqu'au document remis au client.

### Accessibilité & confort

- Contrastes lisibles, tailles de texte confortables, navigation au clavier.
- Libellés en **français**, clairs et orientés métier (pas de vocabulaire technique).
- États vides explicites (« aucun lead à relancer ») plutôt que des écrans muets.

---

## 15. Spécifications techniques de haut niveau

> _Section volontairement synthétique et non technique. Elle décrit les grandes briques, pas le code._

| Brique | Choix | Bénéfice pour le client |
|---|---|---|
| **Application web** | Technologie web moderne, rapide, à jour. | Accessible partout, sans installation, toujours à la dernière version. |
| **Application bureau** | Version Mac/PC installable, **signée** (pas d'alerte de sécurité à l'installation). | Confort d'un logiciel « posé » sur l'ordinateur, distribuable simplement. |
| **Base de données** | Base hébergée sécurisée (région Europe), **cloisonnement par agence**. | Données protégées, isolées, conformes RGPD. |
| **Intelligence** | Modèles de langage de premier plan, orchestrés côté serveur. | Assistant performant ; **aucune clé ni traitement sensible exposé côté utilisateur**. |
| **Données d'estimation** | Sources publiques officielles (transactions, cadastre, DPE). | Estimations crédibles et défendables. |
| **Sécurité** | Connexion chiffrée, sessions maîtrisées et révocables, accès cloisonnés. | Tranquillité sur la confidentialité. |
| **Hébergement** | Infrastructure cloud managée + composants temps réel. | Disponibilité et performance. |

**Engagements de qualité de service (à préciser au contrat) :** sauvegardes régulières, supervision, plan de reprise, et **réversibilité des données** (le client reste propriétaire de ses données et peut les récupérer).

---

## 16. Données principales

Les informations gérées par le Cockpit, en langage métier :

| Donnée | Description | Relations clés |
|---|---|---|
| **Biens** | Les biens du portefeuille (type, adresse, surface, pièces, prix, statut). | Reliés aux mandats, visites, estimations. |
| **Clients (leads)** | Acheteurs et vendeurs (coordonnées, type, budget, source, statut commercial). | Reliés aux visites, aux estimations. |
| **Visites / rendez-vous** | Les rendez-vous, reliés à un client et à un bien. | Bien ↔ Client. |
| **Mandats** | Le contrat de vente confié (type, prix, commission, échéance). | Reliés à un bien. |
| **Estimations** | L'évaluation d'un bien et son avis de valeur. | Peut devenir un bien / un mandat. |
| **Prospection** | Critères acquéreurs, annonces du marché, correspondances (matchs) et scores. | Annonce ↔ Critère. |
| **Préférences / mémoire** | Les consignes que l'agent confie à l'assistant. | Par agent. |
| **Agences / utilisateurs** | Le cadre multi-utilisateur et le cloisonnement. | Isole toutes les données ci-dessus. |

> **Garantie transverse :** chaque donnée est **rattachée à une agence et à un agent**. Une agence ne voit jamais les données d'une autre.

---

## 17. Livrables

À l'issue du projet, le client reçoit :

1. **Le Cockpit en ligne**, déployé et opérationnel (environnement de production).
2. **L'application bureau** Mac/PC, signée, prête à distribuer.
3. **Les comptes utilisateurs** initiaux (administrateur + agents).
4. **L'avis de valeur** au format document professionnel (modèle à la charte du client).
5. **Un guide de prise en main** synthétique (quelques pages, orienté usage).
6. **Une séance de prise en main** (à distance) avec l'équipe.
7. **La documentation de réversibilité** (récupération des données).
8. **Le présent dossier**, signé, faisant foi du périmètre convenu.

---

## 18. Planning par phases

> _Durées indicatives, à confirmer au lancement. Les phases peuvent se chevaucher partiellement._

| Phase | Intitulé | Contenu | Durée indicative | Jalon |
|---|---|---|---|---|
| **Phase 0** | Cadrage & accord | Validation de ce dossier, accès, identité de marque, questions ouvertes tranchées. | ~1 semaine | **Signature de lancement** |
| **Phase 1** | Socle & CRM | Connexion sécurisée, cockpit, accueil, **Portefeuille** (biens, mandats), **Clients** (contacts, visites), **Agenda**. | ~3–4 semaines | Démo CRM |
| **Phase 2** | Estimation & intelligence | **Estimation** de bout en bout (multi-contexte, avis de valeur), **assistant** qui agit dans tous les modules, recherche de marché. | ~3–4 semaines | Démo Estimation + Assistant |
| **Phase 3** | Prospection | Acquéreurs & critères, annonces du marché, **matching** & scores, alertes (selon accès externes), missions autonomes. | ~2–3 semaines | Démo Prospection |
| **Phase 4** | Bureau, durcissement & recette | Application Mac/PC signée, performances, sécurité, recette finale, prise en main. | ~2 semaines | **Recette & mise en production** |

**Durée totale indicative : ~11 à 14 semaines** à compter de la signature, sous réserve de la mise à disposition des accès externes en temps utile.

> _Le calendrier précis (dates, jalons de paiement) est arrêté dans le devis / contrat associé à cet accord._

---

## 19. Modalités de validation

- **Validation par phase.** Chaque phase se clôt par une **démonstration** ; le client valide ou émet des remarques sous un délai convenu (par défaut 5 jours ouvrés).
- **Critères d'acceptation.** Chaque module est accepté lorsqu'il couvre les fonctions décrites dans ce dossier et passe la **recette** (parcours-types §9 réalisables de bout en bout).
- **Recette finale (V1).** Validation d'ensemble sur les parcours-clés : estimer → mandat ; piloter le jour ; matcher un acquéreur ; gérer biens/clients/visites/agenda.
- **Boucle de retours.** Les remarques sont consignées et priorisées (corrections incluses ; évolutions hors périmètre → avenant).
- **Mise en production** prononcée conjointement à l'issue de la recette finale.

> _Sans retour du client dans le délai convenu, un jalon est réputé accepté afin de ne pas bloquer le planning._

---

## 20. Questions ouvertes

Ces points sont à **trancher avant ou pendant la Phase 0** ; ils n'empêchent pas la signature mais conditionnent certains choix.

1. **Source d'annonces de marché.** Quel fournisseur pour alimenter la prospection (ex. agrégateur type MoteurImmo) ? Le client dispose-t-il déjà d'un accès ?
2. **Canal d'alerte acquéreurs.** WhatsApp (via Twilio), email, ou SMS pour la V1 ?
3. **Multi-agences / multi-utilisateurs.** Combien d'agences et d'utilisateurs à équiper ? Quels rôles (agent, directeur, assistant) et quels droits ?
4. **Marque.** Logo, nom commercial, couleur d'accent, mentions légales de l'avis de valeur.
5. **Hébergement & RGPD.** Localisation des données, durée de conservation, politique d'effacement, registre des traitements.
6. **Reprise de données.** Faut-il importer un portefeuille / des contacts depuis un logiciel existant ? Sous quel format ?
7. **Agenda externe.** Synchronisation Google/Outlook souhaitée (phase 2) ?
8. **Diffusion d'annonces.** Publication vers les portails attendue ultérieurement ? Lesquels en priorité ?
9. **Signature électronique des mandats.** À prévoir en évolution ?

---

## 21. Synthèse — ce sur quoi nous demandons votre accord

En signant ci-dessous, le client **valide** :

- la **vision** et les **objectifs** du Cockpit Immobilier (§1–4) ;
- la **navigation cible** à cinq entrées — Accueil, Prospection, Portefeuille, Clients, Agenda (§5) ;
- le **rôle transversal de l'intelligence** (capacité intégrée partout, non une rubrique) (§6) ;
- la **place centrale de l'estimation** (action forte multi-contexte) (§7) ;
- le **périmètre de la V1** et ses **exclusions** (§10–11) ;
- les **hypothèses, dépendances et contraintes** (§12–13) ;
- le **déroulé en phases** et les **modalités de validation** (§18–19).

Et **autorise le démarrage du développement** sur cette base.

---

## 22. Accord formel de lancement

> Le présent accord vaut validation du périmètre décrit dans ce dossier (version 1.0) et autorisation de démarrage du développement de la V1. Les modalités commerciales (prix, échéancier, conditions) sont définies dans le devis / contrat associé.

**Périmètre de référence :** Dossier « Cockpit Immobilier » v1.0 du 8 juin 2026 (présent document).

**Questions ouvertes (§20) :** ☐ tranchées et annexées  ☐ à traiter en Phase 0

<br>

| | **Pour le client** | **Pour l'éditeur** |
|---|---|---|
| **Société** | ____________________________ | ____________________________ |
| **Nom & prénom** | ____________________________ | ____________________________ |
| **Fonction** | ____________________________ | ____________________________ |
| **Date** | ______ / ______ / __________ | ______ / ______ / __________ |
| **Signature** _(précédée de « Bon pour accord et lancement »)_ | <br><br>____________________________ | <br><br>____________________________ |

<br>

☐ **J'ai pris connaissance de l'intégralité du dossier et j'autorise le lancement du développement de la V1.**

<br>

---

_Document confidentiel — © 2026 — Tous droits réservés. Établi pour présentation client ; ne constitue pas un engagement contractuel de prix. Le périmètre fait foi ; toute évolution hors périmètre fera l'objet d'un avenant._
