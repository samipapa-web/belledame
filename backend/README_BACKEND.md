# Backend (catalogue partagé) — BELLE DAME COSMETIQUE v3

## Objectif
- Partager le catalogue entre plusieurs téléphones/PC (mêmes produits, mêmes prix, mêmes images)
- L’interface du site reste en v3, mais lit/écrit sur l’API si disponible

## Pré-requis
- Node.js LTS

## Installation
```bash
cd backend
npm install
```

## Configuration
Copiez `.env.example` vers `.env` et modifiez :
- `PORT` (ex: 8080)
- `ADMIN_PIN` (code secret gestionnaire)
- `DB_PATH` (optionnel)

Sous Windows (PowerShell), vous pouvez aussi lancer avec variables d’environnement.

## Démarrage
```bash
npm start
```

## Initialiser la base avec les produits existants
1) Lancez le serveur
2) Dans le navigateur, ouvrez le site, puis Gestion → bouton "Synchroniser DB" (si présent)
Ou en cURL:
```bash
curl -X POST http://localhost:8080/api/admin/seed ^
  -H "x-admin-pin: 1234" ^
  -H "Content-Type: application/json" ^
  -d @seed.json
```

Le fichier `seed.json` peut contenir:
```json
{"products":[ ... ]}
```
