// pilares.js - Dashboard de 4 Pilares v4.0 con gráficos actualizados

const uploadBox = document.getElementById('uploadBox');
const fileInput = document.getElementById('fileInput');
const loading = document.getElementById('loading');
const dashboard = document.getElementById('dashboard');

// Estado del motor de gráficos jerárquicos (Ventas/Bajas por sector -> comercializadora -> luz/gas)
let detalleGlobal = [];
let detalleGastosGlobal = [];
let pilaresActual = null;
let paletasGlobal = null;
const estadoJerarquico = {
    ventas: { nivel: 0, sector: null, comercializadora: null },
    bajas: { nivel: 0, sector: null, comercializadora: null, mes: null }
};
const chartInstancesJerarquico = { ventas: null, bajas: null };

// Granularidad mensual/diario para Combinado (Ingresos/Gastos/Caja), Crecimiento y OpEx.
// El resto de Cash Management (Runway, Burn Rate) y Eficiencia (CAC/Churn/Margen) quedan
// siempre mensuales, ya que son conceptos de tasa mensual.
let granularidadCombinado = 'mensual';
let granularidadCrecimiento = 'mensual';
let granularidadOpEx = 'mensual';
const chartInstancesExtra = { combinado: null, crecimiento: null, opex: null };

// Caja Efectiva vs Caja Proyectada (Ingresos cobrados vs cobrados+pendientes de liquidar)
let proyectadoActivo = false;
let comercializadorasActual = null;

// Unit Economics (Eficiencia) por sector: estado del drill-down del chart compartido
// chartROICanal (ROI por Subcanal <-> Margen/CAC/Ingreso Medio/LTV por sector)
let eficienciaActual = null;
let vistaEficienciaActual = null; // null = ROI por Subcanal; si no, {metrica, unidad}
const chartInstanceEficiencia = { instancia: null };

// Al recargar la página siempre se parte en limpio, lista para un nuevo archivo
window.addEventListener('DOMContentLoaded', function() {
    sessionStorage.removeItem('datosPilares');
});

if (uploadBox) {
    uploadBox.addEventListener('click', () => fileInput.click());
}

if (fileInput) {
    fileInput.addEventListener('change', procesarArchivo);
}

const btnConfigComercializadoras = document.getElementById('btnConfigComercializadoras');
if (btnConfigComercializadoras) {
    btnConfigComercializadoras.addEventListener('click', abrirModalComercializadoras);
}

function procesarArchivo(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    // Obtener sector seleccionado
    const sectorRadio = document.querySelector('input[name="sector"]:checked');
    const sector = sectorRadio ? sectorRadio.value : 'otros';
    formData.append('sector', sector);
    
    loading.style.display = 'flex';
    
    fetch('/api/analizar-pilares', {
        method: 'POST',
        body: formData
    })
    .then(res => {
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
    })
    .then(data => {
        if (data.error) {
            alert(data.error);
            loading.style.display = 'none';
            return;
        }
        
        // Guardar en sessionStorage
        sessionStorage.setItem('datosPilares', JSON.stringify(data));
        
        mostrarPilares(data);
        loading.style.display = 'none';
        dashboard.style.display = 'block';
        
        // Mostrar botón exportar PDF
        const btnPDF = document.getElementById('btnExportarPDF');
        if (btnPDF) btnPDF.style.display = 'inline-flex';
    })
    .catch(() => {
        alert('Error al procesar');
        loading.style.display = 'none';
    });
}

function mostrarPilares(data) {
    const { pilares, colores, paletas, umbrales } = data;

    // Detalle granular para filtros de fecha/dimensión y gráficos de drill-down (Fase 4-5)
    detalleGlobal = pilares.detalle_transacciones || [];
    detalleGastosGlobal = pilares.detalle_gastos || [];
    pilaresActual = pilares;
    paletasGlobal = paletas;
    comercializadorasActual = data.comercializadoras || { energia: { luz: [], gas: [] }, telefonia: [], placas_solares: [], alarmas: [] };
    granularidadCombinado = 'mensual';
    granularidadCrecimiento = 'mensual';
    granularidadOpEx = 'mensual';
    proyectadoActivo = false;
    const btnProyectadoReset = document.getElementById('btnToggleProyectado');
    if (btnProyectadoReset) { btnProyectadoReset.classList.remove('active'); btnProyectadoReset.disabled = false; }
    document.querySelectorAll('.toggle-granularidad .toggle-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.modo === 'mensual');
    });
    vistaEficienciaActual = null;
    const selSectorROIReset = document.getElementById('filtroSectorROI');
    if (selSectorROIReset) selSectorROIReset.value = '';

    // Limpiar gráficos y análisis de una ejecución previa (evita superposición
    // de gráficos y texto de análisis "congelado" si se sube un nuevo Excel
    // sin recargar la página)
    const idsGraficos = ['chartProyeccionCaja', 'chartCombinado', 'chartROICanal', 'chartCrecimiento', 'chartVentasSector', 'chartOpEx'];
    idsGraficos.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.innerHTML = '';
            const contenedor = el.closest('.pilar-chart') || el.closest('.chart-container');
            if (contenedor) {
                const analisisPrevio = contenedor.querySelector('.chart-analysis');
                if (analisisPrevio) analisisPrevio.remove();
            }
        }
    });
    
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
    
    // ==========================================
    // PILAR 1: CASH MANAGEMENT
    // ==========================================
    
    const cm = pilares.cash_management;
    
    if (cm.tipo_metrica === 'runway') {
        document.getElementById('runwayLabel').textContent = 'Runway';
        document.getElementById('runwayMeses').textContent = cm.runway_meses != null ? cm.runway_meses.toFixed(1) : '-';
    } else if (cm.tipo_metrica === 'reserva') {
        document.getElementById('runwayLabel').textContent = 'Meses de Reserva';
        document.getElementById('runwayMeses').textContent = cm.meses_reserva != null ? cm.meses_reserva.toFixed(1) : '-';
    } else {
        document.getElementById('runwayLabel').textContent = 'Runway';
        document.getElementById('runwayMeses').textContent = '∞ (equilibrio)';
    }
    
    document.getElementById('cajaActual').textContent = formatMoney(cm.caja_disponible);
    document.getElementById('grossBurnPromedio').textContent = formatMoney(cm.gross_burn_rate);
    document.getElementById('burnRate').textContent = formatMoney(cm.net_burn_rate);
    document.getElementById('netBurnUltimoMes').textContent = formatMoney(cm.net_burn_ultimo_mes);
    
    // GRÁFICO DE BARRAS: Net Burn Rate vs Gross Burn Rate por mes
    // (reemplaza la antigua "Proyección de Caja a 12 meses")
    if (cm.burn_comparativo && cm.burn_comparativo.length > 0) {
        new ApexCharts(document.querySelector("#chartProyeccionCaja"), {
            series: [
                { name: 'Gross Burn Rate', data: cm.burn_comparativo.map(b => b.gross_burn) },
                { name: 'Net Burn Rate', data: cm.burn_comparativo.map(b => b.net_burn) }
            ],
            chart: { type: 'bar', height: 280, toolbar: { show: true } },
            colors: ['#f59e0b', '#ef4444'],
            plotOptions: {
                // Etiqueta pegada al borde EXTERIOR de la barra (fuera, no dentro), igual que
                // en ROI por Subcanal: con meses de burn rate bajo (barras pequeñas) el texto
                // no cabía dentro y se veía cortado.
                bar: { columnWidth: '55%', borderRadius: 3, dataLabels: { position: 'top' } }
            },
            dataLabels: {
                enabled: true,
                formatter: val => (val != null ? val.toLocaleString('es-ES', { maximumFractionDigits: 0 }) + '€' : ''),
                offsetY: -20,
                style: { fontSize: '12px', fontWeight: 600, colors: ['#1e293b'] }
            },
            xaxis: { categories: cm.burn_comparativo.map(b => b.mes) },
            yaxis: {
                title: { text: 'Burn Rate (€/mes)' },
                labels: {
                    formatter: function(val) {
                        return val != null ? val.toLocaleString('es-ES', {maximumFractionDigits: 0}) + '€' : '';
                    }
                }
            },
            legend: { position: 'top' },
            tooltip: tooltipMoney
        }).render();
        
        // Análisis del gráfico de burn rates
        const netBurnPromedio = cm.net_burn_rate;
        const grossBurnPromedio = cm.gross_burn_rate;
        let claseBurn = 'info';
        let analisisBurn = `El <strong>Net Burn Rate</strong> (€${formatMoney(netBurnPromedio)}/mes promedio) es la diferencia entre salidas y entradas de caja. `;
        analisisBurn += `El <strong>Gross Burn Rate</strong> (€${formatMoney(grossBurnPromedio)}/mes promedio) son los gastos totales por mes. `;
        
        if (netBurnPromedio > 0) {
            analisisBurn += `La empresa está <strong>consumiendo caja</strong> (pérdidas).`;
            claseBurn = grossBurnPromedio > 0 && (netBurnPromedio / grossBurnPromedio) > 0.6 ? 'negative' : 'warning';
        } else if (netBurnPromedio < 0) {
            analisisBurn += `La empresa está <strong>generando caja</strong> (rentable).`;
            claseBurn = 'positive';
        } else {
            analisisBurn += `La empresa está en <strong>punto de equilibrio</strong> (breakeven). Monitoriza de cerca.`;
            claseBurn = 'info';
        }
        
        const containerBurn = document.querySelector("#chartProyeccionCaja").closest('.pilar-chart');
        if (containerBurn) {
            const analisisPrevio = containerBurn.querySelector('.chart-analysis');
            if (analisisPrevio) analisisPrevio.remove();
            
            const pAnalisis = document.createElement('div');
            pAnalisis.className = `chart-analysis ${claseBurn}`;
            pAnalisis.innerHTML = analisisBurn;
            containerBurn.appendChild(pAnalisis);
        }
    }
    
    // GRÁFICO COMBINADO: Ingresos/Gastos/Caja — mensual o diario (toggle)
    renderGraficoCombinado();

    // ==========================================
    // PILAR 2: EFICIENCIA
    // ==========================================
    
    const ef = pilares.eficiencia;
    eficienciaActual = ef;

    document.getElementById('margenContribucion').textContent = ef.margen_contribucion.toFixed(2);
    const comentarioMargen = document.getElementById('margenContribucionComentario');
    if (comentarioMargen) {
        comentarioMargen.textContent = `💡 Dispones de un ${ef.margen_contribucion.toFixed(2)}% de tus ingresos para cubrir gastos fijos.`;
    }
    document.getElementById('cac').textContent = formatMoney(ef.cac);
    document.getElementById('ingresoVenta').textContent = ef.churn_rate != null ? ef.churn_rate.toFixed(2) + '%' : '0%';
    document.getElementById('ingresoMedioCliente').textContent = formatMoney(ef.ingreso_medio_cliente);
    document.getElementById('ltvValor').textContent = formatMoney(ef.ltv);

    // Unit Economics por sector: ROI por Subcanal (con filtro de sector) + drill-down
    // de Margen/CAC/Ingreso Medio/LTV por sector (Energía/Telefonía/Placas Solares/Alarmas)
    inicializarEficienciaPorSector();
    
    // ==========================================
    // PILAR 3: CRECIMIENTO
    // ==========================================
    
    const cr = pilares.crecimiento;
    
    document.getElementById('momGrowth').textContent = cr.ultimo_mom.toFixed(2);
    
    const tendenciaIcon = cr.tendencia === 'creciente' ? '📈' : '📉';
    const tendenciaText = cr.tendencia === 'creciente' ? 'Tendencia creciente' : 'Tendencia decreciente';
    document.getElementById('tendenciaInfo').innerHTML = `<span class="tendencia-icon">${tendenciaIcon}</span><span>${tendenciaText}</span>`;
    
    // Gráfico Evolución de Ventas con Variación % — mensual o diario (toggle)
    renderGraficoCrecimiento();

    // Nota: "Ventas por Sector y Total Mensual" (#chartVentasSector) ya NO se renderiza aquí;
    // ahora es el gráfico jerárquico con filtros (renderGraficoVentasJerarquico, en
    // inicializarFiltrosYJerarquicos más abajo), que sustituye a este gráfico mensual simple.

    // ==========================================
    // PILAR 4: OpEx
    // ==========================================
    
    const op = pilares.opex;
    
    document.getElementById('gastosTotal').textContent = formatMoney(op.total_gastos);
    document.getElementById('promedioGastos').textContent = formatMoney(op.promedio_gastos_mensual);
    
    // Gráfico de Gastos por Categoría — mensual o diario (toggle)
    renderGraficoOpEx();

    // ==========================================
    // ELIMINAR: Gráfico de Burn Rate viejo (ya no se usa)
    // Se reemplazó por chartBurnRates arriba
    // ==========================================
    
    // Alertas
    generarAlertas(pilares, umbrales);

    // Agregar análisis a los gráficos (después de que se rendericen)
    setTimeout(() => agregarAnalisisGraficos(pilares), 1000);

    // Filtros de fecha/dimensión + gráficos jerárquicos de Ventas y Bajas (Fase 4-5)
    inicializarFiltrosYJerarquicos();
}

