"""HUD de Jarvis — le serveur local qui relie les quatre pièces.

    python3 hud/server.py            # puis http://127.0.0.1:7777

Stdlib pur, comme jarvis.py : aucune dépendance dont la signature pourrait
dériver. Le serveur :

- lit le coffre (vault/) : notes, liens [[...]], plan du jour, journal ;
- mesure les signes vitaux de la machine ;
- passe chaque commande au moteur — Claude Code (`claude -p`, qui route
  vers la bonne skill de .claude/skills/) ou Ollama en 100 % local ;
- déclenche seul les routines de la journée (7 h, 9 h, 14 h, 19 h) ;
- consigne chaque échange dans le journal du coffre.

Il n'écoute que 127.0.0.1 et refuse toute requête dont l'en-tête Host
n'est pas le sien : une page web quelconque ne peut pas lui faire lancer
une commande (ni par formulaire, ni par rebinding DNS).
"""
import argparse
import datetime as dt
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent.parent
HUD_DIR = Path(__file__).resolve().parent
SKILLS_DIR = ROOT / ".claude" / "skills"
sys.path.insert(0, str(ROOT))

SKILLS = ("inbox", "plan", "metrics", "vault", "wrap")

# La journée type. Chaque routine tourne une fois, dans sa fenêtre (de son
# heure jusqu'à l'heure de la suivante) : un HUD ouvert à 10 h lance le plan
# de 9 h, pas le briefing de 7 h déjà périmé.
ROUTINES = (
    {"time": "07:00", "skill": "inbox", "label": "Briefing",
     "say": "Mails, agenda et actu IA, lus à voix haute."},
    {"time": "09:00", "skill": "plan", "label": "Plan",
     "say": "Les 3 priorités du jour, rangées dans le coffre."},
    {"time": "14:00", "skill": "metrics", "label": "Chiffres",
     "say": "Abonnés, vues et followers consignés."},
    {"time": "19:00", "skill": "wrap", "label": "Bilan",
     "say": "Réflexion enregistrée, demain planifié."},
)

# Mots qui trahissent l'intention, pour le moteur local qui ne route pas
# seul. Claude Code, lui, choisit sa skill d'après leur description.
KEYWORDS = {
    "inbox": ("briefing", "mail", "courriel", "inbox", "boîte", "boite", "agenda", "actu"),
    "plan": ("plan", "priorit", "aujourd'hui je fais", "journée"),
    "metrics": ("chiffre", "abonné", "abonne", "vues", "followers", "metrics", "stat"),
    "wrap": ("bilan", "wrap", "fin de journée", "réflexion", "reflexion", "demain"),
}

LINK_RE = re.compile(r"\[\[([^\]|#^]+)(?:[#^][^\]|]*)?(?:\|[^\]]*)?\]\]")
TOP_RE = re.compile(r"^\s*([1-3])[.)]\s+(.+?)\s*$")


# --------------------------------------------------------------- routage

def route(text):
    """Renvoie (skill, reste, explicite).

    Une commande explicite (« /plan », « plan : … », « plan ») désigne sa
    skill sans ambiguïté. Sinon on devine par mots-clés, et par défaut
    c'est une question au coffre.
    """
    stripped = text.strip()
    match = re.match(r"^(/)?([a-zA-Z]+)\s*([:—-])?\s*(.*)$", stripped, re.S)
    if match and match.group(2).lower() in SKILLS and \
            (match.group(1) or match.group(3) or not match.group(4)):
        return match.group(2).lower(), match.group(4).strip(), True
    lowered = stripped.lower()
    for skill, words in KEYWORDS.items():
        if any(word in lowered for word in words):
            return skill, stripped, False
    return "vault", stripped, False


# ---------------------------------------------------------------- coffre

