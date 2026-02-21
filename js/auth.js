// ============================================================
// ASCEND — Authentication Module
// Handles: signup, login, Google OAuth, sign out, session
// ============================================================

const Auth = (() => {
    const db = () => window.supabaseClient;

    /**
     * Sign up with email and password
     * @param {string} email
     * @param {string} password
     * @param {string} [username]
     */
    async function signUp(email, password, username = '') {
        const { data, error } = await db().auth.signUp({
            email,
            password,
            options: {
                data: { full_name: username || email.split('@')[0] }
            }
        });

        if (error) throw error;
        return data;
    }

    /**
     * Sign in with email and password
     */
    async function signIn(email, password) {
        const { data, error } = await db().auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data;
    }

    /**
     * Sign in with Google OAuth
     */
    async function signInWithGoogle() {
        const { data, error } = await db().auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/dashboard.html`
            }
        });
        if (error) throw error;
        return data;
    }

    /**
     * Sign out current user
     */
    async function signOut() {
        const { error } = await db().auth.signOut();
        if (error) throw error;
        window.location.href = '/index.html';
    }

    /**
     * Get current session (null if not authenticated)
     */
    async function getSession() {
        const { data: { session } } = await db().auth.getSession();
        return session;
    }

    /**
     * Get current user (null if not authenticated)
     */
    async function getUser() {
        const { data: { user } } = await db().auth.getUser();
        return user;
    }

    /**
     * Listen to auth state changes
     * @param {function} callback - receives (event, session)
     */
    function onAuthChange(callback) {
        return db().auth.onAuthStateChange(callback);
    }

    /**
     * Update user password
     */
    async function updatePassword(newPassword) {
        const { data, error } = await db().auth.updateUser({ password: newPassword });
        if (error) throw error;
        return data;
    }

    /**
     * Send password reset email
     */
    async function resetPassword(email) {
        const { data, error } = await db().auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/auth.html?mode=reset`
        });
        if (error) throw error;
        return data;
    }

    return { signUp, signIn, signInWithGoogle, signOut, getSession, getUser, onAuthChange, updatePassword, resetPassword };
})();

window.Auth = Auth;
