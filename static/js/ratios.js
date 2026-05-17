// ratios.js - Dashboard de Ratios Financieros v3.0 - Con todas las mejoras
 
let datosGlobales = null;
let coloresGlobales = null;
let sectorActual = null;
 
// Elementos DOM
const uploadBox = document.getElementById('uploadBox');
const fileInput = document.getElementById('fileInput');
const loading = document.getElementById('loading');
const dashboard = document.getElementById('dashboard');
const btnConfigurarNombres = document.getElementById('btnConfigurarNombres');
const btnExportarPDF = document.getElementById('btnExportarPDF');
const btnExportarExcel = document.getElementById('btnExportarExcel');
 
// Definiciones de ratios para tooltips
const definicionesRatios = {
    'endeudamiento': {
        titulo: 'Nivel de Endeudamiento',
        formula: '(Pasivo NC + Pasivo C) / Total Activo × 100',
        definicion: 'Indica qué porcentaje del activo total está financiado con deuda (recursos ajenos).'
    },
    'solvencia_total': {
        titulo: 'Solvencia Total',
        formula: 'Total Activo / (Pasivo NC + Pasivo C)',
        definicion: 'Mide la capacidad de la empresa para hacer frente a todas sus deudas con todos sus activos.'
    },
    'roa_roe': {
        titulo: 'ROA y ROE',
        formula: 'ROA = EBIT / Total Activo × 100 | ROE = Resultado / Fondos Propios × 100',
        definicion: 'ROA mide rentabilidad de activos. ROE mide rentabilidad para accionistas.'
    },
    'margenes': {
        titulo: 'Márgenes sobre Ventas',
        formula: 'EBITDA/Ventas, BAIT/Ventas, Resultado/Ventas',
        definicion: 'Miden qué porcentaje de las ventas se convierte en beneficio en diferentes etapas.'
    },
    'solvencia_corriente': {
        titulo: 'Solvencia Corriente',
        formula: 'Activo Corriente / Pasivo Corriente',
        definicion: 'Mide la capacidad de pagar deudas a corto plazo con activos líquidos.'
    },
    'apalancamiento': {
        titulo: 'Apalancamiento Financiero',
        formula: 'Fondos Ajenos / Fondos Propios',
        definicion: 'Mide cuántos euros de deuda hay por cada euro de patrimonio propio.'
    }
};
 