SEED_NOTES = {
    "wiki/Index.md": (
        "# Index\n\nLa racine du coffre. Chaque note y mène, directement ou non.\n\n"
        "- [[Jarvis]] — comment ce système fonctionne\n"
        "- [[Agenda]] — les rendez-vous fixes, si aucun calendrier n'est branché\n"
        "- [[Sources de chiffres]] — ce que la skill metrics relève\n"
    ),
    "wiki/Jarvis.md": (
        "---\ntags: [projet]\n---\n# Jarvis\n\n"
        "Quatre pièces, un système. Retour à l'[[Index]].\n\n"
        "- **Moteur** : Claude Code, qui route chaque demande vers une skill.\n"
        "- **Mémoire** : ce coffre — Markdown lié, lisible dans Obsidian.\n"
        "- **Voix** : Dun au clavier de l'iPhone, la dictée du navigateur sur le Mac.\n"
        "- **Visage** : le HUD, un seul écran.\n\n"
        "Si ce n'est pas dans le coffre, ça n'a pas eu lieu.\n"
    ),
    "wiki/Agenda.md": (
        "# Agenda\n\nRendez-vous fixes, lus par le briefing quand aucun calendrier "
        "n'est branché. Voir [[Index]].\n\n## Agenda\n\n- (à remplir)\n"
    ),
    "wiki/Sources de chiffres.md": (
        "# Sources de chiffres\n\nLu par la skill metrics. Voir [[Index]].\n\n"
        "| Source | Mesure | Comment la lire |\n|---|---|---|\n"
        "| (exemple) YouTube | abonnés | https://www.youtube.com/@pseudo/about |\n"
        "| (exemple) Instagram | followers | à dicter |\n"
    ),
}


class Vault:
    def __init__(self, path):
        self.path = Path(path).expanduser().resolve()

    def ensure(self):
        for folder in ("raw", "wiki", "outputs"):
            (self.path / folder).mkdir(parents=True, exist_ok=True)
        if not any((self.path / "wiki").glob("*.md")):
            for rel, content in SEED_NOTES.items():
                (self.path / rel).write_text(content, encoding="utf-8")

    def _files(self):
        files = []
        for file in self.path.rglob("*.md"):
            rel = file.relative_to(self.path)
            if any(part.startswith(".") for part in rel.parts):
                continue
            files.append(file)
        return files

    def notes(self):
        notes = []
        for file in self._files():
            rel = file.relative_to(self.path)
            stat = file.stat()
            notes.append({
                "path": rel.as_posix(),
                "name": file.stem,
                "folder": rel.parts[0] if len(rel.parts) > 1 else "",
                "mtime": stat.st_mtime,
                "size": stat.st_size,
            })
        notes.sort(key=lambda n: n["mtime"], reverse=True)
        return notes

    def resolve(self, rel):
        """Chemin d'une note, ou None s'il sort du coffre ou n'est pas du Markdown."""
        if not rel:
            return None
        target = (self.path / rel).resolve()
        if target.suffix.lower() != ".md" or not target.is_relative_to(self.path):
            return None
        return target if target.is_file() else None

    def find(self, name):
        """Retrouve une note par son nom, comme Obsidian résout [[Nom]]."""
        wanted = name.strip().lower().removesuffix(".md")
        for note in self.notes():
            if note["name"].lower() == wanted or \
                    note["path"].lower().removesuffix(".md") == wanted:
                return note["path"]
        return None

    def read(self, rel):
        target = self.resolve(rel)
        if target is None:
            return None
        content = target.read_text(encoding="utf-8", errors="replace")
        return {
            "path": target.relative_to(self.path).as_posix(),
            "name": target.stem,
            "content": content,
            "links": sorted(set(link.strip() for link in LINK_RE.findall(content))),
        }

    def graph(self):
        notes = self.notes()
        index = {}
        for i, note in enumerate(notes):
            index.setdefault(note["name"].lower(), i)
            index.setdefault(note["path"].lower().removesuffix(".md"), i)
        edges = set()
        for i, note in enumerate(notes):
            text = (self.path / note["path"]).read_text(encoding="utf-8", errors="replace")
            for link in LINK_RE.findall(text):
                j = index.get(link.strip().lower().removesuffix(".md"))
                if j is not None and j != i:
                    edges.add((min(i, j), max(i, j)))
        degree = [0] * len(notes)
        for i, j in edges:
            degree[i] += 1
            degree[j] += 1
        nodes = [{"path": n["path"], "name": n["name"], "folder": n["folder"],
                  "degree": degree[k]} for k, n in enumerate(notes)]
        return {"nodes": nodes, "edges": sorted(edges)}

    def search(self, query, limit=20):
        words = [w for w in query.lower().split() if w]
        if not words:
            return []
        hits = []
        for note in self.notes():
            text = (self.path / note["path"]).read_text(encoding="utf-8", errors="replace")
            haystack = (note["name"] + "\n" + text).lower()
            if all(word in haystack for word in words):
                pos = haystack.find(words[0])
                start = max(0, pos - len(note["name"]) - 40)
                snippet = (note["name"] + "\n" + text)[start:start + 140]
                hits.append({"path": note["path"], "name": note["name"],
                             "snippet": " ".join(snippet.split())})
            if len(hits) >= limit:
                break
        return hits

    def output_path(self, day, skill):
        return self.path / "outputs" / f"{day.isoformat()}-{skill}.md"

    def done(self, day, skill):
        return self.output_path(day, skill).is_file()

    def top3(self, day):
        file = self.output_path(day, "plan")
        if not file.is_file():
            return []
        found = {}
        for line in file.read_text(encoding="utf-8", errors="replace").splitlines():
            match = TOP_RE.match(line)
            if match and match.group(1) not in found:
                found[match.group(1)] = match.group(2)
            if len(found) == 3:
                break
        return [found[k] for k in ("1", "2", "3") if k in found]

    def journal(self, when, line):
        """Ajoute une ligne au journal du jour. raw/ ne se réécrit jamais."""
        file = self.path / "raw" / f"{when.date().isoformat()}.md"
        file.parent.mkdir(parents=True, exist_ok=True)
        new = not file.exists()
        with file.open("a", encoding="utf-8") as handle:
            if new:
                handle.write(f"# Journal — {when.date().isoformat()}\n\nVoir [[Index]].\n\n")
            handle.write(f"- {when:%H:%M} {line}\n")

    def context(self, day, query="", limit=6000):
        """Le morceau de coffre utile à un moteur qui ne lit pas les fichiers seul."""
        yesterday = day - dt.timedelta(days=1)
        wanted = [f"raw/{day.isoformat()}.md"]
        for skill in ("inbox", "plan", "metrics", "wrap"):
            wanted.append(f"outputs/{day.isoformat()}-{skill}.md")
        wanted += [f"outputs/{yesterday.isoformat()}-plan.md",
                   f"outputs/{yesterday.isoformat()}-wrap.md"]
        wanted += [hit["path"] for hit in self.search(query, limit=4)] if query else []
        chunks, seen, size = [], set(), 0
        for rel in wanted:
            note = self.read(rel)
            if note is None or rel in seen:
                continue
            seen.add(rel)
            chunk = f"### {rel}\n{note['content'].strip()}\n"
            if size + len(chunk) > limit:
                break
            chunks.append(chunk)
            size += len(chunk)
        return "\n".join(chunks) or "(le coffre ne contient encore rien d'utile)"


