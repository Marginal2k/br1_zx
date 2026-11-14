// Проверка модели редактора в node (вызывается из run_tests.py; можно и отдельно):
//   node editor/test/roundtrip.js <work>
// <work>/in/*.bin       - блоки: открыть -> сохранить без изменений -> побайтно равны; проект JSON туда и обратно;
//                         экспорт в каталог <work>/out/<имя>/ -> снова открыть каталог -> тот же блок
// <work>/src/<имя>/     - каталоги assets_src/levels_ext; <work>/expect/<имя>.bin - что из них собирает tools/levels.py
//                         открыть каталог -> блок равен ожидаемому; script.asm при экспорте - без изменений
// <work>/edit/          - уровни с правками (параметры, карта, герои, задание, чужой сценарий): JS-блок <work>/edit_js/<имя>.bin
//                         и каталог <work>/edit/<имя>/ - run_tests.py собирает каталог tools/levels.py и сравнивает
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), zlib = require('zlib');
const C = require('../js/core.js');

const ED = path.join(__dirname, '..');
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ED, 'data', 'brdata.js'), 'utf8'), ctx);
const D = ctx.window.BR_DATA;
C.initGlyphs(D.codeMain);
C.initLibrary(D.library);

const deflate = u => new Uint8Array(zlib.deflateSync(u));
const inflate = u => new Uint8Array(zlib.inflateSync(u));
const work = process.argv[2];
let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('ОШИБКА:', msg); } };
const readDir = d => { const f = {}; for (const n of fs.readdirSync(d)) { const p = path.join(d, n); if (fs.statSync(p).isFile()) f[n] = new Uint8Array(fs.readFileSync(p)); } return f; };
const writeDir = (d, files) => { fs.mkdirSync(d, { recursive: true }); for (const [n, u] of Object.entries(files)) fs.writeFileSync(path.join(d, n), u); };

