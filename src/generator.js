/*
 * Geometric Pattern Generator: the pattern engine.
 *
 * No DOM access, so it runs in the browser (window.GeoGen) and in Node (tests).
 *
 * A pattern is a pure function of (seed, width, height, options). The order of
 * random draws in createPattern() and the rendering maths below reproduce the
 * original p5.js version exactly, so seeds shared before the rewrite still
 * produce the same image. Don't reorder draws or change the maths without
 * accepting that every existing seed changes.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GeoGen = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Seeds pick a palette by index: append new palettes, never reorder.
  const PALETTES = [
    { id: 'sunset', name: 'Sunset', colors: ['#FF6B6B', '#FE7F2D', '#FCCA46', '#A1C181', '#619B8A', '#2E5266', '#6A4C93'] },
    { id: 'ocean', name: 'Ocean', colors: ['#05668D', '#028090', '#00A896', '#02C39A', '#F0F3BD', '#FFE66D', '#FF6B6B'] },
    { id: 'neon', name: 'Neon', colors: ['#FF006E', '#FB5607', '#FFBE0B', '#8338EC', '#3A86FF', '#06FFB4', '#FF4365'] },
    { id: 'pastel', name: 'Pastel', colors: ['#FFB5E8', '#FF9CEE', '#FFCCF9', '#FCC2FF', '#F6A6FF', '#B28DFF', '#C5A3FF'] },
    { id: 'forest', name: 'Forest', colors: ['#2D6A4F', '#40916C', '#52B788', '#74C69D', '#95D5B2', '#B7E4C7', '#D8F3DC'] },
    { id: 'fire', name: 'Fire', colors: ['#03071E', '#370617', '#6A040F', '#9D0208', '#D00000', '#DC2F02', '#E85D04'] },
    { id: 'cyberpunk', name: 'Cyberpunk', colors: ['#7209B7', '#560BAD', '#480CA8', '#3A0CA3', '#3F37C9', '#4361EE', '#4895EF'] },
  ];

  // Seeds pick a pattern by index. Every shape is rotated by a random angle, so
  // diagonal, horizontal and vertical all come out as rotated parallel lines;
  // the UI groups them as one "Lines" style.
  const PATTERNS = ['diagonal', 'horizontal', 'vertical', 'crosshatch', 'dots', 'waves', 'circles'];

  const STYLES = [
    { id: 'lines', name: 'Lines', patterns: ['diagonal', 'horizontal', 'vertical'] },
    { id: 'crosshatch', name: 'Crosshatch', patterns: ['crosshatch'] },
    { id: 'dots', name: 'Dots', patterns: ['dots'] },
    { id: 'waves', name: 'Waves', patterns: ['waves'] },
    { id: 'circles', name: 'Circles', patterns: ['circles'] },
  ];

  const SHAPE_ALPHA = 0x99; // shapes are drawn at 60% opacity
  const DEFAULT_BACKGROUND = '#141414';
  const DEG_TO_RAD = Math.PI / 180;
  const KAPPA = 0.5522847498; // bezier circle approximation, as p5 draws it

  class SeededRandom {
    constructor(seed) {
      this.seed = this.hashCode(String(seed));
    }

    hashCode(str) {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash; // Convert to 32-bit integer
      }
      return Math.abs(hash);
    }

    next() {
      const x = Math.sin(this.seed++) * 10000;
      return x - Math.floor(x);
    }

    random(min, max) {
      if (min === undefined) return this.next();
      if (max === undefined) return this.next() * min;
      return min + this.next() * (max - min);
    }

    randomInt(min, max) {
      return Math.floor(this.random(min, max));
    }

    choice(array) {
      return array[this.randomInt(0, array.length)];
    }
  }

  const SEED_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  function randomSeed(length = 8) {
    const values = new Uint32Array(length);
    const cryptoApi = typeof crypto !== 'undefined' ? crypto : null;
    if (cryptoApi && cryptoApi.getRandomValues) cryptoApi.getRandomValues(values);
    else for (let i = 0; i < length; i++) values[i] = Math.floor(Math.random() * 0x100000000);
    return Array.from(values, (v) => SEED_CHARS[v % SEED_CHARS.length]).join('');
  }

  function patternsForStyles(styles) {
    if (!styles || !styles.length) return PATTERNS;
    const enabled = new Set();
    for (const style of STYLES) {
      if (styles.includes(style.id)) style.patterns.forEach((p) => enabled.add(p));
    }
    const allowed = PATTERNS.filter((p) => enabled.has(p));
    return allowed.length ? allowed : PATTERNS;
  }

  /**
   * Lay out a pattern. Options only replace what a draw picked, never skip or
   * add draws, so a seed keeps its composition when a palette or style is forced.
   *   options.palette: palette id to force, or 'random' (default)
   *   options.styles:  style ids to allow (default: all)
   */
  function createPattern(seed, width, height, options = {}) {
    const rng = new SeededRandom(seed);
    const seededPalette = PALETTES[rng.randomInt(0, PALETTES.length)];
    const palette = PALETTES.find((p) => p.id === options.palette) || seededPalette;
    const allowed = patternsForStyles(options.styles);

    const shapes = [];
    const count = rng.randomInt(8, 16);
    for (let i = 0; i < count; i++) {
      shapes.push({
        x: rng.random(width * -0.2, width * 0.8),
        y: rng.random(height * -0.2, height * 0.8),
        w: rng.random(width * 0.2, width * 0.8),
        h: rng.random(height * 0.2, height * 0.8),
        color1: rng.choice(palette.colors),
        color2: rng.choice(palette.colors),
        angle: rng.random(-90, 90),
        spacing: rng.random(3, 8),
        pattern: rng.choice(allowed),
        strokeWeight: rng.random(1, 3),
      });
    }

    // Larger shapes first so smaller ones layer on top.
    shapes.sort((a, b) => (b.w * b.h) - (a.w * a.h));
    return { seed: String(seed), width, height, palette, shapes };
  }

  // ---------------------------------------------------------------------------
  // Colour helpers. Colours are p5-style normalised [r, g, b, a] arrays.

  function hexToColor(hex, alpha = SHAPE_ALPHA) {
    const n = parseInt(hex.slice(1, 7), 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255, alpha / 255];
  }

  function levels(color) {
    return color.map((v) => Math.round(v * 255));
  }

  // Same arithmetic as p5.lerpColor() in RGB mode, rounding included.
  function lerpColor(from, to, amt) {
    amt = Math.max(Math.min(amt, 1), 0);
    const a = levels(from);
    const b = levels(to);
    const out = new Array(4);
    for (let k = 0; k < 4; k++) {
      const start = a[k] / 255;
      const v = ((amt * (b[k] / 255 - start) + start) * 255) / 255;
      out[k] = v < 0 ? 0 : v > 1 ? 1 : v;
    }
    return out;
  }

  function cssColor(color) {
    const l = levels(color);
    return 'rgba(' + l[0] + ',' + l[1] + ',' + l[2] + ',' + color[3] + ')';
  }

  function hexColor(color) {
    return '#' + levels(color).slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  function map01(n, start, stop) {
    return (n - start) / (stop - start);
  }

  // ---------------------------------------------------------------------------
  // Geometry. drawShape() walks one shape and emits marks to a "sink" (canvas or
  // SVG), in the shape's rotated frame, clipped to its box.

  function drawShape(s, sink, textureScale = 1) {
    const spacing = s.spacing * textureScale;
    const weight = s.strokeWeight * textureScale;
    const c1 = hexToColor(s.color1);
    const c2 = hexToColor(s.color2);
    const size = Math.max(s.w, s.h);

    // The clip box sits inside a circle of radius `reach` around (cx, cy), so
    // marks entirely outside it are invisible. Skipping them keeps the loops
    // themselves unchanged (same float steps, same colours) and saves most of
    // the work, since the loops cover about 3x the box in each direction.
    const cx = s.w / 2;
    const cy = s.h / 2;
    const reach = Math.hypot(s.w, s.h) / 2 + weight + 4;

    sink.begin(s, weight);

    if (s.pattern === 'diagonal' || s.pattern === 'horizontal' || s.pattern === 'vertical') {
      const vertical = s.pattern === 'vertical';
      for (let i = -size; i < size * 2; i += spacing) {
        if (Math.abs(i - (vertical ? cx : cy)) > reach) continue;
        const c = lerpColor(c1, c2, map01(i, -size, size * 2));
        if (vertical) sink.line(i, -s.h, i, s.h * 2, c);
        else sink.line(-s.w, i, s.w * 2, i, c);
      }
    } else if (s.pattern === 'crosshatch') {
      for (let i = -size; i < size * 2; i += spacing) {
        const c = lerpColor(c1, c2, map01(i, -size, size * 2));
        if (Math.abs(i - cy) <= reach) sink.line(-s.w, i, s.w * 2, i, c);
        if (Math.abs(i - cx) <= reach) sink.line(i, -s.h, i, s.h * 2, c);
      }
    } else if (s.pattern === 'dots') {
      const r = reach + spacing;
      for (let i = -s.w; i < s.w * 2; i += spacing * 2) {
        if (Math.abs(i - cx) > r) continue;
        for (let j = -s.h; j < s.h * 2; j += spacing * 2) {
          if ((i - cx) * (i - cx) + (j - cy) * (j - cy) > r * r) continue;
          const c = lerpColor(c1, c2, map01(i + j, -s.w - s.h, s.w * 2 + s.h * 2));
          sink.dot(i, j, spacing * 0.8, c);
        }
      }
    } else if (s.pattern === 'waves') {
      const amplitude = spacing * 2;
      const step = 5 * textureScale;
      const frequency = 0.02 / textureScale;
      for (let i = -size; i < size * 2; i += spacing) {
        if (Math.abs(i - cy) > reach + amplitude) continue;
        const c = lerpColor(c1, c2, map01(i, -size, size * 2));
        const points = [];
        for (let x = -s.w; x < s.w * 2; x += step) {
          points.push(x, i + Math.sin(x * frequency + s.angle) * spacing * 2);
        }
        // Trimming the points to the visible span is left to the sink: on canvas
        // it shifts anti-aliasing slightly, so only SVG output uses it.
        sink.polyline(points, c, cx - reach - step, cx + reach + step);
      }
    } else if (s.pattern === 'circles') {
      // Concentric rings around the box's corner. The farthest visible point
      // is 2 * reach away from it.
      for (let i = spacing; i < size * 2; i += spacing * 2) {
        if (i > reach * 2) break;
        const c = lerpColor(c1, c2, map01(i, 0, size * 2));
        sink.ring(0, 0, i * 2, c);
      }
    }

    sink.end();
  }

  // ---------------------------------------------------------------------------
  // Canvas renderer

  function ellipsePath(ctx, cx, cy, d) {
    const x = cx - d * 0.5;
    const y = cy - d * 0.5;
    const ox = d / 2 * KAPPA;
    const xe = x + d;
    const ye = y + d;
    const xm = x + d / 2;
    const ym = y + d / 2;
    ctx.beginPath();
    ctx.moveTo(x, ym);
    ctx.bezierCurveTo(x, ym - ox, xm - ox, y, xm, y);
    ctx.bezierCurveTo(xm + ox, y, xe, ym - ox, xe, ym);
    ctx.bezierCurveTo(xe, ym + ox, xm + ox, ye, xm, ye);
    ctx.bezierCurveTo(xm - ox, ye, x, ym + ox, x, ym);
  }

  function canvasSink(ctx) {
    return {
      begin(s, weight) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(s.x, s.y, s.w, s.h);
        ctx.clip();
        ctx.translate(s.x + s.w / 2, s.y + s.h / 2);
        ctx.rotate(s.angle * DEG_TO_RAD);
        ctx.translate(-s.w / 2, -s.h / 2);
        ctx.lineWidth = weight;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'miter';
      },
      line(x1, y1, x2, y2, c) {
        ctx.strokeStyle = cssColor(c);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      },
      polyline(points, c) {
        ctx.strokeStyle = cssColor(c);
        ctx.beginPath();
        ctx.moveTo(points[0], points[1]);
        for (let k = 2; k < points.length; k += 2) ctx.lineTo(points[k], points[k + 1]);
        ctx.stroke();
      },
      dot(x, y, d, c) {
        ctx.fillStyle = cssColor(c);
        ellipsePath(ctx, x, y, d);
        ctx.fill();
      },
      ring(x, y, d, c) {
        ctx.strokeStyle = cssColor(c);
        ellipsePath(ctx, x, y, d);
        ctx.stroke();
      },
      end() {
        ctx.restore();
      },
    };
  }

  /**
   * Draw a pattern onto a 2D context whose transform is identity.
   *   scale:        canvas pixels per pattern unit (devicePixelRatio, export size...)
   *   background:   CSS colour, or null for transparent
   *   textureScale: multiplies line spacing and weight (1 = original)
   */
  function renderToCanvas(ctx, pattern, { scale = 1, background = DEFAULT_BACKGROUND, textureScale = 1 } = {}) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, pattern.width, pattern.height);
    }
    const sink = canvasSink(ctx);
    for (const shape of pattern.shapes) drawShape(shape, sink, textureScale);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // SVG renderer

  function num(v) {
    return String(Math.round(v * 100) / 100);
  }

  function escapeXml(str) {
    return String(str).replace(/[<>&"']/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[ch]);
  }

  function svgCircle(x, y, d, attr, c) {
    return '<circle cx="' + num(x) + '" cy="' + num(y) + '" r="' + num(d / 2) + '" ' + attr + '="' + hexColor(c) + '"/>';
  }

  function svgSink(out) {
    let id = 0;
    return {
      begin(s, weight) {
        const clip = 'c' + id++;
        out.push(
          '<clipPath id="' + clip + '"><rect x="' + num(s.x) + '" y="' + num(s.y) + '" width="' + num(s.w) + '" height="' + num(s.h) + '"/></clipPath>',
          '<g clip-path="url(#' + clip + ')"><g transform="translate(' + num(s.x + s.w / 2) + ' ' + num(s.y + s.h / 2) + ') rotate(' + num(s.angle) + ') translate(' + num(-s.w / 2) + ' ' + num(-s.h / 2) + ')"' +
            ' fill="none" stroke-width="' + num(weight) + '" stroke-linecap="round" stroke-miterlimit="10"' +
            ' stroke-opacity="' + num(SHAPE_ALPHA / 255) + '" fill-opacity="' + num(SHAPE_ALPHA / 255) + '">'
        );
      },
      line(x1, y1, x2, y2, c) {
        out.push('<line x1="' + num(x1) + '" y1="' + num(y1) + '" x2="' + num(x2) + '" y2="' + num(y2) + '" stroke="' + hexColor(c) + '"/>');
      },
      polyline(points, c, minX = -Infinity, maxX = Infinity) {
        const pts = [];
        for (let k = 0; k < points.length; k += 2) {
          if (points[k] >= minX && points[k] <= maxX) pts.push(num(points[k]) + ',' + num(points[k + 1]));
        }
        if (pts.length > 1) out.push('<polyline points="' + pts.join(' ') + '" stroke="' + hexColor(c) + '"/>');
      },
      dot(x, y, d, c) {
        out.push(svgCircle(x, y, d, 'fill', c));
      },
      ring(x, y, d, c) {
        out.push(svgCircle(x, y, d, 'stroke', c));
      },
      end() {
        out.push('</g></g>');
      },
    };
  }

  /** Build an SVG document string. Same options as renderToCanvas, plus `title` and `description`. */
  function renderToSVG(pattern, { scale = 1, background = DEFAULT_BACKGROUND, textureScale = 1, title = '', description = '' } = {}) {
    const w = pattern.width;
    const h = pattern.height;
    const out = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + Math.round(w * scale) + '" height="' + Math.round(h * scale) + '" viewBox="0 0 ' + num(w) + ' ' + num(h) + '">',
      '<title>' + escapeXml(title || 'Geometric pattern ' + pattern.seed) + '</title>',
    ];
    if (description) out.push('<desc>' + escapeXml(description) + '</desc>');
    if (background) out.push('<rect width="' + num(w) + '" height="' + num(h) + '" fill="' + escapeXml(background) + '"/>');
    const sink = svgSink(out);
    for (const shape of pattern.shapes) drawShape(shape, sink, textureScale);
    out.push('</svg>', '');
    return out.join('\n');
  }

  return {
    PALETTES,
    PATTERNS,
    STYLES,
    DEFAULT_BACKGROUND,
    SeededRandom,
    randomSeed,
    createPattern,
    drawShape,
    renderToCanvas,
    renderToSVG,
  };
});