# --------------------------------------------------------------- moteurs

class EngineError(RuntimeError):
    """Le moteur n'a pas pu répondre. Le message est fait pour l'utilisateur."""


JOURS = ("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche")
MOIS = ("janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
        "septembre", "octobre", "novembre", "décembre")


def french_date(day):
    return f"{JOURS[day.weekday()]} {day.day} {MOIS[day.month - 1]} {day.year}"


def system_context(vault, now):
    return (
        "Tu es Jarvis, l'assistant vocal de l'utilisateur, piloté depuis son HUD. "
        f"Nous sommes le {french_date(now)}, il est {now:%H:%M}. "
        f"Le coffre (sa mémoire, Markdown Obsidian) est ici : {vault.path} — "
        "dossiers raw/, wiki/, outputs/. Réponds en français, court, en phrases "
        "faites pour être lues à voix haute. N'invente jamais un souvenir, un mail "
        "ou un chiffre : si une source manque, dis-le."
    )


class ClaudeEngine:
    """Claude Code en mode non interactif. Il charge seul les skills du dépôt."""

    name = "claude"
    default_tools = "Read,Write,Edit,Glob,Grep,WebSearch,WebFetch"

    def __init__(self, vault, binary=None, tools=None, timeout=600):
        self.vault = vault
        self.binary = binary or os.environ.get("JARVIS_CLAUDE_BIN", "claude")
        self.tools = tools or os.environ.get("JARVIS_ALLOWED_TOOLS", self.default_tools)
        self.timeout = timeout

    def status(self):
        found = shutil.which(self.binary)
        if found:
            return True, "Claude Code"
        return False, f"« {self.binary} » introuvable — installe Claude Code ou lance avec --engine ollama"

    def run(self, skill, text, explicit, now):
        ok, detail = self.status()
        if not ok:
            raise EngineError(f"Moteur indisponible : {detail}.")
        # Une commande explicite invoque la skill par son nom ; une phrase
        # libre est passée telle quelle, Claude Code choisit la skill.
        prompt = f"/{skill} {text}".strip() if explicit else text
        command = [
            shutil.which(self.binary), "-p",
            "--permission-mode", "acceptEdits",
            "--allowedTools", self.tools,
            "--append-system-prompt", system_context(self.vault, now),
            "--add-dir", str(self.vault.path),
        ]
        try:
            done = subprocess.run(command, input=prompt, cwd=ROOT, capture_output=True,
                                  text=True, timeout=self.timeout)
        except subprocess.TimeoutExpired as exc:
            raise EngineError(f"Claude Code n'a pas répondu en {self.timeout} s.") from exc
        except OSError as exc:
            raise EngineError(f"Impossible de lancer Claude Code : {exc}") from exc
        if done.returncode != 0:
            detail = (done.stderr or done.stdout).strip().splitlines()
            raise EngineError("Claude Code a échoué : " + (detail[-1] if detail else f"code {done.returncode}"))
        return done.stdout.strip() or "(réponse vide)"


