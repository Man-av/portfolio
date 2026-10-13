const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const source = readFileSync(`${__dirname}/Mascot.js`, 'utf8');

function mount() {
  const events = {};
  const frames = [];
  const timers = new Map();
  let nextTimer = 0;
  const listen = (target) => (name, callback) => { events[`${target}:${name}`] = callback; };
  const sprite = { style: {} };
  const box = { left: 100, top: 100, width: 200, height: 200, bottom: 300 };
  const media = { matches: false, addEventListener: listen('media') };
  const button = { querySelector: () => sprite, getBoundingClientRect: () => box, addEventListener: listen('button') };
  const window = {
    innerHeight: 900, matchMedia: () => media, addEventListener: listen('window'),
    requestAnimationFrame: (callback) => frames.push(callback),
    setTimeout: (callback, ms) => { timers.set(++nextTimer, { callback, ms }); return nextTimer; },
    clearTimeout: (id) => timers.delete(id),
  };
  const document = { getElementById: () => button, documentElement: { addEventListener: listen('document') } };
  vm.runInNewContext(source, { document, window });
  const flush = () => { while (frames.length) frames.shift()(); };
  const move = (x, y, pointerType = 'mouse') => {
    events['window:pointermove']({ clientX: x, clientY: y, pointerType });
    flush();
  };
  const tick = (ms) => {
    for (const [id, timer] of [...timers].sort((a, b) => a[1].ms - b[1].ms)) {
      if (timer.ms <= ms && timers.has(id)) { timers.delete(id); timer.callback(); }
    }
  };
  return { events, sprite, move, flush, tick, timers, media, box };
}

test('all nine positions follow the pointer and reset on leaving the page', () => {
  const app = mount();
  const offsets = [[-200,-200],[0,-200],[200,-200],[-200,0],[0,0],[200,0],[-200,200],[0,200],[200,200]];
  offsets.forEach(([dx,dy], index) => {
    app.move(200 + dx, 180 + dy);
    assert.equal(app.sprite.style.backgroundPosition, `${index % 3 * 50}% ${Math.floor(index / 3) * 50}%`);
  });
  app.events['document:pointerleave']();
  assert.equal(app.sprite.style.backgroundPosition, '50% 50%');
});

test('direction boundaries are stable, touch is ignored, and scrolling recalculates position', () => {
  const app = mount();
  app.move(400, 180);
  app.move(200 + 200 * Math.cos(.42), 180 + 200 * Math.sin(.42));
  assert.equal(app.sprite.style.backgroundPosition, '100% 50%');
  app.move(200 + 200 * Math.cos(.6), 180 + 200 * Math.sin(.6));
  assert.equal(app.sprite.style.backgroundPosition, '100% 100%');
  app.move(0, 0, 'touch');
  assert.equal(app.sprite.style.backgroundPosition, '100% 100%');
  app.move(200, 500);
  app.box.top = 550;
  app.box.bottom = 750;
  app.events['window:scroll']();
  app.flush();
  assert.equal(app.sprite.style.backgroundPosition, '50% 0%');
});

test('clicks nod and restore gaze; reduced motion cancels and prevents animation', () => {
  const app = mount();
  app.move(400, 180);
  app.events['button:click']();
  assert.equal(app.sprite.style.backgroundPosition, '50% 50%');
  app.tick(100);
  assert.equal(app.sprite.style.backgroundPosition, '50% 100%');
  app.tick(260);
  assert.equal(app.sprite.style.backgroundPosition, '50% 50%');
  app.tick(460);
  assert.equal(app.sprite.style.backgroundPosition, '100% 50%');
  app.events['button:click']();
  app.media.matches = true;
  app.events['media:change']();
  assert.equal(app.timers.size, 0);
  app.move(400, 180);
  app.events['button:click']();
  assert.equal(app.sprite.style.backgroundPosition, '50% 50%');
  assert.equal(app.timers.size, 0);
});
