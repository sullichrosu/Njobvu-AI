const fs = require('fs');
const os = require('os');
const path = require('path');
const { sanitizeFrameToken, nextVideoFramePrefix, zeroPadExtractedFrames } = require('../../utils/videoFramePrefix');

describe('videoFramePrefix (CEO-46)', () => {
  describe('sanitizeFrameToken', () => {
    it('trims whitespace and replaces spaces and plus signs with underscores', () => {
      expect(sanitizeFrameToken('  my video+clip 1  ')).toBe('my_video_clip_1');
    });
  });

  describe('nextVideoFramePrefix', () => {
    it('derives the prefix from the video file name, stripped of its extension', () => {
      const used = new Set();
      expect(nextVideoFramePrefix('safari-trip.mp4', used)).toBe('safari-trip');
    });

    it('gives two videos with different names distinct prefixes', () => {
      const used = new Set();
      const first = nextVideoFramePrefix('camera1.mp4', used);
      const second = nextVideoFramePrefix('camera2.mp4', used);

      expect(first).not.toBe(second);
    });

    // Reproduces the CEO-46 bug directly: two videos that share an original
    // file name (e.g. both exported by a camera as "video.mp4") used to both
    // extract frames as frame001.jpg, frame002.jpg, ... and the second
    // video's frames silently overwrote the first video's on disk.
    it('de-duplicates the prefix when two videos share the same original file name', () => {
      const used = new Set();
      const first = nextVideoFramePrefix('video.mp4', used);
      const second = nextVideoFramePrefix('video.mp4', used);

      expect(first).toBe('video');
      expect(second).toBe('video_001');
      expect(first).not.toBe(second);
    });

    it('de-duplicates across three or more collisions', () => {
      const used = new Set();
      const prefixes = [
        nextVideoFramePrefix('video.mov', used),
        nextVideoFramePrefix('video.mov', used),
        nextVideoFramePrefix('video.mov', used),
      ];

      expect(new Set(prefixes).size).toBe(3);
    });

    // Zero-padding the dedupe suffix keeps prefixes sorting in the same
    // order as plain strings, not just under numeric-aware sorting, e.g.
    // "video_002" < "video_010" the way a naive string sort expects.
    it('zero-pads the dedupe suffix so prefixes sort correctly as plain strings', () => {
      const used = new Set();
      const prefixes = Array.from({ length: 11 }, () =>
        nextVideoFramePrefix('video.mp4', used),
      );

      expect(prefixes[1]).toBe('video_001');
      expect(prefixes[10]).toBe('video_010');
      expect([...prefixes].sort()).toEqual(prefixes);
    });

    it('falls back to "video" when the sanitized name is empty', () => {
      const used = new Set();
      expect(nextVideoFramePrefix('   .mp4', used)).toBe('video');
    });
  });

  describe('zeroPadExtractedFrames', () => {
    let dir;

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-frame-prefix-'));
    });

    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    // ffmpeg's bare `%d` output pattern names frames "prefix_1.jpg",
    // "prefix_2.jpg", ..., "prefix_10.jpg" with no padding at all, which
    // sorts wrong under a plain string sort. The padding width should be
    // sized to that video's own frame count, not a fixed width, so a
    // 9-frame video stays unpadded and a 10,000-frame video gets 5 digits.
    it('pads frame numbers to the width the frame count needs', () => {
      for (let n = 1; n <= 11; n++) {
        fs.writeFileSync(path.join(dir, `video_${n}.jpg`), '');
      }

      zeroPadExtractedFrames(dir, 'video');

      const names = fs.readdirSync(dir).sort();
      expect(names).toEqual([
        'video_01.jpg', 'video_02.jpg', 'video_03.jpg', 'video_04.jpg',
        'video_05.jpg', 'video_06.jpg', 'video_07.jpg', 'video_08.jpg',
        'video_09.jpg', 'video_10.jpg', 'video_11.jpg',
      ]);
    });

    it('pads to 5 digits for a video with 10,000 frames', () => {
      fs.writeFileSync(path.join(dir, 'video_1.jpg'), '');
      fs.writeFileSync(path.join(dir, 'video_10000.jpg'), '');

      zeroPadExtractedFrames(dir, 'video');

      expect(fs.readdirSync(dir).sort()).toEqual(['video_00001.jpg', 'video_10000.jpg']);
    });

    it('leaves a single-digit frame count unpadded', () => {
      for (let n = 1; n <= 5; n++) {
        fs.writeFileSync(path.join(dir, `video_${n}.jpg`), '');
      }

      zeroPadExtractedFrames(dir, 'video');

      expect(fs.readdirSync(dir).sort()).toEqual([
        'video_1.jpg', 'video_2.jpg', 'video_3.jpg', 'video_4.jpg', 'video_5.jpg',
      ]);
    });

    it('only touches frames matching the given prefix', () => {
      fs.writeFileSync(path.join(dir, 'video_1.jpg'), '');
      fs.writeFileSync(path.join(dir, 'video_2.jpg'), '');
      fs.writeFileSync(path.join(dir, 'video_001_1.jpg'), '');
      fs.writeFileSync(path.join(dir, 'video_001_2.jpg'), '');

      zeroPadExtractedFrames(dir, 'video');

      expect(fs.readdirSync(dir).sort()).toEqual([
        'video_001_1.jpg', 'video_001_2.jpg', 'video_1.jpg', 'video_2.jpg',
      ]);
    });

    it('does nothing when no frames match the prefix', () => {
      fs.writeFileSync(path.join(dir, 'unrelated.jpg'), '');

      expect(() => zeroPadExtractedFrames(dir, 'video')).not.toThrow();
      expect(fs.readdirSync(dir)).toEqual(['unrelated.jpg']);
    });
  });
});
