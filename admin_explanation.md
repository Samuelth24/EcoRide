# Documentation de l'Admin `EcoRide` (ecoride-admin)

Ce document explique en détail le fonctionnement du code source principal de l'espace administration, situé dans le fichier `ecoride-admin/src/App.jsx`. L'interface permet aux administrateurs, vendeurs et livreurs de gérer les véhicules, suivre les commandes, valider des devis et examiner les statistiques (chiffre d'affaires, stock).

---

## 1. Vue d'Ensemble & Configuration

L'ensemble de l'application s'exécute depuis le composant React par défaut `AdminApp`. Contrairement au client, cette plateforme requiert une **authentification forte**. 
- Il n'y a pas d'Initialisation de la constante Supabase explicitement montrée au tout début, mais son API `sb` (définie sûrement avant la ligne 10) est exploitée partout (via `sb.auth` et `sb.from()`).

Les Méta-données graphiques et fonctionnelles y figurent globalement :
- **`STATUS_META`** : Couleurs et labels des commandes ("en_attente", "confirmé", "livré", "annulé").
- **`ROLE_META`** : Différencie graphiquement les types d'utilisateurs. Ex. un administrateur ("admin" 👑), un vendeur ("vendeur" 🧑‍💼) et un livreur ("livreur" 🚚).

---

## 2. Authentification et Niveaux d'Accès

### Système Supabase Auth (`useEffect`)
L'authentification conditionne totalement l'accès au portail.
1. À l'allumage, l'application vérifie la `session` depuis `sb.auth.getSession()` et maintient le statut pendant tout changement (via `onAuthStateChange`).
2. Pendant le chargement, la variable `authLoading` affiche un spinner central (`loading screen`).
3. Si un utilisateur est authentifié, le hook déclenche un second chargement asynchrone `fetchProfile(userId)`. La table `profiles` détermine alors s'il est Administrateur, Vendeur ou Livreur (assignant la variable de vue globale `profile`).

### Système de Permissions (Authorizations `can(action)`)
Toute restriction passe par l'utilitaire `can(...)`.
- **`admin`** : Possède le passe-partout `["all"]`.
- **`vendeur`** : Possède `["orders", "quotes", "vehicles_read", "dashboard"]`.
- **`livreur`** : Limité drastiquement à `["delivery", "dashboard"]`.

Dans les Vues de React, des conditions (ex. `{can("orders") && ...}`) enveloppent les boutons (ex. pour changer de statuts d'une commande ou modifier un véhicule).

---

## 3. Chargement des Datas Métiers et Real-Time

Toute l'information du tableau de bord dépend des _Loaders asynchrones_. Une fois que `profile` existe dans le state local, un `useEffect` parallèle est déclenché.
Il invoque simultanément les fonctions : `loadVehicles`, `loadOrders`, `loadQuotes`, `loadTeam`, `loadStats`.

* `loadStats` compile et aggrége 3 tables (Orders, Vehicles, Quotes) afin de déduire les statistiques critiques de la vue "Dashboard" :
  - **`revenue`** : Somme mathématique des montants des commandes non-annulées.
  - **`stock`** : Total global des variables des flottes actuelles.

### Notifications en Temps Réel
Deux souscriptions WebSocket ou `ch1` et `ch2` sont écoutées en permanence ("rt-orders", "rt-quotes"). Lorsqu'un message en DB change (`postgres_changes` sur les tables publiques), l'application redéclenche silencieusement la lecture des commandes et devis avec un `showToast("Nouveau devis reçu!")`.

---

## 4. Les Modales & Les Actions CRUD

L'architecture du CMS est dictée par la réutilisation infinie de Modal (Pop-up centrale bloquant l'arrière-plan `modalBox`). Le type d'ouverture (`modal.type`) active l'action requise.
- **Ajout/Edition d'un Véhicule** (`editVehicle`, `addVehicle`) : Stocke la data courante et les changements du formulaire dans le state transitoire `vehicleForm`. Lors de l'enregistrement (`saveVehicle()`), le `upsert` est conditionné via l'existence d'une fausse clé `_new`.
- **Suppression** (`confirmDelete`) : Renvoi classique de la function asynchrone pointée par le bouton destructeur dans supabase `.delete().eq()`.
- **Traitement Commande et Devis** (`orderDetail`, `quoteDetail`) : `updateOrderStatus` ou `updateQuoteStatus` exécutent l'action d'évolution d'état (ex: en_attente -> livré) puis actualise les `Stats`.

---

## 5. Navigation et Structure de la Sidebar

Le menu principal (`MENU`) n'est qu'un simple objet listé cartographiant les Pages gérables :
1. **`dashboard`** : Affiche les métriques de base (`stats.revenue`, les stocks les plus bas avec une alerte jaune `⚠️ Stock faible`, les 5 véhicules favoris sous un graphique SVG à barres gradient, et un donut comparatif de statut).
2. **`orders`** (`Commandes`) : Listing tabulaire. Il implique des champs filtres gérés par state local `orderSearch` et `orderFilter`. 
3. **`delivery`** (`Livraisons`) : Liste réduite de `filteredOrders` n'impliquant que les éléments `status === 'confirmé'`. C'est l'écran primordial du livreur pour cliquer sur `✓ Livré`.
4. **`quotes`** (`Devis`) : Flux d'email listés (nouveaux et traités) depuis les requêtes entrantes des clients.
5. **`vehicles`** (`Véhicules`) : Mur de cartes de la flotte actuelle avec bouttons "Ajouter", "Modifier", et le badge de la baisse unitaire.
6. **`team`** (`Équipe`) : Réservé aux Administrateurs. Ils y surveillent les utilisateurs, listés par les profils ajoutés manuellement via Supabase MetaData.
7. **`settings`** (`Paramètres`) : Gestion du mot de passe direct, identité globale et affichage du port réseau.

---

## 6. L'UI (User Interface) & UX

- L'UX s'appuie énormément sur le dark mode stylisé (couleurs de fond "#0a0a0a", texte en "#f0f0f0" typographie "DM Sans" et "Syne"). Les teintes "Bumblebee/EcoRide" prédominantes sont dominées par le `#FFD600` et `#FF6B35`.
- Toutes les pages partagent une balise racine `div style={A.root}` d'où sont invoqués des objets de style statiques situés tout en fin de code: `A.fi`, `A.cardTitle`, `A.btnPrimary`, et etc.
- **SBadge** est un Helper component très utile pour injecter des status-bars automatiques (Ex. Rouge, Vert, Orange) sur les tableaux d'index.