function agregarAnalisisGraficos(pilares) {
    const cm = pilares.cash_management;
    const ef = pilares.eficiencia;
    const cr = pilares.crecimiento;
    const op = pilares.opex;
    
    // 2. ANÁLISIS COMBINADO INGRESOS/GASTOS/CAJA
    const containerComb = document.querySelector("#chartCombinado")?.closest('.chart-container');
    if (containerComb && cm.combinado_mensual && cm.combinado_mensual.length > 0) {
        const analisisPrevioComb = containerComb.querySelector('.chart-analysis');
        if (analisisPrevioComb) analisisPrevioComb.remove();
        
        const ultimo = cm.combinado_mensual[cm.combinado_mensual.length - 1];
        const primero = cm.combinado_mensual[0];
        const ratio = (ultimo.ingresos / ultimo.gastos).toFixed(2);
        const variacionCaja = ((ultimo.caja - primero.caja) / primero.caja * 100).toFixed(1);
        
        let clase = 'info';
        let texto = `<strong>Último mes:</strong> Ingresos €${formatMoney(ultimo.ingresos)} vs Gastos €${formatMoney(ultimo.gastos)} (ratio ${ratio}x). `;
        
        if (variacionCaja > 0) {
            texto += `La caja creció <strong>+${variacionCaja}%</strong> desde el inicio.`;
            clase = 'positive';
        } else if (variacionCaja < -20) {
            texto += `La caja disminuyó <strong>${variacionCaja}%</strong> desde el inicio.`;
            clase = 'negative';
        } else {
            texto += `La caja disminuyó <strong>${variacionCaja}%</strong> desde el inicio.`;
            clase = 'warning';
        }
        
        const p = document.createElement('div');
        p.className = `chart-analysis ${clase}`;
        p.innerHTML = texto;
        containerComb.appendChild(p);
    }
    
    // 4. ANÁLISIS ROI POR SUBCANAL: ya NO se genera aquí. Ahora lo gestionan
    // renderGraficoROISubcanal / renderGraficoMetricaPorSector (ver _actualizarInterpretacionEficiencia),
    // que lo recalculan cada vez que cambia la vista (sector/métrica seleccionados),
    // evitando que este bloque estático (con datos siempre globales) lo pisara 1s después.

    // 5. ANÁLISIS EVOLUCIÓN VENTAS
    const containerVentas = document.querySelector("#chartCrecimiento")?.closest('.pilar-chart');
    if (containerVentas) {
        const analisisPrevioVentas = containerVentas.querySelector('.chart-analysis');
        if (analisisPrevioVentas) analisisPrevioVentas.remove();
        
        const momGrowth = cr.ultimo_mom;
        let clase = 'info';
        let texto = `<strong>Crecimiento mensual (MoM):</strong> ${momGrowth > 0 ? '+' : ''}${momGrowth.toFixed(2)}%. `;
        
        if (momGrowth > 20) {
            texto += `🚀 Crecimiento excepcional. Asegura que la infraestructura escale con la demanda.`;
            clase = 'positive';
        } else if (momGrowth > 10) {
            texto += `Crecimiento sólido y sostenible. Enfócate en optimizar conversión y retención.`;
            clase = 'positive';
        } else if (momGrowth > 0) {
            texto += `Crecimiento positivo. Explora oportunidades para acelerar (nuevos canales, productos, mercados).`;
            clase = 'positive';
        } else if (momGrowth === 0) {
            texto += `⚠️ Estancamiento. Revisa estrategia de adquisición y propuesta de valor.`;
            clase = 'warning';
        } else {
            texto += `🚨 Decrecimiento. Análisis urgente de causas: competencia, mercado, producto o ejecución.`;
            clase = 'negative';
        }
        
        const p = document.createElement('div');
        p.className = `chart-analysis ${clase}`;
        p.innerHTML = texto;
        containerVentas.appendChild(p);
    }
    
    // 6. ANÁLISIS OPEX
    const containerOpex = document.querySelector("#chartOpEx")?.closest('.pilar-chart');
    if (containerOpex) {
        const analisisPrevioOpex = containerOpex.querySelector('.chart-analysis');
        if (analisisPrevioOpex) analisisPrevioOpex.remove();
        
        const totalGastos = op.total_gastos;
        const promedioMensual = op.promedio_gastos_mensual;
        
        let clase = 'info';
        let texto = `<strong>Gastos totales:</strong> €${formatMoney(totalGastos)} (promedio €${formatMoney(promedioMensual)}/mes). `;
        
        if (op.gastos_por_categoria && op.gastos_por_categoria.length > 0) {
            const mayorGasto = op.gastos_por_categoria[0];
            texto += `Mayor rubro: <strong>${mayorGasto.categoria}</strong> (${mayorGasto.porcentaje.toFixed(1)}% del total). `;
            
            if (mayorGasto.porcentaje > 60) {
                texto += `Considera diversificar estructura de costos para reducir riesgo.`;
                clase = 'warning';
            } else {
                clase = 'info';
            }
        }
        
        const p = document.createElement('div');
        p.className = `chart-analysis ${clase}`;
        p.innerHTML = texto;
        containerOpex.appendChild(p);
    }
    
    // 7. ANÁLISIS VENTAS POR SECTOR
    const containerSector = document.querySelector("#chartVentasSector")?.closest('.chart-container');
    if (containerSector) {
        const analisisPrevioSector = containerSector.querySelector('.chart-analysis');
        if (analisisPrevioSector) analisisPrevioSector.remove();
        
        if (cr.ventas_por_sector && cr.ventas_por_sector.length > 0) {
            const topSector = cr.ventas_por_sector[0];
            const numSectores = cr.ventas_por_sector.length;
            
            let clase = 'info';
            let texto = `<strong>Sector principal:</strong> ${topSector.sector} (${topSector.porcentaje.toFixed(1)}% del total). `;
            texto += `Diversificación: ${numSectores} ${numSectores === 1 ? 'sector' : 'sectores'}. `;
            
            if (topSector.porcentaje > 70) {
                texto += `⚠️ Alta concentración en un sector. Considera diversificar para reducir riesgo.`;
                clase = 'warning';
            } else if (topSector.porcentaje > 50) {
                texto += `Dependencia moderada del sector líder. Monitorea y desarrolla otros sectores.`;
                clase = 'warning';
            } else {
                texto += `Buena diversificación de ingresos. Reduce riesgo de concentración.`;
                clase = 'positive';
            }
            
            const p = document.createElement('div');
            p.className = `chart-analysis ${clase}`;
            p.innerHTML = texto;
            containerSector.appendChild(p);
        }
    }
}

