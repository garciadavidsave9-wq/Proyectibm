const db = require('./database');

// Arrays de nombres y apellidos para generar empleados realistas
const nombres = [
  'Juan', 'María', 'Carlos', 'Ana', 'Miguel', 'Rosa', 'Diego', 'Carmen',
  'Fernando', 'Isabel', 'Rafael', 'Patricia', 'Antonio', 'Marta', 'José',
  'Elena', 'Pedro', 'Francisca', 'Manuel', 'Dolores', 'Andrés', 'Esperanza',
  'Ramón', 'Manuela', 'Javier', 'Antonia', 'Jorge', 'Magdalena', 'Enrique',
  'Consuelo', 'Eduardo', 'Amparo', 'Guillermo', 'Victoria', 'Adolfo', 'Elvira',
  'Emilio', 'Consolación', 'Ricardo', 'Felicidad', 'Roberto', 'Beatriz', 'Horacio',
  'Jacinta', 'Pablo', 'Lidia', 'Gustavo', 'Soledad', 'Héctor', 'Matilde'
];

const apellidos = [
  'García', 'Rodríguez', 'Martínez', 'López', 'González', 'Pérez', 'Sánchez', 'Jiménez',
  'Fernández', 'Romero', 'Navarro', 'Domínguez', 'Castro', 'Moreno', 'Gutiérrez',
  'Cortés', 'Medina', 'Flores', 'Díaz', 'Vázquez', 'Herrera', 'Reyes', 'Ruiz',
  'Gómez', 'Mendoza', 'Mojica', 'Guerrero', 'Vargas', 'Ramos', 'Alvarez', 'Lara',
  'Salazar', 'Cortez', 'Castillo', 'Acevedo', 'Cervantes', 'Delgado', 'Escobar',
  'Fuentes', 'Gallego', 'Heraso', 'Ibáñez', 'Jaramillo', 'Katz', 'Larrondo',
  'Madera', 'Naranjo', 'Oquendo', 'Pacheco', 'Quiroga', 'Ramírez'
];

const puestos = [
  'Desarrollador Senior', 'Desarrollador Junior', 'Analista de Sistemas',
  'Gerente de Proyecto', 'Diseñador Gráfico', 'Especialista en Base de Datos',
  'Técnico de Soporte', 'Asistente Administrativo', 'Contador',
  'Gerente de RRHH', 'Coordinador Logístico', 'Vendedor', 'Ejecutivo de Cuenta',
  'Ingeniero de Sistemas', 'Consultor', 'Especialista en Marketing',
  'Community Manager', 'Especialista en SEO', 'Analista de Datos',
  'Especialista en Seguridad', 'DevOps Engineer', 'QA Tester', 'Scrum Master',
  'Product Manager', 'UX Designer', 'Cloud Architect', 'Network Administrator',
  'Especialista en BI', 'Documentalista', 'Gestor de Contenidos'
];

// Función para generar una fecha aleatoria entre 2020 y 2025
function generarFechaIngreso() {
  const inicio = new Date(2020, 0, 1);
  const fin = new Date(2025, 11, 31);
  return new Date(inicio.getTime() + Math.random() * (fin.getTime() - inicio.getTime()))
    .toISOString()
    .split('T')[0];
}

// Función para generar salario aleatorio entre 1000 y 8000
function generarSalario() {
  return Math.floor(Math.random() * 7000) + 1000;
}

// Función principal para insertar empleados
async function seedEmpleados() {
  try {
    console.log('Iniciando inserción de 50 empleados...');

    for (let i = 0; i < 50; i++) {
      const nombre = nombres[Math.floor(Math.random() * nombres.length)];
      const apellido = apellidos[Math.floor(Math.random() * apellidos.length)];
      const puesto = puestos[Math.floor(Math.random() * puestos.length)];
      const salario = generarSalario();
      const fecha_ingreso = generarFechaIngreso();

      await db.run(
        'INSERT INTO empleados_rrhh (nombre, apellido, puesto, salario, fecha_ingreso) VALUES (?, ?, ?, ?, ?)',
        [nombre, apellido, puesto, salario, fecha_ingreso]
      );

      console.log(`✓ Empleado ${i + 1}/50 creado: ${nombre} ${apellido}`);
    }

    console.log('\n✓ Se han insertado exitosamente 50 empleados en la base de datos');
    process.exit(0);
  } catch (error) {
    console.error('Error al insertar empleados:', error);
    process.exit(1);
  }
}

// Ejecutar el seed
seedEmpleados();
