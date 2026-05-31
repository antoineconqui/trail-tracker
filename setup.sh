#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  SETUP LIVETRACK — à exécuter une fois avant chaque course
#  Usage : bash setup.sh
# ═══════════════════════════════════════════════════════════════

WORKER="https://aged-frog-1690.antoineconqui.workers.dev"
ADMIN_SECRET="kapsalon"
GPX_URL="https://github.com/antoineconqui/trail-tracker/blob/c80b34fa764cdfe9b73898591068bbdb91e868cf/main/Ecouves%202025%20off.gpx"

# ── Config Trail d'Écouves ────────────────────────────────────
curl -s -X POST "$WORKER/config" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -d "{
    \"name\": \"Trail d'Écouves\",
    \"distKm\": 61,
    \"totalDplus\": 1950,
    \"gpxUrl\": \"$GPX_URL\",
    \"phases\": [
      {\"label\":\"PH 1\",\"kmStart\":0,   \"kmEnd\":15,   \"fcMax\":148,\"color\":\"#00d4a0\"},
      {\"label\":\"PH 2\",\"kmStart\":15,  \"kmEnd\":35,   \"fcMax\":158,\"color\":\"#ffc532\"},
      {\"label\":\"PH 3\",\"kmStart\":35,  \"kmEnd\":50,   \"fcMax\":160,\"color\":\"#ff6b2b\"},
      {\"label\":\"PH 4\",\"kmStart\":50,  \"kmEnd\":61, \"fcMax\":170,\"color\":\"#ff3d5a\"}
    ],
    \"waypoints\": [
      {\"km\":8.3,  \"label\":\"⛰️ Côte 13%\"},
      {\"km\":35,   \"label\":\"🎿 Bloc descentes\"},
      {\"km\":50,   \"label\":\"🏁 Phase finale\"},
      {\"km\":55.5, \"label\":\"🦶 Section marche\"},
      {\"km\":61, \"label\":\"🎉 ARRIVÉE !\"}
    ]
  }" && echo "✓ Config Écouves chargée"

# ── Vérification ──────────────────────────────────────────────
echo ""
echo "Vérif /config :"
curl -s "$WORKER/config" | python3 -m json.tool | grep '"name"'

echo ""
echo "Dashboard : https://trail-tracker.pages.dev/"

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
