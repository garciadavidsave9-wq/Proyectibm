# Mapeo de Base de Datos con Frontend

## 📊 Tablas de la Base de Datos y sus Componentes

### ✅ Módulo: Soporte

| Tabla BD | Componente Frontend | Ruta API | Estado |
|----------|-------------------|----------|---------|
| `usuarios` | `Gestion/Usuarios.vue` | `/api/soporte/usuarios` | ✅ Conectado |
| `clientes` | `Gestion/Clientes.vue` | `/api/soporte/clientes` | ✅ Conectado |
| `clientes` | `Soporte/Clientes.vue` | `/api/soporte/clientes` | ✅ Conectado |
| `tickets` | `Soporte/Tickets.vue` | `/api/soporte/tickets` | ✅ Conectado |
| `slas` | `Soporte/SLAs.vue` | `/api/soporte/slas` | ✅ Conectado |
| `roles` | `Soporte/Roles.vue` | `/api/soporte/roles` | ✅ Conectado |
| `encuestas` | `Soporte/Encuestas.vue` | `/api/soporte/encuestas` | ✅ Conectado |
| `categorias_tickets` | `Soporte/Tickets.vue` | `/api/soporte/categorias` | ⚠️ Parcial |
| `subcategorias_tickets` | `Soporte/Tickets.vue` | `/api/soporte/subcategorias` | ⚠️ Parcial |
| `estados_tickets` | `Soporte/Tickets.vue` | `/api/soporte/estados` | ⚠️ Parcial |
| `tecnicos` | `Soporte/Tickets.vue` | `/api/soporte/tecnicos` | ⚠️ Parcial |
| `comentarios_tickets` | - | `/api/soporte/tickets/:id/comentarios` | ✅ API existe |
| `adjuntos_tickets` | - | `/api/soporte/tickets/:id/adjuntos` | ✅ API existe |
| `historial_tickets` | - | - | ❌ Sin endpoint |
| `llamadas` | - | - | ❌ Sin endpoint |
| `areas_soporte` | - | - | ❌ Sin endpoint |

### ✅ Módulo: RRHH

| Tabla BD | Componente Frontend | Ruta API | Estado |
|----------|-------------------|----------|---------|
| `empleados_rrhh` | `RRHH/Empleados.vue` | `/api/rrhh/empleados` | ✅ Conectado |
| `planilla` | `RRHH/Nomina.vue` | `/api/rrhh/planilla` | ✅ Conectado |
| `asistencia` | - | `/api/rrhh/asistencia` | ✅ API existe |
| `ausencias` | `RRHH/Ausencias.vue` | `/api/rrhh/ausencias` | ✅ Conectado |
| `descuentos_rrhh` | `RRHH/BeneficiosDeducciones.vue` | `/api/rrhh/descuentos` | ✅ Conectado |

### ✅ Módulo: Contabilidad

| Tabla BD | Componente Frontend | Ruta API | Estado |
|----------|-------------------|----------|---------|
| `cuentas_contables` | `Contabilidad/Contabilidad.vue` | `/api/contabilidad/cuentas` | ✅ Conectado |
| `asientos_contables` | `Contabilidad/Contabilidad.vue` | `/api/contabilidad/asientos` | ✅ Conectado |
| `movimientos_contables` | `Contabilidad/Contabilidad.vue` | `/api/contabilidad/movimientos` | ✅ Conectado |

### ❌ Módulo: Gestión (Proveedores)

| Componente Frontend | Tabla BD | Estado |
|-------------------|----------|---------|
| `Gestion/Proveedores.vue` | ❌ No existe tabla | ⚠️ Usando tabla `clientes` temporalmente |

### ⚠️ Módulo: Configuración

| Componente Frontend | Ruta API | Estado |
|-------------------|----------|---------|
| `Configuracion/Configuracion.vue` | `/api/configuracion/general` | ❌ API no existe |
| `Configuracion/Configuracion.vue` | `/api/configuracion/sistema` | ❌ API no existe |
| `Configuracion/Configuracion.vue` | `/api/configuracion/usuarios` | ❌ API no existe |

