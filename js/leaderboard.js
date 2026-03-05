// ============================================================
// VITAASCEND — Leaderboard & Friends Module (leaderboard.js)
// Handles global rankings, user search, and social connections.
// ============================================================

const Leaderboard = (() => {
    let currentUser = null;
    let friends = [];

    /**
     * Initialize the leaderboard page.
     */
    async function init() {
        console.log("Leaderboard: Inicializando...");
        const { data: { user } } = await window.supabaseClient.auth.getUser();
        currentUser = user;

        if (!currentUser) return;

        await fetchFriends();
        await renderAll();
        setupEventListeners();
        startSyncTimer();
    }

    /**
     * Real-time countdown to midnight BRT (UTC-3).
     */
    function startSyncTimer() {
        const timerEl = document.getElementById('sync-timer');
        if (!timerEl) return;

        setInterval(() => {
            const now = UI.nowInBRT();
            const tomorrow = new Date(now);
            tomorrow.setDate(now.getDate() + 1);
            tomorrow.setHours(0, 0, 0, 0);

            const diff = tomorrow - now;
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);

            timerEl.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }, 1000);
    }

    /**
     * Fetch the list of friends for the current user.
     */
    async function fetchFriends() {
        try {
            const { data, error } = await window.supabaseClient
                .from('friends')
                .select('friend_id, friend:profiles!friend_id(*)')
                .eq('user_id', currentUser.id);

            if (error) throw error;
            friends = data.map(f => f.friend).filter(Boolean);
        } catch (err) {
            console.error("Erro ao buscar amigos:", err);
        }
    }

    /**
     * Fetch recent global activities from pdl_history.
     */
    async function fetchActivityFeed() {
        try {
            const { data, error } = await window.supabaseClient
                .from('pdl_history')
                .select('change_amount, tier_after, reason, created_at, profiles(username)')
                .order('created_at', { ascending: false })
                .limit(5);

            if (error) throw error;
            return data;
        } catch (err) {
            console.error("Erro ao buscar feed:", err);
            return [];
        }
    }

    /**
     * Fetch user's efficiency trend for the last 7 days.
     */
    async function fetchVelocityTrend() {
        try {
            const { data, error } = await window.supabaseClient
                .from('daily_summary')
                .select('efficiency_percent, date')
                .eq('user_id', currentUser.id)
                .order('date', { ascending: true })
                .limit(7);

            if (error) throw error;
            return data;
        } catch (err) {
            console.error("Erro ao buscar trend:", err);
            return [];
        }
    }

    /**
     * Fetch all users for the global ranking.
     */
    async function fetchGlobalRankings() {
        try {
            const { data: profiles, error } = await window.supabaseClient
                .from('profiles')
                .select('*')
                .order('xp_total', { ascending: false })
                .limit(100);

            if (error) throw error;

            const enriched = profiles.map(p => {
                const scaledPDL = Math.round((p.pdl_current || 0) * 10);
                const tierInfo = Engine.getRankFromPDL(scaledPDL);
                return { ...p, tierIdx: tierInfo.minPDL, displayPDL: scaledPDL };
            });

            enriched.sort((a, b) => {
                if (b.tierIdx !== a.tierIdx) return b.tierIdx - a.tierIdx;
                return (b.displayPDL || 0) - (a.displayPDL || 0);
            });

            return enriched;
        } catch (err) {
            console.error("Erro ao buscar rankings:", err);
            return [];
        }
    }

    /**
     * Search for users by username.
     */
    async function searchUsers(query) {
        if (!query || query.length < 2) return [];
        try {
            const { data, error } = await window.supabaseClient
                .from('profiles')
                .select('*')
                .ilike('username', `%${query}%`)
                .limit(10);

            if (error) throw error;
            return data;
        } catch (err) {
            console.error("Erro na busca:", err);
            return [];
        }
    }

    /**
     * Add a friend.
     */
    async function addFriend(friendId) {
        try {
            const { error } = await window.supabaseClient
                .from('friends')
                .insert([{ user_id: currentUser.id, friend_id: friendId, status: 'accepted' }]);

            if (error) {
                if (error.code === '23505') {
                    UI.toast("Este usuário já é seu amigo.", "info");
                } else {
                    throw error;
                }
            } else {
                UI.toast("Amigo adicionado!", "success");
                await fetchFriends();
                await renderAll();
            }
        } catch (err) {
            UI.toast("Erro ao adicionar amigo.", "error");
            console.error(err);
        }
    }

    /**
     * Remove a friend.
     */
    async function removeFriend(friendId) {
        try {
            const { error } = await window.supabaseClient
                .from('friends')
                .delete()
                .eq('user_id', currentUser.id)
                .eq('friend_id', friendId);

            if (error) throw error;

            UI.toast("Amigo removido.", "info");
            await fetchFriends();
            await renderAll();
        } catch (err) {
            UI.toast("Erro ao remover amigo.", "error");
            console.error(err);
        }
    }

    /**
     * Render the Activity Feed.
     */
    function renderFeed(activities) {
        const container = document.getElementById('activity-feed');
        if (!container) return;

        if (!activities || activities.length === 0) {
            container.innerHTML = `<p class="text-[10px] text-slate-500 italic">Nenhuma atividade recente.</p>`;
            return;
        }

        container.innerHTML = activities.map(act => {
            const user = act.profiles?.username || 'Operador';
            const time = new Date(act.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            let message = '';
            let color = 'emerald';

            if (act.reason === 'gain') {
                message = `obteve <span class="text-primary font-bold">+${act.change_amount} PDL</span>`;
            } else if (act.reason === 'promotion_win') {
                message = `subiu para <span class="text-primary font-bold">${act.tier_after}</span>`;
            } else if (act.reason === 'decay') {
                message = `perdeu PDL por inatividade`;
                color = 'amber';
            } else {
                message = `atualizou seu status`;
            }

            return `
                <div class="flex gap-4 items-center border-l-2 border-${color}-500 pl-4 py-1">
                    <div class="text-xs">
                        <p class="font-bold text-slate-200"><span class="text-primary">${user}</span> ${message}</p>
                        <p class="text-[9px] text-slate-500 font-black uppercase mt-1">HOJE ÀS ${time}</p>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Render the Velocity Trend sparkline.
     */
    function renderTrend(summaries) {
        const container = document.getElementById('trend-bars');
        if (!container) return;

        const dailyEff = new Array(7).fill(10);
        summaries.forEach((s, i) => {
            if (i < 7) dailyEff[i] = Math.max(10, s.efficiency_percent || 0);
        });

        container.innerHTML = dailyEff.map((eff, i) => {
            const opacity = 30 + (i * 10);
            const isLast = i === dailyEff.length - 1;
            return `
                <div class="flex-1 ${isLast ? 'bg-primary' : `bg-primary/${opacity}`} rounded transition-all hover:scale-y-110" 
                     style="height: ${eff}%; ${isLast ? 'box-shadow: 0 0 15px rgba(13,89,242,0.3);' : ''}"></div>
            `;
        }).join('');
    }

    /**
     * Render the main leaderboard table.
     */
    async function renderLeaderboard(profiles, mode = 'global') {
        const body = document.getElementById('leaderboard-body');
        if (!body) return;

        if (!profiles) {
            if (mode === 'daily') {
                const today = UI.todayStr();
                const { data } = await window.supabaseClient
                    .from('daily_summary')
                    .select('xp_total_day, profiles(*)')
                    .eq('date', today)
                    .order('xp_total_day', { ascending: false })
                    .limit(50);

                profiles = (data || []).filter(d => d.profiles).map(d => ({ ...d.profiles, xp_today: d.xp_total_day }));
            } else {
                profiles = await fetchGlobalRankings();
            }
        }

        body.innerHTML = (profiles || []).map((p, i) => {
            const isMe = p.id === currentUser.id;
            const isFriend = friends.some(f => f.id === p.id);
            const scaledPDL = Math.round((p.pdl_current || 0) * 10);
            const tierInfo = Engine.getRankFromPDL(scaledPDL);
            const localPDL = Engine.getLocalPDL(scaledPDL);
            const level = Engine.calcLevel(p.xp_total || 0);
            const rankPos = i + 1;
            const score = mode === 'daily' ? (p.xp_today || 0) : localPDL.value;

            let posHTML = `<div class="size-8 rounded-full bg-slate-200 dark:bg-slate-700/50 flex items-center justify-center font-black italic border border-slate-300 dark:border-slate-600">${rankPos}</div>`;
            if (rankPos === 1) posHTML = `<div class="size-8 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center font-black italic border border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.2)]">1</div>`;
            if (rankPos === 2) posHTML = `<div class="size-8 rounded-full bg-slate-300/10 text-slate-400 flex items-center justify-center font-black italic border border-slate-400/20">2</div>`;
            if (rankPos === 3) posHTML = `<div class="size-8 rounded-full bg-orange-500/10 text-orange-500 flex items-center justify-center font-black italic border border-orange-500/20">3</div>`;

            return `
                <tr class="${isMe ? 'rank-row-user' : ''} hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                    <td class="px-8 py-5">
                        <div class="flex justify-center">${posHTML}</div>
                    </td>
                    <td class="px-8 py-5">
                        <div class="flex items-center gap-4">
                            <div class="size-10 rounded-xl bg-slate-200 dark:bg-slate-700 overflow-hidden group-hover:scale-110 transition-transform flex items-center justify-center">
                                <img src="https://i.pravatar.cc/100?u=${p.id}" class="size-full object-cover">
                            </div>
                            <div>
                                <p class="font-bold text-sm tracking-tight ${isMe ? 'text-primary' : ''}">${p.username || 'Operador Anônimo'}${isMe ? ' (Você)' : ''}</p>
                                <p class="text-[10px] font-black uppercase opacity-70" style="color: ${tierInfo.color}">
                                    ${mode === 'daily' ? `XP Ganhos` : `Lv. ${level} ${tierInfo.label} ${tierInfo.division}`}
                                </p>
                            </div>
                        </div>
                    </td>
                    <td class="px-8 py-5 text-right font-mono font-black text-sm tabular-nums text-slate-700 dark:text-slate-300">
                        ${score.toLocaleString()} ${mode === 'daily' ? 'XP' : ''}
                    </td>
                    <td class="px-8 py-5 text-right">
                        ${!isMe ? `
                            <button onclick="Leaderboard.${isFriend ? 'removeFriend' : 'addFriend'}('${p.id}')" 
                                    class="size-8 rounded-lg flex items-center justify-center transition-all ${isFriend ? 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white' : 'bg-primary/10 text-primary hover:bg-primary hover:text-white'}">
                                <i class="fa-solid ${isFriend ? 'fa-user-minus' : 'fa-user-plus'} text-xs"></i>
                            </button>
                        ` : ''}
                    </td>
                </tr>
            `;
        }).join('');
    }

    /**
     * Render the "Squad" sidebar.
     */
    function renderSquadSidebar() {
        const container = document.getElementById('squad-list');
        if (!container) return;

        if (friends.length === 0) {
            container.innerHTML = `<p class="text-[10px] text-slate-500 italic">Sua squad está vazia. Adicione amigos no ranking!</p>`;
            return;
        }

        container.innerHTML = friends.map(f => {
            const scaledPDL = Math.round((f.pdl_current || 0) * 10);
            const tierInfo = Engine.getRankFromPDL(scaledPDL);
            return `
                <div class="flex items-center justify-between text-xs p-2 rounded-xl hover:bg-white/5 transition-colors group">
                    <div class="flex items-center gap-3">
                        <div class="size-6 rounded bg-slate-700 flex items-center justify-center overflow-hidden">
                            <img src="https://i.pravatar.cc/100?u=${f.id}" class="size-full object-cover">
                        </div>
                        <span class="font-bold text-slate-300 group-hover:text-white transition-colors">${f.username || 'Operador'}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="font-mono font-black text-primary" style="color:${tierInfo.color}">${Engine.getLocalPDL(scaledPDL).value.toLocaleString()}</span>
                        <button onclick="Leaderboard.removeFriend('${f.id}')" class="opacity-0 group-hover:opacity-100 text-red-500 transition-all">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Render all components.
     */
    async function renderAll() {
        await renderLeaderboard();
        renderSquadSidebar();
        await renderStats();

        const feedData = await fetchActivityFeed();
        renderFeed(feedData);

        const trendData = await fetchVelocityTrend();
        renderTrend(trendData);
    }

    /**
     * Render top stats cards.
     */
    async function renderStats() {
        const { data: profile } = await window.supabaseClient.from('profiles').select('*').eq('id', currentUser.id).single();
        if (!profile) return;

        const scaledPDL = Math.round((profile.pdl_current || 0) * 10);
        const tierInfo = Engine.getRankFromPDL(scaledPDL);
        const localPDL = Engine.getLocalPDL(scaledPDL);

        UI.setText('#current-rank-label', (`${tierInfo.label} ${tierInfo.division}`).trim());
        UI.setText('#pdl-score-label', localPDL.value.toLocaleString());

        // Real Percentile
        const { count: totalUsers } = await window.supabaseClient.from('profiles').select('*', { count: 'exact', head: true });
        const { count: usersAbove } = await window.supabaseClient
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .or(`pdl_current.gt.${profile.pdl_current || 0}, and(pdl_current.eq.${profile.pdl_current || 0}, xp_total.gt.${profile.xp_total || 0})`);

        const position = (usersAbove || 0) + 1;
        const percentile = totalUsers > 0 ? ((position / totalUsers) * 100).toFixed(1) : "0.0";

        UI.setText('#global-pos-label', `#${position}`);

        // Update Nav Info
        UI.setText('#nav-user-name', profile.username || 'Operador');
        UI.setText('#nav-user-rank', (`${tierInfo.label} ${tierInfo.division}`).trim());

        const rankSub = document.querySelector('#current-rank-label')?.nextElementSibling;
        if (rankSub) rankSub.innerHTML = `<span class="material-symbols-outlined text-sm">trending_up</span> Top ${percentile}% dos usuários`;

        // PDL Gain Today (simplified from profile)
        const pdlGain = (profile.pdl_current || 0) - (profile.pdl_yesterday || profile.pdl_current || 0);
        const gainEl = document.querySelector('#pdl-score-label')?.nextElementSibling;
        if (gainEl) {
            gainEl.textContent = `${pdlGain >= 0 ? '+' : ''}${pdlGain} pts hoje`;
            gainEl.className = `${pdlGain >= 0 ? 'text-emerald-500' : 'text-red-500'} text-[10px] font-black uppercase mt-2`;
        }
    }

    /**
     * Setup event listeners for the page.
     */
    function setupEventListeners() {
        // Search
        const searchInput = document.getElementById('user-search');
        if (searchInput) {
            let timeout = null;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(timeout);
                timeout = setTimeout(async () => {
                    const query = e.target.value;
                    if (query.length >= 2) {
                        const results = await searchUsers(query);
                        renderLeaderboard(results);
                    } else if (query.length === 0) {
                        renderLeaderboard();
                    }
                }, 300);
            });
        }

        // Toggles
        const btnDaily = document.getElementById('btn-daily');
        const btnGlobal = document.getElementById('btn-global');

        if (btnDaily && btnGlobal) {
            btnDaily.onclick = () => {
                btnDaily.classList.add('bg-white', 'dark:bg-slate-700', 'shadow-sm');
                btnDaily.classList.remove('text-slate-500');
                btnGlobal.classList.remove('bg-white', 'dark:bg-slate-700', 'shadow-sm');
                btnGlobal.classList.add('text-slate-500');
                renderLeaderboard(null, 'daily');
            };
            btnGlobal.onclick = () => {
                btnGlobal.classList.add('bg-white', 'dark:bg-slate-700', 'shadow-sm');
                btnGlobal.classList.remove('text-slate-500');
                btnDaily.classList.remove('bg-white', 'dark:bg-slate-700', 'shadow-sm');
                btnDaily.classList.add('text-slate-500');
                renderLeaderboard(null, 'global');
            };
        }
    }

    return {
        init,
        addFriend,
        removeFriend
    };
})();

window.Leaderboard = Leaderboard;
