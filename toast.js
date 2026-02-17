// Global toast notification system
// Usage: toast('Berhasil!', 'success') or toast('Gagal', 'error')

(function () {
    'use strict';

    function getContainer() {
        let c = document.getElementById('globalToastContainer');
        if (!c) {
            c = document.createElement('div');
            c.id = 'globalToastContainer';
            c.className = 'toast-container';
            document.body.appendChild(c);
        }
        return c;
    }

    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-times-circle',
        info: 'fas fa-info-circle',
        warning: 'fas fa-exclamation-triangle'
    };

    /**
     * Show a toast notification
     * @param {string} message
     * @param {'success'|'error'|'info'|'warning'} type
     * @param {number} duration ms
     */
    function toast(message, type, duration) {
        type = type || 'info';
        duration = duration || 2200;

        const container = getContainer();
        const el = document.createElement('div');
        el.className = `toast toast-${type}`;

        const icon = document.createElement('i');
        icon.className = icons[type] || icons.info;
        el.appendChild(icon);

        const text = document.createElement('span');
        text.textContent = String(message || '');
        el.appendChild(text);

        container.appendChild(el);

        // trigger animation
        requestAnimationFrame(() => {
            requestAnimationFrame(() => el.classList.add('show'));
        });

        // auto dismiss
        setTimeout(() => {
            el.classList.remove('show');
            setTimeout(() => el.remove(), 250);
        }, duration);
    }

    // expose globally
    window.toast = toast;
})();
