const formatRunOptionsHeader = require('../utils/formatRunOptionsHeader');

describe('formatRunOptionsHeader Utility Unit Tests', () => {
    it('renders every option as a labeled, aligned line inside a header block', () => {
        const header = formatRunOptionsHeader({
            task: 'detect',
            epochs: 50,
            device: 'cuda:0',
        });

        expect(header).toMatch(/# Task\s+: detect/);
        expect(header).toMatch(/# Epochs\s+: 50/);
        expect(header).toMatch(/# Device\s+: cuda:0/);
        expect(header.indexOf('Task')).toBeLessThan(header.indexOf('Epochs'));
    });

    it('renders missing/empty values as (none) instead of dropping the key', () => {
        const header = formatRunOptionsHeader({
            options: undefined,
            device: null,
            weights: '',
        });

        expect(header).toMatch(/# Options\s+: \(none\)/);
        expect(header).toMatch(/# Device\s+: \(none\)/);
        expect(header).toMatch(/# Weights\s+: \(none\)/);
    });

    it('humanizes snake_case keys and known abbreviations into readable labels', () => {
        const header = formatRunOptionsHeader({
            yolovx_path: '/opt/ultralytics',
            training_percent: 80,
            imgsz: 640,
        });

        expect(header).toContain('YOLO Path');
        expect(header).toContain('Train Split (%)');
        expect(header).toContain('Image Size');
    });

    it('produces a header that can be safely prepended before the run command', () => {
        const header = formatRunOptionsHeader({ task: 'train' });
        const cmd = 'python3 script.py -t train';
        const logContents = `${header}${cmd}`;

        expect(logContents.startsWith('# =====')).toBe(true);
        expect(logContents).toContain('Run Options (for reproducing this run)');
        expect(logContents.endsWith(cmd)).toBe(true);
    });
});
