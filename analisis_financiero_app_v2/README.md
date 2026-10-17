# 📊 Análisis Financiero v2.0 - VERSIÓN COMPLETA

## ✅ IMPLEMENTACIÓN COMPLETADA

Todas las funcionalidades solicitadas han sido implementadas:

### 1. ✅ Nombres Parametrizables
- Modal de configuración accesible desde el botón "⚙️ Configurar Nombres"
- El usuario puede personalizar los nombres de conceptos
- Ejemplo: "Activo no Corriente" → "ANC"
- Los cambios se guardan en sesión y aplican al siguiente upload

### 2. ✅ Colores Diferenciados
- **3 Paletas de colores:**
  - Azules: Para ratios de rentabilidad
  - Variada: Para composiciones y múltiples series
  - Calor: Para niveles de alerta (verde, naranja, rojo)

### 3. ✅ Nueva Pestaña: 4 Pilares Startups
- **💰 Cash Management:** Runway, Burn Rate, Proyección de Caja
- **📈 Eficiencia:** Margen de Contribución, ROI por Canal
- **🚀 Crecimiento:** MoM Growth, Ventas por Sector
- **💼 OpEx:** Gastos por Categoría, Tendencias

---

## 📁 Estructura del Proyecto

```
analisis_financiero_app_v2/
├── app.py                      # Backend Flask completo
├── calculos_ratios.py          # Cálculos de 11 ratios tradicionales
├── calculos_pilares.py         # Cálculos de 4 pilares
├── requirements.txt            # Dependencias
├── templates/
│   ├── index.html             # Selector de modo
│   ├── ratios.html            # Dashboard ratios tradicionales
│   └── pilares.html           # Dashboard 4 pilares
├── static/
│   ├── css/
│   │   └── style.css          # Estilos unificados
│   └── js/
│       ├── ratios.js          # Lógica dashboard ratios
│       └── pilares.js         # Lógica dashboard pilares
└── uploads/                    # Directorio temporal archivos
```

---

## 🚀 Instalación y Ejecución

### 1. Instalar Dependencias

```bash
cd analisis_financiero_app_v2
pip install -r requirements.txt
```

### 2. Ejecutar la Aplicación

```bash
python app.py
```

### 3. Abrir en el Navegador

```
http://localhost:5002
```

---

## 📖 Guía de Uso

### MODO 1: RATIOS FINANCIEROS

**Paso 1:** Desde la página principal, click en "Acceder a Ratios"

**Paso 2:** Selecciona el sector de tu empresa:
- 💻 Tecnología
- 🛒 Retail
- 🤝 Servicios
- 📊 Otros

**Paso 3 (Opcional):** Click en "⚙️ Configurar Nombres"
- Personaliza los nombres que la app buscará en tu Excel
- Ejemplo: Cambiar "Activo no Corriente" por "ANC"
- Guardar configuración

**Paso 4:** Sube tu Excel con Balance y Cuenta de Resultados
- La app reconoce automáticamente los datos por nombre
- No importa el orden de las filas
- Debe tener al menos: Activos, Pasivos, Fondos Propios, Ventas, EBIT, EBITDA, Resultado

**Paso 5:** Ver Dashboard
- 6 KPIs principales
- 6 gráficos interactivos con colores diferenciados
- Tabla completa de ratios
- Análisis ajustado por sector

---

### MODO 2: 4 PILARES STARTUPS

**Paso 1:** Desde la página principal, click en "Acceder a Pilares"

**Paso 2:** Selecciona el sector

**Paso 3:** Sube tu Excel con transacciones (Hoja2)

**Columnas requeridas:**
- Fecha
- Concepto
- Tipo (I=Ingreso, G=Gasto, B=Balance)
- Categoría
- Importe
- CANAL (opcional)
- COMISIÓN (opcional)

**Paso 4:** Ver Dashboard 4 Pilares

**Grid 2×2 con:**

1. **💰 Cash Management**
   - Runway (meses de vida)
   - Burn Rate mensual
   - Caja actual
   - Proyección 12 meses

2. **📈 Eficiencia**
   - Margen de Contribución
   - CAC (Costo Adquisición Cliente)
   - ROI por Canal

3. **🚀 Crecimiento**
   - MoM Growth (crecimiento mes a mes)
   - Tendencia
   - Evolución de ventas

4. **💼 OpEx**
   - Gastos por categoría
   - Promedio mensual
   - Evolución temporal

**Paso 5:** Revisar Alertas
- Alertas de runway crítico
- Recomendaciones de margen
- Análisis de tendencias

---

## 🎨 Paletas de Colores

### Azules (Rentabilidad)
- #1e3c72 - Azul Oscuro
- #2a5298 - Azul Medio
- #3b6fc5 - Azul Claro
- #4d7fd8 - Azul Muy Claro
- #5f92eb - Azul Ultra Claro

### Variada (Composiciones)
- #1e3c72 - Azul
- #10b981 - Verde
- #f59e0b - Naranja
- #ef4444 - Rojo
- #8b5cf6 - Morado

### Calor (Alertas)
- #10b981 - Verde (Bueno)
- #34d399 - Verde Claro
- #f59e0b - Naranja (Advertencia)
- #fb923c - Naranja Oscuro
- #ef4444 - Rojo (Peligro)

---

## 📊 Ratios Calculados (Modo Tradicional)

