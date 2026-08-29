// Regression test for the Ctrl+Z / Cmd+Z undo hotkey on the annotate/labeling
// canvas. public/js/flabeling.js's keydown handler mapped raw (unmodified)
// key codes to actions - plain "z" (keyCode 90) already meant resetZoom().
// Because the handler never checked event.ctrlKey/event.metaKey, pressing
// Ctrl+Z or Cmd+Z fell into that same "z" branch and triggered reset-zoom
// instead of undo, while also letting the browser's native undo fire.
//
// The fix adds a modifier-aware Ctrl+Z/Cmd+Z branch ahead of the existing
// plain-"z" branch that calls undoLabel(), calls event.preventDefault(),
// and returns before the unmodified-"z" logic runs - so plain "z" still
// resets zoom untouched.
//
// Same approach as flabelingResetUndoBinding.test.js: require the real
// flabeling.js against a minimal hand-rolled DOM/jQuery/fabric harness
// that satisfies the canvas-setup code the script runs on load.

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

describe('flabeling.js Ctrl+Z / Cmd+Z undo hotkey', () => {
    let fakeCanvas;
    let mockDocument;

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

        mockDocument = {
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
        global.$ = buildFakeJQuery(mockDocument, mockWindow);

        require('../../public/js/flabeling.js');
    });

    beforeEach(() => {
        fakeCanvas.setBackgroundImage.mockClear();
        fakeCanvas.setViewportTransform.mockClear();
        fakeCanvas.forEachObject.mockClear();
    });

    function fireKeydown(overrides) {
        const event = Object.assign({ keyCode: 0, ctrlKey: false, metaKey: false, preventDefault: jest.fn() }, overrides);
        mockDocument.listeners.keydown.forEach((fn) => fn(event));
        return event;
    }

    test('Ctrl+Z calls undoLabel() and prevents the browser default', () => {
        const event = fireKeydown({ keyCode: 90, ctrlKey: true });
        expect(event.preventDefault).toHaveBeenCalled();
        expect(fakeCanvas.setBackgroundImage).toHaveBeenCalledTimes(1);
        expect(fakeCanvas.setViewportTransform).not.toHaveBeenCalled();
    });

    test('Cmd+Z (Mac, metaKey) calls undoLabel() and prevents the browser default', () => {
        const event = fireKeydown({ keyCode: 90, metaKey: true });
        expect(event.preventDefault).toHaveBeenCalled();
        expect(fakeCanvas.setBackgroundImage).toHaveBeenCalledTimes(1);
        expect(fakeCanvas.setViewportTransform).not.toHaveBeenCalled();
    });

    test('unmodified "z" still calls resetZoom(), not undoLabel()', () => {
        const event = fireKeydown({ keyCode: 90 });
        expect(event.preventDefault).not.toHaveBeenCalled();
        expect(fakeCanvas.setViewportTransform).toHaveBeenCalledTimes(1);
        expect(fakeCanvas.setBackgroundImage).not.toHaveBeenCalled();
    });
});
