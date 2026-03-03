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

    // ── Level Tier Labels (internal — XP bar color hints only) ───
    // These are purely visual identifiers derived from level, NOT the Rank system.
    const LEVEL_TIERS = [
        { id: 'tier-novice', label: 'Novice', minLevel: 1, maxLevel: 4 },
        { id: 'tier-adept', label: 'Adept', minLevel: 5, maxLevel: 9 },
        { id: 'tier-expert', label: 'Expert', minLevel: 10, maxLevel: 14 },
        { id: 'tier-master', label: 'Master', minLevel: 15, maxLevel: 19 },
        { id: 'tier-grandmaster', label: 'Grand Master', minLevel: 20, maxLevel: 999 },
    ];

    // ── Competitive Rank System ───────────────────────────────
    // Rank = f(PDL competitive — 7-day weighted avg)
    // Rank CAN fall if recent performance declines.
    // NEVER derived from XP total or level.
    const COMPETITIVE_RANKS = [
        { id: 'bronze', label: 'Bronze', minPDL: 0, maxPDL: 39, color: '#cd7f32', glow: 'rgba(205,127,50,0.25)', icon: 'fa-shield' },
        { id: 'prata', label: 'Prata', minPDL: 40, maxPDL: 59, color: '#9ca3af', glow: 'rgba(156,163,175,0.25)', icon: 'fa-shield-halved' },
        { id: 'ouro', label: 'Ouro', minPDL: 60, maxPDL: 74, color: '#f59e0b', glow: 'rgba(245,158,11,0.25)', icon: 'fa-trophy' },
        { id: 'platina', label: 'Platina', minPDL: 75, maxPDL: 89, color: '#6366f1', glow: 'rgba(99,102,241,0.25)', icon: 'fa-gem' },
        { id: 'diamante', label: 'Diamante', minPDL: 90, maxPDL: 100, color: '#22c55e', glow: 'rgba(34,197,94,0.25)', icon: 'fa-diamond' },
    ];

    /**
     * Calculate Competitive PDL — weighted 7-day efficiency average.
     * Last 3 days carry 2× weight to emphasise recent form.
     *
     * @param {Array<{efficiency: number}>} last7Days - sorted oldest first, max 7 items
     * @returns {number} 0–100 integer competitive PDL
     */
    function calcCompetitivePDL(last7Days) {
        if (!last7Days || last7Days.length === 0) return 0;
        const n = last7Days.length;
        let weightedSum = 0;
        let totalWeight = 0;
        last7Days.forEach((d, i) => {
            // Recent 3 days (tail of sorted array) get doubled weight
            const weight = i >= n - 3 ? 2 : 1;
            weightedSum += (d.efficiency ?? 0) * weight;
            totalWeight += weight;
        });
        return Math.min(100, Math.max(0, Math.round(weightedSum / totalWeight)));
    }

    /**
     * Get competitive rank tier from PDL score.
     * @param {number} pdl - 0–100 competitive PDL
     * @returns {object} { id, label, minPDL, maxPDL, color, glow, icon }
     */
    function getRankFromPDL(pdl) {
        const score = Math.min(100, Math.max(0, pdl ?? 0));
        return COMPETITIVE_RANKS.find(r => score >= r.minPDL && score <= r.maxPDL)
            ?? COMPETITIVE_RANKS[0];
    }

    /**
     * @deprecated Use getRankFromPDL() instead.
     * Do NOT use to determine visible Rank — only kept for legacy call sites.
     */
    function getRankFromXP(totalXP) {
        // Returns a LEVEL TIER, not the competitive Rank.
        const level = calcLevel(totalXP);
        return LEVEL_TIERS.find(t => level >= t.minLevel && level <= t.maxLevel) ?? LEVEL_TIERS[0];
    }

    /** @deprecated Internal only — use COMPETITIVE_RANKS */
    function getRank(level) {
        return LEVEL_TIERS.find(t => level >= t.minLevel && level <= t.maxLevel) ?? LEVEL_TIERS[0];
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
            return { type: ERROR_TYPES.NETWORK, userMessage: 'Sem conexão. Verifique sua internet e tente novamente.', technical: err?.message };
        }
        if (code === 401 || msg.includes('jwt') || msg.includes('auth') || msg.includes('unauthorized')) {
            return { type: ERROR_TYPES.AUTH, userMessage: 'Sessão expirada. Faça login novamente.', technical: err?.message };
        }
        if (code === 409 || msg.includes('duplicate') || msg.includes('unique')) {
            return { type: ERROR_TYPES.DB, userMessage: 'Registro já existe. Atualize a página.', technical: err?.message };
        }
        if (code >= 400 && code < 500) {
            return { type: ERROR_TYPES.VALIDATION, userMessage: 'Dados inválidos. Verifique os campos e tente novamente.', technical: err?.message };
        }
        if (code >= 500 || msg.includes('internal')) {
            return { type: ERROR_TYPES.DB, userMessage: 'Erro no servidor. Tente novamente em alguns segundos.', technical: err?.message };
        }
        return { type: ERROR_TYPES.UNKNOWN, userMessage: 'Algo deu errado. Tente novamente.', technical: err?.message };
    }

    // ── Task XP System ────────────────────────────────────────
    // Base: weight × 20 → weight 1-5 gives 20/40/60/80/100 XP
    // Modifiers applied multiplicatively.

    const TASK_BASE_XP = { 1: 20, 2: 40, 3: 60, 4: 80, 5: 100 };

    // Lateness tier multipliers
    const LATENESS_MULTS = [1.0, 0.80, 0.55, 0.30]; // tier 0-3

    /**
     * Determine lateness tier from hours overdue.
     * @param {number} hoursLate - 0 means on time or early
     * @returns {number} 0=on time, 1=<24h, 2=24-72h, 3=>72h
     */
    function getLateTier(hoursLate) {
        if (hoursLate <= 0) return 0;
        if (hoursLate < 24) return 1;
        if (hoursLate < 72) return 2;
        return 3;
    }

    /**
     * Calculate XP earned for a task completion.
     *
     * @param {object} task - { weight, deadline?, completed_at?, is_sprint? }
     * @param {object} [opts]
     * @param {boolean} [opts.streakAligned] - completion pushed efficiency over 50%
     * @param {boolean} [opts.sprintMode] - completed inside a sprint session
     * @param {number}  [opts.xpMultiplier] - custom task multiplier (default 1.0)
     * @returns {{ xp: number, lateTier: number, modifiers: object }}
     */
    function calcTaskXP(task, opts = {}) {
        const { streakAligned = false, sprintMode = false, xpMultiplier = 1.0 } = opts;
        const weight = Math.min(5, Math.max(1, task.weight || 3));
        const base = TASK_BASE_XP[weight];

        // Lateness
        let hoursLate = 0;
        if (task.deadline && task.completed_at) {
            const dlMs = new Date(task.deadline).getTime();
            const doneMs = new Date(task.completed_at).getTime();
            hoursLate = Math.max(0, (doneMs - dlMs) / 3600000);
        }

        // Early bonus: deadline exists, completed > 24h before
        let hoursEarly = 0;
        if (task.deadline && task.completed_at) {
            const dlMs = new Date(task.deadline).getTime();
            const doneMs = new Date(task.completed_at).getTime();
            hoursEarly = Math.max(0, (dlMs - doneMs) / 3600000);
        }

        const lateTier = getLateTier(hoursLate);
        const lateMult = LATENESS_MULTS[lateTier];
        const earlyMult = hoursEarly > 24 ? 1.15 : 1.0;
        const sprintMult = sprintMode ? 1.20 : 1.0;
        const streakMult = streakAligned ? 1.10 : 1.0;

        const xp = Math.max(1, Math.floor(
            base * lateMult * earlyMult * sprintMult * streakMult * xpMultiplier
        ));

        return {
            xp,
            lateTier,
            modifiers: { lateMult, earlyMult, sprintMult, streakMult, xpMultiplier },
        };
    }

    /**
     * Calculate dynamic task priority score.
     * Higher = surface at top of list.
     *
     * @param {object} task - { base_priority, weight, deadline, classification }
     * @param {number} [currentEfficiency] - today's efficiency so far (0-100)
     * @returns {number} priority score
     */
    function calcTaskPriority(task, currentEfficiency = 0) {
        let score = task.priority || 5;

        // Urgency (deadline proximity)
        if (task.deadline) {
            const hoursLeft = (new Date(task.deadline) - Date.now()) / 3600000;
            if (hoursLeft < 4) score += 3;
            else if (hoursLeft < 24) score += 2;
            else if (hoursLeft < 72) score += 1;
        }

        // Importance (weight)
        if (task.weight >= 4) score += 2;
        else if (task.weight >= 3) score += 1;

        // Streak alignment: if completing would push us over 50% threshold
        const projectedEfficiency = currentEfficiency + (task.weight || 3) * 5;
        if (currentEfficiency < STREAK_THRESHOLD && projectedEfficiency >= STREAK_THRESHOLD) {
            score += 2;
        }

        // Strategic tasks get a +1 elevation
        if (task.classification === 'strategic') score += 1;

        return score;
    }

    /**
     * Dynamic Difficulty Adjustment — analyses 7-day task completion rate.
     * Returns a suggestion: 'increase' | 'decrease' | 'maintain'
     *
     * @param {object[]} recentTasks - completed/failed tasks last 7 days
     * @returns {{ suggestion: string, completionRate: number }}
     */
    function calcDDA(recentTasks) {
        if (recentTasks.length === 0) return { suggestion: 'maintain', completionRate: 0 };
        const completed = recentTasks.filter(t => t.status === 'done').length;
        const rate = completed / recentTasks.length;
        return {
            suggestion: rate > 0.90 ? 'increase' : rate < 0.50 ? 'decrease' : 'maintain',
            completionRate: +rate.toFixed(2),
        };
    }

    // ── V2 Analytics Intelligence System ─────────────────────
    // Momentum Score, Burnout Risk Index, Consistency Index

    /**
     * Calculate composite Momentum Score (0-100).
     * Components: trend direction, consistency, PDL mass, streak ratio.
     *
     * @param {object} p
     * @param {number} p.slopePtsPerDay   - from calcTrend()
     * @param {number} p.volatility       - σ from calcVolatility()
     * @param {number} p.pdl              - 0.00-1.00
     * @param {number} p.currentStreak    - days
     * @returns {number} 0-100
     */
    function calcMomentum({ slopePtsPerDay, volatility, pdl, currentStreak }) {
        const slopeNorm = Math.max(0, Math.min(1, (slopePtsPerDay + 5) / 10));
        const invVol = 1 - Math.min(1, volatility / 50);
        const pdlNorm = Math.min(1, pdl);
        const streakRatio = Math.min(1, currentStreak / 30);

        const score = (slopeNorm * 0.35 + invVol * 0.25 + pdlNorm * 0.25 + streakRatio * 0.15) * 100;
        return Math.round(Math.max(0, Math.min(100, score)));
    }

    /**
     * Get Momentum label from score.
     * @param {number} score 0-100
     * @returns {{ label: string, color: string }}
     */
    function getMomentumLabel(score) {
        if (score >= 76) return { label: 'Peak State', color: 'var(--green)' };
        if (score >= 51) return { label: 'Building', color: 'var(--accent-bright)' };
        if (score >= 26) return { label: 'Stabilizing', color: 'var(--gold)' };
        return { label: 'Declining', color: 'var(--red)' };
    }

    /**
     * Calculate Burnout Risk Index (0-100).
     *
     * @param {object} p
     * @param {number} p.slopePtsPerDay     - negative = declining
     * @param {number} p.volatility         - σ
     * @param {number} p.failedDaysLast7    - days in last 7 that failed streak threshold
     * @returns {{ bri: number, severity: string }}
     */
    function calcBurnoutRisk({ slopePtsPerDay, volatility, failedDaysLast7 }) {
        const declineW = Math.max(0, Math.min(1, -slopePtsPerDay / 5));
        const volatilityW = Math.min(1, volatility / 40);
        const instability = Math.min(1, failedDaysLast7 / 7);

        const bri = Math.round((declineW * 0.40 + volatilityW * 0.35 + instability * 0.25) * 100);
        const severity = bri >= 76 ? 'critical' : bri >= 56 ? 'warning' : bri >= 31 ? 'caution' : 'safe';
        return { bri: Math.max(0, Math.min(100, bri)), severity };
    }

    /**
     * Calculate Consistency Index (0-1).
     * CI = 1 - clamp(σ_30d / 50, 0, 1)
     * Higher = more predictable and stable.
     *
     * @param {Array<{efficiency: number}>} last30Days
     * @returns {number} 0.00-1.00
     */
    function calcConsistencyIndex(last30Days) {
        const vol = calcVolatility(last30Days);
        return +Math.max(0, 1 - Math.min(1, vol / 50)).toFixed(3);
    }

    /**
     * Classify behavioral cluster from composite metrics.
     * @param {object} metrics - { efficiency, ci, momentum, bri }
     * @returns {{ cluster: string, label: string, suggestion: string }}
     */
    function classifyBehavioralCluster({ efficiency, ci, momentum, bri }) {
        const CLUSTERS = [
            { cluster: 'A', label: 'Elite Executor', check: () => efficiency >= 75 && ci >= 0.7 && momentum >= 60 && bri < 40, suggestion: 'Ative metas de estiramento para crescimento.' },
            { cluster: 'E', label: 'Ascendente', check: () => momentum >= 50 && ci >= 0.5 && bri < 40 && efficiency > 0, suggestion: 'Trajetória positiva — mantenha o ritmo.' },
            { cluster: 'B', label: 'Volátil de Alto Nível', check: () => efficiency >= 60 && ci < 0.5, suggestion: 'Foco em consistência — reduza variação diária.' },
            { cluster: 'C', label: 'Piloto Automático', check: () => ci >= 0.7 && momentum < 40, suggestion: 'Aumente o peso das tarefas para crescer.' },
            { cluster: 'D', label: 'Em Recuperação', check: () => bri >= 56, suggestion: 'Ative o Modo Recuperação — metas mais simples por 7 dias.' },
        ];
        const match = CLUSTERS.find(c => c.check()) ?? { cluster: 'D', label: 'Em Recuperação', suggestion: 'Comece com uma habito simples hoje.' };
        return match;
    }

    /**
     * Sprint session focus multiplier.
     * Based on session quality (no interruptions = highest).
     *
     * @param {number} plannedMinutes
     * @param {number} actualMinutes
     * @param {number} interruptionCount
     * @returns {number} 1.00-1.20
     */
    function calcSprintFocusMultiplier(plannedMinutes, actualMinutes, interruptionCount) {
        const completionRatio = Math.min(1, actualMinutes / Math.max(1, plannedMinutes));
        if (completionRatio < 0.5) return 1.0;
        if (interruptionCount === 0) return 1.20;
        if (interruptionCount <= 2) return 1.05;
        return 1.0;
    }

    // ── Public API ─────────────────────────────────────────────
    return {
        // XP — Habits
        XP_TIERS,
        calcHabitXP,
        calcMaxDailyXP,
        // XP — Tasks
        TASK_BASE_XP,
        LATENESS_MULTS,
        getLateTier,
        calcTaskXP,
        calcTaskPriority,
        calcDDA,
        // Level (permanent — grows with XP)
        xpForLevel,
        xpToNextLevel,
        calcLevel,
        getLevelProgress,
        // Rank — Competitive (PDL-based, primary API)
        COMPETITIVE_RANKS,
        calcCompetitivePDL,
        getRankFromPDL,
        // Rank — Legacy aliases (@deprecated)
        RANKS: COMPETITIVE_RANKS,   // backward compat alias
        getRankFromXP,              // @deprecated
        getRank,                    // @deprecated
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
        // Analytics — Base
        calcRollingAverage,
        calcTrend,
        calcVolatility,
        detectStreakRisk,
        projectEfficiency,
        // Analytics — Intelligence (V2)
        calcMomentum,
        getMomentumLabel,
        calcBurnoutRisk,
        calcConsistencyIndex,
        classifyBehavioralCluster,
        calcSprintFocusMultiplier,
        // Errors
        ERROR_TYPES,
        classifyError,
    };
})();

window.Engine = Engine;

