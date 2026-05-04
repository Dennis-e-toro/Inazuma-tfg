const fs = require('fs');
const path = require('path');

// 📁 carpeta donde tienes los sprites
const personajesDir = path.join(__dirname, 'public/personajes');

// 📄 archivo de salida
const outputFile = path.join(__dirname, 'public/data/personajes.json');

// Carpeta de iconos de clubes (ruta pública)
const clubesBasePath = '/clubes';

// aseguramos que la carpeta data exista
fs.mkdirSync(path.dirname(outputFile), { recursive: true });

const personajes = [];

// función recursiva para leer carpetas
function leerCarpeta(dir, saga = null, club = null) {
  const archivos = fs.readdirSync(dir, { withFileTypes: true });

  for (const archivo of archivos) {
    const rutaCompleta = path.join(dir, archivo.name);

    if (archivo.isDirectory()) {
      if (!saga) {
        leerCarpeta(rutaCompleta, archivo.name, club);
      } else if (!club) {
        leerCarpeta(rutaCompleta, saga, archivo.name);
      } else {
        leerCarpeta(rutaCompleta, saga, club);
      }
    } else if (archivo.isFile()) {
      const nombre = path.parse(archivo.name).name;

      personajes.push({
        nombre: nombre.replace(/_/g, ' '),
        alias: null,
        sprite_url: `/personajes/${saga}/${club}/${archivo.name}`,
        silueta_url: `/siluetas/${saga}/${club}/${archivo.name}`,
        icono_elemento_url: null,
        icono_posicion_url: null,
        icono_club_url: null,        // se rellenará abajo
        icono_saga_url: `/Saga/${saga}.webp`,
        elemento: null,
        posicion: null,
        club: club,
        saga: saga,
        tiene_espiritu: false,
        tiene_miximax: false,
        genero: null,                // null por defecto
        genero_url: null             // null por defecto
      });
    }
  }
}

// 🚀 ejecutar lectura de carpeta
leerCarpeta(personajesDir);

// Función para capitalizar la primera letra
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Rellenamos iconos de club automáticamente
personajes.forEach(p => {
  if (!p.icono_club_url && p.club && p.saga) {
    const clubName = capitalize(p.club);
    const saga = p.saga.toLowerCase();
    p.icono_club_url = `${clubesBasePath}/${saga}/${clubName}.webp`;
  }
});

// 💾 guardar JSON
fs.writeFileSync(outputFile, JSON.stringify(personajes, null, 2), 'utf-8');

console.log(`✅ JSON generado con ${personajes.length} personajes`);
console.log(`📄 Ruta: ${outputFile}`);
console.log('🔹 Iconos de club rellenados ✅');
