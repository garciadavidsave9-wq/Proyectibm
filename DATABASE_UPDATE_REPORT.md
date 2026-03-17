# Reporte de Actualización de Base de Datos - ERP

**Fecha:** 4 de febrero de 2026  
**Base de datos:** erpdb.db

## Resumen de Cambios

Se han agregado **7 tablas nuevas** a la base de datos para completar el modelo de datos según especificaciones.

---

## Tablas Creadas

### 1. **roles**
```sql
CREATE TABLE roles (
    id_rol INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE
);
```
**Propósito:** Almacenar los diferentes roles de usuarios en el sistema (Admin, Técnico, Cliente, etc.)

---

### 2. **slas**
```sql
CREATE TABLE slas (
    id_sla INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    tiempo_respuesta INTEGER NOT NULL,
    tiempo_resolucion INTEGER,
    prioridad TEXT
);
```
**Propósito:** Definir los acuerdos de nivel de servicio (SLA) con tiempos de respuesta y resolución

---

### 3. **comentarios_tickets**
```sql
CREATE TABLE comentarios_tickets (
    id_comentario INTEGER PRIMARY KEY AUTOINCREMENT,
    id_ticket INTEGER NOT NULL,
    id_usuario INTEGER NOT NULL,
    comentario TEXT NOT NULL,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_ticket) REFERENCES tickets(id_ticket),
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
);
```
**Propósito:** Almacenar comentarios y actualizaciones dentro de cada ticket de soporte

---

### 4. **adjuntos_tickets**
```sql
CREATE TABLE adjuntos_tickets (
    id_adjunto INTEGER PRIMARY KEY AUTOINCREMENT,
    id_ticket INTEGER NOT NULL,
    nombre_archivo TEXT NOT NULL,
    ruta_archivo TEXT,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_ticket) REFERENCES tickets(id_ticket)
);
```
**Propósito:** Gestionar archivos adjuntos en tickets (screenshots, documentos, etc.)

---

### 5. **ausencias**
```sql
CREATE TABLE ausencias (
    id_ausencia INTEGER PRIMARY KEY AUTOINCREMENT,
    id_empleado INTEGER NOT NULL,
    fecha_inicio DATE,
    fecha_fin DATE,
    descripcion_motivo TEXT,
    FOREIGN KEY (id_empleado) REFERENCES empleados_rrhh(id_empleado)
);
```
**Propósito:** Registrar ausencias de empleados (vacaciones, licencias, etc.)

---

### 6. **descuentos_rrhh**
```sql
CREATE TABLE descuentos_rrhh (
    id_descuento INTEGER PRIMARY KEY AUTOINCREMENT,
    id_empleado INTEGER NOT NULL,
    concepto TEXT,
    monto DECIMAL(10,2),
    FOREIGN KEY (id_empleado) REFERENCES empleados_rrhh(id_empleado)
);
```
**Propósito:** Registrar descuentos salariales de empleados (IMSS, impuestos, otros)

---

### 7. **encuestas**
```sql
CREATE TABLE encuestas (
    id_encuesta INTEGER PRIMARY KEY AUTOINCREMENT,
    id_usuario INTEGER NOT NULL,
    apreciacion TEXT,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
);
```
**Propósito:** Almacenar encuestas de satisfacción de usuarios/clientes

---

## Resumen Total de Tablas (24 tablas en total)

### Módulo Soporte:
- areas_soporte
- usuarios
- clientes
- categorias_tickets
- subcategorias_tickets
- estados_tickets
- tecnicos
- tickets
- comentarios_tickets ✅ **NUEVO**
- adjuntos_tickets ✅ **NUEVO**
- historial_tickets
- llamadas
- roles ✅ **NUEVO**
- slas ✅ **NUEVO**

### Módulo RRHH:
- empleados_rrhh
- asistencia
- planilla
- ausencias ✅ **NUEVO**
- descuentos_rrhh ✅ **NUEVO**

### Módulo Contabilidad:
- cuentas_contables
- asientos_contables
- movimientos_contables

### Otros:
- encuestas ✅ **NUEVO**

---

## Estado Actual

✅ Base de datos completamente actualizada y sincronizada con el modelo de datos proporcionado.
