// ============================================================
// ASCEND — Streak Calculation Module
// Individual habit streaks + global streak
// BRT-aware date calculations (UTC-3)
// ============================================================

const Streak = (() => {

    /**
     * Get yesterday's date string in BRT (UTC-3)
     * FIX: was using toISOString() (UTC) which caused wrong date after 9 PM local time
     */
    function yesterday() {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return UI.toBRTDateStr(d);
    }

    /**
     * Get today's date string in BRT (UTC-3)
     * FIX: was using toISOString() (UTC) which caused wrong date after 9 PM local time
     */
    function today() {
        return UI.toBRTDateStr(new Date());
    }

    /**
     * Calculate the current streak for a single habit.
     * A streak counts consecutive days (going backwards from today) where completed=true.
     *
     * @param {string} habitId
     * @param {object[]} allLogs - all logs sorted ascending by date
     * @returns {number} current streak in days
     */
    function calcHabitStreak(habitId, allLogs) {
        const habitLogs = allLogs
            .filter(l => l.habit_id === habitId && l.completed)
            .map(l => l.date)
            .sort()
            .reverse();

        if (habitLogs.length === 0) return 0;

        const todayStr = today();
        const yestStr = yesterday();

        // Streak must include today or yesterday
        if (habitLogs[0] !== todayStr && habitLogs[0] !== yestStr) return 0;

        let streak = 0;
        let checkDate = new Date(habitLogs[0] + 'T00:00:00');

        for (const dateStr of habitLogs) {
            const d = new Date(dateStr + 'T00:00:00');
            const diff = Math.round((checkDate - d) / 86400000);

            if (diff === 0) {
                streak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else {
                break;
            }
        }

        return streak;
    }

    /**
     * Calculate the global streak using efficiency-based threshold.
     * A day "passes" if daily efficiency >= Engine.STREAK_THRESHOLD (50%).
     * Falls back to 100% completion if Engine is unavailable.
     *
     * @param {object[]} logs - all logs
     * @param {object[]} habits - all active habits
     * @returns {number}
     */
    function calcGlobalStreak(logs, habits) {
        if (habits.length === 0) return 0;

        const todayStr = today();
        const yestStr = yesterday();

        // Build a map of date -> logs[]
        const logsByDate = {};
        for (const log of logs) {
            if (!logsByDate[log.date]) logsByDate[log.date] = [];
            logsByDate[log.date].push(log);
        }

        // Get sorted unique dates descending
        const dates = Object.keys(logsByDate).sort().reverse();

        if (dates.length === 0) return 0;

        // Streak must start from today or yesterday
        if (dates[0] !== todayStr && dates[0] !== yestStr) return 0;

        let streak = 0;
        let checkDate = new Date(dates[0] + 'T00:00:00');

        for (const dateStr of dates) {
            const d = new Date(dateStr + 'T00:00:00');
            const diff = Math.round((checkDate - d) / 86400000);
            if (diff !== 0) break;

            // Get habits that applied to this date
            const dow = d.getDay();
            const applicableHabits = habits.filter(h => {
                if (h.frequency === 'daily') return true;
                if (h.frequency === 'weekly') return Array.isArray(h.days_of_week) && h.days_of_week.includes(dow);
                return false;
            });

            if (applicableHabits.length === 0) {
                checkDate.setDate(checkDate.getDate() - 1);
                streak++;
                continue;
            }

            const dayLogs = logsByDate[dateStr] || [];

            // Use efficiency-based threshold if Engine is available
            let dayQualifies;
            if (window.Engine) {
                const efficiency = Engine.calcDailyEfficiency(dayLogs, applicableHabits);
                dayQualifies = Engine.dayQualifiesForStreak(efficiency);
            } else {
                // Fallback: 100% completion
                dayQualifies = applicableHabits.every(h => {
                    const log = dayLogs.find(l => l.habit_id === h.id);
                    return log && log.completed;
                });
            }

            if (!dayQualifies) break;

            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
        }

        return streak;
    }

    /**
     * Check if global strict mode 3-day-fail rule triggers streak reset.
     * Now uses efficiency threshold instead of 100% completion.
     * @param {object[]} logs
     * @param {object[]} habits
     * @returns {boolean} true if streak should be 0 due to 3-day fail
     */
    function checkStrictModeReset(logs, habits) {
        let failCount = 0;

        for (let i = 1; i <= 3; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = UI.toBRTDateStr(d); // BRT fix

            const dow = d.getDay();
            const applicable = habits.filter(h => {
                if (h.frequency === 'daily') return true;
                if (h.frequency === 'weekly') return Array.isArray(h.days_of_week) && h.days_of_week.includes(dow);
                return false;
            });

            if (applicable.length === 0) continue;

            const dayLogs = logs.filter(l => l.date === dateStr);

            let dayQualifies;
            if (window.Engine) {
                const efficiency = Engine.calcDailyEfficiency(dayLogs, applicable);
                dayQualifies = Engine.dayQualifiesForStreak(efficiency);
            } else {
                dayQualifies = applicable.every(h => {
                    const log = dayLogs.find(l => l.habit_id === h.id);
                    return log && log.completed;
                });
            }

            if (!dayQualifies) failCount++;
        }

        return failCount >= 3;
    }

    /**
     * Get longest ever streak for a habit
     * @param {string} habitId
     * @param {object[]} allLogs
     * @returns {number}
     */
    function calcLongestHabitStreak(habitId, allLogs) {
        const dates = allLogs
            .filter(l => l.habit_id === habitId && l.completed)
            .map(l => l.date)
            .sort();

        if (dates.length === 0) return 0;

        let max = 1, current = 1;
        for (let i = 1; i < dates.length; i++) {
            const prev = new Date(dates[i - 1] + 'T00:00:00');
            const curr = new Date(dates[i] + 'T00:00:00');
            const diff = Math.round((curr - prev) / 86400000);
            if (diff === 1) {
                current++;
                max = Math.max(max, current);
            } else {
                current = 1;
            }
        }

        return max;
    }

    /**
     * Get streak risk status for dashboard display.
     * @param {object[]} logs - recent logs
     * @param {object[]} habits - all active habits
     * @returns {{ severity: string, message: string }}
     */
    function getStreakRisk(logs, habits) {
        if (!window.Engine) return { severity: 'safe', message: '' };

        // Build last 7 day snapshots
        const snapshots = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = UI.toBRTDateStr(d);
            const dow = d.getDay();

            const applicable = habits.filter(h => {
                if (h.frequency === 'daily') return true;
                if (h.frequency === 'weekly') return Array.isArray(h.days_of_week) && h.days_of_week.includes(dow);
                return false;
            });

            const dayLogs = logs.filter(l => l.date === dateStr);
            const efficiency = applicable.length > 0
                ? Engine.calcDailyEfficiency(dayLogs, applicable)
                : 100; // no applicable habits = free pass
            snapshots.push({ date: dateStr, efficiency, streakQualifies: Engine.dayQualifiesForStreak(efficiency) });
        }

        return Engine.detectStreakRisk(snapshots);
    }

    return { calcHabitStreak, calcGlobalStreak, checkStrictModeReset, calcLongestHabitStreak, getStreakRisk, today, yesterday };
})();

window.Streak = Streak;
