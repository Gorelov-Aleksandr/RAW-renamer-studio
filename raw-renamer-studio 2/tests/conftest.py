"""Общий фикстура-хелпер: поднимает sidecar на случайном порту в tmp-каталоге."""
from __future__ import annotations

import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent.parent
SERVER = HERE / 'src-python' / 'server.py'


def _free_port() -> int:
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    p = s.getsockname()[1]
    s.close()
    return p


class Sidecar:
    def __init__(self, tmp: Path, demo: Path | None = None, watchdog: float = 0.0):
        self.tmp = tmp
        self.port_file = tmp / 'port'
        self.log = tmp / 'sidecar.log'
        args = [
            sys.executable, str(SERVER),
            '--port', '0',
            '--port-file', str(self.port_file),
            '--data-dir', str(tmp / 'data'),
            '--watchdog', str(watchdog),
        ]
        if demo:
            args += ['--demo-folder', str(demo)]
        self.proc = subprocess.Popen(
            args, stdout=self.log.open('w'), stderr=subprocess.STDOUT,
            cwd=str(HERE),
        )
        # ждём SIDECAR_READY (первая строка stdout) и port-file
        self.port = None
        for _ in range(100):
            if self.port_file.exists():
                try:
                    self.port = int(self.port_file.read_text().strip())
                    if self.port:
                        break
                except ValueError:
                    pass
            if self.proc.poll() is not None:
                raise RuntimeError('sidecar умер при старте: ' + self.log.read_text()[-2000:])
            time.sleep(0.1)
        assert self.port, 'порт не получен: ' + self.log.read_text()[-2000:]
        # дождались ли мы строки READY в логе (парсит JSON-событие)
        self.ready_line = None
        for line in self.log.read_text().splitlines():
            try:
                j = json.loads(line)
            except Exception:
                continue
            if j.get('event') == 'SIDECAR_READY':
                self.ready_line = j
                break
        assert self.ready_line, 'SIDECAR_READY не найден'
        # v3.3 (G2): после READY сервер обязан принимать запросы — проверяем
        # /health рековым HTTP-запросом, не доверяя строке в логе.
        for _ in range(50):
            try:
                with urllib.request.urlopen(
                        f'http://127.0.0.1:{self.port}/health', timeout=2) as r:
                    if r.status == 200:
                        break
            except Exception:
                time.sleep(0.1)
        else:
            raise RuntimeError('READY объявлен, но /health не отвечает')
        self.first_rpc_elapsed = None  # заполняется первым rpc()

    def rpc(self, method: str, params: dict | None = None, timeout: float = 30.0):
        body = json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': method,
                           'params': params or {}}).encode()
        req = urllib.request.Request(
            f'http://127.0.0.1:{self.port}/rpc', data=body,
            headers={'Content-Type': 'application/json'})
        t0 = time.time()
        try:
            j = json.load(urllib.request.urlopen(req, timeout=timeout))
        except urllib.error.HTTPError as e:
            j = json.load(e)
        j['elapsed'] = time.time() - t0
        return j

    def ok(self, method: str, params: dict | None = None, timeout: float = 30.0):
        j = self.rpc(method, params, timeout)
        assert 'error' not in j, f'{method}: {j.get("error")}'
        return j['result']

    def err(self, method: str, params: dict | None = None, timeout: float = 30.0):
        j = self.rpc(method, params, timeout)
        assert 'error' in j, f'{method}: ожидалась ошибка, получили: {j.get("result")}'
        return j['error']

    def http(self, path: str, data: bytes | None = None,
             headers: dict | None = None, method: str = 'POST'):
        req = urllib.request.Request(f'http://127.0.0.1:{self.port}{path}',
                                     data=data, headers=headers or {}, method=method)
        try:
            r = urllib.request.urlopen(req, timeout=30)
            return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()

    def raw_http(self, path: str, data: bytes):
        """Сырой POST с заданным телом (для проверки невалидного JSON)."""
        import http.client
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=30)
        conn.request('POST', path, body=data, headers={'Content-Type': 'application/json'})
        r = conn.getresponse()
        buf = r.read()
        conn.close()
        return buf

    def stop(self):
        if self.proc.poll() is None:
            self.proc.send_signal(signal.SIGTERM)
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait()


@pytest.fixture(scope='session')
def sc(tmp_path_factory) -> Sidecar:
    tmp = tmp_path_factory.mktemp('sidecar')
    s = Sidecar(tmp, demo=HERE / 'demo_batch')
    yield s
    s.stop()


def pytest_sessionfinish(session, exitstatus):
    """Перечать PERF_REPORT (замеры test_perf.py) в stdout для отчёта."""
    try:
        import json
        from test_perf import PERF
        if PERF:
            print('\n=== PERF REPORT ===')
            print(json.dumps(PERF, indent=1, ensure_ascii=False))
    except Exception:
        pass


def make_jpeg(path: Path, size=(640, 480), seed: int = 0) -> Path:
    """Фейковый «RAW»: контейнер с встроенным JPEG (без ШК)."""
    from PIL import Image, ImageDraw
    import random
    im = Image.new('RGB', size)
    d = ImageDraw.Draw(im)
    rnd = random.Random(seed)
    for _ in range(40):
        x0, y0 = rnd.randrange(0, size[0]), rnd.randrange(0, size[1])
        x1, y1 = x0 + rnd.randrange(10, 200), y0 + rnd.randrange(10, 200)
        d.rectangle([x0, y0, x1, y1], fill=(rnd.randrange(256), rnd.randrange(256), rnd.randrange(256)))
    tmp = path.with_suffix('.jpg')
    im.save(tmp, 'JPEG', quality=80)
    data = tmp.read_bytes()
    tmp.unlink()
    path.write_bytes(b'\x00' * 1024 + data + b'\x00' * 512)  # «RAW-обёртка»
    return path
