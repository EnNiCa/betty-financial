// pilares.js - Dashboard de 4 Pilares v4.0 con gráficos actualizados

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
            
            // Mostrar botón exportar PDF
            const btnPDF = document.getElementById('btnExportarPDF');
            if (btnPDF) btnPDF.style.display = 'inline-flex';
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
    fileInput.addEventListener('change', procesarArchivo);
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
    
    // Mostrar métricas según tipo
    const cm = pilares.cash_management;
    
    if (cm.tipo_metrica === 'runway') {
        document.getElementById('runwayMeses').textContent = cm.runway_meses ? cm.runway_meses.toFixed(1) : '-';
    } else if (cm.tipo_metrica === 'reserva') {
        document.getElementById('runwayMeses').textContent = cm.meses_reserva ? cm.meses_reserva.toFixed(1) + ' (reserva)' : '-';
    } else {
        document.getElementById('runwayMeses').textContent = '∞ (equilibrio)';
    }
    
    document.getElementById('cajaActual').textContent = formatMoney(cm.caja_disponible);
    document.getElementById('burnRate').textContent = formatMoney(cm.net_burn_rate);
    
    // NUEVO GRÁFICO: Net Burn + Gross Burn (líneas)
    if (cm.net_burn_historico && cm.gross_burn_historico) {
        new ApexCharts(document.querySelector("#chartBurnRates"), {
            series: [
                { name: 'Net Burn Rate', data: cm.net_burn_historico.valores },
                { name: 'Gross Burn Rate', data: cm.gross_burn_historico.valores }
            ],
            chart: { type: 'line', height: 300, toolbar: { show: true } },
            colors: [paletas.calor[3], paletas.calor[1]],
            xaxis: { categories: cm.net_burn_historico.meses },
            stroke: { width: [3, 3], curve: 'smooth' },
            markers: { size: 5 },
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
        
        // Agregar análisis
        const netBurnPromedio = cm.net_burn_rate;
        const grossBurnPromedio = cm.gross_burn_rate;
        let analisisBurn = `El <strong>Net Burn Rate</strong> (€${formatMoney(netBurnPromedio)}/mes) muestra el consumo real de caja después de ingresos. `;
        analisisBurn += `El <strong>Gross Burn Rate</strong> (€${formatMoney(grossBurnPromedio)}/mes) muestra el total de gastos operativos. `;
        
        if (netBurnPromedio > 0) {
            analisisBurn += `La empresa está <strong>consumiendo caja</strong>. `;
            const diferencia = grossBurnPromedio - netBurnPromedio;
            const cobertura = (diferencia / grossBurnPromedio * 100).toFixed(1);
            analisisBurn += `Los ingresos cubren el ${cobertura}% de los gastos totales.`;
        } else if (netBurnPromedio < 0) {
            analisisBurn += `La empresa está <strong>generando caja</strong> (rentable). Los ingresos superan los gastos.`;
        } else {
            analisisBurn += `La empresa está en <strong>punto de equilibrio</strong>. Ingresos = Gastos.`;
        }
        
        const containerBurn = document.querySelector("#chartBurnRates").closest('.chart-container');
        if (containerBurn && !containerBurn.querySelector('.chart-analysis')) {
            const pAnalisis = document.createElement('p');
            pAnalisis.className = 'chart-analysis';
            pAnalisis.innerHTML = analisisBurn;
            containerBurn.appendChild(pAnalisis);
        }
    }
    
    // NUEVO GRÁFICO: Combinado Ingresos/Gastos/Caja
    if (cm.combinado_mensual && cm.combinado_mensual.length > 0) {
        new ApexCharts(document.querySelector("#chartCombinado"), {
            series: [
                { name: 'Ingresos', type: 'column', data: cm.combinado_mensual.map(m => m.ingresos) },
                { name: 'Gastos', type: 'column', data: cm.combinado_mensual.map(m => m.gastos) },
                { name: 'Caja', type: 'line', data: cm.combinado_mensual.map(m => m.caja) }
            ],
            chart: { height: 350, type: 'line', stacked: false },
            colors: ['#10b981', '#ef4444', '#1e40af'],  // Verde ingresos, Rojo gastos, Turquesa caja
            stroke: { width: [0, 0, 3], curve: 'smooth' },
            plotOptions: {
                bar: {
                    columnWidth: '50%'
                }
            },
            fill: {
                opacity: [0.85, 0.85, 1],
                gradient: {
                    inverseColors: false,
                    shade: 'light',
                    type: "vertical",
                    opacityFrom: 0.85,
                    opacityTo: 0.55,
                    stops: [0, 100, 100, 100]
                }
            },
            labels: cm.combinado_mensual.map(m => m.mes),
            markers: { size: [0, 0, 5] },
            xaxis: { type: 'category' },
            yaxis: [
                {
                    title: { text: 'Ingresos / Gastos (€)' },
                    labels: {
                        formatter: function(val) {
                            return val != null ? val.toLocaleString('es-ES', {maximumFractionDigits: 0}) + '€' : '';
                        }
                    }
                },
                {
                    opposite: true,
                    title: { text: 'Caja (€)' },
                    labels: {
                        formatter: function(val) {
                            return val != null ? val.toLocaleString('es-ES', {maximumFractionDigits: 0}) + '€' : '';
                        }
                    }
                }
            ],
            legend: { position: 'top' },
            tooltip: {
                shared: true,
                intersect: false,
                y: {
                    formatter: function(val) {
                        return val != null ? val.toLocaleString('es-ES', {minimumFractionDigits: 2}) + ' €' : '';
                    }
                }
            }
        }).render();
    }
    
    // Proyección de Caja (mantener gráfico existente)
    new ApexCharts(document.querySelector("#chartProyeccionCaja"), {
        series: [{ name: 'Caja Proyectada', data: cm.proyeccion_caja }],
        chart: { type: 'area', height: 250 },
        colors: [paletas.calor[0]],
        xaxis: { categories: Array.from({length: 12}, (_, i) => `Mes ${i+1}`) },
        tooltip: tooltipMoney
    }).render();
    
    // ==========================================
    // PILAR 2: EFICIENCIA
    // ==========================================
    
    const ef = pilares.eficiencia;
    
    document.getElementById('margenContribucion').textContent = ef.margen_contribucion.toFixed(2);
    document.getElementById('cac').textContent = formatMoney(ef.cac);
    
    // Mostrar Churn Rate en lugar de ingreso_promedio_venta
    if (document.getElementById('ingresoVenta')) {
        document.getElementById('ingresoVenta').textContent = ef.churn_rate ? ef.churn_rate.toFixed(2) + '%' : '0%';
        // Cambiar label si existe
        const label = document.querySelector('#ingresoVenta').closest('.metric-small').querySelector('.metric-label');
        if (label) label.textContent = 'Churn Rate';
        const unit = document.querySelector('#ingresoVenta').closest('.metric-small').querySelector('.metric-unit');
        if (unit) unit.textContent = '';
    }
    
    // NUEVO GRÁFICO: Churn Rate Histórico (si existe)
    if (ef.churn_historico && ef.churn_historico.length > 0) {
        new ApexCharts(document.querySelector("#chartROICanal"), {
            series: [{ name: 'Churn Rate', data: ef.churn_historico.map(ch => ch.churn_rate) }],
            chart: { type: 'line', height: 250 },
            colors: [paletas.variada[1]],
            xaxis: { categories: ef.churn_historico.map(ch => ch.mes) },
            stroke: { width: 3, curve: 'smooth' },
            markers: { size: 5 },
            yaxis: {
                title: { text: 'Churn Rate (%)' },
                labels: {
                    formatter: function(val) {
                        return val != null ? val.toFixed(2) + '%' : '';
                    }
                }
            },
            tooltip: tooltipPercent
        }).render();
    }
    
    // ==========================================
    // PILAR 3: CRECIMIENTO
    // ==========================================
    
    const cr = pilares.crecimiento;
    
    document.getElementById('momGrowth').textContent = cr.ultimo_mom.toFixed(2);
    
    const tendenciaIcon = cr.tendencia === 'creciente' ? '📈' : '📉';
    const tendenciaText = cr.tendencia === 'creciente' ? 'Tendencia creciente' : 'Tendencia decreciente';
    document.getElementById('tendenciaInfo').innerHTML = `<span class="tendencia-icon">${tendenciaIcon}</span><span>${tendenciaText}</span>`;
    
    // MODIFICADO: Gráfico Evolución Ventas con Variación %
    if (cr.ventas_mensuales && cr.ventas_mensuales.length > 0) {
        new ApexCharts(document.querySelector("#chartCrecimiento"), {
            series: [
                { name: 'Ventas', type: 'column', data: cr.ventas_mensuales.map(v => v.ventas) },
                { name: 'Variación %', type: 'line', data: cr.ventas_mensuales.map(v => v.variacion_pct) }
            ],
            chart: { height: 300, type: 'line' },
            colors: [paletas.variada[2], paletas.calor[3]],
            stroke: { width: [0, 3], curve: 'smooth' },
            plotOptions: {
                bar: { columnWidth: '50%' }
            },
            fill: {
                opacity: [0.85, 1]
            },
            labels: cr.ventas_mensuales.map(v => v.mes),
            markers: { size: [0, 5] },
            xaxis: { type: 'category' },
            yaxis: [
                {
                    title: { text: 'Ventas (€)' },
                    labels: {
                        formatter: function(val) {
                            return val != null ? val.toLocaleString('es-ES', {maximumFractionDigits: 0}) + '€' : '';
                        }
                    }
                },
                {
                    opposite: true,
                    title: { text: 'Variación (%)' },
                    labels: {
                        formatter: function(val) {
                            return val != null ? val.toFixed(2) + '%' : '';
                        }
                    }
                }
            ],
            legend: { position: 'top' },
            tooltip: {
                shared: true,
                intersect: false
            }
        }).render();
    }
    
    // MODIFICADO: Ventas por Sector (más pequeño, líneas + barras)
    if (cr.ventas_sector_mes && cr.ventas_sector_mes.length > 0) {
        // Preparar datos para gráfico combinado
        const sectores = Object.keys(cr.ventas_sector_mes[0].sectores || {});
        const seriesSectores = sectores.map(sector => ({
            name: sector,
            type: 'column',
            data: cr.ventas_sector_mes.map(mes => mes.sectores[sector] || 0)
        }));
        
        seriesSectores.push({
            name: 'Total Ventas',
            type: 'line',
            data: cr.ventas_sector_mes.map(mes => mes.total)
        });
        
        new ApexCharts(document.querySelector("#chartVentasSector"), {
            series: seriesSectores,
            chart: { height: 280, type: 'line', stacked: false },
            colors: paletas.variada,
            stroke: { width: Array(sectores.length).fill(0).concat([3]) },
            plotOptions: {
                bar: { columnWidth: '60%' }
            },
            fill: { opacity: 0.85 },
            labels: cr.ventas_sector_mes.map(mes => mes.mes),
            xaxis: { type: 'category' },
            yaxis: {
                title: { text: 'Ventas (€)' },
                labels: {
                    formatter: function(val) {
                        return val != null ? val.toLocaleString('es-ES', {maximumFractionDigits: 0}) + '€' : '';
                    }
                }
            },
            legend: { position: 'top', horizontalAlign: 'center' },
            tooltip: tooltipMoney
        }).render();
    }
    
    // ==========================================
    // PILAR 4: OpEx
    // ==========================================
    
    const op = pilares.opex;
    
    document.getElementById('gastosTotal').textContent = formatMoney(op.total_gastos);
    document.getElementById('promedioGastos').textContent = formatMoney(op.promedio_gastos_mensual);
    
    // MODIFICADO: OPEX - Línea (evolución) + Barras (rubros)
    if (op.gastos_por_rubro_mes && op.gastos_por_rubro_mes.length > 0) {
        // Obtener categorías de rubros
        const rubros = Object.keys(op.gastos_por_rubro_mes[0].rubros || {});
        
        // Crear series de barras apiladas por rubro
        const seriesRubros = rubros.map(rubro => ({
            name: rubro,
            type: 'column',
            data: op.gastos_por_rubro_mes.map(mes => (mes.rubros[rubro] || 0) / 1000) // En miles €
        }));
        
        // Agregar línea de total
        seriesRubros.push({
            name: 'Total Gastos',
            type: 'line',
            data: op.gastos_por_rubro_mes.map(mes => mes.total / 1000) // En miles €
        });
        
        new ApexCharts(document.querySelector("#chartOpEx"), {
            series: seriesRubros,
            chart: { height: 350, type: 'line', stacked: true },
            colors: paletas.categorias_opex,
            stroke: { width: Array(rubros.length).fill(0).concat([3]), curve: 'smooth' },
            plotOptions: {
                bar: {
                    horizontal: false,
                    columnWidth: '60%'
                }
            },
            xaxis: {
                categories: op.gastos_por_rubro_mes.map(mes => mes.mes),
                type: 'category'
            },
            yaxis: {
                title: { text: 'Gastos (miles €)' },
                labels: {
                    formatter: function(val) {
                        return val != null ? val.toFixed(1) + 'k€' : '';
                    }
                }
            },
            legend: { position: 'top', horizontalAlign: 'center' },
            fill: { opacity: 0.85 },
            tooltip: {
                y: {
                    formatter: function(val) {
                        return val != null ? (val * 1000).toLocaleString('es-ES', {minimumFractionDigits: 2}) + ' €' : '';
                    }
                }
            }
        }).render();
    }
    
    // ==========================================
    // ELIMINAR: Gráfico de Burn Rate viejo (ya no se usa)
    // Se reemplazó por chartBurnRates arriba
    // ==========================================
    
    // Alertas
    generarAlertas(pilares, umbrales);
    
    // Agregar análisis a los gráficos (después de que se rendericen)
    setTimeout(() => agregarAnalisisGraficos(pilares), 1000);
}

function agregarAnalisisGraficos(pilares) {
    const cm = pilares.cash_management;
    const ef = pilares.eficiencia;
    const cr = pilares.crecimiento;
    const op = pilares.opex;
    
    // 1. ANÁLISIS NET BURN + GROSS BURN
    const containerBurn = document.querySelector("#chartBurnRates")?.closest('.chart-container');
    if (containerBurn && !containerBurn.querySelector('.chart-analysis')) {
        const netBurn = cm.net_burn_rate;
        const grossBurn = cm.gross_burn_rate;
        
        let clase = 'info';
        let texto = `El <strong>Net Burn Rate</strong> (€${formatMoney(netBurn)}/mes) muestra el consumo real de caja después de ingresos. `;
        texto += `El <strong>Gross Burn Rate</strong> (€${formatMoney(grossBurn)}/mes) representa los gastos operativos totales. `;
        
        if (netBurn > 0) {
            const cobertura = ((grossBurn - netBurn) / grossBurn * 100).toFixed(1);
            texto += `Los ingresos cubren el ${cobertura}% de los gastos operativos.`;
            
            if (cobertura < 30) {
                clase = 'negative';
            } else if (cobertura < 60) {
                clase = 'warning';
            } else {
                clase = 'positive';
            }
        } else if (netBurn < 0) {
            texto += `La empresa está <strong>generando caja</strong> (rentable).`;
            clase = 'positive';
        } else {
            texto += `La empresa está en <strong>punto de equilibrio</strong>.`;
            clase = 'info';
        }
        
        const p = document.createElement('div');
        p.className = `chart-analysis ${clase}`;
        p.innerHTML = texto;
        containerBurn.appendChild(p);
    }
    
    // 2. ANÁLISIS COMBINADO INGRESOS/GASTOS/CAJA
    const containerComb = document.querySelector("#chartCombinado")?.closest('.chart-container');
    if (containerComb && !containerComb.querySelector('.chart-analysis') && cm.combinado_mensual && cm.combinado_mensual.length > 0) {
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
    
    // 3. ANÁLISIS PROYECCIÓN DE CAJA
    const containerProyeccion = document.querySelector("#chartProyeccionCaja")?.closest('.pilar-chart');
    if (containerProyeccion && !containerProyeccion.querySelector('.chart-analysis')) {
        let texto = '';
        let clase = 'info';
        
        if (cm.tipo_metrica === 'runway') {
            texto = `Con el burn rate actual (€${formatMoney(cm.net_burn_rate)}/mes), la caja disponible durará aproximadamente <strong>${cm.runway_meses.toFixed(1)} meses</strong>. `;
            if (cm.runway_meses < 6) {
                texto += `⚠️ <strong>Crítico:</strong> Es urgente reducir gastos, aumentar ingresos o buscar financiación.`;
                clase = 'negative';
            } else if (cm.runway_meses < 12) {
                texto += `Considera iniciar conversaciones con inversores o acelerar crecimiento de ingresos.`;
                clase = 'warning';
            } else {
                texto += `Runway saludable para operar y ejecutar estrategia de crecimiento.`;
                clase = 'positive';
            }
        } else if (cm.tipo_metrica === 'reserva') {
            texto = `La empresa está <strong>generando caja</strong> (Net Burn negativo). Meses de reserva con gastos actuales: <strong>${cm.meses_reserva.toFixed(1)}</strong>. `;
            texto += `Excelente posición financiera para invertir en crecimiento.`;
            clase = 'positive';
        } else {
            texto = `La empresa está en <strong>equilibrio perfecto</strong> (Ingresos = Gastos). La caja se mantiene estable.`;
            clase = 'info';
        }
        
        const p = document.createElement('div');
        p.className = `chart-analysis ${clase}`;
        p.innerHTML = texto;
        containerProyeccion.appendChild(p);
    }
    
    // 4. ANÁLISIS CHURN RATE
    const containerChurn = document.querySelector("#chartROICanal")?.closest('.pilar-chart');
    if (containerChurn && !containerChurn.querySelector('.chart-analysis')) {
        const churn = ef.churn_rate;
        let clase = 'positive';
        let texto = `<strong>Churn Rate promedio:</strong> ${churn.toFixed(2)}% mensual. `;
        
        if (churn < 3) {
            texto += `Excelente retención de clientes. Mantén el enfoque en experiencia y valor.`;
            clase = 'positive';
        } else if (churn < 5) {
            texto += `Retención saludable. Monitorea tendencias y actúa proactivamente ante señales de riesgo.`;
            clase = 'positive';
        } else if (churn < 10) {
            texto += `⚠️ Churn moderado-alto. Enfócate en mejorar onboarding, soporte y propuesta de valor.`;
            clase = 'warning';
        } else {
            texto += `🚨 <strong>Churn crítico.</strong> Revisa urgentemente: fit producto-mercado, experiencia usuario y competencia.`;
            clase = 'negative';
        }
        
        const p = document.createElement('div');
        p.className = `chart-analysis ${clase}`;
        p.innerHTML = texto;
        containerChurn.appendChild(p);
    }
    
    // 5. ANÁLISIS EVOLUCIÓN VENTAS
    const containerVentas = document.querySelector("#chartCrecimiento")?.closest('.pilar-chart');
    if (containerVentas && !containerVentas.querySelector('.chart-analysis')) {
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
    if (containerOpex && !containerOpex.querySelector('.chart-analysis')) {
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
    if (containerSector && !containerSector.querySelector('.chart-analysis')) {
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
