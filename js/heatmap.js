// ============================================================
// ASCEND — Heatmap Renderer
// GitHub-style annual contribution heatmap
// No external dependencies — pure DOM/CSS
// ============================================================

const Heatmap = (() => {

    const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    /**
     * Get heatmap intensity level (0-4) based on score and maxScore
     */
    function getLevel(score, maxScore) {
        if (!score || score === 0) return 0;
        if (maxScore === 0) return 0;
        const ratio = score / maxScore;
        if (ratio <= 0.25) return 1;
        if (ratio <= 0.5) return 2;
        if (ratio <= 0.75) return 3;
        return 4;
    }

    /**
     * Render the full annual heatmap into a container element.
     *
     * @param {HTMLElement} container - the container div
     * @param {object} scoreMap - { 'YYYY-MM-DD': score } (from Logs.buildScoreMap)
     * @param {number} [year] - defaults to current year
     */
    function render(container, scoreMap, year = new Date().getFullYear()) {
        container.innerHTML = '';

        const maxScore = Math.max(1, ...Object.values(scoreMap));

        // Build the weeks
        const startDate = new Date(year, 0, 1);
        const endDate = new Date(year, 11, 31);

        // Pad start to Sunday
        const startDow = startDate.getDay();
        const paddedStart = new Date(startDate);
        paddedStart.setDate(paddedStart.getDate() - startDow);

        // Collect all weeks
        const weeks = [];
        let week = [];
        let current = new Date(paddedStart);

        while (current <= endDate || week.length > 0) {
            if (current.getDay() === 0 && week.length > 0) {
                weeks.push(week);
                week = [];
            }
            if (current >= startDate || week.length > 0 || current.getDay() === 0) {
                week.push(new Date(current));
            }
            current.setDate(current.getDate() + 1);

            if (current > endDate && week.length > 0) {
                // Pad the last week
                while (week.length < 7) {
                    week.push(null);
                }
                weeks.push(week);
                break;
            }
        }

        // ── Build DOM ─────────────────────────────────────────────
        const outer = document.createElement('div');
        outer.className = 'heatmap-outer';

        // Weekday labels column
        const wdCol = document.createElement('div');
        wdCol.className = 'heatmap-weekdays';
        ['Seg', '', 'Qua', '', 'Sex', '', ''].forEach((d, i) => {
            const span = document.createElement('span');
            span.textContent = d;
            span.style.height = '13px';
            span.style.lineHeight = '13px';
            wdCol.appendChild(span);
        });
        outer.appendChild(wdCol);

        // Right side: months + grid
        const rightCol = document.createElement('div');
        rightCol.style.flex = '1';

        // Month labels
        const monthsRow = document.createElement('div');
        monthsRow.className = 'heatmap-months';
        monthsRow.style.display = 'flex';
        monthsRow.style.paddingBottom = '4px';

        let lastMonth = -1;
        weeks.forEach(w => {
            // Find first valid day in week (may have nulls)
            const firstDay = w.find(d => d !== null);
            const m = firstDay ? firstDay.getMonth() : -1;
            const span = document.createElement('span');
            span.style.width = '16px';
            span.style.flexShrink = '0';
            span.textContent = (m !== lastMonth && m !== -1) ? MONTHS[m] : '';
            if (m !== lastMonth && m !== -1) lastMonth = m;
            monthsRow.appendChild(span);
        });
        rightCol.appendChild(monthsRow);

        // Grid
        const grid = document.createElement('div');
        grid.className = 'heatmap-grid';
        grid.style.display = 'grid';
        grid.style.gridTemplateRows = 'repeat(7, 13px)';
        grid.style.gridAutoColumns = '13px';
        grid.style.gridAutoFlow = 'column';
        grid.style.gap = '3px';

        weeks.forEach((weekDays, wi) => {
            weekDays.forEach((date, di) => {
                const cell = document.createElement('div');
                cell.className = 'heatmap-cell';
                cell.style.width = '13px';
                cell.style.height = '13px';

                if (!date || date.getFullYear() !== year) {
                    cell.setAttribute('data-level', '0');
                    cell.style.opacity = '0';
                } else {
                    const dateStr = date.toISOString().split('T')[0];
                    const score = scoreMap[dateStr] || 0;
                    const level = getLevel(score, maxScore);
                    cell.setAttribute('data-level', String(level));
                    cell.setAttribute('data-tooltip', `${formatDate(date)}: ${score} pts`);
                    cell.setAttribute('data-date', dateStr);
                }

                grid.appendChild(cell);
            });
        });

        rightCol.appendChild(grid);

        // Legend
        const legend = document.createElement('div');
        legend.className = 'heatmap-legend';
        legend.innerHTML = `
      <span>Menos</span>
      <div class="heatmap-legend-samples">
        ${[0, 1, 2, 3, 4].map(l => `<div class="heatmap-legend-cell heatmap-cell" data-level="${l}" style="width:12px;height:12px;border-radius:2px;"></div>`).join('')}
      </div>
      <span>Mais</span>
    `;
        rightCol.appendChild(legend);

        outer.appendChild(rightCol);
        container.appendChild(outer);
    }

    /**
     * Render a compact mini heatmap (last N days in a flat grid)
     * @param {HTMLElement} container
     * @param {object} scoreMap
     * @param {number} days - last N days
     */
    function renderMini(container, scoreMap, days = 28) {
        container.innerHTML = '';
        const maxScore = Math.max(1, ...Object.values(scoreMap));

        for (let i = days - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const score = scoreMap[dateStr] || 0;
            const level = getLevel(score, maxScore);

            const cell = document.createElement('div');
            cell.className = 'mini-heatmap-cell heatmap-cell';
            cell.setAttribute('data-level', String(level));
            cell.setAttribute('data-tooltip', `${formatDate(d)}: ${score} pts`);
            container.appendChild(cell);
        }
    }

    function formatDate(date) {
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    return { render, renderMini, getLevel };
})();

window.Heatmap = Heatmap;
