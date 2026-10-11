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
    Calcula métricas de Cash Management - v6.0 (correcciones nuevas):
    - Net Burn Rate = Salidas de caja - Ingresos de caja EFECTIVAMENTE COBRADOS (por mes)
    - Gross Burn Rate = suma de gastos de cada mes (por mes)
    - Runway = Caja disponible actual / Net Burn Rate promedio
    - Caso Net Burn negativo (rentable) -> Meses de reserva = Caja / Gross Burn Rate
    - Las ventas con Estado = 'Pendiente' (aún no liquidadas/cobradas) se excluyen de
      Ingresos, Caja Disponible y Burn Rate: solo cuenta lo efectivamente COBRADO,
      igual que en el gráfico de Caja Efectiva de "Análisis Detallado".
    - Ya NO se calcula la proyección de caja a 12 meses (se elimina)
    """
    resultados = {}

    df = df_transacciones.copy()
    df['Fecha'] = pd.to_datetime(df['Fecha'], errors='coerce')
    df = df[df['Fecha'].notna()]
    df['Mes'] = df['Fecha'].dt.to_period('M')

    # Ventas PENDIENTES de liquidar (Estado='Pendiente'): no son caja real todavía,
    # se excluyen de Ingresos para que Caja Disponible y Burn Rate reflejen solo lo
    # efectivamente cobrado.
    col_estado = _buscar_columna(df, ['Estado', 'ESTADO'])
    if col_estado:
        es_pendiente = df[col_estado].astype(str).str.strip().isin(['pendiente', 'Pendiente', 'PENDIENTE'])
    else:
        es_pendiente = pd.Series(False, index=df.index)

    df_ingresos = df[(df['Tipo'] == 'I') & (~es_pendiente)].copy()
    df_gastos = df[df['Tipo'] == 'G'].copy()
    df_balance = df[df['Tipo'] == 'B'].copy()
    
    # 1. CAJA DISPONIBLE (último valor de "evolución de caja" si existe)
    col_evol = None
    for posible in ['evolución de caja', 'evolucion de caja']:
        if posible in df.columns:
            col_evol = posible
            break

    balance_inicial = float(df_balance['Importe'].sum()) if len(df_balance) > 0 else 0.0

    if col_evol:
        df_con_evol = df[df[col_evol].notna()].sort_values('Fecha')
        if len(df_con_evol) > 0:
            caja_disponible = float(df_con_evol[col_evol].iloc[-1])
        else:
            caja_disponible = balance_inicial + float(df_ingresos['Importe'].abs().sum()) - float(df_gastos['Importe'].abs().sum())
    else:
        caja_disponible = balance_inicial + float(df_ingresos['Importe'].abs().sum()) - float(df_gastos['Importe'].abs().sum())

    resultados['caja_disponible'] = round(float(caja_disponible), 2)
    # Caja inicial (suma de filas Tipo=B): permite al frontend reconstruir la evolución de
    # caja día a día a partir del detalle granular de ventas/gastos, sin volver a llamar al backend.
    resultados['caja_inicial'] = round(float(balance_inicial), 2)
    
    # 2. GROSS BURN RATE POR MES = suma de todos los gastos de cada mes
    df_gastos_m = df_gastos.copy()
    df_gastos_m['Mes'] = df_gastos_m['Fecha'].dt.to_period('M')
    gross_burn_mensual = df_gastos_m.groupby('Mes')['Importe'].sum().abs()
    
    meses_ordenados = sorted(df['Mes'].unique())
    
    resultados['gross_burn_historico'] = {
        'meses': [str(m) for m in gross_burn_mensual.index],
        'valores': [round(float(v), 2) for v in gross_burn_mensual.values]
    }
    
    # Gross Burn Rate promedio (de todos los meses del archivo)
    num_meses = len(meses_ordenados)
    total_gastos = float(df_gastos['Importe'].abs().sum())
    gross_burn_promedio = total_gastos / num_meses if num_meses > 0 else 0.0
    resultados['gross_burn_rate'] = round(float(gross_burn_promedio), 2)
    
    # Gross Burn del último mes
    if len(gross_burn_mensual) > 0:
        gross_burn_ultimo_mes = float(gross_burn_mensual.iloc[-1])
    else:
        gross_burn_ultimo_mes = 0.0
    resultados['gross_burn_ultimo_mes'] = round(gross_burn_ultimo_mes, 2)
    
    # 3. NET BURN RATE POR MES = Salidas de caja (gastos) - Ingresos de caja, por mes
    df_ingresos_m = df_ingresos.copy()
    df_ingresos_m['Mes'] = df_ingresos_m['Fecha'].dt.to_period('M')
    ingresos_mensuales = df_ingresos_m.groupby('Mes')['Importe'].sum().abs()
    
    net_burn_mensual = {}
    for mes in meses_ordenados:
        gasto_mes = float(gross_burn_mensual.get(mes, 0.0))
        ingreso_mes = float(ingresos_mensuales.get(mes, 0.0))
        net_burn_mensual[mes] = gasto_mes - ingreso_mes
    
    net_burn_serie = pd.Series(net_burn_mensual)
    
    resultados['net_burn_historico'] = {
        'meses': [str(m) for m in net_burn_serie.index],
        'valores': [round(float(v), 2) for v in net_burn_serie.values]
    }
    
    # Net Burn Rate promedio (de todos los meses)
    net_burn_promedio = float(net_burn_serie.mean()) if len(net_burn_serie) > 0 else 0.0
    resultados['net_burn_rate'] = round(net_burn_promedio, 2)
    
    # Net Burn Rate del último mes analizado
    if len(net_burn_serie) > 0:
        net_burn_ultimo_mes = float(net_burn_serie.iloc[-1])
    else:
        net_burn_ultimo_mes = 0.0
    resultados['net_burn_ultimo_mes'] = round(net_burn_ultimo_mes, 2)
    
    # 4. VALIDACIÓN Y CÁLCULO DE RUNWAY / MESES DE RESERVA
    # Se usa el Net Burn Rate PROMEDIO para determinar la situación y el runway,
    # tal como indican las correcciones: Runway = Caja / Net Burn Rate
    net_burn_para_runway = net_burn_promedio
    
    if net_burn_para_runway > 0:
        # Pérdidas -> Runway = Caja / Net Burn Rate
        runway_meses = caja_disponible / net_burn_para_runway if net_burn_para_runway != 0 else None
        resultados['runway_meses'] = round(runway_meses, 1) if runway_meses is not None else None
        resultados['meses_reserva'] = None
        resultados['tipo_metrica'] = 'runway'
    elif net_burn_para_runway == 0:
        # Breakeven -> monitorizar de cerca
        resultados['runway_meses'] = None
        resultados['meses_reserva'] = None
        resultados['tipo_metrica'] = 'equilibrio'
    else:
        # Rentable (net burn negativo) -> Meses de reserva = Caja / Gross Burn Rate
        if gross_burn_promedio > 0:
            meses_reserva = caja_disponible / gross_burn_promedio
            resultados['meses_reserva'] = round(meses_reserva, 1)
        else:
            resultados['meses_reserva'] = None
        resultados['runway_meses'] = None
        resultados['tipo_metrica'] = 'reserva'
    
    # 5. EVOLUCIÓN DE CAJA (histórico mensual, para el gráfico combinado)
    evolucion_caja = []
    
    if col_evol:
        df_sorted = df[df[col_evol].notna()].sort_values('Fecha')
        df_sorted['Mes'] = df_sorted['Fecha'].dt.to_period('M')
        for mes in sorted(df_sorted['Mes'].unique()):
            df_mes = df_sorted[df_sorted['Mes'] == mes]
            caja_final_mes = float(df_mes[col_evol].iloc[-1])
            evolucion_caja.append({'mes': str(mes), 'caja': round(caja_final_mes, 2)})
    else:
        balance_inicial = float(df_balance['Importe'].sum()) if len(df_balance) > 0 else 0.0
        caja_acumulada = balance_inicial
        for mes in meses_ordenados:
            ingreso_mes = float(ingresos_mensuales.get(mes, 0.0))
            gasto_mes = float(gross_burn_mensual.get(mes, 0.0))
            caja_acumulada = caja_acumulada + ingreso_mes - gasto_mes
            evolucion_caja.append({'mes': str(mes), 'caja': round(caja_acumulada, 2)})
    
    resultados['evolucion_caja'] = evolucion_caja
    
    # 6. GRÁFICO COMBINADO: Ingresos + Gastos + Caja por mes
    combinado_mensual = []
    for mes in meses_ordenados:
        ingresos = float(ingresos_mensuales.get(mes, 0))
        gastos = float(gross_burn_mensual.get(mes, 0))
        
        caja_mes_list = [ec['caja'] for ec in evolucion_caja if ec['mes'] == str(mes)]
        caja_mes = caja_mes_list[0] if caja_mes_list else 0
        
        combinado_mensual.append({
            'mes': str(mes),
            'ingresos': round(ingresos, 2),
            'gastos': round(gastos, 2),
            'caja': round(caja_mes, 2)
        })
    
    resultados['combinado_mensual'] = combinado_mensual
    
    # 7. GRÁFICO DE BARRAS: Net Burn Rate vs Gross Burn Rate por mes
    # (Reemplaza la antigua proyección de caja a 12 meses)
    burn_comparativo = []
    for mes in meses_ordenados:
        burn_comparativo.append({
            'mes': str(mes),
            'gross_burn': round(float(gross_burn_mensual.get(mes, 0.0)), 2),
            'net_burn': round(float(net_burn_mensual.get(mes, 0.0)), 2)
        })
    resultados['burn_comparativo'] = burn_comparativo
    
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
def _buscar_columna(df, candidatos):
    """Busca la primera columna existente de una lista de posibles nombres."""
    for c in candidatos:
        if c in df.columns:
            return c
    return None


VALORES_SI = ['si', 'Si', 'SI', 'sí', 'Sí', 'SÍ', '1', 1]


def _filtrar_ventas(df):
    """
    Devuelve solo las filas de venta: Tipo=I y, si existe la columna Concepto,
    Concepto en ('VENTAS', 'VENTA'). Si no hay match exacto, usa todo Tipo=I
    como fallback (compatibilidad con Excels sin columna Concepto homogénea).
    """
    df_i = df[df['Tipo'] == 'I'].copy()
    col_concepto = _buscar_columna(df, ['Concepto', 'CONCEPTO'])
    if col_concepto:
        mask = df_i[col_concepto].astype(str).str.upper().str.strip().isin(['VENTAS', 'VENTA'])
        if mask.any():
            return df_i[mask].copy()
    return df_i


def _marcar_bajas(df_ventas):
    """
    Añade a df_ventas las columnas '_es_baja' y '_fecha_baja_efectiva'.
    Regla: Fecha de Baja rellena -> baja (usa esa fecha). Si no existe o está
    vacía, se usa como fallback de compatibilidad el flag BAJA=Sí (Excels
    antiguos), tomando la Fecha de la transacción como fecha de baja aproximada.
    """
    df_ventas = df_ventas.copy()
    col_baja = _buscar_columna(df_ventas, ['baja', 'BAJA', 'Baja'])
    col_fecha_baja = _buscar_columna(df_ventas, ['Fecha de Baja', 'FECHA DE BAJA', 'Fecha Baja', 'Fecha de baja'])

    if col_fecha_baja:
        fecha_baja_parsed = pd.to_datetime(df_ventas[col_fecha_baja], errors='coerce')
    else:
        fecha_baja_parsed = pd.Series(pd.NaT, index=df_ventas.index)

    if col_baja:
        flag_baja_legacy = df_ventas[col_baja].isin(VALORES_SI)
    else:
        flag_baja_legacy = pd.Series(False, index=df_ventas.index)

    df_ventas['_es_baja'] = fecha_baja_parsed.notna() | (fecha_baja_parsed.isna() & flag_baja_legacy)
    df_ventas['_fecha_baja_efectiva'] = fecha_baja_parsed.where(
        fecha_baja_parsed.notna(), df_ventas['Fecha'].where(flag_baja_legacy)
    )
    return df_ventas


SECTORES_VALIDOS = ['Energía', 'Telefonía', 'Placas Solares', 'Alarmas']

# Fallback de compatibilidad: si la nueva columna 'Sector' (gastos) no está rellena,
# se intenta deducir el sector de un gasto SUELDO a partir de su Subcategoría, con la
# nomenclatura heredada de versiones anteriores (Energía/Teleco/Alarmas), añadiendo
# ahora también Placas Solares.
_ALIAS_SUBCATEGORIA_SECTOR = {
    'ENERGIA': 'Energía', 'ENERGÍA': 'Energía',
    'TELECO': 'Telefonía', 'TELEFONIA': 'Telefonía', 'TELEFONÍA': 'Telefonía',
    'ALARMAS': 'Alarmas',
    'PLACAS SOLARES': 'Placas Solares', 'PLACAS': 'Placas Solares', 'SOLAR': 'Placas Solares',
}


def _normalizar_sector(valor, estricto=False):
    """
    Normaliza un valor de sector (Categoría de venta o columna Sector de gasto) a uno de
    los 4 sectores canónicos, tolerando mayúsculas/sin tilde (ENERGIA, Energía, ENERGÍA...),
    usando el mismo alias que ya existía para Subcategoría. Así la columna 'Sector' de los
    gastos y la 'Categoría' de las ventas casan aunque el usuario las haya escrito distinto.
    - estricto=True (gastos): si no es reconocible como uno de los 4 sectores, devuelve None
      (ese gasto no se atribuye a ningún sector, pero sigue contando en el CAC global).
    - estricto=False (ventas): si no es reconocible, se devuelve el valor original tal cual,
      para no romper categorías antiguas/no-sector (p. ej. la fila legacy 'VENTAS').
    """
    if valor is None:
        return None
    texto = str(valor).strip()
    if not texto or texto.lower() == 'nan':
        return None
    canonico = _ALIAS_SUBCATEGORIA_SECTOR.get(texto.upper())
    if canonico:
        return canonico
    if texto in SECTORES_VALIDOS:
        return texto
    return None if estricto else texto


def _calcular_churn_rate_grupo(df_ventas_g, col_id_cliente):
    """
    Churn Rate para un subconjunto de ventas ya filtrado (p. ej. las de un sector),
    usando la misma regla que el global: un cliente (ID Cliente) cuenta como perdido
    solo si TODAS sus ventas DENTRO DE ESE SUBCONJUNTO tienen '_es_baja' = True. Requiere
    que df_ventas_g ya tenga la columna '_es_baja' (ver _marcar_bajas). Si una venta de
    ese cliente en OTRO sector sigue activa, no afecta a este cálculo: el churn de un
    sector solo mira las ventas de ese sector.
    Devuelve (churn_rate, clientes_perdidos, clientes_ciclo).
    """
    if not col_id_cliente or col_id_cliente not in df_ventas_g.columns or len(df_ventas_g) == 0:
        return 0.0, 0, 0
    grupos = df_ventas_g.groupby(col_id_cliente)['_es_baja'].all()
    clientes_ciclo = int(grupos.shape[0])
    clientes_perdidos = int(grupos.sum())
    churn_rate = (clientes_perdidos / clientes_ciclo * 100) if clientes_ciclo > 0 else 0.0
    return churn_rate, clientes_perdidos, clientes_ciclo


def _contar_clientes_nuevos(df_ventas_g, col_id_cliente):
    """Cuenta clientes nuevos dentro de un subconjunto de df_ventas ya marcado con '_es_nuevo'."""
    if len(df_ventas_g) == 0:
        return 0
    if col_id_cliente:
        return int(df_ventas_g.loc[df_ventas_g['_es_nuevo'], col_id_cliente].nunique())
    return int(df_ventas_g['_es_nuevo'].sum())


def _calcular_roi_subcanal_grupo(df_ventas_g, df_gastos_mk_g, col_subcanal, col_subcategoria):
    """ROI por subcanal para un subconjunto de ventas/gastos MK (global o de un sector)."""
    roi_subcanal = []
    if not (col_subcanal and col_subcategoria) or len(df_ventas_g) == 0:
        return roi_subcanal

    if len(df_gastos_mk_g) > 0 and col_subcategoria in df_gastos_mk_g.columns:
        inversion_por_subcanal = df_gastos_mk_g.groupby(
            df_gastos_mk_g[col_subcategoria].astype(str).str.strip()
        )['Importe'].sum().abs()
    else:
        inversion_por_subcanal = pd.Series(dtype=float)

    if col_subcanal in df_ventas_g.columns:
        ingresos_por_subcanal = df_ventas_g.groupby(
            df_ventas_g[col_subcanal].astype(str).str.strip()
        )['Importe'].sum()
    else:
        ingresos_por_subcanal = pd.Series(dtype=float)

    subcanales = set(inversion_por_subcanal.index) | set(ingresos_por_subcanal.index)
    subcanales.discard('nan')
    subcanales.discard('')

    for subcanal in subcanales:
        inversion = float(inversion_por_subcanal.get(subcanal, 0.0))
        ingresos_sc = float(ingresos_por_subcanal.get(subcanal, 0.0))
        roi = (ingresos_sc - inversion) / inversion if inversion > 0 else None
        roi_subcanal.append({
            'subcanal': subcanal,
            'inversion': round(inversion, 2),
            'ingresos': round(ingresos_sc, 2),
            'roi': round(roi * 100, 2) if roi is not None else None
        })

    roi_subcanal.sort(key=lambda x: x['ingresos'], reverse=True)
    return roi_subcanal


def _calcular_metricas_unit_economics(df_ventas_g, df_gastos_mk_g, df_gastos_venta_g,
                                       col_comision, col_coste_lead, col_id_cliente,
                                       col_subcanal, col_subcategoria, churn_rate_global):
    """
    Unit economics (Ingreso Medio/Cliente, Margen de Contribución, CAC, LTV, ROI por
    Subcanal) para un subconjunto de ventas y de gastos ya filtrados (global o por
    sector). El Churn Rate NO se recalcula por grupo: se usa siempre el global, tal
    como se ha decidido para este rediseño por Unit Economics.
    """
    total_ingresos = float(df_ventas_g['Importe'].sum()) if len(df_ventas_g) else 0.0
    cantidad_ventas = len(df_ventas_g)
    # Ingreso Medio POR CLIENTE: se divide entre clientes únicos (ID Cliente), no entre
    # número de ventas — si un mismo cliente tiene varias ventas (distintos sectores o
    # repetidas en el tiempo), sus ingresos se suman pero el cliente solo cuenta una vez.
    if col_id_cliente and cantidad_ventas and col_id_cliente in df_ventas_g.columns:
        clientes_unicos = int(df_ventas_g[col_id_cliente].nunique())
    else:
        clientes_unicos = cantidad_ventas
    ingreso_medio_cliente = (total_ingresos / clientes_unicos) if clientes_unicos > 0 else 0.0

    total_comisiones = float(df_ventas_g[col_comision].sum()) if col_comision and cantidad_ventas else 0.0
    total_coste_leads = float(df_ventas_g[col_coste_lead].sum()) if col_coste_lead and cantidad_ventas else 0.0

    margen_contribucion = (
        (total_ingresos - total_comisiones - total_coste_leads) / total_ingresos * 100
    ) if total_ingresos > 0 else 0.0

    clientes_nuevos = _contar_clientes_nuevos(df_ventas_g, col_id_cliente)

    inversion_mk = float(df_gastos_mk_g['Importe'].abs().sum()) if len(df_gastos_mk_g) else 0.0
    # Inversión en Venta: el gasto SUELDO (equipo comercial) ya incluye las comisiones que
    # se les paga, así que NO se suman ambos (se duplicaría el mismo gasto). Si hay gasto
    # SUELDO registrado para este grupo (sector/mes), se usa ese importe tal cual; si no hay
    # ninguna fila de SUELDO, se usa la suma de Comisión Comercial como aproximación del
    # coste de venta.
    inversion_venta_sueldo = float(df_gastos_venta_g['Importe'].abs().sum()) if len(df_gastos_venta_g) else 0.0
    inversion_venta = inversion_venta_sueldo if inversion_venta_sueldo > 0 else total_comisiones

    cac = ((inversion_mk + inversion_venta) / clientes_nuevos) if clientes_nuevos > 0 else 0.0

    if churn_rate_global and churn_rate_global > 0:
        ltv = ingreso_medio_cliente * (margen_contribucion / 100) / (churn_rate_global / 100)
    else:
        ltv = None

    roi_subcanal = _calcular_roi_subcanal_grupo(df_ventas_g, df_gastos_mk_g, col_subcanal, col_subcategoria)

    return {
        'total_ingresos': round(total_ingresos, 2),
        'total_comisiones': round(total_comisiones, 2),
        'total_coste_leads': round(total_coste_leads, 2),
        'cantidad_ventas': cantidad_ventas,
        'ingreso_medio_cliente': round(ingreso_medio_cliente, 2),
        'margen_contribucion': round(margen_contribucion, 2),
        'clientes_nuevos': clientes_nuevos,
        'inversion_mk': round(inversion_mk, 2),
        'inversion_venta': round(inversion_venta, 2),
        'cac': round(cac, 2),
        'ltv': round(ltv, 2) if ltv is not None else None,
        'roi_subcanal': roi_subcanal,
    }


def calcular_eficiencia(df_transacciones):
    """
    Calcula métricas de Eficiencia - v7.0 (Unit Economics por sector):
    - Churn Rate = (Clientes perdidos / Total de clientes del ciclo) × 100 — SOLO global,
      no se segmenta por sector.
    - Ingreso medio por cliente, Margen de Contribución, CAC, LTV y ROI por Subcanal se
      calculan tanto en global ('resultados', igual que antes) como por sector de venta
      (Energía/Telefonía/Placas Solares/Alarmas) en resultados['por_sector'].
    - CAC = (Inversión MK + Inversión venta [sueldos+comisiones]) / Clientes nuevos
      (nuevo = CANAL != 'REN'; si CANAL está vacío, fallback a columna NUEVO=Sí)
    - Margen de Contribución = (Ingresos - Comisiones - Coste por leads) / Ingresos
    - LTV = Ingreso Medio por Cliente × Margen de Contribución (%) / Churn Rate global (%)
    - La atribución de gasto de Marketing/Sueldo a un sector usa la columna 'Sector' del
      Excel si está rellena; si no, cae al fallback heredado por Subcategoría (solo gastos
      SUELDO). Los gastos sin sector resoluble NO entran en ningún CAC por sector, pero sí
      en el CAC global (compatibilidad total con Excels anteriores).
    """
    resultados = {}

    df = df_transacciones.copy()
    df['Fecha'] = pd.to_datetime(df['Fecha'], errors='coerce')
    df = df[df['Fecha'].notna()]
    df['Mes'] = df['Fecha'].dt.to_period('M')

    col_id_cliente = _buscar_columna(df, ['ID Cliente', 'ID Cliente/Proveedor'])
    col_concepto = _buscar_columna(df, ['Concepto', 'CONCEPTO'])
    col_categoria = _buscar_columna(df, ['Categoría', 'CATEGORIA', 'Categoria'])
    col_subcategoria = _buscar_columna(df, ['Subcategoría', 'SUBCATEGORIA', 'Subcategoria'])
    col_canal = _buscar_columna(df, ['CANAL', 'Canal'])
    col_subcanal = _buscar_columna(df, ['SUBCANAL', 'Subcanal'])
    col_comision = _buscar_columna(df, ['Com Eur Pagar', 'COM EUR PAGAR', 'COMISION EUR', 'COMISIÓN EUR', 'Comision Eur'])
    col_nuevo = _buscar_columna(df, ['NUEVO', 'Nuevo'])
    col_coste_lead = _buscar_columna(df, ['Coste por lead', 'COSTE POR LEAD', 'Coste Lead'])
    col_sector_gasto = _buscar_columna(df, ['Sector', 'SECTOR'])

    df_gastos = df[df['Tipo'] == 'G'].copy()

    # Ventas: si existe columna Concepto y valor "VENTAS"/"VENTA", filtrar por eso dentro de Tipo=I
    # Si no, usar todo Tipo=I como fallback (compatibilidad con Excel anterior)
    df_ventas = _filtrar_ventas(df)

    if len(df_ventas) == 0:
        resultados['margen_contribucion'] = 0
        resultados['cac'] = 0
        resultados['churn_rate'] = 0
        resultados['churn_historico'] = []
        resultados['clientes_nuevos'] = 0
        resultados['ingreso_medio_cliente'] = 0
        resultados['ltv'] = 0
        resultados['roi_subcanal'] = []
        resultados['por_sector'] = {}
        resultados['por_sector_mes'] = {}
        resultados['por_mes'] = []
        return resultados
    
    # ============================================
    # 1. CHURN RATE v2 = (Clientes perdidos / Total de clientes del ciclo analizado) × 100
    # Un cliente (identificado por ID Cliente, aunque tenga varias ventas) se considera
    # "perdido" únicamente si TODAS sus ventas tienen Fecha de Baja rellena (o, en Excels
    # antiguos sin esa columna, BAJA = Sí). Si al menos una de sus ventas sigue activa,
    # el cliente cuenta como activo.
    # ============================================
    churn_historico = []
    df_ventas = _marcar_bajas(df_ventas)

    if col_id_cliente:
        df_ventas['Mes'] = df_ventas['Fecha'].dt.to_period('M')

        for mes in sorted(df_ventas['Mes'].unique()):
            df_hasta_mes = df_ventas[df_ventas['Mes'] <= mes]
            grupos_mes = df_hasta_mes.groupby(col_id_cliente)['_es_baja'].all()
            clientes_inicio = int(grupos_mes.shape[0])
            clientes_perdidos_mes = int(grupos_mes.sum())

            churn_rate_mes = (clientes_perdidos_mes / clientes_inicio * 100) if clientes_inicio > 0 else 0.0

            churn_historico.append({
                'mes': str(mes),
                'churn_rate': round(churn_rate_mes, 2),
                'clientes_perdidos': clientes_perdidos_mes,
                'clientes_inicio': clientes_inicio
            })

        # Churn Rate global = (clientes perdidos / total de clientes del ciclo analizado) × 100
        grupos_globales = df_ventas.groupby(col_id_cliente)['_es_baja'].all()
        total_clientes_ciclo = int(grupos_globales.shape[0])
        clientes_perdidos_total = int(grupos_globales.sum())
        churn_rate_global = (clientes_perdidos_total / total_clientes_ciclo * 100) if total_clientes_ciclo > 0 else 0.0

        resultados['churn_rate'] = round(churn_rate_global, 2)
        resultados['clientes_perdidos_total'] = clientes_perdidos_total
        resultados['clientes_ciclo_total'] = total_clientes_ciclo
    else:
        resultados['churn_rate'] = 0.0
        resultados['clientes_perdidos_total'] = 0
        resultados['clientes_ciclo_total'] = 0

    resultados['churn_historico'] = churn_historico
    
    # ============================================
    # 2. CLIENTES NUEVOS v2 (precomputado por fila en '_es_nuevo' para reutilizarlo
    # tanto en el cálculo global como por sector):
    # - Si la fila tiene CANAL relleno: nuevo = (CANAL != 'REN').
    # - Si CANAL está vacío: se usa la columna NUEVO (Sí/No).
    # Fallback total (sin CANAL ni NUEVO en todo el archivo): ID que aparece una sola vez.
    # ============================================
    valores_si = ['si', 'Si', 'SI', 'sí', 'Sí', 'SÍ', '1', 1]

    if col_canal:
        canal_str = df_ventas[col_canal].astype(str).str.strip()
        tiene_canal = df_ventas[col_canal].notna() & (canal_str != '') & (canal_str.str.lower() != 'nan')
    else:
        canal_str = pd.Series('', index=df_ventas.index)
        tiene_canal = pd.Series(False, index=df_ventas.index)

    nuevo_flag = df_ventas[col_nuevo].isin(valores_si) if col_nuevo else pd.Series(False, index=df_ventas.index)

    if col_canal or col_nuevo:
        df_ventas['_es_nuevo'] = False
        df_ventas.loc[tiene_canal, '_es_nuevo'] = canal_str.loc[tiene_canal].str.upper() != 'REN'
        df_ventas.loc[~tiene_canal, '_es_nuevo'] = nuevo_flag.loc[~tiene_canal]
    elif col_id_cliente:
        conteo_ids = df_ventas[col_id_cliente].value_counts()
        ids_nuevos = set(conteo_ids[conteo_ids == 1].index)
        df_ventas['_es_nuevo'] = df_ventas[col_id_cliente].isin(ids_nuevos)
    else:
        df_ventas['_es_nuevo'] = True

    # ============================================
    # 3. ATRIBUCIÓN DE GASTOS (MK y 'Inversión en venta') A UN SECTOR
    # Prioridad 1: columna 'Sector' del Excel (si está rellena y es reconocible como uno
    # de los 4 sectores válidos — se normaliza mayúsculas/tildes con el mismo alias que la
    # Subcategoría, para que "ENERGIA", "Energía" o "ENERGÍA" se traten igual). Prioridad 2
    # (solo gastos SUELDO, compatibilidad con Excels anteriores): Subcategoría
    # Energía/Teleco/Alarmas/Placas Solares. Sin ninguna de las dos, el gasto no se
    # atribuye a ningún sector (pero sí cuenta en el CAC global).
    # ============================================
    cat_upper = df_gastos[col_categoria].astype(str).str.upper().str.strip() if col_categoria else pd.Series('', index=df_gastos.index)
    mask_mk_global = cat_upper.isin(['MK', 'PAGOS MK'])
    mask_sueldo = cat_upper.isin(['SUELDO', 'SUELDO COMERCIAL'])
    mask_directo = cat_upper.isin(['ENERGIA', 'ENERGÍA', 'TELECO', 'ALARMAS', 'PLACAS SOLARES', 'PLACAS'])
    mask_venta_global = mask_sueldo | mask_directo

    if col_sector_gasto and col_sector_gasto in df_gastos.columns:
        sector_explicito = df_gastos[col_sector_gasto].apply(lambda v: _normalizar_sector(v, estricto=True))
    else:
        sector_explicito = pd.Series(None, index=df_gastos.index, dtype=object)

    if col_subcategoria and col_subcategoria in df_gastos.columns:
        subcat_upper_gasto = df_gastos[col_subcategoria].astype(str).str.strip().str.upper()
        sector_fallback = subcat_upper_gasto.map(_ALIAS_SUBCATEGORIA_SECTOR)
    else:
        sector_fallback = pd.Series(None, index=df_gastos.index, dtype=object)
    sector_fallback = sector_fallback.where(mask_sueldo, None)

    df_gastos['_sector'] = sector_explicito.combine_first(sector_fallback)

    df_gastos_mk_global = df_gastos[mask_mk_global]
    df_gastos_venta_global = df_gastos[mask_venta_global]

    # ============================================
    # 4-7. UNIT ECONOMICS: GLOBAL (compatible con el formato de versiones anteriores)
    # + POR SECTOR DE VENTA (Energía/Telefonía/Placas Solares/Alarmas). El Churn Rate
    # usado en el LTV de cada sector es siempre el GLOBAL (no se segmenta por sector).
    # ============================================
    churn_rate_global = resultados.get('churn_rate') or 0.0

    metricas_global = _calcular_metricas_unit_economics(
        df_ventas, df_gastos_mk_global, df_gastos_venta_global,
        col_comision, col_coste_lead, col_id_cliente, col_subcanal, col_subcategoria,
        churn_rate_global
    )
    resultados.update(metricas_global)

    meses_presentes = sorted(set(df_ventas['Mes'].dropna().unique()) | set(df_gastos['Mes'].dropna().unique()))

    por_sector = {}
    # por_sector_mes: cruce sector × mes para CAC, Margen de Contribución e Ingreso Medio
    # por Cliente (NO para LTV ni ROI por Subcanal, que se quedan solo por sector agregado).
    # Es lo que alimenta la vista "Por Sector" de esas 3 métricas, que ahora muestra el mes
    # en el eje X con una barra agrupada por sector dentro de cada mes.
    por_sector_mes = {}
    if col_categoria:
        # Se normaliza la Categoría de venta igual que la columna 'Sector' de los gastos
        # (mayúsculas/tildes), para que ambas casen aunque el usuario las haya escrito
        # distinto (p. ej. "ENERGIA" en una fila y "Energía" en otra). Las categorías no
        # reconocidas como uno de los 4 sectores (p. ej. filas antiguas) se dejan tal cual.
        df_ventas['_sector_venta'] = df_ventas[col_categoria].apply(lambda v: _normalizar_sector(v, estricto=False))
        sectores_presentes = sorted(df_ventas['_sector_venta'].dropna().unique())
        for sector in sectores_presentes:
            if not sector:
                continue
            df_ventas_sector = df_ventas[df_ventas['_sector_venta'] == sector]
            df_gastos_mk_sector = df_gastos_mk_global[df_gastos_mk_global['_sector'] == sector]
            df_gastos_venta_sector = df_gastos_venta_global[df_gastos_venta_global['_sector'] == sector]

            # Churn Rate propio del sector (cliente perdido = todas SUS ventas EN ESTE
            # SECTOR están de baja). Se usa para el LTV de este sector en vez del global,
            # porque cada línea de negocio tiene su propia dinámica de cancelación.
            churn_rate_sector, clientes_perdidos_sector, clientes_ciclo_sector = _calcular_churn_rate_grupo(
                df_ventas_sector, col_id_cliente
            )

            por_sector[sector] = _calcular_metricas_unit_economics(
                df_ventas_sector, df_gastos_mk_sector, df_gastos_venta_sector,
                col_comision, col_coste_lead, col_id_cliente, col_subcanal, col_subcategoria,
                churn_rate_sector
            )
            por_sector[sector]['churn_rate'] = round(churn_rate_sector, 2)
            por_sector[sector]['clientes_perdidos_sector'] = clientes_perdidos_sector
            por_sector[sector]['clientes_ciclo_sector'] = clientes_ciclo_sector

            serie_sector_mes = []
            for mes in meses_presentes:
                df_ventas_sector_mes = df_ventas_sector[df_ventas_sector['Mes'] == mes]
                df_gastos_mk_sector_mes = df_gastos_mk_sector[df_gastos_mk_sector['Mes'] == mes]
                df_gastos_venta_sector_mes = df_gastos_venta_sector[df_gastos_venta_sector['Mes'] == mes]

                metricas_sector_mes = _calcular_metricas_unit_economics(
                    df_ventas_sector_mes, df_gastos_mk_sector_mes, df_gastos_venta_sector_mes,
                    col_comision, col_coste_lead, col_id_cliente, col_subcanal, col_subcategoria,
                    churn_rate_sector
                )
                serie_sector_mes.append({
                    'mes': str(mes),
                    'margen_contribucion': metricas_sector_mes['margen_contribucion'],
                    'cac': metricas_sector_mes['cac'],
                    'ingreso_medio_cliente': metricas_sector_mes['ingreso_medio_cliente'],
                })
            por_sector_mes[sector] = serie_sector_mes

    resultados['por_sector'] = por_sector
    resultados['por_sector_mes'] = por_sector_mes

    # ============================================
    # 8. CAC, MARGEN DE CONTRIBUCIÓN E INGRESO MEDIO POR CLIENTE — POR MES (global,
    # todos los sectores). Se calculan igual que el global, pero agrupando por 'Mes'
    # en vez de por Categoría. A propósito NO se incluyen aquí LTV ni ROI por Subcanal:
    # con pocas transacciones por mes son demasiado ruidosos para ser interpretables
    # (el LTV depende de un Churn Rate que es más fiable como medida acumulada, y el ROI
    # por subcanal necesita volumen suficiente de inversión/ingresos en cada subcanal).
    # ============================================
    por_mes = []
    for mes in meses_presentes:
        df_ventas_mes = df_ventas[df_ventas['Mes'] == mes]
        df_gastos_mk_mes = df_gastos_mk_global[df_gastos_mk_global['Mes'] == mes]
        df_gastos_venta_mes = df_gastos_venta_global[df_gastos_venta_global['Mes'] == mes]

        metricas_mes = _calcular_metricas_unit_economics(
            df_ventas_mes, df_gastos_mk_mes, df_gastos_venta_mes,
            col_comision, col_coste_lead, col_id_cliente, col_subcanal, col_subcategoria,
            churn_rate_global
        )
        por_mes.append({
            'mes': str(mes),
            'margen_contribucion': metricas_mes['margen_contribucion'],
            'cac': metricas_mes['cac'],
            'ingreso_medio_cliente': metricas_mes['ingreso_medio_cliente'],
        })

    resultados['por_mes'] = por_mes

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

        # El frontend asume que el índice 0 es el sector con más ventas (lo usa para el
        # mensaje "Sector principal"), así que hay que ordenarlo de mayor a menor — si no,
        # groupby() los deja en orden alfabético, no por volumen de ventas.
        ventas_sector_detalle.sort(key=lambda s: s['valor'], reverse=True)
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

def calcular_bajas_mensual(df_transacciones):
    """
    % de bajas mensual, general y por sector (Categoría):
    % bajas del mes M = (ventas cuya Fecha de Baja cae en el mes M / ventas
    realizadas en el mes M) × 100. Usa la misma regla de "es_baja" que el
    Churn Rate (Fecha de Baja como fuente principal, BAJA=Sí como fallback
    de compatibilidad con Excels antiguos).
    """
    resultados = {'por_sector': {}, 'general': []}

    df = df_transacciones.copy()
    df['Fecha'] = pd.to_datetime(df['Fecha'], errors='coerce')
    df = df[df['Fecha'].notna()]

    df_ventas = _filtrar_ventas(df)
    if len(df_ventas) == 0:
        return resultados

    df_ventas = _marcar_bajas(df_ventas)
    df_ventas['Mes'] = df_ventas['Fecha'].dt.to_period('M')

    col_categoria = _buscar_columna(df, ['Categoría', 'CATEGORIA', 'Categoria'])

    df_bajas = df_ventas[df_ventas['_es_baja']].copy()
    df_bajas['MesBaja'] = pd.to_datetime(df_bajas['_fecha_baja_efectiva'], errors='coerce').dt.to_period('M')

    meses = sorted(set(df_ventas['Mes'].dropna().unique()) | set(df_bajas['MesBaja'].dropna().unique()))

    def _serie(df_v, df_b):
        serie = []
        for mes in meses:
            ventas_mes = int((df_v['Mes'] == mes).sum())
            bajas_mes = int((df_b['MesBaja'] == mes).sum())
            pct = (bajas_mes / ventas_mes * 100) if ventas_mes > 0 else 0.0
            serie.append({
                'mes': str(mes),
                'ventas': ventas_mes,
                'bajas': bajas_mes,
                'pct_bajas': round(pct, 2)
            })
        return serie

    resultados['general'] = _serie(df_ventas, df_bajas)

    if col_categoria:
        for sector in sorted(df_ventas[col_categoria].dropna().astype(str).unique()):
            df_v_sector = df_ventas[df_ventas[col_categoria].astype(str) == sector]
            if col_categoria in df_bajas.columns:
                df_b_sector = df_bajas[df_bajas[col_categoria].astype(str) == sector]
            else:
                df_b_sector = df_bajas.iloc[0:0]
            resultados['por_sector'][sector] = _serie(df_v_sector, df_b_sector)

    return resultados


def calcular_detalle_transacciones(df_transacciones):
    """
    Detalle granular (una fila por venta) con todos los campos necesarios para
    los filtros de fecha/dimensión y los gráficos de drill-down de Ventas y
    Bajas en el frontend. Toda la agregación posterior (por sector,
    comercializadora, tarifa, luz/gas, año/mes/día) se hace en el cliente
    sobre este array, sin volver a llamar al backend.
    """
    df = df_transacciones.copy()
    df['Fecha'] = pd.to_datetime(df['Fecha'], errors='coerce')
    df = df[df['Fecha'].notna()]

    df_ventas = _filtrar_ventas(df)
    if len(df_ventas) == 0:
        return []

    df_ventas = _marcar_bajas(df_ventas)

    col_categoria = _buscar_columna(df, ['Categoría', 'CATEGORIA', 'Categoria'])
    col_comercializadora = _buscar_columna(df, ['Comercializadora', 'COMERCIALIZADORA'])
    col_tarifa = _buscar_columna(df, ['Tarifa', 'TARIFA'])
    col_tipo_energia = _buscar_columna(df, ['Tipo de Energía', 'Tipo de Energia', 'TIPO DE ENERGÍA'])
    col_sva = _buscar_columna(df, ['SVA'])
    col_campaña = _buscar_columna(df, ['Campaña', 'CAMPAÑA', 'Campana'])
    col_comision = _buscar_columna(df, ['Com Eur Pagar', 'COM EUR PAGAR', 'COMISION EUR', 'COMISIÓN EUR', 'Comision Eur'])
    col_id_cliente = _buscar_columna(df, ['ID Cliente', 'ID Cliente/Proveedor'])
    col_fecha_activacion = _buscar_columna(df, ['Fecha de Activación', 'Fecha de Activacion', 'FECHA DE ACTIVACIÓN', 'Fecha Activación'])
    col_estado = _buscar_columna(df, ['Estado', 'ESTADO'])

    if col_fecha_activacion:
        fecha_activacion_parsed = pd.to_datetime(df_ventas[col_fecha_activacion], errors='coerce')
    else:
        fecha_activacion_parsed = pd.Series(pd.NaT, index=df_ventas.index)

    def _texto(row, col, default=None):
        if col and pd.notna(row.get(col)):
            return str(row[col]).strip()
        return default

    valores_pendiente = ['pendiente', 'Pendiente', 'PENDIENTE']

    detalle = []
    for idx, row in df_ventas.iterrows():
        fecha_baja_val = row['_fecha_baja_efectiva']
        fecha_activacion_val = fecha_activacion_parsed.loc[idx]
        estado_val = _texto(row, col_estado)
        es_pendiente = bool(estado_val) and estado_val.strip() in valores_pendiente
        detalle.append({
            'fecha': row['Fecha'].strftime('%Y-%m-%d') if pd.notna(row['Fecha']) else None,
            'mes': row['Fecha'].strftime('%Y-%m') if pd.notna(row['Fecha']) else None,
            'categoria': _texto(row, col_categoria, 'Sin categoría'),
            'comercializadora': _texto(row, col_comercializadora, 'Sin comercializadora'),
            'tarifa': _texto(row, col_tarifa, 'Sin tarifa'),
            'tipo_energia': _texto(row, col_tipo_energia),
            'sva': _texto(row, col_sva),
            'campaña': _texto(row, col_campaña),
            'importe': float(row['Importe']) if pd.notna(row['Importe']) else 0.0,
            'comision_eur': float(row[col_comision]) if col_comision and pd.notna(row.get(col_comision)) else 0.0,
            'id_cliente': _texto(row, col_id_cliente),
            'fecha_activacion': fecha_activacion_val.strftime('%Y-%m-%d') if pd.notna(fecha_activacion_val) else None,
            'fecha_baja': fecha_baja_val.strftime('%Y-%m-%d') if pd.notna(fecha_baja_val) else None,
            'es_baja': bool(row['_es_baja']),
            # 'estado' crudo de la columna Estado del Excel (Cobrado/Pagado/Confirmado/Pendiente/...).
            # 'es_pendiente' resume si es una venta aún no liquidada (Estado = Pendiente);
            # cualquier otro valor (o vacío) se trata como ya cobrada, por compatibilidad.
            'estado': estado_val,
            'es_pendiente': es_pendiente,
        })

    return detalle


def calcular_detalle_gastos(df_transacciones):
    """
    Detalle granular (una fila por gasto) con fecha exacta, categoría/subcategoría
    e importe. Permite que el frontend alterne el eje de los gráficos de OpEx entre
    vista mensual y vista diaria sin volver a llamar al backend.
    """
    df = df_transacciones.copy()
    df['Fecha'] = pd.to_datetime(df['Fecha'], errors='coerce')
    df = df[df['Fecha'].notna()]

    df_gastos = df[df['Tipo'] == 'G'].copy()
    if len(df_gastos) == 0:
        return []

    col_categoria = _buscar_columna(df, ['Categoría', 'CATEGORIA', 'Categoria'])
    col_subcategoria = _buscar_columna(df, ['Subcategoría', 'SUBCATEGORIA', 'Subcategoria'])

    detalle = []
    for _, row in df_gastos.iterrows():
        detalle.append({
            'fecha': row['Fecha'].strftime('%Y-%m-%d') if pd.notna(row['Fecha']) else None,
            'mes': row['Fecha'].strftime('%Y-%m') if pd.notna(row['Fecha']) else None,
            'categoria': str(row[col_categoria]).strip() if col_categoria and pd.notna(row.get(col_categoria)) else 'Sin categoría',
            'subcategoria': str(row[col_subcategoria]).strip() if col_subcategoria and pd.notna(row.get(col_subcategoria)) else None,
            'importe': abs(float(row['Importe'])) if pd.notna(row['Importe']) else 0.0,
        })
    return detalle


def calcular_4_pilares(df_transacciones):
    """
    Calcula todos los 4 pilares con correcciones v4.0, más el detalle granular
    de transacciones/gastos y el nuevo pilar de Bajas (v6.0).
    """
    return {
        'cash_management': calcular_cash_management(df_transacciones),
        'eficiencia': calcular_eficiencia(df_transacciones),
        'crecimiento': calcular_crecimiento(df_transacciones),
        'opex': calcular_opex(df_transacciones),
        'bajas': calcular_bajas_mensual(df_transacciones),
        'detalle_transacciones': calcular_detalle_transacciones(df_transacciones),
        'detalle_gastos': calcular_detalle_gastos(df_transacciones),
    }
