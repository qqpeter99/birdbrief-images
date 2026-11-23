// Form handling for the daily brief signup (index.html) and the ski and ride
// plan request (plan.html). Talks to the SkiCall backend when config.js sets
// an API URL; otherwise shows a preview message and sends nothing.
(function () {
  const cfg = window.BIRDBRIEF || {};
  const live = !!cfg.api;

  // Cloudflare Turnstile ("are you human"), only when live and configured.
  if (live && cfg.turnstileSiteKey) {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
    document.querySelectorAll('[data-turnstile]').forEach(el => {
      el.className = 'cf-turnstile';
      el.setAttribute('data-sitekey', cfg.turnstileSiteKey);
      el.setAttribute('data-theme', el.dataset.turnstile || 'auto');
      el.setAttribute('data-size', 'flexible');
    });
  }
  const turnstileToken = form => form.querySelector('[name="cf-turnstile-response"]')?.value || '';

  async function post(path, body) {
    const r = await fetch(cfg.api.replace(/\/+$/, '') + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }

  function setBusy(form, busy) {
    const btn = form.querySelector('button[type=submit]');
    if (btn) { btn.disabled = busy; btn.dataset.label = btn.dataset.label || btn.textContent; btn.textContent = busy ? 'Sending…' : btn.dataset.label; }
  }
  function showError(form, msg) {
    let el = form.querySelector('.form-error');
    if (!el) { el = document.createElement('p'); el.className = 'form-error'; form.appendChild(el); }
    el.textContent = msg;
  }

  // Daily brief signup.
  const signup = document.getElementById('signup');
  if (signup) {
    signup.addEventListener('submit', async e => {
      e.preventDefault();
      const thanks = document.getElementById('thanks');
      if (!live) {
        thanks.textContent = 'Thanks! Signups open soon. This is a preview, so your email wasn\'t saved yet.';
      } else {
        setBusy(signup, true);
        try {
          const out = await post('/api/subscribe', { email: signup.email.value, turnstileToken: turnstileToken(signup) });
          thanks.textContent = out.status === 'already-subscribed'
            ? 'You\'re already subscribed. See you in the morning!'
            : 'You\'re in! Your first SkiCall arrives tomorrow morning.';
        } catch (err) {
          setBusy(signup, false);
          showError(signup, err.message);
          if (window.turnstile) window.turnstile.reset();
          return;
        }
      }
      signup.style.display = 'none';
      thanks.style.display = 'block';
    });
  }

  // Ski and ride plan request.
  const plan = document.getElementById('plan');
  if (plan) {
    // After lifts close (4pm Snowbird time), "Today" no longer makes sense:
    // switch to Tomorrow and grey Today out.
    const denverHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', hour: 'numeric', hour12: false }).format(new Date())) % 24;
    if (denverHour >= 16) {
      const today = plan.querySelector('input[name=day][value=today]');
      const tomorrow = plan.querySelector('input[name=day][value=tomorrow]');
      if (today && tomorrow) {
        today.disabled = true;
        tomorrow.checked = true;
        const span = today.closest('label')?.querySelector('span');
        if (span) span.textContent = 'Today (lifts closed)';
      }
    }
    const label =(name, value) => plan.querySelector(`input[name=${name}][value="${value}"]`)?.closest('label')?.querySelector('b, span')?.firstChild?.textContent.trim() || value;
    plan.addEventListener('submit', async e => {
      e.preventDefault();
      if (!plan.reportValidity()) return;
      const f = new FormData(plan);
      const body = {
        day: f.get('day'), ride: f.get('ride'), level: f.get('level'), arrive: f.get('arrive'),
        hours: f.get('hours'), transport: f.get('transport'), terrain: f.getAll('terrain'),
        email: f.get('email'), subscribe: !!f.get('subscribe'), turnstileToken: turnstileToken(plan),
      };
      const done = document.getElementById('done');
      if (live) {
        setBusy(plan, true);
        try {
          await post('/api/plan', body);
          done.querySelector('.eyebrow').textContent = 'On its way';
          done.querySelector('p').textContent = 'Your plan will land in your inbox in a few minutes. Check spam if you don\'t see it. Here\'s what we\'re planning for:';
        } catch (err) {
          setBusy(plan, false);
          showError(plan, err.message);
          if (window.turnstile) window.turnstile.reset();
          return;
        }
      }
      const [h, m] = body.arrive.split(':').map(Number);
      const arrive = new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      const terrain = body.terrain.map(t => label('terrain', t));
      const items = [
        ['When', body.day[0].toUpperCase() + body.day.slice(1) + `, arriving ${arrive}`],
        ['Riding', `${label('ride', body.ride)}, ${label('level', body.level)} level`],
        ['Time on the mountain', label('hours', body.hours)],
        ['Getting there', label('transport', body.transport)],
        ['Terrain', terrain.length ? terrain.join(', ') : 'No preference'],
        ['Send to', body.email + (body.subscribe ? ' (plus the daily brief)' : '')],
      ];
      document.getElementById('summary').replaceChildren(...items.map(([k, v]) => {
        const li = document.createElement('li');
        const b = document.createElement('b');
        b.textContent = k;
        li.append(b, document.createTextNode(v));
        return li;
      }));
      plan.hidden = true;
      done.hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
})();