function generarAlertas(pilares, umbrales) {
    const alertas = [];
    const cm = pilares.cash_management;
    
    // Alerta según tipo de métrica
    if (cm.tipo_metrica === 'runway') {
        const runway = cm.runway_meses;
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
    } else if (cm.tipo_metrica === 'reserva') {
        alertas.push({
            tipo: 'info',
            titulo: '💰 Empresa Rentable',
            texto: `Net Burn Rate es negativo (genera caja). Meses de reserva: ${cm.meses_reserva.toFixed(1)}.`
        });
    } else {
        alertas.push({
            tipo: 'success',
            titulo: '⚖️ En Equilibrio',
            texto: 'Net Burn Rate es cero. La empresa está en punto de equilibrio.'
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
    
    // Alerta de Churn Rate
    const churn = pilares.eficiencia.churn_rate;
    if (churn > 5) {
        alertas.push({
            tipo: 'warning',
            titulo: '⚠️ Churn Rate Elevado',
            texto: `Churn Rate de ${churn.toFixed(2)}% es alto. Enfócate en retención de clientes.`
        });
    }
    
    const div = document.getElementById('alertasContent');
    if (div) {
        div.innerHTML = alertas.map(a => `
            <div class="alerta-item ${a.tipo}">
                <h4>${a.titulo}</h4>
                <p>${a.texto}</p>
            </div>
        `).join('');
    }
}

function formatMoney(num) {
    if (num === null || num === undefined) return 'N/A';
    return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

function agregarAnalisis(containerId, textoAnalisis) {
    const container = document.querySelector(containerId);
    if (!container) return;
    
    // Buscar si ya existe un análisis
    let analisisDiv = container.querySelector('.chart-analysis');
    
    if (!analisisDiv) {
        // Crear nuevo div de análisis
        analisisDiv = document.createElement('p');
        analisisDiv.className = 'chart-analysis';
        container.appendChild(analisisDiv);
    }
    
    analisisDiv.innerHTML = '💡 ' + textoAnalisis;
}

// ========================================
// FUNCIÓN EXPORTAR PDF
// ========================================

function exportarPDFPilares() {
    const confirmar = confirm('Se abrirá la ventana de impresión.\n\nPara guardar como PDF:\n1. En "Destino" selecciona "Guardar como PDF"\n2. Orientación: Horizontal\n3. Click en "Guardar"\n\n¿Continuar?');
    
    if (!confirmar) return;
    
    // Ocultar elementos innecesarios
    const elementosOcultar = document.querySelectorAll('.main-header, .upload-section, .back-button, .header-actions');
    elementosOcultar.forEach(el => {
        if (el) el.style.display = 'none';
    });
    
    // Esperar y abrir ventana de impresión
    setTimeout(() => {
        window.print();
        
        // Restaurar elementos después
        setTimeout(() => {
            elementosOcultar.forEach(el => {
                if (el) el.style.display = '';
            });
        }, 500);
    }, 100);
}

// Conectar botón de exportar PDF
document.addEventListener('DOMContentLoaded', function() {
    const btnExportarPDF = document.getElementById('btnExportarPDF');
    if (btnExportarPDF) {
        btnExportarPDF.addEventListener('click', exportarPDFPilares);
    }
});

// ============================================================================
// MÓDULO: GRANULARIDAD MENSUAL/DIARIO — Combinado (Ingresos/Gastos/Caja),
// Crecimiento (Ventas) y OpEx (Gastos). El resto de Cash Management (Runway, Burn
// Rate) y Eficiencia (CAC, Churn Rate, Margen) quedan siempre mensuales, ya que son
// tasas mensuales; no tiene sentido financiero "diarizarlas".
// ============================================================================

// ----------------------------------------------------------------------------
// Caja Efectiva (solo COBRADO) vs Caja Proyectada (COBRADO + PENDIENTE, ubicado
// en su fecha de liquidación). La Liquidación de cada comercializadora define
// hasta 3 días del mes en los que paga (p. ej. 15 y 30); si no se configura
// ninguno, por defecto se cobra el día 1 del mes siguiente a la fecha base.
// Si una venta tiene fecha de baja, se aplica la Descomisión configurada
// (tramos por tiempo transcurrido desde la activación) sobre el Importe:
//   - PENDIENTE que se da de baja ANTES de su liquidación: solo se cobra el
//     (100% - % descomisionado) en su fecha de liquidación normal.
//   - Ya COBRADA (o PENDIENTE que se da de baja DESPUÉS de liquidarse): el
//     importe ya contado se corrige restando el % descomisionado, ubicado en
//     la siguiente fecha de liquidación tras la fecha de baja (sin tocar el
//     mes original en el que ya se contó el ingreso, para no restar dos veces).
// ----------------------------------------------------------------------------

// Convierte el texto libre de un tramo de descomisión ("2 meses", "15 días"...)
// a días. Duplicada de proyeccion.js (archivos separados).
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
    return numero * 30;
}

// % de descomisión aplicable según los días transcurridos entre activación y
// baja, según los tramos configurados para la comercializadora de la venta.
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

function _diasEntre(fechaIni, fechaFin) {
    const a = new Date(fechaIni);
    const b = new Date(fechaFin);
    if (isNaN(a) || isNaN(b)) return null;
    return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function _bucketDeFecha(fecha, granularidad) {
    if (!fecha) return null;
    return granularidad === 'diario' ? fecha : fecha.slice(0, 7);
}

// La Categoría del Excel puede venir sin normalizar ("ENERGIA", "TELECO", "PLACAS"...),
// a diferencia de los nombres canónicos usados en la config de Comercializadoras. Se
// normaliza aquí (mayúsculas/tildes) para que ambos lados casen siempre, igual que ya
// se hizo en _esSectorEnergia para el motor de drill-down de Ventas/Bajas.
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
// Proyección de Caja, duplicada aquí porque pilares.js y proyeccion.js son
// archivos separados.
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
    } else if (categoria === 'Placas Solares') {
        lista = comercializadoras.placas_solares || [];
    } else if (categoria === 'Alarmas') {
        lista = comercializadoras.alarmas || [];
    } else {
        return null;
    }

    return lista.find(c => (c.comercializadora || '').trim().toLowerCase() === nombreCom) || null;
}

// Calcula, para una granularidad dada ('mensual'|'diario'), las series de Ingresos
// cobrados, Gastos y Caja Efectiva (datos REALES: nunca se corrigen, un mes ya
// transcurrido se considera cerrado) y, solo para el MES ACTUAL (el último mes con
// datos; la proyección no tiene sentido a nivel diario), Ingresos Proyectados, Caja
// Proyectada y Bajas Proyectadas:
//   - Ingresos Proyectados del mes actual = lo ya cobrado ESTE mes + las ventas
//     PENDIENTES de meses anteriores (ya reflejadas aquí, no en su propio mes) -
//     las Descomisiones de bajas de meses anteriores (de ventas cobradas o
//     pendientes) que ya son un hecho conocido.
//   - Una venta pendiente de un mes anterior que se dio de baja TAMBIÉN en un mes
//     anterior se refleja ya neta de su descomisión (no se sabe un día exacto de
//     liquidación: solo importa el mes).
//   - Las bajas que ocurren EN el mes actual (de cualquier venta, cobrada o
//     pendiente) no restan nada todavía: se muestran aparte como "Bajas
//     Proyectadas", el importe que se restará el próximo mes cuando este mes pase
//     a ser "anterior".
//   - Si el mes actual es el primer mes con datos, no hay nada pendiente de antes:
//     Ingresos/Caja Proyectada coinciden exactamente con lo Cobrado/Caja Efectiva.
function calcularSeriesCombinado(granularidad) {
    const cajaInicial = (pilaresActual && pilaresActual.cash_management && pilaresActual.cash_management.caja_inicial) || 0;

    const bucketsSet = new Set();
    detalleGlobal.forEach(f => { const b = _bucketDeFecha(f.fecha, granularidad); if (b) bucketsSet.add(b); });
    detalleGastosGlobal.forEach(f => { const b = _bucketDeFecha(f.fecha, granularidad); if (b) bucketsSet.add(b); });
    const buckets = Array.from(bucketsSet).sort();

    const ingresosCobrados = {};
    const gastosPorBucket = {};

    detalleGlobal.forEach(f => {
        if (f.es_pendiente) return;
        const b = _bucketDeFecha(f.fecha, granularidad);
        if (b) ingresosCobrados[b] = (ingresosCobrados[b] || 0) + (f.importe || 0);
    });
    detalleGastosGlobal.forEach(f => {
        const b = _bucketDeFecha(f.fecha, granularidad);
        if (b) gastosPorBucket[b] = (gastosPorBucket[b] || 0) + (f.importe || 0);
    });

    let cajaEfectivaAcum = cajaInicial;
    const ingresosCobradosArr = [], gastosArr = [], cajaEfectivaArr = [];
    const ingresosProyectadosArr = [], cajaProyectadaArr = [];

    buckets.forEach(b => {
        const ingC = ingresosCobrados[b] || 0;
        const gas = gastosPorBucket[b] || 0;
        ingresosCobradosArr.push(ingC);
        gastosArr.push(gas);
        cajaEfectivaAcum += ingC - gas;
        cajaEfectivaArr.push(cajaEfectivaAcum);
        ingresosProyectadosArr.push(null);
        cajaProyectadaArr.push(null);
    });

    let bajasProyectadas = 0;
    let ventasPorCobrar = 0;
    const mesActual = (granularidad === 'mensual' && buckets.length > 0) ? buckets[buckets.length - 1] : null;

    if (mesActual) {
        const idxMesActual = buckets.length - 1;
        let proyectado = ingresosCobradosArr[idxMesActual];

        detalleGlobal.forEach(f => {
            const config = _buscarConfigComercializadora(comercializadorasActual, f);
            const fechaBase = f.fecha_activacion || f.fecha;
            const mesBaja = f.fecha_baja ? f.fecha_baja.slice(0, 7) : null;
            const dias = (fechaBase && f.fecha_baja) ? _diasEntre(fechaBase, f.fecha_baja) : null;
            const pct = dias != null ? _buscarPorcentajeDescomision(config, dias) : 0;

            if (!f.es_pendiente) {
                // Ya cobrada: su importe queda intacto en el mes en que se cobró (cerrado).
                // Si tiene baja, la descomisión afecta al mes actual, no a su mes de cobro.
                if (mesBaja && pct > 0) {
                    const monto = (f.importe || 0) * (pct / 100);
                    if (mesBaja < mesActual) {
                        proyectado -= monto; // baja de un mes ya cerrado: se resta del proyectado actual
                    } else if (mesBaja === mesActual) {
                        bajasProyectadas += monto; // baja de este mes: solo se previsualiza
                    }
                }
                return;
            }

            // Pendiente
            const mesVenta = fechaBase ? fechaBase.slice(0, 7) : null;
            if (!mesVenta || mesVenta >= mesActual) {
                // Pendiente de ESTE mes: aún no se refleja (se reflejará el mes que viene).
                // Se previsualiza en "Ventas por Cobrar"; si además se da de baja este mismo
                // mes, esa parte se previsualiza aparte en "Bajas Proyectadas".
                if (mesVenta === mesActual) {
                    ventasPorCobrar += (f.importe || 0);
                    if (mesBaja === mesActual && pct > 0) {
                        bajasProyectadas += (f.importe || 0) * (pct / 100);
                    }
                }
                return;
            }

            // Pendiente de un mes ANTERIOR: se refleja en el mes actual.
            if (mesBaja && mesBaja < mesActual) {
                // También se dio de baja en un mes ya cerrado: se refleja ya neta de descomisión.
                proyectado += (f.importe || 0) * (1 - pct / 100);
            } else if (mesBaja === mesActual) {
                // Se dio de baja este mes: se refleja íntegra + se previsualiza la baja.
                proyectado += (f.importe || 0);
                if (pct > 0) bajasProyectadas += (f.importe || 0) * (pct / 100);
            } else {
                proyectado += (f.importe || 0);
            }
        });

        ingresosProyectadosArr[idxMesActual] = proyectado;
        const cajaAlCierreMesAnterior = idxMesActual > 0 ? cajaEfectivaArr[idxMesActual - 1] : cajaInicial;
        cajaProyectadaArr[idxMesActual] = cajaAlCierreMesAnterior + proyectado - gastosArr[idxMesActual];
    }

    return {
        buckets,
        ingresosCobrados: ingresosCobradosArr,
        gastos: gastosArr,
        cajaEfectiva: cajaEfectivaArr,
        ingresosProyectados: ingresosProyectadosArr,
        cajaProyectada: cajaProyectadaArr,
        bajasProyectadas,
        ventasPorCobrar,
        mesActual
    };
}

const NOMBRES_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function renderMensajeVentasPorCobrar(bajasProyectadas, ventasPorCobrar, mesActual) {
    const el = document.getElementById('mensajeVentasPorCobrar');
    if (!el) return;

    if (!proyectadoActivo || !mesActual || (!bajasProyectadas && !ventasPorCobrar)) {
        el.style.display = 'none';
        el.innerHTML = '';
        return;
    }

    const [, mm] = mesActual.split('-').map(Number);
    const nombreMes = NOMBRES_MES[mm - 1];
    const fmt = v => v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    let filas = '';
    if (ventasPorCobrar) {
        filas += `<div class="fila-mes-cobrar"><span>Ventas pendientes de ${nombreMes} (se sumarán el mes siguiente)</span><strong>+${fmt(ventasPorCobrar)} €</strong></div>`;
    }
    if (bajasProyectadas) {
        filas += `<div class="fila-mes-cobrar"><span>Bajas de ${nombreMes} (se restarán el mes siguiente)</span><strong class="monto-negativo">-${fmt(bajasProyectadas)} €</strong></div>`;
    }

    el.innerHTML = `<strong class="titulo-ventas-cobrar">Ventas por Cobrar / Correcciones</strong>${filas}`;
    el.style.display = 'block';
}

function renderGraficoCombinado() {
    if (!pilaresActual) return;
    const el = document.querySelector('#chartCombinado');
    if (!el) return;
    el.innerHTML = '';
    if (chartInstancesExtra.combinado) {
        try { chartInstancesExtra.combinado.destroy(); } catch (e) { /* noop */ }
        chartInstancesExtra.combinado = null;
    }

    const esDiario = granularidadCombinado === 'diario';
    const datos = calcularSeriesCombinado(esDiario ? 'diario' : 'mensual');

    const titulo = document.getElementById('tituloChartCombinado');
    if (titulo) titulo.textContent = esDiario ? 'Ingresos, Gastos y Evolución de Caja (diario)' : 'Ingresos, Gastos y Evolución de Caja';

    renderMensajeVentasPorCobrar(datos.bajasProyectadas, datos.ventasPorCobrar, datos.mesActual);

    if (!datos.buckets.length) {
        el.innerHTML = '<p style="padding:20px;color:#6b7280;">Sin datos.</p>';
        return;
    }

    const series = [
        { name: 'Ingresos (cobrados)', type: 'column', data: datos.ingresosCobrados },
        { name: 'Gastos', type: 'column', data: datos.gastos },
        { name: 'Caja Efectiva', type: 'line', data: datos.cajaEfectiva }
    ];
    // La Proyección solo existe a nivel mensual (datos.mesActual es null en vista diaria).
    if (proyectadoActivo && datos.mesActual) {
        series.push({ name: 'Ingresos Proyectados (mes actual)', type: 'line', data: datos.ingresosProyectados });
        series.push({ name: 'Caja Proyectada (mes actual)', type: 'line', data: datos.cajaProyectada });
    }

    const fmtMoney = val => (val != null ? val.toLocaleString('es-ES', { maximumFractionDigits: 0 }) + '€' : '');
    // Un yaxis por serie (misma longitud que `series`): el 1º de cada grupo (dinero / caja)
    // se muestra; el resto se oculta. IMPORTANTE: todas las del mismo grupo deben compartir
    // el mismo `seriesName` (el de la serie "anfitriona" visible), no el suyo propio — si no,
    // ApexCharts les calcula una escala independiente (p. ej. "Caja Proyectada" se escalaba
    // sola con solo sus 2 puntos en vez de compartir la escala de "Caja Efectiva"), lo que
    // desplazaba el punto a una posición que no se correspondía con su valor real.
    const yaxis = series.map((s, idx) => {
        const esCaja = s.name.indexOf('Caja') === 0;
        return {
            seriesName: esCaja ? 'Caja Efectiva' : 'Ingresos (cobrados)',
            show: esCaja ? idx === 2 : idx === 0,
            opposite: esCaja,
            title: { text: esCaja ? 'Caja (€)' : 'Ingresos / Gastos (€)' },
            labels: { formatter: fmtMoney }
        };
    });

    chartInstancesExtra.combinado = new ApexCharts(el, {
        series,
        chart: { height: 350, type: 'line', stacked: false },
        colors: ['#10b981', '#ef4444', '#1e40af', '#f59e0b', '#8b5cf6'],
        stroke: {
            width: series.map((s, idx) => (s.type === 'column' ? 0 : (idx >= 3 ? 2 : 3))),
            curve: 'smooth',
            dashArray: series.map((s, idx) => (idx >= 3 ? 4 : 0))
        },
        plotOptions: { bar: { columnWidth: esDiario ? '70%' : '50%' } },
        fill: { opacity: series.map(s => (s.type === 'column' ? 0.85 : 1)) },
        labels: datos.buckets,
        markers: { size: series.map((s, idx) => (s.type === 'column' || esDiario ? 0 : (idx >= 3 ? 4 : 5))) },
        xaxis: { type: 'category', labels: { rotate: esDiario ? -45 : 0 } },
        yaxis,
        legend: { position: 'top' },
        tooltip: {
            shared: true,
            intersect: false,
            y: { formatter: val => (val != null ? val.toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €' : '') }
        }
    });
    chartInstancesExtra.combinado.render();
}

function _agruparVentasPorDia(detalle) {
    const porDia = {};
    detalle.forEach(f => {
        if (!f.fecha) return;
        porDia[f.fecha] = (porDia[f.fecha] || 0) + (f.importe || 0);
    });
    const dias = Object.keys(porDia).sort();
    return dias.map((d, i) => {
        const ventas = porDia[d];
        const anterior = i > 0 ? porDia[dias[i - 1]] : null;
        const variacion = (i > 0 && anterior > 0) ? ((ventas - anterior) / anterior * 100) : 0;
        return { mes: d, ventas: ventas, variacion_pct: variacion };
    });
}

function renderGraficoCrecimiento() {
    if (!pilaresActual) return;
    const cr = pilaresActual.crecimiento;
    const el = document.querySelector('#chartCrecimiento');
    if (!el) return;
    el.innerHTML = '';
    if (chartInstancesExtra.crecimiento) {
        try { chartInstancesExtra.crecimiento.destroy(); } catch (e) { /* noop */ }
        chartInstancesExtra.crecimiento = null;
    }

    const esDiario = granularidadCrecimiento === 'diario';
    const datos = esDiario ? _agruparVentasPorDia(detalleGlobal) : (cr.ventas_mensuales || []);

    const titulo = document.getElementById('tituloChartCrecimiento');
    if (titulo) titulo.textContent = esDiario ? 'Evolución Diaria de Ventas' : 'Evolución Mensual de Ventas';

    if (!datos.length) {
        el.innerHTML = '<p style="padding:20px;color:#6b7280;">Sin datos.</p>';
        return;
    }

    const coloresBase = paletasGlobal || { variada: ['#1e3c72', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'], calor: ['#10b981', '#34d399', '#f59e0b', '#fb923c', '#ef4444'] };

    chartInstancesExtra.crecimiento = new ApexCharts(el, {
        series: [
            { name: 'Ventas', type: 'column', data: datos.map(v => v.ventas) },
            { name: esDiario ? 'Variación % (día anterior)' : 'Variación %', type: 'line', data: datos.map(v => v.variacion_pct) }
        ],
        chart: { height: 300, type: 'line' },
        colors: [coloresBase.variada[2], coloresBase.calor[3]],
        stroke: { width: [0, 3], curve: 'smooth' },
        plotOptions: { bar: { columnWidth: esDiario ? '70%' : '50%' } },
        fill: { opacity: [0.85, 1] },
        labels: datos.map(v => v.mes),
        markers: { size: [0, esDiario ? 0 : 5] },
        xaxis: { type: 'category', labels: { rotate: esDiario ? -45 : 0 } },
        yaxis: [
            { title: { text: 'Ventas (€)' }, labels: { formatter: val => (val != null ? val.toLocaleString('es-ES', { maximumFractionDigits: 0 }) + '€' : '') } },
            { opposite: true, title: { text: 'Variación (%)' }, labels: { formatter: val => (val != null ? val.toFixed(2) + '%' : '') } }
        ],
        legend: { position: 'top' },
        tooltip: { shared: true, intersect: false }
    });
    chartInstancesExtra.crecimiento.render();
}

function _agruparGastosPorDia(detalleGastos) {
    const porDia = {};
    const totalPorDia = {};
    const categoriasSet = new Set();
    detalleGastos.forEach(f => {
        if (!f.fecha) return;
        const cat = f.categoria || 'Sin categoría';
        categoriasSet.add(cat);
        if (!porDia[f.fecha]) porDia[f.fecha] = {};
        porDia[f.fecha][cat] = (porDia[f.fecha][cat] || 0) + (f.importe || 0);
        totalPorDia[f.fecha] = (totalPorDia[f.fecha] || 0) + (f.importe || 0);
    });
    const dias = Object.keys(porDia).sort();
    const categorias = Array.from(categoriasSet).sort();
    return { dias, categorias, porDia, totalPorDia };
}

function renderGraficoOpEx() {
    if (!pilaresActual) return;
    const op = pilaresActual.opex;
    const el = document.querySelector('#chartOpEx');
    if (!el) return;
    el.innerHTML = '';
    if (chartInstancesExtra.opex) {
        try { chartInstancesExtra.opex.destroy(); } catch (e) { /* noop */ }
        chartInstancesExtra.opex = null;
    }

    const esDiario = granularidadOpEx === 'diario';
    const titulo = document.getElementById('tituloChartOpEx');

    let categorias = [], etiquetasX = [], seriesRubros = [];

    if (esDiario) {
        const { dias, categorias: cats, porDia, totalPorDia } = _agruparGastosPorDia(detalleGastosGlobal);
        categorias = cats;
        etiquetasX = dias;
        seriesRubros = cats.map(cat => ({
            name: cat,
            type: 'column',
            data: dias.map(d => (porDia[d][cat] || 0) / 1000)
        }));
        seriesRubros.push({ name: 'Total Gastos', type: 'line', data: dias.map(d => (totalPorDia[d] || 0) / 1000) });
        if (titulo) titulo.textContent = 'Gastos por Categoría (diario)';
    } else {
        const gastosPorRubroMes = op.gastos_por_rubro_mes || [];
        const rubros = Object.keys((gastosPorRubroMes[0] && gastosPorRubroMes[0].rubros) || {});
        categorias = rubros;
        etiquetasX = gastosPorRubroMes.map(m => m.mes);
        seriesRubros = rubros.map(rubro => ({
            name: rubro,
            type: 'column',
            data: gastosPorRubroMes.map(mes => (mes.rubros[rubro] || 0) / 1000)
        }));
        seriesRubros.push({ name: 'Total Gastos', type: 'line', data: gastosPorRubroMes.map(mes => mes.total / 1000) });
        if (titulo) titulo.textContent = 'Gastos por Categoría';
    }

    if (!etiquetasX.length) {
        el.innerHTML = '<p style="padding:20px;color:#6b7280;">Sin datos.</p>';
        return;
    }

    const coloresOpex = (paletasGlobal && paletasGlobal.categorias_opex) || ['#1e3c72', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6'];

    chartInstancesExtra.opex = new ApexCharts(el, {
        series: seriesRubros,
        // stacked: false -> las categorías de gasto se muestran como barras separadas,
        // agrupadas una junto a otra dentro de cada mes (en vez de apiladas).
        chart: { height: 350, type: 'line', stacked: false },
        colors: coloresOpex,
        stroke: { width: Array(categorias.length).fill(0).concat([3]), curve: 'smooth' },
        plotOptions: { bar: { horizontal: false, columnWidth: esDiario ? '70%' : '60%' } },
        xaxis: { categories: etiquetasX, type: 'category', labels: { rotate: esDiario ? -45 : 0 } },
        yaxis: { title: { text: 'Gastos (miles €)' }, labels: { formatter: val => (val != null ? val.toFixed(1) + 'k€' : '') } },
        legend: { position: 'top', horizontalAlign: 'center' },
        fill: { opacity: 0.85 },
        tooltip: { y: { formatter: val => (val != null ? (val * 1000).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €' : '') } }
    });
    chartInstancesExtra.opex.render();
}

// Wiring de los botones Mensual/Diario y PROYECTADO (elementos estáticos del HTML,
// se conectan una sola vez)
document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.toggle-granularidad').forEach(grupo => {
        const target = grupo.dataset.target; // 'combinado' | 'crecimiento' | 'opex'
        grupo.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                grupo.querySelectorAll('.toggle-btn').forEach(b => b.classList.toggle('active', b === btn));
                if (target === 'combinado') {
                    granularidadCombinado = btn.dataset.modo;
                    // La Proyección solo existe a nivel mensual: al pasar a Diario se
                    // desactiva el toggle (no tiene un valor que mostrar ahí).
                    const btnProyectado = document.getElementById('btnToggleProyectado');
                    if (granularidadCombinado === 'diario') {
                        proyectadoActivo = false;
                        if (btnProyectado) { btnProyectado.classList.remove('active'); btnProyectado.disabled = true; }
                    } else if (btnProyectado) {
                        btnProyectado.disabled = false;
                    }
                    renderGraficoCombinado();
                } else if (target === 'crecimiento') {
                    granularidadCrecimiento = btn.dataset.modo;
                    renderGraficoCrecimiento();
                } else if (target === 'opex') {
                    granularidadOpEx = btn.dataset.modo;
                    renderGraficoOpEx();
                }
            });
        });
    });

    const btnProyectado = document.getElementById('btnToggleProyectado');
    if (btnProyectado) {
        btnProyectado.addEventListener('click', () => {
            proyectadoActivo = !proyectadoActivo;
            btnProyectado.classList.toggle('active', proyectadoActivo);
            renderGraficoCombinado();
        });
    }
});

// ============================================================================
// MÓDULO: UNIT ECONOMICS (EFICIENCIA) POR SECTOR
// Un único chart (chartROICanal) se reutiliza para dos vistas:
// 1) ROI por Subcanal (la de siempre), con un filtro de Sector opcional.
// 2) Margen de Contribución / CAC / Ingreso Medio por Cliente / LTV por sector,
//    al hacer click en el valor de esa métrica en las tarjetas de Eficiencia.
// El Churn Rate queda fuera de este drill-down (se mantiene solo global).
// ============================================================================

const NOMBRES_METRICA_EFICIENCIA = {
    margen_contribucion: 'Margen de Contribución',
    cac: 'CAC',
    ingreso_medio_cliente: 'Ingreso Medio por Cliente',
    ltv: 'LTV',
};

function _destruirChartEficiencia() {
    if (chartInstanceEficiencia.instancia) {
        try { chartInstanceEficiencia.instancia.destroy(); } catch (e) { /* noop */ }
        chartInstanceEficiencia.instancia = null;
    }
    const el = document.getElementById('chartROICanal');
    if (el) el.innerHTML = '';
    // El cuadro de interpretación es un hermano de #chartROICanal (no un hijo), así que
    // hay que limpiarlo aparte para no dejar texto de una vista anterior "congelado".
    _actualizarInterpretacionEficiencia(null);
}

// Dirección en la que "mejora" cada métrica, usada para identificar el sector con mejor
// desempeño: para el CAC, menor es mejor (es un coste); para el resto, mayor es mejor.
const DIRECCION_MEJOR_METRICA = {
    margen_contribucion: 'max',
    cac: 'min',
    ingreso_medio_cliente: 'max',
    ltv: 'max'
};

function _formatearValorMetrica(val, unidad) {
    if (val == null) return 'N/A';
    return unidad === '%'
        ? val.toFixed(2) + '%'
        : val.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

// Inserta (o limpia, si html es null/vacío) el cuadro de interpretación debajo del
// gráfico de Eficiencia. Se reutiliza para la interpretación de ROI por Subcanal y para
// la interpretación de Margen/CAC/Ingreso Medio/LTV por sector.
function _actualizarInterpretacionEficiencia(html, clase) {
    const el = document.getElementById('chartROICanal');
    const contenedor = el ? el.closest('.pilar-chart') : null;
    if (!contenedor) return;
    const previo = contenedor.querySelector('.chart-analysis');
    if (previo) previo.remove();
    if (!html) return;
    const p = document.createElement('div');
    p.className = `chart-analysis ${clase || 'info'}`;
    p.innerHTML = html;
    contenedor.appendChild(p);
}

// Interpretación de una métrica (Margen/CAC/Ingreso Medio/LTV): valor general + sector
// con mejor desempeño en esa métrica concreta.
function _renderInterpretacionPorSector(metrica, unidad) {
    if (!eficienciaActual) return;
    const valorGlobal = eficienciaActual[metrica];
    const porSector = eficienciaActual.por_sector || {};
    const direccion = DIRECCION_MEJOR_METRICA[metrica] || 'max';

    const entradas = Object.entries(porSector)
        .map(([sector, datos]) => ({ sector, valor: datos[metrica] }))
        .filter(e => e.valor != null);

    let texto = `💡 El ${NOMBRES_METRICA_EFICIENCIA[metrica]} general es de <strong>${_formatearValorMetrica(valorGlobal, unidad)}</strong>. `;

    if (entradas.length > 0) {
        const mejor = entradas.reduce((a, b) => {
            return direccion === 'min' ? (b.valor < a.valor ? b : a) : (b.valor > a.valor ? b : a);
        });
        const adjetivo = direccion === 'min' ? 'menor coste' : 'mejor desempeño';
        texto += `El sector <strong>${mejor.sector}</strong> es el de ${adjetivo}, con ${_formatearValorMetrica(mejor.valor, unidad)}.`;
    } else {
        texto += `Todavía no hay suficientes datos por sector para identificar cuál tiene mejor desempeño.`;
    }

    _actualizarInterpretacionEficiencia(texto, 'info');
}

// Métricas que admiten vista "Por Mes" además de "Por Sector". El LTV queda fuera a
// propósito: depende del Churn Rate, que es más fiable como medida acumulada que
// desglosada mes a mes con pocas bajas por mes.
const METRICAS_CON_VISTA_MENSUAL = ['margen_contribucion', 'cac', 'ingreso_medio_cliente'];

function _mostrarControlesEficiencia({ mostrarFiltroSector, mostrarToggleTemporal, modoTemporalActivo }) {
    const contFiltro = document.getElementById('filtroSectorROIContenedor');
    const contToggle = document.getElementById('toggleVistaEficiencia');
    if (contFiltro) contFiltro.style.display = mostrarFiltroSector ? '' : 'none';
    if (contToggle) {
        contToggle.style.display = mostrarToggleTemporal ? 'flex' : 'none';
        if (mostrarToggleTemporal) {
            contToggle.querySelectorAll('.toggle-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.modo === modoTemporalActivo);
            });
        }
    }
}

function renderGraficoROISubcanal(sector) {
    if (!eficienciaActual) return;
    const titulo = document.getElementById('tituloChartEficiencia');
    const btnVolver = document.getElementById('btnVolverEficiencia');
    if (titulo) titulo.textContent = sector ? `ROI por Subcanal — ${sector}` : 'ROI por Subcanal';
    if (btnVolver) btnVolver.style.display = 'none';
    _mostrarControlesEficiencia({ mostrarFiltroSector: true, mostrarToggleTemporal: false });

    const fuente = sector
        ? ((eficienciaActual.por_sector && eficienciaActual.por_sector[sector]) || { roi_subcanal: [] })
        : eficienciaActual;
    const subcanalesConRoi = (fuente.roi_subcanal || []).filter(s => s.roi !== null);

    _destruirChartEficiencia();
    const el = document.getElementById('chartROICanal');
    if (!el) return;

    if (subcanalesConRoi.length === 0) {
        el.innerHTML = '<p style="text-align:center; color:#94a3b8; padding: 40px 0;">No hay datos suficientes de inversión por subcanal para calcular el ROI' + (sector ? ` en ${sector}` : '') + '.</p>';
        return;
    }

    chartInstanceEficiencia.instancia = new ApexCharts(el, {
        series: [{ name: 'ROI (%)', data: subcanalesConRoi.map(s => s.roi) }],
        chart: { type: 'bar', height: 250 },
        colors: subcanalesConRoi.map(s => s.roi >= 0 ? '#10b981' : '#ef4444'),
        plotOptions: {
            bar: {
                columnWidth: '55%',
                borderRadius: 3,
                distributed: true,
                // Etiqueta pegada al borde EXTERIOR de la barra (fuera, no dentro), para que
                // se lea aunque la barra sea diminuta frente a otras muy grandes (p. ej. un
                // ROI de -33% al lado de uno de 2840%, donde la barra negativa casi no tiene
                // alto y el texto no cabría dentro).
                dataLabels: { position: 'top' }
            }
        },
        dataLabels: {
            enabled: true,
            formatter: val => (val != null ? val.toFixed(1) + '%' : ''),
            offsetY: -20,
            style: { fontSize: '12px', fontWeight: 600, colors: ['#1e293b'] }
        },
        xaxis: { categories: subcanalesConRoi.map(s => s.subcanal) },
        yaxis: {
            title: { text: 'ROI (%)' },
            labels: { formatter: val => (val != null ? val.toFixed(0) + '%' : '') }
        },
        legend: { show: false },
        tooltip: { y: { formatter: val => (val != null ? val.toFixed(2) + '%' : 'N/A') } }
    });
    chartInstanceEficiencia.instancia.render();

    const mejor = subcanalesConRoi.reduce((a, b) => (b.roi > a.roi ? b : a));
    let texto = `💡 Mejor subcanal: <strong>${mejor.subcanal}</strong> (ROI ${mejor.roi.toFixed(1)}%). `;
    let clase = mejor.roi >= 0 ? 'positive' : 'warning';
    if (subcanalesConRoi.length > 1) {
        const peor = subcanalesConRoi.reduce((a, b) => (b.roi < a.roi ? b : a));
        texto += `Menor desempeño: <strong>${peor.subcanal}</strong> (ROI ${peor.roi.toFixed(1)}%). `;
        if (peor.roi < 0) {
            texto += `⚠️ Considera revisar o pausar la inversión en los subcanales con ROI negativo.`;
            clase = 'warning';
        } else {
            texto += `Todos los subcanales medidos generan retorno positivo.`;
        }
    }
    _actualizarInterpretacionEficiencia(texto, clase);
}

function renderGraficoMetricaPorSector(metrica, unidad) {
    if (!eficienciaActual) return;
    const esMensual = METRICAS_CON_VISTA_MENSUAL.includes(metrica);

    const titulo = document.getElementById('tituloChartEficiencia');
    const btnVolver = document.getElementById('btnVolverEficiencia');
    if (titulo) titulo.textContent = `${NOMBRES_METRICA_EFICIENCIA[metrica]} por Sector`;
    if (btnVolver) {
        btnVolver.style.display = 'inline-block';
        btnVolver.textContent = '← Volver'; // se sobrescribe más abajo solo si se entra desde un drill-down de sector
        btnVolver.dataset.volverA = '';
    }
    _mostrarControlesEficiencia({
        mostrarFiltroSector: false,
        mostrarToggleTemporal: esMensual,
        modoTemporalActivo: 'sector'
    });

    _destruirChartEficiencia();
    const el = document.getElementById('chartROICanal');
    if (!el) return;

    const formatearValor = val => {
        if (val == null) return 'N/A';
        return unidad === '%' ? val.toFixed(2) + '%' : val.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
    };

    const _irASector = (sector) => {
        renderGraficoROISubcanal(sector);
        const selSector = document.getElementById('filtroSectorROI');
        if (selSector) selSector.value = sector;
        vistaEficienciaActual = null;
        if (btnVolver) {
            btnVolver.style.display = 'inline-block';
            btnVolver.textContent = `← Volver a ${NOMBRES_METRICA_EFICIENCIA[metrica]} por Sector`;
            btnVolver.dataset.volverA = JSON.stringify({ metrica, unidad });
        }
    };

    if (esMensual) {
        // Vista combinada: eje X = meses, una barra por sector agrupada dentro de cada mes
        // (p. ej. Septiembre: Energía | Telefonía | Placas | Alarmas juntas, luego Octubre: ...)
        const porSectorMes = eficienciaActual.por_sector_mes || {};
        const sectores = Object.keys(porSectorMes).sort();

        if (sectores.length === 0) {
            el.innerHTML = '<p style="text-align:center; color:#94a3b8; padding: 40px 0;">Sube un Excel con la columna Categoría rellena por sector (Energía, Telefonía, Placas Solares, Alarmas) para ver este desglose.</p>';
            return;
        }

        const meses = [...new Set(sectores.flatMap(s => porSectorMes[s].map(m => m.mes)))].sort();
        const series = sectores.map(sector => {
            const valorPorMes = {};
            porSectorMes[sector].forEach(m => { valorPorMes[m.mes] = m[metrica]; });
            return { name: sector, data: meses.map(mes => (valorPorMes[mes] == null ? 0 : valorPorMes[mes])) };
        });

        chartInstanceEficiencia.instancia = new ApexCharts(el, {
            series,
            chart: {
                type: 'bar',
                height: 250,
                events: {
                    dataPointSelection: function (event, chartContext, config) {
                        _irASector(sectores[config.seriesIndex]);
                    }
                }
            },
            colors: paletasGlobal && paletasGlobal.variada ? paletasGlobal.variada : ['#1e3c72', '#10b981', '#f59e0b', '#8b5cf6'],
            plotOptions: { bar: { columnWidth: '60%', borderRadius: 3 } },
            xaxis: { categories: meses, type: 'category' },
            yaxis: {
                title: { text: unidad === '%' ? `${NOMBRES_METRICA_EFICIENCIA[metrica]} (%)` : `${NOMBRES_METRICA_EFICIENCIA[metrica]} (€)` },
                labels: { formatter: formatearValor }
            },
            legend: { show: true, position: 'top' },
            tooltip: { y: { formatter: formatearValor } }
        });
        chartInstanceEficiencia.instancia.render();
    } else {
        // Vista agregada por sector (p. ej. LTV: no admite desglose mensual)
        const porSector = eficienciaActual.por_sector || {};
        const sectores = Object.keys(porSector).sort((a, b) => {
            const va = porSector[a][metrica], vb = porSector[b][metrica];
            return (vb == null ? -Infinity : vb) - (va == null ? -Infinity : va);
        });
        const valores = sectores.map(s => porSector[s][metrica]);

        if (sectores.length === 0) {
            el.innerHTML = '<p style="text-align:center; color:#94a3b8; padding: 40px 0;">Sube un Excel con la columna Categoría rellena por sector (Energía, Telefonía, Placas Solares, Alarmas) para ver este desglose.</p>';
            return;
        }

        chartInstanceEficiencia.instancia = new ApexCharts(el, {
            series: [{ name: NOMBRES_METRICA_EFICIENCIA[metrica], data: valores.map(v => v == null ? 0 : v) }],
            chart: {
                type: 'bar',
                height: 250,
                events: {
                    dataPointSelection: function (event, chartContext, config) {
                        _irASector(sectores[config.dataPointIndex]);
                    }
                }
            },
            colors: paletasGlobal && paletasGlobal.variada ? paletasGlobal.variada : ['#1e3c72', '#10b981', '#f59e0b', '#8b5cf6'],
            plotOptions: { bar: { columnWidth: '55%', borderRadius: 3, distributed: true } },
            xaxis: { categories: sectores },
            yaxis: {
                title: { text: unidad === '%' ? `${NOMBRES_METRICA_EFICIENCIA[metrica]} (%)` : `${NOMBRES_METRICA_EFICIENCIA[metrica]} (€)` },
                labels: { formatter: formatearValor }
            },
            legend: { show: false },
            tooltip: {
                y: {
                    // El LTV usa el Churn Rate propio de cada sector (no el global), así que
                    // se muestra junto al valor para que se note cuándo viene de pocos clientes.
                    formatter: (val, opts) => {
                        const sector = (opts && opts.dataPointIndex != null) ? sectores[opts.dataPointIndex] : null;
                        const datos = sector ? porSector[sector] : null;
                        const valorReal = datos ? datos[metrica] : val;
                        let texto = formatearValor(valorReal);
                        if (datos && datos.churn_rate != null && datos.clientes_ciclo_sector != null) {
                            texto += ` (Churn ${datos.churn_rate.toFixed(2)}%, ${datos.clientes_ciclo_sector} clientes)`;
                        }
                        return texto;
                    }
                }
            }
        });
        chartInstanceEficiencia.instancia.render();
    }
    if (btnVolver) btnVolver.dataset.volverA = '';
    _renderInterpretacionPorSector(metrica, unidad);
}

function renderGraficoMetricaPorMes(metrica, unidad) {
    if (!eficienciaActual) return;
    const porMes = eficienciaActual.por_mes || [];

    const titulo = document.getElementById('tituloChartEficiencia');
    const btnVolver = document.getElementById('btnVolverEficiencia');
    if (titulo) titulo.textContent = `${NOMBRES_METRICA_EFICIENCIA[metrica]} por Mes`;
    if (btnVolver) {
        btnVolver.style.display = 'inline-block';
        btnVolver.textContent = '← Volver';
        btnVolver.dataset.volverA = '';
    }
    _mostrarControlesEficiencia({
        mostrarFiltroSector: false,
        mostrarToggleTemporal: true,
        modoTemporalActivo: 'mes'
    });

    _destruirChartEficiencia();
    const el = document.getElementById('chartROICanal');
    if (!el) return;

    if (porMes.length === 0) {
        el.innerHTML = '<p style="text-align:center; color:#94a3b8; padding: 40px 0;">No hay suficientes meses con ventas para mostrar esta evolución.</p>';
        return;
    }

    const formatearValor = val => {
        if (val == null) return 'N/A';
        return unidad === '%' ? val.toFixed(2) + '%' : val.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
    };

    chartInstanceEficiencia.instancia = new ApexCharts(el, {
        series: [{ name: NOMBRES_METRICA_EFICIENCIA[metrica], data: porMes.map(m => m[metrica] == null ? 0 : m[metrica]) }],
        chart: { type: 'line', height: 250 },
        colors: ['#1e3c72'],
        stroke: { width: 3, curve: 'smooth' },
        markers: { size: 5 },
        xaxis: { categories: porMes.map(m => m.mes), type: 'category' },
        yaxis: {
            title: { text: unidad === '%' ? `${NOMBRES_METRICA_EFICIENCIA[metrica]} (%)` : `${NOMBRES_METRICA_EFICIENCIA[metrica]} (€)` },
            labels: { formatter: formatearValor }
        },
        legend: { show: false },
        tooltip: { y: { formatter: formatearValor } }
    });
    chartInstanceEficiencia.instancia.render();
}

function poblarFiltroSectorROI() {
    const sel = document.getElementById('filtroSectorROI');
    if (!sel || !eficienciaActual) return;
    const sectores = Object.keys(eficienciaActual.por_sector || {}).sort();
    const valorPrevio = sel.value;
    sel.innerHTML = '<option value="">Todos</option>' + sectores.map(s => `<option value="${s}">${s}</option>`).join('');
    if (sectores.includes(valorPrevio)) sel.value = valorPrevio;
}

let _eficienciaWireada = false;

function inicializarEficienciaPorSector() {
    poblarFiltroSectorROI();
    vistaEficienciaActual = null;
    renderGraficoROISubcanal(document.getElementById('filtroSectorROI') ? document.getElementById('filtroSectorROI').value : '');

    if (_eficienciaWireada) return;
    _eficienciaWireada = true;

    document.querySelectorAll('.metrica-clicable').forEach(el => {
        el.addEventListener('click', () => {
            const metrica = el.dataset.metrica;
            const unidad = el.dataset.unidad;
            vistaEficienciaActual = { metrica, unidad, temporal: 'sector' };
            renderGraficoMetricaPorSector(metrica, unidad);
        });
    });

    const selSectorROI = document.getElementById('filtroSectorROI');
    if (selSectorROI) {
        selSectorROI.addEventListener('change', () => {
            vistaEficienciaActual = null;
            renderGraficoROISubcanal(selSectorROI.value);
        });
    }

    const toggleVistaEficiencia = document.getElementById('toggleVistaEficiencia');
    if (toggleVistaEficiencia) {
        toggleVistaEficiencia.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!vistaEficienciaActual) return;
                const { metrica, unidad } = vistaEficienciaActual;
                const modo = btn.dataset.modo;
                vistaEficienciaActual = { metrica, unidad, temporal: modo };
                if (modo === 'mes') {
                    renderGraficoMetricaPorMes(metrica, unidad);
                } else {
                    renderGraficoMetricaPorSector(metrica, unidad);
                }
            });
        });
    }

    const btnVolver = document.getElementById('btnVolverEficiencia');
    if (btnVolver) {
        btnVolver.addEventListener('click', () => {
            if (btnVolver.dataset.volverA) {
                const { metrica, unidad } = JSON.parse(btnVolver.dataset.volverA);
                vistaEficienciaActual = { metrica, unidad };
                renderGraficoMetricaPorSector(metrica, unidad);
            } else {
                vistaEficienciaActual = null;
                const sel = document.getElementById('filtroSectorROI');
                if (sel) sel.value = '';
                renderGraficoROISubcanal('');
            }
        });
    }
}

