const { transformLabelRow } = require('../../utils/preprocessingBatches');

// Crop 10px off the left/top of a 100x100 image, then pad 5px on the left.
const cropThenPad = { matrix: [1, 0, -5, 0, 1, -10], width: 95, height: 90 };
const half = { matrix: [0.5, 0, 0, 0, 0.5, 0], width: 50, height: 50 };

describe('transformLabelRow', () => {
    it('shifts and scales rectangle rows', () => {
        const row = transformLabelRow({ CName: 'a', X: 20, Y: 30, W: 40, H: 20 }, cropThenPad);
        expect(row).toMatchObject({ CName: 'a', X: 15, Y: 20, W: 40, H: 20 });

        const scaled = transformLabelRow({ X: 20, Y: 30, W: 40, H: 20 }, half);
        expect(scaled).toMatchObject({ X: 10, Y: 15, W: 20, H: 10 });
    });

    it('clips a box that sticks out of the processed image and keeps it if enough is visible', () => {
        // Spans x 0..30 originally, crop removes the first 10 -> 20 of 30 columns stay (67%).
        const crop = { matrix: [1, 0, -10, 0, 1, 0], width: 90, height: 100 };
        const row = transformLabelRow({ X: 0, Y: 0, W: 30, H: 10 }, crop);
        expect(row).toMatchObject({ X: 0, Y: 0, W: 20, H: 10 });
    });

    it('drops boxes that are cropped out or mostly outside', () => {
        const crop = { matrix: [1, 0, -50, 0, 1, 0], width: 50, height: 100 };
        expect(transformLabelRow({ X: 0, Y: 0, W: 40, H: 10 }, crop)).toBeNull();
        // Only 5 of 40 columns survive (12%).
        expect(transformLabelRow({ X: 10, Y: 0, W: 45, H: 10 }, { ...crop, matrix: [1, 0, -50, 0, 1, 0] })).toBeNull();
    });

    it('transforms polygon rows point by point', () => {
        const row = transformLabelRow({ X: '10,30,20', Y: '10,10,30' }, half);
        expect(row.X).toBe('5,15,10');
        expect(row.Y).toBe('5,5,15');
    });

    it('turns a 90 degree rotation of a rectangle into the rotated rectangle', () => {
        // Counter-clockwise 90 degrees of a 80x50 image: (x, y) -> (y, 80 - x).
        const rotate = { matrix: [0, 1, 0, -1, 0, 80], width: 50, height: 80 };
        const row = transformLabelRow({ X: 10, Y: 5, W: 20, H: 10 }, rotate);
        expect(row).toMatchObject({ X: 5, Y: 50, W: 10, H: 20 });
    });

    it('returns null for malformed rows', () => {
        expect(transformLabelRow({ X: 'a', Y: 1, W: 1, H: 1 }, half)).toBeNull();
    });
});
