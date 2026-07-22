// The deposit editor on CodeMirror 6 — Obsidian's foundation, the desk's skin
// (D96/D98). The document is markdown text; blob pieces ride a registry via
// `![caption](piece:ID)` lines; links live in the text. Live preview, one
// grammar throughout: rendered when the cursor is away, raw markdown under
// it — and the raw view dims the machinery so what you edit (a caption, an
// address, a title) stands out. Links render inline with a fetched preview
// of the page's own picture beneath (the page itself is asked, never a
// third-party service); mentions wear a quiet pill; the `# ` marks of the
// title hide when the cursor leaves. Loaded only when a sheet opens; the
// vendored bundle is served locally (D36).

import {
  EditorState, EditorSelection, StateField, StateEffect, RangeSetBuilder,
  EditorView, Decoration, WidgetType, keymap, placeholder,
  defaultKeymap, history, historyKeymap,
  autocompletion, completionStatus, closeCompletion,
} from '../vendor/codemirror.js';
import { classifyLine, slashTokenAt, normalizeUrl, soleUrl } from './deposit.js';

const setFront = StateEffect.define();
const metaArrived = StateEffect.define();
const setFocused = StateEffect.define();

const frontField = StateField.define({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setFront)) return e.value;
    return value;
  },
});

// Raw markdown belongs under the pen, and only under the pen: when the editor
// loses focus the whole page renders again (D98), the way a note closes.
const focusField = StateField.define({
  create: () => false,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setFocused)) return e.value;
    return value;
  },
});

// ---- widget DOM ----

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

// the host as it is, port and all — a link reads honestly or not at all
const hostOf = (href) => { try { return new URL(href).host.replace(/^www\./, ''); } catch { return href; } };

// The focus field re-checks the DOM's truth at every boundary (D99): the OS
// can blur the window under us — a native file dialog, a drag from another
// app — without a clean focus-change transaction, and a stale field freezes
// the page fully rendered while the pen tries to edit it.
const syncFocusField = (view) => {
  const has = view.hasFocus;
  if (view.state.field(focusField) !== has) view.dispatch({ effects: setFocused.of(has) });
};

// Choosing which face fronts the card is its own quiet mark (D99): a click on
// the piece itself belongs to the pen — it opens the line for editing, the way
// a click does everywhere else on the page.
const frontChip = (isFront) => {
  const chip = el('span', `pick-front${isFront ? ' pick-front--on' : ''}`, 'front');
  chip.title = isFront ? 'this face fronts the card' : 'front the card with this';
  return chip;
};

class PieceWidget extends WidgetType {
  // spec: { key, kind, src, caption, name, frontable, isFront }
  constructor(spec, host) {
    super();
    this.spec = spec;
    this.host = host;
  }

  eq(o) {
    const a = this.spec;
    const b = o.spec;
    return a.key === b.key && a.src === b.src && a.caption === b.caption && a.isFront === b.isFront;
  }

  ignoreEvent() { return true; }

  toDOM(view) {
    const s = this.spec;
    const box = el('div', `edit-piece edit-piece--${s.kind}`);
    if (s.isFront) box.classList.add('desk-front');
    if (s.src) {
      const img = el('img', 'edit-piece__img');
      img.src = s.src;
      img.draggable = false;
      box.append(img);
    } else {
      box.append(el('span', 'edit-piece__name', s.name ?? ''));
    }
    if (s.caption) box.append(el('div', 'edit-piece__caption', s.caption));
    const pick = s.frontable ? frontChip(s.isFront) : null;
    if (pick) box.append(pick);
    const x = el('span', 'edit-piece__x', '×');
    x.title = 'remove';
    box.append(x);
    box.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const pos = view.posAtDOM(box);
      if (e.target === x) { this.host.removeLine(view, pos); return; }
      if (e.target === pick) { this.host.onTap(s.key); return; }
      this.host.enterLine(view, pos); // a click opens the line, always (D99)
    });
    return box;
  }
}

class LinkWidget extends WidgetType {
  // spec: { href, text, plain, isFront, meta: {status, image, title} | null }
  constructor(spec, host) {
    super();
    this.spec = spec;
    this.host = host;
  }

  eq(o) {
    const a = this.spec;
    const b = o.spec;
    return a.href === b.href && a.text === b.text && a.plain === b.plain && a.isFront === b.isFront
      && a.meta?.status === b.meta?.status && a.meta?.image === b.meta?.image && a.meta?.title === b.meta?.title;
  }

  ignoreEvent() { return true; }

