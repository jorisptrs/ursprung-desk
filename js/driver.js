// The demo-driver: keys → clock intents. Rig only (?rig); the deployed page
// attaches nothing — chrome-free includes the keyboard. The driver conducts,
// it never fabricates events (D26). Key map is D53's.

const INTENTS = {
  ' ': 'step',
  s: 'step',
  r: 'replay',
  0: 'reset',
  e: 'end',
  l: 'live-toggle',
};

export function attachDriver(dispatch) {
  addEventListener('keydown', (event) => {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return; // cmd+R stays reload
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (key === ' ') event.preventDefault(); // Safari scrolls the viewport regardless of overflow
    if (key === 'f') {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
      return;
    }
    const intent = INTENTS[key];
    if (intent) dispatch(intent);
  });
}

// The ? sits on the table from the start (D77): any visitor may tap it. Plain
// help, not table prose: keyboard keys wear chips, tappable actions wear
// underlines. Rows are [key, label, isKeyboardKey].
const GESTURES = [
  ['tap a card', 'flip it over', false],
  ['tap again', 'flip it back', false],
  ['play / visit ↗', 'open the work behind a card', false],
  ['hold the table', 'keep dealing', false],
];

const RIG_KEYS = [
  ['space', 'next card', true],
  ['r', 'replay from the start', true],
  ['0', 'clear the table', true],
  ['e', 'show the full table', true],
  ['l', 'play the rest automatically', true],
  ['f', 'fullscreen', true],
  ['?', 'this help', true],
];

const VISITOR_KEYS = [
  ['space', 'next card — hold to keep dealing', true],
  ['?', 'this help', true],
];

export function attachHelper(field, { withKeys = false, deal = null } = {}) {
  const button = document.createElement('div');
  button.className = 'keys-btn';
  button.textContent = '?';

  const panel = document.createElement('div');
  panel.className = 'keys';

  const addRow = (key, label, isKbd) => {
    const row = document.createElement('div');
    row.className = 'keys__row';
    const k = document.createElement('span');
    k.className = isKbd ? 'keys__k keys__k--kbd' : 'keys__k';
    k.textContent = key;
    const what = document.createElement('span');
    what.textContent = label;
    row.append(k, what);
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
    if (event.key === '?') toggle();
    else if (event.key === 'Escape') close();
  });

  field.append(button);
  document.body.append(panel);
}
