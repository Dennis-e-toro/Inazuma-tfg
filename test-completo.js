#!/usr/bin/env node
/**
 * Script para probar el sistema completo localmente
 * 1. Verifica cartas en BD local
 * 2. Inicia backend en puerto 5001
 * 3. Sirve frontend desde dist/
 * 4. Da instrucciones para probar en navegador
 */

import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('\n🚀 INICIANDO PRUEBA COMPLETA...\n');

// 1. Verifica cartas
console.log('1️⃣ Verificando cartas en BD local...');
try {
  const checkCartasPath = path.join(__dirname, 'Backend', 'check-cartas.js');
  const output = require('child_process').execSync(`node "${checkCartasPath}"`, { encoding: 'utf-8', stdio: 'pipe' });
  console.log(output);
} catch (e) {
  console.error('❌ Error verificando cartas:', e.message);
}

// 2. Inicia backend
console.log('\n2️⃣ Iniciando backend...');
const backendProcess = spawn('node', ['Backend/index.js'], {
  cwd: __dirname,
  stdio: 'inherit',
});

// 3. Sirve frontend (espera 2 segundos para que inicie el backend)
setTimeout(() => {
  console.log('\n3️⃣ Iniciando servidor frontend...\n');
  
  const distPath = path.join(__dirname, 'dist');
  
  const server = http.createServer((req, res) => {
    let filePath = path.join(distPath, req.url);
    if (filePath === distPath + '/' || filePath.endsWith('/')) {
      filePath = path.join(distPath, 'index.html');
    }

    fs.readFile(filePath, (err, content) => {
      if (err) {
        if (err.code === 'ENOENT') {
          // Fallback a index.html para rutas de SPA
          fs.readFile(path.join(distPath, 'index.html'), (indexErr, indexContent) => {
            if (!indexErr) {
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(indexContent);
            } else {
              res.writeHead(404);
              res.end('Not Found');
            }
          });
        } else {
          res.writeHead(500);
          res.end('Server Error');
        }
      } else {
        const contentType = filePath.endsWith('.js') ? 'application/javascript'
          : filePath.endsWith('.css') ? 'text/css'
          : filePath.endsWith('.json') ? 'application/json'
          : 'text/html';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      }
    });
  });

  server.listen(3000, () => {
    console.log('✅ SERVIDOR LISTO\n');
    console.log('📖 INSTRUCCIONES DE PRUEBA:');
    console.log('');
    console.log('1. Abre el navegador: http://localhost:3000');
    console.log('2. Backend API: http://localhost:5001/api');
    console.log('3. Inicia sesión o crea una cuenta');
    console.log('4. Ve a Perfil → Tienda → Sobres');
    console.log('5. Compra y abre un sobre');
    console.log('6. Mira la consola del navegador (F12) para ver:');
    console.log('   - [COMPRAR-SOBRE] logs del frontend');
    console.log('   - Errores de carga de imágenes');
    console.log('7. Verifica la consola del servidor para logs del backend');
    console.log('');
    console.log('Presiona Ctrl+C para salir\n');
  });

  process.on('SIGINT', () => {
    console.log('\n\n🛑 Deteniendo servicios...');
    server.close();
    backendProcess.kill();
    process.exit(0);
  });
}, 2000);