// ============================================================================
// MÓDULO: CONFIGURACIÓN DE COMERCIALIZADORAS, TARIFAS Y DESCOMISIÓN
// ============================================================================

let comercializadorasData = { energia: { luz: [], gas: [] }, telefonia: [], placas_solares: [], alarmas: [] };

function _comercializadorasDefault() {
    return { energia: { luz: [], gas: [] }, telefonia: [], placas_solares: [], alarmas: [] };
}

function getArraySector(path) {
    if (path === 'energia.luz') return comercializadorasData.energia.luz;
    if (path === 'energia.gas') return comercializadorasData.energia.gas;
    return comercializadorasData[path];
}

function abrirModalComercializadoras() {
    fetch('/api/configurar-comercializadoras')
        .then(r => r.json())
        .then(data => {
            const recibido = data.comercializadoras || {};
            comercializadorasData = _comercializadorasDefault();
            if (recibido.energia) {
                comercializadorasData.energia.luz = recibido.energia.luz || [];
                comercializadorasData.energia.gas = recibido.energia.gas || [];
            }
            comercializadorasData.telefonia = recibido.telefonia || [];
            comercializadorasData.placas_solares = recibido.placas_solares || [];
            comercializadorasData.alarmas = recibido.alarmas || [];

            renderizarTodasLasTablas();
            cambiarTabComercializadoras('energia');
            cambiarSubtabEnergia('luz');
            document.getElementById('modalComercializadoras').style.display = 'flex';
        })
        .catch(e => console.error('Error al cargar comercializadoras:', e));
}

