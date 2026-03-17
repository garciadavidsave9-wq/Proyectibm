const db = require('./database');

// Función para generar nómina para todos los empleados
async function seedNomina() {
  try {
    console.log('Iniciando creación de nómina para todos los empleados...');

    // Obtener todos los empleados
    const empleados = await db.all('SELECT * FROM empleados_rrhh');

    if (empleados.length === 0) {
      console.log('No hay empleados registrados');
      process.exit(0);
    }

    const currentDate = new Date();
    const mes = currentDate.getMonth() + 1; // Mes actual (1-12)
    const anio = currentDate.getFullYear(); // Año actual

    console.log(`Creando nómina para mes ${mes} del año ${anio}\n`);

    for (const empleado of empleados) {
      // Salario mensual es el salario registrado del empleado
      const total_pago = empleado.salario;

      await db.run(
        'INSERT INTO planilla (id_empleado, mes, anio, total_pago) VALUES (?, ?, ?, ?)',
        [empleado.id_empleado, mes, anio, total_pago]
      );

      console.log(`✓ Nómina creada para ${empleado.nombre} ${empleado.apellido} - Monto: ${total_pago}`);
    }

    console.log(`\n✓ Se han creado ${empleados.length} registros de nómina exitosamente`);
    process.exit(0);
  } catch (error) {
    console.error('Error al crear nómina:', error);
    process.exit(1);
  }
}

// Ejecutar el seed
seedNomina();
