// Regression test for the annotate-page Reset/Undo buttons.
//
// public/js/flabeling.js is a legacy, non-modular script written for
// views/labelingV.ejs: it binds click handlers to that view's button ids
// (#reset-labeling / #undo-labeling). views/annotate.ejs renders the same
// buttons under different ids (#reset-annotate / #undo-annotate), so those
// clicks never reached resetLabels()/undoLabel() on the annotate page.
//
// The fix extends both jQuery selectors to also match the annotate-page
// ids. This test requires the real flabeling.js (not a copy) against a
// minimal hand-rolled DOM/jQuery/fabric harness - the script executes a
// large amount of canvas-setup code at load time, so the harness only
// stubs what's needed for that top-level code to run without throwing.

function makeElement(overrides) {
    return Object.assign({ style: {}, value: '', textContent: '', attributes: {}, listeners: {} }, overrides);
}

function buildFakeJQuery(doc, win) {
    function matchPart(part) {
        part = part.trim();
        if (part[0] === '#') return doc.byId.has(part.slice(1)) ? [doc.byId.get(part.slice(1))] : [];
        if (part[0] === '.') return Array.from(doc.byClass.get(part.slice(1)) || []);
        return [];
    }

    function resolve(sel) {
        if (sel === doc) return [doc];
        if (sel === win) return [win];
        if (typeof sel !== 'string') return [sel];
        return sel.split(',').flatMap(matchPart);
    }

    function wrap(matches) {
        const arr = matches.slice();
        arr.click = (handler) => {
            if (handler === undefined) {
                arr.forEach((el) => (el.listeners.click || []).forEach((fn) => fn.call(el, {})));
                return arr;
            }
            arr.forEach((el) => {
                el.listeners.click = el.listeners.click || [];
                el.listeners.click.push(handler);
            });
            return arr;
        };
        arr.on = (event, handler) => {
            arr.forEach((el) => {
                el.listeners[event] = el.listeners[event] || [];
                el.listeners[event].push(handler);
            });
            return arr;
        };
        arr.trigger = (event) => {
            arr.forEach((el) => (el.listeners[event] || []).forEach((fn) => fn.call(el, {})));
            return arr;
        };
        arr.keydown = (handler) => arr.on('keydown', handler);
        arr.resize = (handler) => arr.on('resize', handler);
        arr.val = (v) => {
            if (v === undefined) return arr.length ? arr[0].value : undefined;
            arr.forEach((el) => { el.value = v; });
            return arr;
        };
        arr.text = () => (arr.length ? arr[0].textContent || '' : '');
        arr.attr = (name, v) => {
            if (v === undefined) return arr.length ? arr[0].attributes[name] : undefined;
            arr.forEach((el) => { el.attributes[name] = v; });
            return arr;
        };
        arr.css = () => arr;
        arr.addClass = () => arr;
        arr.removeClass = () => arr;
        arr.each = (fn) => { arr.forEach((el, i) => fn.call(el, i)); return arr; };
        arr.remove = () => arr;
        arr.append = () => arr;
        arr.height = () => 800;
        arr.width = () => 1200;
        return arr;
    }

    return (sel) => wrap(resolve(sel));
}

