// proyeccion.js - Proyección de Caja 12 meses v4.0

let datosActuales = null;
let proyeccionCalculada = null;

// Cargar datos al iniciar
window.addEventListener('DOMContentLoaded', function() {
    cargarDatosActuales();
});

function cargarDatosActuales() {
    // Intentar obtener datos de sessionStorage
    const datosPilares = sessionStorage.getItem('datosPilares');
    
    if (!datosPilares) {
        // No hay datos, mostrar mensaje
        document.getElementById('sinDatos').style.display = 'block';
        document.getElementById('formularioProyeccion').style.display = 'none';
        return;
    }
    
    try {
        const data = JSON.parse(datosPilares);
        const pilares = data.pilares;
        
        // Extraer datos necesarios
        datosActuales = {
            caja_disponible: pilares.cash_management.caja_disponible || 0,
            ventas_ultimo_mes: obtenerVentasUltimoMes(pilares.crecimiento),
            gastos_ultimo_mes: pilares.opex.promedio_gastos_mensual || 0,
            churn_rate: pilares.eficiencia.churn_rate || 0,
            net_burn_rate: pilares.cash_management.net_burn_rate || 0,
            gross_burn_rate: pilares.cash_management.gross_burn_rate || 0
        };
        
        // Mostrar formulario
        document.getElementById('sinDatos').style.display = 'none';
        document.getElementById('formularioProyeccion').style.display = 'block';
        
        // Rellenar KPIs actuales
        document.getElementById('cajaActual').textContent = formatMoney(datosActuales.caja_disponible);
        document.getElementById('ventasUltimo').textContent = formatMoney(datosActuales.ventas_ultimo_mes);
        document.getElementById('gastosUltimo').textContent = formatMoney(datosActuales.gastos_ultimo_mes);
        document.getElementById('churnRate').textContent = datosActuales.churn_rate.toFixed(2) + '%';
        
    } catch (e) {
        console.error('Error al cargar datos:', e);
        document.getElementById('sinDatos').style.display = 'block';
    }
}

function obtenerVentasUltimoMes(crecimiento) {
    if (crecimiento.ventas_mensuales && crecimiento.ventas_mensuales.length > 0) {
        return crecimiento.ventas_mensuales[crecimiento.ventas_mensuales.length - 1].ventas;
    }
    return 0;
}

