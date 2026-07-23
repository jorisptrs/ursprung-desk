// The demo-driver: keys → clock intents. Rig only (?rig); the deployed page
// attaches nothing — chrome-free includes the keyboard. The driver conducts,
// it never fabricates events (D26). Key map is D53's.

const INTENTS = {
  r: 'replay',
  0: 'reset',
  e: 'end',
  l: 'live-toggle',
};

const SCRUBS = { s: 'step', ArrowRight: 'step', ArrowLeft: 'back' }; // held, these rush (D78); space steps nowhere (D103)

export function attachDriver(dispatch) {
  // The scrub timer is the driver's own — OS key-repeat can be slow or off.
  let scrub = null;
  const stopScrub = () => {
    if (!scrub) return;
    clearInterval(scrub);
    scrub = null;
  };
  addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return; // cmd+R stays reload
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (key === ' ') event.preventDefault(); // Safari scrolls the viewport regardless of overflow
    if (SCRUBS[key]) {
      if (event.repeat) return;
      stopScrub();
      dispatch(SCRUBS[key]);
      scrub = setInterval(() => dispatch(SCRUBS[key]), 70);
      return;
    }
    if (event.repeat) return;
    if (key === 'f') {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
      return;
    }
    const intent = INTENTS[key];
    if (intent) dispatch(intent);
  });
  addEventListener('keyup', (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (SCRUBS[key]) stopScrub();
  });
}

// The ? sits on the table from the start (D77): any visitor may tap it. Plain
// help, not table prose: keyboard keys wear chips, tappable actions wear
// underlines. Rows are [key, label, isKeyboardKey].
const GESTURES = [
  ['tap a card', 'flip it over', false],
  ['tap again', 'flip it back', false],
  ['play / visit ↗', 'open the work behind a card', false],
  ['hold the table', 'rush through the cards', false],
];

const RIG_KEYS = [
  ['→ / s', 'next card — hold to rush', true],
  ['←', 'take cards back — hold to rush', true],
  ['r', 'replay from the start', true],
  ['0', 'clear the table', true],
  ['e', 'show the full table', true],
  ['l', 'play the rest automatically', true],
  ['f', 'fullscreen', true],
  ['?', 'this help', true],
];

const VISITOR_KEYS = [
  ['→', 'next card — hold to rush', true],
  ['←', 'take cards back — hold to rush', true],
  ['r', 'clear the table', true],
  ['space or enter', 'add your work', true], // a held space still rushes ahead (D99)
  ['?', 'this help', true],
];

export function attachHelper(field, { withKeys = false, deal = null, tail = false } = {}) {
  const button = document.createElement('div');
  button.className = 'keys-btn';
  button.textContent = '?';

  const panel = document.createElement('div');
  panel.className = 'keys';

  const addRow = (key, label, isKbd) => {
    const row = document.createElement('div');
    row.className = 'keys__row';
    if (key != null) {
      const k = document.createElement('span');
      k.className = isKbd ? 'keys__k keys__k--kbd' : 'keys__k';
      k.textContent = key;
      row.append(k);
    }
    const what = document.createElement('span');
    what.textContent = label;
    row.append(what);
    panel.append(row);
    return { row, what };
  };

  for (const [key, label, kbd] of withKeys ? RIG_KEYS : VISITOR_KEYS) addRow(key, label, kbd);

  // The deal switch (D78): chip is its key, the underlined label is the button.
  let dealLabel = null;
  if (deal) {
    const { row, what } = addRow('d', deal.label(), true);
    dealLabel = what;
    dealLabel.classList.add('keys__action');
    row.addEventListener('click', (event) => {
      event.stopPropagation();
      deal.toggle();
      dealLabel.textContent = deal.label();
    });
  }

  // Only while ?tail actually holds something back (D111) — a local flag for
  // the one-take shoot, never on the deployed page.
  if (tail) addRow('m', 'land the held tail', true);

  for (const [key, label, kbd] of GESTURES) addRow(key, label, kbd);

  const close = () => panel.classList.remove('open');
  const toggle = () => {
    if (dealLabel && deal) dealLabel.textContent = deal.label(); // fresh on open
    panel.classList.toggle('open');
  };
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    toggle();
  });
  panel.addEventListener('click', close);
  addEventListener('keydown', (event) => {
    if (event.target instanceof Element && event.target.closest('input, textarea, select, .sheet')) return; // typing on the sheet is typing
    if (event.key === '?') toggle();
    else if (event.key === 'Escape') close();
  });

  field.append(button);
  document.body.append(panel);
}
