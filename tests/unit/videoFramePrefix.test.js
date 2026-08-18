const { sanitizeFrameToken, nextVideoFramePrefix } = require('../../utils/videoFramePrefix');

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
      expect(second).toBe('video_1');
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

    it('falls back to "video" when the sanitized name is empty', () => {
      const used = new Set();
      expect(nextVideoFramePrefix('   .mp4', used)).toBe('video');
    });
  });
});
