"""Yürütücü: AST'yi çalıştırır — boru hatları, yönlendirmeler, && || ;, arka plan işleri,
yerleşikler.

    kabuk = Shell(cwd="/tmp/deneme")
    kabuk.run("printf 'b\\na\\n' | sort > sirali.txt && echo tamam")   → çıkış kodu
Boru hattı: her komut `subprocess.Popen` ile, bir öncekinin stdout'u sonrakinin stdin'i olacak
şekilde başlatılır; ebeveyn kendi kopyalarını kapatır (yoksa okuyan taraf hiç EOF görmez ve
takılır).
Çıkış kodları: komut yoksa 127, çalıştırılamıyorsa 126, sinyalle öldüyse 128+sinyal; boru hattının
kodu
son komutun kodudur. Güvenlik: komutlar her zaman argüman LİSTESİ olarak çalışır (`shell=True` yok);
açılmış değerler yeniden yorumlanmaz (değişkene konmuş "; rm -rf /" yalnız bir metindir).
Genişletme: yeni bir yerleşik için `_builtin_<ad>` yöntemi yazın ve `BUILTINS`'e adını ekleyin.
"""

from __future__ import annotations

import os
import signal
import subprocess
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

from kabuk.expand import expand_word
from kabuk.lexer import ParseError
from kabuk.parser import AndOr, Command, Pipeline, Redirect, parse

BUILTINS = ("cd", "pwd", "export", "unset", "exit", "jobs", "wait")
_TRUNCATE = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
_APPEND = os.O_WRONLY | os.O_CREAT | os.O_APPEND
_FLAGS = {">": _TRUNCATE, "&>": _TRUNCATE, "2>": _TRUNCATE, ">>": _APPEND, "2>>": _APPEND}


@dataclass
class Job:
    number: int
    text: str
    processes: list[subprocess.Popen[bytes]] = field(default_factory=list)

    def status(self) -> int | None:
        codes = [p.poll() for p in self.processes]
        return None if any(c is None for c in codes) else _exit_code(codes[-1] or 0)


def _exit_code(returncode: int) -> int:
    return 128 - returncode if returncode < 0 else returncode


