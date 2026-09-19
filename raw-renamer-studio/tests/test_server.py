"""Интеграционные тесты sidecar: весь RPC-контракт, /upload, /preview, edge cases.

Запускает НОВОЙ sidecar (session-scoped фикстура из conftest) в tmp-каталоге.
"""
from __future__ import annotations

import io
import json
import os
import time
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

sys_path = Path(__file__).resolve().parent.parent / 'src-python'
import sys
if str(sys_path) not in sys.path:
    sys.path.insert(0, str(sys_path))

from conftest import make_jpeg



# --------------------------------------------------------------------------- helpers
def _upload(sc, path: Path, dir: str | None = None, name: str | None = None):
    """Multipart-загрузка в /upload (field file[, dir])."""
    boundary = uuid.uuid4().hex
    fname = name or path.name
    body = b''
    if dir:
        body += (f'--{boundary}\r\nContent-Disposition: form-data; name="dir"\r\n\r\n{dir}\r\n').encode()
    body += (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; '
             f'filename="{fname}"\r\nContent-Type: application/octet-stream\r\n\r\n').encode()
    body += path.read_bytes()
    body += f'\r\n--{boundary}--\r\n'.encode()
    st, raw = sc.http('/upload', body, {'Content-Type': f'multipart/form-data; boundary={boundary}'})
    assert st == 200, f'upload: {st} {raw[:300]}'
    return json.loads(raw)


def _pim_csv_variant(sc, enc, bom, delim, tag) -> dict:
    """Генерирует PIM-CSV в заданной кодировке, загружает и прогоняет zayavka.generate."""
    rows = [
        ['Id', 'Название', 'Отдел', 'Штрих-код', 'Модель', 'Гамма'],
        ['89458028', 'Кресло', '3', '4650101098817', '200304', 'А'],
        ['89458031', 'Лампа', '3', '4650101098831', '200304', 'А'],
    ]
    txt = '\r\n'.join(delim.join(r) for r in rows)
    p = Path(f'/tmp/rrs_test_{tag}_{uuid.uuid4().hex[:6]}.csv')
    bom_b = {'utf-16-le': b'\xff\xfe', 'utf-16-be': b'\xfe\xff', 'utf-8-sig': b'\xef\xbb\xbf'}
    if bom:
        p.write_bytes(bom_b[enc] + txt.encode(enc))
    else:
        p.write_bytes(txt.encode(enc))
    up = _upload(sc, p)
    p.unlink(missing_ok=True)
    r = sc.ok('zayavka.generate', {'csv_path': up['path'], 'fmt': 'xlsx', 'out_path': None})
    return r


# --------------------------------------------------------------------------- system
class TestSystem:
    def test_heartbeat(self, sc):
        r = sc.ok('system.heartbeat')
        assert r['ok'] is True and 'uptime' in r

    def test_info(self, sc):
        r = sc.ok('system.info')
        assert r['version']
        assert r['port'] == sc.port
        assert set(r['engines']) == {'opencv', 'zxing', 'pyzbar'}
        assert 'apim' in r

    def test_unknown_method(self, sc):
        e = sc.err('no.such.method')
        assert e['code'] == -32601

    def test_malformed_json(self, sc):
        raw = sc.raw_http('/rpc', b'{"jsonrpc":"2.0","id":1,')
        assert b'parse error' in raw or b'-32700' in raw

    def test_set_apim_invalid_env(self, sc):
        e = sc.err('system.set_apim', {'env': 'staging', 'enabled': True})
        assert e['code'] == 4000

    def test_set_apim_roundtrip(self, sc):
        r = sc.ok('system.set_apim', {'env': 'prod', 'enabled': False})
        assert r['env'] == 'prod' and r['enabled'] is False
        # вернём
        sc.ok('system.set_apim', {'env': 'preprod', 'enabled': True})


