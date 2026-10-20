/* ==========================================================
   Radio Tarang – Week 3 interactivity, Week 4 accessibility fixes

   Each feature lives in its own init function and quietly does
   nothing if its elements are missing. The page still works
   without this file (see the html.js class in index.html).

   1 Helpers            5 Show search
   2 Mobile menu        6 Signup form validation
   3 Scroll spy         7 Reveal on scroll
   4 Schedule           8 Back to top
   ========================================================== */
(function () {
  'use strict';

  /* 1. HELPERS ------------------------------------------- */
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Writing the same text into a live region makes some screen readers read it again,
  // so only update when the text has really changed.
  const setText = (element, text) => {
    if (element.textContent !== text) element.textContent = text;
  };

  /* 2. MOBILE MENU --------------------------------------- */
  function initMenu() {
    const button = $('.nav-button');
    const nav = $('#main-nav');
    if (!button || !nav) return;

    const isOpen = () => button.getAttribute('aria-expanded') === 'true';
    const setOpen = (open) => {
      button.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('is-open', open);
    };

    button.addEventListener('click', () => setOpen(!isOpen()));

    // Close after choosing a link
    nav.addEventListener('click', (event) => {
      if (event.target.closest('a')) setOpen(false);
    });

    // Close with Escape (and return focus to the button) or by clicking outside
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && isOpen()) {
        setOpen(false);
        button.focus();
      }
    });
    document.addEventListener('click', (event) => {
      if (isOpen() && !event.target.closest('.site-header')) setOpen(false);
    });

    // If the window grows to desktop width, reset the mobile state
    window.matchMedia('(min-width: 900px)').addEventListener('change', (event) => {
      if (event.matches) setOpen(false);
    });
  }

  /* 3. SCROLL SPY: mark the nav link for the section in view */
  function initScrollSpy() {
    if (!('IntersectionObserver' in window)) return;
    const links = $$('.nav-link[href^="#"]');
    const sections = links.map((link) => $(link.getAttribute('href'))).filter(Boolean);
    if (!sections.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((link) => {
          const match = link.getAttribute('href') === '#' + entry.target.id;
          if (match) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-40% 0px -55% 0px' }); // a thin band across the middle of the screen

    sections.forEach((section) => observer.observe(section));
  }

  /* 4. SCHEDULE: language filter + "on air now" ---------- */
  function toMinutes(time) {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  // Normally the real clock. For demos and testing, add ?time=17:30 to the URL.
  function getNow() {
    const override = new URLSearchParams(window.location.search).get('time');
    if (override && /^\d{1,2}:\d{2}$/.test(override)) {
      return { minutes: toMinutes(override), isWeekday: true };
    }
    const now = new Date();
    const day = now.getDay(); // 0 = Sunday, 6 = Saturday
    return { minutes: now.getHours() * 60 + now.getMinutes(), isWeekday: day >= 1 && day <= 5 };
  }

  function initSchedule() {
    const rows = $$('.schedule tbody tr');
    const banner = $('#on-air');
    const bannerText = $('#on-air-text');
    const status = $('#schedule-status');
    if (!rows.length) return;

    // --- Filter chips ---
    const chips = $$('.chip[data-filter]');
    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const filter = chip.dataset.filter;
        chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));

        let visible = 0;
        rows.forEach((row) => {
          const show = filter === 'all' || row.dataset.lang.split(' ').includes(filter);
          row.hidden = !show;
          if (show) visible += 1;
        });

        if (status) {
          const label = filter === 'all' ? 'all languages' : chip.textContent;
          setText(status, `Showing ${visible} ${visible === 1 ? 'show' : 'shows'} in ${label}.`);
        }
      });
    });

    // --- On air now ---
    if (!banner || !bannerText) return;

    function updateOnAir() {
      const { minutes, isWeekday } = getNow();
      let live = null;
      let next = null;

      rows.forEach((row) => {
        row.classList.remove('is-live');
        const start = toMinutes(row.dataset.start);
        const end = toMinutes(row.dataset.end);
        if (minutes >= start && minutes < end) live = row;
        else if (start > minutes && (!next || start < toMinutes(next.dataset.start))) next = row;
      });

      const nameOf = (row) => $('th', row).textContent;
      banner.classList.toggle('is-live', Boolean(isWeekday && live));

      let message;
      if (!isWeekday) {
        message = 'This is the weekday schedule. Weekday shows resume on Monday.';
      } else if (live) {
        live.classList.add('is-live');
        message = `On air now: ${nameOf(live)}, until ${live.dataset.end}.`;
      } else if (next) {
        message = `Next on air: ${nameOf(next)} at ${next.dataset.start}.`;
      } else {
        message = `Off air for tonight. Tomorrow starts with ${nameOf(rows[0])} at ${rows[0].dataset.start}.`;
      }
      setText(bannerText, message); // unchanged minute-to-minute = nothing re-announced
    }

    updateOnAir();
    setInterval(() => {
      if (!document.hidden) updateOnAir(); // no work while the tab is in the background
    }, 60 * 1000);
  }

  /* 5. SHOW SEARCH --------------------------------------- */
  function initShowSearch() {
    const input = $('#show-search');
    const cards = $$('.card-grid .card');
    const emptyMessage = $('#no-shows');
    const status = $('#show-status');
    if (!input || !cards.length) return;

    // Read each card's text once instead of on every keystroke
    const index = cards.map((card) => ({ card, text: card.textContent.toLowerCase() }));
    let announceTimer;

    input.addEventListener('input', () => {
      const query = input.value.trim().toLowerCase();
      let visible = 0;

      index.forEach(({ card, text }) => {
        const match = text.includes(query);
        card.hidden = !match;
        if (match) visible += 1;
      });

      if (emptyMessage) emptyMessage.hidden = visible > 0;
      // Announce the count once typing pauses, not on every keystroke
      if (status) {
        clearTimeout(announceTimer);
        announceTimer = setTimeout(() => {
          setText(status, query ? `${visible} ${visible === 1 ? 'show matches' : 'shows match'} your search.` : '');
        }, 500);
      }
    });
  }

  /* 6. SIGNUP FORM VALIDATION ---------------------------- */
  function initForm() {
    const form = $('.signup');
    const input = $('#email');
    const error = $('#email-error');
    const status = $('#form-status');
    const button = form && $('button[type="submit"]', form);
    if (!form || !input || !error || !status || !button) return;

    const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    // Our messages replace the browser's default bubbles
    form.noValidate = true;

    function getProblem() {
      const value = input.value.trim();
      if (!value) return 'Enter your email address.';
      if (!EMAIL_PATTERN.test(value)) return 'That email looks incomplete. Use the format name@example.com.';
      return '';
    }

    // The error element is always in the page (role="alert"); we only change its text
    function showError(message) {
      setText(error, message);
      input.setAttribute('aria-invalid', String(Boolean(message)));
    }

    // Check when the person leaves the field, then fix the message live as they type
    input.addEventListener('blur', () => {
      if (input.value.trim()) showError(getProblem());
    });
    input.addEventListener('input', () => {
      status.textContent = '';
      if (input.getAttribute('aria-invalid') === 'true') showError(getProblem());
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const problem = getProblem();
      showError(problem);

      if (problem) {
        input.focus();
        return;
      }

      // Pretend to send. A real site would call fetch() here.
      button.disabled = true;
      status.textContent = 'Sending…';
      setTimeout(() => {
        status.textContent = `Thank you. A confirmation is on its way to ${input.value.trim()}.`;
        form.reset();
        button.disabled = false;
      }, 700);
    });
  }

  /* 7. REVEAL ON SCROLL ---------------------------------- */
  function initReveal() {
    if (prefersReducedMotion || !('IntersectionObserver' in window)) return;

    const targets = $$('.section h2, .card, .story, .schedule, .support-inner');
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        obs.unobserve(entry.target); // animate once, then stop watching
      });
    }, { threshold: 0.12 });

    targets.forEach((element, i) => {
      element.classList.add('reveal');
      if (element.classList.contains('card')) element.style.transitionDelay = `${(i % 4) * 70}ms`;
      observer.observe(element);
    });
  }

  /* 8. BACK TO TOP --------------------------------------- */
  function initBackToTop() {
    const button = $('.to-top');
    const hero = $('.hero');
    if (!button || !hero || !('IntersectionObserver' in window)) return;

    // Show the button once the hero has scrolled out of view (no scroll listener needed)
    new IntersectionObserver(([entry]) => {
      button.hidden = entry.isIntersecting;
    }).observe(hero);

    button.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
      $('#main').focus({ preventScroll: true });
    });
  }

  /* START ------------------------------------------------ */
  function init() {
    // Make <main> programmatically focusable for the back-to-top button
    const main = $('#main');
    if (main) main.setAttribute('tabindex', '-1');

    initMenu();
    initScrollSpy();
    initSchedule();
    initShowSearch();
    initForm();
    initReveal();
    initBackToTop();
  }

  init(); // the script is loaded with `defer`, so the DOM is ready
})();
