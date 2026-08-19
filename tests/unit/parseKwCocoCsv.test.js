const parseKwCocoCsv = require('../../utils/parseKwCocoCsv');

describe('parseKwCocoCsv', () => {
    test('returns empty array for invalid or empty input', () => {
        expect(parseKwCocoCsv(null)).toEqual([]);
        expect(parseKwCocoCsv('')).toEqual([]);
        expect(parseKwCocoCsv('   ')).toEqual([]);
    });

    test('parses CSV with header containing filename, class, xmin, ymin, xmax, ymax', () => {
        const csv = `filename,class,xmin,ymin,xmax,ymax
image1.jpg,dolphin,10,20,100,150
image2.png,blue whale,50,60,200,260`;

        const result = parseKwCocoCsv(csv);
        expect(result).toEqual([
            { filename: 'image1.jpg', className: 'dolphin', x: 10, y: 20, w: 90, h: 130 },
            { filename: 'image2.png', className: 'blue_whale', x: 50, y: 60, w: 150, h: 200 }
        ]);
    });

    test('parses CSV with header containing x, y, w, h', () => {
        const csv = `file_name,category,x,y,w,h
path/to/img3.jpg,sea turtle,15,25,80,95`;

        const result = parseKwCocoCsv(csv);
        expect(result).toEqual([
            { filename: 'img3.jpg', className: 'sea_turtle', x: 15, y: 25, w: 80, h: 95 }
        ]);
    });

    test('parses positional CSV without header', () => {
        const csv = `img4.jpg,fish,5,10,45,60`;

        const result = parseKwCocoCsv(csv);
        expect(result).toEqual([
            { filename: 'img4.jpg', className: 'fish', x: 5, y: 10, w: 40, h: 50 }
        ]);
    });

    test('ignores invalid rows and negative width/height', () => {
        const csv = `filename,class,xmin,ymin,xmax,ymax
bad1.jpg,fish,100,100,50,50
bad2.jpg,fish,invalid,10,20,30
good.jpg,shark,10,10,30,30`;

        const result = parseKwCocoCsv(csv);
        expect(result).toEqual([
            { filename: 'good.jpg', className: 'shark', x: 10, y: 10, w: 20, h: 20 }
        ]);
    });
});
