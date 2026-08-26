const { parseFfprobeFrameTimes, buildFrameRows } = require('../../utils/videoFrameTimestamps');

describe('videoFrameTimestamps', () => {
  describe('parseFfprobeFrameTimes', () => {
    it('returns an empty array for empty ffprobe output', () => {
      expect(parseFfprobeFrameTimes('')).toEqual([]);
      expect(parseFfprobeFrameTimes('   ')).toEqual([]);
      expect(parseFfprobeFrameTimes(undefined)).toEqual([]);
    });

    it('parses one pts_time,dts_time line per decoded frame, in order', () => {
      const stdout = '0.000000,0.000000\n0.033367,0.033367\n0.066733,0.066733\n';
      expect(parseFfprobeFrameTimes(stdout)).toEqual([0, 0.033367, 0.066733]);
    });

    it('falls back to dts_time when pts_time is N/A', () => {
      const stdout = 'N/A,0.5\n';
      expect(parseFfprobeFrameTimes(stdout)).toEqual([0.5]);
    });

    
    it('records null (not a skipped entry) when both pts and dts are missing', () => {
      const stdout = '0.0,0.0\nN/A,N/A\n0.066733,0.066733\n';
      expect(parseFfprobeFrameTimes(stdout)).toEqual([0, null, 0.066733]);
    });

    it('ignores blank lines', () => {
      const stdout = '0.0,0.0\n\n0.033,0.033\n';
      expect(parseFfprobeFrameTimes(stdout)).toEqual([0, 0.033]);
    });
  });

  describe('buildFrameRows', () => {
    it('returns an empty array when there are no timestamps', () => {
      expect(buildFrameRows([], 5, [])).toEqual([]);
      expect(buildFrameRows(null, 5, [])).toEqual([]);
    });

    it('builds one row per decoded frame, with iName only on extracted frames', () => {
      // frameStep = 5: source frames 0, 5, 10 were extracted as output
      // frames 1, 2, 3 (ffmpeg's 1-based %d), per select=not(mod(n\,5)).
      const timestamps = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
      const extractedFrames = [
        { frameNumber: 1, iName: 'video_1.jpg' },
        { frameNumber: 2, iName: 'video_2.jpg' },
        { frameNumber: 3, iName: 'video_3.jpg' },
      ];

      const rows = buildFrameRows(timestamps, 5, extractedFrames);

      expect(rows).toHaveLength(11);
      expect(rows[0]).toEqual({ frameNumber: 0, timestampSec: 0, iName: 'video_1.jpg' });
      expect(rows[5]).toEqual({ frameNumber: 5, timestampSec: 0.5, iName: 'video_2.jpg' });
      expect(rows[10]).toEqual({ frameNumber: 10, timestampSec: 1.0, iName: 'video_3.jpg' });
      // frames that weren't extracted still get a row, just with no iName
      expect(rows[1]).toEqual({ frameNumber: 1, timestampSec: 0.1, iName: null });
    });

    it('skips a decoded frame with no valid timestamp rather than inserting a bad row', () => {
      const timestamps = [0, null, 0.2];
      const rows = buildFrameRows(timestamps, 1, []);

      expect(rows).toEqual([
        { frameNumber: 0, timestampSec: 0, iName: null },
        { frameNumber: 2, timestampSec: 0.2, iName: null },
      ]);
    });

    it('does not throw when an extracted frame points past the end of the timestamp array', () => {
      global.logger = { error: jest.fn() };
      const timestamps = [0, 0.1];
      const extractedFrames = [{ frameNumber: 5, iName: 'video_5.jpg' }]; // originalIndex 4*1=4, out of range

      expect(() => buildFrameRows(timestamps, 1, extractedFrames)).not.toThrow();
      expect(global.logger.error).toHaveBeenCalled();
    });
  });
});
