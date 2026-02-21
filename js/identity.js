// ============================================================
// ASCEND — Identity System Module
// Future version definition + alignment display
// ============================================================

const Identity = (() => {
    const db = () => window.supabaseClient;

    /**
     * Save user's "future version" text and optional strict mode preference
     * @param {string} futureVersion
     * @param {object} [opts]
     */
    async function save(futureVersion, opts = {}) {
        const { data: { user } } = await db().auth.getUser();
        const { data, error } = await db()
            .from('profiles')
            .update({
                future_version: futureVersion,
                ...(opts.strictMode !== undefined && { strict_mode_global: opts.strictMode }),
                ...(opts.publicProfile !== undefined && { public_profile: opts.publicProfile }),
                ...(opts.publicSlug !== undefined && { public_slug: opts.publicSlug }),
            })
            .eq('id', user.id)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Get the current user's profile (includes future_version)
     */
    async function getProfile() {
        const { data: { user } } = await db().auth.getUser();
        const { data, error } = await db()
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Get a public profile by slug
     * @param {string} slug
     */
    async function getPublicProfile(slug) {
        const { data, error } = await db()
            .from('profiles')
            .select('*, id')
            .eq('public_slug', slug)
            .eq('public_profile', true)
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Generate a random slug
     */
    function generateSlug(username) {
        const base = (username || 'ascender').toLowerCase().replace(/[^a-z0-9]/g, '');
        const rand = Math.floor(Math.random() * 9000 + 1000);
        return `${base}${rand}`;
    }

    /**
     * Get alignment label from a percentage
     * @param {number} pct 0-100
     * @returns {{label: string, emoji: string}}
     */
    function getAlignmentLabel(pct) {
        if (pct >= 90) return { label: 'Modo élite', emoji: '🔥' };
        if (pct >= 75) return { label: 'Alta consistência', emoji: '💪' };
        if (pct >= 60) return { label: 'Em evolução', emoji: '📈' };
        if (pct >= 40) return { label: 'Construindo base', emoji: '🧱' };
        if (pct >= 20) return { label: 'Início da jornada', emoji: '🌱' };
        return { label: 'Ainda não começou', emoji: '⚡' };
    }

    /**
     * Update username field
     */
    async function updateUsername(username) {
        const { data: { user } } = await db().auth.getUser();
        const { error } = await db()
            .from('profiles')
            .update({ username })
            .eq('id', user.id);
        if (error) throw error;
    }

    return { save, getProfile, getPublicProfile, generateSlug, getAlignmentLabel, updateUsername };
})();

window.Identity = Identity;
