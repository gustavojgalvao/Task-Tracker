// ============================================================
// ASCEND — Habit Logs Module
// Handles recording completions and fetching log data
// ============================================================

const Logs = (() => {
    const db = () => window.supabaseClient;

    /**
     * Format a Date as YYYY-MM-DD string
     */
    function toDateStr(date) {
        return date.toISOString().split('T')[0];
    }

    /**
     * Mark a habit as completed for a date.
     * Applies strict mode penalty if applicable.
     *
     * @param {string} habitId
     * @param {Date} date
     * @param {object} habit - full habit object (for weight + strict_mode)
     */
    async function complete(habitId, date, habit) {
        const { data: { user } } = await db().auth.getUser();
        const dateStr = toDateStr(date);
        const now = new Date();

        let penaltyApplied = false;
        let scoreEarned = habit.weight;

        // Strict mode: check if marking after ideal_time
        if (habit.strict_mode && habit.ideal_time) {
            const [h, m] = habit.ideal_time.split(':').map(Number);
            const idealDate = new Date(date);
            idealDate.setHours(h, m, 0, 0);
            if (now > idealDate) {
                penaltyApplied = true;
                scoreEarned = Math.max(1, Math.floor(scoreEarned * 0.5)); // -50%
            }
        }

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
            }, { onConflict: 'habit_id,date' })
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Unmark a habit as completed for a date
     */
    async function uncomplete(habitId, date) {
        const { data: { user } } = await db().auth.getUser();
        const dateStr = toDateStr(date);

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
            }, { onConflict: 'habit_id,date' })
            .select()
            .single();

        if (error) throw error;
        return data;
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

    return { complete, uncomplete, getForDate, getRange, getThisYear, buildScoreMap, buildCompletionMap, toDateStr };
})();

window.Logs = Logs;
