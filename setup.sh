#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  SETUP LIVETRACK — à exécuter une fois avant chaque course
#  Usage : bash setup.sh
# ═══════════════════════════════════════════════════════════════
#
# https://raw.githubusercontent.com/antoineconqui/trail-tracker/main/config-ecouves.json
# https://raw.githubusercontent.com/antoineconqui/trail-tracker/main/Ecouves%202025%20off.gpx

WORKER="https://aged-frog-1690.antoineconqui.workers.dev"
ADMIN_SECRET="kapsalon"
GPX_URL="https://raw.githubusercontent.com/antoineconqui/trail-tracker/refs/heads/main/Ecouves%202025%20off.gpx?token=GHSAT0AAAAAAD6AAMVZ7ELVRNELQDXUBR4Q2Q4PHHQ"

# ── Config Trail d'Écouves ────────────────────────────────────
curl -s -X POST "$WORKER/config" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -d "{
    \"name\":        \"Trail d'Écouves\",
    \"distKm\":      60.7,
    \"totalDplus\":  2200,
    \"totalDminus\": 2200,
    \"gpxUrl\":      \"$GPX_URL\",
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
      {\"km\":55.5, \"label\":\"🦶 Section marche\"}
    ],
    \"ravitos\": [
      {\"name\":\"Ravito 1\",\"km\":15,  \"lat\":null,\"lon\":null,\"services\":\"Eau · nourriture\"},
      {\"name\":\"Ravito 2\",\"km\":35,  \"lat\":null,\"lon\":null,\"services\":\"Eau · nourriture · drop bag\"},
      {\"name\":\"Ravito 3\",\"km\":50,  \"lat\":null,\"lon\":null,\"services\":\"Eau · nourriture\"}
    ]
  }" && echo "✓ Config chargée"

echo ""
echo "Vérif :"
curl -s "$WORKER/config" | python3 -c "import sys,json; c=json.load(sys.stdin); print(f'  {c[\"name\"]} · {len(c[\"phases\"])} phases · {len(c[\"ravitos\"])} ravitos')"

echo ""
echo "Dashboard : https://trail-tracker.pages.dev/"