function calcularProyeccion() {
    if (!datosActuales) {
        alert('No hay datos cargados');
        return;
    }
    
    // Obtener método de ingresos seleccionado
    const metodoIngresos = document.querySelector('input[name="metodo_ingresos"]:checked').value;
    
    // Obtener parámetros de gastos
    const incrementoGastos = parseFloat(document.getElementById('incremento_gastos').value) || 0;
    
    // Arrays de proyección
    const meses = [];
    const ingresosProyectados = [];
    const gastosProyectados = [];
    const cajaProyectada = [];
    const netBurnProyectado = [];
    const grossBurnProyectado = [];
    
    let cajaActual = datosActuales.caja_disponible;
    let ventasBase = datosActuales.ventas_ultimo_mes;
    let gastosBase = datosActuales.gastos_ultimo_mes;
    
    // Calcular proyección para 12 meses
    for (let i = 1; i <= 12; i++) {
        meses.push(`Mes ${i}`);
        
        // 1. PROYECCIÓN DE INGRESOS según método seleccionado
        let ingresosMes = 0;
        
        if (metodoIngresos === 'porcentaje') {
            const incrementoVentas = parseFloat(document.getElementById('incremento_ventas').value) || 0;
            ventasBase = ventasBase * (1 + incrementoVentas / 100);
            ingresosMes = ventasBase;
            
        } else if (metodoIngresos === 'funnel') {
            const visitasWeb = parseFloat(document.getElementById('visitas_web').value) || 0;
            const tasaConversion = parseFloat(document.getElementById('tasa_conversion').value) || 0;
            const ticketMedio = parseFloat(document.getElementById('ticket_medio').value) || 0;
            
            ingresosMes = visitasWeb * (tasaConversion / 100) * ticketMedio;
            
        } else if (metodoIngresos === 'comerciales') {
            const numComerciales = parseFloat(document.getElementById('num_comerciales').value) || 0;
            const ventasComercial = parseFloat(document.getElementById('ventas_comercial').value) || 0;
            const ticketMedioCom = parseFloat(document.getElementById('ticket_medio_com').value) || 0;
            
            ingresosMes = numComerciales * ventasComercial * ticketMedioCom;
        }
        
        ingresosProyectados.push(ingresosMes);
        
        // 2. PROYECCIÓN DE GASTOS
        gastosBase = gastosBase * (1 + incrementoGastos / 100);
        const gastosMes = gastosBase;
        gastosProyectados.push(gastosMes);
        
        // 3. CALCULAR CAJA
        cajaActual = cajaActual + ingresosMes - gastosMes;
        cajaProyectada.push(Math.max(0, cajaActual)); // No puede ser negativa
        
        // 4. BURN RATES
        const netBurn = gastosMes - ingresosMes;
        const grossBurn = gastosMes;
        
        netBurnProyectado.push(netBurn);
        grossBurnProyectado.push(grossBurn);
    }
    
    // Calcular métricas promedio
    const netBurnPromedio = netBurnProyectado.reduce((a, b) => a + b, 0) / 12;
    const grossBurnPromedio = grossBurnProyectado.reduce((a, b) => a + b, 0) / 12;
    const cajaFinal = cajaProyectada[cajaProyectada.length - 1];
    
    // Determinar tipo de escenario y métrica
    let tipoEscenario = '';
    let labelMetrica = '';
    let valorMetrica = '';
    
    if (netBurnPromedio > 0) {
        tipoEscenario = '⚠️ Consumiendo Caja';
        labelMetrica = 'Runway Proyectado';
        const runway = cajaFinal / netBurnPromedio;
        valorMetrica = runway.toFixed(1) + ' meses';
    } else if (netBurnPromedio === 0) {
        tipoEscenario = '⚖️ Equilibrio';
        labelMetrica = 'Estado';
        valorMetrica = 'Equilibrio perfecto';
    } else {
        tipoEscenario = '✅ Generando Caja';
        labelMetrica = 'Meses de Reserva';
        const mesesReserva = cajaFinal / grossBurnPromedio;
        valorMetrica = mesesReserva.toFixed(1) + ' meses';
    }
    
    // Guardar proyección calculada
    proyeccionCalculada = {
        meses,
        ingresosProyectados,
        gastosProyectados,
        cajaProyectada,
        netBurnProyectado,
        grossBurnProyectado,
        netBurnPromedio,
        grossBurnPromedio,
        tipoEscenario,
        labelMetrica,
        valorMetrica
    };
    
    // Mostrar resultados
    mostrarResultados();
}

