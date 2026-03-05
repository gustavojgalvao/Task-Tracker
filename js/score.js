// ============================================================
// ASCEND — Score Calculation Module
// Daily, weekly, monthly discipline scores + alignment %
// ============================================================

const Score = (() => {

    /**
     * Calculate the discipline score for a single day
     * @param {object[]} logs - logs for that date (habit_logs rows)
     * @returns {number}
     */
    function calcDaily(logs) {
        return logs.reduce((sum, l) => sum + (l.completed ? (l.score_earned || 0) : 0), 0);
    }

    /**
     * Calculate the maximum possible score for a set of habits on a date
     * @param {object[]} habits - habit records that apply to that date
     * @returns {number}
     */
    function calcMaxDaily(habits) {
        return habits.reduce((sum, h) => sum + h.weight, 0);
    }

    /**
     * Calculate the daily completion percentage (0-100)
     * @param {object[]} completedLogs
     * @param {object[]} habits - applicable habits
     */
    function calcDailyPercent(completedLogs, habits) {
        const max = calcMaxDaily(habits);
        if (max === 0) return 0;
        const earned = calcDaily(completedLogs);
        return Math.round((earned / max) * 100);
    }

    /**
     * Aggregate scores by day for a range of logs.
     * Returns array of { date: 'YYYY-MM-DD', score: number }
     *
     * @param {object[]} logs
     */
    function aggregateByDay(logs) {
        const map = {};
        for (const log of logs) {
            if (log.completed) {
                map[log.date] = (map[log.date] || 0) + (log.score_earned || 0);
            }
        }
        return Object.entries(map)
            .map(([date, score]) => ({ date, score }))
            .sort((a, b) => a.date.localeCompare(b.date));
    }

    /**
     * Aggregate scores by ISO week number.
     * Returns array of { week: 'YYYY-WNN', score: number }
     *
     * @param {object[]} logs
     */
    function aggregateByWeek(logs) {
        const map = {};
        for (const log of logs) {
            if (!log.completed) continue;
            const week = getISOWeekKey(new Date(log.date + 'T00:00:00'));
            map[week] = (map[week] || 0) + (log.score_earned || 0);
        }
        return Object.entries(map)
            .map(([week, score]) => ({ week, score }))
            .sort((a, b) => a.week.localeCompare(b.week));
    }

    /**
     * Aggregate scores by month.
     * Returns array of { month: 'YYYY-MM', score: number, avg: number, days: number }
     *
     * @param {object[]} logs
     */
    function aggregateByMonth(logs) {
        const scoreMap = {};
        const daysMap = {};

        for (const log of logs) {
            if (!log.completed) continue;
            const month = log.date.slice(0, 7);
            scoreMap[month] = (scoreMap[month] || 0) + (log.score_earned || 0);
            if (!daysMap[month]) daysMap[month] = new Set();
            daysMap[month].add(log.date);
        }

        return Object.entries(scoreMap)
            .map(([month, score]) => ({
                month,
                score,
                days: daysMap[month].size,
                avg: +(score / daysMap[month].size).toFixed(1)
            }))
            .sort((a, b) => a.month.localeCompare(b.month));
    }

    /**
     * Calculate per-habit completion percentage over a range of logs
     * @param {object[]} habits
     * @param {object[]} logs
     * @param {Date} startDate
     * @param {Date} endDate
     */
    function calcHabitCompletionRates(habits, logs) {
        const result = [];
        for (const habit of habits) {
            const habitLogs = logs.filter(l => l.habit_id === habit.id);
            const totalDays = habitLogs.length;
            const completedDays = habitLogs.filter(l => l.completed).length;
            const pct = totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0;
            const totalScore = habitLogs.reduce((s, l) => s + (l.score_earned || 0), 0);
            result.push({ habit, completedDays, totalDays, pct, totalScore });
        }
        return result;
    }

    /**
     * Overall alignment percentage (how well user is following all habits)
     * @param {object[]} habits
     * @param {object[]} logs - logs for recent 30 days
     */
    function calcAlignmentPercent(habits, logs) {
        if (habits.length === 0 || logs.length === 0) return 0;
        const rates = calcHabitCompletionRates(habits, logs);
        const avg = rates.reduce((s, r) => s + r.pct, 0) / rates.length;
        return Math.round(avg);
    }

    /**
     * Summary stats object
     */
    function getSummary(dailyScores, weeklyScores, monthlyScores) {
        const allScores = dailyScores.map(d => d.score).filter(s => s > 0);

        return {
            totalAllTime: allScores.reduce((s, v) => s + v, 0),
            avgDaily: allScores.length > 0 ? +(allScores.reduce((s, v) => s + v, 0) / allScores.length).toFixed(1) : 0,
            bestDay: allScores.length > 0 ? Math.max(...allScores) : 0,
            weeklyTotal: weeklyScores.length > 0 ? weeklyScores[weeklyScores.length - 1].score : 0,
            monthlyTotal: monthlyScores.length > 0 ? monthlyScores[monthlyScores.length - 1].score : 0,
            activeDays: allScores.length,
        };
    }

    // Helper: get ISO week key "YYYY-WNN"
    function getISOWeekKey(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
    }

    return { calcDaily, calcMaxDaily, calcDailyPercent, aggregateByDay, aggregateByWeek, aggregateByMonth, calcHabitCompletionRates, calcAlignmentPercent, getSummary };
})();

