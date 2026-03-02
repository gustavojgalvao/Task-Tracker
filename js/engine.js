// ============================================================
// ASCEND — Progression Engine (engine.js)
// Pure-function, deterministic core. No DOM. No DB. No side effects.
// All calculations are reproducible from the same inputs.
// ============================================================

const Engine = (() => {

    // ── XP Tier Table ─────────────────────────────────────────
    // Maps habit weight (1-5) to base XP earned on full completion.
    const XP_TIERS = {
        1: 10,
        2: 25,
        3: 50,
        4: 75,
        5: 100,
    };

    /**
     * Calculate XP earned for a single habit completion.
     * Applies strict-mode penalty (50% if late), min 1 XP.
     *
     * @param {number} weight 1-5
     * @param {boolean} [penaltyApplied] - strict mode late penalty
     * @returns {number} XP earned
     */
    function calcHabitXP(weight, penaltyApplied = false) {
        const base = XP_TIERS[Math.min(5, Math.max(1, weight))] ?? 10;
        if (penaltyApplied) return Math.max(1, Math.floor(base * 0.5));
        return base;
    }

    /**
     * Calculate the maximum possible XP for a set of habits in one day.
     * @param {object[]} habits - array with { weight }
     * @returns {number}
     */
    function calcMaxDailyXP(habits) {
        return habits.reduce((sum, h) => sum + (XP_TIERS[h.weight] ?? 10), 0);
    }

    // ── Level System ──────────────────────────────────────────
    // Formula: XP_to_next_level(n) = floor(100 × n^1.6)
    // Level 1:  100 XP   Level 5:  ~858 XP
    // Level 10: ~2512 XP  Level 20: ~8858 XP

    /**
     * Get cumulative XP required to reach a given level.
     * @param {number} level - level number (1-based)
     * @returns {number} cumulative XP needed to start that level
     */
    function xpForLevel(level) {
        if (level <= 1) return 0;
        let total = 0;
        for (let n = 1; n < level; n++) {
            total += Math.floor(100 * Math.pow(n, 1.6));
        }
        return total;
    }

    /**
     * Get XP required to advance from level n to n+1.
     * @param {number} level
     * @returns {number}
     */
    function xpToNextLevel(level) {
        return Math.floor(100 * Math.pow(level, 1.6));
    }

    /**
     * Calculate current level from total XP.
     * @param {number} totalXP
     * @returns {number} level (1-based)
     */
    function calcLevel(totalXP) {
        let level = 1;
        while (totalXP >= xpForLevel(level + 1)) {
            level++;
            if (level >= 100) break; // safety cap
        }
        return level;
    }

    /**
     * Get XP progress within the current level.
     * @param {number} totalXP
     * @returns {{ level, currentLevelXP, nextLevelXP, progressPct }}
     */
    function getLevelProgress(totalXP) {
        const level = calcLevel(totalXP);
        const levelStartXP = xpForLevel(level);
        const levelEndXP = xpForLevel(level + 1);
        const currentLevelXP = totalXP - levelStartXP;
        const nextLevelXP = levelEndXP - levelStartXP;
        const progressPct = nextLevelXP > 0 ? Math.round((currentLevelXP / nextLevelXP) * 100) : 100;
        return { level, currentLevelXP, nextLevelXP, progressPct };
    }

    // ── Rank System ───────────────────────────────────────────
    // 5 tiers based on level. Each rank has a glow color and emblem.
    const RANKS = [
        { id: 'initiate',   label: 'Initiate',   minLevel: 1,  maxLevel: 4,   color: '#8895b3', glow: 'rgba(136,149,179,0.4)' },
        { id: 'ascender',   label: 'Ascender',   minLevel: 5,  maxLevel: 9,   color: '#6366f1', glow: 'rgba(99,102,241,0.5)'  },
        { id: 'elite',      label: 'Elite',      minLevel: 10, maxLevel: 14,  color: '#22c55e', glow: 'rgba(34,197,94,0.5)'   },
        { id: 'sovereign',  label: 'Sovereign',  minLevel: 15, maxLevel: 19,  color: '#f59e0b', glow: 'rgba(245,158,11,0.5)'  },
        { id: 'legend',     label: 'Legend',     minLevel: 20, maxLevel: 999, color: '#ef4444', glow: 'rgba(239,68,68,0.6)'   },
    ];

    /**
     * Get rank object for a given level.
     * @param {number} level
     * @returns {object} { id, label, minLevel, maxLevel, color, glow }
     */
    function getRank(level) {
        return RANKS.find(r => level >= r.minLevel && level <= r.maxLevel) ?? RANKS[0];
    }

    /**
     * Get rank from total XP.
     * @param {number} totalXP
     * @returns {object}
     */
    function getRankFromXP(totalXP) {
        return getRank(calcLevel(totalXP));
    }

    // ── Daily Efficiency ──────────────────────────────────────

    /**
     * Calculate daily efficiency percentage (0-100).
     * Based on XP earned vs maximum possible XP for applicable habits.
     *
     * @param {object[]} logs - habit_logs for the day
     * @param {object[]} habits - applicable habits for the day
     * @returns {number} efficiency 0-100
     */
    function calcDailyEfficiency(logs, habits) {
        const maxXP = calcMaxDailyXP(habits);
        if (maxXP === 0) return 0;
        const earned = logs.reduce((sum, l) => {
            if (!l.completed) return sum;
            return sum + calcHabitXP(l.weight ?? 1, l.penalty_applied ?? false);
        }, 0);
        return Math.min(100, Math.round((earned / maxXP) * 100));
    }

    // ── Streak System (Efficiency-Based) ─────────────────────
    // A day "counts" for streak if daily efficiency >= STREAK_THRESHOLD
    const STREAK_THRESHOLD = 50; // percent

    /**
     * Check if a day qualifies for streak continuation.
     * @param {number} efficiencyPct 0-100
     * @returns {boolean}
     */
    function dayQualifiesForStreak(efficiencyPct) {
        return efficiencyPct >= STREAK_THRESHOLD;
    }

    // ── PDL (Performance Discipline Level) ───────────────────
    // PDL = 30-day average efficiency / 100 → 0.00 to 1.00

    /**
     * Calculate PDL from daily efficiency data.
     * @param {Array<{efficiency: number}>} last30DaysEfficiency
     * @returns {number} PDL 0.00–1.00
     */
    function calcPDL(last30DaysEfficiency) {
        if (last30DaysEfficiency.length === 0) return 0;
        const avg = last30DaysEfficiency.reduce((s, d) => s + d.efficiency, 0) / last30DaysEfficiency.length;
        return Math.min(1, +(avg / 100).toFixed(4));
    }

    // ── Decay Mechanism ───────────────────────────────────────
    // Trigger: 3 consecutive days below DECAY_THRESHOLD efficiency
    // Penalty: -10% of current XP (floored at 0)
    const DECAY_THRESHOLD = 20; // percent
    const DECAY_RATE = 0.10;    // 10% XP loss

    /**
     * Check if decay should be triggered.
     * @param {Array<{efficiency: number}>} recentDays - most recent days (ascending), at least 3 required
     * @returns {boolean}
     */
    function shouldTriggerDecay(recentDays) {
        if (recentDays.length < 3) return false;
        const last3 = recentDays.slice(-3);
        return last3.every(d => d.efficiency < DECAY_THRESHOLD);
    }

    /**
     * Apply XP decay penalty.
     * @param {number} currentXP
     * @returns {number} XP after decay
     */
    function applyDecay(currentXP) {
        return Math.max(0, Math.floor(currentXP * (1 - DECAY_RATE)));
    }

    /**
     * Calculate XP decay amount (for display purposes).
     * @param {number} currentXP
     * @returns {number}
     */
    function calcDecayAmount(currentXP) {
        return currentXP - applyDecay(currentXP);
    }

    // ── Daily Session Snapshot ────────────────────────────────

    /**
     * Build an immutable daily snapshot object from a day's data.
     * This is the canonical record of a day's performance.
     *
     * @param {string} date YYYY-MM-DD
     * @param {object[]} logs - habit_logs for the day
     * @param {object[]} habits - applicable habits for the day
     * @returns {object} snapshot
     */
    function buildDaySnapshot(date, logs, habits) {
        const completed = logs.filter(l => l.completed);
        const xpEarned = completed.reduce((sum, l) =>
            sum + calcHabitXP(l.weight ?? 1, l.penalty_applied ?? false), 0);
        const maxXP = calcMaxDailyXP(habits);
        const efficiency = calcDailyEfficiency(logs, habits);
        const habitsTotal = habits.length;
        const habitsCompleted = completed.length;
        const streakQualifies = dayQualifiesForStreak(efficiency);

        return {
            date,
            xpEarned,
            maxXP,
            efficiency,
            habitsTotal,
            habitsCompleted,
            streakQualifies,
            penaltiesApplied: completed.filter(l => l.penalty_applied).length,
        };
    }

    // ── Rolling Analytics ─────────────────────────────────────

    /**
     * Calculate rolling N-day average efficiency.
     * @param {Array<{efficiency: number, date: string}>} snapshots - sorted ascending
     * @param {number} [window=7]
     * @returns {Array<{date: string, rollingAvg: number}>}
     */
    function calcRollingAverage(snapshots, window = 7) {
        return snapshots.map((snap, i, arr) => {
            const start = Math.max(0, i - window + 1);
            const slice = arr.slice(start, i + 1);
            const avg = slice.reduce((s, d) => s + d.efficiency, 0) / slice.length;
            return { date: snap.date, rollingAvg: +avg.toFixed(1) };
        });
    }

    /**
     * Calculate efficiency trend (slope of last N days, positive = improving).
     * Uses simple linear regression.
     * @param {Array<{efficiency: number}>} snapshots - last N days
     * @returns {number} trend slope (pts/day)
     */
    function calcTrend(snapshots) {
        const n = snapshots.length;
        if (n < 2) return 0;
        const x = snapshots.map((_, i) => i);
        const y = snapshots.map(s => s.efficiency);
        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
        const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        return +slope.toFixed(2);
    }

    /**
     * Detect efficiency volatility (standard deviation).
     * High volatility = inconsistent performance.
     * @param {Array<{efficiency: number}>} snapshots
     * @returns {number} standard deviation
     */
    function calcVolatility(snapshots) {
        if (snapshots.length < 2) return 0;
        const values = snapshots.map(s => s.efficiency);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
        return +Math.sqrt(variance).toFixed(1);
    }

    /**
     * Detect early-warning streak collapse risk.
     * Returns severity: 'safe' | 'warning' | 'critical'
     * @param {Array<{streakQualifies: boolean}>} last7Days - sorted ascending
     * @returns {{ severity: string, failCount: number, message: string }}
     */
    function detectStreakRisk(last7Days) {
        if (last7Days.length === 0) return { severity: 'safe', failCount: 0, message: '' };
        const failCount = last7Days.filter(d => !d.streakQualifies).length;
        const recentFails = last7Days.slice(-3).filter(d => !d.streakQualifies).length;

        if (recentFails >= 3) {
            return { severity: 'critical', failCount, message: '3 dias consecutivos abaixo do limite — streak em colapso.' };
        }
        if (recentFails >= 2 || failCount >= 4) {
            return { severity: 'warning', failCount, message: 'Consistência caindo — risco de perder o streak.' };
        }
        return { severity: 'safe', failCount, message: '' };
    }

    /**
     * Project efficiency for next N days based on linear trend.
     * @param {Array<{efficiency: number, date: string}>} snapshots
     * @param {number} [days=7]
     * @returns {Array<{date: string, projected: number}>}
     */
    function projectEfficiency(snapshots, days = 7) {
        const trend = calcTrend(snapshots);
        const lastEff = snapshots.length > 0 ? snapshots[snapshots.length - 1].efficiency : 50;
        const lastDate = snapshots.length > 0 ? snapshots[snapshots.length - 1].date : new Date().toISOString().split('T')[0];

        return Array.from({ length: days }, (_, i) => {
            const d = new Date(lastDate + 'T00:00:00');
            d.setDate(d.getDate() + i + 1);
            const dateStr = d.toISOString().split('T')[0];
            const projected = Math.min(100, Math.max(0, Math.round(lastEff + trend * (i + 1))));
            return { date: dateStr, projected };
        });
    }

    // ── Error Classification ───────────────────────────────────

    const ERROR_TYPES = {
        NETWORK: 'NETWORK_ERROR',
        AUTH: 'AUTH_ERROR',
        DB: 'DB_ERROR',
        VALIDATION: 'VALIDATION_ERROR',
        AI: 'AI_ERROR',
        UNKNOWN: 'UNKNOWN_ERROR',
    };

    /**
     * Classify a raw error into a typed diagnostic.
     * @param {Error|object} err
     * @returns {{ type: string, userMessage: string, technical: string }}
     */
    function classifyError(err) {
        const msg = (err?.message || '').toLowerCase();
        const code = err?.code || err?.status || 0;

        if (!navigator.onLine || msg.includes('network') || msg.includes('failed to fetch')) {
            return {
                type: ERROR_TYPES.NETWORK,
                userMessage: 'Sem conexão. Verifique sua internet e tente novamente.',
                technical: err?.message,
            };
        }
        if (code === 401 || msg.includes('jwt') || msg.includes('auth') || msg.includes('unauthorized')) {
            return {
                type: ERROR_TYPES.AUTH,
                userMessage: 'Sessão expirada. Faça login novamente.',
                technical: err?.message,
            };
        }
        if (code === 409 || msg.includes('duplicate') || msg.includes('unique')) {
            return {
                type: ERROR_TYPES.DB,
                userMessage: 'Registro já existe. Atualize a página.',
                technical: err?.message,
            };
        }
        if (code >= 400 && code < 500) {
            return {
                type: ERROR_TYPES.VALIDATION,
                userMessage: 'Dados inválidos. Verifique os campos e tente novamente.',
                technical: err?.message,
            };
        }
        if (code >= 500 || msg.includes('internal')) {
            return {
                type: ERROR_TYPES.DB,
                userMessage: 'Erro no servidor. Tente novamente em alguns segundos.',
                technical: err?.message,
            };
        }
        return {
            type: ERROR_TYPES.UNKNOWN,
            userMessage: 'Algo deu errado. Tente novamente.',
            technical: err?.message,
        };
    }

    // ── Public API ─────────────────────────────────────────────
    return {
        // XP
        XP_TIERS,
        calcHabitXP,
        calcMaxDailyXP,
        // Level
        xpForLevel,
        xpToNextLevel,
        calcLevel,
        getLevelProgress,
        // Rank
        RANKS,
        getRank,
        getRankFromXP,
        // Efficiency
        calcDailyEfficiency,
        // Streak
        STREAK_THRESHOLD,
        dayQualifiesForStreak,
        // PDL
        calcPDL,
        // Decay
        DECAY_THRESHOLD,
        DECAY_RATE,
        shouldTriggerDecay,
        applyDecay,
        calcDecayAmount,
        // Snapshots
        buildDaySnapshot,
        // Analytics
        calcRollingAverage,
        calcTrend,
        calcVolatility,
        detectStreakRisk,
        projectEfficiency,
        // Errors
        ERROR_TYPES,
        classifyError,
    };
})();

window.Engine = Engine;