  toDOM(view) {
    const s = this.spec;
    const wrap = el('div', 'desk-linkwrap');
    if (s.isFront) wrap.classList.add('desk-front');
    const line = el('span', `desk-linkline${s.plain ? ' desk-linkline--plain' : ''}`, s.text);
    wrap.append(line);
    const pick = s.plain ? null : frontChip(s.isFront); // a dismissed link cannot front the card
    if (pick) wrap.append(pick);
    if (!s.plain) {
      const meta = s.meta;
      if (meta?.status === 'loading') {
        wrap.append(el('div', 'link-preview link-preview--loading'));
      } else if (meta?.status === 'done' && (meta.image || meta.title)) {
        const box = el('div', 'link-preview');
        if (meta.image) {
          const img = el('img');
          img.src = meta.image;
          img.draggable = false;
          img.addEventListener('error', () => box.remove()); // a preview that cannot load leaves quietly
          box.append(img);
        }
        if (meta.title) box.append(el('div', 'link-preview__title', meta.title));
        const x = el('span', 'link-preview__x', '×');
        x.title = 'just the link';
        box.append(x);
        wrap.append(box);
      }
    }
    wrap.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const pos = view.posAtDOM(wrap);
      if (e.target.classList?.contains('link-preview__x')) { this.host.dismissLine(view, pos); return; }
      if (e.target === pick) { this.host.onTap(s.href); return; }
      this.host.enterLine(view, pos); // the address opens under the pen (D99)
    });
    return wrap;
  }
}

// ---- the preview: rendered away, raw (with dimmed machinery) under the pen ----

const TITLE_LINE = /^# .*\S/;
const MENTION = /@[\p{L}][\p{L}\d._'-]*/gu;
const INLINE_URL = /https?:\/\/\S+/g;

// Exported for node tests: EditorState runs without a DOM.
export function buildPreview(state, registry, front, host) {
  const builder = new RangeSetBuilder();
  const sel = state.selection.main;
  const focusValue = state.field(focusField, false);
  const focused = focusValue === undefined ? true : focusValue; // node tests carry no field — they test the focused page
  let titleSeen = false;
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n);
    const c = classifyLine(line.text);
    const touched = focused && sel.from <= line.to && sel.to >= line.from;
    const adds = [];

    if (c.t === 'text') {
      if (!titleSeen && TITLE_LINE.test(line.text)) {
        titleSeen = true;
        adds.push([line.from, line.from, Decoration.line({ class: 'desk-title' })]);
        if (touched) adds.push([line.from, line.from + 2, Decoration.mark({ class: 'desk-syntax' })]);
        else adds.push([line.from, line.from + 2, Decoration.replace({})]); // the marks hide when the pen leaves (D98)
      }
      for (const m of line.text.matchAll(MENTION)) {
        adds.push([line.from + m.index, line.from + m.index + m[0].length, Decoration.mark({ class: 'desk-mention' })]);
      }
      for (const m of line.text.matchAll(INLINE_URL)) {
        adds.push([line.from + m.index, line.from + m.index + m[0].length, Decoration.mark({ class: 'desk-url' })]);
      }
    } else if (line.from === line.to) {
      // empty classified line cannot happen; skip
    } else if (touched) {
      // raw markdown under the pen, machinery dimmed so the editable part stands out
      if (c.t === 'piece') {
        const capEnd = line.from + 2 + c.caption.length;
        adds.push([line.from, line.from + 2, Decoration.mark({ class: 'desk-syntax' })]);
        adds.push([capEnd, line.to, Decoration.mark({ class: 'desk-syntax' })]);
      } else if (c.t === 'link' && c.caption != null) {
        const capEnd = line.from + 1 + c.caption.length;
        adds.push([line.from, line.from + 1, Decoration.mark({ class: 'desk-syntax' })]);
        adds.push([capEnd, line.to, Decoration.mark({ class: 'desk-syntax' })]);
      } else {
        adds.push([line.from, line.to, Decoration.mark({ class: 'desk-url' })]);
      }
    } else if (c.t === 'piece') {
      const p = registry.get(c.ref);
      if (p) {
        adds.push([line.from, line.to, Decoration.replace({
          widget: new PieceWidget({
            key: c.ref,
            kind: p.kind,
            src: p.front?.src ?? null,
            name: p.name,
            caption: p.kind === 'file' ? null : (c.caption.trim() || null),
            frontable: p.kind !== 'file',
            isFront: front === c.ref,
          }, host),
        })]);
      }
      // unknown refs stay visible as text — honest about the break
    } else {
      const href = c.href;
      const meta = host.linkMeta?.get(href) ?? null;
      if (c.t === 'link' && !meta) host.requestMeta?.(href);
      adds.push([line.from, line.to, Decoration.replace({
        widget: new LinkWidget({
          href,
          text: c.caption?.trim() || hostOf(href),
          plain: c.t === 'dismissed',
          isFront: front === href,
          meta,
        }, host),
      })]);
    }

    adds.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (const [from, to, deco] of adds) builder.add(from, to, deco);
  }
  return builder.finish();
}

