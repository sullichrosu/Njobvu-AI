const formatRunOptionsHeader = require('../utils/formatRunOptionsHeader');

describe('formatRunOptionsHeader Utility Unit Tests', () => {
    it('renders every option as a labeled line inside a header block', () => {
        const header = formatRunOptionsHeader({
            task: 'detect',
            epochs: 50,
            device: 'cuda:0',
        });

        expect(header).toContain('# task: detect');
        expect(header).toContain('# epochs: 50');
        expect(header).toContain('# device: cuda:0');
        expect(header.indexOf('# task: detect')).toBeLessThan(header.indexOf('# epochs: 50'));
    });

    it('renders missing/empty values as (none) instead of dropping the key', () => {
        const header = formatRunOptionsHeader({
            options: undefined,
            device: null,
            weights: '',
        });

        expect(header).toContain('# options: (none)');
        expect(header).toContain('# device: (none)');
        expect(header).toContain('# weights: (none)');
    });

    it('produces a header that can be safely prepended before the run command', () => {
        const header = formatRunOptionsHeader({ task: 'train' });
        const cmd = 'python3 script.py -t train';
        const logContents = `${header}${cmd}`;

        expect(logContents.startsWith('# ===== Run options')).toBe(true);
        expect(logContents.endsWith(cmd)).toBe(true);
    });
});
