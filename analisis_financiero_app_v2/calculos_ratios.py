"""
Módulo de cálculos de Ratios Financieros Tradicionales
"""

import pandas as pd
import numpy as np

def safe_divide(numerator, denominator):
    """División segura"""
    try:
        if pd.isna(numerator) or pd.isna(denominator) or denominator == 0:
            return None
        return float(numerator) / float(denominator)
    except:
        return None

def calcular_ratios_tradicionales(df, nombres_personalizados=None):
    """
    Calcula los 11 ratios financieros tradicionales
    """
    from app import obtener_años_y_offset, extraer_datos_automaticamente
    
    # Obtener años y offsets
    años, fila_años, fila_inicio = obtener_años_y_offset(df)
    print(f"🔍 Años detectados: {años}")
    
    # Encontrar dónde están los datos
    indices = extraer_datos_automaticamente(df, nombres_personalizados)
    
    # Verificar datos encontrados
    for concepto, idx in indices.items():
        print(f"  ✅ {concepto} encontrado en fila {idx}")
    
    ratios = {}
    
    # Calcular ratios para cada año
    for col_idx, año in enumerate(años, start=1):
        ratios_año = {}
        
        try:
            # Extraer valores
            pasivo_nc = df.iloc[indices.get('pasivo_no_corriente'), col_idx] if 'pasivo_no_corriente' in indices else None
            pasivo_c = df.iloc[indices.get('pasivo_corriente'), col_idx] if 'pasivo_corriente' in indices else None
            fondos_propios = df.iloc[indices.get('fondos_propios'), col_idx] if 'fondos_propios' in indices else None
            total_activo = df.iloc[indices.get('total_activo'), col_idx] if 'total_activo' in indices else None
            activo_nc = df.iloc[indices.get('activo_no_corriente'), col_idx] if 'activo_no_corriente' in indices else None
            activo_c = df.iloc[indices.get('activo_corriente'), col_idx] if 'activo_corriente' in indices else None
            tesoreria = df.iloc[indices.get('tesoreria'), col_idx] if 'tesoreria' in indices else None
            resultado_ejercicio = df.iloc[indices.get('resultado_ejercicio'), col_idx] if 'resultado_ejercicio' in indices else None
            cifra_ventas = df.iloc[indices.get('cifra_ventas'), col_idx] if 'cifra_ventas' in indices else None
            ebit = df.iloc[indices.get('ebit'), col_idx] if 'ebit' in indices else None
            ebitda = df.iloc[indices.get('ebitda'), col_idx] if 'ebitda' in indices else None
            
            # 1. NIVEL DE ENDEUDAMIENTO
            if all(x is not None for x in [pasivo_nc, pasivo_c, fondos_propios]):
                total_pasivo = pasivo_nc + pasivo_c
                total_patrimonio_pasivo = fondos_propios + total_pasivo
                nivel_endeudamiento = safe_divide(total_pasivo, total_patrimonio_pasivo)
                if nivel_endeudamiento is not None:
                    ratios_año['nivel_endeudamiento'] = round(nivel_endeudamiento * 100, 2)
            
            # 2. RATIO ENDEUDAMIENTO TOTAL
            if all(x is not None for x in [pasivo_nc, pasivo_c, fondos_propios]):
                total_pasivo = pasivo_nc + pasivo_c
                ratio_endeud_total = safe_divide(total_pasivo, fondos_propios)
                if ratio_endeud_total is not None:
                    ratios_año['ratio_endeudamiento_total'] = round(ratio_endeud_total * 100, 2)
            
            # 3. SOLVENCIA TOTAL
            if all(x is not None for x in [total_activo, pasivo_nc, pasivo_c]):
                total_pasivo = pasivo_nc + pasivo_c
                solvencia_total = safe_divide(total_activo, total_pasivo)
                if solvencia_total is not None:
                    ratios_año['solvencia_total'] = round(solvencia_total, 2)
            
            # 4. RATIO DE MADUREZ
            if all(x is not None for x in [activo_nc, total_activo]):
                ratio_madurez = safe_divide(activo_nc, total_activo)
                if ratio_madurez is not None:
                    ratios_año['ratio_madurez'] = round(ratio_madurez * 100, 2)
            
            # 5. ROA
            if all(x is not None for x in [ebit, total_activo]):
                roa = safe_divide(ebit, total_activo)
                if roa is not None:
                    ratios_año['roa'] = round(roa * 100, 2)
            
            # 6. ROE
            if all(x is not None for x in [resultado_ejercicio, fondos_propios]):
                roe = safe_divide(resultado_ejercicio, fondos_propios)
                if roe is not None:
                    ratios_año['roe'] = round(roe * 100, 2)
            
            # 7. SOLVENCIA CORRIENTE
            if all(x is not None for x in [activo_c, pasivo_c]):
                solvencia_corriente = safe_divide(activo_c, pasivo_c)
                if solvencia_corriente is not None:
                    ratios_año['solvencia_corriente'] = round(solvencia_corriente, 2)
            
            # 8. DISPONIBILIDAD INMEDIATA
            if all(x is not None for x in [tesoreria, pasivo_c]):
                disponibilidad = safe_divide(tesoreria, pasivo_c)
                if disponibilidad is not None:
                    ratios_año['disponibilidad_inmediata'] = round(disponibilidad, 2)
            
            # 9. EBITDA/VENTAS
            if all(x is not None for x in [ebitda, cifra_ventas]):
                ebitda_ventas = safe_divide(ebitda, cifra_ventas)
                if ebitda_ventas is not None:
                    ratios_año['ebitda_ventas'] = round(ebitda_ventas * 100, 2)
            
            # 10. BAIT/VENTAS
            if all(x is not None for x in [ebit, cifra_ventas]):
                bait_ventas = safe_divide(ebit, cifra_ventas)
                if bait_ventas is not None:
                    ratios_año['bait_ventas'] = round(bait_ventas * 100, 2)
            
            # 11. RESULTADO/VENTAS
            if all(x is not None for x in [resultado_ejercicio, cifra_ventas]):
                resultado_ventas = safe_divide(resultado_ejercicio, cifra_ventas)
                if resultado_ventas is not None:
                    ratios_año['resultado_ventas'] = round(resultado_ventas * 100, 2)
            
            ratios[str(año)] = ratios_año
            print(f"  ✅ Ratios calculados para {año}: {len(ratios_año)} ratios")
            
        except Exception as e:
            print(f"❌ Error calculando ratios para año {año}: {e}")
            ratios[str(año)] = {}
    
    return ratios

