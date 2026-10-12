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
            gross_burn_rate: pilares.cash_management.gross_burn_rate || 0,
            // Detalle granular, para la descomisión (Fase 6)
            detalleTransacciones: pilares.detalle_transacciones || [],
            // Config de comercializadoras: arranca con el snapshot guardado en la subida,
            // pero se refresca enseguida desde el backend (ver más abajo), porque el usuario
            // puede haber configurado comercializadoras DESPUÉS de subir el Excel.
            comercializadoras: data.comercializadoras || { energia: { luz: [], gas: [] }, telefonia: [], placas_solares: [], alarmas: [] }
        };

        // Mostrar formulario
        document.getElementById('sinDatos').style.display = 'none';
        document.getElementById('formularioProyeccion').style.display = 'block';

        // Rellenar KPIs actuales
        document.getElementById('cajaActual').textContent = formatMoney(datosActuales.caja_disponible);
        document.getElementById('ventasUltimo').textContent = formatMoney(datosActuales.ventas_ultimo_mes);
        document.getElementById('gastosUltimo').textContent = formatMoney(datosActuales.gastos_ultimo_mes);
        document.getElementById('churnRate').textContent = datosActuales.churn_rate.toFixed(2) + '%';

        // Refrescar la config de comercializadoras desde el backend (fuente de verdad actual,
        // por si se configuró o modificó después de la última subida del Excel).
        fetch('/api/configurar-comercializadoras')
            .then(r => r.json())
            .then(d => {
                if (datosActuales && d && d.comercializadoras) {
                    datosActuales.comercializadoras = d.comercializadoras;
                }
            })
            .catch(e => console.error('No se pudo refrescar la configuración de comercializadoras:', e));

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

// ============================================================================
// DESCOMISIÓN (Fase 6): histórica (bajas ya registradas) + simulada (churn futuro)
// ============================================================================

function _parsearPeriodoADias(texto) {
    if (!texto) return null;
    const t = String(texto).toLowerCase();
    const match = t.match(/(\d+(?:[.,]\d+)?)/);
    if (!match) return null;
    const numero = parseFloat(match[1].replace(',', '.'));
    if (isNaN(numero)) return null;
    if (t.includes('año')) return numero * 365;
    if (t.includes('seman')) return numero * 7;
    if (t.includes('día') || t.includes('dia')) return numero;
    // 'mes'/'meses' o sin unidad reconocible: se asume meses de 30 días
    return numero * 30;
}

function _buscarPorcentajeDescomision(config, diasTranscurridos) {
    if (!config || !config.descomision || diasTranscurridos == null) return 0;
    const tramos = config.descomision
        .map(t => ({ dias: _parsearPeriodoADias(t.periodo), porcentaje: parseFloat(t.porcentaje) || 0 }))
        .filter(t => t.dias != null)
        .sort((a, b) => a.dias - b.dias);
    for (const t of tramos) {
        if (diasTranscurridos <= t.dias) return t.porcentaje;
    }
    return 0; // fuera de todos los tramos configurados: ya no hay descomisión
}

// La Categoría del Excel puede venir sin normalizar ("ENERGIA", "TELECO"...), a diferencia
// de los nombres canónicos usados en la config de Comercializadoras. Se normaliza aquí
// (mayúsculas/tildes) para que ambos lados casen siempre.
function _normalizarCategoriaVenta(valor) {
    if (!valor) return '';
    const v = valor.toString().trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (v === 'ENERGIA') return 'Energía';
    if (v === 'TELEFONIA' || v === 'TELECO') return 'Telefonía';
    if (v === 'PLACAS SOLARES' || v === 'PLACAS' || v === 'SOLAR') return 'Placas Solares';
    if (v === 'ALARMAS') return 'Alarmas';
    return valor;
}

