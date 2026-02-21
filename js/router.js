// ============================================================
// ASCEND — Router / Route Protection
// Protects pages requiring auth; redirects if needed
// ============================================================

const Router = (() => {

    // Pages that require authentication
    const PROTECTED_PAGES = ['dashboard.html', 'habits.html', 'analytics.html'];
    // Pages only for unauthenticated users
    const PUBLIC_ONLY_PAGES = ['auth.html'];

    async function init() {
        const path = window.location.pathname;
        const page = path.split('/').pop() || 'index.html';

        let session = null;
        try {
            session = await Auth.getSession();
        } catch (e) {
            console.error('Router: session check failed', e);
        }

        const isProtected = PROTECTED_PAGES.some(p => page.includes(p));
        const isPublicOnly = PUBLIC_ONLY_PAGES.some(p => page.includes(p));

        if (isProtected && !session) {
            window.location.replace('auth.html');
            return false;
        }

        if (isPublicOnly && session) {
            window.location.replace('dashboard.html');
            return false;
        }

        return true;
    }

    /**
     * Navigate to a page
     */
    function go(page) {
        window.location.href = page;
    }

    return { init, go };
})();

window.Router = Router;