function cerrarModalComercializadoras() {
    document.getElementById('modalComercializadoras').style.display = 'none';
}

function cambiarTabComercializadoras(tab) {
    sincronizarDesdeDOM();
    document.querySelectorAll('.tabs-comercializadoras .tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tab);
    });
    ['energia', 'telefonia', 'placas_solares', 'alarmas'].forEach(t => {
        const panel = document.getElementById(`tabPanel-${t}`);
        if (panel) panel.style.display = (t === tab) ? '' : 'none';
    });
}

function cambiarSubtabEnergia(subtab) {
    sincronizarDesdeDOM();
    document.querySelectorAll('.subtabs-energia .subtab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.subtab === subtab);
    });
    ['luz', 'gas'].forEach(s => {
        const panel = document.getElementById(`subtabPanel-${s}`);
        if (panel) panel.style.display = (s === subtab) ? '' : 'none';
    });
}

function renderizarTramos(path, i) {
    const item = getArraySector(path)[i];
    const tramos = item.descomision || [];
    let html = tramos.map((t, ti) => `
        <div class="tramo-descomision-row">
            <input type="text" data-campo="periodo" value="${t.periodo || ''}" placeholder="Ej. 2 meses">
            <input type="number" step="0.01" data-campo="porcentaje" value="${t.porcentaje != null ? t.porcentaje : ''}" placeholder="% descomisión">
            <button class="btn-remove-tramo" onclick="eliminarTramoDescomision('${path}', ${i}, ${ti})">✕</button>
        </div>`).join('');
    html += `<button class="btn-add-tramo" onclick="añadirTramoDescomision('${path}', ${i})">+ Añadir tramo de descomisión</button>`;
    return html;
}

