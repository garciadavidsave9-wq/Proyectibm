# 📋 Documentación de Endpoints - API ERP

**Versión:** 1.0  
**Base URL:** `http://localhost:5000/api`

---

## 🔍 Health Check

### GET `/health`
Verifica el estado de la API.

```
GET http://localhost:5000/api/health
```

**Respuesta:**
```json
{
  "status": "API activa",
  "version": "1.0"
}
```

---

## 📊 CONTABILIDAD (`/contabilidad`)

### 💰 Cuentas Contables

#### GET `/contabilidad/cuentas`
Obtiene todas las cuentas contables registradas.

```
GET http://localhost:5000/api/contabilidad/cuentas
```

**Respuesta:** Array de cuentas contables

---

#### POST `/contabilidad/cuentas`
Crea una nueva cuenta contable.

```
POST http://localhost:5000/api/contabilidad/cuentas
Content-Type: application/json

{
  "codigo": "101",
  "nombre": "Caja",
  "tipo": "Activo"
}
```

**Respuesta:**
```json
{
  "id": 1,
  "mensaje": "Cuenta creada"
}
```

---

### 📝 Asientos Contables

#### GET `/contabilidad/asientos`
Obtiene todos los asientos contables (ordenados por fecha descendente).

```
GET http://localhost:5000/api/contabilidad/asientos
```

**Respuesta:** Array de asientos contables

---

#### POST `/contabilidad/asientos`
Crea un nuevo asiento contable.

```
POST http://localhost:5000/api/contabilidad/asientos
Content-Type: application/json

{
  "fecha": "2026-02-03",
  "descripcion": "Pago de servicios"
}
```

**Respuesta:**
```json
{
  "id": 1,
  "mensaje": "Asiento creado"
}
```

---

### 🔄 Movimientos Contables

#### GET `/contabilidad/movimientos`
Obtiene todos los movimientos contables con información de cuentas y asientos.

```
GET http://localhost:5000/api/contabilidad/movimientos
```

**Respuesta:** Array de movimientos contables con detalles

---

#### POST `/contabilidad/movimientos`
Crea un nuevo movimiento contable.

```
POST http://localhost:5000/api/contabilidad/movimientos
Content-Type: application/json

{
  "id_asiento": 1,
  "id_cuenta": 1,
  "debe": 100.00,
  "haber": 0.00
}
```

**Respuesta:**
```json
{
  "id": 1,
  "mensaje": "Movimiento creado"
}
```

---

### 📈 Reportes

#### GET `/contabilidad/balance`
Obtiene el balance de todas las cuentas con totales de debe y haber.

```
GET http://localhost:5000/api/contabilidad/balance
```

**Respuesta:**
```json
[
  {
    "codigo": "101",
    "nombre": "Caja",
    "tipo": "Activo",
    "total_debe": 1500.00,
    "total_haber": 200.00
  }
]
```

---

## 👥 RECURSOS HUMANOS (`/rrhh`)

### 👨‍💼 Empleados

#### GET `/rrhh/empleados`
Obtiene todos los empleados registrados.

```
GET http://localhost:5000/api/rrhh/empleados
```

**Respuesta:** Array de empleados

---

#### POST `/rrhh/empleados`
Crea un nuevo empleado.

```
POST http://localhost:5000/api/rrhh/empleados
Content-Type: application/json

{
  "nombre": "Juan",
  "apellido": "Pérez",
  "puesto": "Ingeniero",
  "salario": 2500.00,
  "fecha_ingreso": "2025-01-15"
}
```

**Respuesta:**
```json
{
  "id": 1,
  "mensaje": "Empleado creado"
}
```

---

#### PUT `/rrhh/empleados/:id`
Actualiza los datos de un empleado existente.

```
PUT http://localhost:5000/api/rrhh/empleados/1
Content-Type: application/json

{
  "nombre": "Juan",
  "apellido": "Pérez",
  "puesto": "Senior Ingeniero",
  "salario": 3000.00,
  "fecha_ingreso": "2025-01-15"
}
```

**Respuesta:**
```json
{
  "mensaje": "Empleado actualizado"
}
```

---

### 📍 Asistencia

#### GET `/rrhh/asistencia`
Obtiene todos los registros de asistencia con nombres de empleados (ordenados por fecha descendente).

```
GET http://localhost:5000/api/rrhh/asistencia
```

**Respuesta:** Array de registros de asistencia

---

#### POST `/rrhh/asistencia`
Registra una asistencia de un empleado.

```
POST http://localhost:5000/api/rrhh/asistencia
Content-Type: application/json

{
  "id_empleado": 1,
  "fecha": "2026-02-03",
  "hora_entrada": "09:00",
  "hora_salida": "17:30"
}
```

**Respuesta:**
```json
{
  "id": 1,
  "mensaje": "Asistencia registrada"
}
```

---

### 💼 Planilla

