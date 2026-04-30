# Documentation du Client `EcoRide` (ecoride-client)

Ce document explique en détail le fonctionnement du code source principal de l'application cliente situé dans le fichier `ecoride-client/src/App.jsx`. L'interface cliente permet aux utilisateurs de consulter le catalogue de véhicules électriques, de les comparer, de se constituer un panier, de passer commande et de suivre leurs achats.

---

## 1. Structure Globale

L'application est construite autour du fichier unique `App.jsx`, qui consolide :
1. **La configuration Supabase** pour la base de données.
2. **Le composant principal `ClientApp`** qui gère l'état global et les vues.
3. **Les composants UI spécifiques**, tels que `<VCard />` (carte pour un véhicule) et `<Loader />`.
4. **L'objet de styles `S`**, regroupant le design CSS de l'application cliente dans des objets JavaScript en ligne.

---

## 2. Configuration & Dépendances

### Supabase
L'application se connecte à un projet Supabase pour récupérer en temps réel les données :
- Clé et URL (réduites en variables `SUPABASE_URL` et `SUPABASE_KEY`).
- Utilisé pour lire la liste des `vehicles` (véhicules), ajouter des lignes dans `orders` (commandes), enregistrer un suivi via `order_tracking`, et intégrer des citations ou devis dans `quotes`.

### Constantes Globales
- **`PAYMENT_METHODS`** : Liste des méthodes de paiements acceptables en Afrique de l'Ouest (MTN MoMo, Moov Money, Wave, Celtiis cash, et Virement bancaire) avec leurs couleurs et bordures respectives.
- **`STATUS_META`** : Méta-données qui gèrent l'état d'affichage des statuts de commande (ex: "En attente", "Livré").

---

## 3. Le Composant Principal `ClientApp`

### A. Gestion de l'état global (Hooks Local)
Le `ClientApp` centralise une énorme quantité d'états gérés via `useState`.
- **Navigation (Single Page Application)** : Contrôlé par `page` (ex. "home", "catalogue", "compare", "order", "suivi", "contact"). La fonction `navTo(p)` met à jour cette variable pour scroller ou masquer le menu mobile.
- **Données Métier :**
  - `vehicles` : Contient la liste des véhicules.
  - `cart` : Panier de l'utilisateur.
  - `wishlist` / `compareList` : Listes des favoris ou des véhicules prêts à être comparés.
- **Filtres et Tris :** 
  - Utilisés dans la fonction dérivée `filtered`. Le catalogue peut être filtré par type de catégorie (`filterCat`), nombre de sièges (`filterSeats`) ou trié par ordre croissant/décroissant ou nom (`sortBy`, `searchTerm`).
- **Formulaires et Commandes :**
  - **Flux de Commande (`orderStep`)** : Divise le panier et l'achat en 3 étapes. Reçoit des datas des acheteurs et les inclut via un formulaire connecté (`orderData`).
  - **Création de Devis (`quoteForm`)** : Permet aux clients d'envoyer leurs questions spécifiques au service client.
  - **Suivi de Commande (`trackingId`...)** : Gère l'input utilisateur pour rechercher son colis ou suivre une URL d'ID Supabase.

### B. Connexion et Chargement des Données
- Le hook `useEffect` est utilisé lors du montage initial du composant pour chercher la liste de tous les véhicules (`sb.from("vehicles")...`) dont le `status` est "actif".
- Un second `useEffect` branche `sb.channel` permettant une **mise à jour temps réel** (`postgres_changes`) en cas d'un événement `INSERT` ou `UPDATE` provenant de la base de données. 

### C. Fonctions Principales
1. **`addToCart(v)` / `removeFromCart(id)`** : Gèrent les produits dans le panier avec un test pour éviter la duplication.
2. **`submitOrder()`** :
   - Regroupe l'adresse, le nom, les informations de contact ainsi que le JSON de tout véhicule dans le panier avant de créer un enregistrement (via `.insert()`) dans la table `orders`.
   - Lance simultanément un ensemble d'insertions dans la table `order_tracking` configurant la barre de progression (ex. étape de validation, traitement, paiement).
3. **`submitQuote()`** :
   - Insère les données formattées dans la table `quotes` pour déclencher une demande de contact.
4. **`lookupOrder()`** :
   - Une requête simple qui combine la lecture dans `orders` et son aggrégation `order_tracking(*)` grâce à Supabase pour générer la ligne de vie étape par étape d'un identifiant spécifique.

---

## 4. Architecture des Vues & Interfaces

Le rendu retourne essentiellement une condition qui mappe la variable `<navTo.../>` au composant de vue en-dessous :
- **Nav & Footer** : Commun à l'ensemble du DOM. Affiche le total des icônes de paiement, les conditions et le panier superposé.
- **`page === "home"`** : Vue d'atterrissage ou Landing Page. Souligne les trois meilleurs ventes (`vehicles.slice(0,3)`), présente une approche pas-à-pas et contient explicitement la foire aux questions des spécifications électriques en Afrique (FAQ).
- **`page === "catalogue"`** : La page principale avec search bar, filtres de tri (places, autonomie), listant des véhicules encapsulés dans des `<VCard>`.
- **`page === "detail"`** : La vue unique. Si on sélectionne une `<VCard>`, le composant transmet les variations de couleur avec des animations de badge localisé "PROMO -X%".
- **`page === "compare"`** : Interface en forme de tableau horizontal généré par `.map` sur `compareList` comparant systématiquement (Prix, Autonomie, AC) de jusqu'à 3 différentes voitures.
- **`page === "order"`** : Tunnel d'achat structuré en 3 étapes.
  1. Revu rapide du panier.
  2. Fourniture et stockage des inputs "Adresse", "Email", "Nom" de la commande.
  3. Sélection du portail d'échéance par des moyens locaux via variables de constantes (Mobile Money, Viements...).
- **`page === "suivi"`** : Un form text où le client renseigne l'id de la commande pour lier la table des statuts.

---

## 5. Composants "Enfants" Internes

La fin de `App.jsx` détient deux composants visuels exportés au sein du fichier et un dictionnaire de style.
- **`<VCard />`** : L'abstraction graphique des voitures. Rend dynamique les icônes de coeurs (`inWish`), l'image (l'emoji), la gestion de la batterie et de l'air conditionné selon le JSON transmis depuis le prop.
- **`<Loader />`** : Spinning spinner simple de CSS pur affichable lors des "Chargements".
- **`S` (Store of Styles)** : Un dictionnaire colossal des propriétés CSS inlines afin d'isoler l'état d'un attribut externe ou maintenir "Tailwind-like" sans aucune dépendance. Cela maintient la logique unifiée.
