const parseKwCocoJson = require('../../utils/parseKwCocoJson');

describe('parseKwCocoJson', () => {
    test('returns empty array for invalid or empty input', () => {
        expect(parseKwCocoJson(null)).toEqual([]);
        expect(parseKwCocoJson('')).toEqual([]);
        expect(parseKwCocoJson('not json')).toEqual([]);
        expect(parseKwCocoJson('{}')).toEqual([]);
    });

    test('parses standard COCO-style JSON with images/annotations/categories', () => {
        const json = JSON.stringify({
            images: [
                { id: 1, file_name: 'image1.jpg' },
                { id: 2, file_name: 'path/to/image2.png' }
            ],
            annotations: [
                { id: 1, image_id: 1, category_id: 10, bbox: [10, 20, 90, 130] },
                { id: 2, image_id: 2, category_id: 11, bbox: [50, 60, 150, 200] }
            ],
            categories: [
                { id: 10, name: 'dolphin' },
                { id: 11, name: 'blue whale' }
            ]
        });

        const result = parseKwCocoJson(json);
        expect(result).toEqual([
            { filename: 'image1.jpg', className: 'dolphin', x: 10, y: 20, w: 90, h: 130 },
            { filename: 'image2.png', className: 'blue_whale', x: 50, y: 60, w: 150, h: 200 }
        ]);
    });

    test('skips annotations referencing unknown images or categories', () => {
        const json = JSON.stringify({
            images: [{ id: 1, file_name: 'good.jpg' }],
            annotations: [
                { id: 1, image_id: 1, category_id: 5, bbox: [10, 10, 20, 20] },
                { id: 2, image_id: 999, category_id: 5, bbox: [10, 10, 20, 20] },
                { id: 3, image_id: 1, category_id: 999, bbox: [10, 10, 20, 20] }
            ],
            categories: [{ id: 5, name: 'fish' }]
        });

        const result = parseKwCocoJson(json);
        expect(result).toEqual([
            { filename: 'good.jpg', className: 'fish', x: 10, y: 10, w: 20, h: 20 }
        ]);
    });

    test('ignores annotations with invalid or non-positive bbox dimensions', () => {
        const json = JSON.stringify({
            images: [{ id: 1, file_name: 'img.jpg' }],
            annotations: [
                { id: 1, image_id: 1, category_id: 1, bbox: [0, 0, 0, 0] },
                { id: 2, image_id: 1, category_id: 1, bbox: ['a', 'b', 'c', 'd'] },
                { id: 3, image_id: 1, category_id: 1, bbox: [1, 2, 3] }
            ],
            categories: [{ id: 1, name: 'shark' }]
        });

        expect(parseKwCocoJson(json)).toEqual([]);
    });
});
