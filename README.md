# MM3C

Créateur statique de personnages pour Mutants & Masterminds, troisième édition.

## Application

Le site est servi directement depuis [`docs/`](docs/). Configure GitHub Pages pour publier la branche principale depuis le dossier `/docs`. Le manuel conservé à la racine du dépôt ne fait ainsi pas partie du site publié.

Pour prévisualiser le site localement, démarrez un serveur statique à la racine du dépôt, par exemple avec `python -m http.server 8000`, puis ouvrez `http://localhost:8000/docs/`.

## Organisation

- `docs/index.html` : page unique et étapes de création.
- `docs/styles.css` : mise en page responsive.
- `docs/src/` : état du personnage, règles, validations et sérialisation JSON.
- `docs/data/` : catalogues de caractéristiques, défenses, compétences, talents, complications et paramètres de campagne.

MM3C ne sauvegarde pas le personnage dans le navigateur. Utilisez **Exporter le personnage** pour créer un fichier `.mm3c.json`, puis **Importer** pour le restaurer.
