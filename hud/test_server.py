"""Tests du serveur du HUD. Aucun réseau, aucun vrai moteur.

    python3 -m unittest hud/test_server.py -v
"""
import datetime as dt
import http.client
import json
import os
import stat
import sys
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import server  # noqa: E402

DAY = dt.date(2026, 10, 11)


class FakeEngine:
    name = "fake"

    def __init__(self, reply="ok", fail=None):
        self.reply, self.fail, self.calls = reply, fail, []

    def status(self):
        return True, "faux moteur"

    def run(self, skill, text, explicit, now):
        self.calls.append((skill, text, explicit))
        if self.fail:
            raise self.fail
        return self.reply


class VaultTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.vault = server.Vault(self.tmp.name)
        self.vault.ensure()

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, rel, text):
        path = Path(self.tmp.name) / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def test_ensure_seeds_linked_notes_once(self):
        names = {n["name"] for n in self.vault.notes()}
        self.assertIn("Index", names)
        self.write("wiki/Index.md", "# Index perso\n")
        self.vault.ensure()  # un coffre déjà rempli n'est jamais écrasé
        self.assertEqual(self.vault.read("wiki/Index.md")["content"], "# Index perso\n")

    def test_graph_resolves_obsidian_links(self):
        self.write("wiki/Projet Mob.md", "Voir [[Jarvis|le système]] et [[Index#haut]], [[Fantôme]].")
        graph = self.vault.graph()
        by_name = {n["name"]: i for i, n in enumerate(graph["nodes"])}
        edges = {tuple(sorted(e)) for e in graph["edges"]}
        mob = by_name["Projet Mob"]
        self.assertIn(tuple(sorted((mob, by_name["Jarvis"]))), edges)
        self.assertIn(tuple(sorted((mob, by_name["Index"]))), edges)
        # Un lien vers une note inexistante ne crée ni nœud ni crash.
        self.assertNotIn("Fantôme", by_name)

    def test_read_refuses_paths_outside_the_vault(self):
        secret = Path(self.tmp.name).parent / "secret.md"
        self.assertIsNone(self.vault.read("../secret.md"))
        self.assertIsNone(self.vault.read("/etc/passwd"))
        self.assertIsNone(self.vault.read("wiki/../../" + secret.name))
        self.write("wiki/donnees.json", "{}")
        self.assertIsNone(self.vault.read("wiki/donnees.json"))

    def test_find_by_name_like_obsidian(self):
        self.assertEqual(self.vault.find("jarvis"), "wiki/Jarvis.md")
        self.assertIsNone(self.vault.find("personne"))

    def test_top3_reads_only_the_first_three_items(self):
        self.write(f"outputs/{DAY}-plan.md",
                   "# Plan\n\n1. Finir le HUD\n2) Appeler Paul\n3. Courir\n\n## Pourquoi\n1. autre liste\n")
        self.assertEqual(self.vault.top3(DAY), ["Finir le HUD", "Appeler Paul", "Courir"])
        self.assertEqual(self.vault.top3(DAY - dt.timedelta(days=1)), [])

    def test_journal_appends_and_never_rewrites(self):
        when = dt.datetime(2026, 10, 11, 9, 5)
        self.vault.journal(when, "premier")
        self.vault.journal(when.replace(minute=6), "second")
        text = self.vault.read(f"raw/{DAY}.md")["content"]
        self.assertTrue(text.startswith("# Journal"))
        self.assertLess(text.index("09:05 premier"), text.index("09:06 second"))

    def test_search_and_context(self):
        self.write("wiki/Paul.md", "Paul aime le vélo. Lié à [[Index]].")
        hits = self.vault.search("paul vélo")
        self.assertEqual([h["name"] for h in hits], ["Paul"])
        self.assertEqual(self.vault.search(""), [])
        self.assertIn("Paul aime", self.vault.context(DAY, "Paul"))


class RouteTest(unittest.TestCase):
    def test_explicit_commands(self):
        self.assertEqual(server.route("/plan"), ("plan", "", True))
        self.assertEqual(server.route("wrap : fini la maquette"), ("wrap", "fini la maquette", True))
        self.assertEqual(server.route("metrics"), ("metrics", "", True))

    def test_free_text_is_guessed_not_explicit(self):
        self.assertEqual(server.route("résume mes mails")[0:3:2], ("inbox", False))
        self.assertEqual(server.route("plan ma journée")[0:3:2], ("plan", False))
        self.assertEqual(server.route("qui est Paul ?")[0:3:2], ("vault", False))


