// ============================================================
// ASCEND — Shared Application Controller (app.js)
// Single source of truth for init, state, and shared UI.
// All 4 pages import this before their own inline <script>.
// ============================================================

const AppState = {
    habits: [],         // All active (non-soft-deleted) habits
    logs: [],           // 30–day range logs
    yearLogs: [],       // Full year logs (analytics only)
    tasks: [],          // All tasks
    profile: null,      // Identity / profile row
    selectedDateStr: UI.todayStr(),
};

// ── AppInit ────────────────────────────────────────────────────
const AppInit = (() => {

    /**
     * Boot guard: checks auth, redirects if needed.
     * Returns true when the page may proceed.
     */
    async function boot() {
        UI.ensureToastStyles();
        const ok = await Router.init();
        return ok;
    }

    /**
     * Fetch all common data: habits, 365-day logs, profile.
     * Results written into AppState.
     */
    async function fetchAll() {
        const tasks = [
            Habits.getAllIncludingPaused(),
            Logs.getRange(UI.getDaysAgo(365), new Date()),
        ];

        // Identity may not be loaded on all pages
        if (typeof Identity !== 'undefined') {
            tasks.push(Identity.getProfile());
        } else {
            tasks.push(Promise.resolve(null));
        }

        const [habits, logs, profile] = await Promise.all(tasks);
        AppState.habits = habits.filter(h => h.is_active);
        AppState.logs = logs;
        AppState.profile = profile;
    }

    /**
     * Fetch tasks into AppState.tasks
     */
    async function fetchTasks() {
        AppState.tasks = await Tasks.getAll();
    }

    return { boot, fetchAll, fetchTasks };
})();

// ── AppUI ──────────────────────────────────────────────────────
const AppUI = (() => {

    /**
     * Render the nav user info block (name, rank, streak).
     * Works for any page that has #nav-user-name / #nav-user-rank / #nav-streak-val.
     */
    function renderNav(summaryData) {
        if (!summaryData) return;
        const profile = summaryData.profile || {};
        const summary = summaryData.dailySummary || {};
        const name = profile.username || profile.full_name || 'Operator';

        const nameEl = document.getElementById('nav-user-name');
        if (nameEl) nameEl.textContent = name;

        const welcomeEl = document.getElementById('welcome-name');
        if (welcomeEl) welcomeEl.textContent = name;

        const rank = profile.rank || { label: 'Bronze' };
        const rankEl = document.getElementById('nav-user-rank');
        if (rankEl) rankEl.textContent = rank.label;

        const streak = summary.streak_after_day || 0;
        const streakEl = document.getElementById('nav-streak-val');
        if (streakEl) streakEl.textContent = streak;

        return { rank, streak };
    }

    /**
     * Universal sign-out handler — call this from any page.
     */
    async function handleSignOut() {
        try {
            await Auth.signOut();
        } catch (e) {
            UI.toast('Erro ao sair.', 'error');
        }
    }

    /**
     * Set an SVG progress ring stroke-dashoffset.
     * radius 34 → circumference 213.6
     * radius 40 → circumference 251.3
     * radius 120 → circumference 753.98
     */
    function setRingPct(circleEl, pct, circumference = 213.6) {
        if (!circleEl) return;
        const offset = circumference - (Math.min(100, pct) / 100) * circumference;
        circleEl.style.strokeDashoffset = offset;
    }

    return { renderNav, handleSignOut, setRingPct };
})();

// Expose globally
window.AppState = AppState;
window.AppInit = AppInit;
window.AppUI = AppUI;
