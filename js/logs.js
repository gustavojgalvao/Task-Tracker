// ============================================================
// ASCEND — Habit Logs Module
// Handles recording completions and fetching log data
// Includes: idempotency guard, debounce lock, typed errors
// ============================================================

const Logs = (() => {
    const db = () => window.supabaseClient;

    // ── Debounce lock to prevent double-tap race conditions ───
    // Maps habitId+date to a boolean. If true, operation in flight.
    const _inFlight = new Map();

    function _lockKey(habitId, dateStr) {
        return `${habitId}::${dateStr}`;
    }

    function _isLocked(habitId, dateStr) {
        return _inFlight.get(_lockKey(habitId, dateStr)) === true;
    }

    function _lock(habitId, dateStr) {
        _inFlight.set(_lockKey(habitId, dateStr), true);
    }

    function _unlock(habitId, dateStr) {
        _inFlight.delete(_lockKey(habitId, dateStr));
    }

    /**
     * Format a Date as YYYY-MM-DD string in BRT (UTC-3)
     */
    function toDateStr(date) {
        return UI.toBRTDateStr(date);
    }

    /**
     * Calculate score for a goal-based habit (proportional, capped at weight)
     */
    function calcGoalScore(habit, valueLogged) {
        const ratio = Math.min(1, valueLogged / habit.goal_value);
        return Math.max(1, Math.floor(habit.weight * ratio));
    }

    /**
     * Mark a boolean habit as completed for a date.
     * Applies strict mode penalty if applicable.
     * Idempotency: upsert with onConflict guard.
     * Race protection: client-side debounce lock.
     *
     * @param {string} habitId
     * @param {Date} date
     * @param {object} habit - full habit object (for weight + strict_mode)
     */
    async function complete(habitId, date, habit) {
        const dateStr = toDateStr(date);

        // Client-side double-tap guard
        if (_isLocked(habitId, dateStr)) {
            throw Object.assign(new Error('Operation already in progress'), { code: 'DEBOUNCE' });
        }
        _lock(habitId, dateStr);

        try {
            const { data: { user } } = await db().auth.getUser();
            const now = UI.nowInBRT();

            let penaltyApplied = false;
            let scoreEarned = habit.weight;

            // Strict mode: check if marking after ideal_time (all in BRT)
            if (habit.strict_mode && habit.ideal_time) {
                const [h, m] = habit.ideal_time.split(':').map(Number);
                const dateInBRT = new Date(date.getTime() - 3 * 60 * 60 * 1000);
                const idealDate = new Date(Date.UTC(dateInBRT.getUTCFullYear(), dateInBRT.getUTCMonth(), dateInBRT.getUTCDate(), h + 3, m, 0));
                if (new Date() > idealDate) {
                    penaltyApplied = true;
                    scoreEarned = Math.max(1, Math.floor(scoreEarned * 0.5));
                }
            }

            // XP calculation using Engine if available
            const xpEarned = window.Engine
                ? Engine.calcHabitXP(habit.weight, penaltyApplied)
                : scoreEarned;

            const { data, error } = await db()
                .from('habit_logs')
                .upsert({
                    habit_id: habitId,
                    user_id: user.id,
                    date: dateStr,
                    completed: true,
                    completed_at: now.toISOString(),
                    penalty_applied: penaltyApplied,
                    score_earned: scoreEarned,
                    xp_earned: xpEarned,
                }, { onConflict: 'habit_id,date' })
                .select()
                .single();

            if (error) {
                const classified = window.Engine ? Engine.classifyError(error) : null;
                throw classified ? Object.assign(new Error(classified.userMessage), { type: classified.type, technical: classified.technical }) : error;
            }
            return data;
        } finally {
            _unlock(habitId, dateStr);
        }
    }

    /**
     * Log progress for a goal-based habit.
     * Marks as completed (and earns score) when valueLogged >= habit.goal_value.
     *
     * @param {string} habitId
     * @param {Date} date
     * @param {object} habit - full habit object
     * @param {number} valueLogged - amount logged by the user
     */
    async function logProgress(habitId, date, habit, valueLogged) {
        const dateStr = toDateStr(date);

        if (_isLocked(habitId, dateStr)) {
            throw Object.assign(new Error('Operation already in progress'), { code: 'DEBOUNCE' });
        }
        _lock(habitId, dateStr);

        try {
            const { data: { user } } = await db().auth.getUser();
            const now = UI.nowInBRT();

            // Validate: no negative value injection
            if (isNaN(valueLogged) || valueLogged < 0) {
                throw Object.assign(new Error('Valor inválido para progresso.'), { type: 'VALIDATION_ERROR' });
            }

            const completed = valueLogged >= habit.goal_value;
            let scoreEarned = completed ? calcGoalScore(habit, valueLogged) : 0;

            // Strict mode penalty even on goal habits
            let penaltyApplied = false;
            if (completed && habit.strict_mode && habit.ideal_time) {
                const [h, m] = habit.ideal_time.split(':').map(Number);
                const dateInBRT = new Date(date.getTime() - 3 * 60 * 60 * 1000);
                const idealDate = new Date(Date.UTC(dateInBRT.getUTCFullYear(), dateInBRT.getUTCMonth(), dateInBRT.getUTCDate(), h + 3, m, 0));
                if (new Date() > idealDate) {
                    penaltyApplied = true;
                    scoreEarned = Math.max(1, Math.floor(scoreEarned * 0.5));
                }
            }

            const xpEarned = completed && window.Engine
                ? Engine.calcHabitXP(habit.weight, penaltyApplied)
                : 0;

            const { data, error } = await db()
                .from('habit_logs')
                .upsert({
                    habit_id: habitId,
                    user_id: user.id,
                    date: dateStr,
                    completed,
                    completed_at: completed ? now.toISOString() : null,
                    penalty_applied: penaltyApplied,
                    score_earned: scoreEarned,
                    xp_earned: xpEarned,
                    value_logged: valueLogged,
                }, { onConflict: 'habit_id,date' })
                .select()
                .single();

            if (error) {
                const classified = window.Engine ? Engine.classifyError(error) : null;
                throw classified ? Object.assign(new Error(classified.userMessage), { type: classified.type }) : error;
            }
            return data;
        } finally {
            _unlock(habitId, dateStr);
        }
    }

    /**
     * Unmark a habit as completed for a date (resets value_logged too)
     */
    async function uncomplete(habitId, date) {
        const { data: { user } } = await db().auth.getUser();
        const dateStr = toDateStr(date);

        if (_isLocked(habitId, dateStr)) {
            throw Object.assign(new Error('Operation already in progress'), { code: 'DEBOUNCE' });
        }
        _lock(habitId, dateStr);

        try {
            const { data, error } = await db()
                .from('habit_logs')
                .upsert({
                    habit_id: habitId,
                    user_id: user.id,
                    date: dateStr,
                    completed: false,
                    completed_at: null,
                    penalty_applied: false,
                    score_earned: 0,
                    xp_earned: 0,
                    value_logged: null,
                }, { onConflict: 'habit_id,date' })
                .select()
                .single();

            if (error) {
                const classified = window.Engine ? Engine.classifyError(error) : null;
                throw classified ? Object.assign(new Error(classified.userMessage), { type: classified.type }) : error;
            }
            return data;
        } finally {
            _unlock(habitId, dateStr);
        }
    }

    /**
     * Get all logs for a specific date
     * @returns {object[]} array of habit_logs
     */
    async function getForDate(date) {
        const { data: { user } } = await db().auth.getUser();
        const dateStr = toDateStr(date);

        const { data, error } = await db()
            .from('habit_logs')
            .select('*')
            .eq('user_id', user.id)
            .eq('date', dateStr);

        if (error) throw error;
        return data || [];
    }

    /**
     * Get logs for a date range (inclusive)
     * @param {Date} startDate
     * @param {Date} endDate
     */
    async function getRange(startDate, endDate) {
        const { data: { user } } = await db().auth.getUser();

        const { data, error } = await db()
            .from('habit_logs')
            .select('*')
            .eq('user_id', user.id)
            .gte('date', toDateStr(startDate))
            .lte('date', toDateStr(endDate))
            .order('date', { ascending: true });

        if (error) throw error;
        return data || [];
    }

    /**
     * Get all logs for the current year
     */
    async function getThisYear() {
        const year = new Date().getFullYear();
        return getRange(new Date(year, 0, 1), new Date(year, 11, 31));
    }

    /**
     * Build a map of { 'YYYY-MM-DD': scoreTotal } for a set of logs
     */
    function buildScoreMap(logs) {
        const map = {};
        for (const log of logs) {
            if (log.completed) {
                map[log.date] = (map[log.date] || 0) + (log.score_earned || 0);
            }
        }
        return map;
    }

    /**
     * Build a map of { habitId: { date: boolean } }
     */
    function buildCompletionMap(logs) {
        const map = {};
        for (const log of logs) {
            if (!map[log.habit_id]) map[log.habit_id] = {};
            map[log.habit_id][log.date] = log.completed;
        }
        return map;
    }

    /**
     * Calculate total XP from all logs.
     * Uses xp_earned if available, falls back to score_earned.
     * @param {object[]} logs
     * @returns {number}
     */
    function calcTotalXP(logs) {
        return logs.reduce((sum, l) => {
            if (!l.completed) return sum;
            return sum + (l.xp_earned ?? l.score_earned ?? 0);
        }, 0);
    }

    return {
        complete, uncomplete, logProgress,
        getForDate, getRange, getThisYear,
        buildScoreMap, buildCompletionMap,
        calcTotalXP,
        toDateStr,
    };
})();

window.Logs = Logs;
