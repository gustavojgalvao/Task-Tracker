// ============================================================
// ASCEND — Chart.js Wrappers
// Monthly, weekly, habit donut/radar charts
// ============================================================

const Charts = (() => {

    // Destroy existing chart on canvas before re-rendering
    function destroy(canvasId) {
        const existing = Chart.getChart(canvasId);
        if (existing) existing.destroy();
    }

    // Shared defaults
    const defaultOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: '#111827',
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: 1,
                titleColor: '#f0f4ff',
                bodyColor: '#8895b3',
                padding: 10,
                cornerRadius: 8,
            }
        },
        scales: {
            x: {
                grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
                ticks: { color: '#8895b3', font: { size: 11, family: 'Inter' } },
            },
            y: {
                grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
                ticks: { color: '#8895b3', font: { size: 11, family: 'Inter' } },
                beginAtZero: true,
            }
        }
    };

    /**
     * Render monthly bar chart (score per day in current month)
     * @param {string} canvasId
     * @param {Array<{date: string, score: number}>} data
     */
    function renderMonthly(canvasId, data) {
        destroy(canvasId);
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const labels = data.map(d => {
            const date = new Date(d.date + 'T00:00:00');
            return date.getDate();
        });
        const scores = data.map(d => d.score);

        new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    data: scores,
                    backgroundColor: scores.map(s => s > 0 ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.04)'),
                    hoverBackgroundColor: 'rgba(99,102,241,0.9)',
                    borderRadius: 6,
                    borderSkipped: false,
                }]
            },
            options: {
                ...defaultOptions,
                plugins: {
                    ...defaultOptions.plugins,
                    tooltip: {
                        ...defaultOptions.plugins.tooltip,
                        callbacks: {
                            title: ctx => `Dia ${ctx[0].label}`,
                            label: ctx => `Score: ${ctx.raw} pts`,
                        }
                    }
                }
            }
        });
    }

    /**
     * Render weekly line chart (score per week over the year)
     * @param {string} canvasId
     * @param {Array<{week: string, score: number}>} data
     */
    function renderWeekly(canvasId, data) {
        destroy(canvasId);
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        // Show last 12 weeks
        const slice = data.slice(-12);
        const labels = slice.map(d => d.week.replace(/^\d{4}-/, ''));
        const scores = slice.map(d => d.score);

        new Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    data: scores,
                    borderColor: '#22c55e',
                    backgroundColor: 'rgba(34,197,94,0.08)',
                    borderWidth: 2,
                    pointBackgroundColor: '#22c55e',
                    pointBorderColor: '#22c55e',
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    tension: 0.4,
                    fill: true,
                }]
            },
            options: {
                ...defaultOptions,
                plugins: {
                    ...defaultOptions.plugins,
                    tooltip: {
                        ...defaultOptions.plugins.tooltip,
                        callbacks: {
                            label: ctx => `Score: ${ctx.raw} pts`,
                        }
                    }
                }
            }
        });
    }

    /**
     * Render per-habit completion doughnut chart
     * @param {string} canvasId
     * @param {Array<{habit: object, pct: number}>} data
     */
    function renderHabitDoughnut(canvasId, data) {
        destroy(canvasId);
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const labels = data.map(d => d.habit.name);
        const values = data.map(d => d.pct);
        const colors = data.map(d => d.habit.color || '#6366f1');

        new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: colors.map(c => c + 'cc'),
                    hoverBackgroundColor: colors,
                    borderColor: '#0d1220',
                    borderWidth: 3,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '68%',
                plugins: {
                    legend: {
                        display: true,
                        position: 'right',
                        labels: {
                            color: '#8895b3',
                            font: { size: 11, family: 'Inter' },
                            padding: 12,
                            usePointStyle: true,
                            pointStyleWidth: 8,
                        }
                    },
                    tooltip: {
                        ...defaultOptions.plugins.tooltip,
                        callbacks: {
                            label: ctx => ` ${ctx.label}: ${ctx.raw}%`,
                        }
                    }
                }
            }
        });
    }

    /**
     * Render discipline score trend (line, monthly averages)
     * @param {string} canvasId
     * @param {Array<{month: string, avg: number}>} data
     */
    function renderTrend(canvasId, data) {
        destroy(canvasId);
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const labels = data.map(d => monthNames[parseInt(d.month.split('-')[1]) - 1]);
        const values = data.map(d => d.avg);

        new Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    data: values,
                    borderColor: '#818cf8',
                    backgroundColor: 'rgba(99,102,241,0.08)',
                    borderWidth: 2.5,
                    pointBackgroundColor: '#818cf8',
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    tension: 0.4,
                    fill: true,
                }]
            },
            options: {
                ...defaultOptions,
                plugins: {
                    ...defaultOptions.plugins,
                    tooltip: {
                        ...defaultOptions.plugins.tooltip,
                        callbacks: {
                            label: ctx => `Média: ${ctx.raw} pts/dia`,
                        }
                    }
                }
            }
        });
    }

    return { renderMonthly, renderWeekly, renderHabitDoughnut, renderTrend };
})();

window.Charts = Charts;
