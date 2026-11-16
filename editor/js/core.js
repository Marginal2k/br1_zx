/* Чёрный Ворон: модель уровня для редактора (без DOM; работает в браузере и в node).
 *
 * Источник истины формата - tools/levels.py, tools/maps.py, tools/levasm.py, tools/text.py (docs/FORMATS.md, п. 4).
 * Блок уровня (LEVDAT=#79C0, 12608 байт):
 *   [0..1104)     параметры + код задания (script), TASK_M - 63 байта со смещения 37
 *   [1104..1600)  герои: записи {сторона, тип, x, y, extra}, конец - #FF
 *   [1600..5696)  карта 64x64
 *   [5696..12608) экран .scr
 *
 * Модель уровня (Level) - обычный объект, независимый от способа хранения:
 *   { name, kind: 'data'|'raw', script: Uint8Array(1104), task: {lines:[s,s,s], tail:Uint8Array},
 *     heroes: [{side,type,x,y,extra}], map: Uint8Array(4096), screen: Uint8Array(6912),
 *     asmText: исходный script.asm (или null), asmOrig: script.orig.asm (или null), raw: Uint8Array (только kind 'raw') }
 * Параметры (MONEY, fsLAND, ...) живут в script по смещениям HEADER - так любые неизвестные байты сохраняются как есть.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BRCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const BLOCK = 12608, OFF_HER = 1104, OFF_MAP = 1600, OFF_SCR = 5696;
  const OFF_TASK = 37, TASK_LEN = 63, SCRIPT_LEN = 1104;
  const LEVDAT = 0x79C0, OFF_CODE = 0xAB, OFF_BULL = 0xE0, OFF_MIN = 0x440;
  const MAP_N = 64, HER_BYTES = 496, HER_MAX = 98, END_CODE = 127, TASK_W = 20;
  const SHIFT = [1, 65, 64, 63, -1, -65, -64, -63];
  const GO_MAX = 52;   // wlib1a.asm setMAP: клетка проходима, если 1 <= тайл < go_Max

  // порядок и имена - как levasm.HEADER
  const HEADER = [[0, 'isRUNL', 0], [1, 'hTOWER', 0], [2, 'hARC', 0], [3, 'hHORSE', 0], [4, 'hSHILD', 0], [5, 'hBLADE', 0], [6, 'hmaxC', 0], [7, 'hmaxW', 0],
    [8, 'hmaxB1', 0], [9, 'hmaxB2', 0], [10, 'hWALL', 0], [11, 'kTOWER', 0], [12, 'kARC', 0], [13, 'kHORSE', 0], [14, 'kSHILD', 0],
    [15, 'kBLADE', 0], [16, 'kmaxC', 0], [17, 'kmaxW', 0], [18, 'levMAX', 0], [19, 'levDEL', 0], [20, 'lev1ST', 0], [21, 'levTYP', 0],
    [22, 'COLOR', 0], [23, 'MASTER', 0], [24, 'LEVEL', 0], [25, 'MONEY', 0], [31, 'WOOD', 0], [37, 'TASK_M', 0], [100, 'LEVRES', 0],
    [107, 'fsLAND', 0], [108, 'fsMUS', 0], [109, 'SEL_T', 0], [110, 'SEL_N', 0], [116, 'sel_en', 0], [117, 'sel_ti', 0], [118, 'LED', 0],
    [124, '_msg', 0], [125, 'pTX_AD', 1], [127, 'TX_AD', 1], [129, 'pTXdel', 0], [130, 'isPLAT', 0], [131, 'szPLAT', 0], [132, 'bcPLAT', 1],
    [134, 'adPLAT', 1], [136, 'waPLAT', 0], [137, 'onPAUS', 0], [138, 'NOTA', 1], [140, 'se', 1], [142, 'levSND', 0], [143, 'sIY56', 1],
    [145, 'priv_S', 0], [146, 'NOTA2', 1], [148, 'priv_2', 0], [149, 'pntX', 0], [150, 'pntY', 0], [151, 'pntNUM', 0], [152, 'pntDEL', 0],
    [153, 'pntTAR', 0], [154, 'pntUNI', 0], [155, 'pntEN', 0], [161, 'pntMAN', 0], [162, 'END_1', 0], [163, 'END_2', 0], [164, 'TheEND', 0],
    [165, 'dummy', 0]];
  const COMMENT = {
    isRUNL: '#C9 - обычный уровень', hTOWER: 'макс. число типов вооружения (1-4)', hmaxC: 'число исследуемых заклинаний священника',
    hmaxW: 'то же волшебника', hmaxB1: 'макс. число стандартных зданий', hmaxB2: 'макс. число доп. зданий', hWALL: '0/17 - можно/нельзя строить стены',
    kTOWER: 'параметры компьютера', levMAX: 'макс. народу в группе врага', levDEL: 'средняя задержка между сборами врага',
    lev1ST: 'начальная задержка первого сбора', levTYP: 'тип уровня (0 - обычный)', COLOR: 'цвет поля', MASTER: 'кто играет: 0 люди, 1 кунги',
    LEVEL: 'номер уровня', MONEY: 'деньги (6 цифр)', WOOD: 'лес (6 цифр)', TASK_M: 'задание: 3 строки (см. task.txt)',
    LEVRES: 'текущее время прохождения', fsLAND: 'ландшафт 1-4', fsMUS: 'мелодия 0-7', END_1: '0/1/2 - нет/нет врагов/нет людей',
    TheEND: '0/1/2 - нет/победа людей/победа врагов (ставит _cLOOP)', dummy: 'резерв'
  };
  const HOFF = {};
  HEADER.forEach(([o, n]) => { HOFF[n] = o; });
  const PROBE_CLEAN = [0x18, 0x01, 0xC9, 0x3A, 0x62, 0x7A, 0x32, 0x64, 0x7A, 0xC9];
  const PROBE_SIG = [0x11, 0x6d, 0x7a, 0xbe];

  // ------------------------------------------------------------------ мелочи
  function b64dec(s) {
    if (typeof atob === 'function') { const t = atob(s), u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i); return u; }
    return new Uint8Array(Buffer.from(s, 'base64'));
  }
  function b64enc(u) {
    if (typeof btoa === 'function') { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
    return Buffer.from(u).toString('base64');
  }
  const eq = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
  const hex2 = v => '#' + v.toString(16).toUpperCase().padStart(2, '0');
  const hex4 = v => '#' + v.toString(16).toUpperCase().padStart(4, '0');
  const utf8 = s => new TextEncoder().encode(s);
  const unutf8 = u => { let s = new TextDecoder('utf-8').decode(u); if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1); return s.replace(/\r\n?/g, '\n'); };

  class FormatError extends Error {}
  // сообщения для человека: ключ - русский текст с {подстановками}; интерфейс может подменить переводчик (js/i18n.js)
  const fmt = (s, v) => v ? s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : s;
  let tr = fmt;
  function setTranslator(f) { tr = f || fmt; }

  // ------------------------------------------------------------------ глифы (text.py: CODE_MAIN, ENC_MAIN - побеждает последний)
  let CODE = null, ENC = null;
  function initGlyphs(codeMain) {
    CODE = codeMain.slice();
    ENC = {};
    CODE.forEach((c, i) => { ENC[c] = i; });
  }
  function glyphChar(i) { return (i < CODE.length && ENC[CODE[i]] === i) ? CODE[i] : '{' + i + '}'; }
  /** строка -> {glyphs:[...], bad:[{pos,ch}]} */
  function encodeLine(s) {
    const out = [], bad = [];
    let pos = 0;
    while (pos < s.length) {
      const m = /^\{(\d+)\}/.exec(s.slice(pos));
      if (m) { out.push(+m[1]); pos += m[0].length; continue; }
      const c = s[pos];
      if (Object.prototype.hasOwnProperty.call(ENC, c)) out.push(ENC[c]); else bad.push({ pos, ch: c });
      pos++;
    }
    return { glyphs: out, bad };
  }

  // ------------------------------------------------------------------ задание (levels.task_decode/encode)
  function taskDecode(region) {
    const ends = [];
    region.forEach((b, i) => { if (b === END_CODE) ends.push(i); });
    if (ends.length < 3) throw new FormatError(tr('в задании меньше трёх строк'));
    const lines = [];
    let pos = 0;
    for (const e of ends.slice(0, 3)) {
      let s = '';
      for (let i = pos; i < e; i++) s += glyphChar(region[i]);
      lines.push(s);
      pos = e + 1;
    }
    return { lines, tail: region.slice(pos) };
  }
  function taskCheck(task) {
    const res = task.lines.map(l => encodeLine(l));
    const bytes = res.reduce((n, r) => n + r.glyphs.length + 1, 0);
    return { lines: res, bytes };
  }
  function taskEncode(task) {
    const chk = taskCheck(task);
    chk.lines.forEach((r, i) => {
      if (r.bad.length) throw new FormatError(tr('задание, строка {n}: символа «{ch}» нет в шрифте игры', { n: i + 1, ch: r.bad[0].ch }));
    });
    if (chk.bytes > TASK_LEN) throw new FormatError(tr('текст задания длиннее 63 байт (с признаками конца строк)'));
    const out = new Uint8Array(TASK_LEN);
    let p = 0;
    for (const r of chk.lines) { for (const g of r.glyphs) out[p++] = g; out[p++] = END_CODE; }
    const tail = new Uint8Array(TASK_LEN); tail.set(task.tail.slice(0, TASK_LEN));
    out.set(tail.slice(0, TASK_LEN - p), p);
    return out;
  }
  function taskToTxt(task) {
    const tail = Array.from(task.tail);
    return task.lines.map(l => '|' + l + '|').join('\n') + '\n; хвост (остаток старого текста за третьей строкой, игра не читает): ' +
      (tail.length ? tail.join(' ') : '-') + '\n';
  }
  function taskFromTxt(text) {
    const rows = [];
    let tail = new Uint8Array(0);
    for (const ln of text.replace(/\r/g, '').split('\n')) {
      if (ln.startsWith(';')) {
        const m = /:\s*([\d\s-]+)$/.exec(ln);
        if (m && ln.includes('хвост')) tail = Uint8Array.from(m[1].split(/\s+/).filter(x => x && x !== '-').map(Number));
        continue;
      }
      if (ln.trim()) rows.push(ln);
    }
    if (rows.length !== 3 || !rows.every(r => r.startsWith('|') && r.endsWith('|') && r.length >= 2)) throw new FormatError(tr('task.txt: нужно три строки |...|'));
    return { lines: rows.map(r => r.slice(1, -1)), tail };
  }

  // ------------------------------------------------------------------ герои (maps.her_to_txt / txt_to_her)
  const HER_HEAD = `; Герои уровня: одна запись на строку - сторона тип x y extra
;   сторона: 0 - свои, 1 - враги, 2 - пленники
;   тип:     0..26 (номер спрайта героя, см. docs/FORMATS.md); для своих и врагов один и тот же набор, расы определяет уровень
;   x y:     клетка карты 0..63 (x - столбец, y - строка в CSV карты)
;   extra:   пятый байт записи ("для балды" - random() в редакторе WMAPPER2); игра его не требует, оставлен для точной копии`;
  function heroesFromBytes(d) {
    const out = [];
    let i = 0;
    while (i + 5 <= HER_BYTES && d[i] !== 0xFF) { out.push({ side: d[i], type: d[i + 1], x: d[i + 2], y: d[i + 3], extra: d[i + 4] }); i += 5; }
    for (; i < HER_BYTES; i++) if (d[i] !== 0xFF) throw new FormatError(tr('герои: после конца записей не #FF'));
    return out;
  }
  function heroesToBytes(list) {
    if (list.length > HER_MAX) throw new FormatError(tr('героев {n}, больше {max}', { n: list.length, max: HER_MAX }));
    const out = new Uint8Array(HER_BYTES).fill(0xFF);
    list.forEach((h, k) => {
      for (const v of [h.side, h.type, h.x, h.y]) if (!(v >= 0 && v <= 254)) throw new FormatError(tr('герой {n}: недопустимое значение', { n: k + 1 }));
      out.set([h.side, h.type, h.x, h.y, h.extra & 0xFF], k * 5);
    });
    return out;
  }
  const pad = (v, n) => String(v).padStart(n, ' ');
  function heroesToTxt(list) {
    return [HER_HEAD].concat(list.map(h => `${h.side} ${pad(h.type, 2)} ${pad(h.x, 2)} ${pad(h.y, 2)} ${h.extra > 127 ? h.extra - 256 : h.extra}`)).join('\n') + '\n';
  }
  function heroesFromTxt(text) {
    const out = [];
    text.replace(/\r/g, '').split('\n').forEach((ln, n) => {
      ln = ln.split(';')[0].trim();
      if (!ln) return;
      const v = ln.split(/\s+/).map(Number);
      if (v.length !== 5 || v.some(isNaN)) throw new FormatError(tr('heroes.txt:{n}: нужно 5 чисел (сторона тип x y extra)', { n: n + 1 }));
      out.push({ side: v[0], type: v[1], x: v[2], y: v[3], extra: v[4] & 0xFF });
    });
    heroesToBytes(out);
    return out;
  }

  // ------------------------------------------------------------------ карта (maps.map_to_csv / csv_to_map)
  function mapToCsv(m) {
    const rows = [];
    for (let y = 0; y < MAP_N; y++) { const r = []; for (let x = 0; x < MAP_N; x++) r.push(pad(m[y * MAP_N + x], 3)); rows.push(r.join(',')); }
    return rows.join('\n') + '\n';
  }
  function mapFromCsv(text) {
    const rows = text.replace(/\r/g, '').split('\n').filter(l => l.trim() && !l.trimStart().startsWith(';'));
    if (rows.length !== MAP_N) throw new FormatError(tr('в карте должно быть 64 строки, а их {n}', { n: rows.length }));
    const out = new Uint8Array(MAP_N * MAP_N);
    rows.forEach((ln, y) => {
      const v = ln.trim().split(/[,;\s]+/).filter(s => s !== '');
      if (v.length !== MAP_N) throw new FormatError(tr('карта, строка {y}: {n} значений вместо 64', { y: y + 1, n: v.length }));
      v.forEach((s, x) => { const i = parseInt(s, 10); if (!(i >= 0 && i <= 255)) throw new FormatError(tr('карта, строка {y}: значение {v}', { y: y + 1, v: s })); out[y * MAP_N + x] = i; });
    });
    return out;
  }

  // ------------------------------------------------------------------ здания
  // центр 78..107 - здание 3x3 (8 хвостов), 108..112 - 2x2 (3 хвоста: слева, слева-сверху, сверху; центр - правый нижний угол)
  function buildingKind(c) { return c >= 78 && c < 108 ? 8 : (c >= 108 && c <= 112 ? 3 : 0); }
  function tileIndex(m, x, y) {
    let bt = m[y * MAP_N + x];
    if (bt >= 120) {
      const p = y * MAP_N + x + SHIFT[bt - 120];
      const at = p >= 0 && p < MAP_N * MAP_N ? m[p] : 0;
      bt = at < 108 ? (at - 78) * 8 + 128 + (bt - 120) : (at - 108) * 3 + 368 + (bt - 120);
    }
    return bt;
  }
  /** клетки здания с центром в (cx, cy): [{x, y, v}] (центр первым) */
  function buildingCells(center, cx, cy) {
    const n = buildingKind(center), out = [{ x: cx, y: cy, v: center }];
    for (let d = 0; d < n; d++) {
      const p = cy * MAP_N + cx - SHIFT[d];
      out.push({ x: p & 63, y: p >> 6, v: 120 + d, p });
    }
    return out;
  }
  function canPlaceBuilding(center, cx, cy) {
    const n = buildingKind(center);
    if (!n) return false;
    return n === 8 ? (cx >= 1 && cx <= 62 && cy >= 1 && cy <= 62) : (cx >= 1 && cx <= 63 && cy >= 1 && cy <= 63);
  }
  /** центр здания, которому принадлежит клетка (или null). Центр - клетка, на которую указывает хотя бы один хвост. */
  function buildingAt(m, x, y) {
    const i = y * MAP_N + x, v = m[i];
    let c = -1;
    if (v >= 120) c = i + SHIFT[v - 120];
    else if (buildingKind(v)) {
      for (let d = 0; d < 8; d++) { const j = i - SHIFT[d]; if (j >= 0 && j < 4096 && m[j] === 120 + d) { c = i; break; } }
    }
    if (c < 0 || c >= 4096 || !buildingKind(m[c])) return null;
    return { x: c & 63, y: c >> 6, center: m[c] };
  }
  function eraseBuilding(m, b, fill) {
    const cells = buildingCells(b.center, b.x, b.y);
    for (const c of cells) {
      const i = c.y * MAP_N + c.x;
      if (i === b.y * MAP_N + b.x || (m[i] === c.v && m[i] >= 120)) m[i] = fill;
    }
    // хвосты, указывающие в этот центр, но не из полного набора (битое здание)
    for (let d = 0; d < 8; d++) { const j = b.y * MAP_N + b.x - SHIFT[d]; if (j >= 0 && j < 4096 && m[j] === 120 + d) m[j] = fill; }
  }
  function placeBuilding(m, center, cx, cy, fill) {
    if (!canPlaceBuilding(center, cx, cy)) return false;
    const cells = buildingCells(center, cx, cy);
    for (const c of cells) { const b = buildingAt(m, c.x, c.y); if (b) eraseBuilding(m, b, fill); }
    for (const c of cells) m[c.y * MAP_N + c.x] = c.v;
    return true;
  }
  /** поставить простой тайл: если клетка - часть здания, здание сносится (заливается fill) */
  function paintTile(m, x, y, v, fill) {
    const b = buildingAt(m, x, y);
    if (b) eraseBuilding(m, b, fill);
    m[y * MAP_N + x] = v;
  }

  // ------------------------------------------------------------------ параметры
  function getParam(script, name) {
    const o = HOFF[name];
    if (name === 'MONEY' || name === 'WOOD') return Array.from(script.slice(o, o + 6)).reduce((a, d) => a * 10 + d, 0);
    return script[o];
  }
  function setParam(script, name, v) {
    const o = HOFF[name];
    if (name === 'MONEY' || name === 'WOOD') {
      v = Math.max(0, Math.min(999999, Math.floor(v)));
      const s = String(v).padStart(6, '0');
      for (let i = 0; i < 6; i++) script[o + i] = +s[i];
      return;
    }
    script[o] = v & 0xFF;
  }
  /** деньги/лес "как есть": цифры могут быть > 9 (тогда число в форме не точное) */
  function digitsOk(script, name) { const o = HOFF[name]; for (let i = 0; i < 6; i++) if (script[o + i] > 9) return false; return true; }
  function getMines(script) { const r = []; for (let i = 0; i < 8; i++) r.push(script[OFF_MIN + 2 * i] | script[OFF_MIN + 2 * i + 1] << 8); return r; }
  function setMine(script, i, v) { v = Math.max(0, Math.min(65535, v | 0)); script[OFF_MIN + 2 * i] = v & 255; script[OFF_MIN + 2 * i + 1] = v >> 8; }
  function hasProbe(script) {
    const sub = script.slice(OFF_CODE, OFF_BULL);
    let found = false;
    for (let i = 0; i + 4 <= sub.length; i++) if (eq(sub.slice(i, i + 4), PROBE_SIG)) { found = true; break; }
    return found && script[OFF_CODE] === 0x18 && script[OFF_CODE + 2] === 0xAF;
  }
  function cleanProbe(script) {
    for (let i = OFF_CODE; i < OFF_BULL; i++) script[i] = 0x27;
    script.set(PROBE_CLEAN, OFF_CODE);
  }
  const codeRegion = s => s.slice(OFF_CODE, OFF_MIN);

  // ------------------------------------------------------------------ блок <-> уровень
  function isDataBlock(b) {
    if (b.length !== BLOCK || b[0] !== 0xC9) return false;
    try { heroesFromBytes(b.slice(OFF_HER, OFF_MAP)); taskDecode(b.slice(OFF_TASK, OFF_TASK + TASK_LEN)); } catch (e) { return false; }
    return true;
  }
  function levelFromBlock(b, name) {
    b = Uint8Array.from(b);
    if (b.length !== BLOCK) throw new FormatError(tr('блок уровня: {n} байт вместо {need}', { n: b.length, need: BLOCK }));
    if (!isDataBlock(b)) return { name, kind: 'raw', raw: b };
    return {
      name, kind: 'data', script: b.slice(0, OFF_HER), task: taskDecode(b.slice(OFF_TASK, OFF_TASK + TASK_LEN)),
      heroes: heroesFromBytes(b.slice(OFF_HER, OFF_MAP)), map: b.slice(OFF_MAP, OFF_SCR), screen: b.slice(OFF_SCR),
      asmText: null, asmOrig: null
    };
  }
  function scriptBytes(lv) {
    const s = Uint8Array.from(lv.script);
    s.set(taskEncode(lv.task), OFF_TASK);
    return s;
  }
  function levelToBlock(lv) {
    if (lv.kind === 'raw') return Uint8Array.from(lv.raw);
    const b = new Uint8Array(BLOCK);
    b.set(scriptBytes(lv), 0);
    b.set(heroesToBytes(lv.heroes), OFF_HER);
    b.set(lv.map, OFF_MAP);
    b.set(lv.screen, OFF_SCR);
    return b;
  }
  function cloneLevel(lv) {
    const c = Object.assign({}, lv);
    for (const k of ['script', 'map', 'screen', 'raw']) if (lv[k]) c[k] = Uint8Array.from(lv[k]);
    if (lv.task) c.task = { lines: lv.task.lines.slice(), tail: Uint8Array.from(lv.task.tail) };
    if (lv.heroes) c.heroes = lv.heroes.map(h => Object.assign({}, h));
    return c;
  }

  // ------------------------------------------------------------------ script.asm: разбор (подмножество sjasmplus, которое пишет levasm.to_asm)
  function parseNum(tok, sym, pc) {
    tok = tok.trim();
    let m;
    if (tok === '$') return pc;
    if ((m = /^(?:#|\$|0x)([0-9a-f]+)$/i.exec(tok))) return parseInt(m[1], 16);
    if ((m = /^([0-9a-f]+)h$/i.exec(tok)) && /^\d/.test(tok)) return parseInt(m[1], 16);
    if ((m = /^%([01]+)$/.exec(tok))) return parseInt(m[1], 2);
    if (/^\d+$/.test(tok)) return parseInt(tok, 10);
    if (Object.prototype.hasOwnProperty.call(sym, tok)) return sym[tok];
    throw new FormatError(tr('не понимаю значение «{v}»', { v: tok }));
  }
  function parseExpr(e, sym, pc) {
    const parts = e.replace(/\s+/g, '').split(/(?=[+-])/);
    let v = 0;
    for (const p of parts) {
      if (p[0] === '-') v -= parseNum(p.slice(1), sym, pc);
      else if (p[0] === '+') v += parseNum(p.slice(1), sym, pc);
      else v += parseNum(p, sym, pc);
    }
    return v;
  }
  function stripComment(s) {
    let q = false;
    for (let i = 0; i < s.length; i++) { if (s[i] === '"') q = !q; else if (s[i] === ';' && !q) return s.slice(0, i); }
    return s;
  }
  /**
   * script.asm -> 1104 байта. Команды Z80 берутся из машинного кода в комментарии дизассемблера («; 7A6B  1801»):
   * редактор сценарии не меняет, а свой ассемблер Z80 ему не нужен. task - 63 байта для INCBIN "task.bin".
   */
  function parseScriptAsm(text, task) {
    const out = new Uint8Array(0x10000);
    const sym = {};
    let pc = 0, start = null, max = 0;
    const lines = text.replace(/\r/g, '').split('\n');
    // первый проход - метки и EQU не нужны вперёд, кроме EQU (всегда до использования в levasm-выводе); второй не нужен
    const emit = bytes => { if (start === null) start = pc; for (const b of bytes) out[pc++] = b & 0xFF; max = Math.max(max, pc); };
    lines.forEach((raw, n) => {
      const where = `script.asm:${n + 1}`;
      try {
        const hexm = /;\s*([0-9A-F]{4})\s+([0-9a-f]+)\s*$/i.exec(raw);
        let s = stripComment(raw).replace(/\s+$/, '');
        if (!s.trim()) return;
        let label = null;
        const lm = /^([A-Za-z_.][\w.]*):?(?=\s|$)/.exec(s);
        if (lm && !/^\s/.test(s)) { label = lm[1]; s = s.slice(lm[0].length); }
        const t = s.trim();
        const dm = /^(\S+)\s*(.*)$/.exec(t) || [null, '', ''];
        const op = dm[1].toUpperCase(), args = dm[2];
        if (op === 'EQU') { sym[label] = parseExpr(args, sym, pc); return; }
        if (label) sym[label] = pc;
        if (!t) return;
        if (op === 'ORG') { pc = parseExpr(args, sym, pc); return; }
        if (op === 'DEFB' || op === 'DB' || op === 'BYTE') { emit(args.split(',').map(a => parseExpr(a, sym, pc))); return; }
        if (op === 'DEFW' || op === 'DW' || op === 'WORD') { const v = []; args.split(',').forEach(a => { const x = parseExpr(a, sym, pc); v.push(x & 255, (x >> 8) & 255); }); emit(v); return; }
        if (op === 'DEFS' || op === 'DS' || op === 'BLOCK') {
          const a = args.split(','); const n = parseExpr(a[0], sym, pc), f = a.length > 1 ? parseExpr(a[1], sym, pc) : 0;
          if (n < 0) throw new FormatError(tr('отрицательный DEFS (код или данные заходят дальше, чем можно)'));
          emit(new Array(n).fill(f)); return;
        }
        if (op === 'INCBIN') {
          if (!/"task\.bin"/i.test(args)) throw new FormatError(tr('INCBIN поддерживается только для "task.bin"'));
          emit(task); return;
        }
        if (op === 'DEVICE' || op === 'OUTPUT') return;
        // команда Z80: байты из комментария
        if (!hexm) throw new FormatError(tr('команда «{cmd}» без машинного кода в комментарии (; АДРЕС  БАЙТЫ). Соберите блок игровыми средствами (python tools/levels.py import) и откройте .bin', { cmd: t }));
        const addr = parseInt(hexm[1], 16);
        if (addr !== pc) throw new FormatError(tr('адрес в комментарии {a} не совпадает с текущим #{pc}', { a: hexm[1], pc: pc.toString(16).toUpperCase() }));
        const h = hexm[2];
        const bytes = [];
        for (let i = 0; i + 1 < h.length; i += 2) bytes.push(parseInt(h.substr(i, 2), 16));
        emit(bytes);
      } catch (e) {
        throw new FormatError(`${where}: ${e.message}`);
      }
    });
    if (start !== LEVDAT) throw new FormatError(tr('script.asm: данные должны начинаться с ORG #79C0'));
    if (max - start !== SCRIPT_LEN) throw new FormatError(tr('script.asm: размер {n} вместо {need} (код задания не должен выходить за #7AA0, данные - за #7E10)', { n: max - start, need: SCRIPT_LEN }));
    return out.slice(start, max);
  }

  // ------------------------------------------------------------------ script.asm: вывод (как levasm.to_asm)
  function headerLines(script) {
    const lines = [];
    HEADER.forEach(([off, name, word], idx) => {
      let nxt = idx + 1 < HEADER.length ? HEADER[idx + 1][0] : OFF_CODE;
      if (name === 'LEVRES') nxt = 107;
      const raw = script.slice(off, nxt);
      const cm = COMMENT[name] ? '\t; ' + COMMENT[name] : '';
      if (name === 'TASK_M') { lines.push('TASK_M\tINCBIN\t"task.bin"' + cm); return; }
      if (word && raw.length % 2 === 0) {
        const v = [];
        for (let i = 0; i < raw.length; i += 2) v.push(hex4(raw[i] | raw[i + 1] << 8));
        lines.push(`${name}\tDEFW\t${v.join(',')}${cm}`);
      } else lines.push(`${name}\tDEFB\t${Array.from(raw).map(b => b < 10 ? String(b) : hex2(b)).join(',')}${cm}`);
    });
    return lines;
  }
  function minesLine(script) { return 'datMIN\tDEFW\t' + getMines(script).join(',') + '\t; золото 8 шахт (/100)'; }
  function titleLine(name) { return `; ${name}: параметры и код задания дополнительного уровня 1999 г. (#79C0..#7E0F, 1104 байта; продолжение блока - герои, карта, экран)`; }
  function runs(data) {   // levasm._runs
    const out = [];
    let i = 0;
    const same8 = k => { if (k + 8 > data.length) return false; for (let j = 1; j < 8; j++) if (data[k + j] !== data[k]) return false; return true; };
    while (i < data.length) {
      let j = i;
      while (j < data.length && data[j] === data[i]) j++;
      if (j - i >= 8) { out.push(data[i] ? `\tDEFS\t${j - i},${hex2(data[i])}` : `\tDEFS\t${j - i}`); i = j; continue; }
      let k = i;
      while (k < data.length && k - i < 16 && !same8(k)) k++;
      k = Math.max(k, i + 1);
      out.push('\tDEFB\t' + Array.from(data.slice(i, k)).map(hex2).join(','));
      i = k;
    }
    return out;
  }
  /** script.asm без дизассемблера: код задания - байтами (собирается в те же байты) */
  function genericAsm(script, name) {
    const L = [titleLine(name), '; собирается sjasmplus (task.bin - из task.txt, см. tools/levels.py); подробности - docs/FORMATS.md', '',
      'LEVDAT\tEQU\t#79C0', '\tORG\tLEVDAT', ''];
    L.push(...headerLines(script));
    L.push('', ';------------ процедуры: pcLOOP - каждый кадр, pcINI - при старте ------------',
      '; (код задания записан байтами: редактор не нашёл для него дизассемблированного текста)', 'pcLOOP:');
    L.push(...runs(script.slice(OFF_CODE, OFF_CODE + 2)), 'pcINI:', ...runs(script.slice(OFF_CODE + 2, OFF_MIN)), '');
    L.push(minesLine(script), 'datHER\t\t; здесь начинаются герои (496 байт), карта (4096) и экран (6912) - в файлах heroes.txt, map.csv, screen.png', '');
    return L.join('\n');
  }
  /** взять текст-образец (свой или из библиотеки) и заменить в нём заголовок и datMIN по байтам script */
  function patchAsm(text, script, name, retitle) {
    const L = text.split('\n');
    const a = L.findIndex(l => /^isRUNL\s/.test(l));
    const b = L.findIndex(l => /^dummy\s/.test(l));
    const m = L.findIndex(l => /^datMIN\s/.test(l));
    if (a < 0 || b < a || m < 0) return null;
    const out = L.slice(0, a).concat(headerLines(script), L.slice(b + 1, m), [minesLine(script)], L.slice(m + 1));
    if (retitle && /^; .*: параметры и код задания/.test(out[0])) out[0] = titleLine(name);
    return out.join('\n');
  }

  // ------------------------------------------------------------------ библиотека сценариев (data/brdata.js)
  let LIB = [];
  function initLibrary(lib) {
    LIB = lib.map(e => Object.assign({}, e, { bytes: b64dec(e.script) }));
  }
  function libraryMatch(script) {
    const c = codeRegion(script);
    return LIB.find(e => eq(codeRegion(e.bytes), c)) || null;
  }
  /**
   * текст script.asm для уровня: исходный текст без изменений, если байты не менялись;
   * иначе - тот же текст (или подходящий из библиотеки) с новым заголовком; если ничего нет - код байтами.
   */
  function scriptAsm(lv) {
    const s = scriptBytes(lv);
    const task = s.slice(OFF_TASK, OFF_TASK + TASK_LEN);
    if (lv.asmText) {
      try { if (eq(parseScriptAsm(lv.asmText, task), s)) return lv.asmText; } catch (e) { /* дальше */ }
      try {
        const p = patchAsm(lv.asmText, s, lv.name, false);
        if (p && eq(parseScriptAsm(p, task), s)) return p;
      } catch (e) { /* дальше */ }
    }
    const lib = libraryMatch(s);
    if (lib) {
      try {
        const p = patchAsm(lib.asm, s, lv.name, true);
        if (p && eq(parseScriptAsm(p, task), s)) return p;
      } catch (e) { /* дальше */ }
    }
    return genericAsm(s, lv.name);
  }
  /** только участок процедур (для показа) */
  function codeListing(asm) {
    const L = asm.split('\n');
    const a = L.findIndex(l => l.startsWith(';------------ процедуры'));
    const m = L.findIndex(l => /^datMIN\s/.test(l));
    return a >= 0 && m > a ? L.slice(a, m).join('\n').replace(/\s+$/, '') : asm;
  }
  /** переписать сценарий (код задания #7A6B..#7E00) из другого уровня; withParams - ещё и параметры ИИ/вооружения (байты 1..21) */
  function copyScript(lv, src, withParams) {
    lv.script.set(src.bytes.slice(OFF_CODE, OFF_MIN), OFF_CODE);
    if (withParams) lv.script.set(src.bytes.slice(1, 22), 1);
    lv.asmText = patchAsm(src.asm, lv.script, lv.name, true);
    lv.asmOrig = null;
  }

  // ------------------------------------------------------------------ экран .scr <-> PNG (gfx.scr_color_export / scr_color_import)
  const ZXRGB = [[0, 0, 0], [0, 0, 215], [215, 0, 0], [215, 0, 215], [0, 215, 0], [0, 215, 215], [215, 215, 0], [215, 215, 215]];
  const ZXRGBB = [[0, 0, 0], [0, 0, 255], [255, 0, 0], [255, 0, 255], [0, 255, 0], [0, 255, 255], [255, 255, 0], [255, 255, 255]];
  const ZXPAL = ZXRGB.concat(ZXRGBB);
  const specAddr = y => ((y & 0xC0) << 5) | ((y & 7) << 8) | ((y & 0x38) << 2);
  /** .scr -> индексы палитры ZXPAL (256*192) */
  function scrToIndexed(scr) {
    const px = new Uint8Array(256 * 192);
    for (let y = 0; y < 192; y++) for (let cx = 0; cx < 32; cx++) {
      const b = scr[specAddr(y) + cx], a = scr[6144 + (y >> 3) * 32 + cx];
      const ink = a & 7, paper = (a >> 3) & 7, br = (a >> 6) & 1;
      for (let k = 0; k < 8; k++) px[y * 256 + cx * 8 + k] = ((b >> (7 - k)) & 1 ? ink : paper) + 8 * br;
    }
    return px;
  }
  function zxIndex(r, g, b) {
    for (let k = 0; k < 16; k++) if (ZXPAL[k][0] === r && ZXPAL[k][1] === g && ZXPAL[k][2] === b) return k;
    let best = 0, bd = 1e9;
    for (let k = 0; k < 16; k++) { const d = (r - ZXPAL[k][0]) ** 2 + (g - ZXPAL[k][1]) ** 2 + (b - ZXPAL[k][2]) ** 2; if (d < bd) { bd = d; best = k; } }
    return best;
  }
  /** RGB(A) 256x192 (+ исходный .scr) -> .scr; как gfx.scr_color_import */
  function rgbToScr(rgba, channels, orig) {
    const lin = new Uint8Array(6144), attr = new Uint8Array(768);
    const P = (x, y) => { const o = (y * 256 + x) * channels; return [rgba[o], rgba[o + 1], rgba[o + 2]]; };
    for (let cy = 0; cy < 24; cy++) for (let cx = 0; cx < 32; cx++) {
      if (orig) {
        const a = orig[6144 + cy * 32 + cx], br = (a >> 6) & 1;
        const ink = ZXPAL[(a & 7) + 8 * br], paper = ZXPAL[((a >> 3) & 7) + 8 * br];
        let same = true;
        for (let r = 0; r < 8 && same; r++) {
          const b = orig[specAddr(cy * 8 + r) + cx];
          for (let k = 0; k < 8; k++) {
            const w = (b >> (7 - k)) & 1 ? ink : paper, p = P(cx * 8 + k, cy * 8 + r);
            if (w[0] !== p[0] || w[1] !== p[1] || w[2] !== p[2]) { same = false; break; }
          }
        }
        if (same) {
          attr[cy * 32 + cx] = a;
          for (let r = 0; r < 8; r++) lin[(cy * 8 + r) * 32 + cx] = orig[specAddr(cy * 8 + r) + cx];
          continue;
        }
      }
      const idx = [];
      for (let r = 0; r < 8; r++) for (let k = 0; k < 8; k++) { const p = P(cx * 8 + k, cy * 8 + r); idx.push(zxIndex(p[0], p[1], p[2])); }
      const cols = new Map();
      for (const i of idx) { const key = i !== 8 ? i & 7 : 0; cols.set(key, (cols.get(key) || 0) + 1); }
      const br = idx.some(i => i >= 9) ? 1 : 0;
      const used = Array.from(cols.keys()).sort((a, b) => cols.get(b) - cols.get(a) || 0).slice(0, 2);  // Python sorted - устойчивая
      let ink, paper;
      if (used.length === 1) ink = paper = used[0]; else { paper = used[0]; ink = used[1]; }
      attr[cy * 32 + cx] = ink + paper * 8 + br * 64;
      for (let r = 0; r < 8; r++) {
        let v = 0;
        for (let k = 0; k < 8; k++) { let c = idx[r * 8 + k]; c = c !== 8 ? c & 7 : 0; v = (v << 1) | ((c === ink && ink !== paper) || (c !== paper && c === ink) ? 1 : 0); }
        lin[(cy * 8 + r) * 32 + cx] = v;
      }
    }
    const scr = new Uint8Array(6912);
    for (let y = 0; y < 192; y++) scr.set(lin.subarray(y * 32, y * 32 + 32), specAddr(y));
    scr.set(attr, 6144);
    return scr;
  }

  // ------------------------------------------------------------------ PNG (палитровый 8 бит; deflate/inflate передаются снаружи)
  let CRC_T = null;
  function crc32(u, crc) {
    if (!CRC_T) { CRC_T = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c >>> 0; } }
    crc = (crc === undefined ? 0 : crc) ^ 0xFFFFFFFF;
    for (let i = 0; i < u.length; i++) crc = CRC_T[(crc ^ u[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function concat(parts) { const n = parts.reduce((a, p) => a + p.length, 0), o = new Uint8Array(n); let k = 0; for (const p of parts) { o.set(p, k); k += p.length; } return o; }
  const be32 = v => Uint8Array.of(v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
  function pngChunk(type, data) { const t = utf8(type); return concat([be32(data.length), t, data, be32(crc32(concat([t, data])))]); }
  /** индексированное изображение -> PNG. deflate(Uint8Array) -> Uint8Array|Promise */
  async function encodePng(w, h, idx, palette, deflate) {
    const raw = new Uint8Array((w + 1) * h);
    for (let y = 0; y < h; y++) raw.set(idx.subarray(y * w, y * w + w), y * (w + 1) + 1);
    const ihdr = concat([be32(w), be32(h), Uint8Array.of(8, 3, 0, 0, 0)]);
    const pal = new Uint8Array(palette.length * 3); palette.forEach((c, i) => pal.set(c, i * 3));
    const z = await deflate(raw);
    return concat([Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10), pngChunk('IHDR', ihdr), pngChunk('PLTE', pal), pngChunk('IDAT', z), pngChunk('IEND', new Uint8Array(0))]);
  }
  /** PNG -> {w, h, rgba}; поддерживается 8 бит (палитра, серый, RGB, RGBA) без чересстрочности. inflate - как deflate */
  async function decodePng(u, inflate) {
    const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
    let p = 8, w, h, depth, ct, il, pal = null, trns = null; const idat = [];
    while (p < u.length) {
      const len = dv.getUint32(p), type = String.fromCharCode(u[p + 4], u[p + 5], u[p + 6], u[p + 7]), d = u.subarray(p + 8, p + 8 + len);
      if (type === 'IHDR') { w = dv.getUint32(p + 8); h = dv.getUint32(p + 12); depth = d[8]; ct = d[9]; il = d[12]; }
      else if (type === 'PLTE') pal = d; else if (type === 'tRNS') trns = d; else if (type === 'IDAT') idat.push(d); else if (type === 'IEND') break;
      p += 12 + len;
    }
    if (il) throw new FormatError(tr('PNG: чересстрочный не поддерживается'));
    const bppx = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct];
    if (!bppx || (depth !== 8 && !(ct === 3 && depth < 8))) throw new FormatError(tr('PNG: поддерживаются только 8-битные (или палитровые) изображения'));
    const raw = await inflate(concat(idat));
    const stride = ct === 3 && depth < 8 ? Math.ceil(w * depth / 8) : w * bppx, bpp = Math.max(1, ct === 3 && depth < 8 ? 1 : bppx);
    const img = new Uint8Array(stride * h);
    for (let y = 0; y < h; y++) {
      const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), o = y * stride;
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? img[o + x - bpp] : 0, b = y ? img[o - stride + x] : 0, c = x >= bpp && y ? img[o - stride + x - bpp] : 0;
        let v = line[x];
        if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
        else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
        img[o + x] = v & 255;
      }
    }
    const rgba = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const q = (y * w + x) * 4;
      let r, g, b, al = 255;
      if (ct === 3) {
        const i = depth < 8 ? (img[y * stride + ((x * depth) >> 3)] >> (8 - depth - ((x * depth) & 7))) & ((1 << depth) - 1) : img[y * stride + x];
        r = pal[i * 3]; g = pal[i * 3 + 1]; b = pal[i * 3 + 2]; if (trns && i < trns.length) al = trns[i];
      } else {
        const o = y * stride + x * bppx;
        if (ct === 0 || ct === 4) { r = g = b = img[o]; if (ct === 4) al = img[o + 1]; } else { r = img[o]; g = img[o + 1]; b = img[o + 2]; if (ct === 6) al = img[o + 3]; }
      }
      rgba[q] = r; rgba[q + 1] = g; rgba[q + 2] = b; rgba[q + 3] = al;
    }
    return { w, h, rgba };
  }
  function screenToPng(scr, deflate) { return encodePng(256, 192, scrToIndexed(scr), ZXPAL, deflate); }

  // ------------------------------------------------------------------ каталог в формате assets_src/levels_ext/<имя>/
  /** файлы каталога: {'script.asm': Uint8Array, ...} -> уровень. inflate - для screen.png. */
  async function levelFromFolder(files, name, inflate) {
    const get = n => files[n];
    const txt = n => unutf8(get(n));
    for (const n of ['script.asm', 'task.txt', 'map.csv', 'heroes.txt']) if (!get(n)) throw new FormatError(tr('в каталоге нет {f}', { f: n }));
    const task = taskFromTxt(txt('task.txt'));
    const taskBytes = taskEncode(task);
    const asmText = txt('script.asm');
    const script = parseScriptAsm(asmText, taskBytes);
    let screen;
    const orig = get('screen.orig.scr') && get('screen.orig.scr').length === 6912 ? get('screen.orig.scr') : null;
    if (get('screen.png')) {
      const im = await decodePng(get('screen.png'), inflate);
      if (im.w !== 256 || im.h !== 192) throw new FormatError(tr('screen.png: размер {w}x{h}, нужен 256x192', { w: im.w, h: im.h }));
      screen = rgbToScr(im.rgba, 4, orig);
    } else if (orig) screen = Uint8Array.from(orig);
    else throw new FormatError(tr('в каталоге нет {f}', { f: 'screen.png' }));
    return {
      name, kind: 'data', script, task, heroes: heroesFromTxt(txt('heroes.txt')), map: mapFromCsv(txt('map.csv')), screen,
      asmText, asmOrig: get('script.orig.asm') ? txt('script.orig.asm') : null
    };
  }
  /** уровень -> {'script.asm': Uint8Array, ...} (как levels.export_one; preview.png не пишется - он только для просмотра) */
  async function levelToFolder(lv, deflate) {
    if (lv.kind === 'raw') return { [lv.name + '.bin']: levelToBlock(lv) };
    const s = scriptBytes(lv);
    const f = {
      'script.asm': utf8(scriptAsm(lv)), 'task.txt': utf8(taskToTxt(lv.task)), 'map.csv': utf8(mapToCsv(lv.map)),
      'heroes.txt': utf8(heroesToTxt(lv.heroes)), 'screen.png': await screenToPng(lv.screen, deflate), 'screen.orig.scr': Uint8Array.from(lv.screen)
    };
    // script.orig.asm (вариант с защитой TST) - только если сценарий не менялся
    if (lv.asmOrig && lv.asmText && eq(codeRegion(s), codeRegion(parseScriptAsmSafe(lv.asmText, s)))) f['script.orig.asm'] = utf8(lv.asmOrig);
    return f;
  }
  function parseScriptAsmSafe(t, s) { try { return parseScriptAsm(t, s.slice(OFF_TASK, OFF_TASK + TASK_LEN)); } catch (e) { return new Uint8Array(SCRIPT_LEN); } }

  // ------------------------------------------------------------------ ZIP (без сжатия) - если браузер не умеет писать в каталог
  function zipStore(files) {
    const parts = [], central = [];
    let off = 0;
    const le16 = v => Uint8Array.of(v & 255, v >> 8), le32 = v => Uint8Array.of(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, v >>> 24);
    for (const [name, data] of Object.entries(files)) {
      const nb = utf8(name), crc = crc32(data);
      const local = concat([le32(0x04034b50), le16(20), le16(0x800), le16(0), le16(0), le16(0x21), le32(crc), le32(data.length), le32(data.length), le16(nb.length), le16(0), nb]);
      parts.push(local, data);
      central.push(concat([le32(0x02014b50), le16(20), le16(20), le16(0x800), le16(0), le16(0), le16(0x21), le32(crc), le32(data.length), le32(data.length),
        le16(nb.length), le16(0), le16(0), le16(0), le16(0), le32(0), le32(off), nb]));
      off += local.length + data.length;
    }
    const cd = concat(central);
    return concat(parts.concat([cd, concat([le32(0x06054b50), le16(0), le16(0), le16(central.length), le16(central.length), le32(cd.length), le32(off), le16(0)])]));
  }

  // ------------------------------------------------------------------ проект JSON
  function levelToProject(lv) {
    const base = { format: 'br-level-editor', version: 1, name: lv.name, kind: lv.kind };
    if (lv.kind === 'raw') return Object.assign(base, { raw: b64enc(lv.raw) });
    const rows = [];
    for (let y = 0; y < MAP_N; y++) rows.push(Array.from(lv.map.slice(y * MAP_N, y * MAP_N + MAP_N)).join(','));
    return Object.assign(base, {
      task: { lines: lv.task.lines.slice(), tail: Array.from(lv.task.tail) },
      heroes: lv.heroes.map(h => [h.side, h.type, h.x, h.y, h.extra]),
      map: rows, script: b64enc(lv.script), screen: b64enc(lv.screen), asmText: lv.asmText, asmOrig: lv.asmOrig
    });
  }
  function levelFromProject(o) {
    if (!o || o.format !== 'br-level-editor') throw new FormatError(tr('это не проект редактора уровней'));
    if (o.kind === 'raw') return { name: o.name, kind: 'raw', raw: b64dec(o.raw) };
    const map = new Uint8Array(4096);
    o.map.forEach((r, y) => r.split(',').forEach((v, x) => { map[y * 64 + x] = +v; }));
    return {
      name: o.name, kind: 'data', script: b64dec(o.script), task: { lines: o.task.lines.slice(), tail: Uint8Array.from(o.task.tail) },
      heroes: o.heroes.map(h => ({ side: h[0], type: h[1], x: h[2], y: h[3], extra: h[4] })), map, screen: b64dec(o.screen),
      asmText: o.asmText || null, asmOrig: o.asmOrig || null
    };
  }

  // ------------------------------------------------------------------ проверка
  const SIDE_LIMIT = [48, 48, 6];   // HUMAN/KUNGE - по 48 записей, SLAVE - 6 (w_level.asm)
  function validate(lv) {
    const R = [];
    const err = (msg, x, y) => R.push({ level: 'error', msg, x, y }), warn = (msg, x, y) => R.push({ level: 'warn', msg, x, y });
    if (lv.kind === 'raw') { warn(tr('это не блок уровня (код концовки или испорченный блок): редактор сохраняет его как есть')); return R; }
    const m = lv.map;
    // граница
    // клетка (0,0) = 1 - признак подземелья (wlib1a.asm typMAP: LEV_T = 1, игра обнуляет её при старте); так у всех уровней ландшафта 3
    const dun = m[0] === 1, land3 = lv.script[HOFF.fsLAND] === 3;
    let nb = 0, first = null;
    for (let i = 0; i < 64; i++) for (const [x, y] of [[i, 0], [i, 63], [0, i], [63, i]]) if (m[y * 64 + x] !== 0 && !(x === 0 && y === 0 && dun)) { nb++; if (!first) first = [x, y]; }
    if (nb) warn(tr('граница карты: {n} клеток края не 0 (граница)', { n: nb }), first[0], first[1]);
    if (land3 && !dun) warn(tr('ландшафт 3 (подземелье), но в клетке 0,0 не 1: игра посчитает уровень наземным (поставьте туда тайл 1)'), 0, 0);
    if (!land3 && m[0] !== 0) warn(tr('в клетке 0,0 не 0: игра посчитает уровень подземельем (без зданий), а ландшафт не 3'), 0, 0);
    // здания
    const land = lv.script[HOFF.fsLAND];
    for (let i = 0; i < 4096; i++) {
      const v = m[i], x = i & 63, y = i >> 6;
      if (v >= 120) {
        const c = i + SHIFT[v - 120];
        if (c < 0 || c >= 4096 || Math.abs((c & 63) - x) > 1) { err(tr('хвост здания ({v}) указывает за край карты', { v }), x, y); continue; }
        const k = buildingKind(m[c]);
        if (!k) { err(tr('хвост здания ({v}) указывает на клетку {cx},{cy} с тайлом {t}, а это не центр здания', { v, cx: c & 63, cy: c >> 6, t: m[c] }), x, y); continue; }
        if (v - 120 >= k) err(tr('хвост {v} у здания 2x2 (центр {c}) - у таких только 120..122', { v, c: m[c] }), x, y);
      } else if (v > 119) err(tr('тайл {v} не существует', { v }), x, y);
      if (buildingKind(v)) {
        let any = false, all = true;
        const k = buildingKind(v);
        for (let d = 0; d < 8; d++) {
          const j = i - SHIFT[d];
          const has = j >= 0 && j < 4096 && m[j] === 120 + d;
          if (has) any = true; else if (d < k) all = false;
        }
        if (any && !all) err(tr('здание (центр {v}) неполное: не хватает частей', { v }), x, y);
        if (any && k === 8 && (x < 1 || x > 62 || y < 1 || y > 62)) err(tr('здание у самого края карты'), x, y);
        if (any && land === 3) warn(tr('здание на ландшафте 3 (подземелье) - у него нет графики зданий'), x, y);
      }
    }
    // герои
    if (lv.heroes.length > HER_MAX) err(tr('героев {n}, допустимо не больше {max}', { n: lv.heroes.length, max: HER_MAX }));
    const per = [0, 0, 0], occ = new Map();
    lv.heroes.forEach((h, k) => {
      const n = tr('герой {n} ({x},{y})', { n: k + 1, x: h.x, y: h.y });
      // wmisc_1.asm NEWALL: сторона 0/1 -> массив MASTER xor сторона (HUMAN/KUNGE), сторона >= 2 -> SLAVE (пленники); в уровнях кунгов пленники - 3
      if (h.side > 3) err(tr('{h}: сторона {v} (допустимо 0..3)', { h: n, v: h.side }), h.x, h.y); else per[Math.min(h.side, 2)]++;
      if (h.type > 26) err(tr('{h}: тип {v} (допустимо 0..26)', { h: n, v: h.type }), h.x, h.y);
      if (h.x > 63 || h.y > 63) { err(tr('{h}: вне карты', { h: n })); return; }
      const v = m[h.y * 64 + h.x];
      if (!(v >= 1 && v < GO_MAX)) warn(tr('{h}: стоит на непроходимой клетке (тайл {v}; проходимы 1..{max})', { h: n, v, max: GO_MAX - 1 }), h.x, h.y);
      const key = h.y * 64 + h.x;
      if (occ.has(key)) warn(tr('{h}: в той же клетке, что и герой {k}', { h: n, k: occ.get(key) + 1 }), h.x, h.y); else occ.set(key, k);
    });
    ['людей', 'кунгов', 'пленников'].forEach((s, i) => { if (per[i] > SIDE_LIMIT[i]) warn(tr('{s} {n}: в игре место для {max} (лишние могут не появиться)', { s: tr(s), n: per[i], max: SIDE_LIMIT[i] })); });
    // сторона в файле героев - раса (0 люди, 1 кунги); свои - раса игрока (MASTER): wmisc_1.asm NEWALL, массив = MASTER xor сторона
    if (!lv.heroes.some(h => h.side === (lv.script[HOFF.MASTER] ? 1 : 0))) warn(tr('нет ни одного своего героя'));
    // задание
    const tc = taskCheck(lv.task);
    tc.lines.forEach((r, i) => {
      if (r.bad.length) err(tr('задание, строка {n}: символа «{ch}» нет в шрифте игры', { n: i + 1, ch: r.bad[0].ch }));
      if (r.glyphs.length > TASK_W) warn(tr('задание, строка {n}: {k} знаков (в окне игры помещается {max})', { n: i + 1, k: r.glyphs.length, max: TASK_W }));
    });
    if (tc.bytes > TASK_LEN) err(tr('задание: {n} байт, допустимо {max} (3 строки по {w} знаков)', { n: tc.bytes, max: TASK_LEN, w: TASK_W }));
    // параметры
    const L = lv.script[HOFF.fsLAND]; if (L < 1 || L > 4) err(tr('ландшафт {v} (допустимо 1..4)', { v: L }));
    if (lv.script[HOFF.fsMUS] > 7) err(tr('мелодия {v} (допустимо 0..7)', { v: lv.script[HOFF.fsMUS] }));
    if (lv.script[HOFF.MASTER] > 1) err(tr('MASTER: допустимо 0 (люди) или 1 (кунги)'));
    if (!digitsOk(lv.script, 'MONEY')) warn(tr('{p}: в цифрах есть значения больше 9', { p: 'MONEY' }));
    if (!digitsOk(lv.script, 'WOOD')) warn(tr('{p}: в цифрах есть значения больше 9', { p: 'WOOD' }));
    if (hasProbe(lv.script)) warn(tr('в сценарии проверка контрольной суммы (защита TST): в нашей сборке игры уровень сломается - «Убрать защиту» на вкладке «Сценарий»'));
    if (lv.script[0] !== 0xC9) err(tr('isRUNL должен быть #C9'));
    return R;
  }

  /** новый уровень: сценарий и параметры - из уровня библиотеки, карта - фон с границей, без героев, чёрный экран */
  function newLevel(name, lib) {
    const script = Uint8Array.from(lib.bytes);
    const map = new Uint8Array(4096).fill(1);
    for (let i = 0; i < 64; i++) { map[i] = map[63 * 64 + i] = map[i * 64] = map[i * 64 + 63] = 0; }
    const screen = new Uint8Array(6912);
    const lv = { name, kind: 'data', script, task: { lines: ['', '', ''], tail: new Uint8Array(0) }, heroes: [], map, screen, asmText: null, asmOrig: null };
    lv.asmText = patchAsm(lib.asm, script, name, true);
    return lv;
  }

  return {
    BLOCK, OFF_HER, OFF_MAP, OFF_SCR, OFF_TASK, TASK_LEN, SCRIPT_LEN, OFF_CODE, OFF_MIN, MAP_N, HER_MAX, TASK_W, SHIFT, GO_MAX, HEADER, HOFF, ZXPAL,
    FormatError, setTranslator, fmt, b64dec, b64enc, eq, utf8, unutf8, crc32,
    initGlyphs, glyphChar, encodeLine, taskDecode, taskEncode, taskCheck, taskToTxt, taskFromTxt,
    heroesFromBytes, heroesToBytes, heroesToTxt, heroesFromTxt, mapToCsv, mapFromCsv,
    buildingKind, tileIndex, buildingCells, buildingAt, canPlaceBuilding, eraseBuilding, placeBuilding, paintTile,
    getParam, setParam, digitsOk, getMines, setMine, hasProbe, cleanProbe, codeRegion,
    isDataBlock, levelFromBlock, levelToBlock, scriptBytes, cloneLevel,
    parseScriptAsm, scriptAsm, genericAsm, patchAsm, codeListing, initLibrary, libraryMatch, copyScript, library: () => LIB,
    scrToIndexed, rgbToScr, encodePng, decodePng, screenToPng, levelFromFolder, levelToFolder, zipStore,
    levelToProject, levelFromProject, validate, newLevel
  };
});