def analizar_ratios(ratios_calculados, sector='otros'):
    """
    Genera análisis ajustado por sector
    """
    from app import UMBRALES_SECTORES
    
    analisis = []
    umbrales = UMBRALES_SECTORES.get(sector, UMBRALES_SECTORES['otros'])
    nombre_sector = umbrales['nombre']
    
    # Información del sector
    analisis.append({
        'tipo': 'positive',
        'titulo': f'📊 Análisis para Sector: {nombre_sector}',
        'descripcion': f'Los umbrales y recomendaciones están ajustados específicamente para empresas del sector {nombre_sector}.'
    })
    
    if not ratios_calculados:
        return analisis
    
    ultimo_año = list(ratios_calculados.keys())[-1]
    ratios_ultimo = ratios_calculados[ultimo_año]
    
    # Análisis de ROE
    if 'roe' in ratios_ultimo:
        roe = ratios_ultimo['roe']
        roe_bajo = umbrales['roe']['bajo']
        roe_alto = umbrales['roe']['alto']
        
        if roe < roe_bajo:
            analisis.append({
                'tipo': 'negative',
                'titulo': '📉 ROE Bajo para el Sector',
                'descripcion': f'El ROE es del {roe}%, por debajo del {roe_bajo}% esperado para {nombre_sector}.'
            })
        elif roe < roe_alto:
            analisis.append({
                'tipo': 'warning',
                'titulo': '📊 ROE Dentro del Rango',
                'descripcion': f'El ROE es del {roe}%, dentro del rango típico ({roe_bajo}%-{roe_alto}%) para {nombre_sector}.'
            })
        else:
            analisis.append({
                'tipo': 'positive',
                'titulo': '📈 Excelente ROE para el Sector',
                'descripcion': f'El ROE es del {roe}%, superando el {roe_alto}% típico de {nombre_sector}.'
            })
    
    # Análisis de ENDEUDAMIENTO
    if 'nivel_endeudamiento' in ratios_ultimo:
        endeud = ratios_ultimo['nivel_endeudamiento']
        endeud_bajo = umbrales['endeudamiento']['bajo']
        endeud_alto = umbrales['endeudamiento']['alto']
        
        if endeud < endeud_bajo:
            analisis.append({
                'tipo': 'positive',
                'titulo': '✅ Endeudamiento Conservador',
                'descripcion': f'El nivel de endeudamiento es del {endeud}%, por debajo del {endeud_bajo}% típico de {nombre_sector}.'
            })
        elif endeud < endeud_alto:
            analisis.append({
                'tipo': 'warning',
                'titulo': '⚠️ Endeudamiento Moderado',
                'descripcion': f'El nivel de endeudamiento es del {endeud}%, dentro del rango ({endeud_bajo}%-{endeud_alto}%) de {nombre_sector}.'
            })
        else:
            analisis.append({
                'tipo': 'negative',
                'titulo': '❌ Endeudamiento Alto',
                'descripcion': f'El nivel de endeudamiento es del {endeud}%, superando el {endeud_alto}% típico de {nombre_sector}.'
            })
    
    # Análisis de SOLVENCIA TOTAL
    if 'solvencia_total' in ratios_ultimo:
        solvencia = ratios_ultimo['solvencia_total']
        solv_bajo = umbrales['solvencia_total']['bajo']
        solv_alto = umbrales['solvencia_total']['alto']
        
        if solvencia < solv_bajo:
            analisis.append({
                'tipo': 'negative',
                'titulo': '❌ Solvencia Baja',
                'descripcion': f'La solvencia total es de {solvencia}, por debajo del {solv_bajo} esperado en {nombre_sector}.'
            })
        elif solvencia < solv_alto:
            analisis.append({
                'tipo': 'warning',
                'titulo': '⚠️ Solvencia Aceptable',
                'descripcion': f'La solvencia total es de {solvencia}, dentro del rango ({solv_bajo}-{solv_alto}) de {nombre_sector}.'
            })
        else:
            analisis.append({
                'tipo': 'positive',
                'titulo': '✅ Excelente Solvencia',
                'descripcion': f'La solvencia total es de {solvencia}, superando el {solv_alto} típico de {nombre_sector}.'
            })
    
    # Análisis de EBITDA/VENTAS
    if 'ebitda_ventas' in ratios_ultimo:
        ebitda_v = ratios_ultimo['ebitda_ventas']
        ebitda_bajo = umbrales['ebitda_ventas']['bajo']
        ebitda_alto = umbrales['ebitda_ventas']['alto']
        
        if ebitda_v < ebitda_bajo:
            analisis.append({
                'tipo': 'warning',
                'titulo': '⚠️ Margen Operativo Bajo',
                'descripcion': f'El margen EBITDA es del {ebitda_v}%, por debajo del {ebitda_bajo}% típico de {nombre_sector}.'
            })
        elif ebitda_v < ebitda_alto:
            analisis.append({
                'tipo': 'positive',
                'titulo': '📊 Margen Operativo Competitivo',
                'descripcion': f'El margen EBITDA es del {ebitda_v}%, dentro del rango ({ebitda_bajo}%-{ebitda_alto}%) de {nombre_sector}.'
            })
        else:
            analisis.append({
                'tipo': 'positive',
                'titulo': '✅ Margen Operativo Superior',
                'descripcion': f'El margen EBITDA es del {ebitda_v}%, superando el {ebitda_alto}% típico de {nombre_sector}.'
            })
    
    return analisis