(async () => {
  // 1. блоки
  const inDir = path.join(work, 'in');
  let nb = 0;
  for (const f of fs.readdirSync(inDir).filter(n => n.endsWith('.bin')).sort()) {
    const name = f.slice(0, -4), b = new Uint8Array(fs.readFileSync(path.join(inDir, f)));
    const lv = C.levelFromBlock(b, name);
    ok(C.eq(C.levelToBlock(lv), b), `${name}: блок -> уровень -> блок`);
    const pj = JSON.parse(JSON.stringify(C.levelToProject(lv)));
    ok(C.eq(C.levelToBlock(C.levelFromProject(pj)), b), `${name}: проект JSON`);
    const files = await C.levelToFolder(lv, deflate);
    if (lv.kind === 'data') {
      writeDir(path.join(work, 'out', name), files);
      const lv2 = await C.levelFromFolder(files, name, inflate);
      ok(C.eq(C.levelToBlock(lv2), b), `${name}: каталог (JS) -> блок`);
      const asm = C.unutf8(files['script.asm']);
      if (!/; 7A6B  /.test(asm)) console.log(`  (${name}: код задания в script.asm записан байтами - нет в библиотеке)`);
      ok(C.validate(lv).every(r => r.level !== 'error'), `${name}: проверка без ошибок: ` + C.validate(lv).filter(r => r.level === 'error').map(r => r.msg).join('; '));
    } else {
      writeDir(path.join(work, 'out'), files);
      console.log(`  (${name}: не блок данных - хранится как есть)`);
    }
    nb++;
  }
  console.log(`блоков проверено: ${nb}`);

  // 2. каталоги assets_src
  const srcDir = path.join(work, 'src');
  let nf = 0;
  for (const name of fs.readdirSync(srcDir).sort()) {
    const files = readDir(path.join(srcDir, name));
    const want = new Uint8Array(fs.readFileSync(path.join(work, 'expect', name + '.bin')));
    const lv = await C.levelFromFolder(files, name, inflate);
    ok(C.eq(C.levelToBlock(lv), want), `${name}: каталог assets_src -> блок = tools/levels.py import`);
    const out = await C.levelToFolder(lv, deflate);
    ok(C.eq(out['script.asm'], files['script.asm']), `${name}: script.asm при экспорте не меняется`);
    if (files['script.orig.asm']) ok(out['script.orig.asm'] && C.eq(out['script.orig.asm'], files['script.orig.asm']), `${name}: script.orig.asm сохранён`);
    for (const n of ['task.txt', 'map.csv', 'heroes.txt']) ok(C.eq(out[n], files[n]), `${name}: ${n} совпадает с исходным`);
    nf++;
  }
  console.log(`каталогов проверено: ${nf}`);

  // 3. правки: результат JS и игровых инструментов должен совпасть (сверяет run_tests.py)
  const lib = C.library();
  const pick = n => lib.find(e => e.name === n);
  const base = n => C.levelFromBlock(new Uint8Array(fs.readFileSync(path.join(inDir, n + '.bin'))), n);
  const edits = [];
  {
    const lv = base('human_05');
    C.setParam(lv.script, 'MONEY', 12345); C.setParam(lv.script, 'WOOD', 777); C.setParam(lv.script, 'fsMUS', 3); C.setMine(lv.script, 0, 999);
    lv.task.lines = ['Новое задание:', 'построй замок и', 'победи врага!'];
    lv.heroes.push({ side: 0, type: 4, x: 10, y: 10, extra: 0 }); lv.heroes.splice(0, 1);
    C.paintTile(lv.map, 20, 20, 2, 1);
    ok(C.placeBuilding(lv.map, 88, 30, 30, 1), 'здание 3x3 ставится');
    ok(C.placeBuilding(lv.map, 110, 40, 40, 1), 'здание 2x2 ставится');
    ok(C.validate(lv).every(r => !/здание|хвост/.test(r.msg)), 'здания целые: ' + C.validate(lv).map(r => r.msg).join('; '));
    edits.push(lv);
  }
  {
    const lv = base('kung_09');                         // с защитой TST -> убрать
    ok(C.hasProbe(lv.script), 'kung_09: защита найдена');
    C.cleanProbe(lv.script);
    ok(!C.hasProbe(lv.script), 'kung_09: защита убрана');
    lv.name = 'kung_09_clean'; edits.push(lv);
  }
  {
    const lv = base('w101');                            // уровень 1997 со сценарием 1999
    C.copyScript(lv, pick('human_10'), true);
    lv.name = 'w101_script_h10'; edits.push(lv);
  }
  {
    const lv = base('human_02');                        // сценарий из уровня 1997
    C.copyScript(lv, pick('w113'), false);
    lv.name = 'human_02_script_w113'; edits.push(lv);
  }
  {
    const lv = C.newLevel('new_level', pick('human_01'));
    lv.task.lines = ['Проверка', 'нового', 'уровня'];
    lv.heroes.push({ side: 0, type: 0, x: 5, y: 5, extra: 0 }, { side: 1, type: 13, x: 50, y: 50, extra: 0 });
    edits.push(lv);
  }
  {
    // уровень, у которого код задания не из библиотеки -> script.asm байтами
    const lv = base('human_03');
    lv.script[C.OFF_CODE + 20] = 0x27 ^ 0xFF;           // заведомо новый код
    lv.asmText = null; lv.name = 'human_03_raw'; edits.push(lv);
  }
  for (const lv of edits) {
    const b = C.levelToBlock(lv);
    fs.mkdirSync(path.join(work, 'edit_js'), { recursive: true });
    fs.writeFileSync(path.join(work, 'edit_js', lv.name + '.bin'), b);
    const files = await C.levelToFolder(lv, deflate);
    writeDir(path.join(work, 'edit', lv.name), files);
    const lv2 = await C.levelFromFolder(files, lv.name, inflate);
    ok(C.eq(C.levelToBlock(lv2), b), `${lv.name}: правки -> каталог (JS) -> тот же блок`);
  }
  console.log(`правленых уровней: ${edits.length}`);
  console.log(`проверок: ${checks}, ошибок: ${fails}`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