// ---- the editor ----

export function createDeskEditor({
  parent, doc = '', registry, autofocus = false, teach = '',
  slashItems = [], onDocChanged = () => {}, onFrontTap = () => {},
  linkMeta = new Map(), requestMeta = null,
}) {
  const host = {
    linkMeta,
    requestMeta,
    onTap: (key) => onFrontTap(key),
    // the pen lands on the editable part — a piece's caption, a link's caption
    // — not behind the machinery (D99)
    enterLine(view, pos) {
      const line = view.state.doc.lineAt(pos);
      const c = classifyLine(line.text);
      let anchor = line.to;
      if (c.t === 'piece') anchor = line.from + 2 + c.caption.length;
      else if (c.t === 'link' && c.caption != null) anchor = line.from + 1 + c.caption.length;
      view.dispatch({ selection: { anchor } });
      view.focus();
      syncFocusField(view);
    },
    removeLine(view, pos) {
      const line = view.state.doc.lineAt(pos);
      const to = line.to < view.state.doc.length ? line.to + 1 : line.to;
      view.dispatch({ changes: { from: line.from, to, insert: '' } });
      view.focus();
      syncFocusField(view);
    },
    dismissLine(view, pos) { // the preview clicks away; the plain link stays (D88/D98)
      const line = view.state.doc.lineAt(pos);
      const c = classifyLine(line.text);
      if (c.t !== 'link') return;
      view.dispatch({ changes: { from: line.from, to: line.to, insert: `<${c.href}>` } });
      view.focus();
      syncFocusField(view);
    },
  };

  const previewField = StateField.define({
    create: (state) => buildPreview(state, registry, null, host),
    update(deco, tr) {
      const poked = tr.effects.some((e) => e.is(setFront) || e.is(metaArrived) || e.is(setFocused));
      if (!tr.docChanged && !tr.selection && !poked) return deco;
      return buildPreview(tr.state, registry, tr.state.field(frontField), host);
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  // slash anywhere, by the same word-start rule the old menu kept (D90); an
  // item's `when(state)` can stand it down — a taken door leaves the menu (D99)
  function slashSource(context) {
    const line = context.state.doc.lineAt(context.pos);
    const token = slashTokenAt(line.text, context.pos - line.from);
    if (!token) return null;
    const items = slashItems.filter((item) => !item.when || item.when(context.state));
    if (!items.length) return null;
    const from = line.from + token.start;
    return {
      from: from + 1,
      validFor: /^[\w' ]*$/,
      options: items.map((item) => ({
        label: item.label,
        detail: item.detail,
        apply: (v, completion, applyFrom, applyTo) => {
          v.dispatch({ changes: { from: applyFrom - 1, to: applyTo, insert: '' } });
          item.run(v, applyFrom - 1);
        },
      })),
    };
  }

  const deskKeymap = [
    {
      key: 'Backspace', // at a line start below an embed, take the piece with it (D94)
      run(v) {
        const sel = v.state.selection.main;
        if (!sel.empty) return false;
        const line = v.state.doc.lineAt(sel.head);
        if (sel.head !== line.from || line.number === 1) return false;
        const prev = v.state.doc.line(line.number - 1);
        if (classifyLine(prev.text).t === 'text') return false;
        v.dispatch({ changes: { from: prev.from, to: line.from, insert: '' } });
        return true;
      },
    },
    {
      key: 'Delete',
      run(v) {
        const sel = v.state.selection.main;
        if (!sel.empty) return false;
        const line = v.state.doc.lineAt(sel.head);
        if (sel.head !== line.to || line.number === v.state.doc.lines) return false;
        const next = v.state.doc.line(line.number + 1);
        if (classifyLine(next.text).t === 'text') return false;
        v.dispatch({ changes: { from: line.to, to: next.to, insert: '' } });
        return true;
      },
    },
    {
      key: 'Enter', // a bare domain, deliberately entered, reads as https (D94)
      run(v) {
        const sel = v.state.selection.main;
        if (!sel.empty) return false;
        const line = v.state.doc.lineAt(sel.head);
        if (sel.head !== line.to) return false;
        const t = line.text.trim();
        if (!t || soleUrl(t) || classifyLine(line.text).t !== 'text') return false;
        const url = normalizeUrl(t);
        if (!url) return false;
        v.dispatch({
          changes: { from: line.from, to: line.to, insert: `${url}\n` },
          selection: { anchor: line.from + url.length + 1 },
        });
        return true;
      },
    },
  ];

  const theme = EditorView.theme({
    '&': { fontFamily: 'inherit', fontSize: 'inherit' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.45' }, // the page wears the house serif, not CM's monospace
    '.cm-content': {
      fontFamily: 'inherit',
      lineHeight: '1.45',
      caretColor: '#2b2418',
      padding: '0 0 1.2em 0',
      minHeight: '8em',
    },
    '.cm-line': { padding: '0.1em 0.4em' },
    // inline, not CM's inline-block: a wrapping hint must not become one tall
    // box, or the caret on the empty page stands two lines high (D99)
    '.cm-placeholder': { color: 'rgba(43, 36, 24, 0.35)', display: 'inline' },
    '.cm-tooltip': { border: 'none', background: 'transparent' },
    '.cm-tooltip.cm-tooltip-autocomplete': {
      background: 'rgba(24, 20, 15, 0.98)',
      border: '1px solid rgba(210, 190, 150, 0.18)',
      borderRadius: '6px',
      padding: '0.3em 0',
      fontFamily: 'inherit',
    },
    '.cm-tooltip-autocomplete > ul': { fontFamily: 'inherit', maxHeight: '16em' },
    '.cm-tooltip-autocomplete > ul > li': {
      padding: '0.3em 0.9em',
      color: 'rgba(232, 220, 196, 0.8)',
      fontSize: '0.9em',
      lineHeight: '1.5',
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      background: 'rgba(210, 190, 150, 0.08)',
      color: 'rgba(220, 196, 150, 1)',
    },
    '.cm-completionDetail': {
      marginLeft: '0.8em',
      fontStyle: 'normal',
      fontSize: '0.82em',
      color: 'rgba(232, 220, 196, 0.45)',
    },
    '.cm-completionMatchedText': { textDecoration: 'none', color: 'rgba(220, 196, 150, 1)' },
  });

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        frontField,
        focusField,
        EditorView.focusChangeEffect.of((s, focusing) => setFocused.of(focusing)),
        previewField,
        history(),
        // the completion keymap must outrank the editing keymaps, or Enter
        // inserts a newline under an open menu instead of picking
        autocompletion({ override: [slashSource], icons: false, interactionDelay: 0 }),
        keymap.of([...deskKeymap, ...historyKeymap, ...defaultKeymap]),
        placeholder(teach),
        theme,
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off' }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onDocChanged(u.state.doc.toString());
          // whatever the browser did with focus — a native picker, a window
          // switch, a drag from another app — the next move corrects the
          // field, so the page never sits rendered under a live pen (D99)
          if (u.view.hasFocus !== u.state.field(focusField)) queueMicrotask(() => syncFocusField(u.view));
        }),
      ],
    }),
  });

  // the DOM reports every boundary; the field follows it (D99)
  view.contentDOM.addEventListener('focusin', () => syncFocusField(view));
  view.contentDOM.addEventListener('focusout', () => queueMicrotask(() => syncFocusField(view)));

  if (autofocus) {
    view.focus();
    syncFocusField(view);
  }

  return {
    view,
    getText: () => view.state.doc.toString(),
    setText(text, { focusEnd = false } = {}) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        selection: focusEnd ? { anchor: text.length } : undefined,
      });
    },
    applyChange(change) { // { from, to, insert, cursor? } in current-doc coordinates
      view.dispatch({
        changes: { from: change.from, to: change.to, insert: change.insert },
        selection: change.cursor != null ? { anchor: change.cursor } : undefined,
        scrollIntoView: true,
      });
    },
    select(anchor, head) {
      view.dispatch({ selection: { anchor, head }, scrollIntoView: true });
      view.focus();
      syncFocusField(view);
    },
    setFrontPiece(key) { view.dispatch({ effects: setFront.of(key) }); },
    refreshMeta() { view.dispatch({ effects: metaArrived.of(null) }); },
    menuOpen: () => completionStatus(view.state) != null,
    closeMenu: () => closeCompletion(view),
    posAtCoords: (x, y) => view.posAtCoords({ x, y }),
    cursor: () => view.state.selection.main.head,
    focus: () => { view.focus(); syncFocusField(view); },
    destroy: () => view.destroy(),
  };
}