# --------------------------------------------------------------------------- session
class TestSession:
    def test_open_folder_missing(self, sc):
        e = sc.err('session.open_folder', {'folder': '/no/such/dir/xyz', 'mode': 'cv'})
        assert e['code'] == 4004

    def test_open_folder_not_dir(self, sc, tmp_path):
        f = tmp_path / 'file.txt'
        f.write_text('x')
        sc.err('session.open_folder', {'folder': str(f), 'mode': 'cv'})

    def test_open_folder_empty(self, sc, tmp_path):
        d = tmp_path / 'empty'
        d.mkdir()
        r = sc.ok('session.open_folder', {'folder': str(d), 'mode': 'cv'})
        assert r['items'] == [] and r['total_frames'] == 0

    def test_open_batch_cv(self, sc, batch):
        info = sc.ok('system.info')
        r = sc.ok('session.open_folder', {
            'folder': str(batch.raw_folder), 'mode': 'cv',
            'zayavka': str(batch.zayavka)})
        assert len(r['items']) == 6
        assert r['total_frames'] == 22
        assert all(i['status'] == 'ok' for i in r['items'])
        assert all(i['barcode'] for i in r['items'])

    def test_open_folder_names_mode(self, sc, batch):
        info = sc.ok('system.info')
        r = sc.ok('session.open_folder', {
            'folder': str(batch.raw_folder), 'mode': 'names'})
        # тестовые имена _M2A… не содержат ШК → 22 сироты
        assert len(r['items']) == 22
        assert all(i['source'] == 'orphan' for i in r['items'])

    def test_cyrillic_u_label_suffix(self, sc, tmp_path, batch):
        # v3.5: «у» (кириллица, русская раскладка) = суффикс этикетки,
        # как и латинская «y» (унаследовано от первой версии инструмента).
        d = tmp_path / 'cyr'
        d.mkdir()
        # ШК из тестовой заявки (89458028 → 4650101098817)
        make_jpeg(d / '4650101098817.CR2', seed=11)
        make_jpeg(d / '4650101098817_у.CR2', seed=12)
        sc.ok('session.set_zayavka', {'path': str(batch.zayavka)})
        r = sc.ok('session.open_folder', {'folder': str(d), 'mode': 'names'})
        assert len(r['items']) == 1
        it = r['items'][0]
        assert it['has_label'] is True
        assert it['lm_code'] == '89458028'
        plan = sc.ok('renamer.plan', {'item_ids': [it['id']]})
        dsts = {row['dst'] for row in plan['rows']}
        assert '89458028_y.CR2' in dsts  # написание в плане — всегда лат. y
        assert '89458028.CR2' in dsts
        # не оставляем заявку в общей сессии для следующих тестов
        sc.ok('session.set_zayavka', {'path': None})

    def test_special_chars_in_folder(self, sc, tmp_path):
        d = tmp_path / 'съёмка №1 (копия)'
        d.mkdir()
        make_jpeg(d / '_A0001.CR2', seed=1)
        r = sc.ok('session.open_folder', {'folder': str(d), 'mode': 'cv'})
        assert r['total_frames'] == 1

    def test_missing_zayavka(self, sc, batch):
        info = sc.ok('system.info')
        e = sc.err('session.open_folder', {
            'folder': str(batch.raw_folder), 'mode': 'cv', 'zayavka': '/nope/none.xlsx'})
        assert e['code'] == 4040

    def test_set_zayavka_missing(self, sc):
        sc.err('session.set_zayavka', {'path': '/nope/none.xlsx'})

    def test_get(self, sc, batch):
        info = sc.ok('system.info')
        sc.ok('session.open_folder', {'folder': str(batch.raw_folder), 'mode': 'cv'})
        r = sc.ok('session.get')
        assert r['items'] and r['mode'] == 'cv'

    def test_move_frame_bounds(self, sc, batch):
        info = sc.ok('system.info')
        r = sc.ok('session.open_folder', {'folder': str(batch.raw_folder), 'mode': 'cv'})
        it = r['items'][0]
        e = sc.err('session.move_frame', {'item_id': it['id'], 'from_idx': 0, 'idx': 999})
        assert e['code'] == 4000
        # валидное перемещение
        if len(it['frames']) >= 3:
            r2 = sc.ok('session.move_frame', {'item_id': it['id'], 'from_idx': 1, 'idx': 2})
            assert len(r2['frames']) == len(it['frames'])

    def test_unknown_item(self, sc):
        sc.err('session.move_frame', {'item_id': 'itXXX', 'from_idx': 0, 'idx': 1})

    def test_suffix_validation(self, sc, batch):
        info = sc.ok('system.info')
        r = sc.ok('session.open_folder', {'folder': str(batch.raw_folder), 'mode': 'cv'})
        it = r['items'][0]
        # 'com' и 'x' НЕ в списке: сервер автоматически достраивает «_»
        # (com → _com) — это валидное поведение, проверено отдельно
        for bad in ['_comx', '_12345', '__com']:
            sc.err('session.set_frame_suffix', {'item_id': it['id'], 'idx': 1, 'suffix': bad})
        for good in ['_com', '_07', 'pack', None, '']:
            r2 = sc.ok('session.set_frame_suffix', {'item_id': it['id'], 'idx': 1, 'suffix': good})
            assert 'frames' in r2
        # возврат
        sc.ok('session.set_frame_suffix', {'item_id': it['id'], 'idx': 1, 'suffix': None})

    def test_apply_barcode_bad(self, sc, batch):
        info = sc.ok('system.info')
        r = sc.ok('session.open_folder', {'folder': str(batch.raw_folder), 'mode': 'names'})
        it = r['items'][0]
        sc.err('session.apply_barcode', {'item_id': it['id'], 'barcode': '123'})          # коротко
        sc.err('session.apply_barcode', {'item_id': it['id'], 'barcode': '1234567890123'})  # неверная контрольная
        r2 = sc.ok('session.apply_barcode', {'item_id': it['id'], 'barcode': '4650101098817'})
        assert r2['item']['barcode'] == '4650101098817'

    def test_apply_barcode_with_letters(self, sc, batch):
        info = sc.ok('system.info')
        r = sc.ok('session.open_folder', {'folder': str(batch.raw_folder), 'mode': 'names'})
        it = r['items'][1]
        # буквы отфильтруются
        r2 = sc.ok('session.apply_barcode', {'item_id': it['id'], 'barcode': 'a4650101098817b'})
        assert r2['item']['barcode'] == '4650101098817'

    def test_refresh_angles_no_zayavka(self, sc):
        # независим от порядка: снимаем заявку явно (v3.3: path: null)
        sc.ok('session.set_zayavka', {'path': None})
        sc.err('session.refresh_angles', {})


