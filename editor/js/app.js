/* Чёрный Ворон: интерфейс редактора уровней. Модель и форматы - js/core.js, данные игры - data/brdata.js. */
(function () {
  'use strict';
  const C = window.BRCore, D = window.BR_DATA;
  C.initGlyphs(D.codeMain);
  C.initLibrary(D.library);
  const $ = id => document.getElementById(id);
  const LIB = C.library();

  // ------------------------------------------------------------------ справочники
  const HSHIFT = [0, 1536, 2560, 3584, 4608, 6144, 7680, 9216, 12672, 0, 1536, 2560, 3584, 4608, 6144, 7680, 9216, 12672, 0, 1536, 3072, 4608, 6144, 7168, 8192, 0, 1440];
  const HMAS = Array(9).fill('wshum').concat(Array(9).fill('wsorc'), Array(7).fill('wscreat1'), Array(2).fill('wscreat2'));
  const HTYP = [1, 1, 1, 1, 1, 1, 1, 3, 3, 1, 1, 1, 1, 1, 1, 1, 3, 3, 1, 1, 1, 1, 1, 1, 2, 2, 2];
  // docs/FORMATS.md (метки WW?? в wlih.asm); 1/2 - крестьяне-лесоруб/золотодобытчик (роли в wmisc_1.asm NEWenm);
  // 9..17 - те же 9 типов из листа кунгов (wsorc), названия частью угаданы по картинкам
  const HNAME = ['крестьянин', 'крест.-лесоруб', 'крест.-золото', 'лучник', 'воин', 'священник', 'волшебник', 'катапульта', 'всадник',
    'пеон', 'пеон-лесоруб', 'пеон-золото', 'лучник кунгов', 'кунг', 'некромант', 'варлок', 'катапульта кунгов', 'грюнвер',
    'паук', 'скелет', 'скорпион', 'звезда', 'князь', 'Гризольда', 'костолом', 'демон', 'стеногрыз'];
  const SIDE_RGB = [[0, 150, 0], [220, 0, 0], [0, 80, 255], [0, 80, 255]];
  const SIDE_NAME = ['свои', 'враги', 'пленники', 'пленники (3)'];
  const DXY = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];   // где стоит хвост d относительно центра
  const ZX = C.ZXPAL;
  const raw = n => C.b64dec(D.sprites[n]);
  const SPR = { wshum: raw('wshum'), wsorc: raw('wsorc'), wscreat1: raw('wscreat1'), wscreat2: raw('wscreat2') };
  const LAND = {}; for (const k of Object.keys(D.land)) LAND[k] = C.b64dec(D.land[k]);
  const FONT = C.b64dec(D.font);

  // ------------------------------------------------------------------ состояние
  let lv = null, undo = [], redo = [], dirty = false;
  let tool = 'brush', mapTool = 'brush', curTile = 1, curBuild = 88, heroType = 4, heroSide = 0, selHero = -1;
  let view = { z: 1, ox: 0, oy: 0 }, hover = null, drag = null, spaceDown = false, issues = [], flash = null;
  const opt = { grid: false, heroes: true, pass: false, issues: true, mono: false };

  // ------------------------------------------------------------------ графика
  const atlasCache = new Map();
  function landColors() {
    if (opt.mono || !lv || lv.kind !== 'data') return [[0, 0, 0], [255, 255, 255]];
    const a = lv.script[C.HOFF.COLOR], br = (a >> 6) & 1;
    let ink = ZX[(a & 7) + 8 * br], paper = ZX[((a >> 3) & 7) + 8 * br];
    if (ink.join() === paper.join()) ink = paper.join() === '0,0,0' ? [255, 255, 255] : [0, 0, 0];
    return [ink, paper];
  }
  function landNo() { const L = lv && lv.kind === 'data' ? lv.script[C.HOFF.fsLAND] : 1; return L >= 1 && L <= 4 ? L : 1; }
  /** атлас 384 тайлов 16x16 (32 в ряд) для ландшафта и цвета */
  function atlas() {
    const [ink, paper] = landColors(), L = landNo(), key = L + ':' + ink + ':' + paper;
    if (atlasCache.has(key)) return atlasCache.get(key);
    const land = LAND[L], cv = document.createElement('canvas');
    cv.width = 512; cv.height = 192;
    const g = cv.getContext('2d'), im = g.createImageData(512, 192), d = im.data;
    for (let t = 0; t < 384; t++) {
      const tx = (t % 32) * 16, ty = (t >> 5) * 16;
      for (let k = 0; k < 2; k++) for (let l = 0; l < 16; l++) {
        const b = land[t * 32 + k * 16 + l];
        for (let bit = 0; bit < 8; bit++) {
          const c = (b >> (7 - bit)) & 1 ? ink : paper, o = ((ty + l) * 512 + tx + k * 8 + bit) * 4;
          d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
        }
      }
    }
    g.putImageData(im, 0, 0);
    atlasCache.set(key, cv);
    return cv;
  }
  function drawTileTo(g, t, x, y, size) {
    size = size || 16;
    if (t < 0 || t >= 384) { g.fillStyle = '#f0f'; g.fillRect(x, y, size, size); return; }
    g.drawImage(atlas(), (t % 32) * 16, (t >> 5) * 16, 16, 16, x, y, size, size);
  }
  const heroCache = new Map();
  function heroSprite(type, side) {
    const key = type + ':' + side;
    if (heroCache.has(key)) return heroCache.get(key);
    const cv = document.createElement('canvas'); cv.width = cv.height = 16;
    const g = cv.getContext('2d'), im = g.createImageData(16, 16), d = im.data;
    if (type <= 26) {
      const col = SIDE_RGB[Math.min(side, 3)], dat = SPR[HMAS[type]], nxt = HTYP[type] > 1 ? 16 : 0;
      for (let ii = 0; ii < 2; ii++) {
        const o = HSHIFT[type] + ii * (32 + nxt);
        for (let jj = 0; jj < 16; jj++) {
          const m = dat[o + jj * 2], h = m ^ dat[o + jj * 2 + 1];
          for (let bit = 0; bit < 8; bit++) if ((m >> (7 - bit)) & 1) {
            const c = (h >> (7 - bit)) & 1 ? col : [255, 255, 255], q = (jj * 16 + ii * 8 + bit) * 4;
            d[q] = c[0]; d[q + 1] = c[1]; d[q + 2] = c[2]; d[q + 3] = 255;
          }
        }
      }
    }
    g.putImageData(im, 0, 0);
    heroCache.set(key, cv);
    return cv;
  }
  /** здание целиком в canvas (3x3 или 2x2 клетки) */
  function buildingCanvas(center, scale) {
    const k = C.buildingKind(center), n = k === 8 ? 3 : 2, cv = document.createElement('canvas');
    cv.width = cv.height = n * 16 * scale;
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    const ox = k === 8 ? 1 : 1, oy = ox;    // центр: (1,1) у 3x3 и у 2x2 (правый нижний)
    drawTileTo(g, center, ox * 16 * scale, oy * 16 * scale, 16 * scale);
    for (let d = 0; d < k; d++) {
      const t = k === 8 ? (center - 78) * 8 + 128 + d : (center - 108) * 3 + 368 + d;
      drawTileTo(g, t, (ox + DXY[d][0]) * 16 * scale, (oy + DXY[d][1]) * 16 * scale, 16 * scale);
    }
    return cv;
  }
  function glyphCanvas(i, fg, bg) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 8;
    const g = cv.getContext('2d'), im = g.createImageData(8, 8), d = im.data;
    for (let r = 0; r < 8; r++) { const b = FONT[i * 8 + r]; for (let k = 0; k < 8; k++) { const c = (b >> (7 - k)) & 1 ? fg : bg, q = (r * 8 + k) * 4; d[q] = c[0]; d[q + 1] = c[1]; d[q + 2] = c[2]; d[q + 3] = 255; } }
    g.putImageData(im, 0, 0);
    return cv;
  }

  // ------------------------------------------------------------------ карта (offscreen 1024x1024)
  const mapCv = document.createElement('canvas'); mapCv.width = mapCv.height = 1024;
  const mg = mapCv.getContext('2d');
  function redrawMap(x0, y0, x1, y1) {
    if (!lv || lv.kind !== 'data') { mg.fillStyle = '#222'; mg.fillRect(0, 0, 1024, 1024); return; }
    x0 = Math.max(0, x0 === undefined ? 0 : x0); y0 = Math.max(0, y0 === undefined ? 0 : y0);
    x1 = Math.min(63, x1 === undefined ? 63 : x1); y1 = Math.min(63, y1 === undefined ? 63 : y1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) drawTileTo(mg, C.tileIndex(lv.map, x, y), x * 16, y * 16);
  }

  // ------------------------------------------------------------------ вид
  const cv = $('cv'), g = cv.getContext('2d');
  let drawPending = false;
  function scheduleDraw() { if (!drawPending) { drawPending = true; requestAnimationFrame(draw); } }
  function resize() { const r = cv.getBoundingClientRect(); cv.width = Math.round(r.width * devicePixelRatio); cv.height = Math.round(r.height * devicePixelRatio); scheduleDraw(); }
  function fit() {
    const w = cv.width / devicePixelRatio, h = cv.height / devicePixelRatio;
    const z = Math.max(0.25, Math.min(w, h) / 1024 * 0.96);
    view.z = z; view.ox = (w - 1024 * z) / 2; view.oy = (h - 1024 * z) / 2;
    scheduleDraw();
  }
  function zoomAt(f, mx, my) {
    const nz = Math.max(0.25, Math.min(8, view.z * f));
    view.ox = mx - (mx - view.ox) * nz / view.z; view.oy = my - (my - view.oy) * nz / view.z; view.z = nz;
    scheduleDraw();
  }
  function cellAt(e) {
    const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const x = Math.floor((mx - view.ox) / (16 * view.z)), y = Math.floor((my - view.oy) / (16 * view.z));
    return { x, y, mx, my, in: x >= 0 && y >= 0 && x < 64 && y < 64 };
  }
  function draw() {
    drawPending = false;
    const dpr = devicePixelRatio;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#111'; g.fillRect(0, 0, cv.width, cv.height);
    g.setTransform(dpr * view.z, 0, 0, dpr * view.z, dpr * view.ox, dpr * view.oy);
    g.imageSmoothingEnabled = false;
    g.drawImage(mapCv, 0, 0);
    if (!lv || lv.kind !== 'data') {
      g.fillStyle = '#ccc'; g.font = '28px sans-serif'; g.fillText(lv ? 'Не блок уровня: хранится как есть' : 'Откройте уровень', 300, 512);
      return;
    }
    const lw = 1 / view.z;
    if (opt.pass) {
      g.fillStyle = 'rgba(255,40,40,.35)';
      for (let i = 0; i < 4096; i++) { const v = lv.map[i]; if (!(v >= 1 && v < C.GO_MAX)) g.fillRect((i & 63) * 16, (i >> 6) * 16, 16, 16); }
    }
    if (opt.grid) {
      g.strokeStyle = 'rgba(128,128,128,.45)'; g.lineWidth = lw; g.beginPath();
      for (let i = 0; i <= 64; i++) { g.moveTo(i * 16, 0); g.lineTo(i * 16, 1024); g.moveTo(0, i * 16); g.lineTo(1024, i * 16); }
      g.stroke();
    }
    if (opt.heroes) {
      lv.heroes.forEach((h, k) => {
        if (h.x > 63 || h.y > 63) return;
        g.drawImage(heroSprite(h.type, h.side), h.x * 16, h.y * 16);
        g.strokeStyle = 'rgb(' + SIDE_RGB[Math.min(h.side, 3)] + ')'; g.lineWidth = Math.max(lw, 1);
        g.strokeRect(h.x * 16 + .5, h.y * 16 + .5, 15, 15);
        if (k === selHero) { g.strokeStyle = '#ffd23a'; g.lineWidth = 2.5 * lw + 1; g.strokeRect(h.x * 16 - 2, h.y * 16 - 2, 20, 20); }
      });
    }
    if (opt.issues) for (const r of issues) if (r.x !== undefined) {
      g.strokeStyle = r.level === 'error' ? '#ff3030' : '#ffc400'; g.lineWidth = 2 * lw + .5;
      g.strokeRect(r.x * 16 + 1, r.y * 16 + 1, 14, 14);
    }
    // призрак инструмента
    if (hover && hover.in) {
      if (tool === 'building' && C.buildingKind(curBuild)) {
        const ok = C.canPlaceBuilding(curBuild, hover.x, hover.y);
        g.globalAlpha = 0.7;
        g.drawImage(buildingCanvas(curBuild, 1), (hover.x - 1) * 16, (hover.y - 1) * 16);
        g.globalAlpha = 1;
        const n = C.buildingKind(curBuild) === 8 ? 3 : 2;
        g.strokeStyle = ok ? '#ffd23a' : '#ff3030'; g.lineWidth = 2 * lw;
        g.strokeRect((hover.x - 1) * 16, (hover.y - 1) * 16, n * 16, n * 16);
      } else if (tool === 'brush') {
        g.globalAlpha = 0.6; drawTileTo(g, curTile, hover.x * 16, hover.y * 16); g.globalAlpha = 1;
        g.strokeStyle = '#ffd23a'; g.lineWidth = 2 * lw; g.strokeRect(hover.x * 16, hover.y * 16, 16, 16);
      } else if (tool === 'hero' && !heroAt(hover.x, hover.y)) {
        g.globalAlpha = 0.6; g.drawImage(heroSprite(heroType, heroSide), hover.x * 16, hover.y * 16); g.globalAlpha = 1;
        g.strokeStyle = '#ffd23a'; g.lineWidth = 2 * lw; g.strokeRect(hover.x * 16, hover.y * 16, 16, 16);
      } else if (tool === 'erase') {
        const b = C.buildingAt(lv.map, hover.x, hover.y);
        g.strokeStyle = '#ff3030'; g.lineWidth = 2 * lw;
        if (b) { const n = C.buildingKind(b.center) === 8 ? 3 : 2; g.strokeRect((b.x - 1) * 16, (b.y - 1) * 16, n * 16, n * 16); }
        else g.strokeRect(hover.x * 16, hover.y * 16, 16, 16);
      } else {
        g.strokeStyle = '#ffd23a'; g.lineWidth = 2 * lw; g.strokeRect(hover.x * 16, hover.y * 16, 16, 16);
      }
    }
    if (drag && drag.kind === 'rect') {
      const [x0, y0, x1, y1] = rectOf(drag);
      g.fillStyle = 'rgba(255,210,58,.25)'; g.fillRect(x0 * 16, y0 * 16, (x1 - x0 + 1) * 16, (y1 - y0 + 1) * 16);
      g.strokeStyle = '#ffd23a'; g.lineWidth = 2 * lw; g.strokeRect(x0 * 16, y0 * 16, (x1 - x0 + 1) * 16, (y1 - y0 + 1) * 16);
    }
    if (flash) { g.strokeStyle = '#00e5ff'; g.lineWidth = 3 * lw + 1; g.strokeRect(flash.x * 16 - 6, flash.y * 16 - 6, 28, 28); }
    $('zVal').textContent = Math.round(view.z * 100) + '%';
  }
  const rectOf = d => [Math.min(d.x0, d.x1), Math.min(d.y0, d.y1), Math.max(d.x0, d.x1), Math.max(d.y0, d.y1)];
  function heroAt(x, y) { if (!lv || lv.kind !== 'data') return null; for (let k = lv.heroes.length - 1; k >= 0; k--) if (lv.heroes[k].x === x && lv.heroes[k].y === y) return k + 1; return null; }

  // ------------------------------------------------------------------ правки, отмена
  function snapshot() { undo.push(C.cloneLevel(lv)); if (undo.length > 200) undo.shift(); redo = []; setDirty(true); }
  function setDirty(v) { dirty = v; $('dirty').textContent = v ? '● есть несохранённые правки' : ''; }
  function doUndo() { if (!undo.length) return; redo.push(C.cloneLevel(lv)); lv = undo.pop(); setDirty(true); refreshAll(); }
  function doRedo() { if (!redo.length) return; undo.push(C.cloneLevel(lv)); lv = redo.pop(); setDirty(true); refreshAll(); }
  function editable() { return lv && lv.kind === 'data'; }

  function paintAt(x, y) {
    if (!(x >= 0 && y >= 0 && x < 64 && y < 64)) return;
    if (lv.map[y * 64 + x] === curTile && !C.buildingAt(lv.map, x, y)) return;
    C.paintTile(lv.map, x, y, curTile, 1);
    redrawMap(x - 2, y - 2, x + 2, y + 2);
  }
  function lineCells(x0, y0, x1, y1, f) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) { f(x0, y0); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  }

  // ------------------------------------------------------------------ мышь
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('wheel', e => { e.preventDefault(); const c = cellAt(e); zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, c.mx, c.my); }, { passive: false });
  cv.addEventListener('mousedown', e => {
    const c = cellAt(e);
    if (e.button === 1 || tool === 'hand' || spaceDown || !editable()) { drag = { kind: 'pan', mx: c.mx, my: c.my, ox: view.ox, oy: view.oy }; e.preventDefault(); return; }
    if (!c.in) return;
    if (e.button === 2) {           // ПКМ: взять тайл / удалить героя
      if (tool === 'hero') { const k = heroAt(c.x, c.y); if (k) { snapshot(); lv.heroes.splice(k - 1, 1); selHero = -1; changed('heroes'); } return; }
      const b = C.buildingAt(lv.map, c.x, c.y);
      if (b) { curBuild = b.center; setTool('building'); } else { curTile = lv.map[c.y * 64 + c.x]; if (curTile < 120) setTool('brush'); }
      refreshPalettes(); return;
    }
    if (e.button !== 0) return;
    if (tool === 'brush') { snapshot(); drag = { kind: 'paint', x: c.x, y: c.y }; paintAt(c.x, c.y); changed('map', true); }
    else if (tool === 'rect') { drag = { kind: 'rect', x0: c.x, y0: c.y, x1: c.x, y1: c.y }; scheduleDraw(); }
    else if (tool === 'building') {
      if (!C.canPlaceBuilding(curBuild, c.x, c.y)) { status('Здание сюда не помещается (слишком близко к краю карты)'); return; }
      snapshot(); C.placeBuilding(lv.map, curBuild, c.x, c.y, 1); redrawMap(c.x - 3, c.y - 3, c.x + 3, c.y + 3); changed('map');
    } else if (tool === 'erase') {
      const b = C.buildingAt(lv.map, c.x, c.y);
      if (b) { snapshot(); C.eraseBuilding(lv.map, b, 1); redrawMap(b.x - 3, b.y - 3, b.x + 3, b.y + 3); changed('map'); }
    } else if (tool === 'hero') {
      const k = heroAt(c.x, c.y);
      if (k) { selHero = k - 1; drag = { kind: 'hero', k: k - 1, moved: false }; refreshHeroes(); scheduleDraw(); }
      else {
        if (lv.heroes.length >= C.HER_MAX) { status(`Не больше ${C.HER_MAX} героев`); return; }
        snapshot(); lv.heroes.push({ side: heroSide, type: heroType, x: c.x, y: c.y, extra: 0 }); selHero = lv.heroes.length - 1; changed('heroes');
      }
    }
  });
  window.addEventListener('mousemove', e => {
    const c = cellAt(e);
    if (drag && drag.kind === 'pan') { view.ox = drag.ox + c.mx - drag.mx; view.oy = drag.oy + c.my - drag.my; scheduleDraw(); return; }
    if (e.target === cv || drag) {
      const nh = c.in ? c : null;
      if (!hover || !nh || hover.x !== nh.x || hover.y !== nh.y) { hover = nh; showHover(); scheduleDraw(); }
    }
    if (!drag || !c.in) return;
    if (drag.kind === 'paint' && (c.x !== drag.x || c.y !== drag.y)) { lineCells(drag.x, drag.y, c.x, c.y, paintAt); drag.x = c.x; drag.y = c.y; changed('map', true); }
    else if (drag.kind === 'rect') { drag.x1 = c.x; drag.y1 = c.y; scheduleDraw(); }
    else if (drag.kind === 'hero') {
      const h = lv.heroes[drag.k];
      if (h.x !== c.x || h.y !== c.y) { if (!drag.moved) { snapshot(); drag.moved = true; } h.x = c.x; h.y = c.y; changed('heroes', true); }
    }
  });
  window.addEventListener('mouseup', () => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.kind === 'rect') {
      const [x0, y0, x1, y1] = rectOf(d);
      snapshot();
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) C.paintTile(lv.map, x, y, curTile, 1);
      redrawMap(x0 - 2, y0 - 2, x1 + 2, y1 + 2);
      changed('map');
    } else if (d.kind === 'paint' || (d.kind === 'hero' && d.moved)) changed(d.kind === 'paint' ? 'map' : 'heroes');
    scheduleDraw();
  });
  cv.addEventListener('mouseleave', () => { if (!drag) { hover = null; scheduleDraw(); } });

  function showHover() {
    if (!hover || !editable()) { status(''); return; }
    const { x, y } = hover, v = lv.map[y * 64 + x], t = C.tileIndex(lv.map, x, y);
    let s = `<b>${x},${y}</b> · тайл <b>${v}</b>` + (t !== v ? ` (спрайт ${t})` : '') + ' · ' + (v >= 1 && v < C.GO_MAX ? 'проходимо' : v === 0 ? 'граница' : 'непроходимо');
    const b = C.buildingAt(lv.map, x, y);
    if (b) s += ` · здание ${b.center}, центр ${b.x},${b.y}`;
    const k = heroAt(x, y);
    if (k) { const h = lv.heroes[k - 1]; s += ` · герой №${k}: ${HNAME[h.type] || 'тип ' + h.type} (${h.type}), ${SIDE_NAME[h.side] || h.side}`; }
    status(s);
  }
  function status(html) { $('status').innerHTML = html; }

  // ------------------------------------------------------------------ клавиатура
  window.addEventListener('keydown', e => {
    const inField = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
    if ((e.ctrlKey || e.metaKey) && !inField) {
      if (e.key === 'z' || e.key === 'я') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
      if (e.key === 'y' || e.key === 'н') { e.preventDefault(); doRedo(); return; }
    }
    if (inField || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Space') { spaceDown = true; e.preventDefault(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selHero >= 0 && editable()) { snapshot(); lv.heroes.splice(selHero, 1); selHero = -1; changed('heroes'); return; }
    const k = { KeyB: 'brush', KeyR: 'rect', KeyU: 'building', KeyE: 'erase', KeyH: 'hand' }[e.code];
    if (k) { setTool(k); return; }
    if (e.key === '+' || e.key === '=') zoomAt(1.25, cv.clientWidth / 2, cv.clientHeight / 2);
    if (e.key === '-') zoomAt(0.8, cv.clientWidth / 2, cv.clientHeight / 2);
    if (e.key === '0') fit();
  });
  window.addEventListener('keyup', e => { if (e.code === 'Space') spaceDown = false; });

  // ------------------------------------------------------------------ вкладки и инструменты
  function setTab(t) {
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    document.querySelectorAll('.tab').forEach(s => s.classList.toggle('on', s.id === 'tab-' + t));
    if (t === 'heroes') setTool('hero'); else if (t === 'map' && tool === 'hero') setTool(mapTool);
    if (t === 'script') refreshScript();
    if (t === 'screen') refreshScreen();
  }
  document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  function setTool(t) {
    tool = t; if (t !== 'hero') mapTool = t;
    document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
    cv.style.cursor = t === 'hand' ? 'grab' : 'crosshair';
    refreshPalettes(); scheduleDraw();
  }
  document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
  for (const k of Object.keys(opt)) {
    const el = $('opt' + k[0].toUpperCase() + k.slice(1));
    el.checked = opt[k];
    el.addEventListener('change', () => { opt[k] = el.checked; if (k === 'mono') { redrawMap(); refreshPalettes(true); } scheduleDraw(); });
  }
  $('zIn').onclick = () => zoomAt(1.25, cv.clientWidth / 2, cv.clientHeight / 2);
  $('zOut').onclick = () => zoomAt(0.8, cv.clientWidth / 2, cv.clientHeight / 2);
  $('zFit').onclick = fit;

  // ------------------------------------------------------------------ палитры
  let palKey = '';
  function refreshPalettes(force) {
    const key = landNo() + ':' + landColors();
    if (force || key !== palKey) {
      palKey = key;
      const pt = $('palTiles'); pt.innerHTML = '';
      for (let t = 0; t < 120; t++) {
        const c = document.createElement('canvas'); c.width = c.height = 32; c.title = `тайл ${t}` + (t === 0 ? ' - граница' : t === 1 ? ' - фон' : '') + (t >= 1 && t < C.GO_MAX ? ' (проходим)' : ' (непроходим)');
        const cg = c.getContext('2d'); cg.imageSmoothingEnabled = false; drawTileTo(cg, t, 0, 0, 32);
        c.dataset.t = t; c.onclick = () => { curTile = t; setTool(tool === 'rect' ? 'rect' : 'brush'); };
        pt.appendChild(c);
      }
      const pb = $('palBuild'); pb.innerHTML = '';
      const used = BUILD_USED[landNo()] || [];
      const list = landNo() === 3 ? [] : [...Array(30).keys()].map(i => 78 + i).concat([108, 109, 110, 111, 112]);
      for (const b of list.sort((a, c) => (used.includes(c) - used.includes(a)) || a - c)) {
        const c = buildingCanvas(b, 1); c.title = `здание, центр ${b}` + (C.buildingKind(b) === 8 ? ' (3x3)' : ' (2x2)') + (used.includes(b) ? '' : ' - в уровнях игры не встречается');
        if (!used.includes(b)) c.style.opacity = .55;
        c.dataset.b = b; c.onclick = () => { curBuild = b; setTool('building'); };
        pb.appendChild(c);
      }
      if (!list.length) pb.innerHTML = '<p class="hint">У ландшафта 3 (подземелье) зданий нет.</p>';
      const ph = $('palHeroes'); ph.innerHTML = '';
      for (let t = 0; t <= 26; t++) {
        const d = document.createElement('div'); d.className = 'h'; d.dataset.t = t; d.title = `тип ${t}`;
        const c = document.createElement('canvas'); c.width = c.height = 32; const cg = c.getContext('2d'); cg.imageSmoothingEnabled = false;
        cg.fillStyle = '#ddd'; cg.fillRect(0, 0, 32, 32); cg.drawImage(heroSprite(t, heroSide), 0, 0, 32, 32);
        d.append(c, document.createTextNode(t + ' ' + HNAME[t]));
        d.onclick = () => { heroType = t; if (selHero >= 0 && editable()) { snapshot(); lv.heroes[selHero].type = t; changed('heroes'); } setTool('hero'); refreshPalettes(true); };
        ph.appendChild(d);
      }
    }
    document.querySelectorAll('#palTiles canvas').forEach(c => c.classList.toggle('on', +c.dataset.t === curTile && (tool === 'brush' || tool === 'rect')));
    document.querySelectorAll('#palBuild canvas').forEach(c => c.classList.toggle('on', +c.dataset.b === curBuild && tool === 'building'));
    document.querySelectorAll('#palHeroes .h').forEach(c => c.classList.toggle('on', +c.dataset.t === heroType));
    const cur = $('curTile'); cur.innerHTML = '';
    if (tool === 'building') { cur.append(buildingCanvas(curBuild, 1), document.createTextNode(`здание ${curBuild}`)); }
    else { const c = document.createElement('canvas'); c.width = c.height = 32; const cg = c.getContext('2d'); cg.imageSmoothingEnabled = false; drawTileTo(cg, curTile, 0, 0, 32); cur.append(c, document.createTextNode(`тайл ${curTile}`)); }
  }
  // центры зданий, встречающиеся в картах игры (по ландшафтам) - см. отчёт; остальные показываются бледно
  const BUILD_USED = {
    1: [78, 86, 87, 88, 89, 90, 91, 92, 93, 100, 101, 102, 103, 104, 105, 106, 110, 112],
    2: [78, 86, 87, 88, 89, 90, 91, 92, 93, 100, 101, 102, 103, 104, 105, 106, 107, 110, 112],
    4: [78, 86, 87, 88, 89, 90, 91, 92, 93, 100, 101, 102, 103, 104, 105, 106, 110, 112]
  };
  $('hSide').onchange = () => {
    heroSide = +$('hSide').value;
    if (selHero >= 0 && editable()) { snapshot(); lv.heroes[selHero].side = heroSide; changed('heroes'); }
    refreshPalettes(true);
  };

  // ------------------------------------------------------------------ герои: список и правка
  function refreshHeroes() {
    if (!editable()) { $('heroList').tBodies[0].innerHTML = ''; $('heroEdit').innerHTML = ''; return; }
    const tb = $('heroList').tBodies[0]; tb.innerHTML = '';
    lv.heroes.forEach((h, k) => {
      const tr = document.createElement('tr'); if (k === selHero) tr.className = 'on';
      tr.innerHTML = `<td>${k + 1}</td><td class="s${Math.min(h.side, 3)}">${h.side}</td><td>${h.type} ${HNAME[h.type] || ''}</td><td>${h.x}</td><td>${h.y}</td>`;
      tr.onclick = () => { selHero = k; goto(h.x, h.y, false); refreshHeroes(); };
      tb.appendChild(tr);
    });
    const per = [0, 0, 0, 0]; lv.heroes.forEach(h => { if (h.side < 4) per[h.side]++; });
    $('heroCount').textContent = `Героев: ${lv.heroes.length} из ${C.HER_MAX} · свои ${per[0]}, враги ${per[1]}, пленники ${per[2] + per[3]} (мест: 48 / 48 / 6)`;
    const he = $('heroEdit');
    if (selHero < 0 || selHero >= lv.heroes.length) { he.innerHTML = '<span class="hint">Герой не выбран</span>'; return; }
    const h = lv.heroes[selHero];
    he.innerHTML = `<b>Герой №${selHero + 1}</b>
      <div class="row">сторона <select id="heS">${[0, 1, 2, 3].map(s => `<option value="${s}"${s === h.side ? ' selected' : ''}>${s} - ${SIDE_NAME[s]}</option>`).join('')}</select>
      тип <select id="heT">${HNAME.map((n, t) => `<option value="${t}"${t === h.type ? ' selected' : ''}>${t} ${n}</option>`).join('')}</select></div>
      <div class="row">x <input id="heX" type="number" min="0" max="63" value="${h.x}"> y <input id="heY" type="number" min="0" max="63" value="${h.y}">
      extra <input id="heE" type="number" min="0" max="255" value="${h.extra}" title="5-й байт записи (игре не нужен)"> <button id="heDel">Удалить</button></div>`;
    const upd = (f, v) => { snapshot(); h[f] = v; changed('heroes'); };
    $('heS').onchange = e => upd('side', +e.target.value);
    $('heT').onchange = e => upd('type', +e.target.value);
    $('heX').onchange = e => upd('x', Math.max(0, Math.min(63, +e.target.value | 0)));
    $('heY').onchange = e => upd('y', Math.max(0, Math.min(63, +e.target.value | 0)));
    $('heE').onchange = e => upd('extra', Math.max(0, Math.min(255, +e.target.value | 0)));
    $('heDel').onclick = () => { snapshot(); lv.heroes.splice(selHero, 1); selHero = -1; changed('heroes'); };
  }

  // ------------------------------------------------------------------ параметры
  const INK = ['чёрный', 'синий', 'красный', 'пурпурный', 'зелёный', 'голубой', 'жёлтый', 'белый'];
  const P = {
    'Общие': [
      ['MASTER', 'Кто играет', 'sel', [[0, '0 - люди'], [1, '1 - кунги']]],
      ['LEVEL', 'Номер уровня', 'num', 0, 255],
      ['fsLAND', 'Ландшафт', 'sel', [[1, '1'], [2, '2'], [3, '3 - подземелье'], [4, '4']]],
      ['fsMUS', 'Мелодия <small>(0-7)</small>', 'num', 0, 7],
      ['MONEY', 'Деньги', 'num', 0, 999999],
      ['WOOD', 'Лес', 'num', 0, 999999],
      ['levTYP', 'Тип уровня', 'sel', [[0, '0 - обычный'], [1, '1 - атакованный охранник атакует'], [2, '2 - как 1 + охрана иногда нападает']]],
      ['COLOR', 'Цвет поля', 'color']],
    'Игрок': [
      ['hTOWER', 'Типов вооружения <small>(1-4)</small>', 'num', 0, 255], ['hARC', 'Луки <small>(0-2)</small>', 'num', 0, 255],
      ['hHORSE', 'Кони <small>(0-3)</small>', 'num', 0, 255], ['hSHILD', 'Щиты <small>(0-2)</small>', 'num', 0, 255],
      ['hBLADE', 'Клинки <small>(0-2)</small>', 'num', 0, 255], ['hmaxC', 'Заклинаний священника <small>(1-3)</small>', 'num', 0, 255],
      ['hmaxW', 'Заклинаний волшебника <small>(1-3)</small>', 'num', 0, 255], ['hmaxB1', 'Стандартных зданий <small>(0, 1-2)</small>', 'num', 0, 255],
      ['hmaxB2', 'Доп. зданий <small>(0-4)</small>', 'num', 0, 255], ['hWALL', 'Стены', 'sel', [[0, '0 - можно строить'], [17, '17 - нельзя']]]],
    'Компьютер': [
      ['kTOWER', 'Типов вооружения <small>(1-4)</small>', 'num', 0, 255], ['kARC', 'Луки <small>(0-2)</small>', 'num', 0, 255],
      ['kHORSE', 'Кони <small>(0-3)</small>', 'num', 0, 255], ['kSHILD', 'Щиты <small>(0-2)</small>', 'num', 0, 255],
      ['kBLADE', 'Клинки <small>(0-2)</small>', 'num', 0, 255], ['kmaxC', 'Заклинаний священника <small>(0 - нет)</small>', 'num', 0, 255],
      ['kmaxW', 'Заклинаний волшебника <small>(0 - нет)</small>', 'num', 0, 255], ['levMAX', 'Народу в группе <small>(1-10)</small>', 'num', 0, 255],
      ['levDEL', 'Задержка между сборами', 'num', 0, 255], ['lev1ST', 'Задержка первого сбора', 'num', 0, 255]]
  };
  function refreshParams() {
    const f = $('params');
    if (!editable()) { f.innerHTML = ''; return; }
    let h = '';
    for (const [grp, list] of Object.entries(P)) {
      h += `<fieldset><legend>${grp}</legend>`;
      for (const [n, label, kind, a, b] of list) {
        const v = C.getParam(lv.script, n);
        let ctl;
        if (kind === 'num') ctl = `<input type="number" data-p="${n}" min="${a}" max="${b}" value="${v}">`;
        else if (kind === 'sel') ctl = `<select data-p="${n}">${a.map(([x, t]) => `<option value="${x}"${x === v ? ' selected' : ''}>${t}</option>`).join('')}${a.some(o => o[0] === v) ? '' : `<option selected value="${v}">${v} (?)</option>`}</select>`;
        else {
          const ink = v & 7, paper = (v >> 3) & 7, br = (v >> 6) & 1;
          ctl = `<span>чернила <select data-c="ink">${INK.map((t, i) => `<option value="${i}"${i === ink ? ' selected' : ''}>${t}</option>`).join('')}</select>
            бумага <select data-c="paper">${INK.map((t, i) => `<option value="${i}"${i === paper ? ' selected' : ''}>${t}</option>`).join('')}</select>
            <label><input type="checkbox" data-c="br"${br ? ' checked' : ''}> ярк.</label></span>`;
        }
        h += `<div class="f"><span>${label} <small>${n}</small></span>${ctl}</div>`;
      }
      h += '</fieldset>';
    }
    const mines = C.getMines(lv.script);
    h += `<fieldset><legend>Золото шахт <small>datMIN, сотни; 65535 - нет шахты</small></legend><div class="mines">${mines.map((m, i) => `<input type="number" data-m="${i}" min="0" max="65535" value="${m}" title="шахта ${i + 1}">`).join('')}</div></fieldset>`;
    if (!C.digitsOk(lv.script, 'MONEY') || !C.digitsOk(lv.script, 'WOOD')) h += '<p class="hint">В деньгах или лесе есть «цифры» больше 9 - число в форме приблизительное; правка запишет обычные цифры.</p>';
    f.innerHTML = h;
    f.querySelectorAll('[data-p]').forEach(el => el.addEventListener('change', () => {
      const n = el.dataset.p; let v = +el.value;
      if (isNaN(v)) return;
      snapshot(); C.setParam(lv.script, n, v); changed(n === 'fsLAND' ? 'land' : 'params');
    }));
    f.querySelectorAll('[data-c]').forEach(el => el.addEventListener('change', () => {
      const ink = +f.querySelector('[data-c=ink]').value, paper = +f.querySelector('[data-c=paper]').value, br = f.querySelector('[data-c=br]').checked ? 1 : 0;
      const old = lv.script[C.HOFF.COLOR];
      snapshot(); lv.script[C.HOFF.COLOR] = (old & 0x80) | br << 6 | paper << 3 | ink; changed('land');
    }));
    f.querySelectorAll('[data-m]').forEach(el => el.addEventListener('change', () => { snapshot(); C.setMine(lv.script, +el.dataset.m, +el.value); changed('params'); }));
  }

  // ------------------------------------------------------------------ задание
  let lastTaskInput = null, taskSnap = false;
  function buildTask() {
    const box = $('taskRows'); box.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const r = document.createElement('div'); r.className = 'tr';
      r.innerHTML = `<input data-i="${i}" spellcheck="false"><span class="cnt"></span><span class="badch"></span>`;
      box.appendChild(r);
      const inp = r.querySelector('input');
      inp.addEventListener('focus', () => { lastTaskInput = inp; taskSnap = false; });
      inp.addEventListener('input', () => { if (!editable()) return; if (!taskSnap) { snapshot(); taskSnap = true; } lv.task.lines[i] = inp.value; changed('task', true); });
    }
    const gl = $('glyphs');
    for (let i = 0; i < D.codeMain.length; i++) {
      const c = glyphCanvas(i, [255, 255, 255], [0, 0, 0]); c.style.width = c.style.height = '20px';
      const ch = C.glyphChar(i); c.title = `${i}: ${ch}`;
      c.onclick = () => {
        const inp = lastTaskInput || $('taskRows').querySelector('input');
        const s = inp.selectionStart ?? inp.value.length, e = inp.selectionEnd ?? s;
        inp.value = inp.value.slice(0, s) + ch + inp.value.slice(e); inp.focus(); inp.setSelectionRange(s + ch.length, s + ch.length);
        inp.dispatchEvent(new Event('input'));
      };
      gl.appendChild(c);
    }
  }
  function refreshTask(skipInputs) {
    if (!editable()) return;
    const rows = $('taskRows').querySelectorAll('.tr'), chk = C.taskCheck(lv.task);
    rows.forEach((r, i) => {
      const inp = r.querySelector('input'), res = chk.lines[i];
      if (!skipInputs || document.activeElement !== inp) inp.value = lv.task.lines[i];
      const n = res.glyphs.length + res.bad.length;
      const cnt = r.querySelector('.cnt'); cnt.textContent = `${n}/${C.TASK_W}`; cnt.classList.toggle('over', n > C.TASK_W);
      inp.classList.toggle('bad', res.bad.length > 0);
      r.querySelector('.badch').textContent = res.bad.length ? 'нет в шрифте: ' + [...new Set(res.bad.map(b => '«' + b.ch + '»'))].join(' ') : '';
    });
    $('taskTotal').textContent = `Всего ${chk.bytes} байт из ${C.TASK_LEN} (с тремя признаками конца строки)` + (lv.task.tail.length ? ` · хвост старого текста: ${lv.task.tail.length} байт (игра не читает, сохраняется)` : '');
    $('taskTotal').style.color = chk.bytes > C.TASK_LEN ? 'var(--err)' : '';
    const pc = $('taskPreview'), pg = pc.getContext('2d');
    pg.fillStyle = '#000'; pg.fillRect(0, 0, 160, 24);
    chk.lines.forEach((r, y) => r.glyphs.slice(0, 20).forEach((gi, x) => { if (gi * 8 + 8 <= FONT.length) pg.drawImage(glyphCanvas(gi, [255, 255, 0], [0, 0, 0]), x * 8, y * 8); }));
  }

  // ------------------------------------------------------------------ сценарий
  function refreshLibSel() {
    const s = $('libSel'); s.innerHTML = '';
    for (const set of ['1997', '1999']) {
      const og = document.createElement('optgroup'); og.label = set === '1997' ? 'Уровни 1997 г.' : 'Доп. уровни 1999 г.';
      LIB.filter(e => e.set === set && !e.hidden).forEach(e => {
        const o = document.createElement('option'); o.value = e.name;
        const t = (e.task.match(/\|(.*)\|/) || ['', ''])[1].trim();
        o.textContent = e.name + (t ? ' - ' + t : ''); og.appendChild(o);
      });
      s.appendChild(og);
    }
  }
  function refreshScript() {
    if (!editable()) { $('scriptInfo').textContent = ''; $('asmView').textContent = ''; return; }
    let asm, err = null;
    try { asm = C.scriptAsm(lv); } catch (e) { err = e.message; }
    const m = C.libraryMatch(lv.script), probe = C.hasProbe(lv.script);
    let h = m ? `Код задания совпадает с уровнем <b>${m.name}</b>.` : 'Код задания не найден в библиотеке: в script.asm он будет записан байтами (DEFB) - это собирается так же.';
    if (lv.asmText && !m) h = 'Код задания - из открытого script.asm.';
    h += probe ? '<br><span style="color:var(--warn)">В pcINI проверка контрольной суммы (защита TST 1999 г.): в нашей сборке игры уровень через несколько секунд сломается. Нажмите «Убрать защиту TST».</span>' : '';
    if (err) h += `<br><span style="color:var(--err)">${err}</span>`;
    $('scriptInfo').innerHTML = h;
    $('bClean').disabled = !probe;
    $('asmView').textContent = asm ? C.codeListing(asm) : '';
  }
  $('bCopyScript').onclick = () => {
    if (!editable()) return;
    const src = LIB.find(e => e.name === $('libSel').value);
    if (!src) return;
    snapshot(); C.copyScript(lv, src, $('libParams').checked); changed('land'); refreshScript();
    status(`Сценарий взят из ${src.name}` + ($('libParams').checked ? ' вместе с параметрами вооружения и ИИ' : ''));
  };
  $('bClean').onclick = () => { if (!editable()) return; snapshot(); C.cleanProbe(lv.script); changed('params'); refreshScript(); };

  // ------------------------------------------------------------------ экран
  function refreshScreen() {
    const c = $('scrView'), sg = c.getContext('2d');
    if (!editable()) { sg.clearRect(0, 0, 256, 192); return; }
    const idx = C.scrToIndexed(lv.screen), im = sg.createImageData(256, 192);
    for (let i = 0; i < idx.length; i++) { const p = ZX[idx[i]]; im.data.set([p[0], p[1], p[2], 255], i * 4); }
    sg.putImageData(im, 0, 0);
  }
  $('fScr').onchange = async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f || !editable()) return;
    try {
      const u = new Uint8Array(await f.arrayBuffer());
      let scr;
      if (/\.scr$/i.test(f.name)) { if (u.length !== 6912) throw new Error(`.scr: ${u.length} байт вместо 6912`); scr = u; }
      else { const im = await C.decodePng(u, inflate); if (im.w !== 256 || im.h !== 192) throw new Error(`PNG ${im.w}x${im.h}, нужен 256x192`); scr = C.rgbToScr(im.rgba, 4, lv.screen); }
      snapshot(); lv.screen = Uint8Array.from(scr); changed('screen'); refreshScreen();
    } catch (err) { alert(err.message); }
  };

  // ------------------------------------------------------------------ проверка
  function refreshIssues() {
    issues = lv ? C.validate(lv) : [];
    const ul = $('issues'); ul.innerHTML = '';
    if (!issues.length) ul.innerHTML = '<li class="okk">✔ Ошибок и предупреждений нет</li>';
    for (const r of issues) {
      const li = document.createElement('li'); li.className = r.level;
      li.textContent = r.msg + (r.x !== undefined ? `  [${r.x},${r.y}]` : '');
      if (r.x !== undefined) li.onclick = () => goto(r.x, r.y, true);
      ul.appendChild(li);
    }
    const ne = issues.filter(r => r.level === 'error').length, nw = issues.length - ne, b = $('chkBadge');
    b.textContent = ne ? `✖${ne}` : nw ? `▲${nw}` : '';
    b.className = ne ? 'err' : nw ? 'warn' : '';
  }
  function goto(x, y, zoom) {
    const w = cv.clientWidth, h = cv.clientHeight;
    if (zoom && view.z < 2) view.z = 2;
    view.ox = w / 2 - (x * 16 + 8) * view.z; view.oy = h / 2 - (y * 16 + 8) * view.z;
    flash = { x, y }; scheduleDraw();
    setTimeout(() => { flash = null; scheduleDraw(); }, 1200);
  }

  // ------------------------------------------------------------------ общее обновление
  let issueTimer = null;
  function changed(what, light) {
    setDirty(true);
    if (what === 'land') { redrawMap(); refreshPalettes(); refreshParams(); }
    if (what === 'heroes') refreshHeroes();
    if (what === 'task') refreshTask(true);
    if (what === 'params' || what === 'land') refreshParams();
    clearTimeout(issueTimer);
    issueTimer = setTimeout(refreshIssues, light ? 250 : 0);
    scheduleDraw();
  }
  function refreshAll() {
    $('lvName').value = lv ? lv.name : '';
    redrawMap(); refreshPalettes(true); refreshHeroes(); refreshParams(); refreshTask(); refreshScript(); refreshScreen(); refreshIssues(); scheduleDraw();
    document.title = (lv ? lv.name + ' - ' : '') + 'Редактор уровней Black Raven';
  }
  function setLevel(l, msg) {
    lv = l; undo = []; redo = []; selHero = -1; setDirty(false);
    if (lv.kind === 'data' && lv.task.lines.length !== 3) lv.task.lines = (lv.task.lines.concat(['', '', ''])).slice(0, 3);
    atlasCache.clear(); refreshAll(); fit();
    status(msg || '');
  }
  $('lvName').addEventListener('change', () => {
    const v = $('lvName').value.trim().replace(/[^\w.-]+/g, '_');
    if (!lv || !v) return; lv.name = v; $('lvName').value = v; setDirty(true); refreshScript();
  });

  // ------------------------------------------------------------------ файлы
  async function streamThrough(u, ts) { const s = new Blob([u]).stream().pipeThrough(ts); return new Uint8Array(await new Response(s).arrayBuffer()); }
  const deflate = u => streamThrough(u, new CompressionStream('deflate'));
  const inflate = u => streamThrough(u, new DecompressionStream('deflate'));
  function download(name, data, type) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: type || 'application/octet-stream' })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  function confirmDiscard() { return !dirty || confirm('Есть несохранённые правки. Продолжить без сохранения?'); }

  $('fBin').onchange = async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f || !confirmDiscard()) return;
    try {
      const l = C.levelFromBlock(new Uint8Array(await f.arrayBuffer()), f.name.replace(/\.bin$/i, ''));
      setLevel(l, l.kind === 'raw' ? 'Это не блок данных уровня (код концовки или испорченный блок): его можно только сохранить как есть.' : `Открыт блок ${f.name}`);
    } catch (err) { alert(err.message); }
  };
  $('fDir').onchange = async e => {
    const files = Array.from(e.target.files); e.target.value = '';
    if (!files.length || !confirmDiscard()) return;
    const dirs = new Map();
    for (const f of files) { const p = (f.webkitRelativePath || f.name).split('/'); const d = p.slice(0, -1).join('/'); if (!dirs.has(d)) dirs.set(d, []); dirs.get(d).push(f); }
    const cand = [...dirs.keys()].filter(d => dirs.get(d).some(f => f.name === 'script.asm')).sort();
    if (!cand.length) { alert('В выбранном каталоге нет script.asm (нужен каталог уровня: assets_src/levels_ext/<имя>/ или сам levels_ext).'); return; }
    let d = cand[0];
    if (cand.length > 1) {
      d = await ask('Какой уровень открыть?', `<select id="dlgSel" size="12">${cand.map((c, i) => `<option value="${c}"${i ? '' : ' selected'}>${c.split('/').pop()}</option>`).join('')}</select>`, () => $('dlgSel').value);
      if (!d) return;
    }
    try {
      const fm = {};
      for (const f of dirs.get(d)) fm[f.name] = new Uint8Array(await f.arrayBuffer());
      const l = await C.levelFromFolder(fm, d.split('/').pop() || 'level', inflate);
      setLevel(l, `Открыт каталог ${d}`);
    } catch (err) { alert(err.message); }
  };
  $('fPrj').onchange = async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f || !confirmDiscard()) return;
    try { setLevel(C.levelFromProject(JSON.parse(await f.text())), `Открыт проект ${f.name}`); } catch (err) { alert(err.message); }
  };
  $('bSavePrj').onclick = () => {
    if (!lv) return;
    download(lv.name + '.brlevel.json', JSON.stringify(C.levelToProject(lv), null, 1), 'application/json');
    setDirty(false);
  };
  function preExport() {
    if (!lv) return false;
    refreshIssues();
    const errs = issues.filter(r => r.level === 'error');
    if (errs.length && !confirm(`Проверка нашла ошибки (${errs.length}):\n\n` + errs.slice(0, 12).map(r => '• ' + r.msg).join('\n') + '\n\nВсё равно экспортировать? (игра может работать неправильно)')) { setTab('check'); return false; }
    return true;
  }
  $('bExpBin').onclick = () => {
    if (!preExport()) return;
    try { download(lv.name + '.bin', C.levelToBlock(lv)); status(`Записан ${lv.name}.bin (${C.BLOCK} байт)`); } catch (err) { alert(err.message); }
  };
  /** preview.png как у tools/maps.py render_preview: тайлы ч/б + герои */
  async function previewPng() {
    const c = document.createElement('canvas'); c.width = c.height = 1024;
    const pg = c.getContext('2d'); const keep = opt.mono; opt.mono = true;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) drawTileTo(pg, C.tileIndex(lv.map, x, y), x * 16, y * 16);
    opt.mono = keep;
    for (const h of lv.heroes) if (h.x < 64 && h.y < 64) { pg.drawImage(heroSprite(h.type, h.side), h.x * 16, h.y * 16); pg.strokeStyle = 'rgb(' + SIDE_RGB[Math.min(h.side, 3)] + ')'; pg.strokeRect(h.x * 16 + .5, h.y * 16 + .5, 15, 15); }
    const b = await new Promise(r => c.toBlob(r, 'image/png'));
    return new Uint8Array(await b.arrayBuffer());
  }
  $('bExpDir').onclick = async () => {
    if (!preExport()) return;
    let files;
    try { files = await C.levelToFolder(lv, deflate); if (lv.kind === 'data') files['preview.png'] = await previewPng(); } catch (err) { alert(err.message); return; }
    if (window.showDirectoryPicker) {
      try {
        const parent = await window.showDirectoryPicker({ id: 'br-levels', mode: 'readwrite' });
        let dir = parent;
        if (lv.kind === 'data') {
          let exists = true;
          try { await parent.getDirectoryHandle(lv.name); } catch (e) { exists = false; }
          if (exists && !confirm(`Каталог «${lv.name}» уже есть в «${parent.name}». Перезаписать файлы уровня в нём?`)) return;
          dir = await parent.getDirectoryHandle(lv.name, { create: true });
        }
        for (const [n, u] of Object.entries(files)) { const fh = await dir.getFileHandle(n, { create: true }); const w = await fh.createWritable(); await w.write(u); await w.close(); }
        status(`Записан каталог ${parent.name}/${lv.kind === 'data' ? lv.name + '/' : ''} (${Object.keys(files).join(', ')})`);
        setDirty(false);
        return;
      } catch (err) { if (err.name === 'AbortError') return; console.warn(err); }
    }
    const z = {}; for (const [n, u] of Object.entries(files)) z[(lv.kind === 'data' ? lv.name + '/' : '') + n] = u;
    download(lv.name + '.zip', C.zipStore(z), 'application/zip');
    status(`Записан ${lv.name}.zip: распакуйте в assets_src/levels_ext/`);
  };
  $('bNew').onclick = async () => {
    if (!confirmDiscard()) return;
    const opts = LIB.filter(e => !e.hidden).map(e => `<option value="${e.name}"${e.name === 'human_01' ? ' selected' : ''}>${e.name}</option>`).join('');
    const r = await ask('Новый уровень', `<p>Имя (для каталога levels_ext): <input id="dlgName" value="human_new"></p>
      <p>Сценарий и параметры взять из уровня:</p><select id="dlgLib" size="10">${opts}</select>
      <p class="hint">Карта - фон 1 с границей 0, героев нет, экран чёрный.</p>`, () => [$('dlgName').value.trim() || 'new_level', $('dlgLib').value]);
    if (!r) return;
    const l = C.newLevel(r[0].replace(/[^\w.-]+/g, '_'), LIB.find(e => e.name === r[1]));
    setLevel(l, 'Новый уровень');
    setDirty(true);
  };
  $('bUndo').onclick = doUndo; $('bRedo').onclick = doRedo;
  window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  function ask(title, html, get) {
    return new Promise(res => {
      const d = $('dlg');
      $('dlgBody').innerHTML = `<h3>${title}</h3>` + html;
      d.returnValue = '';
      d.onclose = () => res(d.returnValue === 'ok' ? get() : null);
      d.showModal();
    });
  }

  // ------------------------------------------------------------------ старт
  buildTask(); refreshLibSel();
  new ResizeObserver(resize).observe(cv);
  resize();
  const start = LIB.find(e => e.name === 'human_01') || LIB[0];
  setLevel(C.newLevel('human_new', start), 'Пустой уровень. Откройте .bin, каталог уровня или проект - кнопки сверху.');
  // для отладки из консоли
  window.BRApp = { get level() { return lv; }, setLevel, goto, setTab, setTool };
})();