def extraer_datos_balance_resultados(df, nombres_personalizados=None):
    """
    Extrae datos para gráficos
    """
    from app import obtener_años_y_offset, extraer_datos_automaticamente
    
    datos = {'balance': {}, 'resultados': {}}
    
    años, _, _ = obtener_años_y_offset(df)
    indices = extraer_datos_automaticamente(df, nombres_personalizados)
    
    try:
        for col_idx, año in enumerate(años, start=1):
            # Datos del Balance
            datos['balance'][str(año)] = {
                'total_activo': float(df.iloc[indices.get('total_activo'), col_idx]) if 'total_activo' in indices and pd.notna(df.iloc[indices.get('total_activo'), col_idx]) else None,
                'activo_corriente': float(df.iloc[indices.get('activo_corriente'), col_idx]) if 'activo_corriente' in indices and pd.notna(df.iloc[indices.get('activo_corriente'), col_idx]) else None,
                'activo_no_corriente': float(df.iloc[indices.get('activo_no_corriente'), col_idx]) if 'activo_no_corriente' in indices and pd.notna(df.iloc[indices.get('activo_no_corriente'), col_idx]) else None,
                'fondos_propios': float(df.iloc[indices.get('fondos_propios'), col_idx]) if 'fondos_propios' in indices and pd.notna(df.iloc[indices.get('fondos_propios'), col_idx]) else None,
                'pasivo_corriente': float(df.iloc[indices.get('pasivo_corriente'), col_idx]) if 'pasivo_corriente' in indices and pd.notna(df.iloc[indices.get('pasivo_corriente'), col_idx]) else None,
                'pasivo_no_corriente': float(df.iloc[indices.get('pasivo_no_corriente'), col_idx]) if 'pasivo_no_corriente' in indices and pd.notna(df.iloc[indices.get('pasivo_no_corriente'), col_idx]) else None,
            }
            
            # Datos de Cuenta de Resultados
            datos['resultados'][str(año)] = {
                'cifra_ventas': float(df.iloc[indices.get('cifra_ventas'), col_idx]) if 'cifra_ventas' in indices and pd.notna(df.iloc[indices.get('cifra_ventas'), col_idx]) else None,
                'ebitda': float(df.iloc[indices.get('ebitda'), col_idx]) if 'ebitda' in indices and pd.notna(df.iloc[indices.get('ebitda'), col_idx]) else None,
                'ebit': float(df.iloc[indices.get('ebit'), col_idx]) if 'ebit' in indices and pd.notna(df.iloc[indices.get('ebit'), col_idx]) else None,
                'resultado_ejercicio': float(df.iloc[indices.get('resultado_ejercicio'), col_idx]) if 'resultado_ejercicio' in indices and pd.notna(df.iloc[indices.get('resultado_ejercicio'), col_idx]) else None,
            }
    except Exception as e:
        print(f"Error extrayendo datos: {e}")
    
    return datos