class OllamaEngine:
    """Un modèle local via Ollama. 100 % local, mais il ne touche pas aux fichiers :
    c'est le serveur qui lui fournit le coffre et qui écrit ses productions."""

    name = "ollama"

    def __init__(self, vault):
        self.vault = vault

    def _url(self):
        import jarvis
        return jarvis.OLLAMA_URL

    def status(self):
        base = self._url().split("/api/")[0]
        try:
            with urllib.request.urlopen(base + "/api/tags", timeout=1.5):
                pass
        except (urllib.error.URLError, TimeoutError, OSError):
            return False, f"Ollama injoignable à {base} — lance « ollama serve »"
        import jarvis
        return True, f"Ollama · {jarvis.MODEL}"

    def run(self, skill, text, explicit, now):
        import jarvis
        instructions = (SKILLS_DIR / skill / "SKILL.md").read_text(encoding="utf-8")
        system = (
            system_context(self.vault, now)
            + "\n\nTu n'as pas accès aux fichiers : le contenu utile du coffre est "
            "donné ci-dessous, et le serveur enregistrera ta réponse lui-même. "
            "Écris directement le contenu attendu par la skill.\n\n"
            f"## Skill {skill}\n{instructions}\n\n## Coffre\n{self.vault.context(now.date(), text)}"
        )
        messages = [{"role": "system", "content": system},
                    {"role": "user", "content": text or f"Exécute la skill {skill}."}]
        try:
            reply = jarvis.call_ollama(messages, timeout=300)
        except jarvis.OllamaUnavailableError as exc:
            raise EngineError(f"Moteur local injoignable : {exc}") from exc
        if skill in ("inbox", "plan", "metrics", "wrap"):
            self.vault.output_path(now.date(), skill).write_text(reply.strip() + "\n", encoding="utf-8")
        return reply.strip()


# ---------------------------------------------------------- signes vitaux

def _sh(*command):
    try:
        return subprocess.run(command, capture_output=True, text=True, timeout=2).stdout
    except (OSError, subprocess.SubprocessError):
        return ""


def vitals(path):
    """Ce que la machine peut dire d'elle-même. Une mesure introuvable vaut None."""
    data = {"host": platform.node(), "system": platform.system(), "cpu": None,
            "memory": None, "disk": None, "uptime": None, "battery": None}
    try:
        load = os.getloadavg()[0]
        data["cpu"] = round(min(100.0, 100.0 * load / (os.cpu_count() or 1)), 1)
    except (OSError, AttributeError):
        pass
    try:
        usage = shutil.disk_usage(path)
        data["disk"] = round(100.0 * usage.used / usage.total, 1)
    except OSError:
        pass
    if data["system"] == "Linux":
        try:
            info = dict(line.split(":", 1) for line in Path("/proc/meminfo").read_text().splitlines())
            total = int(info["MemTotal"].split()[0])
            free = int(info["MemAvailable"].split()[0])
            data["memory"] = round(100.0 * (total - free) / total, 1)
            data["uptime"] = int(float(Path("/proc/uptime").read_text().split()[0]))
        except (OSError, KeyError, ValueError):
            pass
        for battery in Path("/sys/class/power_supply").glob("BAT*/capacity"):
            try:
                data["battery"] = int(battery.read_text().strip())
            except (OSError, ValueError):
                pass
    elif data["system"] == "Darwin":
        total = _sh("sysctl", "-n", "hw.memsize").strip()
        stats = _sh("vm_stat")
        page = re.search(r"page size of (\d+)", stats)
        if total.isdigit() and page:
            pages = {k.strip(): int(v.strip(" .")) for k, v in re.findall(r"^(Pages [^:]+):\s+(\d+)", stats, re.M)}
            free = sum(pages.get(k, 0) for k in ("Pages free", "Pages inactive", "Pages speculative"))
            data["memory"] = round(100.0 * (1 - free * int(page.group(1)) / int(total)), 1)
        boot = re.search(r"sec = (\d+)", _sh("sysctl", "-n", "kern.boottime"))
        if boot:
            data["uptime"] = int(time.time()) - int(boot.group(1))
        batt = re.search(r"(\d+)%", _sh("pmset", "-g", "batt"))
        if batt:
            data["battery"] = int(batt.group(1))
    return data


