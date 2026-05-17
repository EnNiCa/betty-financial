// ratios.js - Dashboard de Ratios Financieros v2.0

let datosGlobales = null;
let coloresGlobales = null;

// Elementos DOM
const uploadBox = document.getElementById('uploadBox');
const fileInput = document.getElementById('fileInput');
const loading = document.getElementById('loading');
const dashboard = document.getElementById('dashboard');
const btnConfigurarNombres = document.getElementById('btnConfigurarNombres');

// Restaurar datos al cargar la página
window.addEventListener('DOMContentLoaded', function() {
    const datosGuardados = sessionStorage.getItem('datosRatios');
    if (datosGuardados) {
        try {
            const data = JSON.parse(datosGuardados);
            datosGlobales = data;
            coloresGlobales = data.colores;
            mostrarDashboard(data);
            dashboard.style.display = 'block';
        } catch(e) {
            console.error('Error al restaurar datos:', e);
            sessionStorage.removeItem('datosRatios');
        }
    }
});

// Event Listeners
if (uploadBox) {
    uploadBox.addEventListener('click', () => fileInput.click());
}

if (fileInput) {
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFile(e.target.files[0]);
    });
}

if (btnConfigurarNombres) {
    btnConfigurarNombres.addEventListener('click', abrirModalNombres);
}

// Drag & Drop
if (uploadBox) {
    uploadBox.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadBox.style.borderColor = '#2a5298';
    });

    uploadBox.addEventListener('dragleave', () => {
        uploadBox.style.borderColor = '#1e3c72';
    });

    uploadBox.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadBox.style.borderColor = '#1e3c72';
        if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
    });
}

function handleFile(file) {
    if (!file.name.match(/\.(xlsx|xls)$/)) {
        alert('Solo archivos Excel (.xlsx, .xls)');
        return;
    }
    
    const sector = document.querySelector('input[name="sector"]:checked').value;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('sector', sector);
    
    loading.style.display = 'block';
    dashboard.style.display = 'none';
    
    fetch('/upload-ratios', {
        method: 'POST',
        body: formData
    })
    .then(r => r.json())
    .then(data => {
        if (data.error) {
            alert('Error: ' + data.error);
            loading.style.display = 'none';
            return;
        }
        
        datosGlobales = data;
        coloresGlobales = data.colores;
        
        // Guardar en sessionStorage
        sessionStorage.setItem('datosRatios', JSON.stringify(data));
        
        mostrarDashboard(data);
        loading.style.display = 'none';
        dashboard.style.display = 'block';
        dashboard.scrollIntoView({ behavior: 'smooth' });
    })
    .catch(err => {
        console.error('Error:', err);
        alert('Error al procesar el archivo');
        loading.style.display = 'none';
    });
}

function mostrarDashboard(data) {
    mostrarKPIs(data.ratios);
    crearGraficos(data);
    crearTabla(data.ratios);
    mostrarAnalisis(data.analisis);
}

function mostrarKPIs(ratios) {
    const años = Object.keys(ratios);
    const ultimo = ratios[años[años.length - 1]];
    const grid = document.getElementById('kpiGrid');
    
    const kpis = [
        { label: 'ROE', valor: ultimo.roe, unit: '%' },
        { label: 'ROA', valor: ultimo.roa, unit: '%' },
        { label: 'Solvencia', valor: ultimo.solvencia_total, unit: '' },
        { label: 'Endeudamiento', valor: ultimo.nivel_endeudamiento, unit: '%' },
        { label: 'Liquidez', valor: ultimo.solvencia_corriente, unit: '' },
        { label: 'EBITDA/Ventas', valor: ultimo.ebitda_ventas, unit: '%' }
    ];
    
    grid.innerHTML = kpis.map(k => `
        <div class="kpi-card">
            <div class="metric-label">${k.label}</div>
            <div class="metric-value">${k.valor || 'N/A'}</div>
            <div class="metric-unit">${k.unit}</div>
        </div>
    `).join('');
}

