const path = require('path');

const Config = {
  DATABASE: path.join(__dirname, 'erpdb.db'),
  SECRET_KEY: 'tu-clave-secreta-aqui',
  JSON_SORT_KEYS: false,
  CORS_HEADERS: 'Content-Type'
};

module.exports = Config;
