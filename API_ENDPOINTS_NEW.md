# Nuevos Endpoints de API - ERP

## Módulo Soporte

### Comentarios de Tickets

**GET** `/api/soporte/tickets/:id/comentarios`
- Obtiene todos los comentarios de un ticket
- Parámetros: `id` = id_ticket
- Respuesta: Array de comentarios con datos del usuario

**POST** `/api/soporte/tickets/:id/comentarios`
- Crea un nuevo comentario en un ticket
- Body: `{ id_usuario, comentario }`
- Respuesta: `{ id, mensaje }`

---

### Adjuntos de Tickets

**GET** `/api/soporte/tickets/:id/adjuntos`
- Obtiene todos los adjuntos de un ticket
- Parámetros: `id` = id_ticket
- Respuesta: Array de adjuntos

**POST** `/api/soporte/tickets/:id/adjuntos`
- Crea un nuevo adjunto en un ticket
- Body: `{ nombre_archivo, ruta_archivo }`
- Respuesta: `{ id, mensaje }`

**DELETE** `/api/soporte/adjuntos/:id`
- Elimina un adjunto específico
- Parámetros: `id` = id_adjunto
- Respuesta: `{ mensaje }`

---

### SLAs

**GET** `/api/soporte/slas`
- Obtiene todos los SLAs disponibles
- Respuesta: Array de SLAs

**POST** `/api/soporte/slas`
- Crea un nuevo SLA
- Body: `{ nombre, tiempo_respuesta, tiempo_resolucion, prioridad }`
- Respuesta: `{ id, mensaje }`

**PUT** `/api/soporte/slas/:id`
- Actualiza un SLA existente
- Parámetros: `id` = id_sla
- Body: `{ nombre, tiempo_respuesta, tiempo_resolucion, prioridad }`
- Respuesta: `{ mensaje }`

---

### Roles

**GET** `/api/soporte/roles`
- Obtiene todos los roles disponibles
- Respuesta: Array de roles

**POST** `/api/soporte/roles`
- Crea un nuevo rol
- Body: `{ nombre }`
- Respuesta: `{ id, mensaje }`

---

### Encuestas

**GET** `/api/soporte/encuestas`
- Obtiene todas las encuestas
- Respuesta: Array de encuestas con datos del usuario

**POST** `/api/soporte/encuestas`
- Crea una nueva encuesta
- Body: `{ id_usuario, apreciacion }`
- Respuesta: `{ id, mensaje }`

---

## Módulo RRHH

### Ausencias

**GET** `/api/rrhh/ausencias`
- Obtiene todas las ausencias registradas
- Respuesta: Array de ausencias con datos del empleado

**GET** `/api/rrhh/empleados/:id/ausencias`
- Obtiene las ausencias de un empleado específico
- Parámetros: `id` = id_empleado
- Respuesta: Array de ausencias

**POST** `/api/rrhh/ausencias`
- Crea una nueva ausencia
- Body: `{ id_empleado, fecha_inicio, fecha_fin, descripcion_motivo }`
- Respuesta: `{ id, mensaje }`

**PUT** `/api/rrhh/ausencias/:id`
- Actualiza una ausencia existente
- Parámetros: `id` = id_ausencia
- Body: `{ fecha_inicio, fecha_fin, descripcion_motivo }`
- Respuesta: `{ mensaje }`

**DELETE** `/api/rrhh/ausencias/:id`
- Elimina una ausencia
- Parámetros: `id` = id_ausencia
- Respuesta: `{ mensaje }`

---

### Descuentos RRHH

**GET** `/api/rrhh/descuentos`
- Obtiene todos los descuentos registrados
- Respuesta: Array de descuentos con datos del empleado

**GET** `/api/rrhh/empleados/:id/descuentos`
- Obtiene los descuentos de un empleado específico
- Parámetros: `id` = id_empleado
- Respuesta: Array de descuentos

**POST** `/api/rrhh/descuentos`
- Crea un nuevo descuento
- Body: `{ id_empleado, concepto, monto }`
- Respuesta: `{ id, mensaje }`

**PUT** `/api/rrhh/descuentos/:id`
- Actualiza un descuento existente
- Parámetros: `id` = id_descuento
- Body: `{ concepto, monto }`
- Respuesta: `{ mensaje }`

**DELETE** `/api/rrhh/descuentos/:id`
- Elimina un descuento
- Parámetros: `id` = id_descuento
- Respuesta: `{ mensaje }`

---

## Total de Endpoints Agregados: 21

- Comentarios tickets: 2
- Adjuntos tickets: 3
- SLAs: 3
- Roles: 2
- Encuestas: 2
- Ausencias: 5
- Descuentos: 5
