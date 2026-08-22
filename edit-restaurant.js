// edit-restaurant.js
//
// Edita un restaurante existente en restaurants.json. Se dispara desde
// GitHub Actions (workflow_dispatch) con los campos a cambiar como inputs.
// Cualquier campo que se deje vacío NO se toca (conserva el valor actual).
// Para BORRAR un campo puntual (dejarlo vacío/null a propósito), escribí
// la palabra BORRAR en ese campo al correr el workflow.

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'restaurants.json');
const CLEAR_KEYWORD = 'borrar';

function isClear(value) {
  return typeof value === 'string' && value.trim().toLowerCase() === CLEAR_KEYWORD;
}

function hasValue(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function normalize(str) {
  return (str || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function buildMapsUrl(direccion) {
  if (!direccion) return null;
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(direccion);
}

function findRestaurant(list, identificador) {
  const idNorm = normalize(identificador);
  // Primero intenta por id exacto (slug), después por nombre.
  let found = list.find(r => r.id === identificador.trim());
  if (found) return found;
  found = list.find(r => normalize(r.nombre) === idNorm);
  if (found) return found;
  // Como último recurso, coincidencia parcial del nombre (si es única).
  const parciales = list.filter(r => normalize(r.nombre).includes(idNorm));
  if (parciales.length === 1) return parciales[0];
  if (parciales.length > 1) {
    throw new Error(
      `"${identificador}" coincide con varios restaurantes, sé más específico (usá el nombre completo o el id): ` +
      parciales.map(r => `${r.nombre} (id: ${r.id})`).join(', ')
    );
  }
  return null;
}

function updateRedSocial(redes, plataforma, nuevoValor) {
  const idx = redes.findIndex(r => r && r.plataforma && r.plataforma.toLowerCase() === plataforma.toLowerCase());
  if (isClear(nuevoValor)) {
    if (idx !== -1) redes.splice(idx, 1);
    return;
  }
  if (!hasValue(nuevoValor)) return; // no se tocó este campo
  if (idx !== -1) {
    redes[idx].handle = nuevoValor.trim();
  } else {
    redes.push({ plataforma, handle: nuevoValor.trim() });
  }
}

function main() {
  const identificador = process.env.IDENTIFICADOR;
  if (!identificador || !identificador.trim()) {
    throw new Error('Falta el identificador (nombre exacto o id) del restaurante a editar.');
  }

  const restaurants = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  const r = findRestaurant(restaurants, identificador);
  if (!r) {
    throw new Error(`No se encontró ningún restaurante que coincida con "${identificador}". Revisá el nombre exacto o el id en restaurants.json.`);
  }

  const cambios = [];

  const campos = {
    nombre: process.env.NUEVO_NOMBRE,
    pais: process.env.NUEVO_PAIS,
    county: process.env.NUEVO_COUNTY,
    telefono: process.env.NUEVO_TELEFONO,
    sitioWeb: process.env.NUEVO_SITIO_WEB,
    categoria: process.env.NUEVA_CATEGORIA
  };

  for (const [campo, valor] of Object.entries(campos)) {
    if (isClear(valor)) {
      if (r[campo] != null) cambios.push(`${campo}: "${r[campo]}" → (vacío)`);
      r[campo] = null;
    } else if (hasValue(valor)) {
      cambios.push(`${campo}: "${r[campo] || '(vacío)'}" → "${valor.trim()}"`);
      r[campo] = valor.trim();
    }
  }

  // Dirección: además de actualizarla, regenera el link de Google Maps
  // A PARTIR DE UNA BÚSQUEDA POR TEXTO — que no siempre cae en el pin
  // exacto. Si más abajo se especifica un link de Maps exacto
  // (nuevo_maps_url), ese link pisa esta generación automática.
  const nuevaDireccion = process.env.NUEVA_DIRECCION;
  if (isClear(nuevaDireccion)) {
    cambios.push(`direccion: "${r.direccion}" → (vacío)`);
    r.direccion = null;
    r.mapsUrl = null;
  } else if (hasValue(nuevaDireccion)) {
    cambios.push(`direccion: "${r.direccion || '(vacío)'}" → "${nuevaDireccion.trim()}"`);
    r.direccion = nuevaDireccion.trim();
    r.mapsUrl = buildMapsUrl(r.direccion);
  }

  // Link exacto de Google Maps (ej. https://maps.app.goo.gl/...), para
  // cuando la búsqueda automática por texto no cae en el pin correcto.
  // Si se especifica, PISA cualquier mapsUrl generado arriba, sin
  // importar si también se cambió la dirección en esta misma corrida.
  // BORRAR vuelve al modo automático (regenera desde la dirección actual).
  const nuevoMapsUrl = process.env.NUEVO_MAPS_URL;
  if (isClear(nuevoMapsUrl)) {
    r.mapsUrl = buildMapsUrl(r.direccion);
    cambios.push(`mapsUrl → regenerado automáticamente desde la dirección ("${r.mapsUrl || '(sin dirección)'}")`);
  } else if (hasValue(nuevoMapsUrl)) {
    cambios.push(`mapsUrl → fijado manualmente: "${nuevoMapsUrl.trim()}"`);
    r.mapsUrl = nuevoMapsUrl.trim();
  }

  // Coordenadas manuales (por si querés corregirlas a mano en vez de
  // esperar al workflow de geocodificación).
  const nuevaLat = process.env.NUEVA_LATITUD;
  const nuevaLng = process.env.NUEVA_LONGITUD;
  if (isClear(nuevaLat)) { r.latitude = null; cambios.push('latitude → (vacío)'); }
  else if (hasValue(nuevaLat)) { r.latitude = parseFloat(nuevaLat); cambios.push(`latitude → ${r.latitude}`); }
  if (isClear(nuevaLng)) { r.longitude = null; cambios.push('longitude → (vacío)'); }
  else if (hasValue(nuevaLng)) { r.longitude = parseFloat(nuevaLng); cambios.push(`longitude → ${r.longitude}`); }

  // Redes sociales.
  if (!Array.isArray(r.redes)) r.redes = [];
  const nuevoIG = process.env.NUEVO_INSTAGRAM;
  const nuevoFB = process.env.NUEVO_FACEBOOK;
  if (isClear(nuevoIG) || hasValue(nuevoIG)) {
    cambios.push(`Instagram → ${isClear(nuevoIG) ? '(vacío)' : nuevoIG.trim()}`);
    updateRedSocial(r.redes, 'Instagram', nuevoIG);
  }
  if (isClear(nuevoFB) || hasValue(nuevoFB)) {
    cambios.push(`Facebook → ${isClear(nuevoFB) ? '(vacío)' : nuevoFB.trim()}`);
    updateRedSocial(r.redes, 'Facebook', nuevoFB);
  }

  if (cambios.length === 0) {
    console.log(`No se especificó ningún campo para cambiar en "${r.nombre}". No se hicieron modificaciones.`);
    return;
  }

  restaurants.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  fs.writeFileSync(DATA_PATH, JSON.stringify(restaurants, null, 2) + '\n', 'utf-8');

  console.log(`Restaurante editado: ${r.nombre} (id: ${r.id})`);
  console.log('Cambios aplicados:');
  cambios.forEach(c => console.log('  - ' + c));
}

main();
