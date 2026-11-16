// Проверка генератора заготовок (js/gen.js): node editor/test/gen_test.js <рабочий каталог> [зёрен на тип]
// 1. детерминизм: одинаковые параметры и зерно -> побайтно одинаковый блок уровня;
// 2. для N зёрен каждого типа (поле боя на ландшафтах 1/2/4, крепость, подземелье; люди и кунги): заготовка построена,
//    «Проверка» редактора без ошибок, связность (базы / пленники / выход - поиск в ширину по проходимости, пересчитывается здесь заново),
//    все пары соседних тайлов есть в выученной статистике, ожидания сценария выполнены;
// 3. экспорт: блок .bin и каталог читаются обратно без изменений; каталоги пишутся в <рабочий каталог>/gen/ для tools/levels.py import.
'use strict';
global.window = {};
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const ED = path.join(__dirname, '..');
require(path.join(ED, 'data', 'brdata.js')); require(path.join(ED, 'data', 'gendata.js'));
const C = require(path.join(ED, 'js', 'core.js')), Gen = require(path.join(ED, 'js', 'gen.js'));
C.initGlyphs(window.BR_DATA.codeMain); C.initLibrary(window.BR_DATA.library);
const G = window.BR_GEN, LIB = C.library();
const work = process.argv[2], N = +(process.argv[3] || 110);
const deflate = u => new Uint8Array(zlib.deflateSync(u)), inflate = u => new Uint8Array(zlib.inflateSync(u));
const GO = i => i >= 1 && i < C.GO_MAX;
let fails = 0;
const fail = (...a) => { fails++; if (fails < 40) console.log('ОШИБКА', ...a); };