// ── Advanced Analytics Services (V2 Backend-Driven) ─────────────────────────

const BalancedScoreService = {
    /**
     * Calculates the Habit Balanced Score via Supabase RPC.
     */
    calc: async function (days = 30) {
        const d = days === 'all' ? 3650 : days;
        try {
            const { data, error } = await window.supabaseClient.rpc('calc_balanced_score', { p_days: d });
            if (error) throw error;
            return {
                scores: data.scores || {},
                overall: data.overall || 0
            };
        } catch (err) {
            console.error('Error fetching balanced score:', err);
            return { scores: {}, overall: 0 };
        }
    }
};

const CategoryAnalyticsService = {
    /**
     * Extracts distribution for Doughnut chart via Supabase RPC
     */
    getDistribution: async function (days = 30) {
        const d = days === 'all' ? 3650 : days;
        try {
            const { data, error } = await window.supabaseClient.rpc('get_category_distribution', { p_days: d });
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error('Error fetching category distribution:', err);
            return [];
        }
    }
};

const HeatmapAggregationService = {
    /** 5-level blue palette — single source of truth */
    COLORS: ['#161b22', '#0c2d6b', '#0d47a1', '#1976d2', '#42a5f5'],

    /** Map XP → intensity 0-4 dynamically based on maxXP */
    getIntensity(xp, maxXP = 0) {
        if (xp === 0) return 0;
        let t1 = 20, t2 = 50, t3 = 100;
        if (maxXP > 100) {
            t3 = maxXP * 0.75;
            t2 = maxXP * 0.50;
            t1 = maxXP * 0.25;
        }
        if (xp >= t3) return 4;
        if (xp >= t2) return 3;
        if (xp >= t1) return 2;
        return 1;
    },

    /**
     * Generate heatmap data for a given year (or rolling 365 days if year omitted).
     * @param {number|null} year — e.g. 2025; null = rolling last 365 days ending today
     * @returns {{ grid, totalCols, months, year, startDate, endDate, xpByDay }}
     */
    generateHeatmapData(year) {
        const logs = window.AppState?.logs || [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let startDate, endDate;
        if (year) {
            startDate = new Date(year, 0, 1);
            endDate = new Date(year, 11, 31);
            if (endDate > today) endDate = new Date(today);
        } else {
            endDate = new Date(today);
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 364);
        }

        // Align start to Sunday
        while (startDate.getDay() !== 0) startDate.setDate(startDate.getDate() - 1);

        // Build XP lookup — use UI.dateStr for consistent format
        const xpByDay = {};
        const minStr = UI.dateStr(startDate);
        let maxXP = 0;
        for (const log of logs) {
            if (log.completed && log.date >= minStr) {
                const total = (log.xp_earned || log.score_earned || 0);
                xpByDay[log.date] = (xpByDay[log.date] || 0) + total;
            }
        }
        for (const k in xpByDay) {
            if (xpByDay[k] > maxXP) maxXP = xpByDay[k];
        }

        const totalDays = Math.round((endDate - startDate) / 86400000) + 1;
        const totalCols = Math.ceil(totalDays / 7);
        const grid = [], months = [];
        let currentMonth = -1;

        for (let i = 0; i < totalDays; i++) {
            const d = new Date(startDate);
            d.setDate(startDate.getDate() + i);
            const dStr = UI.dateStr(d);  // consistent with log.date format
            const xp = xpByDay[dStr] || 0;
            const col = Math.floor(i / 7);
            const row = i % 7;

            if (row === 0) {
                const m = d.getMonth();
                if (m !== currentMonth) {
                    months.push({ name: UI.MONTHS_SHORT[m], col });
                    currentMonth = m;
                }
            }

            grid.push({
                date: dStr,
                xp,
                intensity: this.getIntensity(xp, maxXP),
                isToday: d.getTime() === today.getTime(),
                col, row
            });
        }

        return { grid, totalCols, months, startDate, endDate, xpByDay };
    }
};

window.Score = Score;
window.BalancedScoreService = BalancedScoreService;
window.CategoryAnalyticsService = CategoryAnalyticsService;
window.HeatmapAggregationService = HeatmapAggregationService;
