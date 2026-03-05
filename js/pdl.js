// ============================================================
// ASCEND OS — PDL League Module (pdl.js)
// Volatile League Points system, fully separated from XP.
// PDL can rise and fall based on daily performance.
// All DB writes go through Supabase RPCs (process_daily_pdl, get_pdl_status).
// ============================================================

const PDL = (() => {

    // ── Tier Ladder ───────────────────────────────────────────
    // 21 tiers total: 7 divisions × 3 tiers each, plus Mestre
    const TIERS = [
        { name: 'Ferro 3', division: 'Ferro', num: 3, idx: 1, color: '#78716c', glow: 'rgba(120,113,108,0.3)', icon: 'fa-circle', faColor: '#78716c' },
        { name: 'Ferro 2', division: 'Ferro', num: 2, idx: 2, color: '#78716c', glow: 'rgba(120,113,108,0.3)', icon: 'fa-circle', faColor: '#78716c' },
        { name: 'Ferro 1', division: 'Ferro', num: 1, idx: 3, color: '#78716c', glow: 'rgba(120,113,108,0.3)', icon: 'fa-circle', faColor: '#78716c' },
        { name: 'Bronze 3', division: 'Bronze', num: 3, idx: 4, color: '#cd7f32', glow: 'rgba(205,127,50,0.3)', icon: 'fa-shield', faColor: '#cd7f32' },
        { name: 'Bronze 2', division: 'Bronze', num: 2, idx: 5, color: '#cd7f32', glow: 'rgba(205,127,50,0.3)', icon: 'fa-shield', faColor: '#cd7f32' },
        { name: 'Bronze 1', division: 'Bronze', num: 1, idx: 6, color: '#cd7f32', glow: 'rgba(205,127,50,0.3)', icon: 'fa-shield', faColor: '#cd7f32' },
        { name: 'Prata 3', division: 'Prata', num: 3, idx: 7, color: '#9ca3af', glow: 'rgba(156,163,175,0.3)', icon: 'fa-shield-halved', faColor: '#9ca3af' },
        { name: 'Prata 2', division: 'Prata', num: 2, idx: 8, color: '#9ca3af', glow: 'rgba(156,163,175,0.3)', icon: 'fa-shield-halved', faColor: '#9ca3af' },
        { name: 'Prata 1', division: 'Prata', num: 1, idx: 9, color: '#9ca3af', glow: 'rgba(156,163,175,0.3)', icon: 'fa-shield-halved', faColor: '#9ca3af' },
        { name: 'Ouro 3', division: 'Ouro', num: 3, idx: 10, color: '#f59e0b', glow: 'rgba(245,158,11,0.3)', icon: 'fa-trophy', faColor: '#f59e0b' },
        { name: 'Ouro 2', division: 'Ouro', num: 2, idx: 11, color: '#f59e0b', glow: 'rgba(245,158,11,0.3)', icon: 'fa-trophy', faColor: '#f59e0b' },
        { name: 'Ouro 1', division: 'Ouro', num: 1, idx: 12, color: '#f59e0b', glow: 'rgba(245,158,11,0.3)', icon: 'fa-trophy', faColor: '#f59e0b' },
        { name: 'Platina 3', division: 'Platina', num: 3, idx: 13, color: '#6366f1', glow: 'rgba(99,102,241,0.3)', icon: 'fa-gem', faColor: '#6366f1' },
        { name: 'Platina 2', division: 'Platina', num: 2, idx: 14, color: '#6366f1', glow: 'rgba(99,102,241,0.3)', icon: 'fa-gem', faColor: '#6366f1' },
        { name: 'Platina 1', division: 'Platina', num: 1, idx: 15, color: '#6366f1', glow: 'rgba(99,102,241,0.3)', icon: 'fa-gem', faColor: '#6366f1' },
        { name: 'Diamante 3', division: 'Diamante', num: 3, idx: 16, color: '#22c55e', glow: 'rgba(34,197,94,0.3)', icon: 'fa-diamond', faColor: '#22c55e' },
        { name: 'Diamante 2', division: 'Diamante', num: 2, idx: 17, color: '#22c55e', glow: 'rgba(34,197,94,0.3)', icon: 'fa-diamond', faColor: '#22c55e' },
        { name: 'Diamante 1', division: 'Diamante', num: 1, idx: 18, color: '#22c55e', glow: 'rgba(34,197,94,0.3)', icon: 'fa-diamond', faColor: '#22c55e' },
        { name: 'Mestre', division: 'Mestre', num: 0, idx: 19, color: '#ec4899', glow: 'rgba(236,72,153,0.3)', icon: 'fa-crown', faColor: '#ec4899' },
    ];

    // ── PDL Constants ─────────────────────────────────────────
    const BASE_GAIN = 20;   // base PDL for meeting daily goal
    const MAX_DAILY_GAIN = 50;   // cap on daily PDL gain
    const DECAY_PER_DAY = 15;   // PDL lost per inactive day (no reserve)
    const MAX_RESERVE_DAYS = 7;    // shield slots

    // Streak bonus multipliers
    const STREAK_BONUS = { day1: 0, day3: 0.10, day7: 0.25 };

    // ── Tier Lookup ───────────────────────────────────────────

    /**
     * Get tier info by name string (matches DB column pdl_tier).
     * @param {string} tierName - e.g. "Ouro 2"
     * @returns {object} tier info from TIERS array
     */
    function getTierInfo(tierName) {
        return TIERS.find(t => t.name === tierName) ?? TIERS[0];
    }

    /**
     * Get tier info by 1-based index.
     * @param {number} idx 1–19
     */
    function getTierByIndex(idx) {
        return TIERS.find(t => t.idx === idx) ?? TIERS[0];
    }

    /**
     * Get the next tier above the given one.
     * Returns null if already at Mestre.
     */
    function getNextTier(tierName) {
        const current = getTierInfo(tierName);
        return current.idx < 19 ? getTierByIndex(current.idx + 1) : null;
    }

    /**
     * Get the previous tier below the given one.
     * Returns null if already at Ferro 3.
     */
    function getPrevTier(tierName) {
        const current = getTierInfo(tierName);
        return current.idx > 1 ? getTierByIndex(current.idx - 1) : null;
    }

    // ── PDL Gain Calculation ──────────────────────────────────

    /**
     * Calculate daily PDL gain (pure function, mirrors DB logic).
     * @param {boolean} goalMet     - did user meet the daily minimum?
     * @param {number}  streakDays  - current global streak count
     * @param {number}  taskBonus   - extra PDL from legendary/focus tasks (0–15)
     * @returns {number} PDL gain (0 if goal not met)
     */
    function calcDailyGain(goalMet, streakDays, taskBonus = 0) {
        if (!goalMet) return 0;
        let mult = 1.0;
        if (streakDays >= 7) mult = 1 + STREAK_BONUS.day7;
        else if (streakDays >= 3) mult = 1 + STREAK_BONUS.day3;
        const base = Math.floor(BASE_GAIN * mult);
        return Math.min(MAX_DAILY_GAIN, base + Math.min(15, Math.max(0, taskBonus)));
    }

    /**
     * Calculate streak multiplier label for display.
     * @param {number} streakDays
     * @returns {{ label: string, bonus: string }}
     */
    function getStreakBonusInfo(streakDays) {
        if (streakDays >= 7) return { label: 'Streak Lendário', bonus: '+25%' };
        if (streakDays >= 3) return { label: 'Streak Ativo', bonus: '+10%' };
        return { label: 'Iniciando Streak', bonus: '+0%' };
    }

    // ── Trend Analysis ────────────────────────────────────────

    /**
     * Calculate PDL trend from last 3+ history entries.
     * @param {Array<{change_amount: number}>} history - sorted newest first
     * @returns {'up' | 'stable' | 'down'}
     */
    function calcTrend(history) {
        if (!history || history.length < 2) return 'stable';
        const recent = history.slice(0, 3);
        const gains = recent.filter(h => h.change_amount > 0).length;
        const losses = recent.filter(h => h.change_amount < 0).length;
        if (gains > losses) return 'up';
        if (losses > gains) return 'down';
        return 'stable';
    }

    /**
     * Get trend arrow HTML with color.
     * @param {'up'|'stable'|'down'} trend
     * @returns {string} HTML string
     */
    function getTrendHTML(trend) {
        if (trend === 'up') return `<span class="text-emerald-500 font-black text-lg">↑</span><span class="text-[9px] font-black text-emerald-500 uppercase">Subindo</span>`;
        if (trend === 'down') return `<span class="text-red-500 font-black text-lg">↓</span><span class="text-[9px] font-black text-red-500 uppercase">Caindo</span>`;
        return `<span class="text-amber-400 font-black text-lg">→</span><span class="text-[9px] font-black text-amber-400 uppercase">Estável</span>`;
    }

    // ── Promotion / MD3 ───────────────────────────────────────

    /**
     * Check if status is in an active promotion series.
     * @param {object} status - from getStatus()
     */
    function isInPromotion(status) {
        return status?.promotion_state === 'md3';
    }

    /**
     * Calculate days remaining in the MD3 promotion.
     * MD3 = max 3 days total (wins + losses <= 3, but ends early at 2W or 2L).
     * @param {object} status
     * @returns {number} days remaining (0-3)
     */
    function promotionDaysLeft(status) {
        if (!isInPromotion(status)) return 0;
        const played = (status.promotion_wins || 0) + (status.promotion_losses || 0);
        return Math.max(0, 3 - played);
    }

    // ── Database Interface ────────────────────────────────────

    /**
     * Fetch the current user's full PDL status from Supabase.
     * @returns {Promise<object>} Status object from get_pdl_status() RPC
     */
    async function getStatus() {
        const { data, error } = await window.supabaseClient.rpc('get_pdl_status');
        if (error) throw error;
        return data;
    }

    /**
     * Trigger the daily PDL update for the current user.
     * Should be called once per day (idempotent — safe to call multiple times).
     *
     * @param {string}  date       - YYYY-MM-DD in BRT
     * @param {boolean} goalMet    - did the user meet the minimum score threshold?
     * @param {number}  streak     - current global streak (days)
     * @param {number}  taskBonus  - extra PDL from legendary/focus tasks (0–15)
     * @returns {Promise<object>} Result from process_daily_pdl() RPC
     */
    async function processDailyUpdate(date, goalMet, streak, taskBonus = 0) {
        const { data, error } = await window.supabaseClient.rpc('process_daily_pdl', {
            p_date: date,
            p_goal_met: goalMet,
            p_streak_days: streak,
            p_task_bonus: Math.min(15, Math.max(0, taskBonus)),
        });
        if (error) throw error;
        return data;
    }

    /**
     * Check if the daily PDL update needs to run and trigger it automatically.
     * Compares last_activity_date with today's BRT date.
     *
     * @param {object} currentStatus - from getStatus()
     * @param {boolean} goalMet
     * @param {number}  streak
     * @param {number}  taskBonus
     * @returns {Promise<object|null>} Update result or null if already ran today
     */
    async function triggerDailyUpdateIfNeeded(currentStatus, goalMet, streak, taskBonus = 0) {
        const todayStr = UI.todayStr();
        if (currentStatus?.last_activity_date === todayStr) return null;
        return processDailyUpdate(todayStr, goalMet, streak, taskBonus);
    }

    // ── Reserve Days Display ──────────────────────────────────

    /**
     * Generate HTML for the reserve days shield display.
     * @param {number} reserveDays 0–7
     * @returns {string} HTML
     */
    function renderReserveDaysHTML(reserveDays) {
        const shields = [];
        for (let i = 0; i < 7; i++) {
            const active = i < reserveDays;
            shields.push(
                `<i class="fa-solid fa-shield text-sm transition-all ${active ? 'text-primary' : 'text-slate-300 dark:text-slate-700'}"></i>`
            );
        }
        return shields.join('');
    }

    // ── All Tiers (for UI selectors / displays) ───────────────

    function getAllTiers() { return [...TIERS]; }

    // ── Database Interface (v2 — unified) ─────────────────────

    /**
     * PRIMARY READ: Full progression summary for a date.
     * All pages MUST use this instead of calculating locally.
     * Reads from daily_summary (sealed) or computes live estimate.
     *
     * @param {string} [dateStr] - YYYY-MM-DD (BRT). Defaults to today.
     * @returns {Promise<object>}
     */
    async function getProgressionSummary(dateStr) {
        const date = dateStr || UI.todayStr();
        const { data, error } = await window.supabaseClient.rpc('get_progression_summary', { p_date: date });
        if (error) throw error;
        return data;
    }

    /**
     * PRIMARY WRITE: Seal a day's progression result.
     * Calculates score, streak, PDL. Idempotent — safe to call multiple times.
     * ONLY call this at end-of-day or when user finishes their last habit.
     *
     * @param {string} [dateStr] - YYYY-MM-DD (BRT). Defaults to today.
     * @returns {Promise<object>}
     */
    async function closeDay(dateStr) {
        const date = dateStr || UI.todayStr();
        const { data, error } = await window.supabaseClient.rpc('close_day', { p_date: date });
        if (error) throw error;
        return data;
    }

    /**
     * Legacy: PDL-only status. Prefer getProgressionSummary() for most use cases.
     * @returns {Promise<object>}
     */
    async function getStatus() {
        const { data, error } = await window.supabaseClient.rpc('get_pdl_status');
        if (error) throw error;
        return data;
    }

    /**
     * Attempt to close today if not yet sealed.
     * Call after habit completion for fast feedback.
     * @returns {Promise<object|null>}
     */
    async function closeDayIfNeeded(dateStr) {
        const summary = await getProgressionSummary(dateStr);
        if (summary?.summary_sealed) return null;
        return closeDay(dateStr);
    }

    // ── Exports ───────────────────────────────────────────────

    return {
        // Data
        TIERS,
        BASE_GAIN, MAX_DAILY_GAIN, DECAY_PER_DAY, MAX_RESERVE_DAYS,

        // Tier lookup
        getTierInfo, getTierByIndex, getNextTier, getPrevTier, getAllTiers,

        // Calculations (display helpers only)
        calcDailyGain, getStreakBonusInfo,

        // Trend
        calcTrend, getTrendHTML,

        // Promotion
        isInPromotion, promotionDaysLeft,

        // Database (unified API)
        getProgressionSummary, closeDay, closeDayIfNeeded,
        getStatus, // legacy — prefer getProgressionSummary

        // Display helpers
        renderReserveDaysHTML,
    };
})();

window.PDL = PDL;
