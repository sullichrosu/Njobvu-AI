const {
    parseAnnotationCsv,
    CsvFormatError,
    TEMPLATES,
    MODE_DETECTION,
    MODE_CLASSIFICATION,
} = require('../../utils/parseAnnotationCsv');

function expectFormatError(csv, code) {
    let error;
    try {
        parseAnnotationCsv(csv);
    } catch (err) {
        error = err;
    }
    expect(error).toBeInstanceOf(CsvFormatError);
    expect(error.code).toBe(code);
    return error;
}

describe('parseAnnotationCsv', () => {
    describe('detection files', () => {
        test('parses x,y,w,h columns', () => {
            const result = parseAnnotationCsv('file_name,class_name,x,y,w,h\nimg1.jpg,dolphin,10,20,90,130\n');
            expect(result.mode).toBe(MODE_DETECTION);
            expect(result.errors).toEqual([]);
            expect(result.totalRows).toBe(1);
            expect(result.rows).toEqual([
                { line: 2, filename: 'img1.jpg', className: 'dolphin', x: 10, y: 20, w: 90, h: 130 },
            ]);
        });

        test('converts xmin,ymin,xmax,ymax corners to width and height', () => {
            const result = parseAnnotationCsv('filename,class,xmin,ymin,xmax,ymax\nimg1.jpg,dolphin,10,20,100,150');
            expect(result.rows[0]).toMatchObject({ x: 10, y: 20, w: 90, h: 130 });
        });

        test('rounds fractional values and normalizes names', () => {
            const result = parseAnnotationCsv('File Name,Class-Name,X,Y,W,H\nfolder\\img1.jpg,blue whale,10.4,20.6,30.5,40.2');
            expect(result.rows[0]).toEqual({
                line: 2, filename: 'img1.jpg', className: 'blue_whale', x: 10, y: 21, w: 31, h: 40,
            });
        });

        test('reports rows with wrong column counts, non-numeric values and empty boxes without stopping', () => {
            const csv = [
                'file_name,class_name,x,y,w,h',
                'good.jpg,cat,1,2,3,4',
                'short.jpg,cat,1,2',
                'nan.jpg,cat,a,2,3,4',
                'flat.jpg,cat,1,2,0,4',
                ',cat,1,2,3,4',
                'noclass.jpg,,1,2,3,4',
            ].join('\n');
            const result = parseAnnotationCsv(csv);
            expect(result.rows).toHaveLength(1);
            expect(result.totalRows).toBe(6);
            expect(result.errors.map(e => e.line)).toEqual([3, 4, 5, 6, 7]);
            expect(result.errors[0].message).toMatch(/Expected 6 columns but found 4/);
            expect(result.errors[1].message).toMatch(/must all be numbers/);
            expect(result.errors[2].message).toMatch(/positive width and height/);
            expect(result.errors[3].message).toMatch(/file_name is empty/);
            expect(result.errors[4].message).toMatch(/class_name is empty/);
        });
    });

    describe('classification files', () => {
        test('treats file_name + class_name only files as classification', () => {
            const result = parseAnnotationCsv('file_name,class_name\nimg1.jpg,dolphin\nimg2.jpg,shark\n');
            expect(result.mode).toBe(MODE_CLASSIFICATION);
            expect(result.rows).toEqual([
                { line: 2, filename: 'img1.jpg', className: 'dolphin' },
                { line: 3, filename: 'img2.jpg', className: 'shark' },
            ]);
        });
    });

    describe('CSV syntax', () => {
        test('tolerates BOM, CRLF line endings, comments and blank lines', () => {
            const csv = '﻿# exported by tool\r\nfile_name,class_name\r\n\r\nimg1.jpg,dolphin\r\n';
            const result = parseAnnotationCsv(csv);
            expect(result.rows).toHaveLength(1);
            expect(result.rows[0].line).toBe(4);
        });

        test('supports quoted fields with commas and escaped quotes', () => {
            const result = parseAnnotationCsv('file_name,class_name\n"img,1.jpg","the ""big"" one"\n');
            expect(result.rows[0]).toMatchObject({ filename: 'img,1.jpg', className: 'the_"big"_one' });
        });

        test('rejects an unterminated quoted field', () => {
            const error = expectFormatError('file_name,class_name\n"img1.jpg,dolphin\n', 'MALFORMED_CSV');
            expect(error.details.line).toBe(2);
        });
    });

    describe('structural errors', () => {
        test.each([[''], ['   \n  '], [null], [undefined]])('rejects empty input %p', (input) => {
            expectFormatError(input, 'EMPTY_CSV');
        });

        test('rejects a comment-only file', () => {
            expectFormatError('# nothing here\n', 'EMPTY_CSV');
        });

        test('reports missing class_name', () => {
            const error = expectFormatError('file_name,x,y,w,h\nimg1.jpg,1,2,3,4', 'MISSING_COLUMNS');
            expect(error.details.missingColumns).toEqual(['class_name']);
        });

        test('reports every missing bounding box column', () => {
            const error = expectFormatError('file_name,class_name,x\nimg1.jpg,cat,1', 'MISSING_COLUMNS');
            expect(error.details.missingColumns).toEqual(['y (or ymin)', 'w (or xmax)', 'h (or ymax)']);
        });

        test('rejects mixed size and corner columns', () => {
            expectFormatError('file_name,class_name,x,y,w,ymax\nimg1.jpg,cat,1,2,3,4', 'MISSING_COLUMNS');
        });

        test('flags header-less files', () => {
            const error = expectFormatError('img1.jpg,dolphin,10,20,100,150', 'MISSING_COLUMNS');
            expect(error.details.headerless).toBe(true);
            expect(error.message).toMatch(/first row must be a header row/);
        });

        test('does not flag files that have a header but lack columns as header-less', () => {
            const error = expectFormatError('file_name,x,y,w,h\nimg1.jpg,1,2,3,4', 'MISSING_COLUMNS');
            expect(error.details.headerless).toBe(false);
        });
    });

    describe('TEMPLATES', () => {
        test.each(Object.keys(TEMPLATES))('the %s example is itself a valid file', (type) => {
            const result = parseAnnotationCsv(TEMPLATES[type].content);
            expect(result.errors).toEqual([]);
            expect(result.rows.length).toBeGreaterThan(0);
            expect(result.mode).toBe(type === 'classification' ? MODE_CLASSIFICATION : MODE_DETECTION);
        });
    });
});
