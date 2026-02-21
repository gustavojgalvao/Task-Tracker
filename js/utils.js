// ============================================================
// ASCEND — UI Utilities
// Toast notifications, loading states, date helpers, DOM utils
// ============================================================

const UI = (() => {

    // ── Toast System ──────────────────────────────────────────────
    let toastContainer = null;

    function getToastContainer() {
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.className = 'toast-container';
            document.body.appendChild(toastContainer);
        }
        return toastContainer;
    }

    /**
     * Show a toast notification
     * @param {string} message
     * @param {'success'|'error'|'info'} [type]
     * @param {number} [duration] ms
     */
    function toast(message, type = 'info', duration = 3500) {
        const container = getToastContainer();
        const el = document.createElement('div');
        el.className = `toast ${type}`;

        const icons = {
            success: '<i class="fa-solid fa-circle-check"></i>',
            error: '<i class="fa-solid fa-circle-xmark"></i>',
            info: '<i class="fa-solid fa-circle-info"></i>'
        };
        el.innerHTML = `<span class="toast-icon">${icons[type] || '<i class="fa-solid fa-comment"></i>'}</span><span>${message}</span>`;
        container.appendChild(el);

        setTimeout(() => {
            el.classList.add('fade-out');
            setTimeout(() => el.remove(), 350);
        }, duration);
    }

    // ── Button loading states ─────────────────────────────────────
    function setLoading(btn, loading) {
        if (loading) {
            btn._originalHTML = btn.innerHTML;
            btn.innerHTML = `<span class="spinner"></span>`;
            btn.disabled = true;
        } else {
            btn.innerHTML = btn._originalHTML || btn.innerHTML;
            btn.disabled = false;
        }
    }

    // ── Date helpers ──────────────────────────────────────────────
    const MONTHS_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const WEEKDAYS_PT = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    function formatDatePT(date) {
        return `${WEEKDAYS_PT[date.getDay()]}, ${date.getDate()} de ${MONTHS_PT[date.getMonth()]}`;
    }

    function todayStr() {
        return new Date().toISOString().split('T')[0];
    }

    function dateStr(date) {
        return date.toISOString().split('T')[0];
    }

    function getStartOfMonth(date = new Date()) {
        return new Date(date.getFullYear(), date.getMonth(), 1);
    }

    function getEndOfMonth(date = new Date()) {
        return new Date(date.getFullYear(), date.getMonth() + 1, 0);
    }

    function getStartOfWeek(date = new Date()) {
        const d = new Date(date);
        const day = d.getDay();
        d.setDate(d.getDate() - day);
        return d;
    }

    function getDaysAgo(n) {
        const d = new Date();
        d.setDate(d.getDate() - n);
        return d;
    }

    function getStartOfYear(date = new Date()) {
        return new Date(date.getFullYear(), 0, 1);
    }

    // ── DOM helpers ───────────────────────────────────────────────

    /**
     * Simple query alias
     */
    function qs(selector, parent = document) {
        return parent.querySelector(selector);
    }

    function qsa(selector, parent = document) {
        return [...parent.querySelectorAll(selector)];
    }

    /**
     * Set text content safely
     */
    function setText(selector, text, parent = document) {
        const el = qs(selector, parent);
        if (el) el.textContent = text;
    }

    /**
     * Animate a number counting up from 0 to target
     */
    function animateNumber(el, target, duration = 800, suffix = '') {
        if (!el) return;
        const start = Date.now();
        const from = parseInt(el.textContent) || 0;
        const diff = target - from;

        function step() {
            const elapsed = Date.now() - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
            el.textContent = Math.round(from + diff * eased) + suffix;
            if (progress < 1) requestAnimationFrame(step);
        }

        requestAnimationFrame(step);
    }

    /**
     * Update SVG progress ring
     * @param {SVGCircleElement} circle
     * @param {number} pct 0-100
     */
    function setProgressRing(circle, pct) {
        const r = parseInt(circle.getAttribute('r'));
        const circumference = 2 * Math.PI * r;
        circle.style.strokeDasharray = circumference;
        circle.style.strokeDashoffset = circumference * (1 - pct / 100);
    }

    /**
     * Show / hide an element
     */
    function show(el) { if (el) el.style.display = ''; }
    function hide(el) { if (el) el.style.display = 'none'; }

    /**
     * Handle async form submissions gracefully
     */
    async function handleSubmit(btn, fn) {
        setLoading(btn, true);
        try {
            await fn();
        } catch (err) {
            toast(err.message || 'Erro inesperado.', 'error');
        } finally {
            setLoading(btn, false);
        }
    }

    /**
     * Confirm dialog (returns promise)
     */
    function confirm(message) {
        return new Promise(resolve => {
            // For now use native dialog; could be upgraded to custom modal
            resolve(window.confirm(message));
        });
    }

    /**
     * Format time string (HH:MM) to human readable
     */
    function formatTime(timeStr) {
        if (!timeStr) return '';
        const [h, m] = timeStr.split(':').map(Number);
        const suffix = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
    }

    return {
        toast, setLoading, handleSubmit, confirm,
        formatDatePT, todayStr, dateStr,
        getStartOfMonth, getEndOfMonth, getStartOfWeek, getDaysAgo, getStartOfYear,
        MONTHS_PT, MONTHS_SHORT, WEEKDAYS_PT,
        qs, qsa, setText, animateNumber, setProgressRing, show, hide, formatTime
    };
})();

window.UI = UI;
