// ============================================================
// ASCEND — Habits CRUD Module
// ============================================================

const Habits = (() => {
    const db = () => window.supabaseClient;

    const ICONS = [
        'fa-solid fa-bolt',
        'fa-solid fa-dumbbell',
        'fa-solid fa-book',
        'fa-solid fa-spa',
        'fa-solid fa-laptop-code',
        'fa-solid fa-person-running',
        'fa-solid fa-bullseye',
        'fa-solid fa-pencil',
        'fa-solid fa-guitar',
        'fa-solid fa-leaf',
        'fa-solid fa-pills',
        'fa-solid fa-brain',
        'fa-solid fa-bicycle',
        'fa-solid fa-apple-whole',
        'fa-solid fa-bed',
        'fa-solid fa-book-open',
        'fa-solid fa-hand-fist',
        'fa-solid fa-palette',
        'fa-solid fa-flask',
        'fa-solid fa-fire',
        'fa-solid fa-heart-pulse',
        'fa-solid fa-droplet',
        'fa-solid fa-sun',
        'fa-solid fa-moon',
        'fa-solid fa-music',
        'fa-solid fa-code',
        'fa-solid fa-trophy',
        'fa-solid fa-star',
        'fa-solid fa-chart-line',
        'fa-solid fa-graduation-cap',
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
     * Get all active habits for the current user
     */
    async function getAll() {
        const { data, error } = await db()
            .from('habits')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data || [];
    }

    /**
     * Get habits that apply to a specific date (day of week aware)
     * @param {Date} date
     */
    async function getForDate(date) {
        const all = await getAll();
        const dayOfWeek = date.getDay(); // 0=Sun .. 6=Sat

        return all.filter(habit => {
            if (habit.frequency === 'daily') return true;
            if (habit.frequency === 'weekly' && Array.isArray(habit.days_of_week)) {
                return habit.days_of_week.includes(dayOfWeek);
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

    return { create, update, remove, getAll, getForDate, getById, ICONS, COLORS };
})();

window.Habits = Habits;
