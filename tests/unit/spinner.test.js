/**
 * Unit tests for public/js/spinner.js LoadingSpinner helper
 */
const LoadingSpinner = require('../../public/js/spinner.js');

describe('LoadingSpinner helper', () => {
    let mockElement;

    beforeEach(() => {
        // Mock DOM element environment
        mockElement = {
            tagName: 'BUTTON',
            type: 'submit',
            disabled: false,
            innerHTML: 'Submit Form',
            value: 'Submit Form',
            classList: {
                add: jest.fn(),
                remove: jest.fn()
            },
            dataset: {},
            querySelectorAll: jest.fn().mockReturnValue([])
        };
    });

    test('exports LoadingSpinner object with required methods', () => {
        expect(LoadingSpinner).toBeDefined();
        expect(typeof LoadingSpinner.show).toBe('function');
        expect(typeof LoadingSpinner.hide).toBe('function');
        expect(typeof LoadingSpinner.showOverlay).toBe('function');
        expect(typeof LoadingSpinner.hideOverlay).toBe('function');
        expect(typeof LoadingSpinner.wrapFetch).toBe('function');
    });

    test('show() disables element and sets spinner HTML and loading class', () => {
        LoadingSpinner.show(mockElement, 'Uploading...');

        expect(mockElement.disabled).toBe(true);
        expect(mockElement.dataset.njobvuOriginalHtml).toBe('Submit Form');
        expect(mockElement.dataset.njobvuOriginalDisabled).toBe('false');
        expect(mockElement.classList.add).toHaveBeenCalledWith('njobvu-btn-loading');
        expect(mockElement.innerHTML).toContain('njobvu-spinner-inline');
        expect(mockElement.innerHTML).toContain('Uploading...');
    });

    test('show() supports default message when string is omitted', () => {
        LoadingSpinner.show(mockElement);
        expect(mockElement.innerHTML).toContain('Processing...');
    });

    test('hide() restores original HTML, disabled status and removes loading class', () => {
        LoadingSpinner.show(mockElement, 'Uploading...');
        LoadingSpinner.hide(mockElement);

        expect(mockElement.disabled).toBe(false);
        expect(mockElement.innerHTML).toBe('Submit Form');
        expect(mockElement.dataset.njobvuOriginalHtml).toBeUndefined();
        expect(mockElement.dataset.njobvuOriginalDisabled).toBeUndefined();
        expect(mockElement.classList.remove).toHaveBeenCalledWith('njobvu-btn-loading');
    });

    test('wrapFetch() executes promise and automatically shows then hides spinner', async () => {
        const fakeFetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });

        const res = await LoadingSpinner.wrapFetch(fakeFetch(), mockElement, 'Saving...');

        expect(fakeFetch).toHaveBeenCalled();
        expect(res).toEqual({ ok: true, json: expect.any(Function) });
        expect(mockElement.disabled).toBe(false);
        expect(mockElement.innerHTML).toBe('Submit Form');
    });

    test('wrapFetch() hides spinner even when promise rejects', async () => {
        const fakeFetch = jest.fn().mockRejectedValue(new Error('Network error'));

        await expect(LoadingSpinner.wrapFetch(fakeFetch(), mockElement, 'Saving...')).rejects.toThrow('Network error');

        expect(mockElement.disabled).toBe(false);
        expect(mockElement.innerHTML).toBe('Submit Form');
    });
});
