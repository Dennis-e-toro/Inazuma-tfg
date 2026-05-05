#!/usr/bin/env node
/**
 * Simula exactamente lo que hace el frontend al abrir un sobre
 * 1. Crea un usuario de prueba
 * 2. Hace login para obtener token
 * 3. Compra y abre un sobre
 * 4. Verifica que las cartas devueltas tengan imagen_url correcta
 */

const API_BASE = process.env.API_BASE || 'http://localhost:5001';

async function testFrontendFlow() {
  console.log('\n=== TEST COMPLETO DEL FLUJO FRONTEND ===\n');

  // Usuario de prueba
  const username = `test_${Date.now()}`;
  const password = 'test123456';
  const email = `${username}@test.local`;

  try {
    // 1. Registro
    console.log('1️⃣ Registrando usuario de prueba...');
    let res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, email }),
    });
    let data = await res.json();
    
    if (!res.ok) {
      console.error('❌ Error registrando:', data.error);
      return;
    }
    
    let token = data.token;
    console.log(`✓ Usuario creado: ${username}`);
    console.log(`  Token: ${token.substring(0, 20)}...`);

    // 2. Obtener perfil actual y monedas
    console.log('\n2️⃣ Verificando monedas...');
    res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    data = await res.json();
    
    let monedas = data.user?.monedas || 0;
    console.log(`✓ Monedas disponibles: ${monedas}`);
    
    if (monedas < 50) {
      console.log(`❌ Monedas insuficientes (${monedas} < 50)`);
      return;
    }

    // 3. Obtener sobres disponibles
    console.log('\n3️⃣ Obteniendo sobres disponibles...');
    res = await fetch(`${API_BASE}/api/shop/sobres`);
    data = await res.json();
    
    if (!data.ok || !data.sobres.length) {
      console.error('❌ No hay sobres disponibles');
      return;
    }
    
    const sobre = data.sobres[0];
    console.log(`✓ Sobre: ${sobre.nombre} (${sobre.precio_monedas} monedas)`);
    console.log(`  Contenido: ${JSON.stringify(sobre.contenido_json)}`);

    // 4. Abrir sobre
    console.log('\n4️⃣ Abriendo sobre (POST /api/shop/abrir-sobre)...');
    res = await fetch(`${API_BASE}/api/shop/abrir-sobre`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ sobreId: sobre.id }),
    });
    data = await res.json();
    
    if (!res.ok || !data.ok) {
      console.error('❌ Error abriendo sobre:', data.error);
      return;
    }
    
    const cartas = data.cartas || [];
    console.log(`✓ Cartas obtenidas: ${cartas.length}`);

    // 5. Verificar cartas
    console.log('\n5️⃣ Verificando cartas devueltas...');
    for (let i = 0; i < cartas.length; i++) {
      const c = cartas[i];
      const imagenUrl = String(c.imagen_url || '');
      const isBase64 = imagenUrl.startsWith('data:image/svg+xml;base64,');
      const isValid = imagenUrl.length > 100;
      
      console.log(`\n  Carta ${i + 1}:`);
      console.log(`    Nombre: ${c.nombre}`);
      console.log(`    Rareza: ${c.rareza}`);
      console.log(`    Club: ${c.club}`);
      console.log(`    imagen_url tipo: ${isBase64 ? '✓ SVG Base64' : imagenUrl.startsWith('http') ? 'URL HTTP' : 'OTRO'}`);
      console.log(`    imagen_url largo: ${imagenUrl.length}`);
      console.log(`    imagen_url preview: ${imagenUrl.substring(0, 80)}...`);
      
      if (!isBase64 && !imagenUrl.startsWith('http')) {
        console.log(`    ⚠️  ADVERTENCIA: Formato inesperado de imagen_url`);
      }
    }

    // 6. Simular lo que hace el frontend
    console.log('\n6️⃣ Simulando mapeo del frontend...');
    const cartasMapeadas = cartas.map((c) => ({
      ...c,
      imagen_src: c.imagen_url && String(c.imagen_url).startsWith('/') 
        ? `/assets/${c.imagen_url}` 
        : c.imagen_url,
    }));

    for (let i = 0; i < cartasMapeadas.length; i++) {
      const c = cartasMapeadas[i];
      console.log(`\n  Carta ${i + 1} (mapeada):`);
      console.log(`    imagen_src tipo: ${String(c.imagen_src).startsWith('data:') ? '✓ Data URI' : String(c.imagen_src).startsWith('http') ? 'HTTP URL' : 'Ruta relativa'}`);
      console.log(`    imagen_src largo: ${String(c.imagen_src).length}`);
      console.log(`    Es válido para <img src>: ${String(c.imagen_src).length > 50 && (String(c.imagen_src).startsWith('data:') || String(c.imagen_src).startsWith('http'))}`);
    }

    console.log('\n✅ TEST COMPLETADO EXITOSAMENTE\n');
    
  } catch (error) {
    console.error('\n❌ Error general:', error.message);
  }
}

testFrontendFlow();