# ---------------------------------------------------------------- Jarvis

def due_routine(now, done, attempted):
    """La routine à lancer maintenant, s'il y en a une — fonction pure, testée."""
    today = now.date()
    for i, routine in enumerate(ROUTINES):
        start = dt.datetime.combine(today, dt.time.fromisoformat(routine["time"]))
        if i + 1 < len(ROUTINES):
            end = dt.datetime.combine(today, dt.time.fromisoformat(ROUTINES[i + 1]["time"]))
        else:
            end = dt.datetime.combine(today + dt.timedelta(days=1), dt.time())
        key = (today.isoformat(), routine["skill"])
        if start <= now < end and key not in attempted and not done(today, routine["skill"]):
            return routine
    return None


class Jarvis:
    def __init__(self, vault, engine, clock=dt.datetime.now):
        self.vault = vault
        self.engine = engine
        self.clock = clock
        self.lock = threading.Lock()
        self.jobs = deque(maxlen=30)
        self.attempted = set()
        self._counter = 0
        self._meta = threading.Lock()
        self._vitals = (0.0, None)

    def command(self, text, source="hud", forced_skill=None):
        if forced_skill:
            skill, rest, explicit = forced_skill, text, True
        else:
            skill, rest, explicit = route(text)
        with self._meta:
            self._counter += 1
            job = {"id": self._counter, "source": source, "text": text, "skill": skill,
                   "route": skill if explicit or self.engine.name != "claude" else "auto",
                   "status": "queued", "output": "", "started": None, "ended": None}
            self.jobs.append(job)
        with self.lock:
            now = self.clock()
            job["status"], job["started"] = "running", now.isoformat(timespec="seconds")
            try:
                job["output"] = self.engine.run(skill, rest, explicit, now)
                job["status"] = "done"
            except EngineError as exc:
                job["output"], job["status"] = str(exc), "error"
            except Exception as exc:  # jamais de crash du serveur pour une commande
                job["output"], job["status"] = f"Erreur inattendue : {exc}", "error"
            end = self.clock()
            job["ended"] = end.isoformat(timespec="seconds")
            said = " ".join(text.split())[:160] or f"/{skill}"
            answer = " ".join(job["output"].split())[:240]
            mark = "✗" if job["status"] == "error" else "→"
            try:
                self.vault.journal(end, f"[{source} · {skill}] « {said} » {mark} {answer}")
            except OSError:
                pass
        return job

    def tick(self):
        routine = due_routine(self.clock(), self.vault.done, self.attempted)
        if routine is None:
            return None
        self.attempted.add((self.clock().date().isoformat(), routine["skill"]))
        return self.command("", source="routine", forced_skill=routine["skill"])

    def state(self):
        now = self.clock()
        today = now.date()
        stamp, cached = self._vitals
        if cached is None or time.time() - stamp > 2:
            cached = vitals(self.vault.path)
            self._vitals = (time.time(), cached)
        ok, detail = self.engine.status()
        notes = self.vault.notes()
        agenda = []
        for routine in ROUTINES:
            path = self.vault.output_path(today, routine["skill"])
            agenda.append({**routine, "done": path.is_file(),
                           "output": path.relative_to(self.vault.path).as_posix()})
        counts = {"raw": 0, "wiki": 0, "outputs": 0}
        for note in notes:
            if note["folder"] in counts:
                counts[note["folder"]] += 1
        return {
            "now": now.isoformat(timespec="seconds"),
            "engine": {"name": self.engine.name, "ok": ok, "detail": detail},
            "vitals": cached,
            "agenda": agenda,
            "top3": self.vault.top3(today),
            "vault": {"path": str(self.vault.path), "counts": counts, "total": len(notes),
                      "recent": [{"path": n["path"], "name": n["name"]} for n in notes[:8]]},
            "busy": self.lock.locked(),
            "jobs": list(self.jobs)[-12:],
        }


