"""
Módulo de cálculos para los 4 Pilares de Startups - v4.0
- Cash Management (con Net Burn Rate, Gross Burn Rate, validaciones)
- Eficiencia (con Churn Rate, CAC corregido, Margen Contribución corregido)
- Crecimiento
- OpEx
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta

def calcular_cash_management(df_transacciones):
    """
    Calcula métricas de Cash Management con correcciones v4.0:
    - Caja Disponible (desde columna evolución de caja)
    - Net Burn Rate (desde columna evolución de caja)
    - Gross Burn Rate (gastos totales / nº meses)
    - Runway o Meses de Reserva (según validación)
    """
    resultados = {}
    
    # Asegurarse de que Fecha es datetime
    df = df_transacciones.copy()
    df['Fecha'] = pd.to_datetime(df['Fecha'], errors='coerce')
    df = df[df['Fecha'].notna()]
    
    # Filtrar por tipo
    df_ingresos = df[df['Tipo'] == 'I'].copy()
    df_gastos = df[df['Tipo'] == 'G'].copy()
    df_balance = df[df['Tipo'] == 'B'].copy()
    
    # 1. CAJA DISPONIBLE
    # Usar el último valor de la columna 'evolución de caja' si existe
    if 'evolución de caja' in df.columns or 'evolucion de caja' in df.columns:
        col_evol = 'evolución de caja' if 'evolución de caja' in df.columns else 'evolucion de caja'
        df_con_evol = df[df[col_evol].notna()]
        if len(df_con_evol) > 0:
            caja_disponible = float(df_con_evol[col_evol].iloc[-1])
        else:
            # Fallback al cálculo tradicional
            balance_inicial = float(df_balance['Importe'].sum()) if len(df_balance) > 0 else 0.0
            total_ingresos = float(df_ingresos['Importe'].abs().sum())
            total_gastos = float(df_gastos['Importe'].abs().sum())
            caja_disponible = balance_inicial + total_ingresos - total_gastos
    else:
        # Fallback al cálculo tradicional
        balance_inicial = float(df_balance['Importe'].sum()) if len(df_balance) > 0 else 0.0
        total_ingresos = float(df_ingresos['Importe'].abs().sum())
        total_gastos = float(df_gastos['Importe'].abs().sum())
        caja_disponible = balance_inicial + total_ingresos - total_gastos
    
    resultados['caja_disponible'] = round(float(caja_disponible), 2)
    
    # 2. NET BURN RATE (desde columna evolución de caja)
    # El Net Burn Rate es la suma/resta de movimientos mensuales de la columna evolución de caja
    df['Mes'] = df['Fecha'].dt.to_period('M')
    
    if 'evolución de caja' in df.columns or 'evolucion de caja' in df.columns:
        col_evol = 'evolución de caja' if 'evolución de caja' in df.columns else 'evolucion de caja'
        
        # Calcular diferencias mensuales en evolución de caja
        df_sorted = df.sort_values('Fecha')
        df_sorted['caja_diff'] = df_sorted[col_evol].diff()
        
        # Net Burn Rate mensual = cambio en caja por mes
        net_burn_mensual = df_sorted.groupby('Mes')['caja_diff'].sum()
        
        # Promedio de Net Burn Rate
        net_burn_rate = float(net_burn_mensual.mean()) if len(net_burn_mensual) > 0 else 0.0
        
        resultados['net_burn_rate'] = round(float(net_burn_rate), 2)
        resultados['net_burn_historico'] = {
            'meses': [str(m) for m in net_burn_mensual.index] if len(net_burn_mensual) > 0 else [],
            'valores': [round(float(v), 2) for v in net_burn_mensual.values] if len(net_burn_mensual) > 0 else []
        }
    else:
        # Fallback: Net Burn = Gastos - Ingresos
        df_ingresos['Mes'] = df_ingresos['Fecha'].dt.to_period('M')
        df_gastos['Mes'] = df_gastos['Fecha'].dt.to_period('M')
        
        ingresos_mensuales = df_ingresos.groupby('Mes')['Importe'].sum().abs()
        gastos_mensuales = df_gastos.groupby('Mes')['Importe'].sum().abs()
        
        net_burn_mensual = gastos_mensuales - ingresos_mensuales
        net_burn_rate = float(net_burn_mensual.mean()) if len(net_burn_mensual) > 0 else 0.0
        
        resultados['net_burn_rate'] = round(float(net_burn_rate), 2)
        resultados['net_burn_historico'] = {
            'meses': [str(m) for m in net_burn_mensual.index] if len(net_burn_mensual) > 0 else [],
            'valores': [round(float(v), 2) for v in net_burn_mensual.values] if len(net_burn_mensual) > 0 else []
        }
    
    # 3. GROSS BURN RATE
    # Gross Burn Rate = Total gastos (tipo=G) / número de meses
    total_gastos = float(df_gastos['Importe'].abs().sum())
    num_meses = len(df['Mes'].unique())
    
    gross_burn_rate = total_gastos / num_meses if num_meses > 0 else 0.0
    resultados['gross_burn_rate'] = round(float(gross_burn_rate), 2)
    
    # Crear histórico de Gross Burn Rate (gastos por mes)
    df_gastos['Mes'] = df_gastos['Fecha'].dt.to_period('M')
    gross_burn_mensual = df_gastos.groupby('Mes')['Importe'].sum().abs()
    resultados['gross_burn_historico'] = {
        'meses': [str(m) for m in gross_burn_mensual.index] if len(gross_burn_mensual) > 0 else [],
        'valores': [round(float(v), 2) for v in gross_burn_mensual.values] if len(gross_burn_mensual) > 0 else []
    }
    
    # 4. VALIDACIÓN NET BURN RATE Y CÁLCULO DE RUNWAY/MESES RESERVA
    net_burn_rate = resultados['net_burn_rate']
    
    if net_burn_rate > 0:
        # Net Burn Rate POSITIVO → Calcular Runway
        runway_meses = caja_disponible / net_burn_rate
        resultados['runway_meses'] = round(runway_meses, 1)
        resultados['meses_reserva'] = None
        resultados['tipo_metrica'] = 'runway'  # Para saber qué mostrar en frontend
        
    elif net_burn_rate == 0:
        # Net Burn Rate = 0 → No calcular nada
        resultados['runway_meses'] = None
        resultados['meses_reserva'] = None
        resultados['tipo_metrica'] = 'equilibrio'
        
    else:
        # Net Burn Rate NEGATIVO → Calcular Meses de Reserva
        # Meses de reserva = Caja disponible ÷ Gross Burn Rate
        if gross_burn_rate > 0:
            meses_reserva = caja_disponible / gross_burn_rate
            resultados['meses_reserva'] = round(meses_reserva, 1)
        else:
            resultados['meses_reserva'] = 999  # Infinito
        
        resultados['runway_meses'] = None
        resultados['tipo_metrica'] = 'reserva'
    
    # 5. EVOLUCIÓN DE CAJA (histórico)
    # Usar directamente la columna evolución de caja si existe
    evolucion_caja = []
    
    if 'evolución de caja' in df.columns or 'evolucion de caja' in df.columns:
        col_evol = 'evolución de caja' if 'evolución de caja' in df.columns else 'evolucion de caja'
        df_sorted = df[df[col_evol].notna()].sort_values('Fecha')
        df_sorted['Mes'] = df_sorted['Fecha'].dt.to_period('M')
        
        # Tomar el último valor de caja por mes
        for mes in sorted(df_sorted['Mes'].unique()):
            df_mes = df_sorted[df_sorted['Mes'] == mes]
            caja_final_mes = float(df_mes[col_evol].iloc[-1])
            evolucion_caja.append({
                'mes': str(mes),
                'caja': round(caja_final_mes, 2)
            })
    else:
        # Fallback: calcular evolucion
        balance_inicial = float(df_balance['Importe'].sum()) if len(df_balance) > 0 else 0.0
        caja_acumulada = balance_inicial
        
        df_ingresos['Mes'] = df_ingresos['Fecha'].dt.to_period('M')
        df_gastos['Mes'] = df_gastos['Fecha'].dt.to_period('M')
        
        if len(df['Mes'].unique()) > 0:
            for mes in sorted(df['Mes'].unique()):
                ingresos_mes = df_ingresos[df_ingresos['Mes'] == mes]['Importe'].sum()
                gastos_mes = df_gastos[df_gastos['Mes'] == mes]['Importe'].sum()
                caja_acumulada = caja_acumulada + ingresos_mes - abs(gastos_mes)
                evolucion_caja.append({
                    'mes': str(mes),
                    'caja': round(caja_acumulada, 2)
                })
    
    resultados['evolucion_caja'] = evolucion_caja
    
    # 6. GRÁFICO COMBINADO: Ingresos + Gastos por mes
    df_ingresos['Mes'] = df_ingresos['Fecha'].dt.to_period('M')
    df_gastos['Mes'] = df_gastos['Fecha'].dt.to_period('M')
    
    ingresos_mensuales = df_ingresos.groupby('Mes')['Importe'].sum().abs()
    gastos_mensuales = df_gastos.groupby('Mes')['Importe'].sum().abs()
    
    combinado_mensual = []
    for mes in sorted(df['Mes'].unique()):
        ingresos = float(ingresos_mensuales.get(mes, 0))
        gastos = float(gastos_mensuales.get(mes, 0))
        
        # Obtener caja de ese mes
        caja_mes_list = [ec['caja'] for ec in evolucion_caja if ec['mes'] == str(mes)]
        caja_mes = caja_mes_list[0] if caja_mes_list else 0
        
        combinado_mensual.append({
            'mes': str(mes),
            'ingresos': round(ingresos, 2),
            'gastos': round(gastos, 2),
            'caja': round(caja_mes, 2)
        })
    
    resultados['combinado_mensual'] = combinado_mensual
    
    # 7. PROYECCIÓN DE CAJA (próximos 12 meses)
    # Proyectar usando el burn rate apropiado según el tipo de métrica
    proyeccion_caja = []
    caja_proyectada = caja_disponible
    
    if resultados['tipo_metrica'] == 'runway':
        # Usar Net Burn Rate para proyección
        burn_proyeccion = net_burn_rate
    elif resultados['tipo_metrica'] == 'reserva':
        # Empresa generando caja (net burn negativo)
        # La caja crece, usar net burn negativo
        burn_proyeccion = net_burn_rate
    else:
        # Equilibrio
        burn_proyeccion = 0
    
    for mes in range(12):
        caja_proyectada = caja_proyectada - burn_proyeccion
        proyeccion_caja.append(round(max(0, caja_proyectada), 2))
    
    resultados['proyeccion_caja'] = proyeccion_caja
    
    return resultados

def calcular_eficiencia(df_transacciones):
    """
    Calcula métricas de Eficiencia con correcciones v4.0:
    - Churn Rate (mensual)
    - CAC (con categoría PAGOS MK)
    - Clientes Nuevos (ID que aparece UNA sola vez)
    - Margen de Contribución (fórmula corregida)
    - ROI eliminado
    """
    resultados = {}
    
    df = df_transacciones.copy()
    df['Fecha'] = pd.to_datetime(df['Fecha'], errors='coerce')
    df = df[df['Fecha'].notna()]
    
    df_ventas = df[df['Tipo'] == 'I'].copy()
    df_gastos = df[df['Tipo'] == 'G'].copy()
    
    if len(df_ventas) == 0:
        resultados['margen_contribucion'] = 0
        resultados['cac'] = 0
        resultados['churn_rate'] = 0
        resultados['churn_historico'] = []
        resultados['clientes_nuevos'] = 0
        return resultados
    
    # 1. CHURN RATE MENSUAL
    # Fórmula: (Clientes perdidos en período / Clientes totales al inicio del período) × 100
    churn_historico = []
    
    if 'baja' in df_ventas.columns and 'ID Cliente/Proveedor' in df_ventas.columns:
        df_ventas['Mes'] = df_ventas['Fecha'].dt.to_period('M')
        
        for mes in sorted(df_ventas['Mes'].unique()):
            # Clientes al inicio del mes (todos los que estuvieron activos antes o durante el mes)
            clientes_hasta_mes = df_ventas[df_ventas['Mes'] <= mes]['ID Cliente/Proveedor'].unique()
            clientes_inicio = len(clientes_hasta_mes)
            
            # Clientes que se dieron de baja en ese mes
            bajas_mes = df_ventas[(df_ventas['Mes'] == mes) & 
                                  (df_ventas['baja'].isin(['si', 'Si', 'SI', 'sí', 'Sí', 'SÍ', '1', 1]))]
            clientes_perdidos = len(bajas_mes['ID Cliente/Proveedor'].unique())
            
            # Churn Rate
            churn_rate = (clientes_perdidos / clientes_inicio * 100) if clientes_inicio > 0 else 0.0
            
            churn_historico.append({
                'mes': str(mes),
                'churn_rate': round(churn_rate, 2),
                'clientes_perdidos': clientes_perdidos,
                'clientes_inicio': clientes_inicio
            })
        
        # Churn Rate promedio
        churn_promedio = np.mean([ch['churn_rate'] for ch in churn_historico]) if churn_historico else 0.0
        resultados['churn_rate'] = round(churn_promedio, 2)
    else:
        churn_promedio = 0.0
        resultados['churn_rate'] = 0.0
    
    resultados['churn_historico'] = churn_historico
    
    # 2. CLIENTES NUEVOS
    # Solo contar IDs que aparecen UNA SOLA VEZ en TODO el Excel
    if 'ID Cliente/Proveedor' in df_ventas.columns:
        conteo_ids = df_ventas['ID Cliente/Proveedor'].value_counts()
        clientes_nuevos = int((conteo_ids == 1).sum())
        resultados['clientes_nuevos'] = clientes_nuevos
    else:
        clientes_nuevos = len(df_ventas)
        resultados['clientes_nuevos'] = clientes_nuevos
    
    # 3. CAC (Customer Acquisition Cost)
    # CAC = Suma de categoría "PAGOS MK" / Clientes nuevos
    gastos_marketing = float(df_gastos[
        df_gastos['Categoría'].str.upper().str.strip() == 'PAGOS MK'
    ]['Importe'].abs().sum())
    
    cac = gastos_marketing / clientes_nuevos if clientes_nuevos > 0 else 0.0
    resultados['cac'] = round(cac, 2)
    resultados['gastos_marketing'] = round(gastos_marketing, 2)
    
    # 4. MARGEN DE CONTRIBUCIÓN (fórmula corregida)
    # Margen = (Ingresos - Comisiones - Costos Variables) / Ingresos × 100
    # Costos Variables = Comisiones + CAC
    
    total_ingresos = float(df_ventas['Importe'].sum())
    
    # Comisiones totales
    if 'COMISION EUR' in df_ventas.columns:
        total_comisiones = float(df_ventas['COMISION EUR'].sum())
    else:
        total_comisiones = 0.0
    
    # Costos variables = Comisiones + CAC total (no por cliente)
    costos_variables = total_comisiones + gastos_marketing
    
    # Margen de Contribución
    margen_contribucion = ((total_ingresos - costos_variables) / total_ingresos * 100) if total_ingresos > 0 else 0
    
    resultados['margen_contribucion'] = round(margen_contribucion, 2)
    resultados['total_ingresos'] = round(total_ingresos, 2)
    resultados['total_comisiones'] = round(total_comisiones, 2)
    resultados['costos_variables'] = round(costos_variables, 2)
    
    # 5. ROI ELIMINADO (según correcciones)
    # Ya no se calcula ROI por canal
    
    return resultados

def calcular_crecimiento(df_transacciones):
    """
    Calcula métricas de Crecimiento:
    - MoM Growth (Month over Month) con variación %
    - Ventas por Sector
    """
    resultados = {}
    
    df = df_transacciones.copy()
    df['Fecha'] = pd.to_datetime(df['Fecha'], errors='coerce')
    df = df[df['Fecha'].notna()]
    
    df_ventas = df[df['Tipo'] == 'I'].copy()
    
    if len(df_ventas) == 0:
        resultados['mom_growth'] = []
        resultados['ultimo_mom'] = 0
        resultados['ventas_por_sector'] = []
        resultados['tendencia'] = "sin_datos"
        resultados['ventas_mensuales'] = []
        return resultados
    
    df_ventas['Mes'] = df_ventas['Fecha'].dt.to_period('M')
    
    # 1. MoM GROWTH CON VARIACIÓN %
    ventas_mensuales = df_ventas.groupby('Mes')['Importe'].sum()
    
    mom_growth = []
    meses = sorted(ventas_mensuales.index)
    
    ventas_mensuales_data = []
    for i, mes in enumerate(meses):
        ventas_mes = ventas_mensuales[mes]
        
        if i > 0:
            mes_anterior = ventas_mensuales[meses[i-1]]
            if mes_anterior > 0:
                variacion_pct = ((ventas_mes - mes_anterior) / mes_anterior * 100)
            else:
                variacion_pct = 0
        else:
            variacion_pct = 0
        
        ventas_mensuales_data.append({
            'mes': str(mes),
            'ventas': round(ventas_mes, 2),
            'variacion_pct': round(variacion_pct, 2)
        })
        
        if i > 0:
            mom_growth.append({
                'mes': str(mes),
                'crecimiento': round(variacion_pct, 2),
                'ventas': round(ventas_mes, 2)
            })
    
    resultados['mom_growth'] = mom_growth
    resultados['ventas_mensuales'] = ventas_mensuales_data
    
    # Último MoM
    if mom_growth:
        resultados['ultimo_mom'] = mom_growth[-1]['crecimiento']
    else:
        resultados['ultimo_mom'] = 0
    
    # 2. VENTAS POR SECTOR POR MES (para gráfico)
    ventas_sector_mes = []
    
    if 'Categoría' in df_ventas.columns:
        # Obtener ventas totales por mes
        ventas_totales_mes = df_ventas.groupby('Mes')['Importe'].sum()
        
        # Obtener ventas por sector por mes
        ventas_pivot = df_ventas.groupby(['Mes', 'Categoría'])['Importe'].sum().unstack(fill_value=0)
        
        for mes in sorted(meses):
            total_mes = ventas_totales_mes[mes]
            sectores_mes = {}
            
            if mes in ventas_pivot.index:
                for sector in ventas_pivot.columns:
                    valor_sector = ventas_pivot.loc[mes, sector]
                    sectores_mes[str(sector)] = round(float(valor_sector), 2)
            
            ventas_sector_mes.append({
                'mes': str(mes),
                'total': round(float(total_mes), 2),
                'sectores': sectores_mes
            })
        
        # También crear resumen de ventas por sector (total)
        ventas_por_sector = df_ventas.groupby('Categoría')['Importe'].sum().to_dict()
        total_ventas = float(sum(ventas_por_sector.values()))
        
        ventas_sector_detalle = []
        for sector, valor in ventas_por_sector.items():
            porcentaje = (float(valor) / total_ventas * 100) if total_ventas > 0 else 0.0
            ventas_sector_detalle.append({
                'sector': str(sector),
                'valor': round(float(valor), 2),
                'porcentaje': round(float(porcentaje), 2)
            })
        
        resultados['ventas_por_sector'] = ventas_sector_detalle
        resultados['ventas_sector_mes'] = ventas_sector_mes
    else:
        resultados['ventas_por_sector'] = []
        resultados['ventas_sector_mes'] = []
    
    # 3. TENDENCIA GENERAL
    if len(ventas_mensuales) >= 3:
        ultimos_3_meses = ventas_mensuales.tail(3).values
        if ultimos_3_meses[0] < ultimos_3_meses[-1]:
            tendencia = "creciente"
        elif ultimos_3_meses[0] > ultimos_3_meses[-1]:
            tendencia = "decreciente"
        else:
            tendencia = "estable"
    else:
        tendencia = "insuficientes_datos"
    
    resultados['tendencia'] = tendencia
    
    return resultados

def calcular_opex(df_transacciones):
    """
    Calcula métricas de OpEx:
    - Gastos por Categoría (para gráfico de barras por rubros)
    - Evolución de Gastos Totales (para gráfico de línea)
    """
    resultados = {}
    
    df = df_transacciones.copy()
    df['Fecha'] = pd.to_datetime(df['Fecha'], errors='coerce')
    df = df[df['Fecha'].notna()]
    
    df_gastos = df[df['Tipo'] == 'G'].copy()
    
    if len(df_gastos) == 0:
        resultados['gastos_por_categoria'] = []
        resultados['total_gastos'] = 0
        resultados['evolucion_gastos'] = []
        resultados['gastos_por_rubro_mes'] = []
        resultados['promedio_gastos_mensual'] = 0
        return resultados
    
    df_gastos['Mes'] = df_gastos['Fecha'].dt.to_period('M')
    
    # 1. EVOLUCIÓN DE GASTOS TOTALES (línea)
    gastos_mensuales = df_gastos.groupby('Mes')['Importe'].sum().abs()
    
    evolucion_gastos = []
    for mes in sorted(gastos_mensuales.index):
        evolucion_gastos.append({
            'mes': str(mes),
            'gastos': round(gastos_mensuales[mes], 2)
        })
    
    resultados['evolucion_gastos'] = evolucion_gastos
    
    # 2. GASTOS POR RUBRO/CATEGORÍA POR MES (barras apiladas)
    gastos_pivot = df_gastos.groupby(['Mes', 'Categoría'])['Importe'].sum().abs().unstack(fill_value=0)
    
    gastos_por_rubro_mes = []
    for mes in sorted(gastos_mensuales.index):
        rubros_mes = {}
        
        if mes in gastos_pivot.index:
            for categoria in gastos_pivot.columns:
                valor_categoria = gastos_pivot.loc[mes, categoria]
                rubros_mes[str(categoria)] = round(float(valor_categoria), 2)
        
        gastos_por_rubro_mes.append({
            'mes': str(mes),
            'total': round(float(gastos_mensuales[mes]), 2),
            'rubros': rubros_mes
        })
    
    resultados['gastos_por_rubro_mes'] = gastos_por_rubro_mes
    
    # 3. GASTOS POR CATEGORÍA (total)
    gastos_por_categoria = df_gastos.groupby('Categoría')['Importe'].sum().abs().to_dict()
    total_gastos = float(sum(gastos_por_categoria.values()))
    
    gastos_detalle = []
    for categoria, valor in gastos_por_categoria.items():
        porcentaje = (float(valor) / total_gastos * 100) if total_gastos > 0 else 0.0
        gastos_detalle.append({
            'categoria': str(categoria),
            'valor': round(float(valor), 2),
            'porcentaje': round(float(porcentaje), 2)
        })
    
    gastos_detalle.sort(key=lambda x: x['valor'], reverse=True)
    
    resultados['gastos_por_categoria'] = gastos_detalle
    resultados['total_gastos'] = round(float(total_gastos), 2)
    
    # 4. PROMEDIO DE GASTOS MENSUAL
    promedio_gastos = float(gastos_mensuales.mean())
    resultados['promedio_gastos_mensual'] = round(float(promedio_gastos), 2)
    
    return resultados

def calcular_4_pilares(df_transacciones):
    """
    Calcula todos los 4 pilares con correcciones v4.0
    """
    return {
        'cash_management': calcular_cash_management(df_transacciones),
        'eficiencia': calcular_eficiencia(df_transacciones),
        'crecimiento': calcular_crecimiento(df_transacciones),
        'opex': calcular_opex(df_transacciones)
    }
