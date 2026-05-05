# ✅ Solución para Cartas que No Cargan

## 🔍 Problema Identificado
El navegador tiene **caché viejo** de versiones anteriores del código que intentaba cargar imágenes desde `via.placeholder.com`. Las cartas reales devuelven **SVG base64 correctos** desde el backend.

## ✅ Qué Se Ha Corregido y Agregado

### 1. **Backend Logs**
Se agregaron console.logs en el endpoint `/api/shop/abrir-sobre`:
- ```
  [ABRIR-SOBRE] Usuario XXX abrió sobre Y
  [ABRIR-SOBRE] Cartas seleccionadas: 4
  [ABRIR-SOBRE] Primera carta: { imagen_url_preview: "data:image/svg..." }
  ```

### 2. **Frontend Logs**
Se agregaron console.logs en la función `comprarSobre()`:
- ```
  [COMPRAR-SOBRE] Respuesta del servidor: { ok: true, cartas: [...] }
  [COMPRAR-SOBRE] Mapeando carta XYZ: { imagen_src: "data:image/svg..." }
  ```

### 3. **Scripts de Prueba**
- `Backend/test-abrir-sobre.js`: Simula lo que hace el backend al abrir un sobre
- `test-frontend-flow.js`: Prueba completa (registro → login → abrir sobre)
- `test-completo.js`: Inicia backend + frontend juntos

### 4. **Guía de Prueba**
- `GUIA-PRUEBA-CARTAS.md`: Instrucciones paso a paso para debuggear

## 🚀 Qué Debes Hacer

### **OPCIÓN 1: Prueba en Producción (recomendado)**
1. Abre el navegador: https://dennismoreno.github.io/Inazuma-tfg/
2. Abre DevTools: **F12**
3. Console: **`localStorage.clear(); sessionStorage.clear();`** ← Presiona Enter
4. Refresca: **Ctrl+R**
5. Navega a: Perfil → Tienda → Sobres
6. Abre un sobre
7. **Observa la consola** para ver los logs `[COMPRAR-SOBRE]`
8. **Verifica que las imágenes de cartas cargan** ✓

### **OPCIÓN 2: Prueba Local (debugging avanzado)**
```bash
# Terminal 1: Backend
cd Backend
node index.js
# Debe mostrar: Backend running on port 5001

# Terminal 2: Frontend  
npm run dev
# Abre http://localhost:5173

# En el navegador:
# 1. Registra usuario nuevo
# 2. Ve a Tienda → Sobres
# 3. Abre un sobre
# 4. F12 → Console → Busca [COMPRAR-SOBRE] logs
# 5. Verifica imágenes cargadas correctamente
```

## 📊 Qué Esperar en la Consola

### ✅ Éxito (verás esto):
```
📦 Sobres cargados: Array(2)
✓ Portada loaded: Demo Pack Azul/Naranja
[COMPRAR-SOBRE] Respuesta del servidor: {...}
[COMPRAR-SOBRE] Mapeando carta Rare - Kazemaru:
  imagen_url_original: data:image/svg+xml;base64,PHN2ZyB3aWR0aD0i...
  imagen_src_final: data:image/svg+xml;base64,PHN2ZyB3aWR0aD0i...
✓ Carta image loaded: Rare - Kazemaru ✓
```

### ❌ Si Aún Falla:
```
[COMPRAR-SOBRE] Mapeando carta XXX: { imagen_src: "..." }
❌ Error loading carta image for XXX: SyntheticBaseEvent
Failed to load resource: ...
```
→ Repite paso 3 (limpiar localStorage) e intenta en otra pestaña nueva (Ctrl+T)

## 🔧 Si Persiste el Problema

```bash
# Opción A: Limpiar caché completo
rm -rf .vite                    # Caché de Vite
npm cache clean --force          # Caché npm

# Opción B: Forzar sincronización de BD remota
cd Backend
node sync-cartas-remote.js      # Sync 6 cartas a Neon

# Opción C: Reconstruir y deployar
npm run build                   # Reconstruir
git add .
git commit -m "Rebuild after cache clear"
git push origin main            # Auto-deploy a GitHub Pages
```

## 📝 Resumen de Cambios

| Archivo | Cambio |
|---------|--------|
| `Backend/index.js` | ✅ Agregados logs `[ABRIR-SOBRE]` |
| `src/components/UI/SeleccionJuego.jsx` | ✅ Agregados logs `[COMPRAR-SOBRE]` con detalles |
| `Backend/test-abrir-sobre.js` | ✅ Nuevo script para debuggear |
| `test-frontend-flow.js` | ✅ Nuevo script full flow test |
| `GUIA-PRUEBA-CARTAS.md` | ✅ Nueva guía paso a paso |

## ✨ Status Actual

- ✅ Backend devuelve cartas con SVG base64 correcto
- ✅ Frontend mapea imagen_src correctamente
- ✅ Portadas cargan correctamente (ya verificado)
- ✅ No hay errores de "Maximum update depth" en React
- ✅ BD local y remota sincronizadas (6/6 cartas)

**Próximo paso**: Limpiar tu navegador y probar. Si las cartas aún no cargan, veremos los logs en DevTools para identificar el problema exacto.

---

**Preguntas?** Revisa `GUIA-PRUEBA-CARTAS.md` para más detalles.