class Shell:
    def __init__(
        self, cwd: str | os.PathLike[str] | None = None, env: dict[str, str] | None = None
    ) -> None:
        self.cwd = Path(cwd or os.getcwd()).resolve()
        self.env = dict(os.environ if env is None else env)  # dışa aktarılmış değişkenler
        self.vars: dict[str, str] = {}  # yalnız kabukta kalan değişkenler
        self.last_status = 0
        self.jobs: dict[int, Job] = {}
        self.exit_code: int | None = None  # `exit` çağrılınca dolar

    def lookup(self, name: str) -> str | None:
        if name == "?":
            return str(self.last_status)
        if name == "$":
            return str(os.getpid())
        return self.vars.get(name, self.env.get(name))

    def write(self, fd: int, text: str) -> None:
        os.write(fd, text.encode("utf-8"))

    def run(self, line: str) -> int:
        """Bir komut satırını çalıştırır; son komutun çıkış kodunu döndürür."""
        try:
            items = parse(line)
        except ParseError as exc:
            self.write(2, f"kabuk: sözdizimi hatası: {exc}\n")
            self.last_status = 2
            return 2
        for item in items:
            if self.exit_code is not None:
                break
            if item.background:
                self._start_job(item.body, line)
            else:
                self.last_status = self._run_and_or(item.body)
        return self.last_status

    def _run_and_or(self, node: AndOr) -> int:
        status = self._run_pipeline(node.first)
        for op, pipeline in node.rest:
            self.last_status = status
            if (op == "&&") == (status == 0):
                status = self._run_pipeline(pipeline)
        return status

    def _expand(self, command: Command) -> tuple[list[str], dict[str, str]]:
        argv = [arg for word in command.words for arg in expand_word(word, self.lookup, self.cwd)]
        assigned = {
            name: "".join(expand_word(word, self.lookup, self.cwd))
            for name, word in command.assignments
        }
        return argv, assigned

    def _open_redirects(self, command: Command, stdout: int | None) -> dict[int, int]:
        """Yönlendirmeleri açar → {hedef fd: açık fd}. "2>&1" stderr'i stdout'un O ANKİ hedefine
        bağlar (boru hattındaysa borunun yazma ucuna).
        """
        opened: dict[int, int] = {}
        try:
            for redirect in command.redirects:
                self._apply_redirect(redirect, opened, stdout)
        except OSError:
            for fd in set(opened.values()):
                os.close(fd)
            raise
        return opened

    def _apply_redirect(
        self, redirect: Redirect, opened: dict[int, int], stdout: int | None
    ) -> None:
        if redirect.op == "2>&1":
            opened[2] = os.dup(opened.get(1, stdout if stdout is not None else 1))
            return
        assert redirect.target is not None
        names = expand_word(redirect.target, self.lookup, self.cwd)
        if len(names) != 1:
            raise OSError(f"belirsiz yönlendirme hedefi: {redirect.target.text}")
        path = self.cwd / names[0]
        if redirect.op == "<":
            opened[0] = os.open(path, os.O_RDONLY)
            return
        fd = os.open(path, _FLAGS[redirect.op], 0o644)
        targets = (1, 2) if redirect.op == "&>" else (2,) if redirect.op.startswith("2") else (1,)
        for number, target in enumerate(targets):
            opened[target] = fd if number == 0 else os.dup(fd)

    def _run_pipeline(self, pipeline: Pipeline, job: Job | None = None) -> int:
        processes: list[subprocess.Popen[bytes]] = []
        previous: int | None = None  # bir önceki komutun çıktısını okuyan uç
        status = 0
        for index, command in enumerate(pipeline.commands):
            last = index == len(pipeline.commands) - 1
            read_end, write_end = (None, None) if last else os.pipe()
            try:
                status, process = self._spawn(
                    command, previous, write_end, alone=len(pipeline.commands) == 1
                )
            finally:
                for fd in (previous, write_end):
                    if fd is not None:
                        os.close(fd)  # ebeveynin kopyası kapanmazsa okuyan taraf EOF görmez
            if process is not None:
                processes.append(process)
            previous = read_end
        if job is not None:
            job.processes = processes
            return 0
        for process in processes:
            process.wait()
        return _exit_code(processes[-1].returncode) if processes and status == -1 else status

    def _spawn(
        self, command: Command, stdin: int | None, stdout: int | None, alone: bool
    ) -> tuple[int, subprocess.Popen[bytes] | None]:
        """Tek komutu başlatır → (çıkış kodu ya da -1 "sürecin bitmesini bekle", süreç)."""
        try:
            argv, assigned = self._expand(command)
            opened = self._open_redirects(command, stdout)
        except OSError as exc:
            self.write(2, f"kabuk: {exc}\n")
            return 1, None
        try:
            if not argv:
                self.vars.update(assigned)  # yalnız atama: AD=değer
                for name in assigned.keys() & self.env.keys():
                    self.env[name] = assigned[name]
                return 0, None
            if argv[0] in BUILTINS:
                out = opened.get(1, stdout if stdout is not None else 1)
                return self._builtin(argv, out, opened.get(2, 2), alone), None
            env = {**self.env, **assigned}
            try:
                process = subprocess.Popen(
                    argv,
                    cwd=self.cwd,
                    env=env,
                    stdin=opened.get(0, stdin),
                    stdout=opened.get(1, stdout),
                    stderr=opened.get(2),
                )
            except FileNotFoundError:
                self.write(opened.get(2, 2), f"kabuk: komut bulunamadı: {argv[0]}\n")
                return 127, None
            except PermissionError:
                self.write(opened.get(2, 2), f"kabuk: çalıştırılamıyor (izin yok): {argv[0]}\n")
                return 126, None
            return -1, process
        finally:
            for fd in set(opened.values()) - {0, 1, 2}:
                os.close(fd)

    def _builtin(self, argv: list[str], out: int, err: int, alone: bool) -> int:
        handler: Callable[[list[str], int, int], int] = getattr(self, f"_builtin_{argv[0]}")
        if not alone and argv[0] in ("cd", "export", "unset", "exit"):
            return 0  # boru hattında durum değiştiren yerleşikler etkisizdir (alt kabuk gibi)
        return handler(argv[1:], out, err)

    def _builtin_cd(self, args: list[str], out: int, err: int) -> int:
        target = args[0] if args else self.env.get("HOME", "/")
        if target == "-":
            target = self.vars.get("OLDPWD", str(self.cwd))
        path = (self.cwd / os.path.expanduser(target)).resolve()
        if not path.is_dir():
            self.write(err, f"cd: böyle bir dizin yok: {target}\n")
            return 1
        self.vars["OLDPWD"], self.cwd = str(self.cwd), path
        return 0

    def _builtin_pwd(self, args: list[str], out: int, err: int) -> int:
        self.write(out, f"{self.cwd}\n")
        return 0

    def _builtin_export(self, args: list[str], out: int, err: int) -> int:
        for arg in args:
            name, equals, value = arg.partition("=")
            self.env[name] = value if equals else self.vars.get(name, self.env.get(name, ""))
            self.vars.pop(name, None)
        return 0

    def _builtin_unset(self, args: list[str], out: int, err: int) -> int:
        for name in args:
            self.vars.pop(name, None)
            self.env.pop(name, None)
        return 0

    def _builtin_exit(self, args: list[str], out: int, err: int) -> int:
        code = int(args[0]) if args and args[0].isdigit() else self.last_status
        self.exit_code = code
        return code

    def _builtin_jobs(self, args: list[str], out: int, err: int) -> int:
        for number, job in sorted(self.jobs.items()):
            status = job.status()
            state = "Çalışıyor" if status is None else f"Bitti ({status})"
            self.write(out, f"[{number}] {state}  {job.text}\n")
            if status is not None:
                del self.jobs[number]
        return 0

    def _builtin_wait(self, args: list[str], out: int, err: int) -> int:
        status = 0
        for number in sorted(self.jobs):
            for process in self.jobs[number].processes:
                status = _exit_code(process.wait())
            del self.jobs[number]
        return status

    def _start_job(self, body: AndOr, text: str) -> None:
        number = max(self.jobs, default=0) + 1
        job = Job(number, text.strip().rstrip("&").strip())
        if body.rest:
            self.write(
                2, "kabuk: arka planda && / || zinciri desteklenmiyor; yalnız ilk boru çalıştı.\n"
            )
        self._run_pipeline(body.first, job)
        self.jobs[number] = job
        pid = job.processes[-1].pid if job.processes else 0
        self.write(2, f"[{number}] {pid}\n")
        self.last_status = 0

    def close(self) -> None:
        """Arka planda kalan işleri sonlandırır (kabuk kapanırken)."""
        for job in self.jobs.values():
            for process in job.processes:
                if process.poll() is None:
                    process.send_signal(signal.SIGTERM)
                process.wait()
        self.jobs.clear()


def run_lines(lines: list[str], shell: Shell) -> int:
    """Betik dosyası satırlarını sırayla çalıştırır; `exit` gelince durur."""
    for line in lines:
        shell.run(line)
        if shell.exit_code is not None:
            return shell.exit_code
    return shell.last_status
