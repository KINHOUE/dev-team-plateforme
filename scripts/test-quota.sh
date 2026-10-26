#!/bin/bash
# Test end-to-end du quota de demandes actives.
# Crée un utilisateur de test, tente 2 demandes actives, puis nettoie tout.
# Usage : bash scripts/test-quota.sh
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
ENV_FILE=".env"
[ -f "$ENV_FILE" ] || { echo "fichier .env introuvable"; exit 1; }

URL=$(grep -E "^SUPABASE_URL=" "$ENV_FILE" | cut -d= -f2- | tr -d '"' | xargs)
KEY=$(grep -E "^SUPABASE_SERVICE_ROLE_KEY=" "$ENV_FILE" | cut -d= -f2- | tr -d '"' | xargs)

[ -n "$URL" ] && [ -n "$KEY" ] || { echo "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant"; exit 1; }

EMAIL="test-quota-$(date +%s)@example.com"
PASSWORD="TestQuota123!"

echo "1. Création d'un utilisateur de test (sans abonnement)"
USER_JSON=$(curl -s -m 25 -X POST "$URL/auth/v1/admin/users" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"email_confirm\":true}")

USER_TEST_ID=$(printf '%s' "$USER_JSON" | python -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
if [ -z "$USER_TEST_ID" ]; then
  echo "   échec de création : $(printf '%s' "$USER_JSON" | head -c 200)"
  exit 1
fi
echo "   id = $USER_TEST_ID"

cleanup() {
  echo "5. Nettoyage"
  curl -s -m 20 -X DELETE "$URL/rest/v1/tasks?client_id=eq.$USER_TEST_ID" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" >/dev/null
  curl -s -m 20 -X DELETE "$URL/auth/v1/admin/users/$USER_TEST_ID" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" >/dev/null
  echo "   utilisateur et tâches supprimés"
}
trap cleanup EXIT

echo "2. Première demande active"
R1=$(curl -s -m 25 -o /tmp/q1.json -w "%{http_code}" -X POST "$URL/rest/v1/tasks" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{\"client_id\":\"$USER_TEST_ID\",\"title\":\"Test quota 1\",\"description\":\"premiere demande\",\"status\":\"À faire\"}")
echo "   HTTP $R1"

echo "3. Deuxième demande active (doit être refusée si le quota est actif)"
R2=$(curl -s -m 25 -o /tmp/q2.json -w "%{http_code}" -X POST "$URL/rest/v1/tasks" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{\"client_id\":\"$USER_TEST_ID\",\"title\":\"Test quota 2\",\"description\":\"deuxieme demande\",\"status\":\"À faire\"}")
echo "   HTTP $R2"

echo "4. Verdict"
if [ "$R2" = "201" ]; then
  echo "   ❌ QUOTA NON APPLIQUÉ — un compte gratuit a créé 2 demandes actives."
  echo "   → la migration 20251027000000_enforce_task_quota.sql n'est pas installée."
elif [ "$R2" = "400" ] || [ "$R2" = "409" ] || [ "$R2" = "422" ]; then
  MSG=$(python -c "import json;d=json.load(open('/tmp/q2.json'));print(d.get('message','')[:120])" 2>/dev/null)
  echo "   ✅ QUOTA APPLIQUÉ — la deuxième demande est refusée."
  echo "   message : $MSG"
else
  echo "   ⚠️ Réponse inattendue (HTTP $R2) : $(head -c 200 /tmp/q2.json 2>/dev/null)"
fi
rm -f /tmp/q1.json /tmp/q2.json
