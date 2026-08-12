// Unit tests for queries/classes/classes.js#getClassLabelCounts, the query backing the
// per-class image count label and "Minimum Images per Class" clamp on the YOLO training
// settings page.

jest.mock('../../queries/getDbClient');

const getDbClient = require('../../queries/getDbClient');
const classes = require('../../queries/classes/classes');

describe('queries/classes getClassLabelCounts', () => {
  let mockAll;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAll = jest.fn();
    getDbClient.mockReturnValue({ all: mockAll });
  });

  it('runs a GROUP BY CName query over Labels and returns the raw db.all() result', async () => {
    const dbResult = {
      success: true,
      rows: [
        { CName: 'person', labelCount: 12 },
        { CName: 'car', labelCount: 0 },
      ],
    };

    mockAll.mockResolvedValue(dbResult);

    const result = await classes.project.getClassLabelCounts('/projects/testuser-test-project');

    expect(getDbClient).toHaveBeenCalledWith('/projects/testuser-test-project');
    expect(mockAll).toHaveBeenCalledWith(
      'SELECT CName, COUNT(DISTINCT IName) as imageCount FROM Labels GROUP BY CName',
    );
    expect(result).toBe(dbResult);
  });

  it('propagates errors from the underlying db client', async () => {
    mockAll.mockRejectedValue(new Error('db unavailable'));

    await expect(
      classes.project.getClassLabelCounts('/projects/testuser-test-project'),
    ).rejects.toThrow('db unavailable');
  });
});
