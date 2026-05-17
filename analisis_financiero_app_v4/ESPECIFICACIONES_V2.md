# 📊 Análisis Financiero App - Versión 2.0
## Especificaciones Técnicas

### 🎯 Nuevas Funcionalidades

## 1. NOMBRES PARAMETRIZABLES

### Funcionalidad:
- Botón "⚙️ Configurar Nombres" en la interfaz
- Modal donde el usuario puede personalizar los nombres de conceptos
- Ejemplos:
  - "Activo no Corriente" → "ANC" o "Activo Fijo"
  - "Fondos Propios" → "Patrimonio" o "FP"
  - "EBITDA" → "EBITDA" o "Resultado Operativo"

### Implementación:
```javascript
// El usuario configura:
{
  "activo_no_corriente": "ANC",
  "activo_corriente": "AC",
  "fondos_propios": "Patrimonio",
  ...
}
```

### Persistencia:
- Se guarda en sessionStorage del navegador
- La app busca usando estos nombres personalizados
- Plantilla sugerida disponible para descargar

---

## 2. COLORES DIFERENCIADOS EN GRÁFICOS

### Paletas de Colores:

**Azules (Predeterminado):**
- #1e3c72 (Azul Oscuro)
- #2a5298 (Azul Medio)
- #3b6fc5 (Azul Claro)
- #4d7fd8 (Azul Más Claro)
- #5f92eb (Azul Muy Claro)

**Variada (Multicolor):**
- #1e3c72 (Azul)
- #10b981 (Verde)
- #f59e0b (Naranja)
- #ef4444 (Rojo)
- #8b5cf6 (Morado)

**Calor (Semáforo):**
- #10b981 (Verde - Bueno)
- #34d399 (Verde Claro)
- #f59e0b (Naranja - Advertencia)
- #fb923c (Naranja Oscuro)
- #ef4444 (Rojo - Peligro)

### Aplicación por Gráfico:
- **ROA/ROE**: Paleta Azules
- **Endeudamiento**: Paleta Calor (según nivel)
- **Ingresos/Costos**: Paleta Variada
- **OpEx**: Paleta Variada (por categoría)

---

## 3. NUEVA PESTAÑA: 4 PILARES STARTUPS

### Estructura de Datos (Hoja2 del Excel):

**Columnas necesarias:**
- Fecha
- Concepto
- Tipo (I=Ingreso, G=Gasto, B=Balance)
- Categoría
- Subcategoría
- Importe
- Recurrencia
- CANAL
- COMISIÓN
- COMISION EUR

---

## 4. PILAR 1: CASH MANAGEMENT 💰

### Métricas:

#### **Runway (Meses de Vida)**
```
Fórmula: Caja Actual / Burn Rate Mensual
```

**Visualización:**
- Indicador grande con número de meses
- Barra de progreso con colores:
  - Verde: > 12 meses
  - Naranja: 6-12 meses
  - Rojo: < 6 meses

#### **Burn Rate**
```
Fórmula: (Total Gastos - Total Ingresos) / Número de Meses
```

**Visualización:**
- Gráfico de línea mensual
- Proyección a 6 meses
- Tendencia (↑ aumentando, ↓ disminuyendo, → estable)

#### **Caja Actual**
```
Fórmula: Balance inicial + Σ(Ingresos) - Σ(Gastos)
```

**Visualización:**
- Número grande destacado
- Gráfico de cascada mostrando movimientos

---

## 5. PILAR 2: EFICIENCIA 📈

### Métricas:

#### **Margen de Contribución**
```
Fórmula: (Ingreso por Venta - Costos Variables) / Ingreso por Venta × 100

Donde:
- Costos Variables = Comisiones + CAC
- CAC = Gastos Marketing / Nuevos Clientes
```

**Visualización:**
- Porcentaje destacado
- Comparación con objetivo (>70% bueno)
- Gráfico de barras por producto/canal

#### **ROI por Canal**
```
Fórmula: (Ingresos Canal - Costos Canal) / Costos Canal × 100
```

**Visualización:**
- Tabla con ROI por canal
- Gráfico de barras horizontal
- Colores: Verde (>100%), Naranja (0-100%), Rojo (<0%)

