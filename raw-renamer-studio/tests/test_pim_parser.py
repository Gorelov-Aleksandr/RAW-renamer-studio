"""Unit-тесты парсера PIM-CSV: кодировки, разделители, fuzzing (BUG-004 регрессия)."""
from __future__ import annotations

import random
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'src-python'))
import pim_builder  # noqa: E402

ROWS = [
    ['Id', 'Название', 'Отдел', 'Штрих-код', 'Модель', 'Гамма'],
    ['89458028', 'Кресло офисное эргономичное', '3', '4650101098817', '200304', 'А'],
    ['89458031', 'Лампа настольная LED (черная)', '3', '4650101098831', '200304', 'А'],
    ['89458102', 'Ручка дверная', '3', '4650101098909', '200304', 'Б'],
]


def build(delim: str, enc: str, bom: bool = False, eol: str = '\r\n') -> bytes:
    txt = eol.join(delim.join(r) for r in ROWS)
    if bom:
        prefix = {'utf-16-le': b'\xff\xfe', 'utf-16-be': b'\xfe\xff', 'utf-8-sig': b'\xef\xbb\xbf'}
        body = txt.encode(enc)
        return prefix[enc] + body
    return txt.encode(enc)


ENC_DELIM = [
    # (enc, bom, delim, expect_rows)
    ('utf-16-le', True, '\t', 3),
    ('utf-16-le', False, '\t', 3),
    ('utf-16-be', True, '\t', 3),
    ('utf-16-be', False, '\t', 3),
    ('utf-8-sig', True, '\t', 3),
    ('utf-8', False, '\t', 3),
    ('utf-8', False, ';', 3),
    ('utf-8-sig', True, ';', 3),
    ('utf-8', False, ',', 3),
    ('cp1251', False, '\t', 3),
    ('cp1251', False, ';', 3),
]


@pytest.mark.parametrize('enc,bom,delim,expect', ENC_DELIM)
def test_encoding_matrix(enc, bom, delim, expect, tmp_path):
    p = tmp_path / 't.csv'
    p.write_bytes(build(delim, enc, bom))
    rows = pim_builder.read_pim(p)
    assert len(rows) == expect, f'{enc}/{bom}/{delim}: {len(rows)} != {expect}'
    assert rows[0]['lm'] == '89458028'
    assert rows[0]['gtin'] == '4650101098817'
    assert rows[1]['name'] == 'Лампа настольная LED (черная)'


@pytest.mark.parametrize('enc,bom,delim', [
    ('utf-16-le', True, '\t'), ('utf-8', False, ';'), ('cp1251', False, '\t'),
])
def test_detect_encoding_direct(enc, bom, delim):
    raw = build(delim, enc, bom)
    got = pim_builder._detect_encoding(raw)
    want = 'utf-8-sig' if enc == 'utf-8-sig' else enc
    assert got == want, f'{enc}/{bom}: {got}'


def test_empty_file(tmp_path):
    p = tmp_path / 'e.csv'
    p.write_bytes(b'')
    with pytest.raises(ValueError, match='пуст'):
        pim_builder.read_pim(p)


def test_whitespace_only(tmp_path):
    p = tmp_path / 'w.csv'
    p.write_bytes(b'\r\n  \r\n')
    with pytest.raises(ValueError):
        pim_builder.read_pim(p)


def test_wrong_headers(tmp_path):
    p = tmp_path / 'h.csv'
    p.write_bytes('Foo\tBar\tBaz\r\n1\t2\t3\r\n'.encode('utf-8'))
    with pytest.raises(ValueError, match='Заголовки'):
        pim_builder.read_pim(p)


def test_no_valid_lm(tmp_path):
    p = tmp_path / 'n.csv'
    txt = '\t'.join(ROWS[0]) + '\r\n' + '\t'.join(['1', 'x', '3', '1', '2', 'А'])
    p.write_bytes(txt.encode('utf-8'))
    with pytest.raises(ValueError, match='товаров нет'):
        pim_builder.read_pim(p)


def test_quoted_values_with_delimiter(tmp_path):
    # Значение содержит разделитель внутри кавычек
    txt = ('Id\tНазвание\tОтдел\tШтрих-код\tМодель\tГамма\r\n'
           '89458028\tКресло, черное, 120 см\t3\t4650101098817\t200304\tА\r\n')
    p = tmp_path / 'q.csv'
    p.write_bytes(txt.encode('utf-16-le'))
    rows = pim_builder.read_pim(p)
    assert rows[0]['name'] == 'Кресло, черное, 120 см'


def test_delim_inside_quoted_semi(tmp_path):
    txt = ('Id;Название;Отдел;Штрих-код;Модель;Гамма\n'
           '89458028;"Кресло; черное";3;4650101098817;200304;А\n')
    p = tmp_path / 'q2.csv'
    p.write_bytes(txt.encode('utf-8'))
    rows = pim_builder.read_pim(p)
    assert rows[0]['name'] == 'Кресло; черное'


def test_field_map_variants(tmp_path):
    # Альтернативные заголовки
    txt = ('Код LM\tНаименование\tОтдел\tШтрихкод\tМодель\tГамма\r\n'
           '89458028\tКресло\t3\t4650101098817\t200304\tА\r\n')
    p = tmp_path / 'alt.csv'
    p.write_bytes(txt.encode('utf-8'))
    rows = pim_builder.read_pim(p)
    assert rows[0]['lm'] == '89458028'
    assert rows[0]['gtin'] == '4650101098817'


def test_extra_columns(tmp_path):
    txt = ('\t'.join(ROWS[0] + ['Лишняя1', 'Лишняя2']) + '\r\n' +
           '\t'.join(ROWS[1] + ['x', 'y']))
    p = tmp_path / 'x.csv'
    p.write_bytes(txt.encode('utf-16-le'))
    rows = pim_builder.read_pim(p)
    assert len(rows) == 1


def test_fuzz_random_bytes_never_crashes(tmp_path):
    """Fuzz: случайные байты — только ValueError (или rows), без иных исключений."""
    rnd = random.Random(20260918)
    cases = 400
    for i in range(cases):
        n = rnd.randrange(0, 4000)
        data = bytes(rnd.randrange(256) for _ in range(n))
        p = tmp_path / 'fuzz.csv'
        p.write_bytes(data)
        try:
            rows = pim_builder.read_pim(p)
            assert isinstance(rows, list)
        except ValueError:
            pass  # ожидаемо
        except Exception as e:  # noqa: PERF203
            raise AssertionError(f'fuzz#{i} ({n}B): неожиданный {type(e).__name__}: {e}')


def test_fuzz_mixed_encodings(tmp_path):
    """Fuzz: валидные головы + мусор — детект не должен падать."""
    rnd = random.Random(777)
    encs = ['utf-8', 'utf-16-le', 'utf-16-be', 'cp1251', 'latin-1']
    for i in range(150):
        enc = rnd.choice(encs)
        head = 'Id\tНазвание\tОтдел\tШтрих-код\r\n'
        try:
            data = head.encode(enc)
        except Exception:
            continue
        junk = bytes(rnd.randrange(256) for _ in range(rnd.randrange(0, 2000)))
        p = tmp_path / 'm.csv'
        p.write_bytes(data + junk)
        try:
            pim_builder.read_pim(p)
        except ValueError:
            pass
        except Exception as e:
            raise AssertionError(f'mixed#{i} ({enc}): {type(e).__name__}: {e}')
