import "dotenv/config";
import crypto from 'crypto';

const API = process.env.API_BASE || 'http://localhost:5000';

function randSuffix() {
  return crypto.randomBytes(3).toString('hex');
}

async function main() {
  try {
    const username = `testuser_${randSuffix()}`;
    const email = `${username}@example.local`;
    const password = 'Test1234!';

    console.log('Registering', username);
    let res = await fetch(`${API}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    });
    let body = await res.json().catch(() => null);
    if (!res.ok) {
      console.log('Register failed', res.status, body);
      // try login
      res = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      body = await res.json().catch(() => null);
      if (!res.ok) throw new Error('Login failed: ' + JSON.stringify(body));
    }

    const token = body?.token;
    console.log('Got token:', Boolean(token));

    // obtener estado diario
    res = await fetch(`${API}/api/diarios/estado?modo=normal`);
    const estado = await res.json().catch(() => null);
    console.log('Estado diario:', JSON.stringify(estado && { dia: estado.dia, personaje: estado.personaje?.nombre, persistido: estado.persistido }, null, 2));

    const hoy = estado?.dia || new Date().toISOString().slice(0,10);
    // payload
    const tiempoMs = 42000;
    const payload = {
      modo: 'normal',
      dia: hoy,
      intentosUsados: 1,
      pistasUsadas: 0,
      completado: true,
      acertado: true,
      inicio: new Date(Date.now() - tiempoMs).toISOString(),
      fin: new Date().toISOString(),
      tiempoMs,
      puntuacion: Math.max(0, 1000 - Math.floor(tiempoMs/1000)),
      adivinanzas: [],
    };

    res = await fetch(`${API}/api/diarios/intentos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const intentoRes = await res.json().catch(() => null);
    console.log('Intento response:', JSON.stringify(intentoRes, null, 2));

    // consultar ranking
    res = await fetch(`${API}/api/diarios/ranking?modo=normal&limite=10`);
    const ranking = await res.json().catch(() => null);
    console.log('Ranking:', JSON.stringify(ranking, null, 2));

  } catch (err) {
    console.error('ERROR', err.message || err);
    process.exit(1);
  }
}

main();
