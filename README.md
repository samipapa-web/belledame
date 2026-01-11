# BELLE DAME COSMETIQUE — Site (v3)

## Changements demandés (appliqués)
- Thème **rose/blanc**
- WhatsApp officiel par défaut : **237670109792**
- Gestion : quand vous cliquez **Modifier** sur un produit existant, l'édition est centrée sur :
  - **Prix**
  - **Image** (lien URL OU sélection de fichier sur disque)
  - **Description**
  (Vous pouvez déverrouiller les champs avancés si nécessaire.)

## Lancer en local
Si l'ouverture directe de `index.html` ne charge pas les données, utilisez un serveur :

### Python
```bash
cd "belle_dame_cosmetique_site_v3"
python -m http.server 8080
```
Puis : http://localhost:8080

## Images produits
- **Lien URL** : collez `https://.../image.jpg`
- **Fichier disque** : cliquez sur le champ fichier (l'image est convertie en DataURL et stockée dans le navigateur)

Date : 2026-01-11