#### GET `/rrhh/planilla`
Obtiene todas las planillas con información de empleados.

```
GET http://localhost:5000/api/rrhh/planilla
```

**Respuesta:** Array de planillas

---

#### POST `/rrhh/planilla`
Crea una nueva planilla.

```
POST http://localhost:5000/api/rrhh/planilla
Content-Type: application/json

{
  "id_empleado": 1,
  "mes": 2,
  "anio": 2026,
  "total_pago": 2500.00
}
```

**Respuesta:**
```json
{
  "id": 1,
  "mensaje": "Planilla creada"
}
```

---

## 🛠️ SOPORTE (`/soporte`)

### 👤 Usuarios

#### GET `/soporte/usuarios`
Obtiene todos los usuarios del sistema.

```
GET http://localhost:5000/api/soporte/usuarios
```

**Respuesta:** Array de usuarios

---

#### GET `/soporte/usuarios/:id`
Obtiene un usuario específico por su ID.

```
GET http://localhost:5000/api/soporte/usuarios/1
```

**Respuesta:** Objeto del usuario

**Errores:**
- `404`: Usuario no encontrado

---

#### POST `/soporte/usuarios`
Crea un nuevo usuario.

```
POST http://localhost:5000/api/soporte/usuarios
Content-Type: application/json

{
  "nombre": "Carlos",
  "email": "carlos@empresa.com",
  "password": "segura123",
  "rol": "Admin",
  "id_area": 1
}
```

**Respuesta:**
```json
{
  "id": 1,
  "mensaje": "Usuario creado"
}
```

---

#### PUT `/soporte/usuarios/:id`
Actualiza los datos de un usuario.

```
PUT http://localhost:5000/api/soporte/usuarios/1
Content-Type: application/json

{
  "nombre": "Carlos",
  "email": "carlos.nuevo@empresa.com",
  "password": "nuevasegura123",
  "rol": "User",
  "id_area": 2
}
```

**Respuesta:**
```json
{
  "mensaje": "Usuario actualizado"
}
```

---

#### DELETE `/soporte/usuarios/:id`
Elimina un usuario del sistema.

```
DELETE http://localhost:5000/api/soporte/usuarios/1
```

**Respuesta:**
```json
{
  "mensaje": "Usuario eliminado"
}
```

---

### 🏢 Clientes

#### GET `/soporte/clientes`
Obtiene todos los clientes registrados.

```
GET http://localhost:5000/api/soporte/clientes
```

**Respuesta:** Array de clientes

---

#### POST `/soporte/clientes`
Crea un nuevo cliente.

```
POST http://localhost:5000/api/soporte/clientes
Content-Type: application/json

{
  "nombre": "Empresa ABC",
  "telefono": "555-1234",
  "email": "contacto@empresaabc.com",
  "direccion": "Calle Principal 123"
}
```

**Respuesta:**
```json
{
  "id": 1,
  "mensaje": "Cliente creado"
}
```

---

### 🎫 Tickets

#### GET `/soporte/tickets`
Obtiene todos los tickets con información de clientes y estados.

```
GET http://localhost:5000/api/soporte/tickets
```

**Respuesta:** Array de tickets con detalles

---

#### POST `/soporte/tickets`
Crea un nuevo ticket de soporte.

```
POST http://localhost:5000/api/soporte/tickets
Content-Type: application/json

{
  "titulo": "Sistema no responde",
  "descripcion": "El sistema está muy lento",
  "id_cliente": 1,
  "id_tecnico": 5,
  "id_subcategoria": 2,
  "id_estado": 1
}
```

**Respuesta:**
```json
{
  "id": 1,
  "mensaje": "Ticket creado"
}
```

---

#### PUT `/soporte/tickets/:id`
Actualiza un ticket existente.

```
PUT http://localhost:5000/api/soporte/tickets/1
Content-Type: application/json

{
  "titulo": "Sistema no responde",
  "descripcion": "El sistema está muy lento - ACTUALIZACIÓN",
  "id_cliente": 1,
  "id_tecnico": 6,
  "id_subcategoria": 2,
  "id_estado": 2
}
```

**Respuesta:**
```json
{
  "mensaje": "Ticket actualizado"
}
```

---

## ⚠️ Códigos de Respuesta HTTP

| Código | Significado |
|--------|------------|
| 200 | OK - Solicitud exitosa |
| 201 | Created - Recurso creado exitosamente |
| 404 | Not Found - Recurso no encontrado |
| 500 | Internal Server Error - Error en el servidor |

---

## 📌 Notas Generales

- Todos los endpoints requieren `Content-Type: application/json` para solicitudes POST y PUT
- CORS está habilitado en la API
- Los errores se devuelven en formato JSON con la propiedad `error`
- Las fechas deben enviarse en formato `YYYY-MM-DD`
- Los IDs se retornan después de crear recursos con POST

---

**Última actualización:** 3 de febrero de 2026
