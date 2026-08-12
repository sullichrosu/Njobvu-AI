// Exercises the actual "Minimum Images per Class" clamp script shipped inline in
// views/training/yolovXTrainingSettings.ejs. No jsdom dependency is available in this repo, so this
// extracts the real <script> block verbatim and runs it against a minimal fake `document`, driving
// it exactly like a browser would (getElementById/querySelectorAll/addEventListener + stored
// listener callbacks). This is the only place the auto-deselect-below-threshold behavior, and its
// re-application on Select All, is verified end to end.

const fs = require('fs');
const path = require('path');

function extractClassSelectionScript() {
  const templatePath = path.join(__dirname, '../../views/training/yolovXTrainingSettings.ejs');
  const template = fs.readFileSync(templatePath, 'utf8');

  const startMarker = '// Class selection helper buttons';
  const endMarker = '// Split ratio summary update';
  const start = template.indexOf(startMarker);
  const end = template.indexOf(endMarker);

  if (start === -1 || end === -1) {
    throw new Error('Could not locate class selection script block in template');
  }

  return template.slice(start, end);
}

function makeCheckbox(count, checked) {
  return {
    checked,
    getAttribute: jest.fn(() => String(count)),
  };
}

function makeFakeDocument(checkboxes) {
  const elements = {};
  const listeners = {};

  function makeButtonLike(id) {
    const el = {
      addEventListener: jest.fn((evt, handler) => {
        listeners[id] = listeners[id] || {};
        listeners[id][evt] = handler;
      }),
    };
    elements[id] = el;
    return el;
  }

  makeButtonLike('selectAllClasses');
  makeButtonLike('deselectAllClasses');

  const minInput = makeButtonLike('minClassImages');
  minInput.value = '';

  const doc = {
    getElementById: jest.fn((id) => elements[id]),
    querySelectorAll: jest.fn((selector) => {
      if (selector === '.class-checkbox') {
        return {
          forEach: (fn) => checkboxes.forEach(fn),
        };
      }
      return { forEach: () => {} };
    }),
  };

  return { doc, listeners, minInput };
}

describe('yolovXTrainingSettings.ejs class selection + minimum images clamp script', () => {
  let checkboxes;
  let doc;
  let listeners;
  let minInput;

  beforeEach(() => {
    // Mirrors data-image-count rendered per checkbox: person=10, car=3, dog=0
    checkboxes = [
      makeCheckbox(10, true),
      makeCheckbox(3, true),
      makeCheckbox(0, true),
    ];
    ({ doc, listeners, minInput } = makeFakeDocument(checkboxes));

    const script = extractClassSelectionScript();
    // eslint-disable-next-line no-new-func
    const run = new Function('document', script);
    run(doc);
  });

  it('does nothing when the minimum images threshold is empty/zero', () => {
    minInput.value = '';
    listeners.minClassImages.input();

    expect(checkboxes.map((cb) => cb.checked)).toEqual([true, true, true]);
  });

  it('unchecks only classes below the configured minimum on input', () => {
    minInput.value = '5';
    listeners.minClassImages.input();

    expect(checkboxes.map((cb) => cb.checked)).toEqual([true, false, false]);
  });

  it('re-applies the clamp when Select All is clicked, so it cannot bypass the minimum', () => {
    minInput.value = '5';
    listeners.minClassImages.input();
    expect(checkboxes.map((cb) => cb.checked)).toEqual([true, false, false]);

    listeners.selectAllClasses.click();

    // Select All checks everything first, then the clamp must immediately re-uncheck
    // the classes that don't meet the threshold.
    expect(checkboxes.map((cb) => cb.checked)).toEqual([true, false, false]);
  });

  it('Deselect All unchecks everything regardless of the clamp threshold', () => {
    minInput.value = '5';
    listeners.minClassImages.input();

    listeners.deselectAllClasses.click();

    expect(checkboxes.map((cb) => cb.checked)).toEqual([false, false, false]);
  });
});
