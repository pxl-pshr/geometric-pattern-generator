/* Geometric Pattern Generator: UI, sharing, history and export. */
(function () {
  'use strict';

  const { PALETTES, STYLES, DEFAULT_BACKGROUND, randomSeed, createPattern, renderToCanvas, renderToSVG } = window.GeoGen;

  const FORMATS = [
    { id: 'screen', label: 'Fit screen' },
    { id: 'square', label: '1:1', width: 1080, height: 1080 },
    { id: 'portrait', label: '4:5', width: 1080, height: 1350 },
    { id: 'story', label: '9:16', width: 1080, height: 1920 },
    { id: 'landscape', label: '16:9', width: 1920, height: 1080 },
    { id: 'a4', label: 'A4', width: 1240, height: 1754 },
    { id: 'custom', label: 'Custom' },
  ];
  const BACKGROUNDS = { dark: DEFAULT_BACKGROUND, light: '#F4F1EA', transparent: null };
  const EXPORT_SCALES = [1, 2, 3, 4];
  const SIZE_MIN = 64;
  const SIZE_MAX = 8192;
  const TEXTURE_MIN = 0.5;
  const TEXTURE_MAX = 3;
  const SEED_MAX_LENGTH = 64;
  const HISTORY_LIMIT = 200;
  const STORAGE_KEY = 'geogen:options';

  // Browsers refuse to allocate canvases past these; iOS Safari caps at 16.7 MP.
  const MAX_CANVAS_SIDE = 16384;
  const MAX_CANVAS_AREA = isAppleMobile() ? 16777216 : 134217728;

  const DEFAULTS = Object.freeze({
    format: 'screen',
    customWidth: 1920,
    customHeight: 1080,
    palette: 'random',
    styles: Object.freeze(STYLES.map((s) => s.id)),
    background: 'dark',
    texture: 1,
    exportScale: 2,
  });

  const $ = (id) => document.getElementById(id);
  const el = {
    stage: $('stage'),
    canvas: $('canvas'),
    seedForm: $('seed-form'),
    seedInput: $('seed-input'),
    prevBtn: $('prev-btn'),
    nextBtn: $('next-btn'),
    generateBtn: $('generate-btn'),
    copyLinkBtn: $('copy-link-btn'),
    optionsBtn: $('options-btn'),
    savePngBtn: $('save-png-btn'),
    saveSvgBtn: $('save-svg-btn'),
    panel: $('options-panel'),
    closeOptionsBtn: $('close-options-btn'),
    summary: $('summary'),
    formatChips: $('format-chips'),
    customSize: $('custom-size'),
    customWidth: $('custom-width'),
    customHeight: $('custom-height'),
    paletteList: $('palette-list'),
    styleChips: $('style-chips'),
    backgroundChips: $('background-chips'),
    customBg: $('custom-bg'),
    customBgChip: $('custom-bg-chip'),
    textureRange: $('texture-range'),
    textureValue: $('texture-value'),
    exportChips: $('export-chips'),
    exportHint: $('export-hint'),
    resetBtn: $('reset-btn'),
    toast: $('toast'),
  };

  let options = sanitize(null);
  let seed = '';
  let pattern = null;
  let lastOpaqueBackground = 'dark';
  let exporting = false;
  const timeline = { seeds: [], index: -1 };

  // ---------------------------------------------------------------------------
  // Options

  function clamp(v, min, max) {
    return Math.min(Math.max(v, min), max);
  }

  function isAppleMobile() {
    return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function isNamedBackground(bg) {
    return Object.prototype.hasOwnProperty.call(BACKGROUNDS, bg);
  }

  /** Coerce untrusted input (URL, localStorage) into a valid options object. */
  function sanitize(raw) {
    const o = { ...DEFAULTS, styles: [...DEFAULTS.styles] };
    if (!raw || typeof raw !== 'object') return o;

    if (FORMATS.some((f) => f.id === raw.format)) o.format = raw.format;
    const width = parseInt(raw.customWidth, 10);
    const height = parseInt(raw.customHeight, 10);
    if (width > 0) o.customWidth = clamp(width, SIZE_MIN, SIZE_MAX);
    if (height > 0) o.customHeight = clamp(height, SIZE_MIN, SIZE_MAX);
    if (raw.palette === 'random' || PALETTES.some((p) => p.id === raw.palette)) o.palette = raw.palette;
    if (Array.isArray(raw.styles)) {
      const styles = DEFAULTS.styles.filter((id) => raw.styles.includes(id));
      if (styles.length) o.styles = styles;
    }
    if (typeof raw.background === 'string') {
      if (isNamedBackground(raw.background)) o.background = raw.background;
      else if (/^#[0-9a-f]{6}$/i.test(raw.background)) o.background = raw.background.toLowerCase();
    }
    const t = parseFloat(raw.texture);
    if (Number.isFinite(t)) o.texture = clamp(Math.round(t * 4) / 4, TEXTURE_MIN, TEXTURE_MAX);
    if (EXPORT_SCALES.includes(Number(raw.exportScale))) o.exportScale = Number(raw.exportScale);
    return o;
  }

  function loadStoredOptions() {
    try {
      return sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY)));
    } catch (e) {
      return sanitize(null);
    }
  }

  function storeOptions() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
    } catch (e) {
      // Private mode or storage disabled: options just won't persist.
    }
  }

  function setOptions(patch) {
    options = sanitize({ ...options, ...patch });
    if (options.background !== 'transparent') lastOpaqueBackground = options.background;
    storeOptions();
    render();
    syncUrlSoon();
  }

  function backgroundColor() {
    return isNamedBackground(options.background) ? BACKGROUNDS[options.background] : options.background;
  }

  // ---------------------------------------------------------------------------
  // URL: #seed=A7bX9mK2&format=square&palette=ocean&styles=dots,waves&bg=light&texture=1.5

  function readHash() {
    const hash = location.hash.slice(1);
    if (!hash) return null;
    if (!hash.includes('=')) {
      const bare = safeDecode(hash).trim();
      return bare ? { seed: bare.slice(0, SEED_MAX_LENGTH), options: null } : null;
    }
    const params = new URLSearchParams(hash);
    const s = (params.get('seed') || '').trim();
    if (!s) return null;

    const raw = {};
    const size = /^(\d+)x(\d+)$/.exec(params.get('size') || '');
    if (size) {
      raw.format = 'custom';
      raw.customWidth = size[1];
      raw.customHeight = size[2];
    } else if (params.has('format')) {
      raw.format = params.get('format');
    }
    if (params.has('palette')) raw.palette = params.get('palette');
    if (params.has('styles')) raw.styles = params.get('styles').split(',');
    if (params.has('bg')) {
      const bg = params.get('bg');
      raw.background = /^[0-9a-f]{6}$/i.test(bg) ? '#' + bg : bg;
    }
    if (params.has('texture')) raw.texture = params.get('texture');
    return { seed: s.slice(0, SEED_MAX_LENGTH), options: raw };
  }

  function safeDecode(str) {
    try {
      return decodeURIComponent(str);
    } catch (e) {
      return str;
    }
  }

  /**
   * The hash for the current pattern. With `share`, "Fit screen" is pinned to
   * the current size so whoever opens the link sees exactly this image.
   */
  function hashFor({ share = false } = {}) {
    const parts = [['seed', seed]];
    if (options.format === 'custom' || (share && options.format === 'screen')) {
      const { width, height } = designSize();
      parts.push(['size', width + 'x' + height]);
    } else if (options.format !== 'screen') {
      parts.push(['format', options.format]);
    }
    if (options.palette !== 'random') parts.push(['palette', options.palette]);
    if (options.styles.length !== STYLES.length) parts.push(['styles', options.styles.join(',')]);
    if (options.background !== 'dark') parts.push(['bg', options.background.replace('#', '')]);
    if (options.texture !== 1) parts.push(['texture', String(options.texture)]);
    return '#' + parts.map(([k, v]) => k + '=' + encodeURIComponent(v).replace(/%2C/g, ',')).join('&');
  }

  // Safari throws if replaceState runs more than ~100 times in 30s (holding
  // Space, dragging a slider), so URL updates are debounced.
  let urlTimer = 0;
  function syncUrlSoon() {
    clearTimeout(urlTimer);
    urlTimer = setTimeout(() => {
      const hash = hashFor();
      if (location.hash === hash) return;
      try {
        history.replaceState(null, '', hash);
      } catch (e) {
        // Not fatal: the address bar just lags behind.
      }
    }, 250);
  }

  function applyLink(link, keepExportScale) {
    options = sanitize({ ...(link.options || {}), exportScale: keepExportScale });
    if (options.background !== 'transparent') lastOpaqueBackground = options.background;
    show(link.seed);
  }

  // ---------------------------------------------------------------------------
  // Patterns and history

  function designSize() {
    if (options.format === 'screen') {
      return { width: Math.max(1, el.stage.clientWidth), height: Math.max(1, el.stage.clientHeight) };
    }
    if (options.format === 'custom') return { width: options.customWidth, height: options.customHeight };
    const f = FORMATS.find((x) => x.id === options.format);
    return { width: f.width, height: f.height };
  }

  function layout() {
    const { width, height } = designSize();
    return createPattern(seed, width, height, { palette: options.palette, styles: options.styles });
  }

  function show(newSeed, { record = true } = {}) {
    if (record && newSeed !== timeline.seeds[timeline.index]) {
      timeline.seeds.splice(timeline.index + 1);
      timeline.seeds.push(newSeed);
      if (timeline.seeds.length > HISTORY_LIMIT) timeline.seeds.shift();
      timeline.index = timeline.seeds.length - 1;
    }
    seed = newSeed;
    el.seedInput.value = seed;
    render();
    syncUrlSoon();
  }

  function generate() {
    show(randomSeed());
  }

  function step(delta) {
    const i = timeline.index + delta;
    if (i < 0 || i >= timeline.seeds.length) return;
    timeline.index = i;
    show(timeline.seeds[i], { record: false });
  }

  // ---------------------------------------------------------------------------
  // Rendering

  const narrowScreen = window.matchMedia('(max-width: 720px)');

  let renderedStage = '';
  function stageKey() {
    return el.stage.clientWidth + 'x' + el.stage.clientHeight + '@' + window.devicePixelRatio;
  }

  function render() {
    renderedStage = stageKey();
    pattern = layout();
    const framed = options.format !== 'screen';
    const stageW = el.stage.clientWidth;
    const stageH = el.stage.clientHeight;
    const pad = framed ? (stageW < 640 ? 16 : 32) : 0;
    // Keep a framed preview clear of the side panel (on phones it's a bottom
    // sheet you close to see the result). "Fit screen" never moves: its size is
    // the pattern's size.
    const reserve = framed && !el.panel.hidden && !narrowScreen.matches ? el.panel.offsetWidth : 0;
    el.stage.style.paddingRight = reserve ? reserve + 'px' : '';
    const fit = framed
      ? Math.max(0.01, Math.min((stageW - reserve - pad * 2) / pattern.width, (stageH - pad * 2) / pattern.height))
      : 1;
    const cssW = Math.max(1, Math.round(pattern.width * fit));
    const cssH = Math.max(1, Math.round(pattern.height * fit));
    const dpr = window.devicePixelRatio || 1;

    el.canvas.style.width = cssW + 'px';
    el.canvas.style.height = cssH + 'px';
    el.canvas.width = Math.round(cssW * dpr);
    el.canvas.height = Math.round(cssH * dpr);
    renderToCanvas(el.canvas.getContext('2d'), pattern, {
      scale: (cssW / pattern.width) * dpr,
      background: backgroundColor(),
      textureScale: options.texture,
    });

    el.stage.classList.toggle('framed', framed);
    el.stage.classList.toggle('transparent', backgroundColor() === null);
    el.canvas.setAttribute('aria-label', 'Geometric pattern, seed ' + seed + ', ' + pattern.palette.name + ' palette');
    syncControls();
  }

  // ---------------------------------------------------------------------------
  // Export

  function exportSize() {
    const { width, height } = designSize();
    return { width: Math.round(width * options.exportScale), height: Math.round(height * options.exportScale) };
  }

  function fitsCanvas({ width, height }) {
    return width <= MAX_CANVAS_SIDE && height <= MAX_CANVAS_SIDE && width * height <= MAX_CANVAS_AREA;
  }

  function fileName(ext) {
    const { width, height } = exportSize();
    const safeSeed = seed.replace(/[^A-Za-z0-9_-]+/g, '-');
    return 'geometric-pattern-' + safeSeed + '-' + width + 'x' + height + '.' + ext;
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function savePNG() {
    if (exporting) return;
    const size = exportSize();
    if (!fitsCanvas(size)) {
      toast(size.width + ' × ' + size.height + ' is too large for PNG here. Lower the resolution or save SVG.', true, 4000);
      return;
    }
    exporting = true;
    toast('Rendering ' + size.width + ' × ' + size.height + '…', false, 0);
    const name = fileName('png');
    const pat = layout();
    const opts = { scale: options.exportScale, background: backgroundColor(), textureScale: options.texture };
    // Give the toast a frame to paint before the (synchronous) render.
    requestAnimationFrame(() => setTimeout(() => {
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return exportFailed();
      renderToCanvas(ctx, pat, opts);
      canvas.toBlob((blob) => {
        canvas.width = canvas.height = 0; // release the memory right away (matters on iOS)
        if (!blob) return exportFailed();
        exporting = false;
        download(blob, name);
        toast('Saved PNG');
      }, 'image/png');
    }, 0));
  }

  function exportFailed() {
    exporting = false;
    toast('Export failed. Try a lower resolution or SVG.', true, 4000);
  }

  function saveSVG() {
    const svg = renderToSVG(layout(), {
      scale: options.exportScale,
      background: backgroundColor(),
      textureScale: options.texture,
      title: 'Geometric pattern ' + seed,
      description: shareUrl(),
    });
    download(new Blob([svg], { type: 'image/svg+xml' }), fileName('svg'));
    toast('Saved SVG');
  }

  // ---------------------------------------------------------------------------
  // Sharing

  function shareUrl() {
    return location.href.split('#')[0] + hashFor({ share: true });
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // Clipboard API missing or blocked (http://, file://, old browsers).
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    ta.remove();
    return ok;
  }

  async function copyLink() {
    const ok = await copyText(shareUrl());
    toast(ok ? 'Link copied' : 'Could not copy. The link is in the address bar.', !ok, ok ? 2000 : 4000);
  }

  let toastTimer = 0;
  function toast(message, isError = false, duration = 2000) {
    el.toast.textContent = message;
    el.toast.classList.toggle('error', isError);
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    if (duration) toastTimer = setTimeout(() => el.toast.classList.remove('show'), duration);
  }

  // ---------------------------------------------------------------------------
  // Controls

  function h(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'style') node.style.cssText = v;
      else node.setAttribute(k, v);
    }
    for (const child of [].concat(children)) node.append(child);
    return node;
  }

  function buildControls() {
    for (const f of FORMATS) {
      const b = h('button', { type: 'button', class: 'chip', 'data-format': f.id, 'aria-pressed': 'false' }, f.label);
      if (f.width) b.title = f.width + ' × ' + f.height;
      b.addEventListener('click', () => setOptions({ format: f.id }));
      el.formatChips.append(b);
    }

    const random = h('button', { type: 'button', class: 'palette-btn', 'data-palette': 'random', 'aria-pressed': 'false' }, [
      h('span', { class: 'swatches random' }),
      h('span', {}, ['Random ', h('span', { class: 'current' })]),
    ]);
    random.addEventListener('click', () => setOptions({ palette: 'random' }));
    el.paletteList.append(random);
    for (const p of PALETTES) {
      const swatches = h('span', { class: 'swatches' }, p.colors.map((c) => h('span', { style: 'background:' + c })));
      const b = h('button', { type: 'button', class: 'palette-btn', 'data-palette': p.id, 'aria-pressed': 'false' }, [swatches, h('span', {}, p.name)]);
      b.addEventListener('click', () => setOptions({ palette: p.id }));
      el.paletteList.append(b);
    }

    for (const s of STYLES) {
      const b = h('button', { type: 'button', class: 'chip', 'data-style': s.id, 'aria-pressed': 'false' }, s.name);
      b.addEventListener('click', () => {
        const on = options.styles.includes(s.id);
        if (on && options.styles.length === 1) return toast('Keep at least one style on');
        setOptions({ styles: on ? options.styles.filter((id) => id !== s.id) : [...options.styles, s.id] });
      });
      el.styleChips.append(b);
    }

    for (const b of el.backgroundChips.querySelectorAll('[data-bg]')) {
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => setOptions({ background: b.dataset.bg }));
    }
    el.customBg.addEventListener('input', () => setOptions({ background: el.customBg.value }));
    el.customBg.addEventListener('click', () => setOptions({ background: el.customBg.value }));

    el.textureRange.min = TEXTURE_MIN;
    el.textureRange.max = TEXTURE_MAX;
    el.textureRange.addEventListener('input', () => setOptions({ texture: el.textureRange.value }));

    for (const scale of EXPORT_SCALES) {
      const b = h('button', { type: 'button', class: 'chip', 'data-scale': String(scale), 'aria-pressed': 'false' }, scale + '×');
      b.addEventListener('click', () => setOptions({ exportScale: scale }));
      el.exportChips.append(b);
    }

    el.customWidth.min = el.customHeight.min = SIZE_MIN;
    el.customWidth.max = el.customHeight.max = SIZE_MAX;
    const onCustomSize = () => setOptions({ customWidth: el.customWidth.value, customHeight: el.customHeight.value });
    el.customWidth.addEventListener('change', onCustomSize);
    el.customHeight.addEventListener('change', onCustomSize);
  }

  function press(node, on) {
    node.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function syncControls() {
    for (const b of el.formatChips.children) press(b, b.dataset.format === options.format);
    el.customSize.hidden = options.format !== 'custom';
    if (document.activeElement !== el.customWidth) el.customWidth.value = options.customWidth;
    if (document.activeElement !== el.customHeight) el.customHeight.value = options.customHeight;

    for (const b of el.paletteList.children) press(b, b.dataset.palette === options.palette);
    el.paletteList.querySelector('.current').textContent = pattern && options.palette === 'random' ? '· ' + pattern.palette.name : '';

    for (const b of el.styleChips.children) press(b, options.styles.includes(b.dataset.style));

    for (const b of el.backgroundChips.querySelectorAll('[data-bg]')) press(b, b.dataset.bg === options.background);
    const customBg = !isNamedBackground(options.background);
    el.customBgChip.classList.toggle('active', customBg);
    if (customBg) el.customBg.value = options.background;

    el.textureRange.value = options.texture;
    el.textureValue.textContent = options.texture + '×';

    for (const b of el.exportChips.children) press(b, Number(b.dataset.scale) === options.exportScale);
    const size = exportSize();
    const fits = fitsCanvas(size);
    el.exportHint.textContent = size.width + ' × ' + size.height + ' px' + (fits ? '' : ' (too large for PNG here; SVG works)');
    el.exportHint.classList.toggle('warn', !fits);

    if (pattern) el.summary.textContent = seed + ' · ' + pattern.palette.name + ' · ' + pattern.width + '×' + pattern.height;
    el.prevBtn.disabled = timeline.index <= 0;
    el.nextBtn.disabled = timeline.index >= timeline.seeds.length - 1;
  }

  function togglePanel(open = el.panel.hidden) {
    el.panel.hidden = !open;
    el.optionsBtn.setAttribute('aria-expanded', String(open));
    if (!open && el.panel.contains(document.activeElement)) el.optionsBtn.focus();
    if (options.format !== 'screen') render();
  }

  function toggleTransparent() {
    setOptions({ background: options.background === 'transparent' ? lastOpaqueBackground : 'transparent' });
  }

  // ---------------------------------------------------------------------------
  // Events

  function bindEvents() {
    el.generateBtn.addEventListener('click', generate);
    el.prevBtn.addEventListener('click', () => step(-1));
    el.nextBtn.addEventListener('click', () => step(1));
    el.copyLinkBtn.addEventListener('click', copyLink);
    el.savePngBtn.addEventListener('click', savePNG);
    el.saveSvgBtn.addEventListener('click', saveSVG);
    el.optionsBtn.addEventListener('click', () => togglePanel());
    el.closeOptionsBtn.addEventListener('click', () => togglePanel(false));
    el.resetBtn.addEventListener('click', () => setOptions({ ...DEFAULTS }));

    el.seedForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const value = el.seedInput.value.trim().slice(0, SEED_MAX_LENGTH);
      if (value) show(value);
      el.seedInput.blur();
    });

    // After a mouse click, drop focus so Space means "new pattern" rather than
    // "press the last clicked button again". Keyboard focus is left alone.
    document.addEventListener('click', (e) => {
      const button = e.target.closest && e.target.closest('button');
      if (button && e.detail > 0) button.blur();
    });

    document.addEventListener('keydown', (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target instanceof Element ? e.target : document.body;
      if (target.closest('input, textarea, select, [contenteditable]')) {
        if (e.key === 'Escape') target.blur();
        return;
      }
      // Let Space and Enter activate whatever control has keyboard focus.
      if ((e.key === ' ' || e.key === 'Enter') && target.closest('button, a, label')) return;

      const actions = {
        ' ': generate,
        ArrowLeft: () => step(-1),
        ArrowRight: () => step(1),
        s: savePNG,
        v: saveSVG,
        c: copyLink,
        t: toggleTransparent,
        o: () => togglePanel(),
        Escape: () => togglePanel(false),
      };
      const action = actions[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (!action) return;
      e.preventDefault();
      action();
    });

    window.addEventListener('hashchange', () => {
      const link = readHash();
      if (link && location.hash !== hashFor()) applyLink(link, options.exportScale);
    });

    // Re-render with the same seed when the stage changes size.
    let resizeTimer = 0;
    new ResizeObserver(() => {
      if (stageKey() === renderedStage) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(render, 100);
    }).observe(el.stage);
  }

  function init() {
    buildControls();
    bindEvents();
    const stored = loadStoredOptions();
    const link = readHash();
    if (link) {
      // A link describes an exact image, so it overrides saved options.
      applyLink(link, stored.exportScale);
    } else {
      options = stored;
      if (options.background !== 'transparent') lastOpaqueBackground = options.background;
      generate();
    }
  }

  init();
})();
