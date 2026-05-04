/**
 * Convierte una ruta de asset raíz (ej. /Saga/Ie1.webp) a una URL relativa
 * compatible con GitHub Pages y vite base: '/Inazuma-tfg/'
 * 
 * Uso: assetUrl('/Saga/Ie1.webp') -> '/Inazuma-tfg/Saga/Ie1.webp'
 */
export function assetUrl(path) {
  if (!path) return path;
  
  // Si ya tiene protocolo, devolverlo tal cual
  if (String(path).startsWith('http://') || String(path).startsWith('https://')) {
    return path;
  }
  
  // Obtener el base URL de Vite
  const baseUrl = import.meta.env.BASE_URL || '/';
  
  // Normalizar la ruta
  let normalizedPath = String(path).trim();
  
  // Si empieza con /, quitarlo para concatenar
  if (normalizedPath.startsWith('/')) {
    normalizedPath = normalizedPath.slice(1);
  }
  
  // Asegurar que baseUrl termina con /
  const baseWithSlash = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  
  return baseWithSlash + normalizedPath;
}
