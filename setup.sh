#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  SETUP LIVETRACK — à exécuter une fois avant chaque course
#  Usage : bash setup.sh
# ═══════════════════════════════════════════════════════════════

WORKER="https://aged-frog-1690.antoineconqui.workers.dev"
ADMIN_SECRET="REMPLACE_PAR_TON_SECRET"   # même valeur que dans Worker → Settings → Variables → ADMIN_SECRET

# ── GPX : héberger sur GitHub Gist ──────────────────────────
# 1. Va sur https://gist.github.com
# 2. Crée un nouveau Gist public, colle le contenu du fichier .gpx
# 3. Clique "Create public gist"
# 4. Clique "Raw" → copie l'URL (format : https://gist.githubusercontent.com/...)
# 5. Colle-la ci-dessous

GPX_URL="https://gist.githubusercontent.com/TON_USER/TON_GIST_ID/raw/ecouves.gpx"

# ── Config Trail d'Écouves ────────────────────────────────────
curl -s -X POST "$WORKER/config" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -d "{
    \"name\": \"Trail d'Écouves\",
    \"distKm\": 60.7,
    \"totalDplus\": 2200,
    \"gpxUrl\": \"$GPX_URL\",
    \"phases\": [
      {\"label\":\"PH 1\",\"kmStart\":0,   \"kmEnd\":15,   \"fcMax\":148,\"color\":\"#00d4a0\"},
      {\"label\":\"PH 2\",\"kmStart\":15,  \"kmEnd\":35,   \"fcMax\":158,\"color\":\"#ffc532\"},
      {\"label\":\"PH 3\",\"kmStart\":35,  \"kmEnd\":50,   \"fcMax\":160,\"color\":\"#ff6b2b\"},
      {\"label\":\"PH 4\",\"kmStart\":50,  \"kmEnd\":60.7, \"fcMax\":170,\"color\":\"#ff3d5a\"}
    ],
    \"waypoints\": [
      {\"km\":8.3,  \"label\":\"⛰️ Côte 13%\"},
      {\"km\":35,   \"label\":\"🎿 Bloc descentes\"},
      {\"km\":50,   \"label\":\"🏁 Phase finale\"},
      {\"km\":55.5, \"label\":\"🦶 Section marche\"},
      {\"km\":60.7, \"label\":\"🎉 ARRIVÉE !\"}
    ]
  }" && echo "✓ Config Écouves chargée"

# ── Vérification ──────────────────────────────────────────────
echo ""
echo "Vérif /config :"
curl -s "$WORKER/config" | python3 -m json.tool | grep '"name"'

echo ""
echo "Dashboard : https://TON_NOM.pages.dev"
echo "Pour une prochaine course : modifier les valeurs ci-dessus et relancer."


# ═══════════════════════════════════════════════════════════════
#  CLOUDFLARE PAGES — setup unique (une fois pour toutes)
# ═══════════════════════════════════════════════════════════════
#
# 1. Créer un repo GitHub (ex: "livetrack-dashboard")
#    → Pousser index.html dedans
#
# 2. dash.cloudflare.com → Workers & Pages → Pages
#    → Create a project → Connect to Git
#    → Sélectionner le repo
#    → Build settings :
#         Framework preset  : None
#         Build command     : (vide)
#         Output directory  : /
#    → Save and Deploy
#
# 3. URL obtenue : https://livetrack-dashboard.pages.dev  (fixe à vie)
#    → Partager cette URL à tous tes amis, elle ne changera plus jamais
#
# 4. Worker secret ADMIN_SECRET :
#    aged-frog-1690 → Settings → Variables → Add variable
#    → Name: ADMIN_SECRET, Value: (choisis une valeur), chiffré ✓
#    → Save and deploy
#
# ═══════════════════════════════════════════════════════════════
#  WORKFLOW RACE DAY (après setup)
# ═══════════════════════════════════════════════════════════════
#
# J-1 ou matin course :
#   1. bash setup.sh  (met à jour config + GPX dans KV)
#
# Race day :
#   1. Démarrer LiveTrack sur Garmin Connect (1 tap)
#   2. Ouvrir l'URL LiveTrack dans Chrome (extension fait le reste)
#   3. C'est tout — le dashboard se connecte automatiquement
#
# Tes amis : ouvrir https://livetrack-dashboard.pages.dev
# ═══════════════════════════════════════════════════════════════
