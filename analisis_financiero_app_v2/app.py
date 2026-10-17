from flask import Flask, render_template, request, jsonify, session
import pandas as pd
import numpy as np
import os
from werkzeug.utils import secure_filename
from datetime import datetime
import json

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max
app.secret_key = 'clave_secreta_analisis_financiero_2024'

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

ALLOWED_EXTENSIONS = {'xlsx', 'xls'}

# ============================================================================
# CONFIGURACIÓN DE COLORES
# ============================================================================

COLORES = {
    'principal': '#1e3c72',
    'secundario': '#2a5298',
    'terciario': '#3b6fc5',
    'cuaternario': '#4d7fd8',
    'quintario': '#5f92eb',
    'exito': '#10b981',
    'exito_claro': '#34d399',
    'advertencia': '#f59e0b',
    'advertencia_claro': '#fb923c',
    'peligro': '#ef4444',
    'info': '#3b82f6',
    'morado': '#8b5cf6',
}

PALETAS = {
    'azules': ['#1e3c72', '#2a5298', '#3b6fc5', '#4d7fd8', '#5f92eb'],
    'variada': ['#1e3c72', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'],
    'calor': ['#10b981', '#34d399', '#f59e0b', '#fb923c', '#ef4444'],
    'categorias_opex': ['#1e3c72', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6'],
}

# ============================================================================
# NOMBRES PREDETERMINADOS (Parametrizables)
# ============================================================================

NOMBRES_DEFAULT = {
    'activo_no_corriente': ['Activo no Corriente', 'Activo Fijo', 'ANC', 'Inmovilizado'],
    'activo_corriente': ['Activo Corriente', 'Activo Circulante', 'AC'],
    'total_activo': ['Total Activo', 'Activo Total', 'Total de Activo'],
    'fondos_propios': ['Fondos Propios', 'Patrimonio Neto', 'Patrimonio', 'FP'],
    'pasivo_no_corriente': ['Pasivo no Corriente', 'Pasivo Fijo', 'PNC', 'Pasivo a Largo Plazo'],
    'pasivo_corriente': ['Pasivo Corriente', 'Pasivo Circulante', 'PC', 'Pasivo a Corto Plazo'],
    'tesoreria': ['Tesorería', 'Caja', 'Efectivo', 'Tesoreria y Otros'],
    'cifra_ventas': ['Cifra de Ventas', 'Ventas', 'Importe Neto Cifra de Ventas', 'Ingresos'],
    'ebit': ['EBIT', 'BAIT', 'Resultado de Explotación', 'Resultado Explotación'],
    'ebitda': ['EBITDA'],
    'resultado_ejercicio': ['Resultado del Ejercicio', 'Resultado Neto', 'Beneficio Neto', 'BN'],
}

# ============================================================================
# UMBRALES POR SECTOR
# ============================================================================

UMBRALES_SECTORES = {
    'tecnologia': {
        'nombre': 'Tecnología',
        'roe': {'bajo': 15, 'alto': 25},
        'roa': {'bajo': 8, 'alto': 15},
        'endeudamiento': {'bajo': 30, 'alto': 50},
        'solvencia_total': {'bajo': 2.0, 'alto': 3.5},
        'solvencia_corriente': {'bajo': 1.5, 'alto': 2.5},
        'ebitda_ventas': {'bajo': 20, 'alto': 35},
        'ratio_madurez': {'bajo': 20, 'alto': 40},
        'runway_meses': {'bajo': 12, 'alto': 18},  # Startups tech
        'margen_contribucion': {'bajo': 70, 'alto': 85},
    },
    'retail': {
        'nombre': 'Retail',
        'roe': {'bajo': 10, 'alto': 18},
        'roa': {'bajo': 5, 'alto': 10},
        'endeudamiento': {'bajo': 40, 'alto': 65},
        'solvencia_total': {'bajo': 1.5, 'alto': 2.5},
        'solvencia_corriente': {'bajo': 1.2, 'alto': 2.0},
        'ebitda_ventas': {'bajo': 6, 'alto': 12},
        'ratio_madurez': {'bajo': 30, 'alto': 50},
        'runway_meses': {'bajo': 6, 'alto': 12},
        'margen_contribucion': {'bajo': 35, 'alto': 50},
    },
    'servicios': {
        'nombre': 'Servicios',
        'roe': {'bajo': 12, 'alto': 20},
        'roa': {'bajo': 7, 'alto': 13},
        'endeudamiento': {'bajo': 30, 'alto': 55},
        'solvencia_total': {'bajo': 1.8, 'alto': 3.0},
        'solvencia_corriente': {'bajo': 1.3, 'alto': 2.2},
        'ebitda_ventas': {'bajo': 12, 'alto': 22},
        'ratio_madurez': {'bajo': 15, 'alto': 35},
        'runway_meses': {'bajo': 9, 'alto': 15},
        'margen_contribucion': {'bajo': 60, 'alto': 75},
    },
    'otros': {
        'nombre': 'General',
        'roe': {'bajo': 10, 'alto': 15},
        'roa': {'bajo': 5, 'alto': 10},
        'endeudamiento': {'bajo': 40, 'alto': 60},
        'solvencia_total': {'bajo': 1.5, 'alto': 2.5},
        'solvencia_corriente': {'bajo': 1.0, 'alto': 2.0},
        'ebitda_ventas': {'bajo': 10, 'alto': 20},
        'ratio_madurez': {'bajo': 30, 'alto': 50},
        'runway_meses': {'bajo': 6, 'alto': 12},
        'margen_contribucion': {'bajo': 50, 'alto': 70},
    }
}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def safe_divide(numerator, denominator):
    """División segura"""
    try:
        if pd.isna(numerator) or pd.isna(denominator) or denominator == 0:
            return None
        return float(numerator) / float(denominator)
    except:
        return None

def convert_to_serializable(obj):
    """
    Convierte objetos numpy/pandas a tipos serializables en JSON
    """
    if isinstance(obj, dict):
        return {key: convert_to_serializable(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [convert_to_serializable(item) for item in obj]
    elif isinstance(obj, (np.integer, np.int64, np.int32)):
        return int(obj)
    elif isinstance(obj, (np.floating, np.float64, np.float32)):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif pd.isna(obj):
        return None
    else:
        return obj

# ============================================================================
# FUNCIONES DE BÚSQUEDA CON NOMBRES PERSONALIZADOS
# ============================================================================

def encontrar_fila_años(df):
    """Encuentra en qué fila están los años"""
    for row_idx in range(min(5, len(df))):
        años_encontrados = 0
        for col_idx in range(1, min(10, len(df.columns))):
            valor = df.iloc[row_idx, col_idx]
            if pd.notna(valor):
                try:
                    año = int(float(valor))
                    if 1900 <= año <= 2100:
                        años_encontrados += 1
                except:
                    pass
        if años_encontrados >= 3:
            return row_idx
    return 0

def obtener_años_y_offset(df):
    """Obtiene los años y el offset de datos"""
    fila_años = encontrar_fila_años(df)
    años = []
    
    for col_idx in range(1, len(df.columns)):
        valor = df.iloc[fila_años, col_idx]
        if pd.notna(valor):
            try:
                año = int(float(valor))
                if 1900 <= año <= 2100:
                    años.append(año)
                else:
                    break
            except:
                if str(valor).startswith('Unnamed'):
                    continue
                else:
                    break
    
    fila_inicio_datos = fila_años + 1
    return años, fila_años, fila_inicio_datos

def encontrar_fila_por_nombre(df, concepto_clave, nombres_personalizados=None, fila_inicio=0):
    """
    Busca una fila usando nombres personalizados o predeterminados
    """
    # Usar nombres personalizados si están disponibles
    if nombres_personalizados and concepto_clave in nombres_personalizados:
        variantes = [nombres_personalizados[concepto_clave]]
    else:
        variantes = NOMBRES_DEFAULT.get(concepto_clave, [])
    
    for idx in range(fila_inicio, len(df)):
        cell_value = str(df.iloc[idx, 0]).lower().strip() if pd.notna(df.iloc[idx, 0]) else ""
        
        if not cell_value:
            continue
        
        for variante in variantes:
            if variante.lower() in cell_value:
                return idx
    
    return None

def extraer_datos_automaticamente(df, nombres_personalizados=None):
    """Extrae datos usando nombres personalizados"""
    _, _, fila_inicio = obtener_años_y_offset(df)
    
    datos_extraidos = {}
    conceptos_necesarios = [
        'activo_no_corriente', 'activo_corriente', 'tesoreria', 'total_activo',
        'fondos_propios', 'pasivo_no_corriente', 'pasivo_corriente',
        'cifra_ventas', 'ebit', 'ebitda', 'resultado_ejercicio'
    ]
    
    for concepto in conceptos_necesarios:
        fila_idx = encontrar_fila_por_nombre(df, concepto, nombres_personalizados, fila_inicio)
        if fila_idx is not None:
            datos_extraidos[concepto] = fila_idx
    
    return datos_extraidos

# ============================================================================
# IMPORTAR FUNCIONES DE CÁLCULO (se crearán en archivos separados)
# ============================================================================

# Por ahora, las funciones estarán aquí
# Luego se pueden mover a módulos separados para mejor organización

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/ratios')
def ratios():
    return render_template('ratios.html')

@app.route('/pilares')
def pilares():
    return render_template('pilares.html')

@app.route('/glosario')
def glosario():
    return render_template('glosario.html')

@app.route('/glosario-pilares')
def glosario_pilares():
    return render_template('glosario_pilares.html')

@app.route('/api/configurar-nombres', methods=['GET'])
def get_configuracion_nombres():
    """Devuelve la configuración de nombres actual"""
    return jsonify({
        'nombres_default': NOMBRES_DEFAULT,
        'nombres_usuario': session.get('nombres_personalizados', {})
    })

@app.route('/api/guardar-nombres', methods=['POST'])
def guardar_nombres():
    """Guarda la configuración personalizada de nombres"""
    nombres = request.json.get('nombres', {})
    session['nombres_personalizados'] = nombres
    return jsonify({'success': True, 'mensaje': 'Nombres guardados correctamente'})

@app.route('/upload-ratios', methods=['POST'])
def upload_ratios():
    """Procesa Excel para análisis de ratios tradicionales"""
    if 'file' not in request.files:
        return jsonify({'error': 'No se encontró archivo'}), 400
    
    file = request.files['file']
    sector = request.form.get('sector', 'otros')
    
    if file.filename == '':
        return jsonify({'error': 'No se seleccionó archivo'}), 400
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        try:
            # Leer Excel
            df = pd.read_excel(filepath, sheet_name=0, engine='openpyxl', header=None)
            
            print(f"📊 Procesando ratios para sector: {sector}")
            
            # Obtener nombres personalizados
            nombres_personalizados = session.get('nombres_personalizados', None)
            
            # Importar funciones
            from calculos_ratios import calcular_ratios_tradicionales, analizar_ratios, extraer_datos_balance_resultados
            
            # Calcular ratios
            ratios = calcular_ratios_tradicionales(df, nombres_personalizados)
            
            # Generar análisis
            analisis = analizar_ratios(ratios, sector)
            
            # Extraer datos para gráficos
            datos = extraer_datos_balance_resultados(df, nombres_personalizados)
            
            # Convertir todo a tipos serializables
            ratios = convert_to_serializable(ratios)
            datos = convert_to_serializable(datos)
            
            return jsonify({
                'success': True,
                'ratios': ratios,
                'analisis': analisis,
                'datos': datos,
                'sector': sector,
                'colores': COLORES,
                'paletas': PALETAS
            })
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            return jsonify({'error': f'Error al procesar el archivo: {str(e)}'}), 500
    
    return jsonify({'error': 'Tipo de archivo no permitido'}), 400

@app.route('/upload-pilares', methods=['POST'])
def upload_pilares():
    """Procesa Excel para análisis de 4 pilares"""
    if 'file' not in request.files:
        return jsonify({'error': 'No se encontró archivo'}), 400
    
    file = request.files['file']
    sector = request.form.get('sector', 'otros')
    
    if file.filename == '':
        return jsonify({'error': 'No se seleccionó archivo'}), 400
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        try:
            # Leer Excel - intentar encontrar la hoja con datos de transacciones
            xl_file = pd.ExcelFile(filepath, engine='openpyxl')
            
            # Intentar diferentes nombres de hoja
            posibles_hojas = ['Hoja2', 'Transacciones', 'Datos', 'Sheet2']
            hoja_encontrada = None
            
            for hoja in posibles_hojas:
                if hoja in xl_file.sheet_names:
                    hoja_encontrada = hoja
                    break
            
            # Si no encontramos ninguna, usar la primera hoja que no sea Hoja1
            if not hoja_encontrada:
                for hoja in xl_file.sheet_names:
                    if hoja != 'Hoja1':
                        hoja_encontrada = hoja
                        break
            
            # Si aún no hay, usar la primera hoja disponible
            if not hoja_encontrada:
                hoja_encontrada = xl_file.sheet_names[0] if xl_file.sheet_names else None
            
            if not hoja_encontrada:
                return jsonify({'error': 'No se encontró ninguna hoja válida en el Excel'}), 400
            
            print(f"📊 Usando hoja: '{hoja_encontrada}'")
            
            # Leer la hoja
            df_transacciones = pd.read_excel(filepath, sheet_name=hoja_encontrada, engine='openpyxl')
            
            print(f"   Transacciones encontradas: {len(df_transacciones)}")
            print(f"   Columnas: {list(df_transacciones.columns)}")
            
            # Verificar columnas necesarias
            columnas_requeridas = ['Fecha', 'Tipo', 'Importe']
            columnas_faltantes = [col for col in columnas_requeridas if col not in df_transacciones.columns]
            
            if columnas_faltantes:
                return jsonify({
                    'error': f'Columnas faltantes en el Excel: {", ".join(columnas_faltantes)}. Se requieren al menos: Fecha, Tipo, Importe'
                }), 400
            
            # Importar funciones
            from calculos_pilares import calcular_4_pilares
            
            # Calcular los 4 pilares
            pilares = calcular_4_pilares(df_transacciones)
            
            # Convertir a tipos serializables
            pilares = convert_to_serializable(pilares)
            
            # Agregar umbrales del sector
            umbrales = UMBRALES_SECTORES.get(sector, UMBRALES_SECTORES['otros'])
            
            return jsonify({
                'success': True,
                'pilares': pilares,
                'sector': sector,
                'umbrales': umbrales,
                'colores': COLORES,
                'paletas': PALETAS,
                'hoja_usada': hoja_encontrada
            })
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            return jsonify({'error': f'Error al procesar el archivo: {str(e)}'}), 500
    
    return jsonify({'error': 'Tipo de archivo no permitido'}), 400

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5002)
