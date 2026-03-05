// ============================================================
// ASCEND — UI Utilities
// Toast notifications, loading states, date helpers, DOM utils
// v2: mobile toast fix, reduced-motion, non-blocking confirm
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
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');

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

    // BRT = UTC-3. All date strings MUST be in BRT to match the user's calendar day.
    const BRT_OFFSET_MS = -3 * 60 * 60 * 1000;

    /**
     * Returns a Date object representing "now" in BRT.
     * Useful for strict-mode time comparisons.
     */
    function nowInBRT() {
        const utc = new Date();
        return new Date(utc.getTime() + BRT_OFFSET_MS);
    }

    /**
     * Converts any Date to a YYYY-MM-DD string in BRT (UTC-3).
     */
    function toBRTDateStr(date) {
        const brt = new Date(date.getTime() + BRT_OFFSET_MS);
        return brt.toISOString().split('T')[0];
    }

    function formatDatePT(date) {
        // date here is already a local/BRT-shifted date object used for display.
        return `${WEEKDAYS_PT[date.getDay()]}, ${date.getDate()} de ${MONTHS_PT[date.getMonth()]}`;
    }

    function todayStr() {
        return toBRTDateStr(new Date());
    }

    function dateStr(date) {
        return toBRTDateStr(date);
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
        // Respect prefers-reduced-motion — jump straight to value
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            el.textContent = target + suffix;
            return;
        }
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
     * Non-blocking confirm dialog (custom modal, returns promise)
     * Falls back to native confirm if modal container not found.
     */
    function confirm(message) {
        return new Promise(resolve => {
            // Try to use a custom confirm modal if it exists in the DOM
            const modal = document.getElementById('confirm-modal');
            if (!modal) {
                // Fallback for pages without custom confirm modal
                resolve(window.confirm(message));
                return;
            }
            document.getElementById('confirm-modal-message').textContent = message;
            modal.classList.add('open');

            function handleYes() {
                cleanup();
                resolve(true);
            }
            function handleNo() {
                cleanup();
                resolve(false);
            }
            function cleanup() {
                modal.classList.remove('open');
                document.getElementById('confirm-modal-yes').removeEventListener('click', handleYes);
                document.getElementById('confirm-modal-no').removeEventListener('click', handleNo);
            }
            document.getElementById('confirm-modal-yes').addEventListener('click', handleYes);
            document.getElementById('confirm-modal-no').addEventListener('click', handleNo);
        });
    }

    /**
     * Parse a YYYY-MM-DD date string into a local midnight Date object.
     * BRT-aware: treats the string as a local calendar date.
     * @param {string} dateStr YYYY-MM-DD
     * @returns {Date}
     */
    function parseDate(dateStr) {
        const [y, mo, d] = dateStr.split('-').map(Number);
        return new Date(y, mo - 1, d);
    }

    /**
     * Inject minimal toast CSS for pages that don't load base.css.
     * Safe to call multiple times (idempotent).
     */
    function ensureToastStyles() {
        if (document.getElementById('_ascend-toast-css')) return;
        const style = document.createElement('style');
        style.id = '_ascend-toast-css';
        style.textContent = `
            .toast-container{position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;}
            .toast{display:flex;align-items:center;gap:10px;padding:12px 18px;border-radius:12px;font-size:0.875rem;font-weight:600;font-family:Inter,sans-serif;pointer-events:auto;box-shadow:0 8px 32px rgba(0,0,0,.35);backdrop-filter:blur(12px);animation:toastIn .25s ease;color:#fff;}
            .toast.success{background:rgba(34,197,94,.9);}
            .toast.error{background:rgba(239,68,68,.9);}
            .toast.info{background:rgba(59,130,246,.9);}
            .toast.warning{background:rgba(245,158,11,.9);}
            .toast.fade-out{opacity:0;transform:translateY(8px);transition:all .3s ease;}
            @keyframes toastIn{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:translateY(0);}}
        `;
        document.head.appendChild(style);
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
        formatDatePT, todayStr, dateStr, toBRTDateStr, nowInBRT,
        getStartOfMonth, getEndOfMonth, getStartOfWeek, getDaysAgo, getStartOfYear,
        MONTHS_PT, MONTHS_SHORT, WEEKDAYS_PT,
        qs, qsa, setText, animateNumber, setProgressRing, show, hide, formatTime,
        parseDate, ensureToastStyles
    };
})();

window.UI = UI;
