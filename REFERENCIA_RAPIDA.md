# ⚡ Referencia Rápida - Estructura del ERP Frontend

## 🎯 Ubicación Rápida de Componentes

### Necesito... → Voy a...

#### 🔐 Autenticación
- Página de login → `src/components/modules/Auth/Login.vue`
- Página de registro → `src/components/modules/Auth/Register.vue`

#### 🏠 Dashboard
- Panel principal → `src/components/modules/Dashboard/Dashboard.vue`

#### 👥 Gestión
- Usuarios → `src/components/modules/Gestion/Usuarios.vue`
- Clientes → `src/components/modules/Gestion/Clientes.vue`
- Proveedores → `src/components/modules/Gestion/Proveedores.vue`

#### 🎧 Soporte
- Clientes de soporte → `src/components/modules/Soporte/Clientes.vue`
- Tickets → `src/components/modules/Soporte/Tickets.vue`
- SLAs → `src/components/modules/Soporte/SLAs.vue`
- Roles → `src/components/modules/Soporte/Roles.vue`
- Encuestas → `src/components/modules/Soporte/Encuestas.vue`

#### 👨‍💼 RRHH
- Empleados → `src/components/modules/RRHH/Empleados.vue`
- Nómina → `src/components/modules/RRHH/Nomina.vue`
- Beneficios y Deducciones → `src/components/modules/RRHH/BeneficiosDeducciones.vue`
- Ausencias → `src/components/modules/RRHH/Ausencias.vue`

#### 💼 Contabilidad
- Contabilidad → `src/components/modules/Contabilidad/Contabilidad.vue`

#### 📦 Inventario
- Categorías → `src/components/modules/InventarioYActivos/Categorias.vue`
- Productos → `src/components/modules/InventarioYActivos/Productos.vue`
- Movimientos → `src/components/modules/InventarioYActivos/MovimientosInventario.vue`
- Activos Fijos → `src/components/modules/InventarioYActivos/ActivosFijos.vue`

#### ⚙️ Configuración
- Configuración → `src/components/modules/Configuracion/Configuracion.vue`

---

## 🔧 Tareas Rápidas

### Agregar un nuevo componente

```bash
# 1. Crear carpeta (si no existe)
mkdir src/components/modules/MiModulo

# 2. Crear archivo
touch src/components/modules/MiModulo/MiComponente.vue

# 3. Copiar plantilla básica (ver GUIA_MANTENIMIENTO.md)

# 4. Importar en App.vue
import MiComponente from './components/modules/MiModulo/MiComponente.vue'

# 5. Agregar ruta
<MiComponente v-if="currentView === 'mi-vista'" @back-to-dashboard="..." />
```

### Encontrar dónde se importa un componente

```bash
# Buscar en App.vue
grep -n "NombreComponente" src/App.vue
```

### Ver estructura de carpetas

```bash
# Linux/Mac
tree src/components/modules/

# Windows PowerShell
Get-ChildItem -Recurse src/components/modules/
```

---

## 📚 Documentación Rápida

| Necesito... | Archivo |
|------------|---------|
| Ver estructura visual | `ESTRUCTURA_VISUAL.md` |
| Índice de componentes | `COMPONENTES_INDICE.md` |
| Cómo mantener estándares | `GUIA_MANTENIMIENTO.md` |
| Resumen de cambios | `RESUMEN_REORGANIZACION.md` |
| Explicación de estructura | `ESTRUCTURA_MODULAR.md` |
| Mapa completo | `MAPA_COMPLETO.md` |

---

## 🎨 Estándares Rápidos

### Nombres de Carpetas
```
✅ SiguienteModulo
❌ siguiente_modulo
❌ SiguientemodULO
```

### Nombres de Archivos
```
✅ MiComponente.vue
❌ mi-componente.vue
❌ micomponente.vue
```

### Variables
```javascript
✅ const miVariable = ref('')
❌ const My_Variable = ref('')
❌ const MIVARIABLE = ref('')
```

### Constantes
```javascript
✅ const API_URL = 'http://...'
❌ const apiUrl = 'http://...'
❌ const apiURL = 'http://...'
```

---

## 🚀 Comandos Útiles

### Instalar dependencias
```bash
cd Frontend
npm install
```

### Ejecutar en desarrollo
```bash
npm run dev
```

### Compilar para producción
```bash
npm run build
```

### Ver estructura
```bash
# Visual tree
ls -la src/components/modules/

# Expandido
find src/components/modules -type f -name "*.vue" | sort
```

---

## ❓ Preguntas Frecuentes

### ¿Dónde está el componente X?
→ Ver tabla "Ubicación Rápida de Componentes"

### ¿Cómo editar un componente?
→ Abrir archivo en editor y editar (está en `src/components/modules/...`)

### ¿Cómo agregar un nuevo componente?
→ Ver sección "Agregar un nuevo componente"

### ¿Cómo sé si un componente está completo?
→ Ver `COMPONENTES_INDICE.md` (✅ = implementado, 🔄 = en desarrollo)

### ¿Dónde está la lógica de navegación?
→ `src/App.vue` en el script setup

### ¿Cómo cambio el comportamiento de un componente?
→ Editar el archivo Vue correspondiente en `src/components/modules/...`

---

## 📊 Estado Actual

```
✅ Auth:              2/2 componentes (100%)
✅ Dashboard:         1/1 componentes (100%)
🔄 Gestion:          1/3 componentes (33%)
✅ Soporte:          5/5 componentes (100%)
🔄 RRHH:             3/4 componentes (75%)
✅ Contabilidad:     1/1 componentes (100%)
🔄 Inventario:       0/4 componentes (0%)
🔄 Configuracion:    0/1 componentes (0%)

Total: 13/21 (62% implementado)
```

---

## 🔗 Archivos Clave

- `src/App.vue` - Navegación principal
- `src/main.js` - Punto de entrada
- `src/components/modules/...` - Todos los componentes

---

**Última actualización**: 4 de febrero de 2026
**Versión**: 1.0