class RoutineTest(unittest.TestCase):
    def at(self, hhmm):
        return dt.datetime.combine(DAY, dt.time.fromisoformat(hhmm))

    def test_each_routine_runs_in_its_own_window(self):
        none_done = lambda day, skill: False  # noqa: E731
        self.assertIsNone(server.due_routine(self.at("06:59"), none_done, set()))
        self.assertEqual(server.due_routine(self.at("07:00"), none_done, set())["skill"], "inbox")
        # Ouvert à 10 h : le briefing est périmé, c'est le plan qui part.
        self.assertEqual(server.due_routine(self.at("10:00"), none_done, set())["skill"], "plan")
        self.assertEqual(server.due_routine(self.at("23:30"), none_done, set())["skill"], "wrap")

    def test_done_or_attempted_routines_do_not_repeat(self):
        done = lambda day, skill: skill == "plan"  # noqa: E731
        self.assertIsNone(server.due_routine(self.at("09:30"), done, set()))
        attempted = {(DAY.isoformat(), "metrics")}
        self.assertIsNone(server.due_routine(self.at("15:00"), lambda d, s: False, attempted))

    def test_tick_runs_once_and_journals(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault = server.Vault(tmp)
            vault.ensure()
            engine = FakeEngine("Trois priorités.")
            jarvis = server.Jarvis(vault, engine, clock=lambda: self.at("09:10"))
            job = jarvis.tick()
            self.assertEqual((job["source"], job["skill"], job["status"]), ("routine", "plan", "done"))
            self.assertIsNone(jarvis.tick())  # tentée une fois, même sans fichier écrit
            self.assertEqual(engine.calls, [("plan", "", True)])
            self.assertIn("[routine · plan]", vault.read(f"raw/{DAY}.md")["content"])


class EngineTest(unittest.TestCase):
    def test_engine_error_becomes_a_message_not_a_crash(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault = server.Vault(tmp)
            vault.ensure()
            jarvis = server.Jarvis(vault, FakeEngine(fail=server.EngineError("Moteur indisponible.")))
            job = jarvis.command("/plan")
            self.assertEqual((job["status"], job["output"]), ("error", "Moteur indisponible."))
            jarvis.engine = FakeEngine(fail=ZeroDivisionError("boum"))
            self.assertEqual(jarvis.command("bonjour")["status"], "error")

    def test_missing_claude_binary_degrades_cleanly(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault = server.Vault(tmp)
            engine = server.ClaudeEngine(vault, binary="claude-introuvable-xyz")
            ok, detail = engine.status()
            self.assertFalse(ok)
            with self.assertRaises(server.EngineError) as caught:
                engine.run("plan", "", True, dt.datetime(2026, 10, 11, 9))
            self.assertIn("introuvable", str(caught.exception))

    def test_claude_engine_invokes_the_skill_and_passes_the_vault(self):
        with tempfile.TemporaryDirectory() as tmp:
            record = Path(tmp) / "args.json"
            fake = Path(tmp) / "claude"
            fake.write_text(
                "#!/usr/bin/env python3\nimport json, sys\n"
                f"json.dump({{'argv': sys.argv[1:], 'stdin': sys.stdin.read()}}, open({str(record)!r}, 'w'))\n"
                "print('Plan écrit.')\n")
            fake.chmod(fake.stat().st_mode | stat.S_IEXEC)
            vault = server.Vault(Path(tmp) / "coffre")
            vault.ensure()
            engine = server.ClaudeEngine(vault, binary=str(fake))
            now = dt.datetime(2026, 10, 11, 9)
            self.assertEqual(engine.run("plan", "finir le HUD", True, now), "Plan écrit.")
            seen = json.loads(record.read_text())
            self.assertEqual(seen["stdin"], "/plan finir le HUD")
            self.assertIn(str(vault.path), seen["argv"])
            self.assertNotIn("Bash", seen["argv"][seen["argv"].index("--allowedTools") + 1])
            engine.run("vault", "qui est Paul ?", False, now)
            self.assertEqual(json.loads(record.read_text())["stdin"], "qui est Paul ?")


class HttpTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        vault = server.Vault(cls.tmp.name)
        vault.ensure()
        cls.engine = FakeEngine("Bien reçu.")
        cls.jarvis = server.Jarvis(vault, cls.engine)
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), lambda *a: None)
        cls.port = cls.httpd.server_address[1]
        cls.httpd.RequestHandlerClass = server.make_handler(cls.jarvis, cls.port)
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.tmp.cleanup()

    def request(self, method, path, body=None, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        hdrs = {"Host": f"127.0.0.1:{self.port}"}
        hdrs.update(headers or {})
        conn.request(method, path, body=body, headers=hdrs)
        resp = conn.getresponse()
        data = resp.read()
        conn.close()
        return resp.status, data

    def test_page_and_state(self):
        status, page = self.request("GET", "/")
        self.assertEqual(status, 200)
        self.assertIn(b"Jarvis HUD", page)
        status, data = self.request("GET", "/api/state")
        state = json.loads(data)
        self.assertEqual([a["time"] for a in state["agenda"]], ["07:00", "09:00", "14:00", "19:00"])
        self.assertIn("cpu", state["vitals"])

    def test_foreign_host_is_refused(self):
        status, _ = self.request("GET", "/api/state", headers={"Host": "evil.example:7777"})
        self.assertEqual(status, 403)

    def test_command_requires_the_custom_header(self):
        body = json.dumps({"text": "/plan"})
        status, _ = self.request("POST", "/api/command", body, {"Content-Type": "text/plain"})
        self.assertEqual(status, 403)
        status, data = self.request("POST", "/api/command", body,
                                    {"Content-Type": "application/json", "X-Jarvis": "1"})
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(data)["output"], "Bien reçu.")

    def test_note_endpoint_stays_in_the_vault(self):
        status, _ = self.request("GET", "/api/note?path=../../etc/passwd")
        self.assertEqual(status, 404)
        status, data = self.request("GET", "/api/note?name=Jarvis")
        self.assertEqual(status, 200)
        self.assertIn("Index", json.loads(data)["links"])


class AccessTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.now = [1000.0]
        self.access = server.Access(Path(self.tmp.name) / "devices.json", clock=lambda: self.now[0])

    def tearDown(self):
        self.tmp.cleanup()

    def test_pairing_gives_a_token_and_burns_the_code(self):
        code, ttl = self.access.start_pairing()
        self.assertRegex(code, r"^\d{6}$")
        token, why = self.access.pair(code, "iPhone")
        self.assertIsNone(why)
        self.assertEqual(self.access.device_for(token)["name"], "iPhone")
        self.assertEqual(self.access.pair(code, "Intrus"), (None, "Aucun code actif — affiches-en un sur le Mac."))

    def test_only_the_digest_is_stored(self):
        code, _ = self.access.start_pairing()
        token, _ = self.access.pair(code, "PC")
        stored = (Path(self.tmp.name) / "devices.json").read_text()
        self.assertNotIn(token, stored)
        self.assertEqual(oct((Path(self.tmp.name) / "devices.json").stat().st_mode & 0o777), "0o600")
        again = server.Access(Path(self.tmp.name) / "devices.json")  # survit au redémarrage
        self.assertIsNotNone(again.device_for(token))

    def test_odd_input_is_just_a_wrong_code(self):
        self.access.start_pairing()
        self.assertEqual(self.access.pair("é12345", "x"), (None, "Code faux."))
        self.assertEqual(self.access.pair(None, "x"), (None, "Code faux."))

    def test_code_expires(self):
        code, ttl = self.access.start_pairing()
        self.now[0] += ttl + 1
        self.assertIsNone(self.access.pair(code, "x")[0])

    def test_five_wrong_tries_kill_the_code(self):
        code, _ = self.access.start_pairing()
        wrong = f"{(int(code) + 1) % 10 ** 6:06d}"
        for _ in range(server.Access.MAX_TRIES):
            self.assertIsNone(self.access.pair(wrong, "x")[0])
        self.assertIsNone(self.access.pair(code, "x")[0])  # même le bon ne passe plus

    def test_revoke(self):
        code, _ = self.access.start_pairing()
        token, _ = self.access.pair(code, "Vieux PC")
        device_id = self.access.listing()[0]["id"]
        self.assertTrue(self.access.revoke(device_id))
        self.assertIsNone(self.access.device_for(token))
        self.assertIsNone(self.access.device_for(""))

    def test_corrupt_file_degrades_to_no_device(self):
        path = Path(self.tmp.name) / "abime.json"
        path.write_text("{pas du json")
        self.assertEqual(server.Access(path).listing(), [])

    def test_icon_is_a_valid_png(self):
        png = server.orb_png(32)
        self.assertTrue(png.startswith(b"\x89PNG\r\n\x1a\n"))
        self.assertTrue(png.endswith(b"IEND\xaeB`\x82"))


def lan_ip():
    """Une adresse non locale de cette machine, pour jouer « l'autre appareil »."""
    import socket
    try:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        probe.connect(("10.255.255.255", 1))
        ip = probe.getsockname()[0]
        probe.close()
        return None if ip.startswith("127.") else ip
    except OSError:
        return None


@unittest.skipUnless(lan_ip(), "aucune interface réseau hors boucle locale")
class SharedHttpTest(unittest.TestCase):
    """Le HUD ouvert au réseau, vu par un vrai client qui n'est pas le Mac."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        vault = server.Vault(Path(cls.tmp.name) / "coffre")
        vault.ensure()
        cls.access = server.Access(Path(cls.tmp.name) / "devices.json")
        cls.jarvis = server.Jarvis(vault, FakeEngine("Bien reçu."))
        cls.httpd = ThreadingHTTPServer(("0.0.0.0", 0), lambda *a: None)
        cls.port = cls.httpd.server_address[1]
        cls.httpd.RequestHandlerClass = server.make_handler(cls.jarvis, cls.port, cls.access, ["http://test/"])
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()
        cls.ip = lan_ip()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.tmp.cleanup()

    def request(self, method, path, body=None, headers=None, remote=True):
        target = self.ip if remote else "127.0.0.1"
        conn = http.client.HTTPConnection(target, self.port, timeout=5)
        hdrs = {"Host": f"{target}:{self.port}"}
        if method == "POST":
            hdrs.update({"Content-Type": "application/json", "X-Jarvis": "1"})
        hdrs.update(headers or {})
        conn.request(method, path, body=json.dumps(body) if body is not None else None, headers=hdrs)
        resp = conn.getresponse()
        data, cookie = resp.read(), resp.getheader("Set-Cookie")
        conn.close()
        return resp.status, data, cookie

    def test_a_stranger_sees_only_the_login_page(self):
        self.assertEqual(self.request("GET", "/")[0], 200)
        self.assertEqual(self.request("GET", "/icon.png")[0], 200)
        status, data, _ = self.request("GET", "/api/state")
        self.assertEqual((status, json.loads(data)["pair"]), (401, True))
        self.assertEqual(self.request("GET", "/api/note?name=Jarvis")[0], 401)
        self.assertEqual(self.request("POST", "/api/command", {"text": "/plan"})[0], 401)
        # …et ne peut ni fabriquer un code ni lister les appareils.
        self.assertEqual(self.request("POST", "/api/pair/start", {})[0], 401)

    def test_pairing_opens_everything_but_owner_actions(self):
        status, data, _ = self.request("POST", "/api/pair/start", {}, remote=False)
        code = json.loads(data)["code"]
        status, _, cookie = self.request("POST", "/api/pair", {"code": code, "name": "iPhone"})
        self.assertEqual(status, 200)
        self.assertIn("HttpOnly", cookie)
        self.assertIn("SameSite=Strict", cookie)
        jar = {"Cookie": cookie.split(";")[0]}
        status, data, _ = self.request("GET", "/api/state", headers=jar)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(data)["access"]["device"], "iPhone")
        self.assertEqual(json.loads(data)["access"]["urls"], [])
        status, data, _ = self.request("POST", "/api/command", {"text": "bonjour"}, headers=jar)
        self.assertEqual(json.loads(data)["output"], "Bien reçu.")
        self.assertEqual(self.request("POST", "/api/pair/start", {}, headers=jar)[0], 403)
        self.assertEqual(self.request("GET", "/api/devices", headers=jar)[0], 403)
        # Un jeton inventé ne vaut rien.
        self.assertEqual(self.request("GET", "/api/state", headers={"Cookie": "jarvis_device=faux"})[0], 401)

    def test_loopback_with_a_foreign_host_is_not_the_owner(self):
        # Ce que voit le serveur derrière `tailscale serve`, ou lors d'un rebinding DNS.
        status, _, _ = self.request("GET", "/api/state", headers={"Host": "mac.tailnet.ts.net"}, remote=False)
        self.assertEqual(status, 401)
        self.assertEqual(self.request("GET", "/api/state", remote=False)[0], 200)


if __name__ == "__main__":
    unittest.main()