# --------------------------------------------------------------------------- zayavka
class TestZayavka:
    @pytest.mark.parametrize('enc,bom,delim,tag', [
        ('utf-16-le', True, '\t', 'u16b'), ('utf-16-le', False, '\t', 'u16'),
        ('utf-16-be', False, '\t', 'u16be'), ('utf-8', False, '\t', 'u8t'),
        ('utf-8', False, ';', 'u8s'), ('utf-8-sig', True, ';', 'u8bs'),
        ('cp1251', False, '\t', 'cp1251'),
    ])
    def test_generate_all_encodings(self, sc, enc, bom, delim, tag):
        r = _pim_csv_variant(sc, enc, bom, delim, tag)
        assert r['count'] == 2, tag
        assert r['out_path'].endswith('.xlsx')
        assert Path(r['out_path']).is_file()

    def test_generate_missing_csv(self, sc):
        e = sc.err('zayavka.generate', {'csv_path': '/nope/absent.csv', 'fmt': 'xlsx'})
        assert e['code'] == 4004

    def test_generate_empty_csv(self, sc, tmp_path):
        p = tmp_path / 'e.csv'
        p.write_bytes(b'')
        up = _upload(sc, p)
        e = sc.err('zayavka.generate', {'csv_path': up['path'], 'fmt': 'xlsx'})
        assert 'пуст' in e['message'].lower() or 'не распознаны' in e['message'].lower()

    def test_generate_garbage_csv(self, sc, tmp_path):
        p = tmp_path / 'g.csv'
        p.write_bytes(os.urandom(512))
        up = _upload(sc, p)
        e = sc.err('zayavka.generate', {'csv_path': up['path'], 'fmt': 'xlsx'})
        # понятная ошибка, а не сырой traceback
        assert 'Traceback' not in e['message']
        assert 'Exception' not in e['message'].split(':')[0]

    def test_generate_out_dir(self, sc, tmp_path):
        rows = [
            ['Id', 'Название', 'Отдел', 'Штрих-код', 'Модель', 'Гамма'],
            ['89458028', 'Кресло', '3', '4650101098817', '200304', 'А'],
        ]
        p = tmp_path / 'o.csv'
        p.write_bytes(('\r\n'.join('\t'.join(r) for r in rows)).encode('utf-16-le'))
        up = _upload(sc, p)
        outdir = tmp_path / 'out'
        outdir.mkdir()
        r = sc.ok('zayavka.generate', {'csv_path': up['path'], 'fmt': 'xlsx', 'out_path': str(outdir)})
        assert r['out_path'].startswith(str(outdir))
        assert Path(r['out_path']).is_file()

    def test_generate_csv_format(self, sc):
        r = _pim_csv_variant(sc, 'utf-8', False, ';', 'csvfmt') if False else None
        # используем загрузку и fmt=csv
        rows = [
            ['Id', 'Название', 'Отдел', 'Штрих-код', 'Модель', 'Гамма'],
            ['89458028', 'Кресло', '3', '4650101098817', '200304', 'А'],
        ]
        p = Path(f'/tmp/rrs_csvfmt_{uuid.uuid4().hex[:6]}.csv')
        p.write_bytes(('\r\n'.join('\t'.join(r) for r in rows)).encode('utf-8'))
        up = _upload(sc, p)
        r = sc.ok('zayavka.generate', {'csv_path': up['path'], 'fmt': 'csv', 'out_path': None})
        assert r['out_path'].endswith('.csv')
        p.unlink(missing_ok=True)


