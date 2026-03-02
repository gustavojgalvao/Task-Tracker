// ============================================================
// ASCEND — Engine Test Suite (engine.test.js)
// Pure JS — no framework. Run in browser console or Node.js.
//
// Usage (browser): load engine.js first, then run:
//   window.EngineTest.runAll()
//
// Usage (Node):
//   const Engine = require('./engine.js'); // (if using CommonJS export)
//   const EngineTest = require('./engine.test.js');
//   EngineTest.runAll();
// ============================================================

const EngineTest = (() => {

    let passed = 0;
    let failed = 0;
    const failures = [];

    function assert(condition, label) {
        if (condition) {
            passed++;
            console.log(`  ✓ ${label}`);
        } else {
            failed++;
            failures.push(label);
            console.error(`  ✗ FAIL: ${label}`);
        }
    }

    function assertEqual(a, b, label) {
        assert(a === b, `${label} (expected ${JSON.stringify(b)}, got ${JSON.stringify(a)})`);
    }

    function approxEqual(a, b, eps = 0.01, label) {
        assert(Math.abs(a - b) <= eps, `${label} (expected ~${b}, got ${a})`);
    }

    // ── XP Tier Tests ─────────────────────────────────────────
    function testXPTiers() {
        console.group('XP Tier System');
        assertEqual(Engine.calcHabitXP(1, false), 10, 'Weight 1 → 10 XP');
        assertEqual(Engine.calcHabitXP(2, false), 25, 'Weight 2 → 25 XP');
        assertEqual(Engine.calcHabitXP(3, false), 50, 'Weight 3 → 50 XP');
        assertEqual(Engine.calcHabitXP(4, false), 75, 'Weight 4 → 75 XP');
        assertEqual(Engine.calcHabitXP(5, false), 100, 'Weight 5 → 100 XP');
        // Penalty
        assertEqual(Engine.calcHabitXP(1, true), 5, 'Weight 1 late → 5 XP (50% penalty)');
        assertEqual(Engine.calcHabitXP(5, true), 50, 'Weight 5 late → 50 XP (50% penalty)');
        // Min XP (weight 1 penalty: floor(10 * 0.5) = 5, not 1)
        assert(Engine.calcHabitXP(1, true) >= 1, 'Min XP is always >= 1');
        // Out-of-range weight clamping
        assertEqual(Engine.calcHabitXP(0, false), 10, 'Weight 0 clamps to tier 1 → 10 XP');
        assertEqual(Engine.calcHabitXP(9, false), 100, 'Weight 9 clamps to tier 5 → 100 XP');
        console.groupEnd();
    }

    // ── Max Daily XP ──────────────────────────────────────────
    function testMaxDailyXP() {
        console.group('Max Daily XP');
        const habits = [{ weight: 1 }, { weight: 3 }, { weight: 5 }];
        assertEqual(Engine.calcMaxDailyXP(habits), 160, '1+3+5 → 10+50+100 = 160 XP max');
        assertEqual(Engine.calcMaxDailyXP([]), 0, 'Empty habits → 0 XP max');
        console.groupEnd();
    }

    // ── Level Progression Tests ───────────────────────────────
    function testLevelProgression() {
        console.group('Level Progression');
        // Level thresholds
        assertEqual(Engine.xpForLevel(1), 0, 'Level 1 starts at 0 XP');
        assert(Engine.xpForLevel(2) > 0, 'Level 2 requires XP > 0');
        assert(Engine.xpForLevel(5) > Engine.xpForLevel(4), 'Each level requires more XP');
        assert(Engine.xpForLevel(10) > Engine.xpForLevel(9), 'Exponential growth');

        // Level calculation from XP
        assertEqual(Engine.calcLevel(0), 1, '0 XP → Level 1');
        assertEqual(Engine.calcLevel(99), 1, '99 XP → Level 1');
        assertEqual(Engine.calcLevel(100), 2, '100 XP → Level 2');
        assert(Engine.calcLevel(Engine.xpForLevel(5)) >= 5, 'xpForLevel(5) XP → at least Level 5');
        assert(Engine.calcLevel(Engine.xpForLevel(10)) >= 10, 'xpForLevel(10) XP → at least Level 10');

        // getLevelProgress
        const prog1 = Engine.getLevelProgress(0);
        assertEqual(prog1.level, 1, 'getLevelProgress(0).level = 1');
        assertEqual(prog1.currentLevelXP, 0, 'getLevelProgress(0).currentLevelXP = 0');

        const atLvl2 = Engine.xpForLevel(2);
        const prog2 = Engine.getLevelProgress(atLvl2);
        assertEqual(prog2.level, 2, 'getLevelProgress(xpForLevel(2)).level = 2');
        assertEqual(prog2.currentLevelXP, 0, 'At exact level start, 0 progress within level');

        // xpToNextLevel
        assert(Engine.xpToNextLevel(1) === 100, 'Level 1 → next needs 100 XP');
        assert(Engine.xpToNextLevel(10) > Engine.xpToNextLevel(1), 'Higher levels need more XP');
        console.groupEnd();
    }

    // ── Rank System Tests ─────────────────────────────────────
    function testRankSystem() {
        console.group('Rank System');
        assertEqual(Engine.getRank(1).id, 'initiate', 'Level 1 → Initiate');
        assertEqual(Engine.getRank(4).id, 'initiate', 'Level 4 → Initiate');
        assertEqual(Engine.getRank(5).id, 'ascender', 'Level 5 → Ascender');
        assertEqual(Engine.getRank(9).id, 'ascender', 'Level 9 → Ascender');
        assertEqual(Engine.getRank(10).id, 'elite', 'Level 10 → Elite');
        assertEqual(Engine.getRank(14).id, 'elite', 'Level 14 → Elite');
        assertEqual(Engine.getRank(15).id, 'sovereign', 'Level 15 → Sovereign');
        assertEqual(Engine.getRank(19).id, 'sovereign', 'Level 19 → Sovereign');
        assertEqual(Engine.getRank(20).id, 'legend', 'Level 20 → Legend');
        assertEqual(Engine.getRank(50).id, 'legend', 'Level 50 → Legend');

        // getRankFromXP
        assertEqual(Engine.getRankFromXP(0).id, 'initiate', '0 XP → Initiate rank');
        const lvl5XP = Engine.xpForLevel(5);
        assertEqual(Engine.getRankFromXP(lvl5XP).id, 'ascender', 'Level 5 XP → Ascender rank');
        console.groupEnd();
    }

    // ── Efficiency Tests ──────────────────────────────────────
    function testEfficiency() {
        console.group('Daily Efficiency');
        const habits = [{ weight: 2 }, { weight: 3 }]; // max = 25 + 50 = 75 XP

        // All completed, no penalty
        const logs = [
            { habit_id: '1', completed: true, weight: 2, penalty_applied: false },
            { habit_id: '2', completed: true, weight: 3, penalty_applied: false },
        ];
        assertEqual(Engine.calcDailyEfficiency(logs, habits), 100, '100% efficiency when all done');

        // None completed
        const noLogs = [
            { habit_id: '1', completed: false, weight: 2, penalty_applied: false },
        ];
        assertEqual(Engine.calcDailyEfficiency(noLogs, habits), 0, '0% efficiency when none done');

        // Partial
        const partial = [
            { habit_id: '1', completed: true, weight: 2, penalty_applied: false },
        ];
        const eff = Engine.calcDailyEfficiency(partial, habits);
        // Weight 2 → 25 XP / 75 XP max = 33%
        approxEqual(eff, 33, 3, 'Partial completion ~33% efficiency');

        // Empty habits
        assertEqual(Engine.calcDailyEfficiency([], []), 0, 'Empty habits → 0% efficiency');
        console.groupEnd();
    }

    // ── Streak Threshold Tests ────────────────────────────────
    function testStreakThreshold() {
        console.group('Streak Efficiency Threshold');
        assertEqual(Engine.STREAK_THRESHOLD, 50, 'Streak threshold is 50%');
        assert(Engine.dayQualifiesForStreak(50), '50% qualifies');
        assert(Engine.dayQualifiesForStreak(100), '100% qualifies');
        assert(!Engine.dayQualifiesForStreak(49), '49% does NOT qualify');
        assert(!Engine.dayQualifiesForStreak(0), '0% does NOT qualify');
        console.groupEnd();
    }

    // ── PDL Tests ─────────────────────────────────────────────
    function testPDL() {
        console.group('PDL Calculation');
        const perfect = Array.from({ length: 30 }, () => ({ efficiency: 100 }));
        approxEqual(Engine.calcPDL(perfect), 1.0, 0.001, '100% every day → PDL 1.00');

        const zero = Array.from({ length: 30 }, () => ({ efficiency: 0 }));
        approxEqual(Engine.calcPDL(zero), 0.0, 0.001, '0% every day → PDL 0.00');

        const half = Array.from({ length: 30 }, () => ({ efficiency: 50 }));
        approxEqual(Engine.calcPDL(half), 0.5, 0.001, '50% every day → PDL 0.50');

        assertEqual(Engine.calcPDL([]), 0, 'Empty → PDL 0');
        console.groupEnd();
    }

    // ── Decay Tests ───────────────────────────────────────────
    function testDecay() {
        console.group('Decay Mechanism');
        assertEqual(Engine.DECAY_THRESHOLD, 20, 'Decay threshold is 20%');
        approxEqual(Engine.DECAY_RATE, 0.10, 0.001, 'Decay rate is 10%');

        // Trigger: 3 consecutive days < 20%
        const triggering = [
            { efficiency: 5 }, { efficiency: 10 }, { efficiency: 15 }
        ];
        assert(Engine.shouldTriggerDecay(triggering), '3 days below 20% triggers decay');

        // No trigger: last 3 are not all below threshold
        const notTriggering = [
            { efficiency: 5 }, { efficiency: 10 }, { efficiency: 25 }
        ];
        assert(!Engine.shouldTriggerDecay(notTriggering), 'Last day at 25% does NOT trigger decay');

        // No trigger: insufficient data
        assert(!Engine.shouldTriggerDecay([{ efficiency: 5 }, { efficiency: 5 }]), 'Need at least 3 days');

        // XP decay math
        assertEqual(Engine.applyDecay(100), 90, '100 XP → 90 XP after decay (-10%)');
        assertEqual(Engine.applyDecay(1000), 900, '1000 XP → 900 XP after decay');
        assertEqual(Engine.applyDecay(0), 0, '0 XP stays 0 after decay');
        assertEqual(Engine.calcDecayAmount(100), 10, 'Decay amount for 100 XP is 10');
        console.groupEnd();
    }

    // ── Day Snapshot Tests ────────────────────────────────────
    function testDaySnapshot() {
        console.group('Day Snapshot');
        const habits = [{ weight: 2 }, { weight: 3 }];
        const logs = [
            { completed: true, weight: 2, penalty_applied: false },
            { completed: true, weight: 3, penalty_applied: false },
        ];
        const snap = Engine.buildDaySnapshot('2026-01-01', logs, habits);
        assertEqual(snap.date, '2026-01-01', 'Snapshot preserves date');
        assertEqual(snap.habitsTotal, 2, 'habitsTotal = 2');
        assertEqual(snap.habitsCompleted, 2, 'habitsCompleted = 2');
        assertEqual(snap.xpEarned, 75, 'xpEarned = 25 + 50 = 75');
        assertEqual(snap.efficiency, 100, 'efficiency = 100%');
        assert(snap.streakQualifies, 'streakQualifies = true at 100%');

        const emptySnap = Engine.buildDaySnapshot('2026-01-02', [], habits);
        assertEqual(emptySnap.xpEarned, 0, 'Empty logs → 0 XP');
        assertEqual(emptySnap.efficiency, 0, 'Empty logs → 0% efficiency');
        assert(!emptySnap.streakQualifies, 'Empty logs → streak does not qualify');
        console.groupEnd();
    }

    // ── Rolling Average Tests ─────────────────────────────────
    function testRollingAverage() {
        console.group('Rolling Average');
        const snaps = Array.from({ length: 10 }, (_, i) => ({
            date: `2026-01-${String(i + 1).padStart(2, '0')}`,
            efficiency: (i + 1) * 10 // 10, 20, 30... 100
        }));
        const rolling = Engine.calcRollingAverage(snaps, 7);
        assertEqual(rolling.length, 10, 'Same length as input');
        // First entry has only 1 sample
        assertEqual(rolling[0].rollingAvg, 10, 'First rolling avg = first value');
        // Entry at index 6 (7th, window=7) should avg 10-70 → avg 40
        approxEqual(rolling[6].rollingAvg, 40, 0.5, '7-day avg at index 6 = 40%');
        console.groupEnd();
    }

    // ── Trend Tests ───────────────────────────────────────────
    function testTrend() {
        console.group('Trend (Linear Regression)');
        const flatSnaps = Array.from({ length: 7 }, () => ({ efficiency: 50 }));
        approxEqual(Engine.calcTrend(flatSnaps), 0, 0.01, 'Flat series → 0 slope');

        // Perfectly increasing: 0, 10, 20, 30, 40, 50, 60
        const risingSnaps = Array.from({ length: 7 }, (_, i) => ({ efficiency: i * 10 }));
        assert(Engine.calcTrend(risingSnaps) > 0, 'Rising series → positive slope');

        const fallingSnaps = Array.from({ length: 7 }, (_, i) => ({ efficiency: 60 - i * 10 }));
        assert(Engine.calcTrend(fallingSnaps) < 0, 'Falling series → negative slope');

        assertEqual(Engine.calcTrend([{ efficiency: 50 }]), 0, 'Single snapshot → 0 slope');
        console.groupEnd();
    }

    // ── Volatility Tests ──────────────────────────────────────
    function testVolatility() {
        console.group('Volatility (Std Dev)');
        const stable = Array.from({ length: 7 }, () => ({ efficiency: 70 }));
        approxEqual(Engine.calcVolatility(stable), 0, 0.1, 'Stable series → 0 volatility');

        const volatile = [
            { efficiency: 0 }, { efficiency: 100 }, { efficiency: 0 }, { efficiency: 100 }
        ];
        assert(Engine.calcVolatility(volatile) > 40, 'High-swing series → high volatility');
        console.groupEnd();
    }

    // ── Streak Risk Detection Tests ───────────────────────────
    function testStreakRisk() {
        console.group('Streak Risk Detection');
        const safe7 = Array.from({ length: 7 }, () => ({ streakQualifies: true }));
        assertEqual(Engine.detectStreakRisk(safe7).severity, 'safe', 'All qualifying → safe');

        const warn = [
            { streakQualifies: true }, { streakQualifies: true }, { streakQualifies: true },
            { streakQualifies: true }, { streakQualifies: false }, { streakQualifies: false }, { streakQualifies: true }
        ];
        // 2 of last 3 fail = warning
        // check: last 3 = [false, false, true] → 2 fails → warning
        assert(['warning'].includes(Engine.detectStreakRisk(warn).severity), '2 of last 3 fail → warning');

        const critical = [
            { streakQualifies: true }, { streakQualifies: true }, { streakQualifies: true },
            { streakQualifies: true }, { streakQualifies: false }, { streakQualifies: false }, { streakQualifies: false }
        ];
        assertEqual(Engine.detectStreakRisk(critical).severity, 'critical', '3 consecutive fails → critical');

        assertEqual(Engine.detectStreakRisk([]).severity, 'safe', 'Empty → safe');
        console.groupEnd();
    }

    // ── Multi-day Scenario: 5 days inactivity → check decay ──
    function testMultiDayInactivity() {
        console.group('Multi-day Scenario: Inactivity');
        const inactiveDays = Array.from({ length: 5 }, () => ({ efficiency: 0 }));
        // Should trigger decay (last 3 all 0%)
        assert(Engine.shouldTriggerDecay(inactiveDays), '5 days inactivity → decay triggered');
        // XP decay on 500 XP
        assertEqual(Engine.applyDecay(500), 450, '500 XP decays to 450 after inactivity');
        console.groupEnd();
    }

    // ── Multi-day Scenario: Underperformance ──────────────────
    function testMultiDayUnderperformance() {
        console.group('Multi-day Scenario: Underperformance (20-49%)');
        const underperform = Array.from({ length: 7 }, () => ({ efficiency: 35 }));
        // 35% > 20% so no decay
        assert(!Engine.shouldTriggerDecay(underperform), '35% efficiency → no decay');
        // But does not qualify for streak (< 50%)
        assert(!Engine.dayQualifiesForStreak(35), '35% → streak day does not qualify');
        console.groupEnd();
    }

    // ── Multi-day Scenario: Full completion ───────────────────
    function testMultiDayFullCompletion() {
        console.group('Multi-day Scenario: Full Completion');
        const perfDays = Array.from({ length: 7 }, () => ({ efficiency: 100 }));
        assert(!Engine.shouldTriggerDecay(perfDays), 'Full completion → no decay');
        assert(Engine.dayQualifiesForStreak(100), 'Full completion → streak qualifies');
        const pdl = Engine.calcPDL(perfDays.map(d => ({ efficiency: d.efficiency })));
        approxEqual(pdl, 1.0, 0.01, 'Perfect week → PDL 1.00');
        console.groupEnd();
    }

    // ── Multi-day Scenario: Rapid burst then stop ─────────────
    function testMultiDayBurstThenStop() {
        console.group('Multi-day Scenario: Burst then Stop');
        // 4 days perfect, then 3 days zero
        const burst = [
            { efficiency: 100 }, { efficiency: 100 }, { efficiency: 100 }, { efficiency: 100 },
            { efficiency: 0 }, { efficiency: 0 }, { efficiency: 0 }
        ];
        // Last 3 are all 0% → decay triggers
        assert(Engine.shouldTriggerDecay(burst), 'Burst then 3-day zero → decay triggers');
        // Streak risk is critical (3 consecutive fails)
        const snaps = burst.map(d => ({ streakQualifies: d.efficiency >= 50 }));
        assertEqual(Engine.detectStreakRisk(snaps).severity, 'critical', 'Burst-then-stop → critical risk');
        console.groupEnd();
    }

    // ── Error Classification Tests ────────────────────────────
    function testErrorClassification() {
        console.group('Error Classification');
        const netErr = Engine.classifyError({ message: 'Failed to fetch' });
        assertEqual(netErr.type, Engine.ERROR_TYPES.NETWORK, 'Fetch error → NETWORK_ERROR');

        const authErr = Engine.classifyError({ message: 'JWT expired', status: 401 });
        assertEqual(authErr.type, Engine.ERROR_TYPES.AUTH, 'JWT error → AUTH_ERROR');

        const dupErr = Engine.classifyError({ message: 'duplicate key', code: 409 });
        assertEqual(dupErr.type, Engine.ERROR_TYPES.DB, 'Duplicate key → DB_ERROR');

        const validErr = Engine.classifyError({ message: 'validation failed', status: 422 });
        assertEqual(validErr.type, Engine.ERROR_TYPES.VALIDATION, '422 → VALIDATION_ERROR');

        // All typed errors have user-facing messages
        [netErr, authErr, dupErr, validErr].forEach(e => {
            assert(typeof e.userMessage === 'string' && e.userMessage.length > 0, `${e.type} has userMessage`);
        });
        console.groupEnd();
    }

    // ── Projection Tests ──────────────────────────────────────
    function testProjection() {
        console.group('Efficiency Projection');
        const snaps = Array.from({ length: 7 }, (_, i) => ({
            date: `2026-01-${String(i + 1).padStart(2, '0')}`,
            efficiency: 70 // flat
        }));
        const proj = Engine.projectEfficiency(snaps, 7);
        assertEqual(proj.length, 7, '7-day projection has 7 entries');
        // Flat series → all projected at ~70
        proj.forEach(p => approxEqual(p.projected, 70, 3, `Flat series projection ~70% on ${p.date}`));
        console.groupEnd();
    }

    // ── Run All ───────────────────────────────────────────────
    function runAll() {
        passed = 0; failed = 0; failures.length = 0;
        console.group('🧪 ASCEND Engine Test Suite');

        if (typeof Engine === 'undefined') {
            console.error('ERROR: Engine module not loaded. Load js/engine.js first.');
            console.groupEnd();
            return;
        }

        testXPTiers();
        testMaxDailyXP();
        testLevelProgression();
        testRankSystem();
        testEfficiency();
        testStreakThreshold();
        testPDL();
        testDecay();
        testDaySnapshot();
        testRollingAverage();
        testTrend();
        testVolatility();
        testStreakRisk();
        testMultiDayInactivity();
        testMultiDayUnderperformance();
        testMultiDayFullCompletion();
        testMultiDayBurstThenStop();
        testErrorClassification();
        testProjection();

        console.groupEnd();
        console.log('');
        const total = passed + failed;
        if (failed === 0) {
            console.log(`%c✅ ALL ${total} TESTS PASSED`, 'color:#22c55e;font-weight:bold;font-size:14px;');
        } else {
            console.error(`❌ ${failed}/${total} TESTS FAILED`);
            console.error('Failed tests:', failures);
        }

        return { passed, failed, total, failures: [...failures] };
    }

    return { runAll };
})();

window.EngineTest = EngineTest;
