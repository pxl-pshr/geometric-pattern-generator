const test = require('node:test');
const assert = require('node:assert/strict');
const GeoGen = require('../src/generator.js');

// Values produced by the original p5.js version (index.html before the rewrite)
// at 1000x800. If these change, every seed anyone has saved or shared changes.
const GOLDEN = {
  A7bX9mK2: {
    palette: 'forest',
    patterns: ['dots', 'diagonal', 'diagonal', 'diagonal', 'dots', 'crosshatch', 'horizontal', 'diagonal', 'dots', 'dots', 'dots', 'circles'],
    first: { x: -96.72763950113676, y: 382.06115554916323, w: 773.4495654502098, h: 519.9764075018902, color1: '#40916C', color2: '#40916C', angle: 50.64703393066338, spacing: 7.197939131313433, pattern: 'dots', strokeWeight: 2.1076331053573085 },
  },
  'hello world': {
    palette: 'fire',
    patterns: ['crosshatch', 'dots', 'circles', 'vertical', 'diagonal', 'dots', 'vertical', 'crosshatch', 'waves', 'circles', 'crosshatch', 'waves', 'waves'],
    last: { x: -95.16781198744866, y: -153.72597210967797, w: 235.63492391513137, h: 164.9050596213783, color1: '#DC2F02', color2: '#DC2F02', angle: -33.42814992181957, spacing: 4.728959782117272, pattern: 'waves', strokeWeight: 2.3303795071751665 },
  },
  X: {
    palette: 'cyberpunk',
    patterns: ['crosshatch', 'waves', 'horizontal', 'horizontal', 'horizontal', 'vertical', 'waves', 'waves', 'horizontal', 'dots', 'dots', 'crosshatch', 'horizontal'],
  },
};

test('seeds reproduce the original p5 layouts', () => {
  for (const [seed, golden] of Object.entries(GOLDEN)) {
    const p = GeoGen.createPattern(seed, 1000, 800);
    assert.equal(p.palette.id, golden.palette, seed);
    assert.deepEqual(p.shapes.map((s) => s.pattern), golden.patterns, seed);
    if (golden.first) assert.deepEqual(p.shapes[0], golden.first, seed);
    if (golden.last) assert.deepEqual(p.shapes[p.shapes.length - 1], golden.last, seed);
  }
});

test('same seed and size give the same pattern', () => {
  assert.deepEqual(GeoGen.createPattern('abc', 640, 480), GeoGen.createPattern('abc', 640, 480));
});

test('forcing a palette keeps the composition', () => {
  const base = GeoGen.createPattern('A7bX9mK2', 1000, 800);
  const ocean = GeoGen.createPattern('A7bX9mK2', 1000, 800, { palette: 'ocean' });
  assert.equal(ocean.palette.id, 'ocean');
  const geometry = (s) => [s.x, s.y, s.w, s.h, s.angle, s.spacing, s.pattern, s.strokeWeight];
  assert.deepEqual(ocean.shapes.map(geometry), base.shapes.map(geometry));
  for (const s of ocean.shapes) assert.ok(ocean.palette.colors.includes(s.color1));
});

test('style filter only changes which pattern each shape uses', () => {
  const base = GeoGen.createPattern('hello world', 1000, 800);
  const dots = GeoGen.createPattern('hello world', 1000, 800, { styles: ['dots', 'waves'] });
  assert.ok(dots.shapes.every((s) => s.pattern === 'dots' || s.pattern === 'waves'));
  assert.deepEqual(dots.shapes.map((s) => s.x), base.shapes.map((s) => s.x));
  // An empty or unknown filter falls back to every style.
  assert.deepEqual(GeoGen.createPattern('hello world', 1000, 800, { styles: [] }), base);
  assert.deepEqual(GeoGen.createPattern('hello world', 1000, 800, { styles: ['nope'] }), base);
});

test('random seeds are 8 alphanumeric characters', () => {
  for (let i = 0; i < 50; i++) assert.match(GeoGen.randomSeed(), /^[A-Za-z0-9]{8}$/);
});

test('SVG export has one clipped group per shape', () => {
  const p = GeoGen.createPattern('hello world', 400, 300);
  const svg = GeoGen.renderToSVG(p, { scale: 2, title: 'a < b', description: 'https://example.com/#seed=x&y=1' });
  assert.match(svg, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<svg [^>]*width="800" height="600" viewBox="0 0 400 300">/);
  assert.equal((svg.match(/<clipPath /g) || []).length, p.shapes.length);
  assert.ok(svg.includes('<title>a &lt; b</title>'));
  assert.ok(svg.includes('<desc>https://example.com/#seed=x&amp;y=1</desc>'));
  assert.ok(svg.includes('fill="#141414"'));
  assert.ok(!GeoGen.renderToSVG(p, { background: null }).includes('fill="#141414"'));
  assert.ok(svg.trimEnd().endsWith('</svg>'));
});
