# API ERP - Backend (Node.js)

## Descripción
API REST para gestionar un Sistema ERP (Enterprise Resource Planning) completo con módulos de:
- **Soporte**: Gestión de usuarios, clientes, tickets y categorías
- **RRHH**: Gestión de empleados, asistencia y planilla
- **Contabilidad**: Cuentas contables, asientos y movimientos

## Requisitos
- Node.js 14+
- npm

## Instalación

### 1. Instalar dependencias
```bash
npm install
```

### 2. Crear la base de datos
```bash
node init_database.js
```

### 3. Iniciar el servidor
```bash
node app.js
```

O con nodemon para desarrollo:
```bash
npm run dev
```

## Endpoints Disponibles

### Health Check
- `GET /api/health` - Verificar estado del API

### SOPORTE
#### Usuarios
- `GET /api/soporte/usuarios` - Listar todos los usuarios
- `GET /api/soporte/usuarios/<id>` - Obtener usuario específico
- `POST /api/soporte/usuarios` - Crear nuevo usuario
- `PUT /api/soporte/usuarios/<id>` - Actualizar usuario
- `DELETE /api/soporte/usuarios/<id>` - Eliminar usuario

#### Clientes
- `GET /api/soporte/clientes` - Listar clientes
- `POST /api/soporte/clientes` - Crear cliente

#### Tickets
- `GET /api/soporte/tickets` - Listar todos los tickets
- `POST /api/soporte/tickets` - Crear nuevo ticket
- `PUT /api/soporte/tickets/<id>` - Actualizar ticket

### RRHH
#### Empleados
- `GET /api/rrhh/empleados` - Listar empleados
- `POST /api/rrhh/empleados` - Crear empleado
- `PUT /api/rrhh/empleados/<id>` - Actualizar empleado

#### Asistencia
- `GET /api/rrhh/asistencia` - Listar asistencias
- `POST /api/rrhh/asistencia` - Registrar asistencia

#### Planilla
- `GET /api/rrhh/planilla` - Listar planillas
- `POST /api/rrhh/planilla` - Crear planilla

### CONTABILIDAD
#### Cuentas
- `GET /api/contabilidad/cuentas` - Listar cuentas
- `POST /api/contabilidad/cuentas` - Crear cuenta

#### Asientos
- `GET /api/contabilidad/asientos` - Listar asientos
- `POST /api/contabilidad/asientos` - Crear asiento

#### Movimientos
- `GET /api/contabilidad/movimientos` - Listar movimientos
- `POST /api/contabilidad/movimientos` - Crear movimiento

#### Reportes
- `GET /api/contabilidad/balance` - Obtener balance de cuentas

## Estructura de Archivos

```
api/
├── app.js                      # Aplicación principal
├── database.js                 # Clase para manejo de BD
├── init_database.js            # Script para crear BD
├── package.json               # Dependencias
├── erpdb.db                   # Base de datos SQLite
├── routes/
│   ├── soporte.js             # Rutas del módulo soporte
│   ├── rrhh.js                # Rutas del módulo RRHH
│   └── contabilidad.js        # Rutas del módulo contabilidad
└── README.md                  # Este archivo
```

## Ejemplos de Uso

### Crear Usuario
```bash
curl -X POST http://localhost:5000/api/soporte/usuarios \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Juan Pérez",
    "email": "juan@example.com",
    "password": "pass123",
    "rol": "Admin",
    "id_area": 1
  }'
```

### Listar Tickets
```bash
curl http://localhost:5000/api/soporte/tickets
```

### Crear Empleado
```bash
curl -X POST http://localhost:5000/api/rrhh/empleados \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Carlos",
    "apellido": "García",
    "puesto": "Programador",
    "salario": 2500.00,
    "fecha_ingreso": "2024-01-15"
  }'
```

## Notas
- El API corre en `http://localhost:5000` por defecto
- Se habilita CORS para permitir llamadas desde el frontend
- La base de datos es SQLite (erpdb.db)
- Usar `npm run dev` para desarrollo con reinicio automático
