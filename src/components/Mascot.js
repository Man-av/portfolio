(() => {
  const button = document.getElementById('manav-mascot');
  if (!button) return;
  const sprite = button.querySelector('.mascot-sprite');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clockwise = [5, 8, 7, 6, 3, 0, 1, 2];
  const step = Math.PI / 4;
  let sector = -1;
  let pointer = null;
  let queued = false;
  let nodding = false;
  let timers = [];

  const show = (index) => {
    sprite.style.backgroundPosition = `${index % 3 * 50}% ${Math.floor(index / 3) * 50}%`;
  };

  const aim = () => {
    if (nodding || reducedMotion.matches) return;
    if (!pointer) return show(4);
    const box = button.getBoundingClientRect();
    if (box.bottom < 0 || box.top > window.innerHeight) return;
    const dx = pointer.x - (box.left + box.width / 2);
    const dy = pointer.y - (box.top + box.height * 0.4);
    if (Math.hypot(dx, dy) < box.width * 0.2) {
      sector = -1;
      return show(4);
    }
    const angle = Math.atan2(dy, dx);
    const difference = Math.atan2(Math.sin(angle - sector * step), Math.cos(angle - sector * step));
    // Hold the current direction near a boundary so the head doesn't chatter.
    if (sector !== -1 && Math.abs(difference) < step / 2 + 0.12) return;
    sector = (Math.round(angle / step) + 8) % 8;
    show(clockwise[sector]);
  };

  const scheduleAim = () => {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      aim();
    });
  };

  const reset = () => {
    timers.forEach(window.clearTimeout);
    timers = [];
    nodding = false;
    pointer = null;
    sector = -1;
    show(4);
  };

  window.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch' || reducedMotion.matches) return;
    pointer = { x: event.clientX, y: event.clientY };
    scheduleAim();
  }, { passive: true });
  window.addEventListener('scroll', scheduleAim, { passive: true });
  window.addEventListener('resize', scheduleAim, { passive: true });
  window.addEventListener('blur', reset);
  document.documentElement.addEventListener('pointerleave', reset);
  reducedMotion.addEventListener('change', reset);

  button.addEventListener('click', () => {
    timers.forEach(window.clearTimeout);
    timers = [];
    sector = -1;
    show(4);
    if (reducedMotion.matches) return;
    nodding = true;
    // shortcut: taps use a nod; add a reactions sheet for separate facial expressions.
    timers = [
      window.setTimeout(() => show(7), 100),
      window.setTimeout(() => show(4), 260),
      window.setTimeout(() => {
        nodding = false;
        sector = -1;
        aim();
      }, 460),
    ];
  });
  show(4);
})();
