const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const voice = require('./voice.js');
const roads = [
  { name: 'Murphy Road', label: 'Murphy Road · 1' },
  { name: 'Murphy Road', label: 'Murphy Road · 2' },
  { name: 'Cambridge Road', label: 'Cambridge Road' },
  { name: '', label: 'Local road 10' },
];

function report(text, selected = 1) {
  return voice.parseFieldReport(text, roads, selected);
}

test('understands English, Hindi and Hinglish for explicit open and closed reports', () => {
  for (const [phrase, roadId, closed] of [
    ['Cambridge Road is flooded', 2, true],
    ['Cambridge Road reopened', 2, false],
    ['Cambridge Road is blocked by flooding', 2, true],
    ['कैम्ब्रिज रोड बंद है', 2, true],
    ['कैम्ब्रिज रोड अब खुली है', 2, false],
    ['Murphy Road section two band hai', 1, true],
    ['मर्फी रोड सेक्शन २ बंद है', 1, true],
    ['Close Local road 10', 3, true],
  ]) {
    assert.deepEqual(report(phrase), { kind: 'review', roadId, closed }, phrase);
  }
});

test('uses the current selection only on an explicit contextual reference', () => {
  for (const phrase of ['this road is flooded', 'यह सड़क बंद है', 'yeh road band hai', 'the selected section is blocked']) {
    assert.deepEqual(report(phrase), { kind: 'review', roadId: 1, closed: true }, phrase);
  }
  for (const phrase of ['flooded', 'close Oxford Road', 'this road near Oxford Road is flooded']) {
    assert.equal(report(phrase).kind, 'unknown-road', phrase);
  }
});

test('asks to clarify duplicate roads and never falls back for an invalid section number', () => {
  assert.equal(report('Murphy Road is closed').kind, 'ambiguous-road');
  assert.equal(report('Murphy Road section 9 is closed').kind, 'unknown-road');
  assert.equal(report('Cambridge Road section 9 is closed').kind, 'unknown-road');
  assert.equal(report('Close Murphy Road · 2 and Cambridge Road').kind, 'ambiguous-road');
});

test('requires a definite, affirmative status before offering a map change', () => {
  for (const phrase of [
    'This road is not closed', 'Don’t close Cambridge Road', 'Maybe this road is closed',
    'क्या यह सड़क बंद है', 'yeh road band nahi hai', 'यह सड़क बंद मत करो',
    'Is this road closed?', 'Cambridge Road may reopen', 'Close or open this road',
    'Cambridge Road', 'Traffic on Cambridge Road', 'This road was closed yesterday', 'यह सड़क बंद थी',
  ]) {
    assert.equal(report(phrase).kind, 'unclear-status', phrase);
  }
});

function makeFieldReports({ recognition } = {}) {
  class Element extends EventTarget {
    value = '';
    textContent = '';
    children = [];
    append(...children) { this.children.push(...children); }
    after(element) { this.inserted = element; }
    setAttribute() {}
    focus() {}
    click() { this.dispatchEvent(new Event('click')); }
  }

  const elements = Object.fromEntries(['report-text', 'parse-report', 'mic', 'language', 'voice-msg'].map(id => [id, new Element()]));
  elements.language.value = 'hi-IN';
  elements['parse-report'].textContent = 'Review';
  const document = {
    getElementById: id => elements[id],
    createElement: () => new Element(),
  };
  let selected = 1;
  const state = new Set();
  const changes = [];
  const controls = voice.installFieldReports({
    roads,
    getSelected: () => selected,
    isClosed: id => state.has(id),
    selectRoad: id => { selected = id; },
    applyReport: (id, closed) => {
      changes.push([id, closed]);
      if (closed) state.add(id);
      else state.delete(id);
    },
    announce: text => { elements['voice-msg'].textContent = text; },
    document,
    speech: { SpeechRecognition: recognition },
  });
  const input = elements['report-text'];
  const review = text => {
    input.value = text;
    elements['parse-report'].click();
  };
  const panel = elements['voice-msg'].inserted;
  return { controls, changes, input, review, panel, elements, setSelected: id => { selected = id; } };
}

test('requires explicit confirmation and applies a repeated report only once', () => {
  const app = makeFieldReports();
  const [confirm] = app.panel.children;
  app.review('Cambridge Road flooded');
  assert.equal(app.panel.hidden, false);
  assert.deepEqual(app.changes, []);
  confirm.click();
  app.review('Cambridge Road flooded');
  confirm.click();
  assert.deepEqual(app.changes, [[2, true]]);
  app.review('Cambridge Road is open now');
  confirm.click();
  assert.deepEqual(app.changes, [[2, true], [2, false]]);
});

test('cancel, editing and changed selection invalidate a pending confirmation', () => {
  const app = makeFieldReports();
  const [confirm, cancel] = app.panel.children;
  app.review('This road is closed');
  cancel.click();
  confirm.click();
  app.review('This road is closed');
  app.input.value = 'Cambridge Road is closed';
  app.input.dispatchEvent(new Event('input'));
  confirm.click();
  app.review('This road is closed');
  app.setSelected(0);
  confirm.click();
  app.review('This road is closed');
  app.controls.reset();
  confirm.click();
  assert.equal(app.panel.hidden, true);
  assert.deepEqual(app.changes, []);
});

test('recognized speech is displayed and still waits for explicit confirmation', () => {
  let session;
  class Recognition {
    constructor() { session = this; }
    start() {}
    abort() {}
  }
  const app = makeFieldReports({ recognition: Recognition });
  app.elements.mic.click();
  assert.equal(session.lang, 'hi-IN');
  session.onresult({ results: [[{ transcript: 'यह सड़क बंद है' }]] });
  session.onend();
  assert.equal(app.input.value, 'यह सड़क बंद है');
  assert.deepEqual(app.changes, []);
  app.panel.children[0].click();
  assert.deepEqual(app.changes, [[1, true]]);
});

test('unavailable speech keeps typed review usable', () => {
  const app = makeFieldReports();
  app.elements.mic.click();
  assert.match(app.elements['voice-msg'].textContent, /type/i);
  app.review('This road is blocked');
  app.panel.children[0].click();
  assert.deepEqual(app.changes, [[1, true]]);
});

test('maps each exact label in the street extract to its own section', () => {
  const source = fs.readFileSync(path.join(__dirname, 'streets.js'), 'utf8');
  const { roads: mappedRoads } = vm.runInNewContext(source + '\nstreets');
  mappedRoads.forEach(({ label }, roadId) => {
    assert.deepEqual(
      voice.parseFieldReport(label + ' is closed', mappedRoads, -1),
      { kind: 'review', roadId, closed: true },
      label,
    );
  });
});
