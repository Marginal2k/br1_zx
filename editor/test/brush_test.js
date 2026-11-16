// Проверка умных кистей (js/gen.js brushStroke): node editor/test/brush_test.js [штрихов]
// 1. мост: на чистой карте через прямую реку шириной 3/4/5 на ландшафтах 1/2/4 дорога ставит мост 3 клетки поперёк, без потерь;
// 2. штрихи «как рукой» (дорога, река 3..5, стирание) по встроенным уровням игры:
//    детерминизм по зерну, карта уровня не меняется, новых пар соседей не из статистики автора нет,
//    здания, ограды и рамка не тронуты, всё изменённое - рядом со штрихом, «Проверка» не даёт новых ошибок,
//    клеток штриха, оставшихся прежними, в среднем не больше 5 на штрих;
// 3. стирание: нарисованная дорога стирается тем же штрихом;
// 4. «Перерисовать»: на всех встроенных уровнях (и в подземелье) классы клеток сохраняются, признак подземелья на месте.
'use strict';
global.window = {};
const path = require('path');
const ED = path.join(__dirname, '..');
require(path.join(ED, 'data', 'brdata.js')); require(path.join(ED, 'data', 'gendata.js'));
const C = require(path.join(ED, 'js', 'core.js')), Gen = require(path.join(ED, 'js', 'gen.js'));
C.initGlyphs(window.BR_DATA.codeMain); C.initLibrary(window.BR_DATA.library);
const G = window.BR_GEN, N = +(process.argv[2] || 150);
const SAMPLES = window.BR_DATA.samples.map(s => C.levelFromBlock(C.b64dec(s.block), s.name));
let fails = 0;
const fail = (...a) => { fails++; if (fails < 40) console.log('ОШИБКА', ...a); };
const landOf = lv => lv.script[C.HOFF.fsLAND];
const tokOf = (lv, m) => i => (landOf(lv) !== 3 && (m[i] >= 120 || C.buildingAt(m, i & 63, i >> 6))) ? G.B : (i === 0 && landOf(lv) === 3 && m[0] === 1 ? 1 : m[i]);
const pairKeys = (lv, m) => new Set(Gen.unknownPairs(Gen.modelFor(G, landOf(lv)), m, tokOf(lv, m)).map(b => b.x + ',' + b.y + b.d));
const clsAt = (lv, m, i) => { const M = Gen.modelFor(G, landOf(lv)), k = M.index.get(tokOf(lv, m)(i)); return k === undefined ? -1 : M.classes[M.cls[k]]; };
const SOLID = new Set(['border', 'building', 'fence', 'paveh', 'pavek']);

// 1. мост на чистой карте
for (const land of [1, 2, 4]) for (const w of [3, 4, 5]) for (const hor of [true, false]) {
  const lv = C.cloneLevel(SAMPLES.find(l => landOf(l) === 1)); lv.script[C.HOFF.fsLAND] = land; lv.heroes = [];
  for (let i = 0; i < 4096; i++) { const x = i & 63, y = i >> 6; lv.map[i] = x === 0 || y === 0 || x === 63 || y === 63 ? 0 : 1; }
  const river = Gen.brushStroke(C, G, lv, { kind: 'river', width: w, points: hor ? [{ x: 4, y: 30 }, { x: 59, y: 30 }] : [{ x: 30, y: 4 }, { x: 30, y: 59 }], seed: 1 });
  if (river.error || river.lost) { fail('мост: река', land, w, river.error || river.notes); continue; }
  lv.map = river.map;
  const road = Gen.brushStroke(C, G, lv, { kind: 'road', points: hor ? [{ x: 20, y: 8 }, { x: 20, y: 52 }] : [{ x: 8, y: 20 }, { x: 52, y: 20 }], seed: 1 });
  if (road.error || road.lost) { fail('мост: дорога', land, w, road.error || road.notes); continue; }
  let nb = 0; for (let i = 0; i < 4096; i++) if (clsAt(lv, road.map, i) === 'bridge') nb++;
  if (nb !== 3 * w) fail('мост: клеток моста', nb, 'вместо', 3 * w, 'ландшафт', land, 'ширина', w);
  if (pairKeys(lv, road.map).size) fail('мост: пары не из статистики', land, w);
}
console.log('мост через прямую реку: ландшафты 1/2/4, ширина 3/4/5, поперёк и вдоль - проверено');