// Busca, en la config de comercializadoras, la comercializadora de una venta
// concreta (por sector y luz/gas). La Liquidación y la Descomisión se
// configuran por comercializadora (ya no por tarifa). Misma lógica que en
// Pilares, duplicada aquí porque pilares.js y proyeccion.js son archivos
// separados.
function _buscarConfigComercializadora(comercializadoras, venta) {
    if (!comercializadoras) return null;
    const nombreCom = (venta.comercializadora || '').trim().toLowerCase();
    if (!nombreCom) return null;

    const categoria = _normalizarCategoriaVenta(venta.categoria);
    let lista = [];
    if (categoria === 'Energía') {
        const sub = (venta.tipo_energia || '').toLowerCase() === 'gas' ? 'gas' : 'luz';
        lista = (comercializadoras.energia && comercializadoras.energia[sub]) || [];
    } else if (categoria === 'Telefonía') {
        lista = comercializadoras.telefonia || [];
    } else {
        return null; // Placas Solares / Alarmas: sin descomisión
    }

    return lista.find(c => (c.comercializadora || '').trim().toLowerCase() === nombreCom) || null;
}

function _diasEntre(fechaIni, fechaFin) {
    const a = new Date(fechaIni);
    const b = new Date(fechaFin);
    if (isNaN(a) || isNaN(b)) return null;
    return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function _diaValidoDelMes(year, month, day) {
    // Clampa al último día del mes si el día configurado no existe en ese mes (ej. 31 en febrero).
    const ultimoDia = new Date(year, month + 1, 0).getDate();
    return new Date(year, month, Math.min(day, ultimoDia));
}

function _formatearFecha(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Fecha de liquidación: el primer día configurado (hasta 3 por comercializadora)
// que cae en o después de `fechaRef`; si ninguno cae ya en ese mes, el primero
// del mes siguiente. Sin días configurados: por defecto, día 1 del mes
// siguiente a `fechaRef`. Misma lógica que en Pilares.
function _calcularFechaLiquidacion(fechaRef, diasLiquidacion) {
    if (!fechaRef) return null;
    const fecha = new Date(fechaRef + 'T00:00:00');
    if (isNaN(fecha)) return null;

    const diasValidos = Array.from(new Set((Array.isArray(diasLiquidacion) ? diasLiquidacion : [])
        .map(d => parseInt(d, 10))
        .filter(d => !isNaN(d) && d >= 1 && d <= 31))).sort((a, b) => a - b);

    const y = fecha.getFullYear(), m = fecha.getMonth(), diaRef = fecha.getDate();

    if (diasValidos.length === 0) {
        return _formatearFecha(_diaValidoDelMes(y, m + 1, 1));
    }
    for (const d of diasValidos) {
        if (d >= diaRef) return _formatearFecha(_diaValidoDelMes(y, m, d));
    }
    return _formatearFecha(_diaValidoDelMes(y, m + 1, diasValidos[0]));
}

function _diferenciaMesesEntre(yyyyMMa, yyyyMMb) {
    const [ya, ma] = yyyyMMa.split('-').map(Number);
    const [yb, mb] = yyyyMMb.split('-').map(Number);
    return (yb - ya) * 12 + (mb - ma);
}

function _obtenerUltimoMes(detalle) {
    let max = null;
    (detalle || []).forEach(v => { if (v.mes && (!max || v.mes > max)) max = v.mes; });
    return max || new Date().toISOString().slice(0, 7);
}

// Agenda de descomisión histórica: ventas con fecha de baja YA registrada en el Excel.
// El % de descomisión se aplica sobre el Importe de la venta (no sobre la comisión
// comercial "Com Eur Pagar", que es un concepto distinto). Se ubica en la primera
// fecha de liquidación (según la config de la comercializadora) a partir de la baja.
// Devuelve { indiceMesProyectado (1-12): montoADescontarEseMes }
function construirAgendaDescomisionHistorica(detalle, comercializadoras, ultimoMesHistorico) {
    const agenda = {};
    (detalle || []).forEach(venta => {
        if (!venta.fecha_baja || !(venta.importe > 0)) return;
        const config = _buscarConfigComercializadora(comercializadoras, venta);
        if (!config) return;

        const fechaRef = venta.fecha_activacion || venta.fecha;
        const dias = _diasEntre(fechaRef, venta.fecha_baja);
        const pct = _buscarPorcentajeDescomision(config, dias);
        if (!pct) return;

        const monto = venta.importe * (pct / 100);
        const fechaAjuste = _calcularFechaLiquidacion(venta.fecha_baja, config.liquidacion);
        const mesDescomision = fechaAjuste.slice(0, 7);
        const offset = _diferenciaMesesEntre(ultimoMesHistorico, mesDescomision);

        if (offset >= 1 && offset <= 12) {
            agenda[offset] = (agenda[offset] || 0) + monto;
        }
    });
    return agenda;
}

// Tasa de descomisión efectiva histórica, ponderada por importe: aproxima qué % del
// importe de una venta "media" se perdería si el cliente causara baja de inmediato.
// Simplificación explícita: aproxima "% de clientes que causan baja" por "% de
// ingresos en riesgo", ya que no se puede saber por anticipado qué ventas futuras
// concretas causarán baja ni con qué comercializadora.
function calcularTasaDescomisionEfectiva(detalle, comercializadoras) {
    let totalImporte = 0, totalDescomisionPotencial = 0;
    (detalle || []).forEach(venta => {
        if (!(venta.importe > 0)) return;
        const config = _buscarConfigComercializadora(comercializadoras, venta);
        if (!config) return;
        const pct = _buscarPorcentajeDescomision(config, 0);
        totalImporte += venta.importe;
        totalDescomisionPotencial += venta.importe * (pct / 100);
    });
    return totalImporte > 0 ? (totalDescomisionPotencial / totalImporte) : 0;
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
    const descomisionesProyectadas = [];

    let cajaActual = datosActuales.caja_disponible;
    let ventasBase = datosActuales.ventas_ultimo_mes;
    let gastosBase = datosActuales.gastos_ultimo_mes;

    // --- Descomisión (Fase 6) ---
    const detalle = datosActuales.detalleTransacciones || [];
    const comercializadoras = datosActuales.comercializadoras;
    const ultimoMesHistorico = _obtenerUltimoMes(detalle);
    const agendaHistorica = construirAgendaDescomisionHistorica(detalle, comercializadoras, ultimoMesHistorico);
    const tasaDescomisionEfectiva = calcularTasaDescomisionEfectiva(detalle, comercializadoras);
    const churnFraccion = (datosActuales.churn_rate || 0) / 100;
    const descomisionSimuladaPendiente = {}; // { indiceMes: monto }, se va generando mes a mes

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

        // 2b. DESCOMISIÓN DEL MES (Fase 6): histórica (bajas ya registradas en el Excel)
        // + simulada (bajas futuras estimadas a partir del Churn Rate sobre las ventas
        // proyectadas de meses anteriores).
        let descomisionMes = agendaHistorica[i] || 0;
        descomisionMes += descomisionSimuladaPendiente[i] || 0;
        descomisionesProyectadas.push(descomisionMes);

        // Las ventas proyectadas de ESTE mes generan ingresos; una fracción de esos
        // clientes (según el Churn Rate) causará baja, y de ese importe se recupera
        // (descomisiona) la tasa efectiva histórica. Simplificación: al no conocer la
        // comercializadora de ventas futuras, se aplica siempre al mes siguiente (no
        // se puede calcular una fecha de liquidación exacta sin esa comercializadora).
        if (i < 12) {
            const importeEnRiesgo = ingresosMes * churnFraccion;
            const descomisionSimuladaFutura = importeEnRiesgo * tasaDescomisionEfectiva;
            descomisionSimuladaPendiente[i + 1] = (descomisionSimuladaPendiente[i + 1] || 0) + descomisionSimuladaFutura;
        }

        // 3. CALCULAR CAJA (ingresos - gastos - descomisión del mes)
        cajaActual = cajaActual + ingresosMes - gastosMes - descomisionMes;
        cajaProyectada.push(Math.max(0, cajaActual)); // No puede ser negativa

        // 4. BURN RATES
        const netBurn = gastosMes - ingresosMes + descomisionMes;
        const grossBurn = gastosMes + descomisionMes;

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
        descomisionesProyectadas,
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
    
    // Gráfico 2: Ingresos, Gastos y Descomisiones
    new ApexCharts(document.querySelector("#chartIngresosGastos"), {
        series: [
            { name: 'Ingresos', type: 'column', data: p.ingresosProyectados },
            { name: 'Gastos', type: 'column', data: p.gastosProyectados },
            { name: 'Descomisiones', type: 'line', data: p.descomisionesProyectadas }
        ],
        chart: { height: 350, type: 'line', toolbar: { show: true } },
        colors: ['#10b981', '#ef4444', '#8b5cf6'],
        stroke: { width: [0, 0, 3], curve: 'smooth' },
        plotOptions: {
            bar: {
                columnWidth: '50%'
            }
        },
        fill: { opacity: [0.85, 0.85, 1] },
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
