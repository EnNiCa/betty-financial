// pilares.js - Dashboard de 4 Pilares v2.0

const uploadBox = document.getElementById('uploadBox');
const fileInput = document.getElementById('fileInput');
const loading = document.getElementById('loading');
const dashboard = document.getElementById('dashboard');

// Restaurar datos al cargar la página
window.addEventListener('DOMContentLoaded', function() {
    const datosGuardados = sessionStorage.getItem('datosPilares');
    if (datosGuardados) {
        try {
            const data = JSON.parse(datosGuardados);
            mostrarPilares(data);
            dashboard.style.display = 'block';
        } catch(e) {
            console.error('Error al restaurar datos:', e);
            sessionStorage.removeItem('datosPilares');
        }
    }
});

if (uploadBox) {
    uploadBox.addEventListener('click', () => fileInput.click());
}

if (fileInput) {
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFile(e.target.files[0]);
    });
}

if (uploadBox) {
    uploadBox.addEventListener('dragover', (e) => { e.preventDefault(); });
    uploadBox.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
    });
}

function handleFile(file) {
    const sector = document.querySelector('input[name="sector"]:checked').value;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('sector', sector);
    
    loading.style.display = 'block';
    dashboard.style.display = 'none';
    
    fetch('/upload-pilares', {
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
        
        // Guardar en sessionStorage
        sessionStorage.setItem('datosPilares', JSON.stringify(data));
        
        mostrarPilares(data);
        loading.style.display = 'none';
        dashboard.style.display = 'block';
    })
    .catch(() => {
        alert('Error al procesar');
        loading.style.display = 'none';
    });
}