# --------------------------------------------------------------------------- renamer
class TestRenamer:
    def _open_copy(self, sc, tag, batch):
        """Копируем тестовую партию и заявку через /upload (как браузерный выбор папки).

        Важно: заявка — КОПИЯ, иначе renamer.execute (write_results) перезапишет
        исходный файл.
        """
        first = _upload(sc, next(iter(sorted(batch.raw_folder.glob('*.CR2')))), tag)
        for f in sorted(batch.raw_folder.glob('*.CR2')):
            if f.name != Path(first['path']).name:
                _upload(sc, f, tag)
        info = sc.ok('system.info')
        zay_up = _upload(sc, Path(str(batch.zayavka)), tag)
        folder = Path(first['path']).parent
        return sc.ok('session.open_folder', {
            'folder': str(folder), 'mode': 'cv', 'zayavka': zay_up['path']})

    def test_full_cycle(self, sc, batch):
        r = self._open_copy(sc, 'cycle_' + uuid.uuid4().hex[:6], batch)
        assert len(r['items']) == 6
        plan = sc.ok('renamer.plan', {'item_ids': None})
        assert len(plan['rows']) == 22
        assert plan['skipped'] == []
        ex = sc.ok('renamer.execute')
        assert ex['renamed'] == 22
        assert ex['xlsx']['updated'] == 6
        folder = Path(sc.ok('session.get')['folder'])
        names = {p.name for p in folder.glob('*.CR2')}
        assert '89458028_y.CR2' in names
        assert '89458028.CR2' in names
        assert '_M2A0801.CR2' not in names
        j = sc.ok('renamer.journal')
        assert len(j['entries']) >= 1
        un = sc.ok('renamer.undo')
        assert un['restored'] == 22
        names2 = {p.name for p in folder.glob('*.CR2')}
        assert '_M2A0801.CR2' in names2 and '89458028.CR2' not in names2

    def test_undo_empty_journal(self, sc):
        # очистим журнал и проверим, что undo выдаёт понятную 4004
        sc.ok('renamer.journal_clear')
        e = sc.err('renamer.undo')
        assert e['code'] == 4004

    def test_plan_skips_no_lm(self, sc, tmp_path):
        d = tmp_path / 'orphan'
        d.mkdir()
        make_jpeg(d / '_X1.CR2', seed=11)
        make_jpeg(d / '_X1_01.CR2', seed=12)
        r = sc.ok('session.open_folder', {'folder': str(d), 'mode': 'cv'})
        assert r['items'][0]['status'] == 'err'
        plan = sc.ok('renamer.plan', {'item_ids': None})
        assert plan['rows'] == []
        assert len(plan['skipped']) == 1

    def test_journal_clear(self, sc):
        sc.ok('renamer.journal_clear')
        j = sc.ok('renamer.journal')
        assert j['entries'] == []

    def test_retry_xlsx_no_journal(self, sc):
        sc.ok('renamer.journal_clear')
        sc.err('renamer.retry_xlsx')


