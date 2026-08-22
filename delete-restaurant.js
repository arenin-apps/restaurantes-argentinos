// delete-restaurant.js
//
// Elimina un restaurante de restaurants.json. Se dispara desde GitHub
// Actions (workflow_dispatch) pidiendo el identificador del restaurante
// Y una confirmación explícita, para evitar borrados accidentales.

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'restaurants.json');
const CONFIRMACION_REQUERIDA = 'ELIMINAR';

function normalize(str) {
  return (str || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function findRestaurant(list, identificador) {
  const idNorm = normalize(identificador);
  let found = list.find(r => r.id === identificador.trim());
  if (found) return found;
  found = list.find(r => normalize(r.nombre) === idNorm);
  if (found) return found;
  const parciales = list.filter(r => normalize(r.nombre).includes(idNorm));
  if (parciales.length === 1) return parciales[0];
  if (parciales.length > 1) {
    throw new Error(
      `"${identificador}" coincide con varios restaurantes, sé más específico: ` +
      parciales.map(r => `${r.nombre} (id: ${r.id})`).join(', ')
    );
  }
  return null;
}

function main() {
  const identificador = process.env.IDENTIFICADOR;
  const confirmacion = process.env.CONFIRMACION;

  if (!identificador || !identificador.trim()) {
    throw new Error('Falta el identificador (nombre exacto o id) del restaurante a eliminar.');
  }
  if (confirmacion !== CONFIRMACION_REQUERIDA) {
    throw new Error(`Para eliminar, escribí exactamente "${CONFIRMACION_REQUERIDA}" en el campo de confirmación. No se eliminó nada.`);
  }

  const restaurants = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  const r = findRestaurant(restaurants, identificador);
  if (!r) {
    throw new Error(`No se encontró ningún restaurante que coincida con "${identificador}". No se eliminó nada.`);
  }

  const restantes = restaurants.filter(x => x.id !== r.id);
  fs.writeFileSync(DATA_PATH, JSON.stringify(restantes, null, 2) + '\n', 'utf-8');

  console.log(`Restaurante eliminado: ${r.nombre} (id: ${r.id})`);
  console.log(`Quedan ${restantes.length} restaurantes en el archivo.`);
}

main();
