// ============================================================
// ASCEND — Habits CRUD Module
// ============================================================

const Habits = (() => {
    const db = () => window.supabaseClient;

    const ICONS = [
        // Energia & Foco
        'fa-solid fa-bolt',
        'fa-solid fa-fire',
        'fa-solid fa-bullseye',
        'fa-solid fa-star',
        'fa-solid fa-trophy',
        'fa-solid fa-medal',
        'fa-solid fa-crown',
        'fa-solid fa-rocket',
        // Fitness & Esporte
        'fa-solid fa-dumbbell',
        'fa-solid fa-person-running',
        'fa-solid fa-bicycle',
        'fa-solid fa-hand-fist',
        'fa-solid fa-heart-pulse',
        'fa-solid fa-person-swimming',
        'fa-solid fa-person-walking',
        'fa-solid fa-weight-scale',
        'fa-solid fa-stopwatch',
        'fa-solid fa-football',
        'fa-solid fa-basketball',
        'fa-solid fa-volleyball',
        // Mente & Bem-estar
        'fa-solid fa-brain',
        'fa-solid fa-spa',
        'fa-solid fa-leaf',
        'fa-solid fa-seedling',
        'fa-solid fa-peace',
        'fa-solid fa-yin-yang',
        'fa-solid fa-sun',
        'fa-solid fa-moon',
        'fa-solid fa-bed',
        'fa-solid fa-droplet',
        // Estudo & Trabalho
        'fa-solid fa-book',
        'fa-solid fa-book-open',
        'fa-solid fa-pencil',
        'fa-solid fa-pen-to-square',
        'fa-solid fa-graduation-cap',
        'fa-solid fa-laptop-code',
        'fa-solid fa-code',
        'fa-solid fa-lightbulb',
        'fa-solid fa-calculator',
        'fa-solid fa-briefcase',
        'fa-solid fa-magnifying-glass',
        'fa-solid fa-chart-line',
        'fa-solid fa-flask',
        // Alimentação & Saúde
        'fa-solid fa-apple-whole',
        'fa-solid fa-utensils',
        'fa-solid fa-carrot',
        'fa-solid fa-egg',
        'fa-solid fa-pills',
        'fa-solid fa-wine-glass',
        'fa-solid fa-mug-hot',
        // Criatividade & Arte
        'fa-solid fa-palette',
        'fa-solid fa-paintbrush',
        'fa-solid fa-guitar',
        'fa-solid fa-music',
        'fa-solid fa-microphone',
        'fa-solid fa-camera',
        'fa-solid fa-video',
        // Social & Cotidiano
        'fa-solid fa-people-group',
        'fa-solid fa-handshake',
        'fa-solid fa-comments',
        'fa-solid fa-house',
        'fa-solid fa-wallet',
        'fa-solid fa-dog',
        'fa-solid fa-cat',
        'fa-solid fa-earth-americas',
        'fa-solid fa-car',
    ];
    const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6', '#a855f7', '#f97316', '#06b6d4'];

    /**
     * Create a new habit
     */
    async function create(data) {
        const { data: { user } } = await db().auth.getUser();
        const { data: habit, error } = await db()
            .from('habits')
            .insert({
                user_id: user.id,
                name: data.name,
                weight: data.weight || 1,
                frequency: data.frequency || 'daily',
                days_of_week: data.days_of_week || null,
                ideal_time: data.ideal_time || null,
                strict_mode: data.strict_mode || false,
                color: data.color || '#6366f1',
                icon: data.icon || 'fa-solid fa-bolt',
                goal_value: data.goal_value || null,
                goal_unit: data.goal_unit || null,
                cycle_days: data.cycle_days || null,
                cycle_start: data.cycle_start || null,
                cycle_type: data.cycle_type || null,
                cycle_pattern: data.cycle_pattern || null,
            })
            .select()
            .single();

        if (error) throw error;
        return habit;
    }

    /**
     * Update an existing habit by ID
     */
    async function update(id, data) {
        const { data: habit, error } = await db()
            .from('habits')
            .update({
                name: data.name,
                weight: data.weight,
                frequency: data.frequency,
                days_of_week: data.days_of_week,
                ideal_time: data.ideal_time,
                strict_mode: data.strict_mode,
                color: data.color,
                icon: data.icon,
                goal_value: data.goal_value || null,
                goal_unit: data.goal_unit || null,
                cycle_days: data.cycle_days || null,
                cycle_start: data.cycle_start || null,
                cycle_type: data.cycle_type || null,
                cycle_pattern: data.cycle_pattern || null,
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return habit;
    }

    /**
     * Soft-delete (deactivate) a habit by ID
     */
    async function remove(id) {
        const { error } = await db()
            .from('habits')
            .update({ is_active: false })
            .eq('id', id);

        if (error) throw error;
    }

    /**
     * Suspend (pause) a habit — won't show in daily lists
     */
    async function pause(id) {
        const { error } = await db()
            .from('habits')
            .update({ is_paused: true })
            .eq('id', id);
        if (error) throw error;
    }

    /**
     * Resume a paused habit
     */
    async function resume(id) {
        const { error } = await db()
            .from('habits')
            .update({ is_paused: false })
            .eq('id', id);
        if (error) throw error;
    }

    /**
     * Get all ACTIVE (non-paused) habits for the current user
     */
    async function getAll() {
        const { data, error } = await db()
            .from('habits')
            .select('*')
            .eq('is_active', true)
            .eq('is_paused', false)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data || [];
    }

    /**
     * Get ALL habits including paused ones (for the management page)
     */
    async function getAllIncludingPaused() {
        const { data, error } = await db()
            .from('habits')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data || [];
    }

    /**
     * Get habits that apply to a specific date (day of week + cycle aware)
     * @param {Date} date
     */
    async function getForDate(date) {
        const all = await getAll();
        const dayOfWeek = date.getDay();
        const dateStr = UI.toBRTDateStr(date);

        return all.filter(habit => {
            if (habit.frequency === 'daily') return true;
            if (habit.frequency === 'weekly' && Array.isArray(habit.days_of_week)) {
                return habit.days_of_week.includes(dayOfWeek);
            }
            if (habit.frequency === 'cycle' && habit.cycle_start) {
                const start = new Date(habit.cycle_start + 'T00:00:00');
                const target = new Date(dateStr + 'T00:00:00');
                const diffDays = Math.round((target - start) / (1000 * 60 * 60 * 24));
                if (diffDays < 0) return false;

                const type = habit.cycle_type || 'active';

                // ── Progressive pattern: e.g. "7,9,5" ────────────────
                if (type === 'pattern' && habit.cycle_pattern) {
                    const phases = habit.cycle_pattern
                        .split(',')
                        .map(s => parseInt(s.trim()))
                        .filter(n => !isNaN(n) && n > 0);
                    if (phases.length === 0) return true;

                    // Total cycle length = sum of (active_days + 1 rest day) per phase
                    const totalCycle = phases.reduce((sum, n) => sum + n + 1, 0);
                    const pos = diffDays % totalCycle; // position within cycle

                    let accum = 0;
                    for (const n of phases) {
                        accum += n; // end of active block
                        if (pos === accum) return false; // this is a rest day
                        accum += 1; // skip the rest day
                        if (pos < accum) return true;  // still in active block
                    }
                    return true;
                }

                // ── Simple cycle ─────────────────────────────────────
                if (!habit.cycle_days) return false;
                const isNthDay = diffDays % habit.cycle_days === 0;
                if (type === 'active') return isNthDay;
                if (type === 'rest') return !isNthDay;
            }
            return false;
        });
    }

    /**
     * Get a single habit by ID
     */
    async function getById(id) {
        const { data, error } = await db()
            .from('habits')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return data;
    }

    return { create, update, remove, pause, resume, getAll, getAllIncludingPaused, getForDate, getById, ICONS, COLORS };
})();

window.Habits = Habits;
