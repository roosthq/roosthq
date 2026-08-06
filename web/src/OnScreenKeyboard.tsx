import { useEffect, useState } from 'react';

type Field = HTMLInputElement | HTMLTextAreaElement;

const SKIP_INPUT_TYPES = new Set(['checkbox', 'radio', 'file', 'range', 'color', 'button', 'submit', 'reset', 'hidden']);
const NUMERIC_INPUT_TYPES = new Set(['number', 'tel']);
const NUMERIC_INPUT_MODES = new Set(['numeric', 'tel', 'decimal']);

function isEditableField(el: EventTarget | null): el is Field {
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) return !SKIP_INPUT_TYPES.has(el.type) && !el.readOnly && !el.disabled;
  return false;
}

function isNumericField(el: Field): boolean {
  if (el instanceof HTMLInputElement && NUMERIC_INPUT_TYPES.has(el.type)) return true;
  return NUMERIC_INPUT_MODES.has(el.inputMode);
}

// React tracks each input's value through its own property setter, so setting
// `.value` directly (and firing a plain 'input' event) gets silently ignored —
// go through the native prototype setter instead, same trick RTL/Enzyme use.
function setNativeValue(el: Field, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function insertAtCursor(el: Field, text: string) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  setNativeValue(el, el.value.slice(0, start) + text + el.value.slice(end));
  const pos = start + text.length;
  el.setSelectionRange(pos, pos);
}

function pressBackspace(el: Field) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  if (start !== end) {
    setNativeValue(el, el.value.slice(0, start) + el.value.slice(end));
    el.setSelectionRange(start, start);
  } else if (start > 0) {
    setNativeValue(el, el.value.slice(0, start - 1) + el.value.slice(end));
    el.setSelectionRange(start - 1, start - 1);
  }
}

function pressEnter(el: Field) {
  if (el instanceof HTMLTextAreaElement) {
    insertAtCursor(el, '\n');
    return;
  }
  // Textareas aside, most forms in this app submit via an onKeyDown === 'Enter'
  // check rather than a real <form>, so dispatch the key event, not a newline.
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
}

const LETTER_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

// Pops a touch keyboard above whatever text field is focused anywhere on the
// page — Chromium's kiosk mode on the Pi has no hardware keyboard and no
// built-in on-screen one, unlike a phone browser. Togglable per-display via
// DisplayConfig.onScreenKeyboard since a kiosk with a real keyboard attached
// doesn't want this popping up.
export default function OnScreenKeyboard({ enabled }: { enabled: boolean }) {
  const [field, setField] = useState<Field | null>(null);
  const [shift, setShift] = useState(false);
  const [numeric, setNumeric] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setField(null);
      return;
    }
    function onFocusIn(e: FocusEvent) {
      if (!isEditableField(e.target)) return;
      setField(e.target);
      setNumeric(isNumericField(e.target));
      setShift(false);
    }
    // Hides on blur unless focus landed on another editable field (handled by
    // the focusin above firing right after) — a short delay lets that happen
    // first instead of the keyboard flashing closed between fields.
    function onFocusOut() {
      setTimeout(() => {
        if (!isEditableField(document.activeElement)) setField(null);
      }, 0);
    }
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, [enabled]);

  if (!enabled || !field) return null;

  function press(ch: string) {
    insertAtCursor(field!, shift ? ch.toUpperCase() : ch);
    setShift(false);
  }

  const key = 'flex-1 rounded-lg border bg-white py-3 text-lg font-medium shadow-sm active:bg-slate-100';
  const wideKey = `${key} flex-[1.6]`;

  return (
    // preventDefault on mousedown (not click) stops the browser's default
    // "move focus to whatever was pressed" — without it every tap here would
    // blur the field it's supposed to be typing into.
    <div
      onMouseDown={(e) => e.preventDefault()}
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-slate-100 p-2 shadow-[0_-4px_16px_rgba(0,0,0,0.12)]"
    >
      <div className="mx-auto max-w-2xl space-y-1.5">
        {numeric ? (
          // Phone-style dialpad (3x4, fixed width) instead of stretching all
          // 10 digits + backspace + enter across the full keyboard width —
          // that read as too thin/spread out to tap accurately.
          <div className="mx-auto grid w-72 grid-cols-3 gap-2">
            {'123456789'.split('').map((d) => (
              <button key={d} className="rounded-lg border bg-white py-4 text-xl font-medium shadow-sm active:bg-slate-100" onClick={() => press(d)}>
                {d}
              </button>
            ))}
            <button className="rounded-lg border bg-white py-4 text-xl font-medium shadow-sm active:bg-slate-100" onClick={() => pressBackspace(field)}>
              ⌫
            </button>
            <button className="rounded-lg border bg-white py-4 text-xl font-medium shadow-sm active:bg-slate-100" onClick={() => press('0')}>
              0
            </button>
            <button className="rounded-lg border bg-white py-4 text-xl font-medium shadow-sm active:bg-slate-100" onClick={() => pressEnter(field)}>
              ⏎
            </button>
          </div>
        ) : (
          <>
            {LETTER_ROWS.map((row, i) => (
              <div key={row} className="flex gap-1.5">
                {i === 2 && (
                  <button
                    className={`${key} ${shift ? 'bg-slate-800 text-white' : ''}`}
                    onClick={() => setShift((v) => !v)}
                  >
                    ⇧
                  </button>
                )}
                {row.split('').map((ch) => (
                  <button key={ch} className={key} onClick={() => press(ch)}>
                    {shift ? ch.toUpperCase() : ch}
                  </button>
                ))}
                {i === 2 && (
                  <button className={key} onClick={() => pressBackspace(field)}>
                    ⌫
                  </button>
                )}
              </div>
            ))}
            <div className="flex gap-1.5">
              <button className={key} onClick={() => setNumeric(true)}>
                123
              </button>
              <button className={key} onClick={() => press(',')}>
                ,
              </button>
              <button className={wideKey} onClick={() => insertAtCursor(field, ' ')}>
                space
              </button>
              <button className={key} onClick={() => press('.')}>
                .
              </button>
              <button className={key} onClick={() => pressEnter(field)}>
                ⏎
              </button>
            </div>
          </>
        )}
        <div className="flex justify-end gap-1.5">
          {numeric && (
            <button className="rounded-lg border bg-white px-3 py-1.5 text-xs hover:bg-slate-50" onClick={() => setNumeric(false)}>
              ABC
            </button>
          )}
          <button
            className="rounded-lg border bg-slate-800 px-3 py-1.5 text-xs text-white hover:bg-slate-700"
            onClick={() => {
              field.blur();
              setField(null);
            }}
          >
            Hide keyboard
          </button>
        </div>
      </div>
    </div>
  );
}
