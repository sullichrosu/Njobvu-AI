/**
 * Njobvu-AI Reusable Loading Spinner Helper
 * Provides inline button spinners, form loading states, overlay spinners, and fetch wrappers.
 */
(function(window) {
    'use strict';

    // Inject CSS styles if not present
    function injectStyles() {
        if (typeof document === 'undefined') return;
        if (document.getElementById('njobvu-spinner-styles')) return;
        const style = document.createElement('style');
        style.id = 'njobvu-spinner-styles';
        style.textContent = `
            .njobvu-spinner-inline {
                display: inline-block;
                width: 1em;
                height: 1em;
                vertical-align: -0.125em;
                border: 0.15em solid currentColor;
                border-right-color: transparent;
                border-radius: 50%;
                animation: njobvu-spinner-spin .75s linear infinite;
                margin-right: 0.5rem;
            }
            .njobvu-spinner-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background-color: rgba(0, 0, 0, 0.5);
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                z-index: 9999;
                color: #ffffff;
                font-family: inherit;
            }
            .njobvu-spinner-card {
                background: #1e293b;
                color: #f8fafc;
                padding: 1.5rem 2rem;
                border-radius: 8px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.3);
                display: flex;
                flex-direction: column;
                align-items: center;
                max-width: 90%;
            }
            .njobvu-spinner-lg {
                width: 2.5rem;
                height: 2.5rem;
                border-width: 0.25em;
                margin-right: 0;
                margin-bottom: 1rem;
            }
            @keyframes njobvu-spinner-spin {
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', injectStyles);
        } else {
            injectStyles();
        }
    }

    const LoadingSpinner = {
        /**
         * Shows spinner on a target element (button, submit input, or container) or full screen overlay if target is null.
         * @param {Element|string} [target] - Element or selector to attach spinner to
         * @param {Object|string} [options] - Options or text message
         */
        show: function(target, options) {
            injectStyles();
            let text = typeof options === 'string' ? options : (options && options.text !== undefined ? options.text : 'Processing...');
            
            if (!target) {
                return this.showOverlay(text);
            }

            const el = typeof target === 'string' && typeof document !== 'undefined' ? document.querySelector(target) : target;
            if (!el) {
                return this.showOverlay(text);
            }

            // If target is a form, target its submit button(s)
            if (el.tagName === 'FORM') {
                const submitBtns = el.querySelectorAll('button[type="submit"], input[type="submit"], button:not([type])');
                submitBtns.forEach(btn => this.show(btn, options));
                return;
            }

            // Save original state if not already saved
            if (!el.dataset.njobvuOriginalHtml) {
                el.dataset.njobvuOriginalHtml = el.innerHTML || el.value || '';
            }
            if (el.dataset.njobvuOriginalDisabled === undefined) {
                el.dataset.njobvuOriginalDisabled = el.disabled ? 'true' : 'false';
            }

            el.disabled = true;
            el.classList.add('njobvu-btn-loading');

            const spinnerHtml = `<span class="njobvu-spinner-inline" role="status" aria-hidden="true"></span>`;

            if (el.tagName === 'INPUT' && (el.type === 'submit' || el.type === 'button')) {
                el.value = text ? text : 'Processing...';
            } else {
                el.innerHTML = spinnerHtml + (text ? `<span>${text}</span>` : el.dataset.njobvuOriginalHtml);
            }
        },

        /**
         * Restores target element to its original state
         * @param {Element|string} [target]
         */
        hide: function(target) {
            if (!target) {
                this.hideOverlay();
                return;
            }

            const el = typeof target === 'string' && typeof document !== 'undefined' ? document.querySelector(target) : target;
            if (!el) {
                this.hideOverlay();
                return;
            }

            if (el.tagName === 'FORM') {
                const submitBtns = el.querySelectorAll('button[type="submit"], input[type="submit"], button:not([type])');
                submitBtns.forEach(btn => this.hide(btn));
                return;
            }

            if (el.dataset && el.dataset.njobvuOriginalHtml !== undefined) {
                if (el.tagName === 'INPUT' && (el.type === 'submit' || el.type === 'button')) {
                    el.value = el.dataset.njobvuOriginalHtml;
                } else {
                    el.innerHTML = el.dataset.njobvuOriginalHtml;
                }
                delete el.dataset.njobvuOriginalHtml;
            }

            if (el.dataset && el.dataset.njobvuOriginalDisabled !== undefined) {
                el.disabled = el.dataset.njobvuOriginalDisabled === 'true';
                delete el.dataset.njobvuOriginalDisabled;
            } else {
                el.disabled = false;
            }

            el.classList.remove('njobvu-btn-loading');
        },

        /**
         * Shows full-screen overlay spinner with message
         */
        showOverlay: function(message) {
            if (typeof document === 'undefined') return;
            injectStyles();
            let overlay = document.getElementById('njobvu-overlay-spinner');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'njobvu-overlay-spinner';
                overlay.className = 'njobvu-spinner-overlay';
                overlay.innerHTML = `
                    <div class="njobvu-spinner-card">
                        <span class="njobvu-spinner-inline njobvu-spinner-lg" role="status" aria-hidden="true"></span>
                        <div id="njobvu-overlay-text" style="font-weight: 500; text-align: center;">${message || 'Loading, please wait...'}</div>
                    </div>
                `;
                document.body.appendChild(overlay);
            } else {
                const textEl = document.getElementById('njobvu-overlay-text');
                if (textEl) textEl.textContent = message || 'Loading, please wait...';
                overlay.style.display = 'flex';
            }
        },

        /**
         * Updates text of existing overlay spinner
         */
        updateOverlayText: function(message) {
            if (typeof document === 'undefined') return;
            const textEl = document.getElementById('njobvu-overlay-text');
            if (textEl) textEl.textContent = message;
        },

        /**
         * Hides full-screen overlay spinner
         */
        hideOverlay: function() {
            if (typeof document === 'undefined') return;
            const overlay = document.getElementById('njobvu-overlay-spinner');
            if (overlay) {
                overlay.style.display = 'none';
            }
        },

        /**
         * Wraps a fetch promise or async function call with show/hide spinner handlers
         */
        wrapFetch: async function(fetchPromiseOrFn, target, options) {
            this.show(target, options);
            try {
                const promise = typeof fetchPromiseOrFn === 'function' ? fetchPromiseOrFn() : fetchPromiseOrFn;
                const result = await promise;
                return result;
            } finally {
                this.hide(target);
            }
        }
    };

    if (typeof window !== 'undefined') {
        window.LoadingSpinner = LoadingSpinner;
        window.showSpinner = function(target, options) { LoadingSpinner.show(target, options); };
        window.hideSpinner = function(target) { LoadingSpinner.hide(target); };
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = LoadingSpinner;
    }
})(typeof window !== 'undefined' ? window : this);
