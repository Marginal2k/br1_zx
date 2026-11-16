/* Генератор заготовок уровней «Чёрного Ворона» (без DOM, работает и в node).

   Два слоя:
   1. Слой смыслов - сетка классов 64x64 (трава, вода, лес, площадь базы, здание, пол, стена, скала...). Местность - шум высоты/влажности,
      скалы подземелья - клеточный автомат, подземелье - разбиение на комнаты (BSP), камеры, двери; базы, шахты, проход между базами.
   2. Слой тайлов - Wave Function Collapse (simple tiled model) по парам соседей, выученным на картах автора (data/gendata.js,
      tools/make_gen.py): в клетке класса K допустимы только тайлы класса K, пара соседей допустима, только если она была у автора;
      вариант тайла выбирается по частоте у автора в том же окружении классов. При противоречии - локальный сброс области
      (растущий квадрат), затем ослабление класса в этой области; если не вышло - новая попытка с другим внутренним зерном.
   Здания ставятся целиком (core.placeBuilding), в слое тайлов это один условный тайл B.

   Общая часть (RNG, шум, модель, WFC) не знает про BR1: на входе таблица тайлов, классы, пары соседей и частоты.
   BR1-часть: generate(core, G, lib, params). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BRGen = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ================================================================== общая часть
  function hash32(a, b) {
    let h = Math.imul((a >>> 0) ^ 0x9E3779B9, 0x85EBCA6B) ^ Math.imul((b >>> 0) + 0x632BE5AB, 0xC2B2AE35);
    h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15;
    return h >>> 0;
  }
  function RNG(seed) {
    let s = seed >>> 0;
    const f = () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      f, int: n => Math.floor(f() * n), range: (a, b) => a + Math.floor(f() * (b - a + 1)), pick: a => a[Math.floor(f() * a.length)],
      weighted(w) { let sum = 0; for (const x of w) sum += x; let r = f() * sum; for (let i = 0; i < w.length; i++) { r -= w[i]; if (r < 0) return i; } return w.length - 1; },
      shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(f() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
    };
  }
  const sm = t => t * t * (3 - 2 * t);
  function valueNoise(rng, cell) {
    const n = Math.ceil(64 / cell) + 2, g = new Float32Array(n * n);
    for (let i = 0; i < g.length; i++) g[i] = rng.f();
    return (x, y) => {
      const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy), tx = sm(fx - ix), ty = sm(fy - iy);
      const a = g[iy * n + ix], b = g[iy * n + ix + 1], c = g[(iy + 1) * n + ix], d = g[(iy + 1) * n + ix + 1];
      return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    };
  }
  function fbm(rng, cells) {
    const ns = cells.map(c => valueNoise(rng, c));
    return (x, y) => { let s = 0, a = 1, t = 0; for (const n of ns) { s += a * n(x, y); t += a; a *= 0.5; } return s / t; };
  }
  const pop32 = v => { v -= (v >>> 1) & 0x55555555; v = (v & 0x33333333) + ((v >>> 2) & 0x33333333); return (((v + (v >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24; };
  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];          // n e s w
  const OPP = [2, 3, 0, 1];

  /** модель из выученных данных одного ландшафта: {tiles, cls, freq, classes, adjR, adjD, sig} */
  function buildModel(L) {
    const K = L.tiles.length, W = (K + 31) >> 5;
    const mk = () => Array.from({ length: K }, () => new Uint32Array(W));
    const comp = [mk(), mk(), mk(), mk()];       // comp[d][a] - какие тайлы бывают со стороны d от тайла a
    const set = (m, b) => { m[b >> 5] |= 1 << (b & 31); };
    for (const [a, b] of L.adjR) { set(comp[1][a], b); set(comp[3][b], a); }
    for (const [a, b] of L.adjD) { set(comp[2][a], b); set(comp[0][b], a); }
    const classMask = L.classes.map(() => new Uint32Array(W));
    L.cls.forEach((c, t) => set(classMask[c], t));
    const index = new Map(L.tiles.map((t, k) => [t, k]));
    const pairs = [new Set(L.adjR.map(([a, b]) => a * 1024 + b)), new Set(L.adjD.map(([a, b]) => a * 1024 + b))];
    return { K, W, tiles: L.tiles, cls: L.cls, freq: L.freq, classes: L.classes, comp, classMask, index, sig: L.sig, sigCache: new Map(), pairs };
  }

  /**
   * WFC: cg - класс каждой клетки (Uint8Array 64*64), fixed - заданный тайл модели или -1. Возвращает {tiles, resets, relaxed} или null.
   * opt.local (кисти): закреплённые клетки только ограничивают соседей, сами не проверяются (на карте пользователя между ними
   * бывают пары не из статистики); fixed = -2 - тайл вне модели, соседей не ограничивает; opt.hard[i] - класс клетки не ослабляется;
   * opt.allow (Int32Array 4096*W) и opt.hasAllow[i] - дополнительное сужение тайлов клетки (пока класс не ослаблен).
   */
  function wfc(M, cg, fixed, rng, opt) {
    opt = opt || {};
    const { K, W, comp, classMask } = M, N = 4096, maxResets = opt.maxResets || 400, BORDER = opt.borderClass || 0;
    const D = new Int32Array(N * W), cnt = new Uint16Array(N), relax = new Uint8Array(N), fails = new Uint16Array(256);
    const prio = new Float32Array(N); for (let i = 0; i < N; i++) prio[i] = rng.f() * 0.5;
    const NC = M.classes.length, noRelax = (opt.noRelax || []).map(n => M.classes.indexOf(n)), LOCAL = !!opt.local, hard = opt.hard;
    // куча клеток по (число вариантов + случайная добавка) с ленивым удалением устаревших записей
    const hk = [], hi = [];
    function hpush(i) {
      const k = cnt[i] + prio[i]; let n = hk.length; hk.push(k); hi.push(i);
      while (n) { const q = (n - 1) >> 1; if (hk[q] <= k) break; hk[n] = hk[q]; hi[n] = hi[q]; n = q; }
      hk[n] = k; hi[n] = i;
    }
    function hpop() {
      while (hk.length) {
        const k = hk[0], i = hi[0], lk = hk.pop(), li = hi.pop();
        if (hk.length) {
          let n = 0; const L = hk.length;
          for (;;) { const a = 2 * n + 1, b = a + 1; let m = n, mk = lk;
            if (a < L && hk[a] < mk) { m = a; mk = hk[a]; } if (b < L && hk[b] < mk) { m = b; }
            if (m === n) break; hk[n] = hk[m]; hi[n] = hi[m]; n = m; }
          hk[n] = lk; hi[n] = li;
        }
        if (cnt[i] > 1 && k === cnt[i] + prio[i]) return i;
      }
      return -1;
    }
    function init(i) {
      const o = i * W;
      if (fixed[i] >= 0) { for (let w = 0; w < W; w++) D[o + w] = 0; D[o + (fixed[i] >> 5)] = 1 << (fixed[i] & 31); cnt[i] = 1; return; }
      if (fixed[i] === -2) { for (let w = 0; w < W; w++) D[o + w] = -1; cnt[i] = 1; return; }
      const r = relax[i];
      if (r === 1 && opt.allow2 && opt.allow2Has[i]) {      // первая ступень ослабления: без правил сторон, но в своём классе и семействе
        const m = classMask[cg[i]]; for (let w = 0; w < W; w++) D[o + w] = m[w] & opt.allow2[o + w];
      } else if (!r) { const m = classMask[cg[i]]; for (let w = 0; w < W; w++) D[o + w] = m[w]; if (opt.hasAllow && opt.hasAllow[i]) for (let w = 0; w < W; w++) D[o + w] &= opt.allow[o + w]; }
      else {
        for (let w = 0; w < W; w++) D[o + w] = 0;
        const x = i & 63, y = i >> 6, seen = new Uint8Array(NC);
        for (let yy = Math.max(0, y - r); yy <= Math.min(63, y + r); yy++) for (let xx = Math.max(0, x - r); xx <= Math.min(63, x + r); xx++) seen[cg[yy * 64 + xx]] = 1;
        for (let c = 0; c < NC; c++) if ((seen[c] || r >= 3) && c !== BORDER && !noRelax.includes(c)) { const m = classMask[c]; for (let w = 0; w < W; w++) D[o + w] |= m[w]; }
      }
      let n = 0; for (let w = 0; w < W; w++) n += pop32(D[o + w]); cnt[i] = n;
      if (n > 1) hpush(i);
    }
    const stack = new Int32Array(N), inS = new Uint8Array(N); let sp = 0;
    const push = i => { if (!inS[i]) { inS[i] = 1; stack[sp++] = i; } };
    const tmp = new Uint32Array(W);
    function propagate() {
      while (sp) {
        const i = stack[--sp]; inS[i] = 0;
        const o = i * W, x = i & 63, y = i >> 6;
        for (let d = 0; d < 4; d++) {
          const xx = x + DX[d], yy = y + DY[d];
          if (xx < 0 || yy < 0 || xx > 63 || yy > 63) continue;
          const j = yy * 64 + xx, oj = j * W, cd = comp[d];
          if (LOCAL && fixed[j] !== -1) continue;
          tmp.fill(0);
          for (let w = 0; w < W; w++) {
            let bits = D[o + w];
            while (bits) { const b = 31 - Math.clz32(bits & -bits); bits &= bits - 1; if ((w << 5) + b >= K) break; const m = cd[(w << 5) + b]; for (let v = 0; v < W; v++) tmp[v] |= m[v]; }
          }
          let ch = false, n = 0;
          for (let w = 0; w < W; w++) { const nv = D[oj + w] & tmp[w]; if (nv !== D[oj + w]) { D[oj + w] = nv; ch = true; } n += pop32(nv); }
          if (ch) { cnt[j] = n; if (!n) { sp = 0; inS.fill(0); return j; } if (n > 1) hpush(j); push(j); }
        }
      }
      return -1;
    }
    for (let i = 0; i < N; i++) init(i);
    let resets = 0, relaxed = 0;
    function repair(c) {
      for (;;) {
        if (opt.trace) opt.trace.push(c);
        if (++resets > maxResets) return false;
        const cx = c & 63, cy = c >> 6, key = (cy >> 2) * 16 + (cx >> 2), k = ++fails[key];
        const r = Math.min(1 + k, 14), up = k > 3;
        for (let y = Math.max(0, cy - r); y <= Math.min(63, cy + r); y++) for (let x = Math.max(0, cx - r); x <= Math.min(63, cx + r); x++) {
          const i = y * 64 + x;
          if (fixed[i] !== -1) continue;
          const dd = Math.max(Math.abs(x - cx), Math.abs(y - cy)), isHard = hard && hard[i];
          // клетки штриха (hard) уступают позже и только рядом с противоречием
          if (up && !(isHard && (hard[i] > 1 || k <= 8 || dd > 1)) && cg[i] !== BORDER && relax[i] < 3 && dd <= 2 + (k >> 1)) { relax[i]++; relaxed++; }
          init(i);
        }
        // полное распространение: прерванное противоречием могло оставить суженные, но не переданные соседям клетки
        for (let i = 0; i < N; i++) push(i);
        c = propagate();
        if (c < 0) return true;
      }
    }
    for (let i = 0; i < N; i++) push(i);
    let c = propagate();
    if (c >= 0 && !repair(c)) return null;
    const wbuf = new Float64Array(K);
    function weightsAt(i) {
      const x = i & 63, y = i >> 6, nc = d => { const xx = x + DX[d], yy = y + DY[d]; return xx < 0 || yy < 0 || xx > 63 || yy > 63 ? BORDER : cg[yy * 64 + xx]; };
      const key = cg[i] + ',' + nc(0) + ',' + nc(1) + ',' + nc(2) + ',' + nc(3);
      let a = M.sigCache.get(key);
      if (!a) {
        a = new Float64Array(K);
        const s = M.sig[key];
        if (s) for (const [t, n] of s) a[t] = n;
        for (let t = 0; t < K; t++) a[t] += 0.002 * M.freq[t];
        M.sigCache.set(key, a);
      }
      return a;
    }
    for (;;) {
      const best = hpop();
      if (best < 0) break;
      const o = best * W, a = weightsAt(best);
      let sum = 0;
      for (let t = 0; t < K; t++) { wbuf[t] = (D[o + (t >> 5)] >>> (t & 31)) & 1 ? a[t] : 0; sum += wbuf[t]; }
      let r = rng.f() * sum, pick = -1;
      for (let t = 0; t < K; t++) if (wbuf[t]) { pick = t; r -= wbuf[t]; if (r < 0) break; }
      for (let w = 0; w < W; w++) D[o + w] = 0;
      D[o + (pick >> 5)] = 1 << (pick & 31); cnt[best] = 1;
      push(best);
      c = propagate();
      if (c >= 0 && !repair(c)) return null;
    }
    const tiles = new Int16Array(N);
    for (let i = 0; i < N; i++) { const o = i * W; let t = -1; for (let w = 0; w < W && t < 0; w++) if (D[o + w]) t = (w << 5) + 31 - Math.clz32(D[o + w] & -D[o + w]); tiles[i] = t; }
    return { tiles, resets, relaxed };
  }

  /** пары соседей, которых нет в выученной статистике (для проверки): [{x, y, d, a, b}] (тайлы игры) */
  function unknownPairs(M, map, tokenOf) {
    const out = [];
    const k = i => M.index.get(tokenOf(i));
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const i = y * 64 + x, a = k(i);
      if (x < 63) { const b = k(i + 1); if (a === undefined || b === undefined || !M.pairs[0].has(a * 1024 + b)) out.push({ x, y, d: 'e', a: tokenOf(i), b: tokenOf(i + 1) }); }
      if (y < 63) { const b = k(i + 64); if (a === undefined || b === undefined || !M.pairs[1].has(a * 1024 + b)) out.push({ x, y, d: 's', a: tokenOf(i), b: tokenOf(i + 64) }); }
    }
    return out;
  }

  // ---------------------------------------------------------------- сетки: связность, морфология
  function bfs(pass, starts) {
    const dist = new Int16Array(4096).fill(-1), q = new Int32Array(4096);
    let h = 0, tl = 0;
    for (const s of starts) if (pass(s) && dist[s] < 0) { dist[s] = 0; q[tl++] = s; }
    while (h < tl) {
      const i = q[h++], x = i & 63, y = i >> 6;
      for (let d = 0; d < 4; d++) {
        const xx = x + DX[d], yy = y + DY[d], j = yy * 64 + xx;
        if (xx < 0 || yy < 0 || xx > 63 || yy > 63 || dist[j] >= 0 || !pass(j)) continue;
        dist[j] = dist[i] + 1; q[tl++] = j;
      }
    }
    return dist;
  }
  /** путь минимальной стоимости (Дейкстра на сетке 4-связности): cost(i) - цена входа в клетку, Infinity - нельзя */
  function cheapestPath(cost, from, to) {
    const dist = new Float64Array(4096).fill(Infinity), prev = new Int32Array(4096).fill(-1), done = new Uint8Array(4096);
    dist[from] = 0;
    const heap = [[0, from]];
    const up = () => { let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const down = () => { let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } };
    while (heap.length) {
      const [dv, i] = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; down(); }
      if (done[i]) continue; done[i] = 1;
      if (i === to) break;
      const x = i & 63, y = i >> 6;
      for (let d = 0; d < 4; d++) {
        const xx = x + DX[d], yy = y + DY[d];
        if (xx < 1 || yy < 1 || xx > 62 || yy > 62) continue;
        const j = yy * 64 + xx, nd = dv + cost(j);
        if (nd < dist[j]) { dist[j] = nd; prev[j] = i; heap.push([nd, j]); up(); }
      }
    }
    if (!isFinite(dist[to])) return null;
    const path = []; for (let i = to; i >= 0; i = prev[i]) path.push(i);
    return path.reverse();
  }
  /** открытие маски (эрозия + наращивание, крест 3x3): убирает перешейки и выступы толщиной 1 */
  function openMask(m, keep) {
    const e = new Uint8Array(4096), o = new Uint8Array(4096);
    for (let i = 0; i < 4096; i++) {
      if (!m[i]) continue;
      const x = i & 63, y = i >> 6;
      let ok = true;
      for (let d = 0; d < 4 && ok; d++) { const xx = x + DX[d], yy = y + DY[d]; if (xx >= 0 && yy >= 0 && xx < 64 && yy < 64 && !m[yy * 64 + xx] && !(keep && keep[yy * 64 + xx])) ok = false; }
      e[i] = ok ? 1 : 0;
    }
    for (let i = 0; i < 4096; i++) {
      if (!m[i]) continue;
      if (e[i]) { o[i] = 1; continue; }
      const x = i & 63, y = i >> 6;
      for (let d = 0; d < 4; d++) { const xx = x + DX[d], yy = y + DY[d]; if (xx >= 0 && yy >= 0 && xx < 64 && yy < 64 && e[yy * 64 + xx]) { o[i] = 1; break; } }
    }
    return o;
  }
  function dropSmall(m, minSize) {
    const seen = new Uint8Array(4096);
    for (let i = 0; i < 4096; i++) {
      if (!m[i] || seen[i]) continue;
      const comp = [i]; seen[i] = 1;
      for (let k = 0; k < comp.length; k++) {
        const j = comp[k], x = j & 63, y = j >> 6;
        for (let d = 0; d < 4; d++) { const xx = x + DX[d], yy = y + DY[d], n = yy * 64 + xx; if (xx >= 0 && yy >= 0 && xx < 64 && yy < 64 && m[n] && !seen[n]) { seen[n] = 1; comp.push(n); } }
      }
      if (comp.length < minSize) for (const j of comp) m[j] = 0;
    }
    return m;
  }
  function quantile(vals, q) { const a = Float64Array.from(vals).sort(); return a.length ? a[Math.min(a.length - 1, Math.max(0, Math.floor(q * a.length)))] : 0; }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ================================================================== BR1
  // перевод сообщений (как в core.js): ключ - русский текст с {подстановками}
  const fmt = (s, v) => v ? s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : s;
  let tr = fmt;
  function setTranslator(f) { tr = f || fmt; }
  const SHIFT = [1, 65, 64, 63, -1, -65, -64, -63];
  const GO_MAX = 52;
  const TYPES = ['battle', 'fortress', 'dungeon'];
  const DEFAULTS = {
    battle: { land: 1, master: 0, water: 12, forest: 22, dist: 40, mines: 4, own: 8, enemy: 14, prisoners: 0, fence: true, barriers: 1, fill: true, maxEmpty: 6 },
    fortress: { land: 1, master: 0, water: 8, forest: 18, dist: 36, mines: 3, own: 10, enemy: 18, prisoners: 3, fence: true, barriers: 1, fill: true, maxEmpty: 6 },
    dungeon: { land: 3, master: 0, rooms: 8, own: 8, enemy: 16, prisoners: 3, cave: 40, maxEmpty: 4 }
  };

  const models = new Map();
  function modelFor(G, land) {
    if (!models.has(G)) models.set(G, {});
    const mm = models.get(G);
    if (!mm[land]) mm[land] = buildModel(G.lands[String(land)]);
    return mm[land];
  }
  function lp(G, key) { return (G.heroes[key] || []).filter(([t]) => t < 22 && t !== 7 && t !== 16 && t !== 1 && t !== 2 && t !== 10 && t !== 11); }

  /** сценарии библиотеки, подходящие к типу заготовки: [{name, kind, ok, note, s}] */
  function scenariosFor(G, type, master) {
    const out = [];
    for (const s of G.scenarios) {
      if (s.master !== master) continue;
      let ok = null;
      if (type === 'dungeon') {
        if (s.kind === 'tunnel' || (s.kind === 'reach' && s.land === 3)) ok = true;
        else if (s.kind === 'kill_all') ok = 'kill';
      } else {
        if (s.kind === 'kill_all' && s.land !== 3) ok = true;
        else if (s.kind === 'build' && master === 0) ok = true;
        else if (s.kind === 'destroy' && master === 0) ok = true;
        else if (s.kind === 'lost_hero') ok = true;
        else if (s.kind === 'reach' && s.land !== 3) ok = true;
      }
      if (ok) out.push(s);
    }
    return out;
  }

  // ---------------------------------------------------------------- план: поле боя / крепость
  function planBattle(G, M, p, rng) {
    const ci = n => M.classes.indexOf(n);
    const K = { border: ci('border'), grass: ci('grass'), road: ci('road'), water: ci('water'), forest: ci('forest'), fence: ci('fence'), bld: ci('building'),
      pave: [ci('paveh'), ci('pavek')] };
    const cg = new Uint8Array(4096).fill(K.grass), fixed = new Int16Array(4096).fill(-1);
    const B = M.index.get(G.B), T0 = M.index.get(0);
    const keep = new Uint8Array(4096);            // клетки, где местность не рисуется (базы, шахты, проход)
    const fort = p.type === 'fortress';
    // базы: свои и вражеские по разные стороны от центра на расстоянии dist
    const ang = rng.f() * Math.PI * 2, dist = clamp(p.dist, 16, 60) / 2;
    const own = p.master, foe = 1 - own;
    const bases = [];
    for (const side of [0, 1]) {
      const race = side === 0 ? own : foe, big = fort && side === 1;
      const w = big ? 16 : 12, h = big ? 12 : 9;
      const a = ang + (side ? Math.PI : 0);
      const cx = clamp(Math.round(32 + Math.cos(a) * dist), 3 + (w >> 1), 60 - (w >> 1)), cy = clamp(Math.round(32 + Math.sin(a) * dist), 3 + (h >> 1), 60 - (h >> 1));
      bases.push({ side, race, x0: cx - (w >> 1), y0: cy - (h >> 1), x1: cx - (w >> 1) + w - 1, y1: cy - (h >> 1) + h - 1, cx, cy, fort: big });
    }
    const inRect = (b, x, y, m) => x >= b.x0 - m && x <= b.x1 + m && y >= b.y0 - m && y <= b.y1 + m;
    for (const b of bases) for (let y = b.y0 - 3; y <= b.y1 + 3; y++) for (let x = b.x0 - 3; x <= b.x1 + 3; x++) if (x > 0 && y > 0 && x < 63 && y < 63) keep[y * 64 + x] = 1;
    // шахты: по одной у каждой базы, остальные - между
    const mines = [];
    const free3 = (x, y) => x >= 3 && y >= 3 && x <= 60 && y <= 60 && !bases.some(b => inRect(b, x, y, 5)) && !mines.some(m => Math.abs(m.x - x) < 7 && Math.abs(m.y - y) < 7);
    for (let k = 0; k < p.mines; k++) {
      let ok = false;
      for (let tr = 0; tr < 60 && !ok; tr++) {
        let x, y;
        if (k < 2) { const b = bases[k], a = rng.f() * Math.PI * 2, r = 10 + rng.int(5); x = Math.round(b.cx + Math.cos(a) * r); y = Math.round(b.cy + Math.sin(a) * r); }
        else { x = rng.range(6, 57); y = rng.range(6, 57); }
        if (free3(x, y)) { mines.push({ x, y }); ok = true; }
      }
    }
    for (const m of mines) for (let y = m.y - 2; y <= m.y + 2; y++) for (let x = m.x - 2; x <= m.x + 2; x++) keep[y * 64 + x] = 1;
    // местность: высота -> вода, влажность -> лес (мелочь и перешейки толщиной 1 убираются)
    const hN = fbm(rng, [20, 10, 5]), mN = fbm(rng, [14, 7, 3.5]);
    const hv = [], mv = [];
    for (let y = 1; y < 63; y++) for (let x = 1; x < 63; x++) if (!keep[y * 64 + x]) { hv.push(hN(x, y)); mv.push(mN(x, y)); }
    const thW = quantile(hv, p.water / 100), thF = quantile(mv, 1 - p.forest / 100);
    let water = new Uint8Array(4096), forest = new Uint8Array(4096);
    for (let y = 1; y < 63; y++) for (let x = 1; x < 63; x++) {
      const i = y * 64 + x;
      if (keep[i]) continue;
      if (p.water > 0 && hN(x, y) < thW) water[i] = 1;
      else if (p.forest > 0 && mN(x, y) > thF) forest[i] = 1;
    }
    water = dropSmall(openMask(openMask(water)), 14);
    forest = dropSmall(openMask(forest), 8);
    const [ob, eb] = bases;
    // преграды: полосы леса или воды поперёк линии баз во всю карту; проходы (ширина 3-4) - в стороне от прямой между базами
    const block = new Uint8Array(4096);
    {
      const dx = eb.cx - ob.cx, dy = eb.cy - ob.cy, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
      for (let b = 0; b < p.barriers; b++) {
        const t = (b + 1) / (p.barriers + 1), mx = ob.cx + dx * t, my = ob.cy + dy * t;
        const wob = valueNoise(rng, 8), useWater = rng.f() * (p.water + p.forest + 1) < p.water;
        const hw = useWater ? 2.3 : 1.7;
        const side = rng.f() < 0.5 ? -1 : 1;
        const gaps = [side * rng.range(9, 20)];
        if (p.barriers === 1 || rng.f() < 0.5) gaps.push(-side * rng.range(14, 26));
        for (let y = 1; y < 63; y++) for (let x = 1; x < 63; x++) {
          const i = y * 64 + x;
          if (keep[i]) continue;
          const along = (x - mx) * ux + (y - my) * uy + (wob(x, y) - 0.5) * 8, perp = (x - mx) * -uy + (y - my) * ux;
          if (Math.abs(along) > hw || gaps.some(g => Math.abs(perp - g) <= 2)) continue;
          block[i] = 1;
          if (useWater) { water[i] = 1; forest[i] = 0; } else { forest[i] = 1; water[i] = 0; }
        }
      }
    }
    // пустоты: место, дальше всего от любого объекта; туда - шахта (ресурсы, всего не больше 8), роща или озеро
    for (let it = 0; it < 30 && p.fill; it++) {
      const busy = [];
      for (let i = 0; i < 4096; i++) { const x = i & 63, y = i >> 6; if (keep[i] || water[i] || forest[i] || x === 0 || y === 0 || x === 63 || y === 63) busy.push(i); }
      const d = bfs(() => true, busy);
      let bi = -1, bv = 0;
      for (let i = 0; i < 4096; i++) if (d[i] > bv || (d[i] === bv && bi >= 0 && rng.f() < 0.3)) { bv = d[i]; bi = i; }
      if (bv <= p.maxEmpty) break;
      const x = bi & 63, y = bi >> 6;
      if (mines.length < 8 && free3(x, y) && rng.f() < 0.55) {
        mines.push({ x, y, extra: true });
        for (let yy = y - 2; yy <= y + 2; yy++) for (let xx = x - 2; xx <= x + 2; xx++) keep[yy * 64 + xx] = 1;
        continue;
      }
      const lake = p.water > 0 && rng.f() * (p.water + p.forest) < p.water, r = lake ? rng.range(3, 4) : rng.range(2, 4), wob = valueNoise(rng, 4);
      for (let yy = y - r - 1; yy <= y + r + 1; yy++) for (let xx = x - r - 1; xx <= x + r + 1; xx++) {
        if (xx < 2 || yy < 2 || xx > 61 || yy > 61) continue;
        const j = yy * 64 + xx;
        if (keep[j] || Math.hypot(xx - x, yy - y) > r + (wob(xx, yy) - 0.5) * 2.5) continue;
        if (lake) water[j] = 1; else forest[j] = 1;
      }
      if (lake) water = openMask(water);
    }
    // проход между базами: самый дешёвый путь (через преграды - только в проходах), вдоль него полоса шириной 5 без воды и леса, посредине - тропа
    const gate = b => { const o = bases[1 - b.side]; const dx = o.cx - b.cx, dy = o.cy - b.cy;
      return Math.abs(dx) > Math.abs(dy) ? { x: dx > 0 ? b.x1 + 1 : b.x0 - 1, y: b.cy, d: dx > 0 ? 1 : 3 } : { x: b.cx, y: dy > 0 ? b.y1 + 1 : b.y0 - 1, d: dy > 0 ? 2 : 0 }; };
    const g0 = gate(bases[0]), g1 = gate(bases[1]);
    const inBase = (x, y) => bases.some(b => inRect(b, x, y, 1));
    const cost = (j, wW, wF) => { if (block[j]) return 1e5; const x = j & 63, y = j >> 6; return (inBase(x, y) ? 50 : 0) + 1 + (water[j] ? wW : 0) + (forest[j] ? wF : 0) + rng.f() * 0.5; };
    const path = cheapestPath(j => cost(j, 8, 4), g0.y * 64 + g0.x, g1.y * 64 + g1.x);
    if (!path || path.some(i => block[i])) return null;
    const straight = Math.max(Math.abs(g0.x - g1.x), Math.abs(g0.y - g1.y));
    if (p.barriers && path.length < straight * 1.25) return null;          // путь почти по прямой - преграды не сработали
    const road = new Uint8Array(4096);
    const clear = (i, r) => { const x = i & 63, y = i >> 6; for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) if (xx > 0 && yy > 0 && xx < 63 && yy < 63) { const j = yy * 64 + xx; if (r < 2 && block[j]) continue; water[j] = 0; forest[j] = 0; } };
    for (const i of path) { road[i] = 1; clear(i, block[i] ? 1 : 2); }
    for (const m of mines) for (let y = m.y - 2; y <= m.y + 2; y++) for (let x = m.x - 2; x <= m.x + 2; x++) { const j = y * 64 + x; water[j] = 0; forest[j] = 0; }
    // ветки троп к шахтам (обходят преграды так же)
    for (const m of mines) {
      let bi = -1, bd = 1e9; path.forEach(i => { const d = Math.abs((i & 63) - m.x) + Math.abs((i >> 6) - m.y); if (d < bd) { bd = d; bi = i; } });
      const pp = cheapestPath(j => cost(j, 30, 6), bi, (m.y + 2) * 64 + m.x);
      if (!pp || pp.some(i => block[i])) return null;
      for (const i of pp) { road[i] = 1; clear(i, 1); }
    }
    water = dropSmall(openMask(openMask(water)), 10);
    forest = dropSmall(forest, 4);
    for (let i = 0; i < 4096; i++) { if (water[i]) cg[i] = K.water; else if (forest[i]) cg[i] = K.forest; }
    // база: площадь, ограда, здания
    const bcount = G.buildings[String(p.land)] || [];
    const raceB = r => bcount.filter(([c]) => r === 0 ? c >= 86 && c <= 93 : c >= 100 && c <= 107);
    const placed = [];
    for (const b of bases) {
      for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) cg[y * 64 + x] = K.pave[b.race];
      if (p.fence) {
        const gates = new Set();
        const gx = gate(b);
        for (let k = -1; k <= 1; k++) gates.add(gx.d & 1 ? (gx.y + k) * 64 + gx.x : gx.y * 64 + gx.x + k);
        if (!b.fort) {       // обычная база: ограда с воротами со всех сторон
          for (const [x, y] of [[b.cx, b.y0 - 1], [b.cx, b.y1 + 1], [b.x0 - 1, b.cy], [b.x1 + 1, b.cy]]) for (let k = -1; k <= 1; k++) { gates.add(y === b.cy ? (y + k) * 64 + x : y * 64 + x + k); }
        }
        for (let y = b.y0 - 1; y <= b.y1 + 1; y++) for (let x = b.x0 - 1; x <= b.x1 + 1; x++) {
          if (x > b.x0 - 1 && x < b.x1 + 1 && y > b.y0 - 1 && y < b.y1 + 1) continue;
          const i = y * 64 + x;
          cg[i] = gates.has(i) ? K.pave[b.race] : K.fence;
        }
      }
      // здания: ряды 3x3 через клетку
      const kinds = raceB(b.race);
      const want = b.fort ? 6 : (b.side === 0 ? 2 : 4);
      const spots = [];
      for (let y = b.y0 + 2; y + 1 <= b.y1 - 1; y += 4) for (let x = b.x0 + 2; x + 1 <= b.x1 - 1; x += 4) spots.push([x, y]);
      rng.shuffle(spots);
      const need = (p.target && b.side === 1) ? [p.target] : [];
      for (let k = 0; k < Math.min(want, spots.length); k++) {
        const [x, y] = spots[k];
        const center = need.length ? need.shift() : kinds.length ? kinds[rng.weighted(kinds.map(e => e[1]))][0] : (b.race ? 100 : 86);
        placed.push({ center, x, y, race: b.race, side: b.side });
        for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) { cg[yy * 64 + xx] = K.bld; fixed[yy * 64 + xx] = B; }
      }
      b.spots = spots;
    }
    for (const m of mines) {
      placed.push({ center: 78, x: m.x, y: m.y, mine: true });
      for (let y = m.y - 2; y <= m.y + 2; y++) for (let x = m.x - 2; x <= m.x + 2; x++) {
        const i = y * 64 + x;
        if (Math.abs(x - m.x) <= 1 && Math.abs(y - m.y) <= 1) { cg[i] = K.bld; fixed[i] = B; } else if (cg[i] !== K.road) cg[i] = K.grass;
      }
    }
    for (let i = 0; i < 4096; i++) if (road[i] && cg[i] === K.grass) cg[i] = K.road;
    for (let i = 0; i < 64; i++) for (const j of [i, 4032 + i, i * 64, i * 64 + 63]) { cg[j] = K.border; fixed[j] = T0; }
    return { cg, fixed, bases, mines, placed, path, g0, g1, K };
  }

  // ---------------------------------------------------------------- план: подземелье
  function planDungeon(G, M, p, rng, exitAt) {
    const ci = n => M.classes.indexOf(n);
    const K = { border: ci('border'), cave: ci('cave'), floor: ci('floor'), wall: ci('wall'), door: ci('door'), rock: ci('rock'), exit: ci('exit') };
    const cg = new Uint8Array(4096).fill(K.cave), fixed = new Int16Array(4096).fill(-1);
    const T0 = M.index.get(0), T5 = M.index.get(5), TD = M.index.get(61);
    const inner = (x, y, m) => x >= m && y >= m && x <= 63 - m && y <= 63 - m;
    // скалы: клеточный автомат (у краёв гуще, внутри - отдельные глыбы)
    let rock = new Uint8Array(4096);
    const dens = clamp(p.cave, 10, 70) / 100;
    for (let y = 1; y < 63; y++) for (let x = 1; x < 63; x++) {
      const e = Math.min(x, y, 63 - x, 63 - y);
      rock[y * 64 + x] = rng.f() < (e < 8 ? dens + 0.18 : dens - 0.04) ? 1 : 0;
    }
    for (let it = 0; it < 5; it++) {
      const n = new Uint8Array(4096);
      for (let y = 1; y < 63; y++) for (let x = 1; x < 63; x++) {
        let c = 0; for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) c += (xx < 1 || yy < 1 || xx > 62 || yy > 62) ? 1 : rock[yy * 64 + xx];
        n[y * 64 + x] = c >= 5 ? 1 : 0;
      }
      rock = n;
    }
    // зал: неровное пятно серого пола (как у автора), а не прямоугольник
    const fN = fbm(rng, [16, 8, 4]);
    const cx0 = rng.range(22, 42), cy0 = rng.range(22, 42), rx = rng.range(20, 27), ry = rng.range(16, 22);
    let floor = new Uint8Array(4096);
    for (let y = 3; y < 61; y++) for (let x = 3; x < 61; x++) {
      const d = Math.hypot((x - cx0) / rx, (y - cy0) / ry);
      if (d + (fN(x, y) - 0.5) * 0.9 < 1) floor[y * 64 + x] = 1;
    }
    if (exitAt) for (let y = exitAt.y - 6; y <= exitAt.y + 4; y++) for (let x = exitAt.x - 5; x <= exitAt.x + 5; x++) if (inner(x, y, 0)) floor[y * 64 + x] = 0;
    floor = dropSmall(openMask(openMask(floor)), 60);
    const keep = new Uint8Array(4096);           // где не будет скал
    for (let i = 0; i < 4096; i++) if (floor[i]) { const x = i & 63, y = i >> 6; for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) if (inner(xx, yy, 1)) keep[yy * 64 + xx] = 1; }
    for (let i = 0; i < 4096; i++) if (floor[i]) cg[i] = K.floor;
    // постройки внутри зала: отрезки стен, буквы Г и П, полукомнаты; между постройками не меньше 2 клеток
    const used = new Uint8Array(4096);
    const okCell = (x, y) => inner(x, y, 3) && floor[y * 64 + x] && !used[y * 64 + x];
    const free = cells => cells.every(([x, y]) => { for (let yy = y - 2; yy <= y + 2; yy++) for (let xx = x - 2; xx <= x + 2; xx++) if (!okCell(xx, yy) && (Math.abs(xx - x) < 2 && Math.abs(yy - y) < 2 || used[yy * 64 + xx])) return false; return true; });
    const mark = cells => { for (const [x, y] of cells) for (let yy = y - 2; yy <= y + 2; yy++) for (let xx = x - 2; xx <= x + 2; xx++) if (inner(xx, yy, 0)) used[yy * 64 + xx] = 1; };
    const wall = (x, y) => { cg[y * 64 + x] = K.wall; };
    // камеры: коробка 7x5, дверь в нижней стене
    const cells = [];
    const nCells = Math.min(3, Math.ceil(p.prisoners / 2));
    for (let tr = 0; tr < 300 && cells.length < nCells; tr++) {
      const bx = rng.range(4, 52), by = rng.range(4, 54);
      const box = []; for (let y = by; y <= by + 4; y++) for (let x = bx; x <= bx + 6; x++) box.push([x, y]);
      box.push([bx + 3, by + 6]);
      if (!free(box)) continue;
      mark(box);
      for (let x = bx; x < bx + 7; x++) { wall(x, by); wall(x, by + 4); }
      for (let y = by; y <= by + 4; y++) { wall(bx, y); wall(bx + 6, y); }
      for (let y = by + 1; y <= by + 3; y++) for (let x = bx + 1; x <= bx + 5; x++) cg[y * 64 + x] = K.floor;
      const dx = bx + 3;
      cg[(by + 4) * 64 + dx] = K.door; fixed[(by + 4) * 64 + dx] = TD;
      cells.push({ x0: bx + 1, y0: by + 1, x1: bx + 5, y1: by + 3, door: { x: dx, y: by + 4 } });
    }
    const shapes = [];
    for (let tr = 0; tr < 3000 && shapes.length < p.rooms * 2; tr++) {
      const x = rng.range(4, 58), y = rng.range(4, 58), kind = rng.int(4), c = [];
      const H = (x0, y0, n) => { for (let k = 0; k < n; k++) c.push([x0 + k, y0]); };
      const V = (x0, y0, n) => { for (let k = 0; k < n; k++) c.push([x0, y0 + k]); };
      const w = rng.range(5, 14), h = rng.range(4, 9);
      if (kind === 0) H(x, y, w);                                  // отрезок
      else if (kind === 1) V(x, y, h);
      else if (kind === 2) { H(x, y, w); V(rng.f() < 0.5 ? x : x + w - 1, y + 1, h); }        // Г
      else {                                                         // П / полукомната с проёмом
        H(x, y, w); V(x, y + 1, h); V(x + w - 1, y + 1, h);
        if (rng.f() < 0.6) { const g = rng.range(1, Math.max(1, w - 4)); for (let k = 0; k < w; k++) if (k < g || k > g + 2) c.push([x + k, y + h]); }
      }
      if (!free(c)) continue;
      mark(c); shapes.push(c);
      for (const [xx, yy] of c) wall(xx, yy);
    }
    for (let i = 0; i < 4096; i++) if (keep[i]) rock[i] = 0;
    // выход: тайл 5 в южной грани скалы
    let ex = exitAt;
    const start = { x: 0, y: 0 };
    if (!ex) {
      const cand = [];
      for (let y = 6; y <= 58; y++) for (let x = 5; x <= 58; x++) if (!keep[y * 64 + x] && Math.hypot(x - cx0, y - cy0) > 14) cand.push([x, y]);
      if (!cand.length) return null;
      const c = rng.pick(cand); ex = { x: c[0], y: c[1] };
    }
    for (let y = ex.y - 4; y <= ex.y; y++) for (let x = ex.x - 3; x <= ex.x + 3; x++) if (x > 0 && y > 0 && x < 63 && y < 63) rock[y * 64 + x] = 1;
    for (let y = ex.y + 1; y <= ex.y + 3; y++) for (let x = ex.x - 3; x <= ex.x + 3; x++) if (x > 0 && y > 0 && x < 63 && y < 63) rock[y * 64 + x] = 0;
    // старт своих: в пещере подальше от выхода
    let bs = -1;
    for (let tr = 0; tr < 300; tr++) {
      const x = rng.range(5, 58), y = rng.range(5, 58);
      if (keep[y * 64 + x]) continue;
      const d = Math.abs(x - ex.x) + Math.abs(y - ex.y);
      if (d > bs) { bs = d; start.x = x; start.y = y; }
    }
    if (bs < 0) return null;
    for (let y = start.y - 3; y <= start.y + 3; y++) for (let x = start.x - 4; x <= start.x + 4; x++) if (x > 0 && y > 0 && x < 63 && y < 63) rock[y * 64 + x] = 0;
    const fixRock = new Uint8Array(4096);
    for (let y = ex.y - 2; y <= ex.y; y++) for (let x = ex.x - 2; x <= ex.x + 2; x++) fixRock[y * 64 + x] = 1;
    rock = dropSmall(openMask(rock, fixRock), 10);
    // пустоты: в самое дальнее от скал и построек место - скала (в пещере) или глыба (в зале)
    for (let it = 0; it < 40; it++) {
      const busy = [];
      for (let i = 0; i < 4096; i++) { const x = i & 63, y = i >> 6; if (rock[i] || used[i] || x === 0 || y === 0 || x === 63 || y === 63) busy.push(i); }
      const d = bfs(() => true, busy);
      let bi = -1, bv = 0;
      for (let i = 0; i < 4096; i++) {
        const x = i & 63, y = i >> 6;
        if (Math.abs(x - ex.x) < 6 && Math.abs(y - ex.y) < 7 || Math.abs(x - start.x) < 6 && Math.abs(y - start.y) < 5) continue;
        if (d[i] > bv) { bv = d[i]; bi = i; }
      }
      if (bv <= p.maxEmpty) break;
      const x = bi & 63, y = bi >> 6, inHall = floor[bi], r = inHall ? 2 : rng.range(2, 3), wob = valueNoise(rng, 3);
      for (let yy = y - r - 1; yy <= y + r + 1; yy++) for (let xx = x - r - 1; xx <= x + r + 1; xx++) {
        if (!inner(xx, yy, 2)) continue;
        const j = yy * 64 + xx;
        if (cg[j] === K.wall || cg[j] === K.door) continue;
        if (Math.hypot((xx - x) * 0.9, yy - y) <= r + (wob(xx, yy) - 0.5) * 1.5) { rock[j] = 1; used[j] = 1; }
      }
    }
    rock = openMask(rock, fixRock);
    for (let y = ex.y - 4; y <= ex.y; y++) for (let x = ex.x - 3; x <= ex.x + 3; x++) if (x > 0 && y > 0 && x < 63 && y < 63) rock[y * 64 + x] = 1;
    // скала не вплотную к стенам и камерам (между ними должен пройти пол)
    for (let i = 0; i < 4096; i++) {
      if (!rock[i]) continue;
      const x = i & 63, y = i >> 6;
      let near = false;
      for (let yy = y - 1; yy <= y + 1 && !near; yy++) for (let xx = x - 1; xx <= x + 1; xx++) { const c = cg[yy * 64 + xx]; if (c === K.wall || c === K.door) { near = true; break; } }
      if (near) rock[i] = 0;
    }
    for (let i = 0; i < 4096; i++) if (rock[i] && (cg[i] === K.cave || cg[i] === K.floor)) cg[i] = K.rock;
    cg[ex.y * 64 + ex.x] = K.exit; fixed[ex.y * 64 + ex.x] = T5;
    for (let i = 0; i < 64; i++) for (const j of [i, 4032 + i, i * 64, i * 64 + 63]) { cg[j] = K.border; fixed[j] = T0; }
    // места для врагов: пол зала, не в камерах
    const spots = [];
    for (let i = 0; i < 4096; i++) if (cg[i] === K.floor && !cells.some(c => (i & 63) >= c.x0 - 1 && (i & 63) <= c.x1 + 1 && (i >> 6) >= c.y0 - 1 && (i >> 6) <= c.y1 + 1)) spots.push(i);
    if (!spots.length) return null;
    return { cg, fixed, cells, spots, exit: ex, start, K };
  }

  // ---------------------------------------------------------------- герои
  function placeHeroes(G, p, plan, map, rng, scen) {
    const occ = new Uint8Array(4096), heroes = [];
    const pass = i => map[i] >= 1 && map[i] < GO_MAX;
    const put = (side, type, x, y) => { const i = y * 64 + x; occ[i] = 1; heroes.push({ side, type, x, y, extra: 0 }); };
    const near = (cx, cy, r, ok) => {
      const c = [];
      for (let y = Math.max(1, cy - r); y <= Math.min(62, cy + r); y++) for (let x = Math.max(1, cx - r); x <= Math.min(62, cx + r); x++) {
        const i = y * 64 + x; if (pass(i) && !occ[i] && (!ok || ok(x, y))) c.push([x, y]);
      }
      c.sort((a, b) => (Math.abs(a[0] - cx) + Math.abs(a[1] - cy)) - (Math.abs(b[0] - cx) + Math.abs(b[1] - cy)) || a[1] - b[1] || a[0] - b[0]);
      return c;
    };
    const types = key => { const l = lp(G, key); return l.length ? l : [[p.master ? 13 : 4, 1]]; };
    const pickType = l => l[rng.weighted(l.map(e => e[1]))][0];
    const squad = (side, n, cx, cy, r, key, ok) => {
      const l = types(key); let c = near(cx, cy, r, ok); let k = 0;
      for (let i = 0; i < n && c.length; i++) { const j = Math.min(c.length - 1, Math.floor(rng.f() * Math.min(c.length, 6 + 2 * i))); const [x, y] = c.splice(j, 1)[0]; put(side, pickType(l), x, y); k++; }
      return k;
    };
    // сторона в файле героев - это раса (wmisc_1.asm NEWALL: массив = MASTER xor сторона; HUMAN - всегда войска игрока):
    // в уровнях людей свои - 0, враги - 1; в уровнях кунгов свои - 1, враги - 0, пленники - 3
    const m = p.master, SO = m ? 1 : 0, SE = m ? 0 : 1, SP = m ? 3 : 2, own = m + '' + SO, foe = m + '' + SE, sl = m + '2';
    const notes = [];
    if (p.type === 'dungeon') {
      const st = plan.start;
      squad(SO, p.own, st.x, st.y, 6, own);
      // пленники в камерах; первый - князь (люди) или Гризольда (кунги), если этого ждёт сценарий
      let left = Math.min(6, p.prisoners);
      const vip = scen && (scen.kind === 'tunnel' || scen.kind === 'reach') ? (scen.kind === 'reach' ? scen.types[0] : (m ? 23 : 22)) : -1;
      plan.cells.forEach((c, ci) => {
        const n = Math.min(left, Math.ceil(left / (plan.cells.length - ci))); left -= n;
        const cc = near((c.x0 + c.x1) >> 1, (c.y0 + c.y1) >> 1, 3, (x, y) => x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1);
        for (let k = 0; k < n && cc.length; k++) {
          const [x, y] = cc.shift(), v = vip >= 0 && !heroes.some(h => h.side >= 2 && h.type === vip);
          put(SP, v ? vip : pickType(types(sl)), x, y);
        }
        // охрана у двери
        const g = near(c.door.x, c.door.y + 2, 2, (x, y) => y > c.door.y);
        for (let k = 0; k < 2 && g.length; k++) { const [x, y] = g.shift(); put(SE, pickType(types(foe)), x, y); }
      });
      if (vip >= 0 && !heroes.some(h => h.side >= 2 && h.type === vip)) notes.push(tr('нет камеры для пленника, которого ждёт сценарий'));
      // остальные враги по комнатам комплекса и у выходов
      let rest = p.enemy - heroes.filter(h => h.side === SE).length;
      for (let k = 0; rest > 0 && k < 40; k++) {
        const i = plan.spots[rng.int(plan.spots.length)], x = i & 63, y = i >> 6;
        if (Math.abs(x - st.x) + Math.abs(y - st.y) < 14) continue;
        rest -= squad(SE, Math.min(rest, 1 + rng.int(3)), x, y, 2, foe);
      }
    } else {
      const [ob, eb] = plan.bases;
      // lost_hero (kung_15): победа, когда в массиве врага (KUNGE) не станет князя - князь стоит у вражеской базы
      if (scen && scen.kind === 'lost_hero') { const c = near(eb.cx, eb.cy, 5)[0]; if (c) put(SE, 22, c[0], c[1]); }
      // reach с обычным героем (kung_01: пеон 9/10 игрока должен дойти до точки) - он в отряде своих
      if (scen && scen.kind === 'reach' && scen.types[0] < 22) { const c = near(ob.cx, ob.cy, 5)[0]; if (c) put(SO, scen.types[0], c[0], c[1]); }
      squad(SO, p.own, ob.cx, ob.cy, 6, own, (x, y) => true);
      const atBase = Math.round(p.enemy * (plan.mines.length > 2 ? 0.65 : 0.85));
      squad(SE, atBase, eb.cx, eb.cy, eb.fort ? 7 : 6, foe);
      let rest = p.enemy - atBase;
      const ms = plan.mines.slice(2).concat(plan.mines.slice(0, 2).reverse());
      for (let k = 0; rest > 0 && k < ms.length * 3; k++) { const mm = ms[k % ms.length]; rest -= squad(SE, Math.min(rest, 2), mm.x, mm.y + 3, 3, foe); }
      if (p.prisoners || (scen && scen.kind === 'reach' && scen.types[0] >= 22)) {
        const vip = scen && scen.kind === 'reach' && scen.types[0] >= 22 ? scen.types[0] : -1;
        const c = near(eb.cx, eb.cy, 6);
        for (let k = 0; k < Math.min(6, Math.max(1, p.prisoners)) && c.length; k++) { const [x, y] = c.splice(Math.floor(rng.f() * Math.min(8, c.length)), 1)[0]; put(SP, k === 0 && vip >= 0 ? vip : pickType(types(sl)), x, y); }
      }
    }
    // порядок как у WMAPPER2: свои, враги, пленники; внутри - по строкам карты
    heroes.sort((a, b) => Math.min(a.side, 2) - Math.min(b.side, 2) || a.y - b.y || a.x - b.x);
    return { heroes: heroes.slice(0, 98), notes };
  }

  // ---------------------------------------------------------------- сборка уровня
  const TASKS = {
    kill_all: ['Заготовка уровня.', 'Уничтожьте всех', 'врагов.'],
    tunnel: ['Освободите князя и', 'выведите его через', 'туннель.'],
    reach: ['Доведите героя до', 'нужной точки', '(см. сценарий).'],
    build: ['Постройте нужные', 'здания', '(см. сценарий).'],
    destroy: ['Разрушьте главное', 'здание врага.', ''],
    lost_hero: ['Убейте вражеского', 'князя или всех', 'врагов.']
  };
  const TASKS_KUNG = { tunnel: ['Освободите Гризольду', 'и выведите её через', 'туннель.'] };

  function chooseScenario(G, p, rng) {
    const all = scenariosFor(G, p.type, p.master);
    if (p.scenario) {
      const s = G.scenarios.find(e => e.name === p.scenario);
      return s ? { s, manual: !all.includes(s) } : null;
    }
    const pref = all.filter(s => p.type === 'dungeon' ? s.kind === 'tunnel' : s.kind === 'kill_all' && !s.extra && s.levtyp === 0);
    const same = pref.filter(s => s.land === (p.type === 'dungeon' ? 3 : p.land));
    const l = same.length ? same : pref.length ? pref : all;
    return l.length ? { s: l[rng.int(l.length)], manual: false } : null;
  }

  /** цель сценария словами (по разбору кода заданий в tools/make_gen.py) */
  function describeScenario(s) {
    // TheEND: 1 - победа игрока, 2 - поражение (wmenu2.asm MU_END) - и за людей, и за кунгов; HUMAN - войска игрока, KUNGE - врага
    switch (s.kind) {
      case 'kill_all': return tr('уничтожить всех: победа, когда у врага не осталось героев, пленников и зданий; поражение - когда их не осталось у вас') + (s.extra ? ' ' + tr('(в коде ещё есть действия, не связанные с целью)') : '');
      case 'tunnel': return s.master ? tr('освободить Гризольду (тип 23, пленница) и довести её до туннеля (тайл 5); «уничтожить всех» здесь победы не даёт')
        : tr('освободить князя (тип 22, пленник) и довести его до туннеля (тайл 5); «уничтожить всех» здесь победы не даёт');
      case 'reach': return tr('довести своего героя типа {t} до клетки {x},{y} - победа; координаты зашиты в код', { t: s.types.join('/'), x: s.x, y: s.y });
      case 'build': return tr('построить {n} зданий с центром {c}', { n: s.count, c: s.btype + 78 });
      case 'destroy': return tr('разрушить здание кунгов с центром {c}', { c: s.btypes.map(b => b + 90).join('/') });
      case 'lost_hero': return tr('убить вражеского князя (тип 22) - победа; или уничтожить всех');
      default: return tr('цель не разобрана - смотрите код на вкладке «Сценарий»');
    }
  }

  /** проверки готового уровня: [{ok, msg}] */
  function checkLevel(core, G, M, p, lv, plan, scen) {
    const res = [], map = lv.map;
    const add = (ok, msg) => res.push({ ok: !!ok, msg });
    const issues = core.validate(lv);
    const errs = issues.filter(r => r.level === 'error');
    add(!errs.length, errs.length ? tr('проверка редактора: {m}', { m: errs[0].msg }) : tr('проверка редактора: ошибок нет'));
    const warns = issues.filter(r => r.level === 'warn');
    add(!warns.length, warns.length ? tr('проверка редактора: предупреждений {n}: {m}', { n: warns.length, m: warns[0].msg }) : tr('проверка редактора: предупреждений нет'));
    res[res.length - 1].soft = true;
    const tok = i => { const v = map[i]; if (lv.script[core.HOFF.fsLAND] !== 3 && (v >= 120 || core.buildingAt(map, i & 63, i >> 6))) return G.B; return v; };
    const bad = unknownPairs(M, map, i => i === 0 && map[0] === 1 && lv.script[core.HOFF.fsLAND] === 3 ? 1 : tok(i));
    add(!bad.length, bad.length ? tr('пары соседей не из статистики автора: {n} (первая {a}|{b} в {x},{y})', { n: bad.length, a: bad[0].a, b: bad[0].b, x: bad[0].x, y: bad[0].y }) : tr('все пары соседей тайлов есть у автора'));
    const pass = i => map[i] >= 1 && map[i] < GO_MAX;
    const SO = p.master ? 1 : 0, SE = 1 - SO;
    const own = lv.heroes.filter(h => h.side === SO), foes = lv.heroes.filter(h => h.side === SE), pris = lv.heroes.filter(h => h.side >= 2);
    if (p.type === 'dungeon') {
      const door = i => pass(i) || map[i] === 61 || map[i] === 63;          // двери ломаются (12 ударов)
      const d = bfs(door, own.map(h => h.y * 64 + h.x));
      const reach = h => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dy]) => d[(h.y + dy) * 64 + h.x + dx] >= 0);
      add(own.length && pris.every(reach), tr('пленники достижимы (через двери): {k} из {n}', { k: pris.filter(reach).length, n: pris.length }));
      const e5 = []; for (let i = 0; i < 4096; i++) if (map[i] === 5) e5.push(i);
      add(e5.length && e5.every(i => d[i] >= 0), tr('выход (тайл 5) достижим'));
      add(map[0] === 1, tr('признак подземелья: в клетке 0,0 тайл 1'));
    } else {
      const d = bfs(pass, own.map(h => h.y * 64 + h.x));
      const eb = plan.bases[1];
      let ok = false; for (let y = eb.y0; y <= eb.y1 && !ok; y++) for (let x = eb.x0; x <= eb.x1; x++) if (d[y * 64 + x] >= 0) { ok = true; break; }
      add(ok, tr('базы соединены проходимым путём'));
      add(foes.every(h => d[h.y * 64 + h.x] >= 0 || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => d[(h.y + dy) * 64 + h.x + dx] >= 0)), tr('все враги достижимы'));
      if (pris.length) add(pris.every(h => d[h.y * 64 + h.x] >= 0), tr('пленники достижимы'));
    }
    // ожидания сценария
    if (scen) {
      const s = scen;
      if (s.kind === 'tunnel') {
        const vip = lv.heroes.find(h => h.side >= 2 && (h.type === 22 || h.type === 23));
        add(lv.script[core.HOFF.fsLAND] === 3 && vip, tr('сценарий {s}: ландшафт 3, выход (тайл 5), пленник типа {t}', { s: s.name, t: vip ? vip.type : '22/23' }));
      } else if (s.kind === 'reach') {
        const i = s.y * 64 + s.x;
        const vip = lv.heroes.find(h => s.types.includes(h.type) && (h.side >= 2 || h.side === SO));    // HUMAN - войска игрока (и освобождённые пленники)
        const dd = vip ? bfs(j => pass(j) || map[j] === 61, [vip.y * 64 + vip.x]) : null;
        add(vip && pass(i) && dd && dd[i] >= 0, tr('сценарий {s}: клетка {x},{y} проходима и достижима героем типа {t}', { s: s.name, x: s.x, y: s.y, t: s.types.join('/') }));
      } else if (s.kind === 'destroy') {
        const want = s.btypes.map(t => t + 90);
        let has = false; for (let i = 0; i < 4096; i++) if (want.includes(map[i]) && core.buildingAt(map, i & 63, i >> 6)) has = true;
        add(has, tr('сценарий {s}: у врага есть здание {b}', { s: s.name, b: want.join('/') }));
      } else if (s.kind === 'lost_hero') {
        add(lv.heroes.some(h => h.side === SE && h.type === 22), tr('сценарий {s}: у врага есть князь (тип 22)', { s: s.name }));
      } else if (s.kind === 'build') {
        add(p.master === 0, tr('сценарий {s}: построить {n} зданий с центром {c}', { s: s.name, n: s.count, c: s.btype + 78 }));
      } else if (s.kind === 'kill_all') {
        add(foes.length > 0 && own.length > 0, tr('сценарий {s}: есть свои и враги', { s: s.name }));
      }
    }
    return res;
  }

  // ---------------------------------------------------------------- умные кисти: дорога, река, перерисовка области
  // Кисть меняет только смысл клеток (дорога, вода, мост, трава). Тайлы в полосе вокруг штриха заново подбирает WFC по парам
  // соседей автора; клетки за полосой закреплены, здания и тайлы вне модели не трогаются.
  const BRUSH_KINDS = ['road', 'river', 'paint', 'area'];
  const RIVER_W = [3, 4, 5];
  const BRIDGE_MAX = 12;
  // классы, которые рисует кисть «Покрытие»
  const PAINT_CLASSES = { outdoor: ['forest', 'paveh', 'pavek'], dungeon: ['rock', 'wall', 'cave', 'floor'] };               // самый длинный мост (у автора мосты короче)            // у автора нет реки уже 3 клеток: два береговых тайла рядом не стоят никогда

  /** точки штриха -> путь по 4 соседям без повторов подряд */
  function path4(pts) {
    const out = [];
    const put = (x, y) => { const l = out[out.length - 1]; if (!l || l.x !== x || l.y !== y) out.push({ x, y }); };
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k];
      if (!out.length) { put(p.x, p.y); continue; }
      let { x, y } = out[out.length - 1];
      const dx = p.x - x, dy = p.y - y, n = Math.max(Math.abs(dx), Math.abs(dy));
      // по прямой между точками; диагональный шаг разбивается на два, сначала по длинной оси
      for (let s = 1; s <= n; s++) {
        const tx = x + Math.round(dx * s / n), ty = y + Math.round(dy * s / n);
        const l = out[out.length - 1];
        if (tx !== l.x && ty !== l.y) { if (Math.abs(dx) >= Math.abs(dy)) put(tx, l.y); else put(l.x, ty); }
        put(tx, ty);
      }
    }
    return out;
  }

  /**
   * brushStroke(core, G, lv, op) -> {map, changed, cells, notes} или {error}
   *   op.kind: 'road' | 'river' | 'area'; op.erase - стереть (дорогу/реку) вместо рисования;
   *   op.points - клетки штриха [{x,y}] (для 'area' - два угла прямоугольника); op.width - ширина реки 3..5; op.seed
   * Карта lv.map не меняется: новая карта возвращается.
   */
  function brushStroke(core, G, lv, op) {
    const L = lv.script[core.HOFF.fsLAND], land = L >= 1 && L <= 4 ? L : 1;
    if (!G.lands[String(land)]) return { error: tr('нет данных для ландшафта {l}', { l: land }) };
    const M = modelFor(G, land), map = lv.map, side = G.lands[String(land)].side;
    const K = {}; M.classes.forEach((n, k) => { K[n] = k; });
    if ((op.kind === 'road' || op.kind === 'river') && (K.road === undefined || K.water === undefined)) return { error: tr('в подземелье нет дорог и рек: рисуйте скалы, стены и пещеры кистью «Покрытие»') };
    if (op.kind === 'paint' && (K[op.cls] === undefined || !PAINT_CLASSES[land === 3 ? 'dungeon' : 'outdoor'].includes(op.cls))) return { error: tr('этим покрытием здесь рисовать нельзя: {c}', { c: op.cls }) };
    const tok = i => { const v = map[i]; if (land !== 3 && (v >= 120 || core.buildingAt(map, i & 63, i >> 6))) return G.B; return v; };
    // классы клеток по нынешней карте
    // фон: трава снаружи, пещера в подземелье (туда стирает кисть)
    const BG = K.grass !== undefined ? K.grass : (K.cave !== undefined ? K.cave : 0);
    const cg0 = new Uint8Array(4096), known = new Int16Array(4096);
    for (let i = 0; i < 4096; i++) {
      const t = tok(i), k = M.index.get(t);
      known[i] = k === undefined ? -1 : k;
      cg0[i] = k === undefined ? (t === G.B ? K.building : BG) : M.cls[k];
    }
    if (land === 3 && map[0] === 1) { known[0] = M.index.get(0); cg0[0] = K.border; }      // признак подземелья: клетка 0,0 - граница
    const inner = (x, y) => x >= 1 && y >= 1 && x <= 62 && y <= 62;
    // клетки, у которых на карте уже есть пара соседей не из статистики автора (правка руками): их прежний тайл
    // в перебор не вернуть, поэтому, если штрих их не касается, они остаются как есть
    const oddPair = new Uint8Array(4096);
    for (const b of unknownPairs(M, map, i => (i === 0 && land === 3 && map[0] === 1) ? 0 : tok(i))) { const i = b.y * 64 + b.x; oddPair[i] = 1; oddPair[b.d === 'e' ? i + 1 : i + 64] = 1; }
    // кисти не трогают рамку, здания, ограды, площадки баз, двери и выход: дорога у них кончается, река обходит
    const paving = op.kind === 'paint' && (op.cls === 'paveh' || op.cls === 'pavek');
    const fixedCls = c => c === K.border || c === K.building || c === K.fence || (!paving && (c === K.paveh || c === K.pavek)) || c === K.door || c === K.exit;
    const pts = (op.points || []).filter(p => p && p.x >= 0 && p.y >= 0 && p.x < 64 && p.y < 64);
    if (!pts.length) return { error: tr('пустой штрих') };
    const NC = M.classes.length, cc = [0, 1, 2, 3].map(() => new Uint8Array(NC * NC));     // какие классы у автора стоят рядом (по сторонам)
    for (let d = 0; d < 4; d++) for (let a = 0; a < M.K; a++) for (let b = 0; b < M.K; b++) if ((M.comp[d][a][b >> 5] >>> (b & 31)) & 1) cc[d][M.cls[a] * NC + M.cls[b]] = 1;
    // семейства внутренних тайлов воды (текстуры, которые в одном водоёме у автора не смешиваются)
    const fam = new Int16Array(M.K).fill(-1); let nf = 0;
    if (K.water !== undefined) {
      const Lg = G.lands[String(land)], inner2 = k => M.cls[k] === K.water && side[k][0] === 0;
      for (let k0 = 0; k0 < M.K; k0++) if (inner2(k0) && fam[k0] < 0) {
        const st = [k0]; fam[k0] = nf;
        while (st.length) { const a = st.pop(); for (const [x, y] of Lg.adjR.concat(Lg.adjD)) { const b = x === a ? y : y === a ? x : -1; if (b >= 0 && inner2(b) && fam[b] < 0) { fam[b] = nf; st.push(b); } } }
        nf++;
      }
    }

    /** план штриха: новые классы клеток и ограничения тайлов. noBridge - мосты (по клетке берега), которые не ставить */
    function plan(noBridge, avoidSolid) {
      const cg = Uint8Array.from(cg0), notes = [], bridges = [];
      const want = new Int16Array(4096).fill(-1);          // новый класс клетки (-1 - прежний)
      const touched = new Uint8Array(4096);                 // клетки, вокруг которых перебираются тайлы
      // avoidSolid: последняя попытка - не трогать клетки вплотную к зданиям и оградам (стыки с ними у автора редки)
      const nearSolid8 = i => { const x = i & 63, y = i >> 6; for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) { const c = cg[yy * 64 + xx]; if (c !== K.border && fixedCls(c)) return true; } return false; };
      const setc = (x, y, c) => { if (!inner(x, y)) return false; const i = y * 64 + x; if (fixedCls(cg[i]) || (avoidSolid && nearSolid8(i))) return false; want[i] = c; touched[i] = 1; return true; };
      const cls = i => (want[i] >= 0 ? want[i] : cg[i]);
      const wet = i => cls(i) === K.water;

      /** мост от берега a по оси (sx, sy): {span, end, score} или null. Мост как у автора: 3 клетки поперёк, по всей ширине воды;
       *  по бокам - вода на всю его длину, у концов боковых пролётов - суша. score - сколько клеток придётся переделать */
      function bridgeAt(a, sx, sy) {
        if (!inner(a.x, a.y) || wet(a.y * 64 + a.x) || fixedCls(cls(a.y * 64 + a.x))) return null;
        let x = a.x, y = a.y; const span = [];
        for (let n = 0; n < BRIDGE_MAX + 1; n++) { x += sx; y += sy; if (!inner(x, y) || !wet(y * 64 + x)) break; span.push({ x, y }); }
        if (span.length > BRIDGE_MAX) return null;
        if (!span.length || !inner(x, y) || wet(y * 64 + x) || fixedCls(cls(y * 64 + x))) return null;
        const px = sy !== 0 ? 1 : 0, py = sx !== 0 ? 1 : 0;      // поперёк моста
        let score = 0;
        for (const q of span) for (let t = -2; t <= 2; t++) {
          const xx = q.x + px * t, yy = q.y + py * t; if (!inner(xx, yy)) return null;
          const c = cls(yy * 64 + xx); if (fixedCls(c) || c === K.bridge) return null;
          if (c !== K.water) score += Math.abs(t) <= 1 ? 3 : 1;
        }
        for (const q of [a, { x, y }]) for (const t of [-2, -1, 1, 2]) { const xx = q.x + px * t, yy = q.y + py * t; if (!inner(xx, yy)) return null; const c = cls(yy * 64 + xx); if (c === K.bridge) return null; if (c === K.water) score += 2; }
        return { span, end: { x, y }, px, py, score };
      }
      /** дорога по пути; через воду - прямой мост (на лучшем месте рядом). Возвращает false, если какой-то мост не встал */
      function roadPath(path) {
        let k = 0, skipped = 0, failed = false;
        while (k < path.length) {
          const p = path[k], i = p.y * 64 + p.x;
          if (cls(i) === K.bridge) { k++; continue; }                 // по готовому мосту
          if (!wet(i)) { if (!setc(p.x, p.y, K.road)) skipped++; k++; continue; }
          let e = k; while (e < path.length && wet(path[e].y * 64 + path[e].x)) e++;
          const a = k > 0 ? path[k - 1] : p, b = e < path.length ? path[e] : path[path.length - 1];
          if (wet(a.y * 64 + a.x)) { notes.push(tr('мост в {x},{y} не построить: штрих начат в воде', { x: p.x, y: p.y })); failed = true; k = e; continue; }
          const key = a.y * 64 + a.x;
          // ось: главная ось пути через воду, потом другая; место - сдвиг вдоль берега до 3 клеток, где переделок меньше
          let best = null;
          const h0 = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
          if (!noBridge.has(key)) for (const hor of [h0, !h0]) {
            const sx = hor ? Math.sign(b.x - a.x) || Math.sign(p.x - a.x) || 1 : 0, sy = hor ? 0 : Math.sign(b.y - a.y) || Math.sign(p.y - a.y) || 1;
            for (const o of [0, -1, 1, -2, 2, -3, 3]) {
              const s0 = { x: a.x + (sy ? o : 0), y: a.y + (sx ? o : 0) };
              // от a до s0 вдоль берега - по суше
              let ok = true; for (let q = 1; q <= Math.abs(o) && ok; q++) { const xx = a.x + (sy ? Math.sign(o) * q : 0), yy = a.y + (sx ? Math.sign(o) * q : 0); const c = cls(yy * 64 + xx); if (!inner(xx, yy) || c === K.water || fixedCls(c)) ok = false; }
              if (!ok) continue;
              const B = bridgeAt(s0, sx, sy); if (!B) continue;
              const sc = B.score * 4 + Math.abs(o) + (hor === h0 ? 0 : 6);
              if (!best || sc < best.sc) best = Object.assign(B, { sc, s0, o, sx, sy });
            }
            if (best && best.score === 0) break;
          }
          if (!best) {
            notes.push(noBridge.has(key) ? tr('мост у {x},{y} не сошёлся с тайлами автора - дорога обрывается у воды', { x: a.x, y: a.y })
              : tr('мост в {x},{y} не построить: нет берега напротив (или мост длиннее {n} клеток)', { x: a.x, y: a.y, n: BRIDGE_MAX }));
            failed = true; k = e; continue;
          }
          // дорога до места моста, мост, дальше - от дальнего берега
          const cells = [];
          for (let q = 1; q <= Math.abs(best.o); q++) { const xx = a.x + (best.sy ? Math.sign(best.o) * q : 0), yy = a.y + (best.sx ? Math.sign(best.o) * q : 0); setc(xx, yy, K.road); }
          setc(best.s0.x, best.s0.y, K.road);
          for (const q of best.span) for (let t = -2; t <= 2; t++) { const xx = q.x + best.px * t, yy = q.y + best.py * t; setc(xx, yy, Math.abs(t) <= 1 ? K.bridge : K.water); cells.push(yy * 64 + xx); }
          // берег у концов моста ровный на 5 клеток: как у автора, боковые пролёты кончаются там же, где мост
          for (const q of [best.s0, best.end]) for (const t of [-2, -1, 1, 2]) { const xx = q.x + best.px * t, yy = q.y + best.py * t; if (inner(xx, yy) && wet(yy * 64 + xx)) setc(xx, yy, BG); cells.push(yy * 64 + xx); }
          bridges.push({ key, cells });
          path.splice(k, path.length - k, ...path4([best.end].concat(path.slice(e))));
        }
        if (skipped) notes.push(tr('дорога не идёт сквозь здания, ограды, площадки баз и рамку карты: пропущено клеток {n}', { n: skipped }));
        return !failed;
      }

      if (op.kind === 'paint') {
        // покрытие: полоса шириной w; стирание - клетки этого класса в полосе становятся фоном
        const w = clamp(op.width | 0 || 3, 1, 9), lo = -((w - 1) >> 1), hi = lo + w - 1, c = K[op.cls];
        for (const p of path4(pts)) for (let dy = lo; dy <= hi; dy++) for (let dx = lo; dx <= hi; dx++) {
          const x = p.x + dx, y = p.y + dy; if (!inner(x, y)) continue;
          const i = y * 64 + x;
          if (cg[i] === K.bridge || cg[i] === K.water && !op.erase) continue;           // воду и мосты покрытие не заливает
          if (op.erase) { if (cg[i] === c && want[i] < 0) setc(x, y, BG); }
          else if (cg[i] !== c) setc(x, y, c);
        }
      } else if (op.kind === 'area') {
        const x0 = Math.max(1, Math.min(pts[0].x, pts[pts.length - 1].x)), x1 = Math.min(62, Math.max(pts[0].x, pts[pts.length - 1].x));
        const y0 = Math.max(1, Math.min(pts[0].y, pts[pts.length - 1].y)), y1 = Math.min(62, Math.max(pts[0].y, pts[pts.length - 1].y));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) touched[y * 64 + x] = 1;
      } else if (op.kind === 'road') {
        const path = path4(pts);
        if (op.erase) {
          for (const p of path) {
            const i = p.y * 64 + p.x;
            if (cg[i] === K.road) setc(p.x, p.y, BG);
            else if (cg[i] === K.bridge) {                   // мост целиком становится водой
              const seen = new Uint8Array(4096), st = [i]; seen[i] = 1;
              while (st.length) { const j = st.pop(); setc(j & 63, j >> 6, K.water); for (let d = 0; d < 4; d++) { const x = (j & 63) + DX[d], y = (j >> 6) + DY[d]; if (!inner(x, y)) continue; const q = y * 64 + x; if (!seen[q] && cg[q] === K.bridge) { seen[q] = 1; st.push(q); } } }
            }
          }
        } else roadPath(path);
      } else if (op.kind === 'river') {
        const w = clamp(op.width | 0 || 3, op.erase ? 1 : 3, 9), lo = -((w - 1) >> 1), hi = lo + w - 1;
        const path = path4(pts), band = new Uint8Array(4096);
        for (const p of path) for (let dy = lo; dy <= hi; dy++) for (let dx = lo; dx <= hi; dx++) { const x = p.x + dx, y = p.y + dy; if (inner(x, y)) band[y * 64 + x] = 1; }
        if (op.erase) {
          for (let i = 0; i < 4096; i++) if (band[i] && cg[i] === K.water) setc(i & 63, i >> 6, BG);
          // мосты, задетые стиранием, становятся дорогой (средняя полоса) и травой
          const seen = new Uint8Array(4096);
          for (let i0 = 0; i0 < 4096; i0++) if (cg[i0] === K.bridge && !seen[i0]) {
            const comp = [i0]; seen[i0] = 1; let hit = false, x0 = 64, x1 = -1, y0 = 64, y1 = -1;
            for (let q = 0; q < comp.length; q++) {
              const j = comp[q], x = j & 63, y = j >> 6; hit = hit || !!band[j];
              x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
              for (let d = 0; d < 4; d++) { const xx = x + DX[d], yy = y + DY[d]; if (!inner(xx, yy)) continue; const n = yy * 64 + xx; if (!seen[n] && cg[n] === K.bridge) { seen[n] = 1; comp.push(n); } }
            }
            if (!hit) continue;
            const vert = x1 - x0 <= y1 - y0, mid = vert ? (x0 + x1) >> 1 : (y0 + y1) >> 1;
            for (const j of comp) setc(j & 63, j >> 6, (vert ? (j & 63) : (j >> 6)) === mid ? K.road : BG);
          }
        } else {
          // у зданий, оград и готовых мостов оставляем клетку суши: берег вплотную к ним у автора не встречается
          const nearSolid = i => { const x = i & 63, y = i >> 6; for (let d = 0; d < 8; d++) { const xx = x + [0, 1, 1, 1, 0, -1, -1, -1][d], yy = y + [-1, -1, 0, 1, 1, 1, 0, -1][d]; if (xx >= 0 && yy >= 0 && xx < 64 && yy < 64 && (fixedCls(cg[yy * 64 + xx]) || cg[yy * 64 + xx] === K.bridge) && cg[yy * 64 + xx] !== K.border) return true; } return false; };
          const wasRoad = new Uint8Array(4096);
          for (let i = 0; i < 4096; i++) if (band[i]) {
            if (cg[i] === K.bridge || fixedCls(cg[i]) || nearSolid(i)) continue;
            if (cg[i] === K.road) wasRoad[i] = 1;
            setc(i & 63, i >> 6, K.water);
          }
          // вода уже 3 клеток у автора не бывает: новая вода, не входящая ни в один квадрат воды 3x3, не ставится
          for (let it = 0; it < 3; it++) {
            let drop = 0;
            for (let i = 0; i < 4096; i++) if (want[i] === K.water && cg[i] !== K.water) {
              const x = i & 63, y = i >> 6; let ok = false;
              for (let oy = -2; oy <= 0 && !ok; oy++) for (let ox = -2; ox <= 0 && !ok; ox++) {
                let all = true;
                for (let yy = y + oy; yy <= y + oy + 2 && all; yy++) for (let xx = x + ox; xx <= x + ox + 2; xx++) if (xx < 0 || yy < 0 || xx > 63 || yy > 63 || !wet(yy * 64 + xx)) { all = false; break; }
                ok = all;
              }
              if (!ok) { want[i] = -1; wasRoad[i] = 0; drop++; }
            }
            if (!drop) break;
          }
          // река перерезала дорогу: концы дороги на берегах соединяются заново, через воду - прямым мостом
          const seen = new Uint8Array(4096); let nb = 0, cut = 0;
          for (let i0 = 0; i0 < 4096; i0++) if (wasRoad[i0] && !seen[i0]) {
            const comp = [i0], ends = []; seen[i0] = 1;
            for (let q = 0; q < comp.length; q++) {
              const j = comp[q], x = j & 63, y = j >> 6;
              for (let d = 0; d < 4; d++) {
                const xx = x + DX[d], yy = y + DY[d]; if (!inner(xx, yy)) continue;
                const n = yy * 64 + xx;
                if (wasRoad[n]) { if (!seen[n]) { seen[n] = 1; comp.push(n); } }
                else if (cls(n) === K.road || cls(n) === K.bridge) ends.push(n);
              }
            }
            // концы дороги по берегам: сторона - по направлению штриха у ближайшей его клетки
            const dirAt = n => {
              const x = n & 63, y = n >> 6; let bk = 0, bd = 1e9;
              for (let q = 0; q < path.length; q++) { const d2 = (path[q].x - x) ** 2 + (path[q].y - y) ** 2; if (d2 < bd) { bd = d2; bk = q; } }
              const p0 = path[Math.max(0, bk - 2)], p1 = path[Math.min(path.length - 1, bk + 2)];
              return { q0: path[bk], dx: p1.x - p0.x, dy: p1.y - p0.y };
            };
            const sideOf = n => { const { q0, dx, dy } = dirAt(n); return Math.sign(dx * ((n >> 6) - q0.y) - dy * ((n & 63) - q0.x)); };
            // мост - только поперёк реки: путь A->B почти перпендикулярен руслу
            const across = (A, B) => { const { dx, dy } = dirAt(A), ax = (B & 63) - (A & 63), ay = (B >> 6) - (A >> 6);
              return Math.abs(ax * dx + ay * dy) <= 0.6 * Math.hypot(ax, ay) * Math.hypot(dx, dy); };
            const uniq = [...new Set(ends)], L1 = uniq.filter(n => sideOf(n) > 0), L2 = uniq.filter(n => sideOf(n) < 0), used = new Set();
            let made = 0;
            for (const A of L1) {
              let B = -1, bd = 1e9;
              for (const n of L2) if (!used.has(n) && across(A, n)) { const dd = Math.abs((A & 63) - (n & 63)) + Math.abs((A >> 6) - (n >> 6)); if (dd < bd) { bd = dd; B = n; } }
              if (B < 0 || bd > w + 6) continue;
              used.add(B);
              if (roadPath(path4([{ x: A & 63, y: A >> 6 }, { x: B & 63, y: B >> 6 }]))) { nb++; made++; } else cut++;
            }
            if (!made) cut++;
          }
          if (nb) notes.push(tr('река пересекла дорогу: поставлено мостов {n}', { n: nb }));
          if (cut) notes.push(tr('река перерезала дорогу, мост не встал: {n} - проведите дорогу через реку кистью дороги', { n: cut }));
        }
      }

      // жёсткие клетки: класс штриха; мост (2) не уступает никогда, остальные - только после многих неудач рядом
      const hard = new Uint8Array(4096); for (let i = 0; i < 4096; i++) if (want[i] >= 0) hard[i] = want[i] === K.bridge ? 2 : 1;
      if (op.kind === 'area') for (let i = 0; i < 4096; i++) if (touched[i]) hard[i] = 1;          // перерисовка: класс клеток прежний
      // просека: у автора дорога и вода отделены от леса и скал полосой травы - соседние клетки леса становятся фоном
      if (op.kind !== 'area' && !op.erase) for (let i = 0; i < 4096; i++) if (want[i] === K.road || want[i] === K.water || want[i] === K.bridge) {
        const x = i & 63, y = i >> 6;
        for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) {
          if (!inner(xx, yy)) continue; const j = yy * 64 + xx;
          if (want[j] < 0 && K.forest !== undefined && cg[j] === K.forest) { want[j] = BG; touched[j] = 1; }
        }
      }
      // соседи, которые у автора не стоят рядом с новым классом (лес у воды и т. п.), становятся фоном
      for (let pass = 0; pass < 2; pass++) for (let i = 0; i < 4096; i++) if (want[i] >= 0) {
        const x = i & 63, y = i >> 6, c = want[i];
        for (let d = 0; d < 4; d++) {
          const xx = x + DX[d], yy = y + DY[d]; if (!inner(xx, yy)) continue;
          const j = yy * 64 + xx; if (hard[j] || want[j] >= 0 || fixedCls(cg[j]) || cg[j] === K.bridge) continue;
          if (!cc[d][c * NC + cg[j]] && cc[d][c * NC + BG]) { want[j] = BG; touched[j] = 1; }
        }
      }
      for (let i = 0; i < 4096; i++) if (want[i] >= 0) cg[i] = want[i];
      // стороны тайлов: сосед того же класса - край (берег) с этой стороны запрещён; сосед-фон (трава, дорога) - запрещена середина.
      // Редкие соседи (мост, лес, ограда) ничего не запрещают: у автора их мало, статистика сторон по ним неточна
      const clsMax = new Float64Array(NC); for (let k = 0; k < M.K; k++) clsMax[M.cls[k]] = Math.max(clsMax[M.cls[k]], M.freq[k]);
      const W = M.W, allow = new Int32Array(4096 * W), hasAllow = new Uint8Array(4096), allow2 = new Int32Array(4096 * W), allow2Has = new Uint8Array(4096);
      for (let y = 1; y < 63; y++) for (let x = 1; x < 63; x++) {
        const i = y * 64 + x, c = cg[i]; let oth = 0, sam = 0;
        for (let d = 0; d < 4; d++) { const n = cg[(y + DY[d]) * 64 + x + DX[d]]; if (n === c) sam |= 1 << d; else if (n === BG || n === K.road) oth |= 1 << d; }
        let any = 0;
        // в клетках «Покрытия» - только частые у автора тайлы класса (редкие авто-размеченные выглядят чужими)
        const rare = op.kind === 'paint' && want[i] >= 0 ? clsMax[c] * 0.02 : 0;
        for (let k = 0; k < M.K; k++) if (M.cls[k] === c && M.freq[k] >= rare && !(side[k][0] & sam) && !(side[k][1] & oth)) { allow[i * W + (k >> 5)] |= 1 << (k & 31); any = 1; }
        hasAllow[i] = any;
      }
      // текстура новой воды - как у воды, к которой она примыкает (иначе - по зерну)
      if (nf > 1) {
        const votes = new Array(nf).fill(0);
        for (let i = 0; i < 4096; i++) if (touched[i]) {
          const x = i & 63, y = i >> 6;
          for (let yy = Math.max(0, y - 3); yy <= Math.min(63, y + 3); yy++) for (let xx = Math.max(0, x - 3); xx <= Math.min(63, x + 3); xx++) {
            const k = known[yy * 64 + xx]; if (k >= 0 && fam[k] >= 0 && want[yy * 64 + xx] < 0) votes[fam[k]]++;
          }
        }
        let f = 0; for (let q = 1; q < nf; q++) if (votes[q] > votes[f]) f = q;
        if (!votes[f]) f = hash32(op.seed >>> 0, 77) % nf;
        for (let i = 0; i < 4096; i++) if (cg[i] === K.water && touched[i]) {
          for (let k = 0; k < M.K; k++) if (M.cls[k] === K.water && !(fam[k] >= 0 && fam[k] !== f)) allow2[i * W + (k >> 5)] |= 1 << (k & 31);
          allow2Has[i] = 1;
          if (!hasAllow[i]) continue;
          let any = 0;
          for (let k = 0; k < M.K; k++) if (fam[k] >= 0 && fam[k] !== f) allow[i * W + (k >> 5)] &= ~(1 << (k & 31));
          for (let w = 0; w < W; w++) any |= allow[i * W + w];
          if (!any) hasAllow[i] = 0;
        }
      }
      return { cg, want, touched, hard, allow, hasAllow, allow2, allow2Has, notes, bridges };
    }

    /** перебор тайлов в полосе вокруг штриха: R = 2, 4, 6 клеток. hard - жёсткие клетки (null - класс штриха может уступить везде) */
    function solve(P, hard, trace) {
      const soft = hard !== P.hard;
      const seed = (op.seed >>> 0) || 1;
      for (let grow = 0; grow < 3; grow++) {
        const R = 2 + grow * 2, region = new Uint8Array(4096);
        for (let i = 0; i < 4096; i++) if (P.touched[i]) {
          const x = i & 63, y = i >> 6;
          for (let yy = Math.max(1, y - R); yy <= Math.min(62, y + R); yy++) for (let xx = Math.max(1, x - R); xx <= Math.min(62, x + R); xx++) region[yy * 64 + xx] = 1;
        }
        const fixed = new Int16Array(4096);
        for (let i = 0; i < 4096; i++) {
          // не трогаем: рамку, здания; мосты, ограды и площадки баз, которых штрих не касается
          const c = P.cg[i], keep = P.want[i] < 0 && (c === K.bridge || fixedCls(c));
          const free = region[i] && c !== K.border && c !== K.building && !keep && !(oddPair[i] && P.want[i] < 0) && !(land === 3 && i === 0);
          fixed[i] = free ? -1 : (known[i] >= 0 ? known[i] : -2);
        }
        for (let at = 0; at < 2; at++) {
          const rng = RNG(hash32(seed, (soft ? 64 : 0) + grow * 16 + at));
          if (op.dump) op.dump.push({ cg: Uint8Array.from(P.cg), fixed: Int16Array.from(fixed), hard: P.hard, allow: P.allow, hasAllow: P.hasAllow });
          const res = wfc(M, P.cg, fixed, rng, { trace, local: true, hard, allow: P.allow, hasAllow: P.hasAllow, allow2: P.allow2, allow2Has: P.allow2Has,
            borderClass: K.border, maxResets: 120, noRelax: ['building', 'exit', 'door', 'border', 'bridge'] });
          if (res) return { res, fixed, R };
        }
      }
      return null;
    }

    // план; если тайлы автора не сходятся, сначала убираем мешающие мосты (по месту противоречий), затем ослабляем класс штриха
    const noBridge = new Set();
    let P = null, S = null, trace = [];
    for (let round = 0; round < 4 && !S; round++) {
      P = plan(noBridge);
      if (round === 0) { let any = false; for (let i = 0; i < 4096; i++) if (P.touched[i]) { any = true; break; } if (!any) return { error: tr('штрих ничего не меняет') }; }
      trace = [];
      S = solve(P, P.hard, trace);
      if (op.trace) op.trace.push(...trace);
      if (S || !P.bridges.length) break;
      let dropped = 0;
      for (const b of P.bridges) if (!noBridge.has(b.key) && trace.some(c => b.cells.some(i => Math.abs((i & 63) - (c & 63)) <= 2 && Math.abs((i >> 6) - (c >> 6)) <= 2))) { noBridge.add(b.key); dropped++; }
      if (!dropped) break;
    }
    // уступать классом может только место, где тайлы не сошлись (3 клетки вокруг), потом - чем дальше, тем шире, и наконец весь штрих
    for (const rad of [3, 6]) {
      if (S) break;
      const h = Uint8Array.from(P.hard);
      for (const c of trace) { const cx = c & 63, cy = c >> 6; for (let y = Math.max(0, cy - rad); y <= Math.min(63, cy + rad); y++) for (let x = Math.max(0, cx - rad); x <= Math.min(63, cx + rad); x++) if (h[y * 64 + x] === 1) h[y * 64 + x] = 0; }
      const t2 = []; S = solve(P, h, t2); trace = trace.concat(t2);
    }
    if (!S) S = solve(P, null, null);
    if (!S) { const P2 = plan(noBridge, true); S = solve(P2, P2.hard, []) || solve(P2, null, null); if (S) { P = P2; P.notes.push(tr('у зданий и оград штрих не рисуется: там тайлы автора не сошлись')); } }
    if (!S) return { error: tr('тайлы автора здесь не сходятся: попробуйте провести штрих иначе') };
    const { res, fixed, R } = S, notes = P.notes, out = new Uint8Array(map);
    let changed = 0, lost = 0;
    for (let i = 0; i < 4096; i++) if (fixed[i] === -1) {
      const t = M.tiles[res.tiles[i]];
      if (t === G.B) continue;
      if (P.want[i] >= 0 && M.cls[res.tiles[i]] !== P.want[i]) lost++;
      if (out[i] !== t) { out[i] = t; changed++; }
    }
    if (lost) notes.push(tr('клеток штриха остались прежними (тайлы автора там не сошлись): {n}', { n: lost }));
    // герои на ставших непроходимыми клетках
    const wetH = lv.heroes.filter(h => h.x < 64 && h.y < 64 && !(out[h.y * 64 + h.x] >= 1 && out[h.y * 64 + h.x] < GO_MAX) && map[h.y * 64 + h.x] >= 1 && map[h.y * 64 + h.x] < GO_MAX);
    if (wetH.length) notes.push(tr('героев теперь на непроходимых клетках: {n}', { n: wetH.length }));
    return { map: out, changed, region: R, resets: res.resets, relaxed: res.relaxed, lost, notes };
  }

  /**
   * generate(core, G, lib, params) -> {lv, report} или {error, report}
   *   core - BRCore, G - BR_GEN (data/gendata.js), lib - core.library() (сценарии с байтами)
   *   params: type ('battle' | 'fortress' | 'dungeon'), land, master, seed, water, forest, dist, mines, rooms, prisoners, own, enemy, cave, fence, scenario, name
   */
  function generate(core, G, lib, params) {
    const p = Object.assign({}, DEFAULTS[params.type] || DEFAULTS.battle, params);
    if (p.type === 'dungeon') p.land = 3;
    if (p.land === 3 && p.type !== 'dungeon') p.land = 1;
    p.seed = (p.seed >>> 0);
    const M = modelFor(G, p.land);
    const report = { seed: p.seed, attempts: 0, tries: [], scenario: null, checks: [], notes: [] };
    const rng0 = RNG(hash32(p.seed, 0x5CE));
    const sc = chooseScenario(G, p, rng0);
    const scen = sc && sc.s;
    if (scen) {
      report.scenario = { name: scen.name, kind: scen.kind, note: describeScenario(scen), manual: sc.manual };
      if (scen.kind === 'destroy') p.target = 90 + scen.btypes[scen.btypes.length - 1];
      if (scen.kind === 'reach' && p.type !== 'dungeon' && !p.prisoners) p.prisoners = 1;
    }
    let exitAt = null;
    if (scen && scen.kind === 'reach' && p.type === 'dungeon') exitAt = { x: scen.x, y: scen.y };
    for (let a = 0; a < (p.maxAttempts || 30); a++) {
      report.attempts = a + 1;
      const rng = RNG(hash32(p.seed, a));
      const plan = p.type === 'dungeon' ? planDungeon(G, M, p, rng, exitAt) : planBattle(G, M, p, rng);
      if (!plan) { report.tries.push('plan'); continue; }
      const res = wfc(M, plan.cg, plan.fixed, rng, { borderClass: plan.K.border, noRelax: ['building', 'exit', 'door'] });
      if (!res) { report.tries.push('wfc'); continue; }
      const map = new Uint8Array(4096);
      for (let i = 0; i < 4096; i++) { const t = M.tiles[res.tiles[i]]; map[i] = t === G.B ? 1 : t; }
      if (plan.placed) for (const b of plan.placed) core.placeBuilding(map, b.center, b.x, b.y, 1);
      if (p.type === 'dungeon') map[0] = 1;                      // признак подземелья (wlib1a.asm typMAP: LEV_T=1, если MAP[0]<>0)
      const libe = lib.find(e => e.name === (scen ? scen.name : '')) || lib.find(e => !e.hidden);
      const lv = core.newLevel(p.name || `gen_${p.type}_${p.seed}`, libe);
      lv.map = map;
      lv.script[core.HOFF.fsLAND] = p.land;
      lv.script[core.HOFF.MASTER] = p.master;
      if (scen && scen.land !== p.land) { const same = G.scenarios.find(s => s.land === p.land); const le = same && lib.find(e => e.name === same.name); if (le) lv.script[core.HOFF.COLOR] = le.bytes[core.HOFF.COLOR]; }
      // золото шахт (datMIN, 8 слов): шахт может быть больше, чем у уровня-образца - пустым даём среднее по образцу
      if (plan.mines) {
        const g = core.getMines(lv.script), nz = g.filter(v => v > 0).sort((x, y) => x - y), med = nz.length ? nz[nz.length >> 1] : 100;
        for (let k = 0; k < Math.min(8, plan.mines.length); k++) if (!g[k]) core.setMine(lv.script, k, med);
      }
      const hh = placeHeroes(G, p, plan, map, rng, scen);
      lv.heroes = hh.heroes;
      const tl = (p.master && scen && TASKS_KUNG[scen.kind]) || (scen && TASKS[scen.kind]) || TASKS.kill_all;
      lv.task = { lines: tl.slice(), tail: new Uint8Array(0) };
      lv.asmText = core.patchAsm(libe.asm, lv.script, lv.name, true);
      const checks = checkLevel(core, G, M, p, lv, plan, scen);
      report.checks = checks; report.resets = res.resets; report.relaxed = res.relaxed;
      const fatal = checks.filter(c => !c.ok && !c.soft);
      if (fatal.length) { report.tries.push('проверка: ' + fatal[0].msg); continue; }
      report.notes = hh.notes;
      const cnt = {}; for (const v of map) cnt[v] = (cnt[v] || 0) + 1;
      const SO = p.master ? 1 : 0;
      report.stats = { heroes: lv.heroes.length, own: lv.heroes.filter(h => h.side === SO).length, enemy: lv.heroes.filter(h => h.side === 1 - SO).length, prisoners: lv.heroes.filter(h => h.side >= 2).length };
      return { lv, report, plan };
    }
    return { error: tr('не удалось построить заготовку за {n} попыток', { n: report.attempts }), report };
  }

  return { setTranslator, describeScenario, RNG, hash32, valueNoise, fbm, buildModel, wfc, unknownPairs, bfs, cheapestPath, openMask, dropSmall,
    TYPES, DEFAULTS, scenariosFor, generate, modelFor, planBattle, planDungeon, brushStroke, path4, BRUSH_KINDS, RIVER_W, PAINT_CLASSES };
});
