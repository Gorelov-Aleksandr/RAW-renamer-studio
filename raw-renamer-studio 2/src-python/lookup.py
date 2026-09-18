"""RAW Renamer Studio — каскадный поиск ШК (master §8.3, §9).

Каскад: Заявка (.xlsx, колонки A/D) → SQLite-кэш → APIM v3 Лемана ПРО.
"""
from __future__ import annotations

import sqlite3
import time
from pathlib import Path
from typing import Optional

import httpx

APIM = {
    'preprod': {
        'url': 'https://preprod-api.apim.lmru.tech/offers/v3/search?showFacets=false&showProducts=true',
        'key': 'kHtQ58dTHxi9LAarU7zQrD0nu6n0mamar',
        'customer': '60071799',
    },
    'prod': {
        'url': 'https://api.apim.lmru.tech/offers/v3/search?showFacets=false&showProducts=true',
        'key': '',
        'customer': '60071799',
    },
}


def _s(v) -> Optional[str]:
    if v is None:
        return None
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    s = str(v).strip()
    return s or None


class Lookup:
    def __init__(self, data_dir, env: str = 'preprod', customer_id: str = '60071799',
                 timeout: float = 5.0, enabled: bool = True):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(self.data_dir / 'barcodes_cache.sqlite', check_same_thread=False)
        self.db.execute(
            'CREATE TABLE IF NOT EXISTS bc (barcode TEXT PRIMARY KEY, lm TEXT, '
            'name TEXT, source TEXT, ts TEXT)')
        self.db.commit()
        cfg = APIM.get(env, APIM['preprod'])
        self.api_url = cfg['url']
        self.api_key = cfg['key']
        self.customer_id = customer_id or cfg['customer']
        self.timeout = timeout
        self.enabled = enabled

    # ------------------------------------------------------------------- API
    def find(self, barcode: str, worker=None) -> dict:
        """worker — ExcelWorker текущей заявки (первое звено каскада)."""
        barcode = _s(barcode) or ''
        # 1) Заявка
        if worker is not None and barcode:
            row = worker.find_row(None, barcode)
            if row:
                return {
                    'lm': _s(worker.ws.cell(row, 1).value),
                    'name': _s(worker.ws.cell(row, 3).value),
                    'source': 'zayavka', 'row': row,
                }
        # 2) SQLite-кэш
        r = self.db.execute('SELECT lm, name FROM bc WHERE barcode=?', (barcode,)).fetchone()
        if r and r[0]:
            self._touch(barcode, r[0], r[1], 'cache')
            return {'lm': r[0], 'name': r[1], 'source': 'cache', 'row': None}
        # 3) APIM v3
        if self.enabled:
            try:
                res = self._api(barcode)
                if res and res.get('lm'):
                    self._touch(barcode, res['lm'], res.get('name'), 'api')
                    return {**res, 'source': 'api', 'row': None}
            except Exception:
                pass
        return {'lm': None, 'name': None, 'source': None, 'row': None}

    def stats(self) -> int:
        return self.db.execute('SELECT COUNT(*) FROM bc').fetchone()[0]

    # ----------------------------------------------------------------- inner
    def _touch(self, barcode: str, lm, name, source: str) -> None:
        self.db.execute(
            'INSERT OR REPLACE INTO bc VALUES (?,?,?,?,?)',
            (barcode, lm, name, source, time.strftime('%Y-%m-%d %H:%M:%S')))
        self.db.commit()

    def _api(self, barcode: str) -> Optional[dict]:
        body = {
            'FamilyForSRP': '', 'GTIN': barcode, 'familyIds': [],
            'searchMethod': 'keyPhrase', 'keyPhrase': barcode,
            'limit': 30, 'offset': 0, 'customerId': str(self.customer_id),
        }
        headers = {'Content-Type': 'application/json'}
        if self.api_key:
            headers['key'] = self.api_key
        with httpx.Client(timeout=self.timeout) as cli:
            r = cli.post(self.api_url, json=body, headers=headers)
            r.raise_for_status()
            data = r.json()
        try:
            p = data['products'][0]['_products'][0]
        except (KeyError, IndexError, TypeError):
            return None
        lm = p.get('id') or p.get('_id') or p.get('code') or p.get('articleId')
        return {
            'lm': str(lm) if lm is not None else None,
            'name': _s(p.get('name') or p.get('_name')),
        }