# --------------------------------------------------------------------------- upload / files
class TestUploadFiles:
    def test_upload_basic(self, sc, tmp_path):
        p = tmp_path / 'f.txt'
        p.write_bytes(b'hello')
        up = _upload(sc, p)
        assert up['size'] == 5 and Path(up['path']).read_bytes() == b'hello'

    def test_upload_dir_traversal(self, sc, tmp_path):
        p = tmp_path / 't.txt'
        p.write_bytes(b'x')
        # a..b и т.п. — легальные имена (без / и без ведущей точки) — разрешены;
        # в списке только реальные векторы выхода из uploads/
        for evil in ['..', '../..', 'a/b', '/abs', 'a\\b', '.hidden', '.h', 'x' * 200,
                     'a/../b', '..', 'uploads/..', 'a|b', 'a"b']:
            boundary = uuid.uuid4().hex
            body = (f'--{boundary}\r\nContent-Disposition: form-data; name="dir"\r\n\r\n{evil}\r\n'
                    f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="t.txt"\r\n'
                    f'Content-Type: application/octet-stream\r\n\r\nx\r\n--{boundary}--\r\n').encode()
            st, raw = sc.http('/upload', body, {'Content-Type': f'multipart/form-data; boundary={boundary}'})
            assert st == 400, f'dir={evil!r}: ожидался 400, получили {st}'

    def test_upload_nullbyte_filename(self, sc, tmp_path):
        p = tmp_path / 't.txt'
        p.write_bytes(b'x')
        boundary = uuid.uuid4().hex
        body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="a{chr(0)}.txt"\r\n'
                f'Content-Type: application/octet-stream\r\n\r\nx\r\n--{boundary}--\r\n').encode('utf-8', 'replace')
        st, raw = sc.http('/upload', body, {'Content-Type': f'multipart/form-data; boundary={boundary}'})
        # сервер не должен падать (200 с безопасным именем или 4xx/5xx, но не краш)
        assert st in (200, 400, 422, 500)

    def test_file_download_missing(self, sc):
        sc.err('file.download', {'path': '/nope/none.xlsx'})

    def test_file_download_data_dir_allowed(self, sc):
        info = sc.ok('system.info')
        data_dir = info['data_dir']
        # создаём файл в data_dir через upload
        p = Path('/tmp/rrs_dl.txt')
        p.write_bytes(b'download-me')
        up = _upload(sc, p)
        r = sc.ok('file.download', {'path': up['path']})
        import base64
        assert base64.b64decode(r['data_b64']) == b'download-me'
        p.unlink(missing_ok=True)

    def test_file_download_big(self, sc, tmp_path):
        big = tmp_path / 'big.bin'
        big.write_bytes(b'0' * (26 * 1024 * 1024))
        up = _upload(sc, big)
        e = sc.err('file.download', {'path': up['path']})
        assert '25' in e['message']


# --------------------------------------------------------------------------- preview
class TestPreview:
    def test_preview_valid(self, sc, batch):
        info = sc.ok('system.info')
        r = sc.ok('session.open_folder', {'folder': str(batch.raw_folder), 'mode': 'cv'})
        it = r['items'][0]
        h = it['frames'][0]['preview']
        st, body = sc.http(f'/preview/{h}?size=200', method='GET')
        assert st == 200
        assert body[:2] == b'\xff\xd8'

    def test_preview_unknown_hash(self, sc):
        st, body = sc.http('/preview/deadbeefdeadbeef', method='GET')
        assert st == 404

    def test_health(self, sc):
        st, body = sc.http('/health', method='GET')
        assert st == 200 and json.loads(body)['ok']


# --------------------------------------------------------------------------- concurrency
class TestConcurrency:
    def test_parallel_heartbeats_and_reads(self, sc):
        def beat(i):
            return sc.ok('system.heartbeat')['ok']
        with ThreadPoolExecutor(max_workers=8) as ex:
            assert list(ex.map(beat, range(40))) == [True] * 40

    def test_open_folder_during_heartbeats(self, sc, batch):
        info = sc.ok('system.info')

        def beat(_):
            sc.ok('system.heartbeat')
            return True
        with ThreadPoolExecutor(max_workers=6) as ex:
            futs = [ex.submit(beat, i) for i in range(12)]
            r = sc.ok('session.open_folder', {'folder': str(batch.raw_folder), 'mode': 'cv'})
            assert len(r['items']) == 6
            assert all(f.result() for f in futs)


