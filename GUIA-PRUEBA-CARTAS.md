# 🧪 Guía de Prueba Completa para Cartas y Sobres

## Problema Actual
❌ Las imágenes de cartas fallan al cargar desde URL `via.placeholder.com`
❌ Error "Maximum update depth exceeded" en React

## Solución Paso a Paso

### PASO 1: Limpiar Caché del Navegador
```
1. Abre DevTools: F12
2. Limpiar localStorage: 
   Ejecuta en Console (F12 > Console):
   localStorage.clear(); sessionStorage.clear();

3. O usa: Ctrl+Shift+Delete para limpiar todo el caché del navegador
4. Refresca la página: Ctrl+R
```

### PASO 2: Verificar BD Local
```bash
# En terminal, desde c:\Users\denni\OneDrive\Escritorio\Proyecto TFG\Inazuma-tfg\Backend

node check-cartas.js
# Debe mostrar: ✓ 6 cartas en BD local
```

### PASO 3: Verificar Sincronización Remota (Neon)
```bash
# Desde el Backend/

node sync-cartas-remote.js
# Debe mostrar: ✅ 6/6 cartas sincronizadas a Neon
```

### PASO 4: Probar Localmente (sin GitHub Pages)

#### Terminal 1: Inicia Backend
```bash
# Desde c:\Users\denni\OneDrive\Escritorio\Proyecto TFG\Inazuma-tfg\Backend

node index.js
# Debe mostrar: Backend running on port 5001
```

#### Terminal 2: Inicia Frontend Dev Server
```bash
# Desde c:\Users\denni\OneDrive\Escritorio\Proyecto TFG\Inazuma-tfg

npm run dev
# Abre http://localhost:5173
```

#### En el Navegador:
1. Abre http://localhost:5173
2. Registra usuario nuevo
3. Ve a Perfil → Tienda → Sobres
4. Compra y abre un sobre
5. **Abre DevTools (F12) → Console** y observa:
   - `📦 Sobres cargados:` ✓
   - `✓ Portada loaded:` ✓
   - `[COMPRAR-SOBRE] Respuesta del servidor:` ← Verifica estructura de cartas
   - `[COMPRAR-SOBRE] Mapeando carta...` ← Verifica imagen_src
   - `✓ Carta image loaded:` ✓ O `❌ Error loading carta image` ✗

### PASO 5: Verificar en Producción (Railway + GitHub Pages)

Si todo funciona localmente:

```bash
# 1. Construir
npm run build

# 2. Commit y push
git add .
git commit -m "Fix: debug cartas image loading"
git push origin main

# 3. GitHub Actions automáticamente despliega
# Verifica en https://dennismoreno.github.io/Inazuma-tfg/
```

## Qué Buscar en la Consola

### ✅ Esperado:
```
📦 Sobres cargados: Array(2)
✓ Portada loaded: Demo Pack Azul/Naranja
[COMPRAR-SOBRE] Respuesta del servidor: {ok: true, cartas: Array(4)}
[COMPRAR-SOBRE] Mapeando carta Rare - Kazemaru:
  imagen_url_original: data:image/svg+xml;base64,PHN2ZyB3aWR0aD0i...
  imagen_src_final: data:image/svg+xml;base64,PHN2ZyB3aWR0aD0i...
✓ Carta image loaded: Rare - Kazemaru
```

### ❌ Problema (no esperes esto):
```
Failed to load resource: net::ERR_CONNECTION_CLOSED from "400x600.png?text=..."
Error loading carta image for UR - Haizaki: SyntheticBaseEvent
```

## Backend Logs

### En Terminal con Backend:
```
✓ Sobres cargados
[ABRIR-SOBRE] Usuario test_xxx abrió sobre 1
[ABRIR-SOBRE] Cartas seleccionadas: 4
[ABRIR-SOBRE] Primera carta: {
  id: "1",
  nombre: "Rare - Kazemaru",
  rareza: "rare",
  imagen_url_preview: "data:image/svg+xml;base64,PHN2ZyB3d..."
}
```

## Si Aún No Funciona

1. **Limpiar caché completamente:**
   ```bash
   rm -rf .vite
   npm cache clean --force
   ```

2. **Reconstruir y sincronizar BD:**
   ```bash
   node Backend/sync-cartas-remote.js
   npm run build
   ```

3. **Forzar descarga limpia en navegador:**
   - DevTools → Network → Desmarcar "Disable cache"
   - Ctrl+Shift+R (hard refresh)

## URLs de Prueba

- **Local Frontend:** http://localhost:5173
- **Local Backend:** http://localhost:5001/api/shop/sobres
- **Producción Frontend:** https://dennismoreno.github.io/Inazuma-tfg/
- **Producción Backend:** https://inazuma-tfg-production.up.railway.app/api/shop/sobres