function independentChecks(p, lv, tag) {
  const m = lv.map, land = lv.script[C.HOFF.fsLAND];
  const errs = C.validate(lv).filter(r => r.level === 'error');
  if (errs.length) fail(tag, 'проверка редактора:', errs[0].msg);
  // пары соседей: клетки зданий -> условный тайл B; (0,0)=1 в подземелье - как у автора
  const M = Gen.modelFor(G, land);
  const tok = i => (land !== 3 && (m[i] >= 120 || C.buildingAt(m, i & 63, i >> 6))) ? G.B : m[i];
  const bad = Gen.unknownPairs(M, m, tok);
  if (bad.length) fail(tag, 'пары соседей не из статистики автора:', bad.length, JSON.stringify(bad[0]));
  const own = lv.heroes.filter(h => h.side === 0), pris = lv.heroes.filter(h => h.side >= 2);
  if (!own.length) fail(tag, 'нет своих героев');
  for (const h of lv.heroes) if (!GO(m[h.y * 64 + h.x])) fail(tag, 'герой на непроходимой клетке', JSON.stringify(h));
  if (lv.heroes.length > 98 || pris.length > 6) fail(tag, 'лимиты героев');
  if (p.type === 'dungeon') {
    if (land !== 3 || m[0] !== 1) fail(tag, 'подземелье: ландшафт 3 и MAP[0]=1');
    const d = Gen.bfs(i => GO(m[i]) || m[i] === 61 || m[i] === 63, own.map(h => h.y * 64 + h.x));
    for (const h of pris) if (![[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => d[(h.y + dy) * 64 + h.x + dx] >= 0)) fail(tag, 'пленник недостижим', JSON.stringify(h));
    const ex = []; for (let i = 0; i < 4096; i++) if (m[i] === 5) ex.push(i);
    if (!ex.length || ex.some(i => d[i] < 0)) fail(tag, 'выход (тайл 5) недостижим');
  } else {
    if (m[0] !== 0) fail(tag, 'поверхность: MAP[0] должен быть 0');
    const foes = lv.heroes.filter(h => h.side === 1);
    const d = Gen.bfs(i => GO(m[i]), own.map(h => h.y * 64 + h.x));
    for (const h of foes) if (![[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => d[(h.y + dy) * 64 + h.x + dx] >= 0)) { fail(tag, 'враг недостижим', JSON.stringify(h)); break; }
  }
}

(async () => {
  const t0 = Date.now();
  // 1. детерминизм
  for (const p of [{ type: 'battle', land: 2, seed: 4242 }, { type: 'fortress', land: 4, seed: 77, master: 1 }, { type: 'dungeon', seed: 9 }]) {
    const a = Gen.generate(C, G, LIB, p), b = Gen.generate(C, G, LIB, Object.assign({}, p));
    if (a.error || b.error || !C.eq(C.levelToBlock(a.lv), C.levelToBlock(b.lv))) fail('детерминизм', JSON.stringify(p));
  }
  const c = Gen.generate(C, G, LIB, { type: 'battle', land: 2, seed: 4243 });
  const d = Gen.generate(C, G, LIB, { type: 'battle', land: 2, seed: 4242 });
  if (C.eq(c.lv.map, d.lv.map)) fail('разные зёрна дали одну карту');
  console.log('детерминизм: проверено');
  // 2. много зёрен
  fs.mkdirSync(path.join(work, 'gen'), { recursive: true });
  fs.mkdirSync(path.join(work, 'gen_js'), { recursive: true });
  const stat = {};
  for (const type of ['battle', 'fortress', 'dungeon']) {
    const st = stat[type] = { n: 0, err: 0, att: 0, ms: 0, scen: {} };
    for (let s = 1; s <= N; s++) {
      const p = { type, seed: s * 7919 + 13, land: [1, 2, 4][s % 3], master: s % 4 === 0 ? 1 : 0 };
      if (type === 'dungeon' && s % 5 === 0) p.scenario = p.master ? 'kung_12' : 'human_10';    // сценарии с зашитыми координатами выхода
      const t1 = Date.now();
      const r = Gen.generate(C, G, LIB, p);
      st.ms += Date.now() - t1; st.n++;
      if (r.error) { st.err++; fail(type, s, r.error, JSON.stringify(r.report.tries.slice(-3))); continue; }
      st.att += r.report.attempts;
      st.scen[r.report.scenario.kind] = (st.scen[r.report.scenario.kind] || 0) + 1;
      const tag = `${type} seed=${p.seed} land=${p.land} master=${p.master}`;
      independentChecks(p, r.lv, tag);
      const bad = r.report.checks.filter(x => !x.ok && !x.soft);
      if (bad.length) fail(tag, 'проверка генератора:', bad[0].msg);
      // 3. экспорт и обратно
      const blk = C.levelToBlock(r.lv);
      if (!C.eq(C.levelToBlock(C.levelFromBlock(blk, r.lv.name)), blk)) fail(tag, '.bin не читается обратно без изменений');
      if (s <= 12) {
        const files = await C.levelToFolder(r.lv, deflate);
        const back = await C.levelFromFolder(files, r.lv.name, inflate);
        if (!C.eq(C.levelToBlock(back), blk)) fail(tag, 'каталог не читается обратно без изменений');
        const nm = `${type}_${s}`, dir = path.join(work, 'gen', nm);
        fs.mkdirSync(dir, { recursive: true });
        for (const [f, u] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), u);
        fs.writeFileSync(path.join(work, 'gen_js', nm + '.bin'), blk);
      }
    }
    console.log(`${type}: ${st.n} зёрен, не построено ${st.err}, попыток в среднем ${(st.att / Math.max(1, st.n - st.err)).toFixed(2)}, ` +
      `${Math.round(st.ms / st.n)} мс на заготовку, сценарии ${JSON.stringify(st.scen)}`);
  }
  console.log(`генератор: ${fails ? 'ОШИБОК ' + fails : 'всё в порядке'} (${((Date.now() - t0) / 1000).toFixed(0)} с)`);
  process.exit(fails ? 1 : 0);
})();