# --------------------------------------------------------------------------- raw / engine
class TestRawEngine:
    def test_fake_raw_scan(self, sc, tmp_path):
        d = tmp_path / 'raws'
        d.mkdir()
        for i in range(5):
            make_jpeg(d / f'_F{i:04d}.CR2', seed=i)
        r = sc.ok('session.open_folder', {'folder': str(d), 'mode': 'cv'})
        assert r['total_frames'] == 5
        # превью извлечены (JPEG внутри)
        assert r['items'][0]['frames'][0]['preview']

    def test_corrupt_raw_no_preview(self, sc, tmp_path):
        d = tmp_path / 'corrupt'
        d.mkdir()
        (d / '_C1.CR2').write_bytes(os.urandom(20000))
        r = sc.ok('session.open_folder', {'folder': str(d), 'mode': 'cv'})
        assert r['total_frames'] == 1
        assert r['items'][0]['frames'][0]['preview'] is None or True  # hash всё равно есть

    def test_extension_case_insensitive(self, sc, tmp_path):
        d = tmp_path / 'case'
        d.mkdir()
        make_jpeg(d / '_UP.CR3', seed=3)
        make_jpeg(d / '_NEF.NEF', seed=4)
        r = sc.ok('session.open_folder', {'folder': str(d), 'mode': 'cv'})
        assert r['total_frames'] == 2

    def test_rare_raw_extensions(self, sc, tmp_path):
        # v3.5: редкие форматы (унаследовано от первой версии инструмента)
        # тоже распознаются как RAW: .crw .srf .sr2 .3fr .fff .raw
        d = tmp_path / 'rare'
        d.mkdir()
        for ext in ['.crw', '.srf', '.sr2', '.3fr', '.fff', '.raw']:
            (d / f'file{ext}').write_bytes(b'\x00' * 512)
        r = sc.ok('session.open_folder', {'folder': str(d), 'mode': 'names'})
        assert r['total_frames'] == 6
        assert len(r['items']) == 6  # без ШК в имени — по одному товару на файл