function renderizarTablaTarifas(path, tbodyId, tieneDescomision) {
    const arr = getArraySector(path);
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const idBase = path.replace('.', '-');

    let html = '';
    arr.forEach((item, i) => {
        const dias = item.liquidacion || [];
        html += `
        <tr class="fila-tarifa">
            <td><input type="text" data-campo="comercializadora" value="${item.comercializadora || ''}" placeholder="Ej. Naturgy"></td>
            <td class="celda-liquidacion">
                <input type="number" step="1" min="1" max="31" data-campo="liquidacion1" value="${dias[0] != null ? dias[0] : ''}" placeholder="Día">
                <input type="number" step="1" min="1" max="31" data-campo="liquidacion2" value="${dias[1] != null ? dias[1] : ''}" placeholder="Día">
                <input type="number" step="1" min="1" max="31" data-campo="liquidacion3" value="${dias[2] != null ? dias[2] : ''}" placeholder="Día">
            </td>
            ${tieneDescomision ? `<td><button class="btn-toggle-descomision" onclick="toggleDescomision('${path}', ${i})">Descomisión (${(item.descomision || []).length})</button></td>` : ''}
            <td><button class="btn-remove-row" onclick="eliminarFilaTarifa('${path}', ${i})">✕</button></td>
        </tr>`;
        if (tieneDescomision) {
            html += `<tr class="fila-descomision-detalle" id="descomision-${idBase}-${i}" style="display:none;">
                <td colspan="4">${renderizarTramos(path, i)}</td>
            </tr>`;
        }
    });
    tbody.innerHTML = html;
}

function renderizarTodasLasTablas() {
    renderizarTablaTarifas('energia.luz', 'tbodyEnergiaLuz', true);
    renderizarTablaTarifas('energia.gas', 'tbodyEnergiaGas', true);
    renderizarTablaTarifas('telefonia', 'tbodyTelefonia', true);
    renderizarTablaTarifas('placas_solares', 'tbodyPlacasSolares', false);
    renderizarTablaTarifas('alarmas', 'tbodyAlarmas', false);
}

// Lee los inputs actualmente visibles en el DOM y los vuelca sobre comercializadorasData,
// para no perder ediciones del usuario antes de añadir/eliminar filas, cambiar de pestaña o guardar.
function sincronizarDesdeDOM() {
    const specs = [
        { path: 'energia.luz', tbody: 'tbodyEnergiaLuz', tieneDescomision: true },
        { path: 'energia.gas', tbody: 'tbodyEnergiaGas', tieneDescomision: true },
        { path: 'telefonia', tbody: 'tbodyTelefonia', tieneDescomision: true },
        { path: 'placas_solares', tbody: 'tbodyPlacasSolares', tieneDescomision: false },
        { path: 'alarmas', tbody: 'tbodyAlarmas', tieneDescomision: false },
    ];

    specs.forEach(spec => {
        const arr = getArraySector(spec.path);
        const tbody = document.getElementById(spec.tbody);
        if (!tbody) return;
        const idBase = spec.path.replace('.', '-');
        const filas = tbody.querySelectorAll('tr.fila-tarifa');

        filas.forEach((fila, i) => {
            if (!arr[i]) return;
            const inputComercializadora = fila.querySelector('[data-campo="comercializadora"]');
            arr[i].comercializadora = inputComercializadora ? inputComercializadora.value : arr[i].comercializadora;

            const diasInputs = ['liquidacion1', 'liquidacion2', 'liquidacion3']
                .map(campo => fila.querySelector(`[data-campo="${campo}"]`));
            arr[i].liquidacion = diasInputs
                .map(inp => (inp && inp.value !== '' ? parseInt(inp.value, 10) : null))
                .filter(d => d != null && !isNaN(d));

            if (spec.tieneDescomision) {
                const detalle = document.getElementById(`descomision-${idBase}-${i}`);
                if (detalle) {
                    const tramos = detalle.querySelectorAll('.tramo-descomision-row');
                    arr[i].descomision = Array.from(tramos).map(t => ({
                        periodo: t.querySelector('[data-campo="periodo"]').value,
                        porcentaje: parseFloat(t.querySelector('[data-campo="porcentaje"]').value) || 0
                    }));
                }
            }
        });
    });
}

function añadirFilaTarifa(path) {
    sincronizarDesdeDOM();
    getArraySector(path).push({ comercializadora: '', liquidacion: [], descomision: [] });
    renderizarTodasLasTablas();
}

function eliminarFilaTarifa(path, i) {
    sincronizarDesdeDOM();
    getArraySector(path).splice(i, 1);
    renderizarTodasLasTablas();
}

function toggleDescomision(path, i) {
    sincronizarDesdeDOM();
    const idBase = path.replace('.', '-');
    const fila = document.getElementById(`descomision-${idBase}-${i}`);
    if (fila) fila.style.display = (fila.style.display === 'none') ? '' : 'none';
}

function añadirTramoDescomision(path, i) {
    sincronizarDesdeDOM();
    const item = getArraySector(path)[i];
    if (!item.descomision) item.descomision = [];
    item.descomision.push({ periodo: '', porcentaje: 0 });
    renderizarTodasLasTablas();
    const idBase = path.replace('.', '-');
    const fila = document.getElementById(`descomision-${idBase}-${i}`);
    if (fila) fila.style.display = '';
}

function eliminarTramoDescomision(path, i, ti) {
    sincronizarDesdeDOM();
    getArraySector(path)[i].descomision.splice(ti, 1);
    renderizarTodasLasTablas();
    const idBase = path.replace('.', '-');
    const fila = document.getElementById(`descomision-${idBase}-${i}`);
    if (fila) fila.style.display = '';
}

// ============================================================================
// MÓDULO: FILTROS DE FECHA/DIMENSIÓN + GRÁFICOS JERÁRQUICOS DE VENTAS Y BAJAS
// ============================================================================

// Cada chart ('ventas' | 'bajas') tiene su propio juego de filtros, independiente del otro.
function _sufijoScope(scope) {
    return scope === 'ventas' ? 'Ventas' : 'Bajas';
}

function _idFiltro(scope, campo) {
    return `filtro${campo}${_sufijoScope(scope)}`;
}

function _valorFiltro(scope, campo) {
    const el = document.getElementById(_idFiltro(scope, campo));
    return el ? el.value : '';
}

// Filtros dimensionales (comercializadora / luz-gas / tarifa), sin fecha.
function aplicaFiltrosDimensionales(scope, fila) {
    const comercializadora = _valorFiltro(scope, 'Comercializadora');
    const tipoEnergia = _valorFiltro(scope, 'TipoEnergia');
    const tarifa = _valorFiltro(scope, 'Tarifa');

    if (comercializadora && fila.comercializadora !== comercializadora) return false;
    if (tipoEnergia && fila.tipo_energia !== tipoEnergia) return false;
    if (tarifa && fila.tarifa !== tarifa) return false;
    return true;
}

// true si `fecha` cumple el Año/Mes/Desde/Hasta configurado para `scope`. Se parametriza
// qué campo de fecha de la fila se compara (fecha de venta para Ventas, fecha de baja
// para Bajas), porque el rango "Desde/Hasta" del filtro de Bajas se refiere a cuándo
// ocurrió la BAJA, no a cuándo ocurrió la venta original.
function _fechaPasaFiltro(scope, fecha) {
    const anio = _valorFiltro(scope, 'Anio');
    const mes = _valorFiltro(scope, 'Mes');
    const diaDesde = _valorFiltro(scope, 'DiaDesde'); // YYYY-MM-DD
    const diaHasta = _valorFiltro(scope, 'DiaHasta'); // YYYY-MM-DD

    if (diaDesde || diaHasta) {
        return _fechaEnRango(fecha, diaDesde, diaHasta);
    }
    if (anio || mes) {
        if (!fecha) return false;
        const partes = fecha.split('-'); // YYYY-MM-DD
        if (anio && partes[0] !== anio) return false;
        if (mes && String(parseInt(partes[1], 10)) !== String(parseInt(mes, 10))) return false;
    }
    return true;
}

