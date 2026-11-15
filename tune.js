// Live tuning panel (C7, #108). Dev only: script.js loads this file only
// when the page has ?tune=1, and players never see it.
//
// It lists every key in TUNABLE_KEYS (the visual values read through cfg())
// with a slider, colour picker or text box. A change writes
// window.GAME_TUNING[key] straight away, so the next frame shows it. Nothing
// here can reach physics, spawning, scoring or hitboxes: those read
// GAME_CONFIG directly and are not in TUNABLE_KEYS.
//
//   Save   keeps the values in this browser (saveTuning(), the dino-tuning key)
//   Reset  puts every key back to its GAME_CONFIG default and saves that
//   Copy   copies the changed values as GAME_CONFIG lines, ready for a PR
//
// Workflow: open the game with ?tune=1, play, drag until it looks right,
// Copy, paste the lines into GAME_CONFIG in script.js, then Reset.

(function () {
  'use strict';
  if (typeof TUNABLE_KEYS === 'undefined' || document.getElementById('tune-panel')) return;
  window.GAME_TUNING = window.GAME_TUNING || {};
  const tuning = window.GAME_TUNING;

  const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
  const isRgb = (v) => typeof v === 'string' && /^\s*\d+\s*,\s*\d+\s*,\s*\d+\s*$/.test(v);
  const hex2 = (n) =>
    Math.max(0, Math.min(255, n | 0))
      .toString(16)
      .padStart(2, '0');
  const rgbToHex = (v) =>
    '#' +
    v
      .split(',')
      .map((n) => hex2(Number(n)))
      .join('');
  const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(', ');

  // A slider range that covers the default with room either side. Alphas
  // stay in 0..1; whole numbers (frames, counts, pixels) step by one.
  function rangeFor(key, def) {
    if (key.includes('ALPHA')) return { min: 0, max: 1, step: 0.005 };
    if (Number.isInteger(def)) return { min: 0, max: Math.max(def * 3, 10), step: 1 };
    const max = def <= 1 ? 1 : Math.ceil(def * 3);
    return { min: 0, max, step: max / 400 };
  }

  function current(key) {
    return Object.prototype.hasOwnProperty.call(tuning, key) ? tuning[key] : GAME_CONFIG[key];
  }

  function el(tag, props, children) {
    const node = document.createElement(tag);
    Object.assign(node, props || {});
    for (const c of children || []) node.append(c);
    return node;
  }

  const panel = el('div', { id: 'tune-panel' });
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Live tuning panel');
  panel.style.cssText =
    'position:fixed;top:8px;right:8px;z-index:1000;width:320px;max-width:calc(100vw - 16px);' +
    'max-height:calc(100vh - 16px);overflow:auto;background:rgba(255,255,255,0.97);' +
    'color:#222;border:1px solid #888;border-radius:6px;padding:8px;' +
    'font:12px/1.35 ui-monospace,Menlo,Consolas,monospace;box-shadow:0 2px 8px rgba(0,0,0,0.2)';
  // Typing a space in a box must not make the dino jump, and a click on the
  // panel must not reach the canvas.
  panel.addEventListener('keydown', (e) => e.stopPropagation());
  panel.addEventListener('click', (e) => e.stopPropagation());

  const status = el('span', { className: 'tune-status' });
  status.style.marginLeft = '6px';
  const button = (label, onClick) => {
    const b = el('button', { type: 'button', textContent: label });
    b.style.cssText = 'font:inherit;margin:0 4px 0 0;padding:2px 6px;cursor:pointer';
    b.addEventListener('click', onClick);
    return b;
  };
  const body = el('div');
  const filter = el('input', { type: 'search', placeholder: 'Filter keys' });
  filter.style.cssText = 'width:100%;box-sizing:border-box;font:inherit;margin:6px 0';
  const changes = el('textarea', { readOnly: true, rows: 3 });
  changes.setAttribute('aria-label', 'Changed values as GAME_CONFIG lines');
  changes.style.cssText = 'width:100%;box-sizing:border-box;font:inherit;margin-top:6px';

  const rows = [];

  function changedLines() {
    return TUNABLE_KEYS.filter((k) => Object.prototype.hasOwnProperty.call(tuning, k))
      .filter((k) => tuning[k] !== GAME_CONFIG[k])
      .map((k) => `  ${k}: ${JSON.stringify(tuning[k])},`);
  }

  function refresh(note) {
    const lines = changedLines();
    changes.value = lines.length ? lines.join('\n') : '// no changes from GAME_CONFIG';
    status.textContent = note || `${lines.length} changed`;
    for (const r of rows) r.sync();
  }

  function setValue(key, value) {
    if (value === GAME_CONFIG[key]) delete tuning[key];
    else tuning[key] = value;
    refresh();
  }

  function makeRow(key) {
    const def = GAME_CONFIG[key];
    const label = el('div', { textContent: key, title: `default ${JSON.stringify(def)}` });
    label.style.cssText = 'margin-top:6px;word-break:break-all';
    const controls = el('div');
    controls.style.cssText = 'display:flex;gap:4px;align-items:center';
    let sync;

    if (typeof def === 'number') {
      const r = rangeFor(key, def);
      const slider = el('input', { type: 'range', min: r.min, max: r.max, step: r.step });
      slider.setAttribute('aria-label', key);
      slider.style.flex = '1';
      const box = el('input', { type: 'number', step: 'any' });
      box.setAttribute('aria-label', key + ' value');
      box.style.cssText = 'width:80px;font:inherit';
      const onInput = (src) => {
        const v = Number(src.value);
        if (Number.isFinite(v)) setValue(key, v);
      };
      slider.addEventListener('input', () => onInput(slider));
      box.addEventListener('change', () => onInput(box));
      controls.append(slider, box);
      sync = () => {
        const v = current(key);
        slider.value = v;
        if (document.activeElement !== box) box.value = v;
      };
    } else if (isHex(def) || isRgb(def)) {
      const picker = el('input', { type: 'color' });
      picker.setAttribute('aria-label', key);
      picker.addEventListener('input', () =>
        setValue(key, isHex(def) ? picker.value : hexToRgb(picker.value))
      );
      const text = el('span');
      controls.append(picker, text);
      sync = () => {
        const v = current(key);
        picker.value = isHex(v) ? v.toLowerCase() : isRgb(v) ? rgbToHex(v) : '#000000';
        text.textContent = v;
      };
    } else {
      const box = el('input', { type: 'text' });
      box.setAttribute('aria-label', key);
      box.style.cssText = 'flex:1;font:inherit';
      box.addEventListener('change', () => setValue(key, box.value));
      controls.append(box);
      sync = () => {
        if (document.activeElement !== box) box.value = current(key);
      };
    }

    const undo = button('↺', () => setValue(key, def));
    undo.title = 'Back to default';
    undo.setAttribute('aria-label', `Reset ${key}`);
    controls.append(undo);
    const row = el('div', {}, [label, controls]);
    row.dataset.key = key;
    body.append(row);
    rows.push({
      key,
      row,
      sync() {
        sync();
        label.style.fontWeight = current(key) !== def ? 'bold' : 'normal';
      },
    });
  }

  for (const key of TUNABLE_KEYS) makeRow(key);

  filter.addEventListener('input', () => {
    const q = filter.value.trim().toUpperCase();
    for (const r of rows) r.row.style.display = !q || r.key.includes(q) ? '' : 'none';
  });

  const save = button('Save', () => refresh(saveTuning() ? 'saved' : 'kept for this visit'));
  const reset = button('Reset', () => {
    for (const k of TUNABLE_KEYS) delete tuning[k];
    saveTuning();
    refresh('back to defaults');
  });
  const copy = button('Copy', () => {
    const text = changes.value;
    const done = () => refresh('copied');
    const fallback = () => {
      changes.select();
      refresh('select and copy the box below');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else fallback();
  });
  const hide = button('Hide', () => {
    const hidden = body.style.display === 'none';
    body.style.display = hidden ? '' : 'none';
    filter.style.display = hidden ? '' : 'none';
    changes.style.display = hidden ? '' : 'none';
    hide.textContent = hidden ? 'Hide' : 'Show';
  });

  const title = el('strong', { textContent: 'Tuning' });
  title.style.marginRight = '6px';
  panel.append(el('div', {}, [title, save, reset, copy, hide, status]), filter, body, changes);
  document.body.append(panel);
  refresh();
})();