// 2. штрихи «как рукой»
const OUT = SAMPLES.filter(l => landOf(l) !== 3), rng = Gen.RNG(20261116), ri = (a, b) => a + Math.floor(rng.f() * (b - a + 1));
let lostSum = 0, strokes = 0, maxMs = 0, sumMs = 0, nothing = 0;
for (let k = 0; k < N; k++) {
  const lv = OUT[k % OUT.length], kind = k % 3 === 0 ? 'road' : 'river', erase = k % 7 === 6;
  const pts = []; let x = ri(4, 59), y = ri(4, 59); const ang = rng.f() * 6.283;
  for (let s = 0; s < 5; s++) { pts.push({ x, y }); const a = ang + (rng.f() - 0.5) * 1.2; x = Math.max(2, Math.min(61, Math.round(x + Math.cos(a) * 9))); y = Math.max(2, Math.min(61, Math.round(y + Math.sin(a) * 9))); }
  const op = { kind, erase, points: pts, width: ri(3, 5), seed: k + 1 }, before = Uint8Array.from(lv.map);
  const t0 = Date.now(), r = Gen.brushStroke(C, G, lv, op), dt = Date.now() - t0;
  const tag = `${lv.name} #${k} ${kind}${erase ? ' стереть' : ''} ${JSON.stringify(pts)}`;
  if (!before.every((v, i) => v === lv.map[i])) fail(tag, 'карта уровня изменена');
  if (r.error) { if (/ничего не меняет/.test(r.error)) { nothing++; continue; } fail(tag, r.error); continue; }
  strokes++; lostSum += r.lost; maxMs = Math.max(maxMs, dt); sumMs += dt;
  const r2 = Gen.brushStroke(C, G, lv, Object.assign({}, op, { points: pts.map(p => Object.assign({}, p)) }));
  if (!r2.map || !r2.map.every((v, i) => v === r.map[i])) fail(tag, 'не детерминировано');
  const old = pairKeys(lv, lv.map), now = [...pairKeys(lv, r.map)].filter(q => !old.has(q));
  if (now.length) fail(tag, 'новые пары не из статистики автора:', now.length, now[0]);
  // что изменилось: здания, ограды, рамка - нет; всё - не дальше 14 клеток от штриха (полоса 6 и мост до 12)
  const p4 = Gen.path4(pts);
  for (let i = 0; i < 4096; i++) if (r.map[i] !== lv.map[i]) {
    const c = clsAt(lv, lv.map, i), xx = i & 63, yy = i >> 6;
    if (SOLID.has(c)) { fail(tag, 'изменена клетка класса', c, xx, yy); break; }
    if (!p4.some(p => Math.abs(p.x - xx) <= 14 && Math.abs(p.y - yy) <= 14)) { fail(tag, 'изменена клетка вдали от штриха', xx, yy); break; }
  }
  const e0 = C.validate(lv).filter(q => q.level === 'error').length, lv2 = C.cloneLevel(lv); lv2.map = r.map;
  const e1 = C.validate(lv2).filter(q => q.level === 'error').length;
  if (e1 > e0) fail(tag, '«Проверка»: новых ошибок', e1 - e0);
}
const avgLost = lostSum / Math.max(1, strokes);
console.log(`штрихов ${strokes} (ничего не меняли ${nothing}), клеток штриха осталось прежними в среднем ${avgLost.toFixed(2)}, время в среднем ${Math.round(sumMs / Math.max(1, strokes))} мс, наибольшее ${maxMs} мс`);
if (avgLost > 5) fail('слишком много клеток штриха остались прежними:', avgLost.toFixed(2));
if (maxMs > 5000) fail('штрих дольше 5 с:', maxMs);

