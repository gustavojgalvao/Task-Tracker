// ============================================================
// ASCEND — Tasks Module (tasks.js)
// Full task lifecycle: CRUD, XP award, sprint locking,
// priority scoring, DDA, project/dependency support
// ============================================================

const Tasks = (() => {
    const db = () => window.supabaseClient;

    // ── In-flight lock (same debounce pattern as logs.js) ─────
    const _inFlight = new Set();

    // Valid task types
    const TASK_TYPES = [
        'simple', 'recurring', 'weighted', 'deadline_bound',
        'dependency_locked', 'project_nested', 'strategic', 'operational', 'sprint_block'
    ];

    const TASK_STATUS = { PENDING: 'pending', IN_PROGRESS: 'in_progress', DONE: 'done', SKIPPED: 'skipped', FAILED: 'failed' };

    /**
     * Create a new task.
     * @param {object} taskData
     * @returns {Promise<object>} created task
     */
    async function create(taskData) {
        const { data: { user } } = await db().auth.getUser();

        // Validation
        if (!taskData.title || taskData.title.trim().length === 0) {
            throw Object.assign(new Error('Título é obrigatório.'), { type: 'VALIDATION_ERROR' });
        }
        if (taskData.weight && (taskData.weight < 1 || taskData.weight > 5)) {
            throw Object.assign(new Error('Peso deve estar entre 1 e 5.'), { type: 'VALIDATION_ERROR' });
        }

        // If dependency_locked, ensure prerequisite exists
        if (taskData.type === 'dependency_locked' && taskData.prerequisite_task_id) {
            const { data: prereq } = await db()
                .from('tasks')
                .select('id, status')
                .eq('id', taskData.prerequisite_task_id)
                .eq('user_id', user.id)
                .single();
            if (!prereq) throw Object.assign(new Error('Tarefa pré-requisito não encontrada.'), { type: 'VALIDATION_ERROR' });
        }

        const { data, error } = await db()
            .from('tasks')
            .insert({
                user_id: user.id,
                title: taskData.title.trim(),
                description: taskData.description || null,
                type: taskData.type || 'simple',
                weight: taskData.weight || 3,
                xp_multiplier: taskData.xp_multiplier || 1.0,
                status: TASK_STATUS.PENDING,
                priority: taskData.priority || 5,
                deadline: taskData.deadline || null,
                recurrence: taskData.recurrence || null,
                project_id: taskData.project_id || null,
                prerequisite_task_id: taskData.prerequisite_task_id || null,
                is_sprint_eligible: taskData.is_sprint_eligible !== false,
                classification: taskData.classification || 'operational',
                created_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (error) throw _wrapError(error);
        return data;
    }

    /**
     * Get all tasks for the current user.
     * @param {object} [filters] - { status, type, classification, project_id }
     */
    async function getAll(filters = {}) {
        const { data: { user } } = await db().auth.getUser();

        let query = db()
            .from('tasks')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (filters.status) query = query.eq('status', filters.status);
        if (filters.type) query = query.eq('type', filters.type);
        if (filters.classification) query = query.eq('classification', filters.classification);
        if (filters.project_id) query = query.eq('project_id', filters.project_id);

        const { data, error } = await query;
        if (error) throw _wrapError(error);
        return data || [];
    }

    /**
     * Get tasks due today or overdue (not done).
     */
    async function getActiveToday() {
        const { data: { user } } = await db().auth.getUser();
        const today = UI.toBRTDateStr(new Date()) + 'T23:59:59';

        const { data, error } = await db()
            .from('tasks')
            .select('*')
            .eq('user_id', user.id)
            .in('status', ['pending', 'in_progress'])
            .or(`deadline.is.null,deadline.lte.${today}`)
            .order('priority', { ascending: false });

        if (error) throw _wrapError(error);
        return data || [];
    }

    /**
     * Get tasks sorted by dynamic priority score.
     * Uses Engine.calcTaskPriority() with current efficiency context.
     * @param {object[]} tasks
     * @param {number} [currentEfficiency] today's efficiency (0-100)
     * @returns {object[]} tasks sorted highest-first
     */
    function sortByPriority(tasks, currentEfficiency = 0) {
        if (!window.Engine) return tasks;
        return [...tasks].sort((a, b) => {
            const pA = Engine.calcTaskPriority(a, currentEfficiency);
            const pB = Engine.calcTaskPriority(b, currentEfficiency);
            return pB - pA;
        });
    }

    /**
     * Mark a task as complete. Awards XP.
     * @param {string} taskId
     * @param {object} [opts] - { sprintMode, streakAligned }
     * @returns {Promise<{ task, xpResult }>}
     */
    async function complete(taskId, opts = {}) {
        if (_inFlight.has(taskId)) {
            throw Object.assign(new Error('Operação em andamento.'), { code: 'DEBOUNCE' });
        }
        _inFlight.add(taskId);

        try {
            const { data: { user } } = await db().auth.getUser();
            const completedAt = new Date().toISOString();

            // Fetch the task to get weight + deadline
            const { data: task, error: fetchErr } = await db()
                .from('tasks')
                .select('*')
                .eq('id', taskId)
                .eq('user_id', user.id)
                .single();

            if (fetchErr || !task) throw Object.assign(new Error('Tarefa não encontrada.'), { type: 'VALIDATION_ERROR' });
            if (task.status === TASK_STATUS.DONE) throw Object.assign(new Error('Tarefa já concluída.'), { type: 'VALIDATION_ERROR' });

            // Check dependency lock
            if (task.prerequisite_task_id) {
                const { data: prereq } = await db()
                    .from('tasks')
                    .select('status')
                    .eq('id', task.prerequisite_task_id)
                    .single();
                if (prereq && prereq.status !== TASK_STATUS.DONE) {
                    throw Object.assign(new Error('Pré-requisito ainda não concluído.'), { type: 'VALIDATION_ERROR' });
                }
            }

            // Calculate XP
            const xpResult = window.Engine
                ? Engine.calcTaskXP(
                    { ...task, completed_at: completedAt },
                    { sprintMode: opts.sprintMode || false, streakAligned: opts.streakAligned || false, xpMultiplier: task.xp_multiplier || 1.0 }
                )
                : { xp: task.weight * 20, lateTier: 0, modifiers: {} };

            const { data: updated, error: updateErr } = await db()
                .from('tasks')
                .update({
                    status: TASK_STATUS.DONE,
                    completed_at: completedAt,
                    xp_earned: xpResult.xp,
                    lateness_tier: xpResult.lateTier,
                })
                .eq('id', taskId)
                .eq('user_id', user.id)
                .select()
                .single();

            if (updateErr) throw _wrapError(updateErr);
            return { task: updated, xpResult };
        } finally {
            _inFlight.delete(taskId);
        }
    }

    /**
     * Revert a task to pending (uncomplete). Deducts XP.
     * @param {string} taskId
     * @returns {Promise<object>} updated task
     */
    async function uncomplete(taskId) {
        if (_inFlight.has(taskId)) {
            throw Object.assign(new Error('Operação em andamento.'), { code: 'DEBOUNCE' });
        }
        _inFlight.add(taskId);

        try {
            const { data: { user } } = await db().auth.getUser();

            const { data: task, error: fetchErr } = await db()
                .from('tasks')
                .select('*')
                .eq('id', taskId)
                .eq('user_id', user.id)
                .single();

            if (fetchErr || !task) throw Object.assign(new Error('Tarefa não encontrada.'), { type: 'VALIDATION_ERROR' });
            if (task.status !== TASK_STATUS.DONE) throw Object.assign(new Error('Tarefa não está concluída.'), { type: 'VALIDATION_ERROR' });

            const { data: updated, error: updateErr } = await db()
                .from('tasks')
                .update({
                    status: TASK_STATUS.PENDING,
                    completed_at: null,
                    xp_earned: 0,
                    lateness_tier: 0,
                })
                .eq('id', taskId)
                .eq('user_id', user.id)
                .select()
                .single();

            if (updateErr) throw _wrapError(updateErr);
            return updated;
        } finally {
            _inFlight.delete(taskId);
        }
    }

    /**
     * Start a task (set status to in_progress).
     */
    async function start(taskId) {
        const { data: { user } } = await db().auth.getUser();
        const { data, error } = await db()
            .from('tasks')
            .update({ status: TASK_STATUS.IN_PROGRESS, started_at: new Date().toISOString() })
            .eq('id', taskId)
            .eq('user_id', user.id)
            .select()
            .single();
        if (error) throw _wrapError(error);
        return data;
    }

    /**
     * Update a task (title, description, weight, deadline, etc).
     */
    async function update(taskId, changes) {
        const { data: { user } } = await db().auth.getUser();
        const { data, error } = await db()
            .from('tasks')
            .update({ ...changes, updated_at: new Date().toISOString() })
            .eq('id', taskId)
            .eq('user_id', user.id)
            .select()
            .single();
        if (error) throw _wrapError(error);
        return data;
    }

    /**
     * Delete a task.
     */
    async function remove(taskId) {
        const { data: { user } } = await db().auth.getUser();
        const { error } = await db()
            .from('tasks')
            .delete()
            .eq('id', taskId)
            .eq('user_id', user.id);
        if (error) throw _wrapError(error);
    }

    /**
     * Skip a task (with optional reason).
     */
    async function skip(taskId) {
        const { data: { user } } = await db().auth.getUser();
        const { data, error } = await db()
            .from('tasks')
            .update({ status: TASK_STATUS.SKIPPED })
            .eq('id', taskId)
            .eq('user_id', user.id)
            .select()
            .single();
        if (error) throw _wrapError(error);
        return data;
    }

    /**
     * Get tasks from the last N days for DDA calculation.
     * @param {number} [days=7]
     */
    async function getRecentForDDA(days = 7) {
        const { data: { user } } = await db().auth.getUser();
        const since = new Date();
        since.setDate(since.getDate() - days);
        const sinceISO = since.toISOString();

        const { data, error } = await db()
            .from('tasks')
            .select('id, status, weight, completed_at')
            .eq('user_id', user.id)
            .in('status', ['done', 'failed', 'skipped'])
            .gte('completed_at', sinceISO)
            .order('completed_at', { ascending: false });

        if (error) throw _wrapError(error);
        return data || [];
    }

    /**
     * Calculate total XP earned from all completed tasks.
     * @param {object[]} tasks
     * @returns {number}
     */
    function calcTotalTaskXP(tasks) {
        return tasks.reduce((sum, t) => sum + (t.xp_earned || 0), 0);
    }

    // ── Sprint Sessions ───────────────────────────────────────

    /**
     * Create a sprint session record.
     * @param {{ planned_duration_minutes, task_ids }} config
     */
    async function startSprint({ planned_duration_minutes, task_ids = [] }) {
        const { data: { user } } = await db().auth.getUser();
        const { data, error } = await db()
            .from('sprint_sessions')
            .insert({
                user_id: user.id,
                started_at: new Date().toISOString(),
                planned_duration_minutes,
                tasks_completed: 0,
                xp_earned: 0,
                focus_score: 0,
                status: 'active',
            })
            .select()
            .single();
        if (error) throw _wrapError(error);
        return data;
    }

    /**
     * End a sprint session and compute focus score.
     * @param {string} sessionId
     * @param {{ tasksCompleted, xpEarned, interruptionCount }} result
     */
    async function endSprint(sessionId, { tasksCompleted, xpEarned, interruptionCount = 0 }) {
        const { data: { user } } = await db().auth.getUser();

        const { data: session } = await db()
            .from('sprint_sessions')
            .select('planned_duration_minutes, started_at')
            .eq('id', sessionId)
            .single();

        const actualMinutes = session
            ? Math.round((Date.now() - new Date(session.started_at).getTime()) / 60000)
            : 0;

        const focusMultiplier = window.Engine
            ? Engine.calcSprintFocusMultiplier(session?.planned_duration_minutes || 25, actualMinutes, interruptionCount)
            : 1.0;

        const { data, error } = await db()
            .from('sprint_sessions')
            .update({
                ended_at: new Date().toISOString(),
                actual_duration_minutes: actualMinutes,
                tasks_completed: tasksCompleted,
                xp_earned: xpEarned,
                focus_score: focusMultiplier,
                interruption_count: interruptionCount,
                status: 'completed',
            })
            .eq('id', sessionId)
            .select()
            .single();

        if (error) throw _wrapError(error);
        return data;
    }

    // ── Helpers ───────────────────────────────────────────────

    function _wrapError(err) {
        if (window.Engine) {
            const classified = Engine.classifyError(err);
            return Object.assign(new Error(classified.userMessage), { type: classified.type, technical: classified.technical });
        }
        return err;
    }

    /**
     * Get lateness tier label string for display.
     * @param {number} tier 0-3
     * @returns {string}
     */
    function getLateLabel(tier) {
        return ['Em dia', 'Atrasado (<24h)', 'Atrasado (1-3 dias)', 'Muito atrasado (>3 dias)'][tier] ?? '';
    }

    /**
     * Get CSS class for task priority badge.
     * @param {number} priorityScore
     */
    function getPriorityClass(priorityScore) {
        if (priorityScore >= 10) return 'critical';
        if (priorityScore >= 7) return 'high';
        if (priorityScore >= 5) return 'medium';
        return 'low';
    }

    /**
     * Get task type icon (Font Awesome class).
     */
    function getTypeIcon(type) {
        const icons = {
            simple: 'fa-check-circle',
            recurring: 'fa-rotate',
            weighted: 'fa-weight-hanging',
            deadline_bound: 'fa-clock',
            dependency_locked: 'fa-lock',
            project_nested: 'fa-folder',
            strategic: 'fa-chess-king',
            operational: 'fa-gear',
            sprint_block: 'fa-bolt',
        };
        return icons[type] || 'fa-check-circle';
    }

    return {
        // Constants
        TASK_TYPES,
        TASK_STATUS,
        // CRUD
        create, getAll, getActiveToday, update, remove,
        // Lifecycle
        complete, start, skip,
        // Analytics
        sortByPriority, getRecentForDDA, calcTotalTaskXP,
        // Sprints
        startSprint, endSprint,
        // Helpers
        getLateLabel, getPriorityClass, getTypeIcon,
    };
})();

window.Tasks = Tasks;