// Restaurar datos al cargar la página
window.addEventListener('DOMContentLoaded', function() {
    const datosGuardados = sessionStorage.getItem('datosRatios');
    if (datosGuardados) {
        try {
            const data = JSON.parse(datosGuardados);
            datosGlobales = data;
            coloresGlobales = data.colores;
            sectorActual = data.sector || 'general';
            mostrarDashboard(data);
            dashboard.style.display = 'block';
            btnExportarPDF.style.display = 'inline-flex';
            btnExportarExcel.style.display = 'inline-flex';
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
 
if (btnExportarPDF) {
    btnExportarPDF.addEventListener('click', imprimirDashboard);
}
 
if (btnExportarExcel) {
    btnExportarExcel.addEventListener('click', exportarExcel);
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
    sectorActual = sector;
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
        datosGlobales.sector = sector;
        coloresGlobales = data.colores;
        
        sessionStorage.setItem('datosRatios', JSON.stringify(datosGlobales));
        
        mostrarDashboard(data);
        loading.style.display = 'none';
        dashboard.style.display = 'block';
        btnExportarPDF.style.display = 'inline-flex';
        btnExportarExcel.style.display = 'inline-flex';
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
    agregarTitulosClickeables();
}
 
// KPIs mejorados (fondo azul uniforme + letras blancas)
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
        <div class="kpi-card kpi-card-compact">
            <div class="metric-label" style="color: white; font-weight: 600;">${k.label}</div>
            <div class="metric-value" style="font-size: 1.8em; color: white;">${k.valor || 'N/A'}</div>
            <div class="metric-unit" style="color: white;">${k.unit}</div>
        </div>
    `).join('');
}
 
// Agregar estilos para KPIs compactos
const style = document.createElement('style');
style.textContent = `
    .kpi-card-compact {
        padding: 15px 20px !important;
        min-height: auto !important;
    }
    .kpi-card-compact .metric-value {
        font-size: 1.8em !important;
        margin: 8px 0 !important;
    }
`;
document.head.appendChild(style);
 
function crearGraficos(data) {
    const años = Object.keys(data.ratios);
    const paleta = data.paletas.azules;
    
    // GRÁFICO 1: Endeudamiento
    crearGraficoEndeudamiento(años, data);
    
    // GRÁFICO 2: Solvencia Total (CON FRANJAS - Chart.js)
    crearGraficoSolvenciaTotal(años, data);
    
    // GRÁFICO 3: ROA y ROE (ya tiene área)
    crearGraficoROAyROE(años, data);
    
    // GRÁFICO 4: Márgenes
    crearGraficoMargenes(años, data);
    
    // GRÁFICO 5: Solvencia Corriente (CON FRANJAS - Chart.js)
    crearGraficoSolvenciaCorriente(años, data);
    
    // GRÁFICO 6: Apalancamiento
    crearGraficoApalancamiento(años, data);
}
 
function crearGraficoEndeudamiento(años, data) {
    const endeud = años.map(a => data.ratios[a].nivel_endeudamiento || null);
    const pasivo_nc = años.map(a => data.datos.balance[a]?.pasivo_no_corriente || 0);
    const pasivo_c = años.map(a => data.datos.balance[a]?.pasivo_corriente || 0);
    const deuda_total = años.map((a, i) => pasivo_nc[i] + pasivo_c[i]);
    
    new ApexCharts(document.querySelector("#chartEndeudamiento"), {
        series: [
            { name: 'Deuda Total (Pasivo NC + PC)', data: deuda_total, type: 'bar' },
            { name: 'Nivel Endeudamiento (%)', data: endeud, type: 'line' }
        ],
        chart: { type: 'line', height: 350, toolbar: { show: true, tools: { download: true } } },
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
                        return val.toFixed(2) + '%';
                    }
                }
            }
        ],
        dataLabels: { enabled: false },
        tooltip: {
            shared: true,
            y: [
                { formatter: (val) => val.toLocaleString('es-ES', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' €' },
                { formatter: (val) => val.toFixed(2) + '%' }
            ]
        }
    }).render();
    
    // Agregar análisis
    const ultimoAño = años[años.length - 1];
    const valorEndeud = data.ratios[ultimoAño].nivel_endeudamiento;
    agregarAnalisis('chartEndeudamiento', analizarEndeudamiento(valorEndeud, sectorActual));
}
 
function crearGraficoSolvenciaTotal(años, data) {
    const solv = años.map(a => data.ratios[a].solvencia_total || null);
    const ultimoValor = solv[solv.length - 1];
    
    // Determinar color de franja según valor
    let colorFranja, tipoSolvencia;
    if (ultimoValor < 1) {
        colorFranja = 'rgba(239, 68, 68, 0.3)';
        tipoSolvencia = '⚠️ Riesgo de liquidez';
    } else if (ultimoValor < 1.5) {
        colorFranja = 'rgba(252, 255, 0, 0.3)';
        tipoSolvencia = '⚡ Zona ajustada';
    } else if (ultimoValor < 2) {
        colorFranja = 'rgba(208, 255, 0, 0.3)';
        tipoSolvencia = '✅ Buena liquidez';
    } else {
        colorFranja = 'rgba(126, 255, 0, 0.3)';
        tipoSolvencia = '🌟 Excelente liquidez';
    }
    
    // Crear datos para franja
    const lineaBase = años.map(() => 1); // Línea en y=1
    const lineaSolvencia = solv;
    
    const canvas = document.querySelector("#chartSolvencia");
    canvas.innerHTML = '<canvas></canvas>';
    const ctx = canvas.querySelector('canvas').getContext('2d');
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: años,
            datasets: [
                {
                    label: 'Punto Crítico',
                    data: lineaBase,
                    borderColor: '#ef4444',
                    backgroundColor: 'transparent',
                    borderWidth: 3,
                    pointRadius: 0,
                    fill: false,
                    borderDash: [5, 5],
                    order: 3
                },
                {
                    label: 'Solvencia Total',
                    data: lineaSolvencia,
                    borderColor: '#3b82f6',
                    backgroundColor: 'transparent',
                    borderWidth: 4,
                    pointRadius: 6,
                    pointBackgroundColor: '#3b82f6',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    tension: 0.4,
                    fill: '-1',
                    backgroundColor: colorFranja,
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
                    text: tipoSolvencia,
                    font: { size: 14, weight: 'bold' },
                    color: ultimoValor < 1 ? '#ef4444' : (ultimoValor < 1.5 ? '#f59e0b' : '#10b981')
                },
                legend: { display: true },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            if (context.datasetIndex === 1) {
                                return 'Solvencia: ' + context.parsed.y.toFixed(2);
                            }
                            return '';
                        }
                    }
                }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Solvencia Total' },
                    min: Math.min(0.5, Math.min(...solv) - 0.2)
                }
            }
        }
    });
    
    agregarAnalisis('chartSolvencia', analizarSolvenciaTotal(ultimoValor, sectorActual));
}
 
function crearGraficoROAyROE(años, data) {
    const roa = años.map(a => data.ratios[a].roa || null);
    const roe = años.map(a => data.ratios[a].roe || null);
    
    let countPositivo = 0;
    años.forEach((a, i) => {
        if (roe[i] && roa[i] && roe[i] > roa[i]) countPositivo++;
    });
    const esApalancamientoPositivo = countPositivo >= (años.length / 2);
    const colorArea = esApalancamientoPositivo ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)';
    
    const canvas = document.querySelector("#chartRentabilidad");
    canvas.innerHTML = '<canvas></canvas>';
    const ctx = canvas.querySelector('canvas').getContext('2d');
    
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
                    fill: '-1',
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
                    font: { size: 14, weight: 'bold' }
                },
                legend: { display: true },
                tooltip: {
                    callbacks: {
                        afterBody: function(tooltipItems) {
                            if (tooltipItems.length >= 2) {
                                const roaVal = tooltipItems[0].parsed.y;
                                const roeVal = tooltipItems[1].parsed.y;
                                const diff = roeVal - roaVal;
                                return [
                                    '',
                                    diff > 0 ? 'Apalancamiento positivo' : 'Apalancamiento negativo',
                                    'Diferencia: ' + (diff > 0 ? '+' : '') + diff.toFixed(2) + '%'
                                ];
                            }
                            return [];
                        }
                    }
                }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Rentabilidad (%)' }
                }
            }
        }
    });
    
    const ultimoAño = años[años.length - 1];
    const valorROA = data.ratios[ultimoAño].roa;
    const valorROE = data.ratios[ultimoAño].roe;
    agregarAnalisis('chartRentabilidad', analizarROAyROE(valorROA, valorROE, sectorActual));
}
 
function crearGraficoMargenes(años, data) {
    const ebitda = años.map(a => data.ratios[a].ebitda_ventas || null);
    const bait = años.map(a => data.ratios[a].bait_ventas || null);
    const resultado = años.map(a => data.ratios[a].resultado_ventas || null);
    
    new ApexCharts(document.querySelector("#chartMargenes"), {
        series: [
            { name: 'EBITDA/Ventas', data: ebitda },
            { name: 'BAIT/Ventas', data: bait },
            { name: 'Resultado/Ventas', data: resultado }
        ],
        chart: { type: 'line', height: 350, toolbar: { show: true } },
        colors: data.paletas.variada,
        xaxis: { categories: años },
        stroke: { width: 3, curve: 'smooth' },
        markers: { size: 5 },
        tooltip: {
            y: { formatter: (val) => val ? val.toFixed(2) + '%' : 'N/A' }
        }
    }).render();
    
    const ultimoAño = años[años.length - 1];
    const valorEBITDA = data.ratios[ultimoAño].ebitda_ventas;
    const valorBAIT = data.ratios[ultimoAño].bait_ventas;
    const valorResultado = data.ratios[ultimoAño].resultado_ventas;
    agregarAnalisis('chartMargenes', analizarMargenes(valorEBITDA, valorBAIT, valorResultado, sectorActual));
}
 
function crearGraficoSolvenciaCorriente(años, data) {
    const liq = años.map(a => data.ratios[a].solvencia_corriente || null);
    const ultimoValor = liq[liq.length - 1];
    
    let colorFranja, tipoLiquidez;
    if (ultimoValor < 1) {
        colorFranja = 'rgba(239, 68, 68, 0.3)';
        tipoLiquidez = '⚠️ Riesgo de liquidez';
    } else if (ultimoValor < 1.5) {
        colorFranja = 'rgba(252, 255, 0, 0.3)';
        tipoLiquidez = '⚡ Zona ajustada';
    } else if (ultimoValor < 2) {
        colorFranja = 'rgba(208, 255, 0, 0.3)';
        tipoLiquidez = '✅ Buena liquidez';
    } else {
        colorFranja = 'rgba(126, 255, 0, 0.3)';
        tipoLiquidez = '🌟 Excelente liquidez';
    }
    
    const lineaBase = años.map(() => 1);
    
    const canvas = document.querySelector("#chartLiquidez");
    canvas.innerHTML = '<canvas></canvas>';
    const ctx = canvas.querySelector('canvas').getContext('2d');
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: años,
            datasets: [
                {
                    label: 'Punto Crítico',
                    data: lineaBase,
                    borderColor: '#ef4444',
                    backgroundColor: 'transparent',
                    borderWidth: 3,
                    pointRadius: 0,
                    fill: false,
                    borderDash: [5, 5],
                    order: 3
                },
                {
                    label: 'Solvencia Corriente',
                    data: liq,
                    borderColor: '#3b82f6',
                    backgroundColor: 'transparent',
                    borderWidth: 4,
                    pointRadius: 6,
                    pointBackgroundColor: '#3b82f6',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    tension: 0.4,
                    fill: '-1',
                    backgroundColor: colorFranja,
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
                    text: tipoLiquidez,
                    font: { size: 14, weight: 'bold' },
                    color: ultimoValor < 1 ? '#ef4444' : (ultimoValor < 1.5 ? '#f59e0b' : '#10b981')
                },
                legend: { display: true },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            if (context.datasetIndex === 1) {
                                return 'Liquidez: ' + context.parsed.y.toFixed(2);
                            }
                            return '';
                        }
                    }
                }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Solvencia Corriente' },
                    min: Math.min(0.5, Math.min(...liq) - 0.2)
                }
            }
        }
    });
    
    agregarAnalisis('chartLiquidez', analizarSolvenciaCorriente(ultimoValor, sectorActual));
}
 
 
function crearGraficoApalancamiento(años, data) {
    const pasivo_nc = años.map(a => data.datos.balance[a]?.pasivo_no_corriente || 0);
    const pasivo_c = años.map(a => data.datos.balance[a]?.pasivo_corriente || 0);
    const deuda_total = años.map((a, i) => pasivo_nc[i] + pasivo_c[i]);
    const fondos_propios = años.map(a => data.datos.balance[a]?.fondos_propios || 0);
    const apalancamiento = años.map((a, i) => fondos_propios[i] > 0 ? (deuda_total[i] / fondos_propios[i]) : 0);
    
    // Calcular min y max del apalancamiento para el eje Y
    const minApal = Math.min(...apalancamiento);
    const maxApal = Math.max(...apalancamiento);
    const margen = (maxApal - minApal) * 0.1; // 10% de margen
    
    new ApexCharts(document.querySelector("#chartBalance"), {
        series: [
            { name: 'Deuda Total', data: deuda_total, type: 'bar' },
            { name: 'Fondos Propios', data: fondos_propios, type: 'bar' },
            { name: 'Apalancamiento', data: apalancamiento, type: 'line' }
        ],
        chart: { type: 'line', height: 350, toolbar: { show: true } },
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
                title: { text: 'Apalancamiento (FA/FP)' },
                min: Math.max(0, minApal - margen),
                max: maxApal + margen,
                labels: {
                    formatter: function(val) {
                        return val.toFixed(2);
                    }
                }
            }
        ],
        dataLabels: { enabled: false },
        tooltip: {
            shared: true,
            y: [
                { formatter: (val) => val.toLocaleString('es-ES', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' €' },
                { formatter: (val) => val.toLocaleString('es-ES', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' €' },
                { formatter: (val) => val.toFixed(2) }
            ]
        }
    }).render();
    
    const ultimoAño = años[años.length - 1];
    const valorApal = apalancamiento[años.length - 1];
    agregarAnalisis('chartBalance', analizarApalancamiento(valorApal, sectorActual));
}
 
// Funciones de análisis por sector
function analizarEndeudamiento(valor, sector) {
    let clase = 'positivo';
    let texto = '';
    
    // Protección contra valores undefined/null
    if (valor === undefined || valor === null || isNaN(valor)) {
        texto = 'No hay datos suficientes para analizar el endeudamiento. Verifica que el Excel contenga todas las columnas necesarias (fondos_propios, pasivo_no_corriente, pasivo_corriente).';
        clase = 'warning';
        return { texto, clase };
    }
    
    if (valor < 30) {
        texto = `Con un ${valor.toFixed(1)}% de endeudamiento, la empresa muestra una estructura financiera muy conservadora. Existe margen para apalancarse si se identifican oportunidades de crecimiento rentables.`;
        clase = 'positivo';
    } else if (valor < 50) {
        texto = `El nivel de endeudamiento del ${valor.toFixed(1)}% es moderado y saludable. La empresa mantiene un equilibrio adecuado entre recursos propios y ajenos.`;
        clase = 'positivo';
    } else if (valor < 70) {
        texto = `Con un ${valor.toFixed(1)}% de endeudamiento, la empresa se encuentra en una zona de atención. Se recomienda monitorear la capacidad de generar flujos para atender la deuda.`;
        clase = 'warning';
    } else {
        texto = `El endeudamiento del ${valor.toFixed(1)}% es elevado. Es crítico mejorar la rentabilidad y considerar reducir deuda o aumentar fondos propios para mejorar la solvencia.`;
        clase = 'negativo';
    }
    
    return { texto, clase };
}
 
function analizarSolvenciaTotal(valor, sector) {
    let clase = 'positivo';
    let texto = '';
    
    // Protección contra undefined/null
    if (valor === undefined || valor === null || isNaN(valor)) {
        return { 
            texto: '⚠️ No se pudo calcular solvencia total. Verifica: total_activo, pasivo_no_corriente, pasivo_corriente.', 
            clase: 'warning' 
        };
    }
    
    if (valor < 1) {
        texto = `⚠️ ALERTA: Con una solvencia de ${valor.toFixed(2)}, los activos no cubren el total de deudas. Situación crítica que requiere acción inmediata: reestructuración de deuda, ampliación de capital o venta de activos.`;
        clase = 'negativo';
    } else if (valor < 1.5) {
        texto = `Con solvencia de ${valor.toFixed(2)}, la empresa está en zona ajustada. Los activos cubren las deudas pero con poco margen. Recomendable mejorar rentabilidad y reducir pasivos gradualmente.`;
        clase = 'warning';
    } else if (valor < 2) {
        texto = `Solvencia de ${valor.toFixed(2)} indica buena salud financiera. La empresa tiene capacidad suficiente para cubrir sus obligaciones con margen de seguridad.`;
        clase = 'positivo';
    } else {
        texto = `Excelente solvencia de ${valor.toFixed(2)}. La empresa muestra una estructura financiera muy sólida con amplio colchón para afrontar obligaciones.`;
        clase = 'positivo';
    }
    
    return { texto, clase };
}
 
function analizarROAyROE(roa, roe, sector) {
    // Protección contra undefined/null
    if (roa === undefined || roa === null || isNaN(roa) || 
        roe === undefined || roe === null || isNaN(roe)) {
        return { 
            texto: '⚠️ No se pudo calcular ROA/ROE. Verifica: total_activo, ebit, resultado_ejercicio, fondos_propios.', 
            clase: 'warning' 
        };
    }
    
    const diff = roe - roa;
    let clase = diff > 0 ? 'positivo' : 'warning';
    let texto = '';
    
    if (diff > 0) {
        texto = `El ROE (${roe.toFixed(2)}%) supera al ROA (${roa.toFixed(2)}%), generando un efecto apalancamiento positivo de ${diff.toFixed(2)} puntos. El endeudamiento está contribuyendo a mejorar la rentabilidad para los accionistas.`;
    } else {
        texto = `El ROE (${roe.toFixed(2)}%) es inferior al ROA (${roa.toFixed(2)}%), indicando que el coste de la deuda está reduciendo la rentabilidad para los accionistas en ${Math.abs(diff).toFixed(2)} puntos. Revisar coste financiero.`;
    }
    
    return { texto, clase };
}
 
function analizarMargenes(ebitda, bait, resultado, sector) {
    // Protección contra undefined/null
    if (ebitda === undefined || ebitda === null || isNaN(ebitda) ||
        bait === undefined || bait === null || isNaN(bait) ||
        resultado === undefined || resultado === null || isNaN(resultado)) {
        return { 
            texto: '⚠️ No se pudo calcular márgenes. Verifica: ebitda, ebit (bait), resultado_ejercicio, cifra_ventas.', 
            clase: 'warning' 
        };
    }
    
    let clase = 'positivo';
    let texto = '';
    
    // Análisis EBITDA
    let textoEBITDA = '';
    if (ebitda < 10) {
        textoEBITDA = `EBITDA/Ventas del ${ebitda.toFixed(2)}% es bajo, priorizar eficiencia operativa.`;
        clase = 'negativo';
    } else if (ebitda < 20) {
        textoEBITDA = `EBITDA/Ventas del ${ebitda.toFixed(2)}% es aceptable, existe oportunidad de optimización.`;
        clase = 'warning';
    } else {
        textoEBITDA = `EBITDA/Ventas del ${ebitda.toFixed(2)}% es saludable, buena eficiencia operativa.`;
        clase = 'positivo';
    }
    
    // Análisis BAIT
    let textoBait = '';
    if (bait < 5) {
        textoBait = `BAIT/Ventas del ${bait.toFixed(2)}% indica bajo margen operativo tras amortizaciones.`;
        if (clase !== 'negativo') clase = 'warning';
    } else if (bait < 15) {
        textoBait = `BAIT/Ventas del ${bait.toFixed(2)}% muestra margen operativo moderado.`;
    } else {
        textoBait = `BAIT/Ventas del ${bait.toFixed(2)}% refleja fuerte rentabilidad operativa.`;
    }
    
    // Análisis Resultado
    let textoResultado = '';
    if (resultado < 0) {
        textoResultado = `Resultado/Ventas negativo (${resultado.toFixed(2)}%) indica pérdidas.`;
        clase = 'negativo';
    } else if (resultado < 5) {
        textoResultado = `Resultado/Ventas del ${resultado.toFixed(2)}% es bajo, revisar costes financieros.`;
        if (clase === 'positivo') clase = 'warning';
    } else {
        textoResultado = `Resultado/Ventas del ${resultado.toFixed(2)}% es saludable.`;
    }
    
    texto = `${textoEBITDA} ${textoBait} ${textoResultado}`;
    
    return { texto, clase };
}
 
function analizarSolvenciaCorriente(valor, sector) {
    let clase = 'positivo';
    let texto = '';
    
    // Protección contra undefined/null
    if (valor === undefined || valor === null || isNaN(valor)) {
        return { 
            texto: '⚠️ No se pudo calcular solvencia corriente. Verifica: activo_corriente, pasivo_corriente.', 
            clase: 'warning' 
        };
    }
    
    if (valor < 1) {
        texto = `⚠️ RIESGO: Liquidez de ${valor.toFixed(2)} indica que el activo corriente no cubre el pasivo corriente. Riesgo de suspensión de pagos. Acción urgente: negociar ampliaciones de vencimientos, acelerar cobros o buscar financiación a corto plazo.`;
        clase = 'negativo';
    } else if (valor < 1.5) {
        texto = `Liquidez de ${valor.toFixed(2)} está en zona ajustada. Recomendable mejorar gestión de capital circulante: reducir plazo de cobro y optimizar inventarios.`;
        clase = 'warning';
    } else if (valor < 2) {
        texto = `Buena liquidez de ${valor.toFixed(2)}. La empresa tiene capacidad suficiente para atender obligaciones a corto plazo.`;
        clase = 'positivo';
    } else {
        texto = `Excelente liquidez de ${valor.toFixed(2)}. Amplio margen para afrontar compromisos a corto plazo, aunque valores muy altos pueden indicar exceso de activos improductivos.`;
        clase = 'positivo';
    }
    
    return { texto, clase };
}
 
function analizarApalancamiento(valor, sector) {
    let clase = 'positivo';
    let texto = '';
    
    // Protección contra undefined/null
    if (valor === undefined || valor === null || isNaN(valor)) {
        return { 
            texto: '⚠️ No se pudo calcular apalancamiento. Verifica: fondos_propios, pasivo_no_corriente, pasivo_corriente.', 
            clase: 'warning' 
        };
    }
    
    if (valor < 0.5) {
        texto = `Fondos Ajenos/Fondos Propios de ${valor.toFixed(2)} indica estructura conservadora: por cada euro de patrimonio hay ${valor.toFixed(2)}€ de deuda. Predominan los fondos propios, ofreciendo gran estabilidad financiera. Podría considerarse mayor apalancamiento si existen oportunidades de crecimiento rentables que superen el coste de la deuda.`;
        clase = 'positivo';
    } else if (valor < 1.5) {
        texto = `Ratio de ${valor.toFixed(2)} muestra equilibrio entre fondos propios y ajenos: por cada euro de patrimonio hay ${valor.toFixed(2)}€ de deuda. Balance adecuado que permite flexibilidad financiera sin comprometer la solvencia. La estructura de capital es sostenible y permite afrontar inversiones moderadas.`;
        clase = 'positivo';
    } else {
        texto = `Ratio elevado (${valor.toFixed(2)}) indica que los fondos ajenos superan significativamente a los propios: ${valor.toFixed(2)}€ de deuda por cada euro de patrimonio. Alta dependencia de financiación externa incrementa riesgo financiero y coste de capital. Recomendable reducir deuda gradualmente o ampliar fondos propios para mejorar autonomía financiera.`;
        clase = 'warning';
    }
    
    return { texto, clase };
}
 
 
function agregarAnalisis(chartId, analisis) {
    const container = document.querySelector(`#${chartId}`).parentElement;
    const existente = container.querySelector('.chart-analysis');
    if (existente) existente.remove();
    
    const divAnalisis = document.createElement('div');
    divAnalisis.className = `chart-analysis ${analisis.clase}`;
    divAnalisis.innerHTML = `<strong>📊 Análisis:</strong> ${analisis.texto}`;
    container.appendChild(divAnalisis);
}
 
function agregarTitulosClickeables() {
    const titulos = document.querySelectorAll('.chart-container h3');
    titulos.forEach((titulo, index) => {
        const chartId = titulo.nextElementSibling.id;
        let defKey = '';
        
        if (chartId.includes('Endeudamiento')) defKey = 'endeudamiento';
        else if (chartId.includes('Solvencia') && !chartId.includes('Liquidez')) defKey = 'solvencia_total';
        else if (chartId.includes('Rentabilidad')) defKey = 'roa_roe';
        else if (chartId.includes('Margenes')) defKey = 'margenes';
        else if (chartId.includes('Liquidez')) defKey = 'solvencia_corriente';
        else if (chartId.includes('Balance')) defKey = 'apalancamiento';
        
        if (defKey && definicionesRatios[defKey]) {
            titulo.classList.add('chart-title-clickable');
            titulo.style.cursor = 'pointer';
            titulo.addEventListener('click', () => mostrarDefinicion(definicionesRatios[defKey]));
        }
    });
}
 
function mostrarDefinicion(def) {
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10000;';
    modal.innerHTML = `
        <div style="background:white;padding:30px;border-radius:12px;max-width:600px;margin:20px;">
            <h3 style="color:#1e3c72;margin-bottom:15px;">${def.titulo}</h3>
            <p style="background:#f0f7ff;padding:12px;border-radius:6px;margin:15px 0;font-weight:500;">
                <strong>Fórmula:</strong> ${def.formula}
            </p>
            <p style="line-height:1.6;color:#333;">${def.definicion}</p>
            <button onclick="this.parentElement.parentElement.remove()" style="margin-top:20px;padding:10px 20px;background:#1e3c72;color:white;border:none;border-radius:6px;cursor:pointer;">Cerrar</button>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}
 
// Imprimir/Guardar como PDF usando función nativa del navegador
function imprimirDashboard() {
    // Mensaje informativo
    const confirmar = confirm('Se abrirá la ventana de impresión.\n\nPara guardar como PDF:\n1. En "Destino" selecciona "Guardar como PDF"\n2. Orientación: Horizontal\n3. Click en "Guardar"\n\n¿Continuar?');
    
    if (!confirmar) return;
    
    // Mostrar título y fecha para PDF
    const pdfHeader = document.querySelector('.pdf-header');
    const pdfFecha = document.getElementById('pdfFecha');
    if (pdfHeader && pdfFecha) {
        pdfHeader.style.display = 'block';
        pdfFecha.textContent = new Date().toLocaleDateString('es-ES', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
    }
    
    // Ocultar elementos innecesarios antes de imprimir
    const elementosOcultar = document.querySelectorAll('.main-header, .upload-section, .btn-secondary, .back-button, .header-actions');
    elementosOcultar.forEach(el => {
        if (el) el.style.display = 'none';
    });
    
    // Esperar un momento antes de abrir el diálogo de impresión
    setTimeout(() => {
        window.print();
        
        // Restaurar elementos después de cerrar el diálogo
        setTimeout(() => {
            elementosOcultar.forEach(el => {
                if (el) el.style.display = '';
            });
            if (pdfHeader) pdfHeader.style.display = 'none';
        }, 500);
    }, 100);
}
 
// Exportar tabla a Excel
function exportarExcel() {
    if (!datosGlobales) {
        alert('No hay datos para exportar');
        return;
    }
    
    const años = Object.keys(datosGlobales.ratios);
    const ratios = datosGlobales.ratios;
    
    // Crear datos para Excel
    const datos = [
        ['BETTY - Análisis de Ratios Financieros'],
        [`Fecha: ${new Date().toLocaleDateString('es-ES')}`],
        [],
        ['Ratio', ...años]
    ];
    
    const nombresRatios = {
        'roe': 'ROE (%)',
        'roa': 'ROA (%)',
        'nivel_endeudamiento': 'Nivel Endeudamiento (%)',
        'solvencia_total': 'Solvencia Total',
        'solvencia_corriente': 'Solvencia Corriente',
        'ebitda_ventas': 'EBITDA/Ventas (%)',
        'bait_ventas': 'BAIT/Ventas (%)',
        'resultado_ventas': 'Resultado/Ventas (%)'
    };
    
    Object.keys(nombresRatios).forEach(key => {
        const valores = años.map(a => ratios[a][key] || '');
        datos.push([nombresRatios[key], ...valores]);
    });
    
    // Crear workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(datos);
    
    // Estilos (ancho de columnas)
    ws['!cols'] = [{ wch: 25 }, ...años.map(() => ({ wch: 12 }))];
    
    XLSX.utils.book_append_sheet(wb, ws, 'Ratios');
    XLSX.writeFile(wb, 'BETTY-Ratios-Financieros.xlsx');
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
