"""
Módulo de cálculos para los 4 Pilares de Startups
- Cash Management
- Eficiencia
- Crecimiento
- OpEx
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta

def calcular_cash_management(df_transacciones):
    """
    Calcula métricas de Cash Management:
    - Caja Actual
    - Burn Rate
    - Runway
    """
    resultados = {}
    
    # Asegurarse de que Fecha es datetime
    df_transacciones = df_transacciones.copy()
    df_transacciones['Fecha'] = pd.to_datetime(df_transacciones['Fecha'], errors='coerce')
    
    # Filtrar filas con fechas válidas
    df_transacciones = df_transacciones[df_transacciones['Fecha'].notna()]
    
    # Filtrar por tipo
    df_ingresos = df_transacciones[df_transacciones['Tipo'] == 'I'].copy()
    df_gastos = df_transacciones[df_transacciones['Tipo'] == 'G'].copy()
    df_balance = df_transacciones[df_transacciones['Tipo'] == 'B'].copy()
    
    # 1. CAJA ACTUAL
    balance_inicial = float(df_balance['Importe'].sum()) if len(df_balance) > 0 else 0.0
    total_ingresos = float(df_ingresos['Importe'].abs().sum())
    total_gastos = float(df_gastos['Importe'].abs().sum())
    
    caja_actual = balance_inicial + total_ingresos - total_gastos
    resultados['caja_actual'] = round(float(caja_actual), 2)
    
    # 2. BURN RATE (mensual)
    # Crear columna Mes
    df_transacciones['Mes'] = df_transacciones['Fecha'].dt.to_period('M')
    df_ingresos['Mes'] = df_ingresos['Fecha'].dt.to_period('M')
    df_gastos['Mes'] = df_gastos['Fecha'].dt.to_period('M')
    
    ingresos_mensuales = df_ingresos.groupby('Mes')['Importe'].sum().abs()
    gastos_mensuales = df_gastos.groupby('Mes')['Importe'].sum().abs()
    
    burn_mensual = gastos_mensuales - ingresos_mensuales
    burn_rate = float(burn_mensual.mean()) if len(burn_mensual) > 0 else 0.0
    
    resultados['burn_rate'] = round(float(burn_rate), 2)
    resultados['burn_rate_historico'] = {
        'meses': [str(m) for m in burn_mensual.index] if len(burn_mensual) > 0 else [],
        'valores': [round(float(v), 2) for v in burn_mensual.values] if len(burn_mensual) > 0 else []
    }
    
    # 3. RUNWAY (meses)
    if burn_rate > 0:
        runway_meses = caja_actual / burn_rate
        resultados['runway_meses'] = round(runway_meses, 1)
    else:
        resultados['runway_meses'] = 999  # Usar número grande en vez de infinito
    
    # 4. PROYECCIÓN DE CAJA (próximos 12 meses)
    proyeccion_caja = []
    caja_proyectada = caja_actual
    
    for mes in range(12):
        caja_proyectada -= burn_rate
        proyeccion_caja.append(round(max(0, caja_proyectada), 2))
    
    resultados['proyeccion_caja'] = proyeccion_caja
    
    # 5. EVOLUCIÓN DE CAJA (histórico)
    evolucion_caja = []
    caja_acumulada = balance_inicial
    
    if len(df_transacciones['Mes'].unique()) > 0:
        for mes in sorted(df_transacciones['Mes'].unique()):
            ingresos_mes = df_ingresos[df_ingresos['Mes'] == mes]['Importe'].sum()
            gastos_mes = df_gastos[df_gastos['Mes'] == mes]['Importe'].sum()
            caja_acumulada = caja_acumulada + ingresos_mes - abs(gastos_mes)
            evolucion_caja.append({
                'mes': str(mes),
                'caja': round(caja_acumulada, 2)
            })
    
    resultados['evolucion_caja'] = evolucion_caja
    
    return resultados

def calcular_eficiencia(df_transacciones):
    """
    Calcula métricas de Eficiencia:
    - Margen de Contribución
    - ROI por Canal
    """
    resultados = {}
    
    # Asegurarse de que Fecha es datetime
    df_transacciones = df_transacciones.copy()
    df_transacciones['Fecha'] = pd.to_datetime(df_transacciones['Fecha'], errors='coerce')
    df_transacciones = df_transacciones[df_transacciones['Fecha'].notna()]
    
    # Filtrar ventas y gastos
    df_ventas = df_transacciones[df_transacciones['Tipo'] == 'I'].copy()
    df_gastos = df_transacciones[df_transacciones['Tipo'] == 'G'].copy()
    
    if len(df_ventas) == 0:
        resultados['margen_contribucion'] = 0
        resultados['ingreso_promedio_venta'] = 0
        resultados['costos_variables'] = 0
        resultados['cac'] = 0
        resultados['comision_promedio'] = 0
        resultados['roi_por_canal'] = {}
        return resultados
    
    # 1. MARGEN DE CONTRIBUCIÓN
    # Ingreso promedio por venta
    ingreso_promedio_venta = float(df_ventas['Importe'].mean())
    
    # Costos variables = Comisiones
    if 'COMISION EUR' in df_ventas.columns:
        comisiones_totales = float(df_ventas['COMISION EUR'].sum())
        num_ventas = len(df_ventas)
        comision_promedio = comisiones_totales / num_ventas if num_ventas > 0 else 0.0
    else:
        comision_promedio = 0.0
    
    # CAC (Customer Acquisition Cost)
    gastos_marketing = float(df_gastos[
        df_gastos['Categoría'].str.contains('Marketing|Ads|Publicidad', case=False, na=False)
    ]['Importe'].abs().sum())
    
    # Contar nuevos clientes (ventas únicas por ID Cliente)
    if 'ID Cliente/Proveedor' in df_ventas.columns:
        clientes_unicos = int(df_ventas['ID Cliente/Proveedor'].nunique())
    else:
        clientes_unicos = len(df_ventas)  # Asumir cada venta es un cliente nuevo
    
    cac = gastos_marketing / clientes_unicos if clientes_unicos > 0 else 0.0
    
    # Costos variables = Comisiones + CAC
    costos_variables = comision_promedio + cac
    
    # Margen de Contribución
    margen_contribucion = ((ingreso_promedio_venta - costos_variables) / ingreso_promedio_venta * 100) if ingreso_promedio_venta > 0 else 0
    
    resultados['margen_contribucion'] = round(margen_contribucion, 2)
    resultados['ingreso_promedio_venta'] = round(ingreso_promedio_venta, 2)
    resultados['costos_variables'] = round(costos_variables, 2)
    resultados['cac'] = round(cac, 2)
    resultados['comision_promedio'] = round(comision_promedio, 2)
    
    # 2. ROI POR CANAL
    roi_por_canal = {}
    
    if 'CANAL' in df_ventas.columns:
        canales = df_ventas['CANAL'].dropna().unique()
        
        for canal in canales:
            # Ingresos del canal
            ingresos_canal = float(df_ventas[df_ventas['CANAL'] == canal]['Importe'].sum())
            
            # Gastos del canal (marketing específico)
            gastos_canal = float(df_gastos[
                (df_gastos['Categoría'].str.contains('Marketing|Ads', case=False, na=False)) &
                (df_gastos['Concepto'].str.contains(str(canal), case=False, na=False))
            ]['Importe'].abs().sum())
            
            # Si no hay gastos específicos, prorratear
            if gastos_canal == 0 and gastos_marketing > 0:
                proporcion = len(df_ventas[df_ventas['CANAL'] == canal]) / len(df_ventas)
                gastos_canal = gastos_marketing * proporcion
            
            # ROI
            roi = ((ingresos_canal - gastos_canal) / gastos_canal * 100) if gastos_canal > 0 else 0.0
            
            roi_por_canal[str(canal)] = {
                'ingresos': round(float(ingresos_canal), 2),
                'gastos': round(float(gastos_canal), 2),
                'roi': round(float(roi), 2)
            }
    
    resultados['roi_por_canal'] = roi_por_canal
    
    return resultados

def calcular_crecimiento(df_transacciones):
    """
    Calcula métricas de Crecimiento:
    - MoM Growth (Month over Month)
    - Ventas por Sector
    """
    resultados = {}
    
    # Asegurarse de que Fecha es datetime
    df_transacciones = df_transacciones.copy()
    df_transacciones['Fecha'] = pd.to_datetime(df_transacciones['Fecha'], errors='coerce')
    df_transacciones = df_transacciones[df_transacciones['Fecha'].notna()]
    
    df_ventas = df_transacciones[df_transacciones['Tipo'] == 'I'].copy()
    
    if len(df_ventas) == 0:
        resultados['mom_growth'] = []
        resultados['ultimo_mom'] = 0
        resultados['ventas_por_sector'] = []
        resultados['tendencia'] = "sin_datos"
        return resultados
    
    df_ventas['Mes'] = df_ventas['Fecha'].dt.to_period('M')
    
    # 1. MoM GROWTH
    ventas_mensuales = df_ventas.groupby('Mes')['Importe'].sum()
    
    mom_growth = []
    meses = sorted(ventas_mensuales.index)
    
    for i in range(1, len(meses)):
        mes_anterior = ventas_mensuales[meses[i-1]]
        mes_actual = ventas_mensuales[meses[i]]
        
        if mes_anterior > 0:
            crecimiento = ((mes_actual - mes_anterior) / mes_anterior * 100)
        else:
            crecimiento = 0
        
        mom_growth.append({
            'mes': str(meses[i]),
            'crecimiento': round(crecimiento, 2),
            'ventas': round(mes_actual, 2)
        })
    
    resultados['mom_growth'] = mom_growth
    
    # Último MoM
    if mom_growth:
        resultados['ultimo_mom'] = mom_growth[-1]['crecimiento']
    else:
        resultados['ultimo_mom'] = 0
    
    # 2. VENTAS POR SECTOR/CATEGORÍA
    if 'Categoría' in df_ventas.columns:
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
    else:
        resultados['ventas_por_sector'] = []
    
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
    - Gastos por Categoría
    - Tendencia de Gastos
    """
    resultados = {}
    
    # Asegurarse de que Fecha es datetime
    df_transacciones = df_transacciones.copy()
    df_transacciones['Fecha'] = pd.to_datetime(df_transacciones['Fecha'], errors='coerce')
    df_transacciones = df_transacciones[df_transacciones['Fecha'].notna()]
    
    df_gastos = df_transacciones[df_transacciones['Tipo'] == 'G'].copy()
    
    if len(df_gastos) == 0:
        resultados['gastos_por_categoria'] = []
        resultados['total_gastos'] = 0
        resultados['evolucion_gastos'] = []
        resultados['gastos_apilados'] = {}
        resultados['promedio_gastos_mensual'] = 0
        return resultados
    
    df_gastos['Mes'] = df_gastos['Fecha'].dt.to_period('M')
    
    # 1. GASTOS POR CATEGORÍA
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
    
    # Ordenar por valor descendente
    gastos_detalle.sort(key=lambda x: x['valor'], reverse=True)
    
    resultados['gastos_por_categoria'] = gastos_detalle
    resultados['total_gastos'] = round(float(total_gastos), 2)
    
    # 2. EVOLUCIÓN MENSUAL DE GASTOS
    gastos_mensuales = df_gastos.groupby('Mes')['Importe'].sum().abs()
    
    evolucion_gastos = []
    for mes in sorted(gastos_mensuales.index):
        evolucion_gastos.append({
            'mes': str(mes),
            'gastos': round(gastos_mensuales[mes], 2)
        })
    
    resultados['evolucion_gastos'] = evolucion_gastos
    
    # 3. GASTOS POR CATEGORÍA POR MES (para gráfico de área apilada)
    gastos_mes_categoria = df_gastos.groupby(['Mes', 'Categoría'])['Importe'].sum().abs().unstack(fill_value=0)
    
    gastos_apilados = {}
    for mes in gastos_mes_categoria.index:
        gastos_apilados[str(mes)] = {
            cat: round(gastos_mes_categoria.loc[mes, cat], 2) 
            for cat in gastos_mes_categoria.columns
        }
    
    resultados['gastos_apilados'] = gastos_apilados
    
    # 4. PROMEDIO DE GASTOS MENSUAL
    promedio_gastos = float(gastos_mensuales.mean())
    resultados['promedio_gastos_mensual'] = round(float(promedio_gastos), 2)
    
    return resultados

def calcular_4_pilares(df_transacciones):
    """
    Calcula todos los 4 pilares
    """
    return {
        'cash_management': calcular_cash_management(df_transacciones),
        'eficiencia': calcular_eficiencia(df_transacciones),
        'crecimiento': calcular_crecimiento(df_transacciones),
        'opex': calcular_opex(df_transacciones)
    }