function crearGraficos(data) {
    const años = Object.keys(data.ratios);
    const paleta = data.paletas.azules;
    
    // Configuración común de tooltips con 2 decimales
    const tooltipConfig = {
        y: {
            formatter: function(val) {
                return val != null ? val.toFixed(2) : 'N/A';
            }
        }
    };
    
    // GRÁFICO 1: NIVEL DE ENDEUDAMIENTO (Combinado: Línea + Barras)
    const endeud = años.map(a => data.ratios[a].nivel_endeudamiento || null);
    const pasivo_nc = años.map(a => data.datos.balance[a]?.pasivo_no_corriente || 0);
    const pasivo_c = años.map(a => data.datos.balance[a]?.pasivo_corriente || 0);
    const deuda_total = años.map((a, i) => pasivo_nc[i] + pasivo_c[i]);
    
    new ApexCharts(document.querySelector("#chartEndeudamiento"), {
        series: [
            { name: 'Deuda Total (Pasivo NC + PC)', data: deuda_total, type: 'bar' },
            { name: 'Nivel Endeudamiento (%)', data: endeud, type: 'line' }
        ],
        chart: { type: 'line', height: 350 },
        colors: [data.paletas.variada[0], data.paletas.calor[2]],
        stroke: { width: [0, 3] },
        xaxis: { categories: años },
        yaxis: [
            {
                title: { text: 'Deuda Total (€)' },
                labels: {
                    formatter: function(val) {
                        if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
                        if (val >= 1000) return (val / 1000).toFixed(0) + 'K';
                        return val.toFixed(0);
                    }
                }
            },
            {
                opposite: true,
                title: { text: 'Endeudamiento (%)' },
                labels: {
                    formatter: function(val) {
                        return val.toFixed(1) + '%';
                    }
                }
            }
        ],
        dataLabels: { enabled: false },
        tooltip: {
            shared: true,
            y: [
                {
                    formatter: function(val) {
                        return val.toLocaleString('es-ES', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' €';
                    }
                },
                {
                    formatter: function(val) {
                        return val.toFixed(2) + '%';
                    }
                }
            ]
        }
    }).render();
    
    // GRÁFICO 2: SOLVENCIA TOTAL (con línea de referencia en 1)
    const solv = años.map(a => data.ratios[a].solvencia_total || null);
    new ApexCharts(document.querySelector("#chartSolvencia"), {
        series: [{ name: 'Solvencia Total', data: solv }],
        chart: { type: 'line', height: 350 },
        colors: [paleta[1]],
        xaxis: { categories: años },
        stroke: { width: 3 },
        markers: { size: 5 },
        annotations: {
            yaxis: [{
                y: 1,
                borderColor: '#ef4444',
                borderWidth: 3,
                strokeDashArray: 0,
                label: {
                    borderColor: '#ef4444',
                    style: { 
                        color: '#fff', 
                        background: '#ef4444',
                        fontSize: '12px',
                        fontWeight: 'bold'
                    },
                    text: 'Punto Crítico = 1'
                }
            }]
        },
        yaxis: {
            min: function(min) {
                return Math.min(0.5, min - 0.2);
            },
            title: {
                text: 'Solvencia Total'
            }
        },
        tooltip: tooltipConfig
    }).render();
    
    // GRÁFICO 3: ROA y ROE con área entre líneas - USANDO CHART.JS
    const roa = años.map(a => data.ratios[a].roa || null);
    const roe = años.map(a => data.ratios[a].roe || null);
    
    // Determinar predominio para el color
    let countPositivo = 0;
    let countNegativo = 0;
    
    años.forEach((a, i) => {
        if (roe[i] && roa[i]) {
            if (roe[i] > roa[i]) countPositivo++;
            else countNegativo++;
        }
    });
    
    const esApalancamientoPositivo = countPositivo >= countNegativo;
    const colorArea = esApalancamientoPositivo ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)';
    
    // Destruir gráfico anterior si existe
    const canvasRentabilidad = document.querySelector("#chartRentabilidad");
    if (canvasRentabilidad) {
        canvasRentabilidad.innerHTML = '<canvas></canvas>';
        const ctx = canvasRentabilidad.querySelector('canvas').getContext('2d');
        
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: años,
                datasets: [
                    {
                        label: 'ROA',
                        data: roa,
                        borderColor: '#f59e0b',
                        backgroundColor: 'transparent',
                        borderWidth: 4,
                        pointRadius: 6,
                        pointBackgroundColor: '#f59e0b',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        tension: 0.4,
                        fill: false,
                        order: 2
                    },
                    {
                        label: 'ROE',
                        data: roe,
                        borderColor: '#10b981',
                        backgroundColor: 'transparent',
                        borderWidth: 4,
                        pointRadius: 6,
                        pointBackgroundColor: '#10b981',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        tension: 0.4,
                        fill: '-1', // Llenar hasta el dataset anterior (ROA)
                        backgroundColor: colorArea,
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: esApalancamientoPositivo ? '✓ Apalancamiento Positivo (ROE > ROA)' : '✗ Apalancamiento Negativo (ROE < ROA)',
                        color: esApalancamientoPositivo ? '#10b981' : '#ef4444',
                        font: {
                            size: 14,
                            weight: 'bold'
                        }
                    },
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            usePointStyle: true,
                            padding: 15,
                            font: {
                                size: 12
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'white',
                        titleColor: '#333',
                        bodyColor: '#666',
                        borderColor: '#ddd',
                        borderWidth: 1,
                        padding: 12,
                        displayColors: true,
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': ' + context.parsed.y.toFixed(2) + '%';
                            },
                            afterBody: function(tooltipItems) {
                                if (tooltipItems.length >= 2) {
                                    // Encontrar cuál es ROA y cuál es ROE por el label
                                    let roaVal, roeVal;
                                    
                                    tooltipItems.forEach(item => {
                                        if (item.dataset.label === 'ROA') {
                                            roaVal = item.parsed.y;
                                        } else if (item.dataset.label === 'ROE') {
                                            roeVal = item.parsed.y;
                                        }
                                    });
                                    
                                    if (roaVal !== undefined && roeVal !== undefined) {
                                        const diff = roeVal - roaVal;
                                        const diffText = diff > 0 ? 'Apalancamiento positivo' : 'Apalancamiento negativo';
                                        return [
                                            '',
                                            diffText,
                                            'Diferencia: ' + (diff > 0 ? '+' : '') + diff.toFixed(2) + '%'
                                        ];
                                    }
                                }
                                return [];
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        title: {
                            display: true,
                            text: 'Rentabilidad (%)',
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            callback: function(value) {
                                return value.toFixed(1) + '%';
                            }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        }
                    }
                },
                interaction: {
                    mode: 'index',
                    intersect: false
                }
            }
        });
    }
    
    // GRÁFICO 4: MÁRGENES
    const ebitda = años.map(a => data.ratios[a].ebitda_ventas || null);
    const bait = años.map(a => data.ratios[a].bait_ventas || null);
    const resultado = años.map(a => data.ratios[a].resultado_ventas || null);
    new ApexCharts(document.querySelector("#chartMargenes"), {
        series: [
            { name: 'EBITDA/Ventas', data: ebitda },
            { name: 'BAIT/Ventas', data: bait },
            { name: 'Resultado/Ventas', data: resultado }
        ],
        chart: { type: 'line', height: 350 },
        colors: data.paletas.variada,
        xaxis: { categories: años },
        tooltip: tooltipConfig
    }).render();
    
    // GRÁFICO 5: SOLVENCIA CORRIENTE (con zonas de color)
    const liq = años.map(a => data.ratios[a].solvencia_corriente || null);
    new ApexCharts(document.querySelector("#chartLiquidez"), {
        series: [{ name: 'Solvencia Corriente', data: liq }],
        chart: { type: 'area', height: 350 },
        colors: ['#3b82f6'],
        xaxis: { categories: años },
        annotations: {
            yaxis: [
                {
                    y: 0,
                    y2: 1,
                    fillColor: '#ef4444',
                    opacity: 0.1,
                    label: {
                        text: 'RIESGO',
                        style: { color: '#ef4444', background: 'transparent' }
                    }
                },
                {
                    y: 1,
                    y2: 1.5,
                    fillColor: '#f59e0b',
                    opacity: 0.1,
                    label: {
                        text: 'AJUSTADO',
                        style: { color: '#f59e0b', background: 'transparent' }
                    }
                },
                {
                    y: 1.5,
                    y2: 100,
                    fillColor: '#10b981',
                    opacity: 0.1,
                    label: {
                        text: 'CÓMODO',
                        style: { color: '#10b981', background: 'transparent' }
                    }
                }
            ]
        },
        tooltip: tooltipConfig
    }).render();
    
    // GRÁFICO 6: APALANCAMIENTO FINANCIERO (Combinado)
    const fondos_propios = años.map(a => data.datos.balance[a]?.fondos_propios || 0);
    const apalancamiento = años.map((a, i) => {
        const fp = fondos_propios[i];
        const deuda = deuda_total[i];
        return fp > 0 ? (deuda / fp) : 0;
    });
    
    new ApexCharts(document.querySelector("#chartBalance"), {
        series: [
            { name: 'Deuda Total', data: deuda_total, type: 'bar' },
            { name: 'Fondos Propios', data: fondos_propios, type: 'bar' },
            { name: 'Apalancamiento', data: apalancamiento, type: 'line' }
        ],
        chart: { type: 'line', height: 350 },
        colors: [data.paletas.calor[4], data.paletas.calor[0], data.paletas.variada[0]],
        stroke: { width: [0, 0, 3] },
        xaxis: { categories: años },
        yaxis: [
            {
                title: { text: 'Importe (€)' },
                labels: {
                    formatter: function(val) {
                        if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
                        if (val >= 1000) return (val / 1000).toFixed(0) + 'K';
                        return val.toFixed(0);
                    }
                }
            },
            {
                opposite: true,
                title: { text: 'Apalancamiento' },
                decimalsInFloat: 2
            }
        ],
        dataLabels: { enabled: false },
        tooltip: {
            shared: true,
            y: [
                {
                    formatter: function(val) {
                        return val.toLocaleString('es-ES', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' €';
                    }
                },
                {
                    formatter: function(val) {
                        return val.toLocaleString('es-ES', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' €';
                    }
                },
                {
                    formatter: function(val) {
                        return val.toFixed(2);
                    }
                }
            ]
        }
    }).render();
}

function crearTabla(ratios) {
    const años = Object.keys(ratios).slice(-5);
    const thead = document.querySelector('#ratiosTable thead');
    const tbody = document.querySelector('#ratiosTableBody');
    
    thead.innerHTML = '<tr><th>Ratio</th>' + años.map(a => `<th>${a}</th>`).join('') + '</tr>';
    
    const nombresRatios = {
        'roe': 'ROE (%)',
        'roa': 'ROA (%)',
        'nivel_endeudamiento': 'Endeudamiento (%)',
        'solvencia_total': 'Solvencia Total',
        'solvencia_corriente': 'Solvencia Corriente',
        'ebitda_ventas': 'EBITDA/Ventas (%)'
    };
    
    tbody.innerHTML = Object.keys(nombresRatios).map(key => {
        const valores = años.map(a => ratios[a][key] || 'N/A');
        return '<tr><td><strong>' + nombresRatios[key] + '</strong></td>' + 
               valores.map(v => '<td>' + v + '</td>').join('') + '</tr>';
    }).join('');
}

function mostrarAnalisis(analisis) {
    const div = document.getElementById('analisisContent');
    div.innerHTML = analisis.map(a => `
        <div class="analysis-item ${a.tipo}">
            <h4>${a.titulo}</h4>
            <p>${a.descripcion}</p>
        </div>
    `).join('');
}

// Modal de Configuración de Nombres
function abrirModalNombres() {
    fetch('/api/configurar-nombres')
        .then(r => r.json())
        .then(data => {
            const modal = document.getElementById('modalNombres');
            const grid = document.getElementById('nombresConfig');
            
            grid.innerHTML = Object.keys(data.nombres_default).map(key => {
                const nombres = data.nombres_default[key];
                const valor = data.nombres_usuario[key] || nombres[0];
                return `
                    <div class="nombre-config">
                        <label>${key.replace(/_/g, ' ')}</label>
                        <input type="text" id="nombre_${key}" value="${valor}" 
                               placeholder="${nombres.join(', ')}">
                    </div>
                `;
            }).join('');
            
            modal.style.display = 'flex';
        });
}

function cerrarModal() {
    document.getElementById('modalNombres').style.display = 'none';
}

function guardarNombres() {
    const nombres = {};
    document.querySelectorAll('[id^="nombre_"]').forEach(input => {
        const key = input.id.replace('nombre_', '');
        nombres[key] = input.value;
    });
    
    fetch('/api/guardar-nombres', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombres })
    })
    .then(r => r.json())
    .then(data => {
        alert('Nombres guardados. Recarga el Excel para aplicar cambios.');
        cerrarModal();
    });
}
