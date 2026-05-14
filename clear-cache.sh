#!/bin/bash
# Limpiar caché del navegador y del build local

echo "🧹 Limpiando caché del desarrollo..."

# Limpiar node_modules y dist si es necesario (opcional)
# rm -rf node_modules dist

# Limpiar caché de Vite
rm -rf .vite

# Limpiar localStorage del navegador (si se ejecuta en Dev Tools Console, pero esto es solo referencia)
echo ""
echo "✓ Caché limpiado"
echo ""
echo "📝 Pasos a seguir en el navegador:"
echo "1. Abre DevTools (F12)"
echo "2. Limpia el caché: Ctrl+Shift+Delete (o Cmd+Shift+Delete en Mac)"
echo "3. Selecciona 'Cookies y otros datos del sitio'"
echo "4. Refresca la página: Ctrl+R"
echo ""
echo "O simplemente ejecuta en DevTools Console:"
echo "  localStorage.clear(); sessionStorage.clear();"
