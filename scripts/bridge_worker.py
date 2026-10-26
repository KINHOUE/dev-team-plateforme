#!/usr/bin/env python3
"""
Pont entre l'interface web Dev-Team et l'equipe d'agents Hermes.

Boucle :
  1. lit les demandes "A faire" deposees par les clients sur le site
  2. cree une tache kanban dans Hermes (board default) et passe la demande "En cours"
  3. suit l'avancement de la tache kanban et met a jour le statut cote site
     (En cours -> Revue QA / Audit secu -> Termine + resultat)

Usage :
  python scripts/bridge_worker.py            # boucle continue
  python scripts/bridge_worker.py --once     # un seul cycle (test)
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env"
STATE_FILE = ROOT / ".bridge-state.json"

POLL_SECONDS = 15

# Statut kanban -> statut affiche dans l'interface
KANBAN_TO_WEB = {
    "todo": "En cours",
    "ready": "En cours",
    "scheduled": "En cours",
    "running": "En cours",
    "review": "Revue QA",
    "blocked": "En cours",
    "done": "Terminé",
    "archived": "Terminé",
}


def load_env() -> dict[str, str]:
    env = {}
    if not ENV_FILE.exists():
        sys.exit(f".env introuvable : {ENV_FILE}")
    for line in ENV_FILE.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env


ENV = load_env()
BRIDGE_URL = ENV.get("BRIDGE_URL") or "http://localhost:8080"
TOKEN = ENV.get("HERMES_BRIDGE_TOKEN", "")

if not TOKEN:
    sys.exit("HERMES_BRIDGE_TOKEN absent du .env")

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
}


# --------------------------------------------------------------------------
# Appels HTTP vers le site
# --------------------------------------------------------------------------
def bridge(method: str, path: str = "", payload: dict | None = None) -> dict:
    url = f"{BRIDGE_URL}/api/public/hermes{path}"
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload else None
    req = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
    with urllib.request.urlopen(req, timeout=30) as response:
        body = response.read().decode("utf-8", "replace")
    return json.loads(body) if body.strip() else {}


def set_web_status(task_id: str, status: str, agent: str | None = None, result: str | None = None) -> None:
    payload = {"type": "task", "id": task_id, "status": status}
    if agent:
        payload["agent"] = agent
    if result is not None:
        payload["result"] = result[:5000]
    bridge("POST", "", payload)


def log(message: str) -> None:
    stamp = time.strftime("%H:%M:%S")
    print(f"[{stamp}] {message}", flush=True)


# --------------------------------------------------------------------------
# Kanban Hermes
# --------------------------------------------------------------------------
def run_kanban(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["hermes", "kanban"] + args,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        cwd=str(Path(os.path.expanduser("~")) / "AppData" / "Local" / "hermes"),
    )


def parse_json_output(text: str) -> dict | None:
    """Extrait le premier objet JSON d'une sortie qui peut contenir du bruit."""
    start = text.find("{")
    if start == -1:
        return None
    decoder = json.JSONDecoder()
    try:
        data, _ = decoder.raw_decode(text[start:])
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        return None


def create_kanban_task(title: str, body: str, idempotency_key: str) -> str | None:
    body_file = ROOT / ".bridge-body.tmp"
    body_file.write_text(body, encoding="utf-8")
    try:
        proc = run_kanban(
            [
                "create",
                title[:90],
                "--body-file",
                str(body_file),
                "--assignee",
                "default",
                "--priority",
                "6",
                "--idempotency-key",
                idempotency_key,
                "--json",
            ]
        )
    finally:
        body_file.unlink(missing_ok=True)

    if proc.returncode != 0:
        print(f"  ! echec creation kanban : {(proc.stderr or proc.stdout).strip()[:180]}")
        return None

    data = parse_json_output(proc.stdout)
    if not data:
        print(f"  ! reponse kanban illisible : {proc.stdout[:160]}")
        return None
    return data.get("task_id") or data.get("id")


def kanban_status(task_id: str) -> tuple[str, str]:
    """Retourne (statut, resume)."""
    proc = run_kanban(["show", task_id, "--json"])
    if proc.returncode != 0:
        return "?", ""
    data = parse_json_output(proc.stdout)
    if not data:
        return "?", ""
    task = data.get("task", data)
    runs = data.get("runs") or []
    summary = runs[-1].get("summary") or "" if runs else ""
    return task.get("status", "?"), summary


# --------------------------------------------------------------------------
# Etat local (mapping demande web -> tache kanban)
# --------------------------------------------------------------------------
def load_state() -> dict[str, str]:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def save_state(state: dict[str, str]) -> None:
    STATE_FILE.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")


# --------------------------------------------------------------------------
# Un cycle
# --------------------------------------------------------------------------
def cycle(state: dict[str, str]) -> None:
    # 1. demandes a traiter : nouvelles + celles restees "En cours" sans suivi
    try:
        incoming = bridge("GET", "?include_active=1").get("tasks", [])
    except Exception as error:
        log(f"! site injoignable ({error})")
        return

    for task in incoming:
        task_id = task.get("id")
        if not task_id or task_id in state:
            continue

        title = task.get("title") or "Demande client"
        description = task.get("description") or title

        log(f"+ demande : {title[:60]}")

        # Kanban d'abord : si la creation echoue, la demande reste visible et sera reprise
        body = (
            "Demande deposee par un client via le site.\n\n"
            "---\n\n"
            f"{description}\n\n"
            "---\n\n"
            "CONSIGNES DE LIVRAISON (obligatoires) :\n"
            "1. Construis reellement le site et deploie-le sur Vercel.\n"
            "2. Verifie que l'URL de PRODUCTION repond en HTTP 200 (pas l'URL de deploiement\n"
            "   temporaire, qui peut etre protegee par SSO).\n"
            "3. Termine imperativement ton resume par une ligne de la forme :\n"
            "   PRODUCTION: https://<nom-du-projet>.vercel.app\n"
            "4. Ne declare jamais la tache terminee sans cette ligne."
        )
        kanban_id = create_kanban_task(
            title,
            body,
            idempotency_key=f"web-task-{task_id}",
        )
        if not kanban_id:
            continue

        state[task_id] = kanban_id
        save_state(state)
        set_web_status(task_id, "En cours", agent="default")
        log(f"  -> kanban {kanban_id}")

    # 2. suivi des taches en cours
    for web_id, kanban_id in list(state.items()):
        status, summary = kanban_status(kanban_id)
        mapped = KANBAN_TO_WEB.get(status)
        if not mapped:
            continue

        if mapped == "Terminé":
            log(f"= terminee : {web_id[:8]}… resultat remonte")
            set_web_status(web_id, "Terminé", agent="default", result=summary or "Traitement termine.")
            del state[web_id]
            save_state(state)
        elif mapped == "Revue QA":
            set_web_status(web_id, "Revue QA")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="un seul cycle puis sortie")
    args = parser.parse_args()

    print(f"Pont Dev-Team — site : {BRIDGE_URL}")
    print(f"Cycle toutes les {POLL_SECONDS}s\n")

    state = load_state()
    if state:
        print(f"{len(state)} demande(s) deja en cours de suivi\n")

    while True:
        try:
            cycle(state)
        except KeyboardInterrupt:
            print("\nArret demande.")
            return
        except Exception as error:
            print(f"  ! erreur de cycle : {error}")

        if args.once:
            return
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