# ------------------------------------------------------------------ HTTP

def make_handler(jarvis, port):
    allowed_hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
    page = (HUD_DIR / "index.html").read_bytes()

    class Handler(BaseHTTPRequestHandler):
        server_version = "JarvisHUD/1"

        def log_message(self, fmt, *args):  # silencieux : le journal est dans le coffre
            pass

        def _send(self, status, body, kind="application/json; charset=utf-8"):
            if not isinstance(body, bytes):
                body = json.dumps(body, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", kind)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(body)

        def _trusted(self):
            # Rebinding DNS : un domaine étranger qui pointe vers 127.0.0.1
            # arrive avec son propre Host. On ne répond qu'au nôtre.
            if self.headers.get("Host") not in allowed_hosts:
                self._send(403, {"error": "hôte refusé"})
                return False
            return True

        def do_GET(self):
            if not self._trusted():
                return
            url = urlparse(self.path)
            query = parse_qs(url.query)
            if url.path in ("/", "/index.html"):
                return self._send(200, page, "text/html; charset=utf-8")
            if url.path == "/api/state":
                return self._send(200, jarvis.state())
            if url.path == "/api/graph":
                return self._send(200, jarvis.vault.graph())
            if url.path == "/api/search":
                return self._send(200, jarvis.vault.search(query.get("q", [""])[0]))
            if url.path == "/api/note":
                rel = query.get("path", [""])[0]
                if not rel and query.get("name"):
                    rel = jarvis.vault.find(query["name"][0]) or ""
                note = jarvis.vault.read(rel)
                return self._send(200, note) if note else self._send(404, {"error": "note introuvable"})
            self._send(404, {"error": "inconnu"})

        def do_POST(self):
            if not self._trusted():
                return
            # Un formulaire d'un autre site ne peut pas poser cet en-tête sans
            # une requête préalable (CORS) à laquelle on ne répond jamais.
            if self.headers.get("X-Jarvis") != "1":
                return self._send(403, {"error": "en-tête X-Jarvis manquant"})
            if urlparse(self.path).path != "/api/command":
                return self._send(404, {"error": "inconnu"})
            try:
                length = min(int(self.headers.get("Content-Length", "0")), 20000)
                text = str(json.loads(self.rfile.read(length) or b"{}").get("text", "")).strip()
            except (ValueError, AttributeError):
                return self._send(400, {"error": "JSON attendu"})
            if not text:
                return self._send(400, {"error": "commande vide"})
            self._send(200, jarvis.command(text[:4000]))

    return Handler


def main(argv=None):
    parser = argparse.ArgumentParser(description="HUD de Jarvis")
    parser.add_argument("--port", type=int, default=int(os.environ.get("JARVIS_HUD_PORT", "7777")))
    parser.add_argument("--vault", default=os.environ.get("JARVIS_VAULT", str(ROOT / "vault")))
    parser.add_argument("--engine", choices=("claude", "ollama"),
                        default=os.environ.get("JARVIS_ENGINE", "claude"))
    parser.add_argument("--no-auto", action="store_true",
                        help="ne pas lancer seul les routines de la journée")
    args = parser.parse_args(argv)

    vault = Vault(args.vault)
    vault.ensure()
    engine = ClaudeEngine(vault) if args.engine == "claude" else OllamaEngine(vault)
    jarvis = Jarvis(vault, engine)

    if not args.no_auto:
        def scheduler():
            while True:
                try:
                    jarvis.tick()
                except Exception as exc:  # la boucle ne meurt jamais
                    print(f"[routine] {exc}", file=sys.stderr)
                time.sleep(20)
        threading.Thread(target=scheduler, daemon=True).start()

    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(jarvis, args.port))
    ok, detail = engine.status()
    print(f"Jarvis HUD → http://127.0.0.1:{args.port}/")
    print(f"  coffre  : {vault.path}")
    print(f"  moteur  : {detail}" + ("" if ok else "  (les commandes renverront ce message)"))
    print(f"  routines: {'désactivées' if args.no_auto else '07:00 · 09:00 · 14:00 · 19:00'}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print()


if __name__ == "__main__":
    main()
