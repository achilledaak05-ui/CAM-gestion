# CAM — Mode autonome (sans backend)

Les applications fonctionnent désormais **sans serveur ni base de données**. Il suffit
d'ouvrir les fichiers `.html` directement dans le navigateur (double-clic).

## Principe

Le fichier `cam-local.js` (à la racine) intercepte tous les appels `fetch('/api/...')`
et les sert depuis le `localStorage` du navigateur. Le code des applications n'a pas
été réécrit : il croit parler au serveur, mais les réponses viennent du navigateur.

## Fichiers branchés

- `1-Web-Tableau-de-bord/index.html`
- `1-Web-Tableau-de-bord/connexion.html`
- `1-Web-Tableau-de-bord/presence.html`
- `2-Application-mobile/index.html`
- `2-Application-mobile/pasteur.html`
- `3-E-Offring/index.html`
- `4-Scan-Presence/index.html`

`Département CAM/Tableaux de bord des départements.html` était déjà autonome
(`localStorage`, aucune API) : aucune modification nécessaire.

## Identifiants par défaut

**Administration (tableau de bord)**
- Utilisateur : `admin`
- Mot de passe : `1f2ca8e43c30aecf74dcfa1171b47217`

**Application mobile**
- Aucun compte membre n'existe au départ.
- Ouvre l'app mobile → onglet **« Créer un compte »** → choisis un identifiant et
  un mot de passe de **12 caractères minimum**.
- Le compte est créé dans le navigateur et fonctionne immédiatement.

## Réinitialiser les données locales

Dans la console du navigateur (`Cmd + Option + J`) :

```js
CAM_LOCAL.reset()
```

Puis recharger la page.

## Revenir au mode serveur

1. Arrêter d'utiliser `cam-local.js` : retirer la ligne
   `<script src="../cam-local.js"></script>` des fichiers HTML listés ci-dessus.
2. Démarrer PostgreSQL : `brew services start postgresql@16`
3. Démarrer le backend : `cd backend && ./demarrer.sh`
4. Ouvrir `http://127.0.0.1:3000/`

## Limites

- Les données sont stockées **dans chaque navigateur** : elles ne sont pas partagées
  entre deux ordinateurs, ni entre deux navigateurs différents.
- Selon le navigateur, le `localStorage` peut être isolé par fichier en `file://`.
  Un repli via `window.name` est prévu pour la session, mais l'idéal reste d'ouvrir
  les pages depuis un même onglet/navigateur.
- Le mode autonome est fait pour la **démonstration et le test local**, pas pour
  un usage réel avec des données de membres (aucune sauvegarde, aucune sécurité serveur).

---

Sauvegarde des fichiers d'origine : `_sauvegarde-avant-mode-autonome/`