// Filtros completos para Ventas: dimensionales + fecha de VENTA.
function aplicaFiltrosBase(scope, fila) {
    return aplicaFiltrosDimensionales(scope, fila) && _fechaPasaFiltro(scope, fila.fecha);
}

function aplicaDrillDown(fila, estado) {
    if (estado.sector && fila.categoria !== estado.sector) return false;
    if (estado.comercializadora && fila.comercializadora !== estado.comercializadora) return false;
    return true;
}

function campoAgrupacionNivel(estado) {
    if (estado.nivel === 0) return 'categoria';
    if (estado.nivel === 1) return 'comercializadora';
    return 'tipo_energia'; // nivel 2, solo Energía (Luz/Gas)
}

// La Categoría del Excel puede venir como "Energía", "ENERGIA", "energia"... (sin
// normalizar, a diferencia del backend). Se compara sin tildes/mayúsculas para que el
// nivel Luz/Gas de Energía se reconozca siempre, sea cual sea el formato exacto del Excel.
function _esSectorEnergia(valor) {
    if (!valor) return false;
    return valor.toString().trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '') === 'ENERGIA';
}

function esNivelMaximo(estado) {
    if (estado.nivel === 1 && !_esSectorEnergia(estado.sector)) return true; // Telefonía/Placas/Alarmas: 2 niveles
    if (estado.nivel === 2) return true; // Energía: Luz/Gas es el último nivel clicable
    return false;
}

// ----------------------------------------------------------------------------
// VENTAS: serie temporal (por mes) combinada con el drill-down por comercializadora/tarifa
// ----------------------------------------------------------------------------

function calcularSerieTemporalVentas(estado) {
    const campo = campoAgrupacionNivel(estado);
    const filasBase = detalleGlobal.filter(f => aplicaFiltrosBase('ventas', f) && aplicaDrillDown(f, estado));

    const mesesSet = new Set();
    const gruposSet = new Set();
    filasBase.forEach(f => {
        if (f.mes) mesesSet.add(f.mes);
        gruposSet.add(f[campo] || 'Sin dato');
    });
    const meses = Array.from(mesesSet).sort();
    const grupos = Array.from(gruposSet).sort();

    const datosPorGrupoMes = {};
    grupos.forEach(g => { datosPorGrupoMes[g] = {}; });
    const totalPorMes = {};

    filasBase.forEach(f => {
        const g = f[campo] || 'Sin dato';
        const m = f.mes;
        if (!m) return;
        datosPorGrupoMes[g][m] = (datosPorGrupoMes[g][m] || 0) + (f.importe || 0);
        totalPorMes[m] = (totalPorMes[m] || 0) + (f.importe || 0);
    });

    const series = grupos.map(g => ({
        name: g,
        type: 'column',
        data: meses.map(m => datosPorGrupoMes[g][m] || 0)
    }));
    series.push({
        name: 'Total Ventas',
        type: 'line',
        data: meses.map(m => totalPorMes[m] || 0)
    });

    return { meses, series, grupos };
}

function renderTooltipTarifasVentas(estado, claveGrupo, mes) {
    const campoNivelActual = campoAgrupacionNivel(estado);
    let filas = detalleGlobal.filter(f => aplicaFiltrosBase('ventas', f) && aplicaDrillDown(f, estado));
    filas = filas.filter(f => (f[campoNivelActual] || 'Sin dato') === claveGrupo);
    // La barra sobre la que se hace hover pertenece a UN mes concreto (eje X del gráfico);
    // sin este filtro se sumaban las tarifas de TODOS los meses juntas (bug reportado).
    if (mes) filas = filas.filter(f => f.mes === mes);

    const porTarifa = {};
    filas.forEach(f => {
        const t = f.tarifa || 'Sin tarifa';
        porTarifa[t] = (porTarifa[t] || 0) + (f.importe || 0);
    });

    const claves = Object.keys(porTarifa);
    const filasHtml = claves.map(t => {
        const val = porTarifa[t];
        const txt = val.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
        return `<div style="display:flex;justify-content:space-between;gap:12px;"><span>${t}</span><strong>${txt}</strong></div>`;
    }).join('');

    return `<div style="padding:10px 12px;min-width:200px;background:white;border:1px solid #e0e5f5;border-radius:8px;">
        <div style="font-weight:700;margin-bottom:6px;color:#1e3c72;">${claveGrupo}${mes ? ' — ' + mes : ''} — por tarifa</div>
        ${filasHtml || '<div>Sin desglose por tarifa</div>'}
    </div>`;
}