---

## 6. PILAR 3: CRECIMIENTO 🚀

### Métricas:

#### **MoM Growth (Month over Month)**
```
Fórmula: ((Ingresos Mes Actual - Ingresos Mes Anterior) / Ingresos Mes Anterior) × 100
```

**Visualización:**
- Gráfico de línea con tendencia
- Porcentaje del último mes destacado
- Objetivo de crecimiento vs. real

#### **Ventas por Sector**
```
Desglose: Energía, Alarmas, Teleco
```

**Visualización:**
- Gráfico de pastel
- Tabla con valores absolutos y %

---

## 7. PILAR 4: OpEx 💼

### Métricas:

#### **Gastos por Categoría**
```
Categorías: Personal, Marketing, Software, Oficina, Otros
```

**Visualización:**
- Gráfico de pastel dinámico
- Filtros interactivos por categoría
- Tabla detallada con subcategorías

#### **Tendencia de Gastos**
```
Evolución mensual por categoría
```

**Visualización:**
- Gráfico de área apilada
- Líneas por categoría principal

---

## 8. DASHBOARD 4 PILARES

### Layout:

```
+------------------------+------------------------+
|   CASH MANAGEMENT      |     EFICIENCIA        |
|                        |                        |
|  Runway: 8 meses       |  Margen Contrib: 65%  |
|  Burn Rate: €12K/mes   |  ROI por Canal        |
|  Caja: €95K            |                        |
+------------------------+------------------------+
|   CRECIMIENTO          |      OpEx             |
|                        |                        |
|  MoM Growth: +15%      |  Gastos por Categoría |
|  Proyección Ventas     |  - Personal: 45%      |
|                        |  - Marketing: 30%     |
+------------------------+------------------------+
```

---

## 9. FLUJO DE TRABAJO

### Paso 1: Subir Excel
- Usuario sube Excel con datos de transacciones (Hoja2)
- Selector de sector (igual que antes)

### Paso 2: Configurar Nombres (Opcional)
- Click en "⚙️ Configurar Nombres"
- Personalizar nombres de conceptos
- O usar plantilla sugerida

### Paso 3: Ver Dashboards
- **Pestaña 1**: Análisis Tradicional (ratios financieros)
- **Pestaña 2**: 4 Pilares Startups (nuevo)

### Paso 4: Análisis
- Gráficos interactivos
- Filtros por fecha, categoría, canal
- Exportar reportes

---

## 10. ESTRUCTURA DE ARCHIVOS

```
analisis_financiero_app_v2/
├── app.py                     # Flask app con 2 modos
├── calculos_ratios.py        # Ratios tradicionales
├── calculos_pilares.py       # Cálculos 4 pilares (nuevo)
├── templates/
│   ├── index.html           # Landing con selector
│   ├── ratios.html          # Dashboard tradicional
│   └── pilares.html         # Dashboard 4 pilares (nuevo)
├── static/
│   ├── css/
│   │   └── style.css        # Estilos unificados
│   └── js/
│       ├── ratios.js        # JS dashboard tradicional
│       └── pilares.js       # JS dashboard 4 pilares (nuevo)
└── uploads/
```

---

## 11. APIS NUEVAS

### GET /api/configurar-nombres
Devuelve nombres configurables

### POST /api/guardar-nombres
Guarda configuración de nombres

### POST /api/calcular-pilares
Procesa Excel y calcula 4 pilares

### GET /api/proyeccion
Genera proyección de runway

---

## 12. PRÓXIMOS PASOS

1. ✅ Crear estructura de proyecto
2. ⏳ Implementar cálculos de 4 pilares
3. ⏳ Crear interfaz con 2 pestañas
4. ⏳ Implementar nombres parametrizables
5. ⏳ Aplicar colores diferenciados
6. ⏳ Testing con Excel proporcionado
7. ⏳ Documentación de uso

---

## ¿Procedo con la implementación completa?

Esta es una actualización grande. Te recomiendo que lo confirmes antes de proceder, o puedo:
- Implementarlo por partes (primero nombres parametrizables, luego 4 pilares)
- Hacerlo todo de una vez
- Priorizar alguna funcionalidad específica

¿Cómo prefieres que proceda?
