# Guía de Integración - Nuevos Componentes Vue

## Componentes Creados

### 1. **ComentariosTickets.vue**
Gestión de comentarios en tickets de soporte

**Props requeridas:**
- `idTicket` (Number): ID del ticket
- `idUsuario` (Number): ID del usuario actual

**Uso:**
```vue
<ComentariosTickets :id-ticket="123" :id-usuario="456" />
```

---

### 2. **AdjuntosTickets.vue**
Gestión de archivos adjuntos en tickets

**Props requeridas:**
- `idTicket` (Number): ID del ticket

**Uso:**
```vue
<AdjuntosTickets :id-ticket="123" />
```

---

### 3. **Ausencias.vue**
Gestión completa de ausencias de empleados (RRHH)

**Características:**
- Listar ausencias
- Crear nuevas ausencias
- Editar ausencias existentes
- Eliminar ausencias
- Selección de empleados

**Uso:**
```vue
<Ausencias />
```

---

### 4. **Descuentos.vue**
Gestión de descuentos salariales de empleados

**Características:**
- Listar descuentos
- Crear nuevos descuentos
- Editar descuentos
- Eliminar descuentos
- Total de descuentos en tiempo real
- Selección de empleados

**Uso:**
```vue
<Descuentos />
```

---

### 5. **SLAs.vue**
Gestión de Acuerdos de Nivel de Servicio (SLA)

**Características:**
- Listar SLAs
- Crear nuevos SLAs
- Editar SLAs
- Eliminar SLAs
- Códigos de color por prioridad

**Uso:**
```vue
<SLAs />
```

---

### 6. **Roles.vue**
Gestión de roles de usuarios

**Características:**
- Listar roles
- Crear nuevos roles
- Eliminar roles

**Uso:**
```vue
<Roles />
```

---

### 7. **Encuestas.vue**
Gestión de encuestas de satisfacción

**Características:**
- Listar encuestas
- Crear nuevas encuestas
- Puntuación con estrellas
- Estadísticas (total y promedio)
- Selección de usuarios

**Uso:**
```vue
<Encuestas />
```

---

## Instalación en tu aplicación

### 1. Importar en el componente principal
```vue
<script setup>
import ComentariosTickets from './components/ComentariosTickets.vue'
import AdjuntosTickets from './components/AdjuntosTickets.vue'
import Ausencias from './components/Ausencias.vue'
import Descuentos from './components/Descuentos.vue'
import SLAs from './components/SLAs.vue'
import Roles from './components/Roles.vue'
import Encuestas from './components/Encuestas.vue'
</script>
```

### 2. Registrar globalmente (en main.js)
```javascript
import ComentariosTickets from './components/ComentariosTickets.vue'
import AdjuntosTickets from './components/AdjuntosTickets.vue'
// ... etc

app.component('ComentariosTickets', ComentariosTickets)
app.component('AdjuntosTickets', AdjuntosTickets)
// ... etc
```

---

## Ejemplo de Integración Completa

### En Soporte.vue
```vue
<template>
  <div class="soporte">
    <!-- Componente de tickets existente -->
    <Tickets />
    
    <!-- Nuevos componentes -->
    <div v-if="ticketSeleccionado">
      <ComentariosTickets 
        :id-ticket="ticketSeleccionado.id_ticket"
        :id-usuario="usuarioActual.id_usuario"
      />
      <AdjuntosTickets :id-ticket="ticketSeleccionado.id_ticket" />
    </div>
    
    <SLAs />
    <Roles />
    <Encuestas />
  </div>
</template>
```

### En RRHH.vue
```vue
<template>
  <div class="rrhh">
    <!-- Componentes existentes -->
    <Empleados />
    <Asistencia />
    <Planilla />
    
    <!-- Nuevos componentes -->
    <Ausencias />
    <Descuentos />
  </div>
</template>
```

---

## Variables de Entorno Requeridas

Asegúrate de que en tu archivo de configuración esté definida:

```javascript
window.API_URL = 'http://localhost:5000'
```

O en tu archivo de entorno:
```
VITE_API_URL=http://localhost:5000
```

---

## Dependencias Requeridas

Todos los componentes usan:
- ✅ Vue 3 (Composition API)
- ✅ Element Plus (UI Components)
- ✅ Fetch API (nativo del navegador)

---

## Estados de Carga

Todos los componentes incluyen:
- Skeleton loaders durante la carga
- Manejo de errores con mensajes
- Estados de carga para botones
- Mensajes de éxito/error

---

## Notas Importantes

1. **API_URL**: Los componentes buscan `window.API_URL`, asegúrate de configurarlo correctamente
2. **Fechas**: Las fechas se formatean automáticamente según la localidad del navegador
3. **Validaciones**: Todos los formularios tienen validaciones básicas
4. **Confirmaciones**: Las acciones destructivas (delete) requieren confirmación
5. **Responsive**: Todos los componentes son responsive y funcionan en móvil

---

## Próximas Mejoras Sugeridas

- [ ] Agregar paginación a las tablas
- [ ] Agregar filtros de búsqueda
- [ ] Exportar datos a Excel/PDF
- [ ] Agregar gráficos para estadísticas
- [ ] Implementar caché de datos
- [ ] Agregar validaciones más robustas
- [ ] Agregar animaciones de transición
