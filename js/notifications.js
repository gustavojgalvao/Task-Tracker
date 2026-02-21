// ============================================================
// ASCEND — Notifications Module
// Browser push reminders + streak risk alerts
// ============================================================

const Notifications = (() => {

    let scheduledTimers = [];

    /**
     * Request notification permission from browser
     * @returns {Promise<boolean>} true if granted
     */
    async function requestPermission() {
        if (!('Notification' in window)) return false;
        if (Notification.permission === 'granted') return true;
        if (Notification.permission === 'denied') return false;

        const permission = await Notification.requestPermission();
        return permission === 'granted';
    }

    /**
     * Show an immediate browser notification
     * @param {string} title
     * @param {string} body
     * @param {object} [opts]
     */
    function show(title, body, opts = {}) {
        if (Notification.permission !== 'granted') return;
        const n = new Notification(title, {
            body,
            icon: '/assets/logo.png',
            badge: '/assets/logo.png',
            tag: opts.tag || 'ascend',
            silent: opts.silent || false,
            ...opts,
        });
        n.onclick = () => { window.focus(); n.close(); };
        return n;
    }

    /**
     * Clear all scheduled notification timers
     */
    function clearAll() {
        scheduledTimers.forEach(t => clearTimeout(t));
        scheduledTimers = [];
    }

    /**
     * Schedule habit reminders for today's habits
     * @param {object[]} habits - habits applicable today (with ideal_time set)
     * @param {object[]} completedLogs - today's completed logs
     */
    function scheduleDailyReminders(habits, completedLogs) {
        if (Notification.permission !== 'granted') return;
        clearAll();

        const completedIds = new Set(completedLogs.filter(l => l.completed).map(l => l.habit_id));
        const now = new Date();

        for (const habit of habits) {
            if (!habit.ideal_time) continue;
            if (completedIds.has(habit.id)) continue; // already done

            const [h, m] = habit.ideal_time.split(':').map(Number);
            const target = new Date();
            target.setHours(h, m, 0, 0);

            const msUntil = target - now;
            if (msUntil <= 0) continue; // past ideal time already

            const timer = setTimeout(() => {
                show(
                    `Hora do hábito! ${habit.icon}`,
                    `"${habit.name}" está esperando por você. Não deixe o streak morrer.`,
                    { tag: `habit-${habit.id}` }
                );
            }, msUntil);

            scheduledTimers.push(timer);
        }
    }

    /**
     * Schedule a streak risk alert (fires 90 min before midnight if habits still pending)
     * @param {object[]} habits - applicable habits today
     * @param {object[]} completedLogs - completed today
     * @param {number} globalStreak - current streak count
     */
    function scheduleStreakAlert(habits, completedLogs, globalStreak) {
        if (Notification.permission !== 'granted') return;
        if (globalStreak === 0) return;

        const completedIds = new Set(completedLogs.filter(l => l.completed).map(l => l.habit_id));
        const pending = habits.filter(h => !completedIds.has(h.id));
        if (pending.length === 0) return;

        const now = new Date();
        const midnight = new Date();
        midnight.setHours(23, 59, 59, 0);

        const alertAt = new Date(midnight - 90 * 60 * 1000); // 90 min before midnight
        const msUntil = alertAt - now;
        if (msUntil <= 0) return;

        const timer = setTimeout(() => {
            show(
                `🔥 Streak ${globalStreak} em risco!`,
                `Você tem ${pending.length} hábito(s) pendentes. Menos de 90 minutos para meia-noite.`,
                { tag: 'streak-risk', requireInteraction: true }
            );
        }, msUntil);

        scheduledTimers.push(timer);
    }

    /**
     * Check if notifications are supported and enabled
     */
    function isEnabled() {
        return 'Notification' in window && Notification.permission === 'granted';
    }

    return { requestPermission, show, scheduleDailyReminders, scheduleStreakAlert, clearAll, isEnabled };
})();

window.Notifications = Notifications;
