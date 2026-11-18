#!/usr/bin/env python3
"""Provision Monsoon Relay and supervise its three Band peers (Python 3 on Unix)."""
import argparse
import fcntl
import getpass
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import tempfile
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import build_opener, HTTPRedirectHandler, Request

ROOT = Path(__file__).resolve().parent
ROLES = ("shelter", "west", "east")


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


def room_client(key, room):
    opener = build_opener(NoRedirect())
    base = "https://app.band.ai/api/v1/me/chats/" + quote(room, safe="")

    def request(path, body=None):
        req = Request(base + path, data=json.dumps(body).encode() if body else None,
                      headers={"X-API-Key": key, "Content-Type": "application/json"})
        try:
            with opener.open(req, timeout=15) as response:
                return json.load(response)["data"]
        except HTTPError as error:
            raise RuntimeError(f"Band room API returned HTTP {error.code} for {path}") from None
    return request


def verify(request, ids, check, timeout=120, interval=2, ready=None):
    def wait_for(read, description):
        end = time.monotonic() + timeout
        while True:
            check()
            result = read()
            if result:
                return result
            if time.monotonic() >= end:
                raise RuntimeError("Timed out waiting for " + description)
            time.sleep(interval)

    def peers_online():
        online = {p["id"] for p in request("/participants") if p.get("online") is True}
        return set(ids.values()).issubset(online)

    wait_for(ready or peers_online, "three authenticated room peers")
    sent = request("/messages", {"message": {
        "content": 'relay {"closed":[30],"reserve":8}', "mentions": [{"id": ids["shelter"]}]}})
    if not sent.get("success") or not sent.get("id"):
        raise RuntimeError("Band did not confirm the scenario post.")
    origin = sent["id"]
    expected = f"Simulation {origin} complete. 12/20 crates committed (west 0, east 12). 8 outstanding."
    def final_reply():
        messages = request("/messages?message_type=text&limit=100")
        return any(m.get("sender_id") == ids["shelter"] and m.get("sender_type") == "Agent"
                   and m.get("content", "").endswith(expected) for m in messages)

    print("Sent test scenario. Band message ID:", origin, flush=True)
    wait_for(final_reply, "the shelter's correlated 12/20 commitment")
    return expected


def supervise(state, private, child_env, check_test, launch=subprocess.Popen, transport="ws", ready_dir=None):
    children = []
    try:
        ids = {role: state["agents"][role]["id"] for role in ROLES}
        public = {"BAND_" + role.upper() + "_AGENT_ID": value for role, value in ids.items()}
        for role in ROLES:
            env = {**child_env, **public, "BAND_" + role.upper() + "_API_KEY": state["agents"][role]["key"]}
            env["MONSOON_TRANSPORT"] = transport
            if transport == "rest":
                env["MONSOON_ROOM_ID"] = state["room"]
                env["MONSOON_READY_FILE"] = str(ready_dir / role)
            children.append(launch(["node", str(ROOT / "peer.mjs"), role], cwd=private, env=env))
        def check():
            for role, child in zip(ROLES, children):
                if child.poll() is not None:
                    raise RuntimeError(f"{role} peer exited with status {child.returncode}")
        check_test(ids, check)
    finally:
        for child in children:
            if child.poll() is None:
                child.terminate()
        for child in children:
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--test-room", action="store_true", help="send one live scenario and verify the reply")
    parser.add_argument("--exit-after-test", action="store_true", help="stop these peers after verification")
    parser.add_argument("--transport", choices=("ws","rest"), default="ws", help="Band peer transport")
    args = parser.parse_args()
    if args.exit_after_test and not args.test_room:
        parser.error("--exit-after-test requires --test-room")
    os.umask(0o077)
    private = Path(os.environ.get("MONSOON_BAND_DIR", "~/.config/monsoon-relay-band")).expanduser().resolve()
    private.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (private / "run.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError("A runner already owns this provisioning directory.") from None
        env = {k:v for k,v in os.environ.items() if not k.startswith(("BAND_", "THENVOI_"))}
        if not (ROOT / "node_modules/@band-ai/sdk/package.json").exists():
            subprocess.run(["npm","ci","--ignore-scripts","--no-audit"], cwd=ROOT, env=env, check=True)
        key = os.environ.get("BAND_USER_KEY")
        if not key and (private / "owner.key").exists():
            key = (private / "owner.key").read_text().strip()
        if not key:
            if not sys.stdin.isatty():
                raise RuntimeError("Supply BAND_USER_KEY through the runtime secret manager or run from a terminal.")
            key = getpass.getpass("Band user API key (hidden): ").strip()
        provision_env = {**env, "BAND_USER_KEY":key, "MONSOON_BAND_DIR":str(private)}
        subprocess.run(["node",str(ROOT / "provision.mjs")], env=provision_env, check=True)
        state = json.loads((private / "provision.json").read_text())

        def work(ids, check):
            if args.test_room:
                print("Verified:", verify(room_client(key, state["room"]), ids, check, ready=ready), flush=True)
            if not args.exit_after_test:
                print("Peers running. Press Ctrl+C to stop.", flush=True)
                while True:
                    check()
                    time.sleep(1)
        with tempfile.TemporaryDirectory(prefix="ready-", dir=private) as temp:
            ready_dir = Path(temp)
            ready = (lambda: all((ready_dir / role).is_file() for role in ROLES)) if args.transport == "rest" else None
            supervise(state, private, env, work, transport=args.transport, ready_dir=ready_dir)


if __name__ == "__main__":
    def interrupt(*_args):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, interrupt)
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
    except (RuntimeError, OSError, subprocess.CalledProcessError) as error:
        sys.exit(str(error))