describe('flabeling.js reset/undo button binding (annotate vs labelingV)', () => {
    let fakeCanvas;
    let resetLabelingBtn, resetAnnotateBtn, undoLabelingBtn, undoAnnotateBtn;
    let $;

    beforeAll(() => {
        jest.useFakeTimers();

        const byId = new Map();
        const byClass = new Map();
        function register(el, id, classNames) {
            if (id) byId.set(id, el);
            (classNames || []).forEach((c) => {
                if (!byClass.has(c)) byClass.set(c, new Set());
                byClass.get(c).add(el);
            });
        }

        const classSelectionEl = makeElement({ style: { backgroundColor: 'rgb(255,0,0)' }, innerHTML: '1:Dog' });
        register(classSelectionEl, null, ['class-selection']);
        const classesInputEl = makeElement({ value: 'Dog' });
        register(classesInputEl, null, ['classes']);
        const imagePathEl = makeElement({ value: 'test.jpg' });
        register(imagePathEl, 'image_path', []);

        resetLabelingBtn = makeElement({});
        register(resetLabelingBtn, 'reset-labeling', []);
        resetAnnotateBtn = makeElement({});
        register(resetAnnotateBtn, 'reset-annotate', []);
        undoLabelingBtn = makeElement({});
        register(undoLabelingBtn, 'undo-labeling', []);
        undoAnnotateBtn = makeElement({});
        register(undoAnnotateBtn, 'undo-annotate', []);

        const mockDocument = {
            listeners: {},
            byId,
            byClass,
            getElementsByClassName: (name) => Array.from(byClass.get(name) || []),
            getElementById: (id) => byId.get(id) || null,
        };
        const mockWindow = { listeners: {}, location: { href: 'http://localhost/annotate' } };

        fakeCanvas = {
            on: jest.fn(),
            add: jest.fn(),
            remove: jest.fn(),
            setWidth: jest.fn(),
            setHeight: jest.fn(),
            setBackgroundImage: jest.fn(),
            calcOffset: jest.fn(),
            getWidth: jest.fn(() => 0),
            getHeight: jest.fn(() => 0),
            renderAll: jest.fn(),
            getObjects: jest.fn(() => []),
            clear: jest.fn(),
            setViewportTransform: jest.fn(),
            forEachObject: jest.fn(),
            getZoom: jest.fn(() => 1),
            item: jest.fn(),
            getActiveObject: jest.fn(),
            getActiveGroup: jest.fn(),
            getPointer: jest.fn(() => ({ x: 0, y: 0 })),
            zoomToPoint: jest.fn(),
            discardActiveGroup: jest.fn(),
            hoverCursor: '',
            height: 0,
            width: 0,
        };

        global.document = mockDocument;
        global.window = mockWindow;
        global.confirm = jest.fn(() => true);
        global.fabric = {
            Canvas: jest.fn(() => fakeCanvas),
            Line: jest.fn(() => ({})),
            Rect: jest.fn(() => ({})),
            Polygon: jest.fn(() => ({})),
            Text: jest.fn(() => ({ height: 0, width: 0, set: jest.fn() })),
        };
        $ = buildFakeJQuery(mockDocument, mockWindow);
        global.$ = $;

        // Loading the script executes ~1000 lines of canvas-setup code
        // immediately; this is the actual regression coverage - it fails
        // loudly if the harness (or the script) breaks that path.
        require('../../public/js/flabeling.js');
    });

    beforeEach(() => {
        fakeCanvas.clear.mockClear();
        fakeCanvas.setBackgroundImage.mockClear();
        global.confirm.mockReturnValue(true);
    });

    test('#reset-annotate (annotate.ejs id) triggers resetLabels', () => {
        $(resetAnnotateBtn).click();
        expect(global.confirm).toHaveBeenCalled();
        expect(fakeCanvas.clear).toHaveBeenCalledTimes(1);
    });

    test('#reset-labeling (labelingV.ejs id) still triggers resetLabels - no legacy regression', () => {
        $(resetLabelingBtn).click();
        expect(fakeCanvas.clear).toHaveBeenCalledTimes(1);
    });

    test('resetLabels respects a declined confirm() regardless of which id fired it', () => {
        global.confirm.mockReturnValue(false);
        $(resetAnnotateBtn).click();
        expect(fakeCanvas.clear).not.toHaveBeenCalled();
    });

    test('#undo-annotate (annotate.ejs id) triggers undoLabel', () => {
        $(undoAnnotateBtn).click();
        expect(fakeCanvas.setBackgroundImage).toHaveBeenCalledTimes(1);
    });

    test('#undo-labeling (labelingV.ejs id) still triggers undoLabel - no legacy regression', () => {
        $(undoLabelingBtn).click();
        expect(fakeCanvas.setBackgroundImage).toHaveBeenCalledTimes(1);
    });
});