function mostrarPilares(data) {
    const { pilares, colores, paletas, umbrales } = data;
    
    // Configuración común de tooltips con 2 decimales
    const tooltipMoney = {
        y: {
            formatter: function(val) {
                return val != null ? val.toLocaleString('es-ES', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' €' : 'N/A';
            }
        }
    };
    
    const tooltipPercent = {
        y: {
            formatter: function(val) {
                return val != null ? val.toFixed(2) + '%' : 'N/A';
            }
        }
    };
    
    // PILAR 1: CASH MANAGEMENT
    document.getElementById('runwayMeses').textContent = pilares.cash_management.runway_meses === 999 ? '∞' : pilares.cash_management.runway_meses.toFixed(1);
    document.getElementById('cajaActual').textContent = formatMoney(pilares.cash_management.caja_actual);
    document.getElementById('burnRate').textContent = formatMoney(pilares.cash_management.burn_rate);
    
    // Proyección de Caja
    new ApexCharts(document.querySelector("#chartProyeccionCaja"), {
        series: [{ name: 'Caja Proyectada', data: pilares.cash_management.proyeccion_caja }],
        chart: { type: 'area', height: 250 },
        colors: [paletas.calor[0]],
        xaxis: { categories: Array.from({length: 12}, (_, i) => `Mes ${i+1}`) },
        tooltip: tooltipMoney
    }).render();
    
    // PILAR 2: EFICIENCIA
    document.getElementById('margenContribucion').textContent = pilares.eficiencia.margen_contribucion.toFixed(2);
    document.getElementById('cac').textContent = formatMoney(pilares.eficiencia.cac);
    document.getElementById('ingresoVenta').textContent = formatMoney(pilares.eficiencia.ingreso_promedio_venta);
    
    // ROI por Canal
    const roiData = Object.entries(pilares.eficiencia.roi_por_canal);
    if (roiData.length > 0) {
        new ApexCharts(document.querySelector("#chartROICanal"), {
            series: [{ name: 'ROI', data: roiData.map(([_, v]) => v.roi) }],
            chart: { type: 'bar', height: 250 },
            colors: [paletas.variada[1]],
            xaxis: { categories: roiData.map(([k]) => k) },
            plotOptions: { bar: { horizontal: true } },
            tooltip: tooltipPercent
        }).render();
    }
    
    // PILAR 3: CRECIMIENTO
    document.getElementById('momGrowth').textContent = pilares.crecimiento.ultimo_mom.toFixed(2);
    
    const tendenciaIcon = pilares.crecimiento.tendencia === 'creciente' ? '📈' : '📉';
    const tendenciaText = pilares.crecimiento.tendencia === 'creciente' ? 'Tendencia creciente' : 'Tendencia decreciente';
    document.getElementById('tendenciaInfo').innerHTML = `<span class="tendencia-icon">${tendenciaIcon}</span><span>${tendenciaText}</span>`;
    
    // Gráfico de Crecimiento
    if (pilares.crecimiento.mom_growth && pilares.crecimiento.mom_growth.length > 0) {
        new ApexCharts(document.querySelector("#chartCrecimiento"), {
            series: [{ name: 'Ventas', data: pilares.crecimiento.mom_growth.map(m => m.ventas) }],
            chart: { type: 'line', height: 250 },
            colors: [paletas.variada[2]],
            xaxis: { categories: pilares.crecimiento.mom_growth.map(m => m.mes) },
            tooltip: tooltipMoney
        }).render();
    }
    
    // PILAR 4: OpEx
    document.getElementById('gastosTotal').textContent = formatMoney(pilares.opex.total_gastos);
    document.getElementById('promedioGastos').textContent = formatMoney(pilares.opex.promedio_gastos_mensual);
    
    // Gastos por Categoría
    new ApexCharts(document.querySelector("#chartOpEx"), {
        series: pilares.opex.gastos_por_categoria.map(g => g.valor),
        labels: pilares.opex.gastos_por_categoria.map(g => g.categoria),
        chart: { type: 'donut', height: 250 },
        colors: paletas.categorias_opex,
        tooltip: tooltipMoney
    }).render();
    
    // Gráfico de Burn Rate
    new ApexCharts(document.querySelector("#chartBurnRate"), {
        series: [{ name: 'Burn Rate', data: pilares.cash_management.burn_rate_historico.valores }],
        chart: { type: 'line', height: 350 },
        colors: [paletas.calor[3]],
        xaxis: { categories: pilares.cash_management.burn_rate_historico.meses },
        tooltip: tooltipMoney
    }).render();
    
    // Ventas por Sector
    if (pilares.crecimiento.ventas_por_sector && pilares.crecimiento.ventas_por_sector.length > 0) {
        new ApexCharts(document.querySelector("#chartVentasSector"), {
            series: pilares.crecimiento.ventas_por_sector.map(v => v.valor),
            labels: pilares.crecimiento.ventas_por_sector.map(v => v.sector),
            chart: { type: 'pie', height: 350 },
            colors: paletas.variada,
            tooltip: tooltipMoney
        }).render();
    }
    
    // Alertas
    generarAlertas(pilares, umbrales);
}

function generarAlertas(pilares, umbrales) {
    const alertas = [];
    
    // Alerta de Runway
    const runway = pilares.cash_management.runway_meses;
    if (runway < umbrales.runway_meses.bajo) {
        alertas.push({
            tipo: 'danger',
            titulo: '🚨 Runway Crítico',
            texto: `Solo quedan ${runway.toFixed(1)} meses de runway. Es urgente buscar financiación o reducir burn rate.`
        });
    } else if (runway < umbrales.runway_meses.alto) {
        alertas.push({
            tipo: 'warning',
            titulo: '⚠️ Runway Ajustado',
            texto: `${runway.toFixed(1)} meses de runway. Considera iniciar conversaciones con inversores.`
        });
    }
    
    // Alerta de Margen de Contribución
    const margen = pilares.eficiencia.margen_contribucion;
    if (margen < umbrales.margen_contribucion.bajo) {
        alertas.push({
            tipo: 'warning',
            titulo: '⚠️ Margen de Contribución Bajo',
            texto: `El margen es del ${margen.toFixed(2)}%. Se recomienda optimizar costos variables o aumentar precios.`
        });
    }
    
    const div = document.getElementById('alertasContent');
    div.innerHTML = alertas.map(a => `
        <div class="alerta-item ${a.tipo}">
            <h4>${a.titulo}</h4>
            <p>${a.texto}</p>
        </div>
    `).join('');
}

function formatMoney(num) {
    if (num === null || num === undefined) return 'N/A';
    return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}