1. **Nivel de Endeudamiento** = (Pasivo NC + Pasivo C) / (FP + Pasivo NC + Pasivo C) × 100
2. **Ratio Endeudamiento Total** = (Pasivo NC + Pasivo C) / FP × 100
3. **Solvencia Total** = Total Activo / (Pasivo NC + Pasivo C)
4. **Ratio de Madurez** = Activo NC / Total Activo × 100
5. **ROA** = EBIT / Total Activo × 100
6. **ROE** = Resultado Ejercicio / FP × 100
7. **Solvencia Corriente** = Activo C / Pasivo C
8. **Disponibilidad Inmediata** = Tesorería / Pasivo C
9. **EBITDA/Ventas** = EBITDA / Ventas × 100
10. **BAIT/Ventas** = EBIT / Ventas × 100
11. **Resultado/Ventas** = Resultado Ejercicio / Ventas × 100

---

## 📈 Métricas de 4 Pilares

### Cash Management
```
Runway = Caja Actual / Burn Rate Mensual
Burn Rate = (Total Gastos - Total Ingresos) / Meses
Caja Actual = Balance Inicial + Σ Ingresos - Σ Gastos
```

### Eficiencia
```
Margen Contribución = (Ingreso - Costos Variables) / Ingreso × 100
Costos Variables = Comisiones + CAC
CAC = Gastos Marketing / Nuevos Clientes
ROI Canal = (Ingresos Canal - Gastos Canal) / Gastos Canal × 100
```

### Crecimiento
```
MoM Growth = ((Ventas Mes N - Ventas Mes N-1) / Ventas Mes N-1) × 100
```

### OpEx
```
Total por Categoría: Personal, Marketing, Software, Oficina, Otros
Promedio Mensual = Total Gastos / Número de Meses
```

---

## ⚙️ Configuración Avanzada

### Personalizar Nombres de Conceptos

1. Click en "⚙️ Configurar Nombres"
2. Modificar los nombres en el formulario
3. Guardar
4. Recargar el Excel para aplicar cambios

**Ejemplo:**
```
Activo no Corriente → ANC
Fondos Propios → Patrimonio
EBITDA → EBITDA
```

La aplicación buscará estos nombres exactos en tu Excel.

---

## 🔧 Solución de Problemas

### El análisis no aparece
- Verifica que tu Excel tenga todos los conceptos necesarios
- Revisa que los años estén en una fila (números entre 1900-2100)
- Confirma que los datos empiecen después de la fila de años

### No encuentra un concepto
- Usa "⚙️ Configurar Nombres" para especificar el nombre exacto
- Asegúrate de que el nombre en el Excel coincida
- Verifica que no haya espacios extra o caracteres especiales

### Los gráficos no se muestran
- Verifica que ApexCharts esté cargando (requiere internet)
- Abre la consola del navegador (F12) para ver errores
- Recarga la página

### Modo 4 Pilares no funciona
- Verifica que el Excel tenga una hoja llamada "Hoja2"
- Confirma que las columnas necesarias existen:
  * Fecha (formato fecha)
  * Tipo (I, G, o B)
  * Importe (número)
  * Categoría (texto)

---

## 📝 Archivos de Ejemplo

### Excel para Ratios (Hoja 1)
```
                  | 2024    | 2023    | 2022
Activo Corriente  | 100000  | 90000   | 80000
Activo no Corriente| 50000  | 45000   | 40000
Total Activo      | 150000  | 135000  | 120000
Fondos Propios    | 80000   | 70000   | 60000
...
```

### Excel para 4 Pilares (Hoja2)
```
Fecha       | Concepto    | Tipo | Importe | Categoría
2026-01-01  | Caja inicial| B    | 100000  | Balance
2026-01-15  | Sueldo Dev  | G    | -3000   | Personal
2026-01-16  | Venta       | I    | 60      | Energía
...
```

---

## 🎯 Casos de Uso

### Caso 1: Empresa Establecida
- Usa **Modo Ratios**
- Sube Balance + P&L histórico
- Obtén análisis de solvencia, rentabilidad y endeudamiento
- Compara con benchmarks del sector

### Caso 2: Startup en Crecimiento
- Usa **Modo 4 Pilares**
- Sube transacciones mensuales
- Monitorea Runway y Burn Rate
- Optimiza ROI por canal
- Analiza estructura de OpEx

### Caso 3: Análisis Dual
- Usa **ambos modos**
- Ratios para análisis financiero formal
- 4 Pilares para operaciones día a día

---

## 🚀 Próximas Mejoras Sugeridas

1. Exportar reportes PDF
2. Comparación con competidores
3. Proyecciones a 5 años
4. Integración con APIs contables
5. Dashboard en tiempo real
6. Alertas automáticas por email

---

## 📞 Soporte

Si encuentras problemas:
1. Revisa esta guía completa
2. Verifica la consola del navegador (F12)
3. Comprueba que el formato del Excel coincida con los ejemplos

---

## 🎉 ¡Listo para Usar!

La aplicación está **100% funcional** con todas las características solicitadas:
- ✅ Nombres parametrizables
- ✅ Colores diferenciados
- ✅ 4 Pilares completos
- ✅ Análisis por sector
- ✅ Gráficos interactivos
- ✅ 2 modos de análisis

**¡Ejecuta `python app.py` y empieza a analizar!** 📊