function mostrarResultados() {
    if (!proyeccionCalculada) return;
    
    const p = proyeccionCalculada;
    
    // Ocultar formulario, mostrar resultados
    document.getElementById('formularioProyeccion').style.display = 'none';
    document.getElementById('resultadosProyeccion').style.display = 'block';
    
    // Mostrar botón PDF
    const btnPDF = document.getElementById('btnExportarPDF');
    if (btnPDF) btnPDF.style.display = 'inline-flex';
    
    // Rellenar KPIs
    document.getElementById('tipoEscenario').textContent = p.tipoEscenario;
    document.getElementById('labelMetrica').textContent = p.labelMetrica;
    document.getElementById('valorMetrica').textContent = p.valorMetrica;
    document.getElementById('netBurnProyectado').textContent = formatMoney(p.netBurnPromedio) + '/mes';
    document.getElementById('grossBurnProyectado').textContent = formatMoney(p.grossBurnPromedio) + '/mes';
    
    // Gráfico 1: Proyección de Caja
    new ApexCharts(document.querySelector("#chartProyeccionCaja"), {
        series: [{ name: 'Caja Proyectada', data: p.cajaProyectada }],
        chart: { type: 'area', height: 350, toolbar: { show: true } },
        colors: ['#10b981'],
        fill: {
            type: 'gradient',
            gradient: {
                shadeIntensity: 1,
                opacityFrom: 0.7,
                opacityTo: 0.3,
                stops: [0, 90, 100]
            }
        },
        dataLabels: { enabled: false },
        stroke: { curve: 'smooth', width: 3 },
        xaxis: { categories: p.meses },
        yaxis: {
            title: { text: 'Caja (€)' },
            labels: {
                formatter: function(val) {
                    return formatMoneyShort(val);
                }
            }
        },
        tooltip: {
            y: {
                formatter: function(val) {
                    return formatMoney(val);
                }
            }
        }
    }).render();
    
    // Gráfico 2: Ingresos y Gastos
    new ApexCharts(document.querySelector("#chartIngresosGastos"), {
        series: [
            { name: 'Ingresos', type: 'column', data: p.ingresosProyectados },
            { name: 'Gastos', type: 'column', data: p.gastosProyectados }
        ],
        chart: { height: 350, type: 'line', toolbar: { show: true } },
        colors: ['#10b981', '#ef4444'],
        stroke: { width: [0, 0] },
        plotOptions: {
            bar: {
                columnWidth: '50%'
            }
        },
        fill: { opacity: [0.85, 0.85] },
        labels: p.meses,
        xaxis: { type: 'category' },
        yaxis: {
            title: { text: 'Importe (€)' },
            labels: {
                formatter: function(val) {
                    return formatMoneyShort(val);
                }
            }
        },
        legend: { position: 'top' },
        tooltip: {
            shared: true,
            intersect: false,
            y: {
                formatter: function(val) {
                    return formatMoney(val);
                }
            }
        }
    }).render();
    
    // Gráfico 3: Burn Rates
    new ApexCharts(document.querySelector("#chartBurnRates"), {
        series: [
            { name: 'Net Burn Rate', data: p.netBurnProyectado },
            { name: 'Gross Burn Rate', data: p.grossBurnProyectado }
        ],
        chart: { type: 'line', height: 300, toolbar: { show: true } },
        colors: ['#ef4444', '#f59e0b'],
        stroke: { width: [3, 3], curve: 'smooth' },
        markers: { size: 5 },
        xaxis: { categories: p.meses },
        yaxis: {
            title: { text: 'Burn Rate (€/mes)' },
            labels: {
                formatter: function(val) {
                    return formatMoneyShort(val);
                }
            }
        },
        legend: { position: 'top' },
        tooltip: {
            y: {
                formatter: function(val) {
                    return formatMoney(val);
                }
            }
        }
    }).render();
    
    // Scroll al inicio de resultados
    window.scrollTo(0, 0);
}

function volverFormulario() {
    document.getElementById('resultadosProyeccion').style.display = 'none';
    document.getElementById('formularioProyeccion').style.display = 'block';
    
    // Ocultar botón PDF
    const btnPDF = document.getElementById('btnExportarPDF');
    if (btnPDF) btnPDF.style.display = 'none';
    
    window.scrollTo(0, 0);
}

function formatMoney(num) {
    if (num === null || num === undefined) return 'N/A';
    return new Intl.NumberFormat('es-ES', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
    }).format(num) + ' €';
}

function formatMoneyShort(num) {
    if (num === null || num === undefined) return '';
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M€';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'k€';
    }
    return num.toFixed(0) + '€';
}

// Función exportar PDF
function exportarPDFProyeccion() {
    const confirmar = confirm('Se abrirá la ventana de impresión.\n\nPara guardar como PDF:\n1. En "Destino" selecciona "Guardar como PDF"\n2. Orientación: Horizontal\n3. Click en "Guardar"\n\n¿Continuar?');
    
    if (!confirmar) return;
    
    const elementosOcultar = document.querySelectorAll('.main-header, .back-button, .header-actions, .action-section');
    elementosOcultar.forEach(el => {
        if (el) el.style.display = 'none';
    });
    
    setTimeout(() => {
        window.print();
        
        setTimeout(() => {
            elementosOcultar.forEach(el => {
                if (el) el.style.display = '';
            });
        }, 500);
    }, 100);
}

// Conectar botón PDF
document.addEventListener('DOMContentLoaded', function() {
    const btnPDF = document.getElementById('btnExportarPDF');
    if (btnPDF) {
        btnPDF.addEventListener('click', exportarPDFProyeccion);
    }
});
