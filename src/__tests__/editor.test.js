import { describe, it, expect } from 'vitest';
import { createEditor, shouldCapitalize } from '../editor.js';

describe('shouldCapitalize', () => {
  it('capitalizes at start of document', () => {
    expect(shouldCapitalize('', 0)).toBe(true);
  });
  it('capitalizes after sentence-ending punctuation + space', () => {
    expect(shouldCapitalize('Hi. ', 4)).toBe(true);
    expect(shouldCapitalize('Yes! ', 5)).toBe(true);
  });
  it('does not capitalize mid-word', () => {
    expect(shouldCapitalize('hello', 5)).toBe(false);
  });
});

describe('editor typing', () => {
  it('inserts letters and auto-capitalizes the first one', () => {
    const ed = createEditor();
    ed.insertLetter('H');
    ed.insertLetter('I');
    expect(ed.serialize()).toBe('Hi');
  });

  it('capitalizes the start of a new sentence', () => {
    const ed = createEditor();
    'hi'.split('').forEach((c) => ed.insertLetter(c));
    ed.insertLetter('.');
    ed.insertSpace();
    ed.insertLetter('y');
    expect(ed.serialize()).toBe('Hi. Y');
  });

  it('promotes standalone "i" to "I" on space', () => {
    const ed = createEditor('me and i');
    ed.insertSpace();
    expect(ed.serialize()).toBe('me and I ');
  });

  it('backspaces and respects empty buffer', () => {
    const ed = createEditor('ab');
    expect(ed.backspace()).toBe(true);
    expect(ed.serialize()).toBe('a');
    ed.backspace();
    expect(ed.backspace()).toBe(false);
  });
});

describe('editor cursor & undo', () => {
  it('moves cursor within bounds', () => {
    const ed = createEditor('abc');
    ed.moveCursor(-1);
    expect(ed.getState().cursor).toBe(2);
    ed.moveCursor(-99);
    expect(ed.getState().cursor).toBe(0);
    ed.moveCursor(99);
    expect(ed.getState().cursor).toBe(3);
  });

  it('inserts at the cursor position', () => {
    const ed = createEditor('ac');
    ed.moveCursor(-1);
    ed.insertLetter('b');
    expect(ed.serialize()).toBe('abc');
  });

  it('undoes the last edit', () => {
    const ed = createEditor('hi');
    ed.insertLetter('x');
    expect(ed.undo()).toBe(true);
    expect(ed.serialize()).toBe('hi');
  });
});

describe('editor word helpers', () => {
  it('reports current and previous words', () => {
    const ed = createEditor('hello wor');
    expect(ed.currentWord()).toBe('wor');
    expect(ed.previousWord()).toBe('hello');
  });

  it('returns empty current word right after a space', () => {
    const ed = createEditor('hello ');
    expect(ed.currentWord()).toBe('');
    expect(ed.previousWord()).toBe('hello');
  });

  it('accepts a suggestion and replaces the partial word', () => {
    const ed = createEditor('the wor');
    ed.acceptSuggestion('world');
    expect(ed.serialize()).toBe('the world ');
  });

  it('fires the word-complete handler on space', () => {
    const ed = createEditor('the cat');
    const seen = [];
    ed.setWordCompleteHandler((w, prev) => seen.push([w, prev]));
    ed.insertSpace();
    expect(seen).toEqual([['cat', 'the']]);
  });
});
