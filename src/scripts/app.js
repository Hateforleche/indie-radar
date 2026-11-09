const root = document.documentElement;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Source filter ---------- */
const filterBtns = document.querySelectorAll('[data-set-filter]');
const filterInk = document.querySelector('.filter__ink');
const filterGroupBtns = document.querySelectorAll('.filter button');
const rail = document.querySelector('.rail');

function moveInk() {
  const active = [...filterGroupBtns].find((b) => b.dataset.setFilter === root.dataset.filter);
  if (!active || !filterInk) return;
  filterInk.style.setProperty('--x', `${active.offsetLeft}px`);
  filterInk.style.setProperty('--w', `${active.offsetWidth}px`);
}

function syncFilterUI() {
  const f = root.dataset.filter;
  filterGroupBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.setFilter === f)));
  document.querySelectorAll('.count').forEach((el) => {
    const n = Number(el.dataset[`count${f[0].toUpperCase()}${f.slice(1)}`]);
    el.textContent = `${n} ${n === 1 ? el.dataset.one : el.dataset.many}`;
  });
  moveInk();
}

function setFilter(f) {
  if (f === root.dataset.filter) return;
  const apply = () => {
    root.dataset.filter = f;
    syncFilterUI();
    if (rail) rail.scrollLeft = 0;
  };
  try { localStorage.setItem('indie-radar-filter', f); } catch {}
  if (document.startViewTransition && !reduceMotion) document.startViewTransition(apply);
  else apply();
}

filterBtns.forEach((b) => b.addEventListener('click', () => setFilter(b.dataset.setFilter)));
syncFilterUI();
addEventListener('resize', moveInk);
document.fonts?.ready.then(moveInk);

/* ---------- Language ---------- */
// Slide the knob to the chosen language, then go to that page (keeping the section).
document.querySelectorAll('[data-set-lang]').forEach((link) => {
  link.addEventListener('click', (e) => {
    if (link.getAttribute('aria-current') === 'page') { e.preventDefault(); return; }
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // new tab/window
    try { localStorage.setItem('indie-radar-lang', link.dataset.setLang); } catch {}
    e.preventDefault();
    link.closest('.lang').dataset.active = link.dataset.setLang;
    const go = () => { location.href = link.href + location.hash; };
    if (reduceMotion) go(); else setTimeout(go, 280);
  });
});

/* ---------- Carousel ---------- */
if (rail) {
  const step = () => Math.max(rail.clientWidth * 0.8, 280);
  document.querySelector('[data-rail="prev"]').addEventListener('click', () =>
    rail.scrollBy({ left: -step(), behavior: reduceMotion ? 'auto' : 'smooth' }));
  document.querySelector('[data-rail="next"]').addEventListener('click', () =>
    rail.scrollBy({ left: step(), behavior: reduceMotion ? 'auto' : 'smooth' }));

  // Mouse drag to scroll (touch already scrolls natively).
  let startX = 0, startLeft = 0, dragging = false, moved = false;
  rail.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    dragging = true; moved = false;
    startX = e.clientX; startLeft = rail.scrollLeft;
  });
  addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 4 && !moved) { moved = true; rail.classList.add('is-dragging'); }
    if (moved) rail.scrollLeft = startLeft - dx;
  });
  addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false;
    rail.classList.remove('is-dragging');
  });
  rail.addEventListener('click', (e) => { if (moved) { e.preventDefault(); moved = false; } }, true);
  rail.addEventListener('dragstart', (e) => e.preventDefault());
}

/* ---------- Scroll reveals ---------- */
const revealables = document.querySelectorAll('[data-reveal]');
if (reduceMotion || !('IntersectionObserver' in window)) {
  revealables.forEach((el) => el.classList.add('is-in'));
} else {
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    }
  }, { rootMargin: '0px 0px -12% 0px' });
  revealables.forEach((el) => io.observe(el));
}

/* ---------- Header state ---------- */
const bar = document.querySelector('.bar');
const onScroll = () => bar.classList.toggle('is-scrolled', scrollY > 24);
addEventListener('scroll', onScroll, { passive: true });
onScroll();