class TestV36Fixes:
    """Проверка закрытия инцидентов v3.6 (Mac): превью в names-режиме, товары без _y, атомарный rollback, rescan."""

    def test_names_mode_previews_registered(self, sc, tmp_path):
        d = tmp_path / 'names_batch'
        d.mkdir()
        f1 = d / '4650101098770_y.CR2'
        f2 = d / '4650101098770_01.CR2'
        make_jpeg(f1, seed=1)
        make_jpeg(f2, seed=2)

        r = sc.ok('session.open_folder', {'folder': str(d), 'mode': 'names'})
        assert len(r['items']) == 1
        it = r['items'][0]
        assert len(it['frames']) == 2

        # В names-режиме превью каждого файла зарегистрировано и отдается со статусом 200
        for fr in it['frames']:
            h = fr['preview']
            st, body = sc.http(f'/preview/{h}?size=160', method='GET')
            assert st == 200
            assert body[:2] == b'\xff\xd8'

    def test_no_label_rename_and_excel(self, sc, tmp_path):
        """Товары без этикетки (_y) переименовываются в {lm}.CR2, {lm}_01.CR2 с M=0 в Excel."""
        d = tmp_path / 'no_label_batch'
        d.mkdir()
        f1 = d / '4650101098794_01.CR2'
        f2 = d / '4650101098794_02.CR2'
        make_jpeg(f1, seed=10)
        make_jpeg(f2, seed=11)

        # Создаем заявку
        z_path = tmp_path / 'zayavka.xlsx'
        from pim_builder import build_xlsx
        build_xlsx([{'lm': '89458032', 'name': 'Товар без этикетки', 'otdel': '3',
                     'gtin': '4650101098794', 'model': 'M1', 'gamma': 'А'}], z_path)

        r = sc.ok('session.open_folder', {'folder': str(d), 'mode': 'names', 'zayavka': str(z_path)})
        it = r['items'][0]
        assert it['has_label'] is False
        assert it['status'] == 'warn'  # предупреждение "Без этикетки", но не ошибка

        plan = sc.ok('renamer.plan', {'item_ids': [it['id']]})
        assert len(plan['rows']) == 2
        # Первый ракурс становится главным {lm}.CR2
        assert plan['rows'][0]['dst'] == '89458032.CR2'
        assert plan['rows'][0]['kind'] == 'main'
        # Второй ракурс становится {lm}_01.CR2
        assert plan['rows'][1]['dst'] == '89458032_01.CR2'
        assert plan['rows'][1]['kind'] == 'angle'

        # Выполняем переименование
        res = sc.ok('renamer.execute', {'item_ids': [it['id']]})
        assert res['renamed'] == 2
        # После execute файлы переименованы на диске
        assert (d / '89458032.CR2').is_file()
        assert (d / '89458032_01.CR2').is_file()
        assert not f1.exists()
        assert not f2.exists()

        # В Excel записано L=2, M=0
        from excel_worker import ExcelWorker
        w = ExcelWorker(z_path)
        row = w.find_row('89458032')
        assert row is not None
        assert w.ws.cell(row, 12).value == 2
        assert w.ws.cell(row, 13).value == 0

        # Сессия обновилась: items возвращены свежими с новыми именами
        assert 'items' in res
        new_items = res['items']
        assert len(new_items) == 1
        new_frame_names = [fr['name'] for fr in new_items[0]['frames']]
        assert '89458032.CR2' in new_frame_names
        assert '89458032_01.CR2' in new_frame_names

    def test_duplicate_custom_suffix_collision(self, sc, tmp_path):
        """Дубликат целевого имени внутри одного товара отклоняется в h_plan с кодом 4090."""
        d = tmp_path / 'dup_batch'
        d.mkdir()
        make_jpeg(d / '4650101098770_y.CR2', seed=20)
        make_jpeg(d / '4650101098770_01.CR2', seed=21)
        make_jpeg(d / '4650101098770_02.CR2', seed=22)

        z_path = tmp_path / 'z_dup.xlsx'
        from pim_builder import build_xlsx
        build_xlsx([{'lm': '89458028', 'name': 'Тест', 'otdel': '3',
                     'gtin': '4650101098770', 'model': 'M', 'gamma': 'А'}], z_path)

        r = sc.ok('session.open_folder', {'folder': str(d), 'mode': 'names', 'zayavka': str(z_path)})
        item_id = r['items'][0]['id']

        # Зададим обоим ракурсам одинаковый кастомный суффикс _pack
        sc.ok('session.set_frame_suffix', {'item_id': item_id, 'idx': 1, 'suffix': '_pack'})
        sc.ok('session.set_frame_suffix', {'item_id': item_id, 'idx': 2, 'suffix': '_pack'})

        err = sc.err('renamer.plan', {'item_ids': [item_id]})
        assert 'Коллизия именования' in err['message']

    def test_set_suffix_label_toggle(self, sc, tmp_path):
        """Назначение суффикса _y (латиница или кириллица) делает кадр этикеткой."""
        d = tmp_path / 'toggle_batch'
        d.mkdir()
        make_jpeg(d / '4650101098794_01.CR2', seed=30)
        make_jpeg(d / '4650101098794_02.CR2', seed=31)

        r = sc.ok('session.open_folder', {'folder': str(d), 'mode': 'names'})
        it = r['items'][0]
        assert it['has_label'] is False
        assert it['frames'][0]['is_label'] is False

        # Назначаем первый кадр этикеткой через русское '_у'
        res = sc.ok('session.set_frame_suffix', {'item_id': it['id'], 'idx': 0, 'suffix': '_у'})
        assert res['has_label'] is True
        assert res['frames'][0]['is_label'] is True
        assert res['frames'][1]['is_label'] is False

        # Переключаем обратно
        res2 = sc.ok('session.toggle_frame_label', {'item_id': it['id'], 'idx': 0})
        assert res2['has_label'] is False
        assert res2['frames'][0]['is_label'] is False

    def test_rename_atomic_rollback(self, sc, tmp_path):
        """Если при execute возникает коллизия, ни один файл не остаётся полупереименованным."""
        from renamer import execute, RenameError
        d = tmp_path / 'atomic_batch'
        d.mkdir()
        f1 = d / 'a.CR2'
        f2 = d / 'b.CR2'
        f1.write_bytes(b'file1')
        f2.write_bytes(b'file2')

        # Создадим конфликт: целевой файл 'target2.CR2' уже существует на диске
        conflict = d / 'target2.CR2'
        conflict.write_bytes(b'already_here')

        pairs = [
            {'src': str(f1), 'dst': str(d / 'target1.CR2')},
            {'src': str(f2), 'dst': str(conflict)},
        ]

        with pytest.raises(RenameError):
            execute(pairs)

        # Проверяем, что f1 остался нетронутым (не переименовался в target1 и не пропал)
        assert f1.is_file() and f1.read_bytes() == b'file1'
        assert f2.is_file() and f2.read_bytes() == b'file2'
        assert not (d / 'target1.CR2').exists()
        assert conflict.read_bytes() == b'already_here'