**Nota**: El módulo de Configuración no tiene rutas API ni tablas en la BD. Requiere implementación completa.

### ❌ Módulo: Inventario y Activos (ELIMINADO)

| Componente Frontend | Estado |
|-------------------|---------|
| `InventarioYActivos/Categorias.vue` | ❌ Desconectado (no hay tabla) |
| `InventarioYActivos/Productos.vue` | ❌ Desconectado (no hay tabla) |
| `InventarioYActivos/MovimientosInventario.vue` | ❌ Desconectado (no hay tabla) |
| `InventarioYActivos/ActivosFijos.vue` | ❌ Desconectado (no hay tabla) |
| `InventarioYActivos/InventarioLegacy.vue` | ❌ Desconectado (no hay tabla) |

---

## 🔍 Resumen de Cambios Realizados

### ✅ Componentes Actualizados

1. **Gestion/Clientes.vue**
   - ✅ Conectado a `/api/soporte/clientes`
   - ✅ CRUD completo funcionando

2. **Gestion/Proveedores.vue**
   - ⚠️ Redirigido temporalmente a `/api/soporte/clientes`
   - ⚠️ Necesita tabla `proveedores` en BD o eliminar componente

3. **RRHH/BeneficiosDeducciones.vue**
   - ✅ Conectado a `/api/rrhh/descuentos`
   - ⚠️ Sección "Beneficios" deshabilitada (no hay tabla)

### ❌ Componentes Eliminados del Sistema

- Todo el módulo de **Inventario y Activos**
- Removido del menú de navegación
- Removido de `App.vue`
- Removido de `MainLayout.vue`

---

## 📋 Recomendaciones

### 1. **Proveedores**
- **Opción A**: Crear tabla `proveedores` en la BD
- **Opción B**: Eliminar el componente `Proveedores.vue`
- **Opción C**: Mantener usando tabla `clientes` con campo tipo diferenciador

### 2. **Beneficios (RRHH)**
- Crear tabla `beneficios_rrhh` si se necesita gestión de beneficios
- O mantener solo gestión de descuentos

### 3. **Tablas sin Componentes Frontend**
Las siguientes tablas tienen API pero no componentes:
- `asistencia`
- `comentarios_tickets`
- `adjuntos_tickets`
- `categorias_tickets`
- `subcategorias_tickets`
- `estados_tickets`
- `tecnicos`
- `areas_soporte`

### 4. **Tablas sin API**
- `historial_tickets`
- `llamadas`

---

## 🎯 Estado General

### 📊 Estadísticas

**Tablas en Base de Datos**: 24 tablas (excluyendo sqlite_sequence)

**Componentes Frontend Conectados**:
- ✅ **8 componentes funcionando al 100%**
  - Usuarios
  - Clientes (Gestión y Soporte)
  - Tickets
  - SLAs
  - Roles
  - Encuestas
  - Empleados
  - Nómina
  - Ausencias
  - Contabilidad (3 tablas)

- ⚠️ **3 componentes con limitaciones**
  - Proveedores (usando tabla clientes)
  - BeneficiosDeducciones (solo descuentos funcionan)
  - Configuración (sin API backend)

- ❌ **5 componentes eliminados**
  - Todo el módulo Inventario y Activos

### 📈 Cobertura

- **Tablas con Frontend Conectado**: 13/24 (54%)
- **Tablas con API Disponible**: 17/24 (71%)
- **Módulos Funcionales**: 3/5 (60%)
  - ✅ Soporte
  - ✅ RRHH
  - ✅ Contabilidad
  - ⚠️ Gestión (parcial)
  - ❌ Configuración (sin backend)

---

✅ **Módulos Funcionando**: Soporte, RRHH, Contabilidad
⚠️ **Requiere Atención**: Proveedores, Beneficios, Configuración
❌ **Eliminados**: Inventario y Activos
