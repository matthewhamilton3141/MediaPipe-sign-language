// Pure text-editing state machine. No DOM, no storage — fully unit-testable.
// Construct with createEditor(); the UI layer renders getState() and persists serialize().

const SENTENCE_END = new Set(['.', '!', '?']);

export function shouldCapitalize(text, pos) {
  // Start of document.
  let i = pos - 1;
  while (i >= 0 && text[i] === ' ') i--;
  if (i < 0) return true;
  if (SENTENCE_END.has(text[i])) return true;
  if (text[i] === '\n') return true;
  return false;
}

export function createEditor(initialText = '') {
  let text = initialText;
  let cursor = initialText.length;
  const undoStack = [];
  let onWordComplete = null; // (word, prevWord) => void

  const snapshot = () => {
    undoStack.push({ text, cursor });
    if (undoStack.length > 100) undoStack.shift();
  };

  // Word immediately left of the cursor (the one being typed).
  function currentWord() {
    const before = text.slice(0, cursor);
    const m = before.match(/[A-Za-z']+$/);
    return m ? m[0] : '';
  }

  // The completed word before the current one (for next-word prediction).
  function previousWord() {
    const before = text.slice(0, cursor);
    const cur = currentWord();
    const trimmed = cur ? before.slice(0, before.length - cur.length) : before;
    const m = trimmed.match(/[A-Za-z']+\s*$/);
    return m ? m[0].trim() : '';
  }

  function insertLetter(rawChar) {
    snapshot();
    let ch = rawChar.toLowerCase();
    if (shouldCapitalize(text, cursor)) ch = ch.toUpperCase();
    text = text.slice(0, cursor) + ch + text.slice(cursor);
    cursor++;
  }

  function insertSpace() {
    snapshot();
    // Promote a standalone "i" to "I" as the word completes.
    const cur = currentWord();
    if (cur.toLowerCase() === 'i') {
      const start = cursor - cur.length;
      text = text.slice(0, start) + 'I' + text.slice(cursor);
    } else if (cur && onWordComplete) {
      onWordComplete(cur, previousWord());
    }
    text = text.slice(0, cursor) + ' ' + text.slice(cursor);
    cursor++;
  }

  function backspace() {
    if (cursor === 0) return false;
    snapshot();
    text = text.slice(0, cursor - 1) + text.slice(cursor);
    cursor--;
    return true;
  }

  function moveCursor(delta) {
    cursor = Math.max(0, Math.min(text.length, cursor + delta));
  }

  function acceptSuggestion(word) {
    const cur = currentWord();
    snapshot();
    const start = cursor - cur.length;
    const cap = shouldCapitalize(text, start);
    const insert = (cap ? word.charAt(0).toUpperCase() + word.slice(1) : word) + ' ';
    text = text.slice(0, start) + insert + text.slice(cursor);
    cursor = start + insert.length;
    if (onWordComplete) onWordComplete(word, previousWord());
  }

  function undo() {
    const prev = undoStack.pop();
    if (!prev) return false;
    text = prev.text;
    cursor = prev.cursor;
    return true;
  }

  function clear() {
    if (!text) return;
    snapshot();
    text = '';
    cursor = 0;
  }

  return {
    insertLetter,
    insertSpace,
    backspace,
    moveCursor,
    acceptSuggestion,
    undo,
    clear,
    currentWord,
    previousWord,
    setWordCompleteHandler: (fn) => { onWordComplete = fn; },
    load: (t) => { text = t || ''; cursor = text.length; undoStack.length = 0; },
    getState: () => ({ text, cursor }),
    serialize: () => text,
  };
}
