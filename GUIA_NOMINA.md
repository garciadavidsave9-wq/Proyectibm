# 📋 Guía de Nómina y Empleados - Sistema ERP

## ✅ Lo que se ha completado

### 1. **Nómina creada para todos los empleados**
   - **51 registros de nómina** generados automáticamente
   - Mes actual: Febrero 2026
   - Basado en el salario registrado de cada empleado
   - Los montos de nómina coinciden con los salarios mensuales

### 2. **Automatización implementada**
   - Cuando se crea un **nuevo empleado**, automáticamente se genera un registro en la nómina
   - El nuevo registro utiliza:
     - El mes y año actual del sistema
     - El salario registrado del empleado como monto de nómina
   - La información se retorna en la respuesta del servidor

### 3. **Scripts disponibles**
   - `seed_empleados.js` - Crea 50 empleados de prueba
   - `seed_nomina.js` - Genera nómina para empleados existentes

## 🚀 Cómo usar el sistema

### **Ver empleados y nómina en el frontend:**

1. Accede a: **http://localhost:5173/**
2. Inicia sesión
3. En el menú lateral, ve a **RRHH**
4. Selecciona:
   - **Empleados** - Ver lista de los 51 empleados
   - **Nómina** - Ver la lista de nóminas generadas

### **Agregar un nuevo empleado:**

1. Ve a **RRHH → Empleados**
2. En la tarjeta "Crear Nuevo Empleado", complete:
   - **Nombre**
   - **Apellido**
   - **Puesto**
   - **Salario** (este será el monto de la nómina)
   - **Fecha de Ingreso**
3. Haz clic en "Crear empleado"
4. **Automáticamente se creará un registro de nómina** para ese empleado en el mes/año actual

### **Ver nóminas creadas:**

1. Ve a **RRHH → Nómina**
2. Verás una tabla con:
   - ID de Planilla
   - Nombre del Empleado
   - Mes
   - Año
   - Total Pago (con formato de moneda HNL)

## 💾 Base de datos

### Tabla: **planilla** (Nómina)
```sql
CREATE TABLE planilla (
    id_planilla INTEGER PRIMARY KEY AUTOINCREMENT,
    id_empleado INTEGER,
    mes INTEGER,
    anio INTEGER,
    total_pago DECIMAL(10,2),
    FOREIGN KEY (id_empleado) REFERENCES empleados_rrhh(id_empleado)
);
```

## 🔧 Endpoints API disponibles

### **Nómina/Planilla**
- `GET /api/rrhh/planilla` - Obtener todas las planillas
- `POST /api/rrhh/planilla` - Crear nueva planilla
- `GET /api/rrhh/salarios-anuales-isr` - Obtener salarios anuales e ISR calculado

### **Empleados**
- `GET /api/rrhh/empleados` - Obtener todos los empleados
- `POST /api/rrhh/empleados` - Crear empleado (crea automáticamente nómina)
- `PUT /api/rrhh/empleados/:id` - Actualizar empleado

## 📊 Información técnica

### **Flujo de creación de empleado:**
1. Usuario ingresa datos del empleado en el formulario
2. Frontend envía POST a `/api/rrhh/empleados`
3. Backend:
   - Crea registro en tabla `empleados_rrhh`
   - Obtiene mes y año actual del sistema
   - Crea automáticamente registro en tabla `planilla` con el salario como total_pago
   - Retorna ID de empleado y detalles de la nómina creada
4. Frontend recarga la lista de empleados y nóminas

### **Ventajas de la automatización:**
- ✅ No hay inconsistencias entre empleados y nómina
- ✅ Todos los empleados tienen registro de nómina automático
- ✅ Facilita auditoría y control
- ✅ Reduce errores manuales

## 🎯 Próximos pasos sugeridos

- Implementar período de nómina configurable (quincena, mes, etc.)
- Agregar deducciones automáticas por concepto
- Integrar cálculo de ISR automático
- Generar reportes de nómina
- Implementar historial de cambios salariales

---

**Estado:** ✅ Completado  
**Fecha:** 15 de febrero de 2026  
**Versión:** 1.0