// 2б. «Покрытие» по всем встроенным уровням, в том числе в подземелье: новых пар не из статистики нет, здания/ограды/рамка не тронуты
{
  let lost = 0, n = 0;
  for (let k = 0; k < 60; k++) {
    const lv = SAMPLES[k % SAMPLES.length], dun = landOf(lv) === 3, list = Gen.PAINT_CLASSES[dun ? 'dungeon' : 'outdoor'];
    const pts = []; let x = ri(4, 59), y = ri(4, 59); const ang = rng.f() * 6.283;
    for (let s = 0; s < 4; s++) { pts.push({ x, y }); const a = ang + (rng.f() - 0.5) * 1.2; x = Math.max(2, Math.min(61, Math.round(x + Math.cos(a) * 8))); y = Math.max(2, Math.min(61, Math.round(y + Math.sin(a) * 8))); }
    const op = { kind: 'paint', cls: list[k % list.length], erase: k % 5 === 4, width: ri(1, 5), points: pts, seed: k + 7 };
    const r = Gen.brushStroke(C, G, lv, op), tag = `покрытие ${lv.name} #${k} ${JSON.stringify(op)}`;
    if (r.error) { if (!/ничего не меняет/.test(r.error)) fail(tag, r.error); continue; }
    n++; lost += r.lost;
    const old = pairKeys(lv, lv.map), now = [...pairKeys(lv, r.map)].filter(q => !old.has(q));
    if (now.length) fail(tag, 'новые пары не из статистики автора:', now.length);
    for (let i = 0; i < 4096; i++) if (r.map[i] !== lv.map[i] && (SOLID.has(clsAt(lv, lv.map, i)) && !(op.cls === clsAt(lv, lv.map, i) || /^pave/.test(op.cls) && /^pave/.test(clsAt(lv, lv.map, i))) || ['door', 'exit'].includes(clsAt(lv, lv.map, i)))) { fail(tag, 'изменена клетка', clsAt(lv, lv.map, i), i & 63, i >> 6); break; }
    if (dun && r.map[0] !== lv.map[0]) fail(tag, 'признак подземелья');
  }
  console.log(`покрытие: штрихов ${n}, клеток штриха осталось прежними в среднем ${(lost / Math.max(1, n)).toFixed(2)}`);
  if (lost / Math.max(1, n) > 5) fail('покрытие: слишком много клеток штриха остались прежними');
  const d = SAMPLES.find(l => landOf(l) === 3), rr = Gen.brushStroke(C, G, d, { kind: 'road', points: [{ x: 5, y: 5 }, { x: 20, y: 5 }], seed: 1 });
  if (!rr.error) fail('подземелье: дорога должна быть запрещена');
}

// 3. стирание дороги тем же штрихом
{
  const lv = C.cloneLevel(OUT[0]), pts = [{ x: 8, y: 30 }, { x: 20, y: 28 }];
  const a = Gen.brushStroke(C, G, lv, { kind: 'road', points: pts, seed: 5 });
  if (a.error) fail('стирание: дорога', a.error);
  else {
    lv.map = a.map;
    const b = Gen.brushStroke(C, G, lv, { kind: 'road', erase: true, points: pts, seed: 6 });
    if (b.error) fail('стирание:', b.error);
    else { const left = Gen.path4(pts).filter(p => clsAt(lv, b.map, p.y * 64 + p.x) === 'road').length; if (left) fail('стирание: осталось клеток дороги', left); }
  }
}
console.log('стирание дороги - проверено');

// 4. «Перерисовать» на всех встроенных уровнях
for (const lv of SAMPLES) {
  const r = Gen.brushStroke(C, G, lv, { kind: 'area', points: [{ x: 8, y: 8 }, { x: 40, y: 36 }], seed: 3 });
  if (r.error) { fail('перерисовать', lv.name, r.error); continue; }
  let diff = 0; for (let i = 0; i < 4096; i++) if (clsAt(lv, lv.map, i) !== clsAt(lv, r.map, i)) diff++;
  if (diff > 8) fail('перерисовать', lv.name, 'клеток сменили класс:', diff);
  if (landOf(lv) === 3 && r.map[0] !== lv.map[0]) fail('перерисовать', lv.name, 'признак подземелья');
  const old = pairKeys(lv, lv.map), now = [...pairKeys(lv, r.map)].filter(q => !old.has(q));
  if (now.length) fail('перерисовать', lv.name, 'новые пары не из статистики:', now.length);
}
console.log('перерисовать: все встроенные уровни - проверено');
console.log(fails ? `КИСТИ: ОШИБОК ${fails}` : 'КИСТИ: ВСЁ ВЕРНО');
process.exit(fails ? 1 : 0);
