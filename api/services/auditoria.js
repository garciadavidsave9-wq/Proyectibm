const db = require('../database');

const registrarAuditoria = async ({ entidad, idRegistro, campo, valorAnterior, valorNuevo, usuario = 'Sistema' }) => {
  await db.run(
    `INSERT INTO logs_auditoria (entidad, id_registro, campo, valor_anterior, valor_nuevo, usuario)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      String(entidad || ''),
      Number(idRegistro || 0),
      String(campo || ''),
      valorAnterior !== undefined && valorAnterior !== null ? String(valorAnterior) : null,
      valorNuevo !== undefined && valorNuevo !== null ? String(valorNuevo) : null,
      String(usuario || 'Sistema')
    ]
  );
};

module.exports = {
  registrarAuditoria
};
