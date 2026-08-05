// Unit tests for the client-side Markdown renderer in public/js/chat.js.
//
// This file runs in the browser (no bundler, no module system) and is guarded by a
// `document.addEventListener('DOMContentLoaded', ...)` block that this test never wants to fire, so it
// can't be `require()`d directly. Instead we load just the source up to that guard via Node's `vm`
// module, in a sandbox that captures the renderMarkdown function via `module.exports` the same way the
// real file would export it in a CommonJS context — the function itself has no DOM dependency.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadRenderMarkdown() {
    const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'chat.js'), 'utf8');
    const guardIndex = src.indexOf("document.addEventListener");
    if (guardIndex === -1) {
        throw new Error('chat.js structure changed: DOMContentLoaded guard not found');
    }
    const isolated = src.slice(0, guardIndex) + '\nmodule.exports = { renderMarkdown, escapeHtml };\n})();';

    const sandbox = { module: { exports: {} }, console };
    vm.createContext(sandbox);
    vm.runInContext(isolated, sandbox, { filename: 'chat.js (extracted)' });
    return sandbox.module.exports;
}

describe('Chat frontend Markdown renderer', () => {
    const { renderMarkdown } = loadRenderMarkdown();

    it('renders ATX headings as real heading tags, not literal "#" text', () => {
        const html = renderMarkdown('# Run Summary: classification_all_runs_summary');
        expect(html).toBe('<h1>Run Summary: classification_all_runs_summary</h1>');
    });

    it('renders nested heading levels', () => {
        expect(renderMarkdown('## Aggregate Metrics')).toBe('<h2>Aggregate Metrics</h2>');
    });

    it('renders unordered list items as a real <ul>, not literal "-" text', () => {
        const html = renderMarkdown('- **Total Epochs Trained**: 10\n- **Best Overall mAP@50**: 0.00%');
        expect(html).toBe('<ul><li><strong>Total Epochs Trained</strong>: 10</li><li><strong>Best Overall mAP@50</strong>: 0.00%</li></ul>');
    });

    it('renders a Markdown pipe table as a real HTML table', () => {
        const md = [
            '| Run Name | Type | Total Epochs |',
            '| --- | --- | --- |',
            '| `train` | training | N/A |',
            '| `train2` | training | 10 |'
        ].join('\n');

        const html = renderMarkdown(md);
        expect(html).toContain('<table>');
        expect(html).toContain('<th>Run Name</th>');
        expect(html).toContain('<td><code>train</code></td>');
        expect(html).toContain('<td><code>train2</code></td>');
        expect(html).not.toContain('| Run Name |');
    });

    it('leaves a non-table line containing a pipe as plain text (no separator row)', () => {
        const html = renderMarkdown('this is a | not a table');
        expect(html).toBe('<p>this is a | not a table</p>');
    });

    it('renders fenced code blocks as <pre><code>, escaping their contents', () => {
        const html = renderMarkdown('```\nconst x = "<script>";\n```');
        expect(html).toContain('<pre><code>');
        expect(html).toContain('&lt;script&gt;');
        expect(html).not.toContain('<script>');
    });

    it('escapes HTML in plain text to prevent XSS', () => {
        const html = renderMarkdown('<img src=x onerror=alert(1)>');
        expect(html).not.toContain('<img');
        expect(html).toContain('&lt;img');
    });

    it('renders a full run-summary style report with headings, lists, and a table together', () => {
        const md = [
            '# Run Summary: classification_all_runs_summary',
            '',
            '## Aggregate Metrics',
            '- **Total Epochs Trained**: 10',
            '',
            '## Individual Run Breakdown',
            '| Run Name | Type |',
            '| --- | --- |',
            '| `train` | training |'
        ].join('\n');

        const html = renderMarkdown(md);
        expect(html).toContain('<h1>Run Summary: classification_all_runs_summary</h1>');
        expect(html).toContain('<h2>Aggregate Metrics</h2>');
        expect(html).toContain('<ul><li><strong>Total Epochs Trained</strong>: 10</li></ul>');
        expect(html).toContain('<table>');
    });
});