function renderGraficoVentasJerarquico() {
    const estado = estadoJerarquico.ventas;
    const { meses, series, grupos } = calcularSerieTemporalVentas(estado);

    const el = document.getElementById('chartVentasSector');
    if (!el) return;
    el.innerHTML = '';

    if (chartInstancesJerarquico.ventas) {
        try { chartInstancesJerarquico.ventas.destroy(); } catch (e) { /* noop */ }
        chartInstancesJerarquico.ventas = null;
    }

    if (meses.length === 0) {
        el.innerHTML = '<p style="padding:20px;color:#6b7280;">Sin datos para los filtros seleccionados.</p>';
        actualizarBreadcrumbJerarquico('ventas');
        return;
    }

    const nivelMax = esNivelMaximo(estado);

    chartInstancesJerarquico.ventas = new ApexCharts(el, {
        series,
        chart: {
            height: 300,
            type: 'line',
            stacked: false,
            toolbar: { show: true },
            events: {
                dataPointSelection: function (event, chartContext, config) {
                    if (nivelMax) return;
                    const serieClicada = series[config.seriesIndex];
                    if (!serieClicada || serieClicada.name === 'Total Ventas') return;
                    avanzarNivelJerarquico('ventas', serieClicada.name);
                }
            }
        },
        colors: (paletasGlobal && paletasGlobal.variada) || ['#1e3c72', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'],
        stroke: { width: Array(grupos.length).fill(0).concat([3]) },
        plotOptions: { bar: { columnWidth: '60%' } },
        fill: { opacity: 0.85 },
        labels: meses,
        xaxis: { type: 'category' },
        yaxis: {
            title: { text: 'Ventas (€)' },
            labels: { formatter: v => (v != null ? v.toLocaleString('es-ES', { maximumFractionDigits: 0 }) + '€' : '') }
        },
        legend: { position: 'top', horizontalAlign: 'center' },
        tooltip: nivelMax ? {
            shared: false,
            intersect: true,
            custom: function (opts) {
                const serie = series[opts.seriesIndex];
                const nombreSerie = serie && serie.name;
                if (!nombreSerie || nombreSerie === 'Total Ventas') {
                    const val = opts.series[opts.seriesIndex][opts.dataPointIndex];
                    return `<div style="padding:8px 10px;">${nombreSerie || ''}: <strong>${(val || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</strong></div>`;
                }
                return renderTooltipTarifasVentas(estado, nombreSerie, meses[opts.dataPointIndex]);
            }
        } : {
            shared: true,
            intersect: false,
            // Tooltip fijo en una esquina (no sigue al cursor) para que no tape la barra
            // sobre la que se está pasando el ratón, y con el % de cada grupo sobre el
            // total de ventas de ese mes.
            fixed: { enabled: true, position: 'topRight', offsetX: 0, offsetY: 0 },
            custom: function (opts) {
                const mes = meses[opts.dataPointIndex];
                const totalSerie = series.find(s => s.name === 'Total Ventas');
                const total = totalSerie ? (totalSerie.data[opts.dataPointIndex] || 0) : 0;
                const filas = series
                    .filter(s => s.name !== 'Total Ventas')
                    .map(s => {
                        const val = s.data[opts.dataPointIndex] || 0;
                        const pct = total > 0 ? (val / total * 100) : 0;
                        return { nombre: s.name, val, pct };
                    })
                    .sort((a, b) => b.val - a.val);

                const fmt = v => v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
                const filasHtml = filas.map(f => `
                    <div style="display:flex;justify-content:space-between;gap:16px;padding:2px 0;">
                        <span>${f.nombre}</span>
                        <span><strong>${fmt(f.val)}</strong> <span style="color:#6b7280;">(${f.pct.toFixed(1)}%)</span></span>
                    </div>`).join('');

                return `<div style="padding:10px 12px;min-width:220px;background:white;border:1px solid #e0e5f5;border-radius:8px;">
                    <div style="font-weight:700;margin-bottom:6px;color:#1e3c72;">${mes || ''} — Total: ${fmt(total)}</div>
                    ${filasHtml || '<div>Sin datos</div>'}
                </div>`;
            }
        }
    });
    chartInstancesJerarquico.ventas.render();

    actualizarBreadcrumbJerarquico('ventas');
}

// ----------------------------------------------------------------------------
// BAJAS: total agregado por grupo (sector -> comercializadora -> luz/gas), independiente de Ventas
// ----------------------------------------------------------------------------

// true si `fecha` (YYYY-MM-DD) cae dentro de [desde, hasta], tratando cada límite
// vacío como abierto. Comparación lexicográfica, válida en formato ISO.
function _fechaEnRango(fecha, desde, hasta) {
    if (!fecha) return false;
    if (desde && fecha < desde) return false;
    if (hasta && fecha > hasta) return false;
    return true;
}

// Serie temporal (por mes de BAJA) combinada con el drill-down por sector -> comercializadora
// -> luz/gas (Energía) o sector -> comercializadora -> tarifa/paquete (resto), igual que Ventas:
// una barra por grupo, agrupadas dentro de cada mes, más una línea de "Total Bajas".
// Tasa de bajas (%) de un grupo en un mes = bajas de ESE grupo (por fecha de baja) / ventas
// de ESE MISMO grupo (por fecha de venta), ambas en el mismo mes — NO sobre el total del
// segmento. Así se compara la calidad de retención entre comercializadoras/tarifas con
// independencia de su volumen de ventas (una comercializadora pequeña con mucho churn se ve
// igual de mal que una grande, en vez de quedar diluida en el total).
function _tasaBaja(ventas, bajas) {
    if (ventas > 0) return Math.round((bajas / ventas) * 1000) / 10; // 1 decimal
    return bajas > 0 ? null : 0; // bajas sin ninguna venta en ese mes/grupo: no calculable (N/A)
}

function calcularSerieTemporalBajas(estado) {
    const campo = campoAgrupacionNivel(estado);
    const filasBase = detalleGlobal.filter(f => aplicaFiltrosDimensionales('bajas', f) && aplicaDrillDown(f, estado));
    // Mes fijado al entrar al drill-down (click en la barra de un mes concreto): a partir de
    // ahí, comercializadora/luz-gas/tarifa se quedan restringidos a ESE mes, no a todos.
    const mesFiltro = estado.mes || null;

    const mesesSet = new Set();
    const gruposSet = new Set();
    filasBase.forEach(f => {
        const g = f[campo] || 'Sin dato';
        if (f.fecha && _fechaPasaFiltro('bajas', f.fecha)) {
            const m = f.fecha.slice(0, 7);
            if (!mesFiltro || m === mesFiltro) { mesesSet.add(m); gruposSet.add(g); }
        }
        if (f.es_baja && f.fecha_baja && _fechaPasaFiltro('bajas', f.fecha_baja)) {
            const m = f.fecha_baja.slice(0, 7);
            if (!mesFiltro || m === mesFiltro) { mesesSet.add(m); gruposSet.add(g); }
        }
    });
    const meses = Array.from(mesesSet).sort();
    const grupos = Array.from(gruposSet).sort();

    const ventasPorGrupoMes = {}, bajasPorGrupoMes = {};
    grupos.forEach(g => { ventasPorGrupoMes[g] = {}; bajasPorGrupoMes[g] = {}; });

    filasBase.forEach(f => {
        const g = f[campo] || 'Sin dato';
        if (!ventasPorGrupoMes[g]) { ventasPorGrupoMes[g] = {}; bajasPorGrupoMes[g] = {}; }
        if (f.fecha && _fechaPasaFiltro('bajas', f.fecha)) {
            const m = f.fecha.slice(0, 7);
            if (!mesFiltro || m === mesFiltro) ventasPorGrupoMes[g][m] = (ventasPorGrupoMes[g][m] || 0) + 1;
        }
        if (f.es_baja && f.fecha_baja && _fechaPasaFiltro('bajas', f.fecha_baja)) {
            const m = f.fecha_baja.slice(0, 7);
            if (!mesFiltro || m === mesFiltro) bajasPorGrupoMes[g][m] = (bajasPorGrupoMes[g][m] || 0) + 1;
        }
    });

    const series = grupos.map(g => ({
        name: g,
        type: 'column',
        data: meses.map(m => _tasaBaja(ventasPorGrupoMes[g][m] || 0, bajasPorGrupoMes[g][m] || 0))
    }));
    // Total: % agregado del nivel actual (todas las ventas y bajas del mes entre todos los
    // grupos), no el promedio de los % de cada grupo (que distorsionaría a los de poco volumen).
    series.push({
        name: 'Total Bajas (%)',
        type: 'line',
        data: meses.map(m => {
            let v = 0, b = 0;
            grupos.forEach(g => { v += ventasPorGrupoMes[g][m] || 0; b += bajasPorGrupoMes[g][m] || 0; });
            return _tasaBaja(v, b);
        })
    });

    return { meses, series, grupos };
}

function renderTooltipTarifasBajas(estado, claveGrupo, mes) {
    const campoNivelActual = campoAgrupacionNivel(estado);
    let filas = detalleGlobal.filter(f => aplicaFiltrosDimensionales('bajas', f) && aplicaDrillDown(f, estado));
    filas = filas.filter(f => (f[campoNivelActual] || 'Sin dato') === claveGrupo);

    const ventasPorTarifa = {}, bajasPorTarifa = {};
    filas.forEach(f => {
        const t = f.tarifa || 'Sin tarifa';
        if (f.fecha && _fechaPasaFiltro('bajas', f.fecha) && (!mes || f.fecha.slice(0, 7) === mes)) {
            ventasPorTarifa[t] = (ventasPorTarifa[t] || 0) + 1;
        }
        if (f.es_baja && f.fecha_baja && _fechaPasaFiltro('bajas', f.fecha_baja) && (!mes || f.fecha_baja.slice(0, 7) === mes)) {
            bajasPorTarifa[t] = (bajasPorTarifa[t] || 0) + 1;
        }
    });

    const claves = Array.from(new Set([...Object.keys(ventasPorTarifa), ...Object.keys(bajasPorTarifa)]));
    const filas2 = claves.map(t => {
        const v = ventasPorTarifa[t] || 0;
        const b = bajasPorTarifa[t] || 0;
        return { t, v, b, pct: _tasaBaja(v, b) };
    }).sort((a, b) => (b.pct == null ? -1 : b.pct) - (a.pct == null ? -1 : a.pct));

    const filasHtml = filas2.map(f => {
        const txt = f.pct == null ? 'N/A' : f.pct.toFixed(1) + '%';
        return `<div style="display:flex;justify-content:space-between;gap:12px;"><span>${f.t}</span><span><strong>${txt}</strong> <span style="color:#6b7280;">(${f.b}/${f.v})</span></span></div>`;
    }).join('');

    return `<div style="padding:10px 12px;min-width:220px;background:white;border:1px solid #e0e5f5;border-radius:8px;">
        <div style="font-weight:700;margin-bottom:6px;color:#1e3c72;">${claveGrupo}${mes ? ' — ' + mes : ''} — % bajas por tarifa</div>
        ${filasHtml || '<div>Sin datos en este período</div>'}
    </div>`;
}

function renderGraficoBajasJerarquico() {
    const estado = estadoJerarquico.bajas;
    const { meses, series, grupos } = calcularSerieTemporalBajas(estado);

    const el = document.getElementById('chartTotalBajasJerarquico');
    if (!el) return;
    el.innerHTML = '';

    if (chartInstancesJerarquico.bajas) {
        try { chartInstancesJerarquico.bajas.destroy(); } catch (e) { /* noop */ }
        chartInstancesJerarquico.bajas = null;
    }

    if (meses.length === 0) {
        el.innerHTML = '<p style="padding:20px;color:#6b7280;">Sin datos para los filtros seleccionados.</p>';
        actualizarBreadcrumbJerarquico('bajas');
        return;
    }

    const nivelMax = esNivelMaximo(estado);

    chartInstancesJerarquico.bajas = new ApexCharts(el, {
        series,
        chart: {
            height: 300,
            type: 'line',
            stacked: false,
            toolbar: { show: true },
            events: {
                dataPointSelection: function (event, chartContext, config) {
                    if (nivelMax) return;
                    const serieClicada = series[config.seriesIndex];
                    if (!serieClicada || serieClicada.name.indexOf('Total') === 0) return;
                    avanzarNivelJerarquico('bajas', serieClicada.name, meses[config.dataPointIndex]);
                }
            }
        },
        colors: (paletasGlobal && paletasGlobal.variada) || ['#1e3c72', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'],
        stroke: { width: Array(grupos.length).fill(0).concat([3]) },
        plotOptions: { bar: { columnWidth: '60%' } },
        fill: { opacity: 0.85 },
        labels: meses,
        xaxis: { type: 'category' },
        yaxis: {
            // % bajas de CADA grupo = bajas del grupo ese mes / ventas de ese mismo grupo ese
            // mes (no sobre el total del segmento), para comparar retención entre
            // comercializadoras/tarifas con independencia de su volumen de ventas.
            title: { text: '% Bajas (sobre ventas del propio grupo)' },
            labels: { formatter: v => (v != null ? v.toFixed(1) + '%' : 'N/A') }
        },
        legend: { position: 'top', horizontalAlign: 'center' },
        tooltip: nivelMax ? {
            shared: false,
            intersect: true,
            custom: function (opts) {
                const serie = series[opts.seriesIndex];
                const nombreSerie = serie && serie.name;
                if (!nombreSerie || nombreSerie.indexOf('Total') === 0) {
                    const val = opts.series[opts.seriesIndex][opts.dataPointIndex];
                    return `<div style="padding:8px 10px;">${nombreSerie || ''}: <strong>${val == null ? 'N/A' : val.toFixed(1) + '%'}</strong></div>`;
                }
                return renderTooltipTarifasBajas(estado, nombreSerie, meses[opts.dataPointIndex]);
            }
        } : {
            shared: true,
            intersect: false,
            // Tooltip fijo en una esquina (no sigue al cursor) para que no tape la barra
            // sobre la que se está pasando el ratón, igual que en Ventas por Sector.
            fixed: { enabled: true, position: 'topRight', offsetX: 0, offsetY: 0 },
            custom: function (opts) {
                const mes = meses[opts.dataPointIndex];
                const filas = series
                    .filter(s => s.name.indexOf('Total') !== 0)
                    .map(s => ({ nombre: s.name, val: s.data[opts.dataPointIndex] }))
                    .sort((a, b) => (b.val == null ? -1 : b.val) - (a.val == null ? -1 : a.val));
                const filasHtml = filas.map(f => `
                    <div style="display:flex;justify-content:space-between;gap:16px;padding:2px 0;">
                        <span>${f.nombre}</span>
                        <strong>${f.val == null ? 'N/A' : f.val.toFixed(1) + '%'}</strong>
                    </div>`).join('');
                return `<div style="padding:10px 12px;min-width:200px;background:white;border:1px solid #e0e5f5;border-radius:8px;">
                    <div style="font-weight:700;margin-bottom:6px;color:#1e3c72;">${mes || ''} — % de bajas por grupo</div>
                    ${filasHtml || '<div>Sin datos</div>'}
                </div>`;
            }
        }
    });
    chartInstancesJerarquico.bajas.render();

    actualizarBreadcrumbJerarquico('bajas');
}

function renderGraficoJerarquico(tipo) {
    if (tipo === 'ventas') renderGraficoVentasJerarquico();
    else renderGraficoBajasJerarquico();
}

// `mes` (solo lo usa Bajas) fija el mes sobre el que se hizo click al entrar al primer
// nivel de drill-down, para que TODOS los niveles siguientes (comercializadora, luz/gas,
// tarifa) se queden restringidos a ese mismo mes en vez de volver a mostrar todos los meses.
function avanzarNivelJerarquico(tipo, clave, mes) {
    const estado = estadoJerarquico[tipo];
    if (estado.nivel === 0) {
        estado.sector = clave;
        estado.nivel = 1;
        if (mes) estado.mes = mes;
    } else if (estado.nivel === 1 && _esSectorEnergia(estado.sector)) {
        estado.comercializadora = clave;
        estado.nivel = 2;
    }
    renderGraficoJerarquico(tipo);
}

function volverNivelJerarquico(tipo) {
    const estado = estadoJerarquico[tipo];
    if (estado.nivel === 2) {
        estado.comercializadora = null;
        estado.nivel = 1;
    } else if (estado.nivel === 1) {
        estado.sector = null;
        estado.nivel = 0;
        estado.mes = null;
    }
    renderGraficoJerarquico(tipo);
}

function actualizarBreadcrumbJerarquico(tipo) {
    const estado = estadoJerarquico[tipo];
    const partes = [];
    if (estado.sector) partes.push(estado.mes ? `${estado.sector} (${estado.mes})` : estado.sector);
    if (estado.comercializadora) partes.push(estado.comercializadora);

    const breadcrumbId = tipo === 'ventas' ? 'breadcrumbVentas' : 'breadcrumbBajas';
    const btnVolverId = tipo === 'ventas' ? 'btnVolverVentas' : 'btnVolverBajas';
    const elBreadcrumb = document.getElementById(breadcrumbId);
    const elBtn = document.getElementById(btnVolverId);
    if (elBreadcrumb) elBreadcrumb.textContent = partes.length ? ('› ' + partes.join(' › ')) : '';
    if (elBtn) elBtn.style.display = estado.nivel > 0 ? 'inline-block' : 'none';
}

function poblarFiltrosDetalle(scope) {
    const anios = new Set(), comercializadoras = new Set(), tiposEnergia = new Set(), tarifas = new Set();
    detalleGlobal.forEach(f => {
        if (f.fecha) anios.add(f.fecha.slice(0, 4));
        if (f.comercializadora) comercializadoras.add(f.comercializadora);
        if (f.tipo_energia) tiposEnergia.add(f.tipo_energia);
        if (f.tarifa) tarifas.add(f.tarifa);
    });

    const llenarSelect = (id, valores, etiquetaTodos) => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const valorPrevio = sel.value;
        sel.innerHTML = `<option value="">${etiquetaTodos}</option>` +
            Array.from(valores).sort().map(v => `<option value="${v}">${v}</option>`).join('');
        if (Array.from(sel.options).some(o => o.value === valorPrevio)) sel.value = valorPrevio;
    };

    llenarSelect(_idFiltro(scope, 'Anio'), anios, 'Todos');
    llenarSelect(_idFiltro(scope, 'Comercializadora'), comercializadoras, 'Todas');
    llenarSelect(_idFiltro(scope, 'TipoEnergia'), tiposEnergia, 'Todos');
    llenarSelect(_idFiltro(scope, 'Tarifa'), tarifas, 'Todas');

    const selMes = document.getElementById(_idFiltro(scope, 'Mes'));
    if (selMes && selMes.options.length <= 1) {
        const nombresMes = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        selMes.innerHTML = '<option value="">Todos</option>' + nombresMes.map((n, i) => `<option value="${i + 1}">${n}</option>`).join('');
    }
}

function _wireFiltros(scope, renderFn) {
    ['Anio', 'Mes', 'Comercializadora', 'TipoEnergia', 'Tarifa', 'DiaDesde', 'DiaHasta'].forEach(campo => {
        const el = document.getElementById(_idFiltro(scope, campo));
        if (el) el.addEventListener('change', renderFn);
    });

    const btnLimpiar = document.getElementById(`btnLimpiarFiltros${_sufijoScope(scope)}`);
    if (btnLimpiar) btnLimpiar.addEventListener('click', () => {
        ['Anio', 'Mes', 'Comercializadora', 'TipoEnergia', 'Tarifa', 'DiaDesde', 'DiaHasta'].forEach(campo => {
            const el = document.getElementById(_idFiltro(scope, campo));
            if (el) el.value = '';
        });
        renderFn();
    });
}

let _filtrosDetalleWireados = false;

function inicializarFiltrosYJerarquicos() {
    poblarFiltrosDetalle('ventas');
    poblarFiltrosDetalle('bajas');

    estadoJerarquico.ventas = { nivel: 0, sector: null, comercializadora: null };
    estadoJerarquico.bajas = { nivel: 0, sector: null, comercializadora: null, mes: null };

    renderGraficoVentasJerarquico();
    renderGraficoBajasJerarquico();

    if (_filtrosDetalleWireados) return;
    _filtrosDetalleWireados = true;

    _wireFiltros('ventas', renderGraficoVentasJerarquico);
    _wireFiltros('bajas', renderGraficoBajasJerarquico);
}

function guardarComercializadoras() {
    sincronizarDesdeDOM();
    fetch('/api/guardar-comercializadoras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comercializadoras: comercializadorasData })
    })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                cerrarModalComercializadoras();
            } else {
                alert('No se pudo guardar la configuración de comercializadoras.');
            }
        })
        .catch(e => {
            console.error('Error al guardar comercializadoras:', e);
            alert('Error al guardar la configuración de comercializadoras.');
        });
}
