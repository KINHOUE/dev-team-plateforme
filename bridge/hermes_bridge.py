"""Pont entre Hermes (sur votre PC) et l'interface Dev-Team.

Usage :
  set DEVTEAM_URL=https://votre-site.lovable.app
  set HERMES_BRIDGE_TOKEN=le-code-secret
  python hermes_bridge.py

Toutes les 15 s, récupère les nouvelles demandes et les transmet à Hermes
(commande HERMES_CMD, à adapter), puis remonte l'état dans l'interface.
"""
import os, subprocess, time, requests

URL = os.environ["DEVTEAM_URL"].rstrip("/") + "/api/public/hermes"
HEADERS = {"Authorization": f"Bearer {os.environ['HERMES_BRIDGE_TOKEN']}"}
# Adaptez à votre installation Hermes (profil orchestrateur « default »)
HERMES_CMD = os.environ.get("HERMES_CMD", "hermes -p default chat -q").split()


def post(payload):
    requests.post(URL, json=payload, headers=HEADERS, timeout=20).raise_for_status()


while True:
    try:
        tasks = requests.get(URL, headers=HEADERS, timeout=20).json()["tasks"]
        for t in tasks:
            post({"type": "task", "id": t["id"], "status": "En cours", "agent": "default"})
            post({"type": "agent", "id": "default", "status": "actif", "current_task": t["title"]})
            out = subprocess.run(HERMES_CMD + [t["description"] or t["title"]], capture_output=True, text=True)
            post({"type": "task", "id": t["id"], "status": "Terminé", "result": (out.stdout or out.stderr)[-4000:]})
            post({"type": "agent", "id": "default", "status": "en attente"})
    except Exception as e:  # noqa: BLE001
        print("erreur :", e)
    time.sleep(15)
