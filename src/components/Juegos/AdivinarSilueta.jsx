import { useState, useEffect, useRef } from "react";
import "./AdivinarSilueta.css";
import { API_BASE } from "../../config";
import { assetUrl } from "../../helpers/assetUrl";

const AUTH_SESSION_KEY = "inazudle.auth.session.v1";

function normalizarRutaImagen(url) {
  if (!url) return url;

  const normalized = String(url)
    .replace(/^\/Personajes\//i, "/personajes/")
    .replace(/^\/Siluetas\//i, "/siluetas/")
    .replace(/^\/Clubes\//i, "/clubes/")
    .replace(/^\/saga\//i, "/Saga/");
  return assetUrl(normalized);
}

function textoNormalizado(v) {
  return String(v || "").trim().toLowerCase();
}

function textoCompacto(v) {
  return textoNormalizado(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_-]+/g, "");
}

function coincideNombreAliasOClub(personaje, texto) {
  const q = textoNormalizado(texto);
  const qc = textoCompacto(texto);
  if (!q && !qc) return false;

  const nombre = textoNormalizado(personaje.nombre);
  const nombreC = textoCompacto(personaje.nombre);
  const alias = textoNormalizado(personaje.alias);
  const aliasC = textoCompacto(personaje.alias);
  const club = textoNormalizado(personaje.club);
  const clubC = textoCompacto(personaje.club);
  const clubEtiqueta = textoNormalizado(formatearEtiquetaClub(personaje.club));

  return (
    nombre.startsWith(q) ||
    alias.startsWith(q) ||
    nombreC.startsWith(qc) ||
    aliasC.startsWith(qc) ||
    club.startsWith(q) ||
    clubEtiqueta.startsWith(q) ||
    clubC.includes(qc)
  );
}

function esAciertoNombreOAlias(personaje, intento) {
  const v = textoNormalizado(intento);
  return v === textoNormalizado(personaje.nombre) || v === textoNormalizado(personaje.alias);
}

function buscarPersonajePorIntento(personajes, intento) {
  const v = textoNormalizado(intento);
  return personajes.find(
    (p) => v === textoNormalizado(p.nombre) || v === textoNormalizado(p.alias)
  );
}

function cargarSesionLocal() {
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.token) return null;
    return { token: String(data.token) };
  } catch {
    return null;
  }
}

function indiceDiario(total, semilla) {
  if (!Number.isFinite(total) || total <= 0) return 0;
  let hash = 0;
  for (let i = 0; i < semilla.length; i += 1) {
    hash = (hash * 31 + semilla.charCodeAt(i)) % 2147483647;
  }
  return hash % total;
}

function calcularPuntuacion(intentosUsados, pistasUsadas, tiempoMs) {
  const base = 1000;
  const penalizacionIntentos = Math.max(0, (Number(intentosUsados) || 0) - 1) * 120;
  const penalizacionPistas = Math.max(0, Number(pistasUsadas) || 0) * 80;
  const penalizacionTiempo = Math.max(0, Math.floor((Number(tiempoMs) || 0) / 1000));
  return Math.max(0, base - penalizacionIntentos - penalizacionPistas - penalizacionTiempo);
}

function unico(list) {
  return [...new Set(list.filter(Boolean))];
}

function capitalizar(v) {
  return String(v || "")
    .split("_")
    .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : p))
    .join("_");
}

function formatearEtiquetaClub(v) {
  return String(v || "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function fuentesSaga(personaje) {
  const saga = textoNormalizado(personaje?.saga);
  const mapa = {
    ie1: "/Saga/Ie1.webp",
    ie2: "/Saga/IE2.webp",
    ie3: "/Saga/IE3.webp",
    iego: "/Saga/IE-GO.webp",
    iego_chrono_storm: "/Saga/IE-GO-Chronostones.webp",
    iego_galaxy: "/Saga/IE-GO-Galaxy.png",
  };

  return unico([
    normalizarRutaImagen(personaje?.icono_saga_url),
    mapa[saga],
    "/Saga/Ie1.webp",
  ]);
}

function fuentesClub(personaje) {
  const saga = textoNormalizado(personaje?.saga);
  const clubRaw = String(personaje?.club || "");
  const clubCap = capitalizar(clubRaw);

  return unico([
    normalizarRutaImagen(personaje?.icono_club_url),
    `/clubes/${saga}/${clubCap}.webp`,
    `/clubes/${saga}/${clubRaw}.webp`,
  ]);
}

function PistaIcono({ fuentes, alt }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
  }, [fuentes?.join("|")]);

  if (!fuentes || !fuentes[idx]) {
    return <span className="pista-icono-fallback">Sin icono</span>;
  }

  return (
    <img
      src={fuentes[idx]}
      alt={alt}
      className="pista-icono"
      onError={() => setIdx((prev) => prev + 1)}
    />
  );
}

export default function AdivinarSilueta({ onDailyComplete, bloqueadoDiario = false }) {
  const [personajes, setPersonajes] = useState([]);
  const [personajeActual, setPersonajeActual] = useState(null);
  const [input, setInput] = useState("");
  const [sugerencias, setSugerencias] = useState([]);
  const [feedback, setFeedback] = useState("");
  const [historial, setHistorial] = useState([]);
  const [acertados, setAcertados] = useState([]);
  const [fallos, setFallos] = useState(0);
  const [resuelto, setResuelto] = useState(false);
  const [adivinanzas, setAdivinanzas] = useState([]);
  const [guardadoBackend, setGuardadoBackend] = useState(false);
  const [bloqueadoHoy, setBloqueadoHoy] = useState(false);
  const inicioRef = useRef(Date.now());

  const sesion = cargarSesionLocal();

  const hoyIso = new Date().toISOString().slice(0, 10);

  const guardarResultado = async ({ objetivoDiario, adivinanzasFinales }) => {
    if (guardadoBackend || !objetivoDiario) return;

    const tiempoMs = Date.now() - inicioRef.current;
    const pistasUsadas = Math.max(0, Math.min(3, fallos - 2));

    const payload = {
      modoClave: "silueta",
      dia: hoyIso,
      intentosUsados: fallos + 1,
      pistasUsadas,
      completado: true,
      acertado: true,
      inicio: new Date(inicioRef.current).toISOString(),
      fin: new Date().toISOString(),
      tiempoMs,
      puntuacion: calcularPuntuacion(fallos + 1, pistasUsadas, tiempoMs),
      adivinanzas: adivinanzasFinales,
    };

    console.log('INTENTO_PAYLOAD (silueta):', payload);

    if (!sesion?.token) {
      console.warn('No hay sesión activa: el intento no se enviará al backend');
      setFeedback('Inicia sesión para guardar tu intento.');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/diarios/intentos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sesion.token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setGuardadoBackend(true);
      }
    } catch (e) {
      console.warn('Error enviando intento al backend:', e);
      setFeedback('Error enviando el intento al servidor. Intenta de nuevo.');
    }
  };

  // Removed pending localStorage flush: attempts require an active session and are sent directly to backend.

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/personajes`).then((res) => res.json()),
      fetch(`${API_BASE}/api/diarios/estado?modo=silueta`)
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
    ])
      .then(([data, diario]) => {
        const dataCorregida = data.map((p) => ({
          ...p,
          silueta_url: normalizarRutaImagen(p.silueta_url),
          sprite_url: normalizarRutaImagen(p.sprite_url),
        }));
        setPersonajes(dataCorregida);

        const objetivoId = diario?.personaje?.personaje_id ?? diario?.personaje?.id;
        const seleccionado =
          dataCorregida.find((p) => String(p.id) === String(objetivoId)) ||
          dataCorregida[indiceDiario(dataCorregida.length, `${hoyIso}:silueta`)] ||
          null;

        setPersonajeActual(seleccionado);
        const completadoHoy = Boolean(diario?.intento?.completado || diario?.intento?.acertado || bloqueadoDiario);
        setBloqueadoHoy(completadoHoy);
        if (completadoHoy && seleccionado) {
          setResuelto(true);
          setFeedback("Ya completaste la silueta diaria de hoy. Vuelve mañana.");
        }
        inicioRef.current = Date.now();
      });
  }, [hoyIso]);

  useEffect(() => {
    if (!bloqueadoDiario) return;
    setBloqueadoHoy(true);
    setResuelto(true);
    setFeedback("Ya completaste la silueta diaria de hoy. Vuelve mañana.");
  }, [bloqueadoDiario]);

  const handleInputChange = (e) => {
    if (bloqueadoHoy || resuelto) return;
    const valor = e.target.value;
    setInput(valor);

    if (valor.length === 0) {
      setSugerencias([]);
      return;
    }

    const candidatas = personajes.filter(p => {
      if (acertados.includes(p.id)) return false;
      if (historial.some((h) => textoNormalizado(h.nombre) === textoNormalizado(p.nombre))) return false;
      return coincideNombreAliasOClub(p, valor);
    });

    // Evita mostrar filas duplicadas cuando hay entradas repetidas del mismo nombre.
    const vistas = new Set();
    const coincidenciasUnicas = candidatas.filter((p) => {
      const key = textoNormalizado(p.nombre);
      if (vistas.has(key)) return false;
      vistas.add(key);
      return true;
    });

    setSugerencias(coincidenciasUnicas);
  };

  const handleSeleccion = (personaje) => {
    if (bloqueadoHoy || resuelto) return;
    setInput(personaje.nombre);
    setSugerencias([]);
    comprobarNombre(personaje.nombre);
  };

  const handleKeyDown = (e) => {
    if (bloqueadoHoy || resuelto) {
      e.preventDefault();
      return;
    }

    if (e.key === "Enter" && sugerencias.length > 0) {
      e.preventDefault();
      handleSeleccion(sugerencias[0]);
    }
  };

  const comprobarNombre = (nombre = null) => {
    if (!personajeActual || resuelto || bloqueadoHoy) return;
    const valor = nombre || input.trim();

    if (!valor) return;

    if (esAciertoNombreOAlias(personajeActual, valor)) {
      setFeedback("");
      setAcertados(prev => [...prev, personajeActual.id]);
      setResuelto(true);
      setInput("");
      setSugerencias([]);
      const siguienteAdivinanzas = [
        ...adivinanzas,
        {
          personajeId: personajeActual.id,
          esCorrecta: true,
        },
      ];
      setAdivinanzas(siguienteAdivinanzas);
      void guardarResultado({ objetivoDiario: personajeActual, adivinanzasFinales: siguienteAdivinanzas });
      onDailyComplete?.({
        modoId: "adivinarSilueta",
        personajeNombre: personajeActual.nombre || "",
        personajeSprite: personajeActual.sprite_url || null,
      });
    } else {
      const intentoPersonaje = buscarPersonajePorIntento(personajes, valor);
      setFeedback("Incorrecto ❌ Sigue probando");
      setHistorial((prev) => [
        ...prev,
        {
          nombre: intentoPersonaje?.nombre || valor,
          sprite_url: intentoPersonaje?.sprite_url || null,
        },
      ]);
      setAdivinanzas((prev) => [
        ...prev,
        {
          personajeId: intentoPersonaje?.id || null,
          esCorrecta: false,
        },
      ]);
      setFallos(prev => prev + 1);
      setInput("");
      setSugerencias([]);
    }
  };

  const pistas = [];
  if (personajeActual && fallos >= 3) {
    pistas.push({
      key: "saga",
      titulo: "Pista 1: Saga",
      iconos: [
        {
          fuentes: fuentesSaga(personajeActual),
          alt: `Saga de ${personajeActual.nombre}`,
        },
      ],
    });
  }
  if (personajeActual && fallos >= 4) {
    pistas.push({
      key: "posicion-afinidad",
      titulo: "Pista 2: Posición y Afinidad",
      iconos: [
        {
          src: personajeActual.icono_posicion_url,
          alt: `Posición de ${personajeActual.nombre}`,
        },
        {
          src: personajeActual.icono_elemento_url,
          alt: `Afinidad de ${personajeActual.nombre}`,
        },
      ],
    });
  }
  if (personajeActual && fallos >= 5) {
    pistas.push({
      key: "club",
      titulo: "Pista 3: Equipo",
      iconos: [
        {
          fuentes: fuentesClub(personajeActual),
          alt: `Club de ${personajeActual.nombre}`,
          texto: formatearEtiquetaClub(personajeActual.club),
        },
      ],
    });
  }

  if (!personajeActual) return <p style={{ textAlign: "center" }}>{feedback || "Cargando personaje..."}</p>;

  const juegoBloqueado = bloqueadoHoy || resuelto;

  return (
    <div className="adivinar-container">
      <div className="adivinar-panel">
        <h2 className="adivinar-title">Modo Silueta</h2>
        <p className="adivinar-subtitle">Adivina el personaje con pistas progresivas</p>

        {juegoBloqueado && (
          <p className="feedback-msg">Ya completaste la silueta diaria de hoy. Vuelve mañana.</p>
        )}

        <div className="estado-linea">
          <span>Fallos: <strong>{fallos}</strong></span>
          <span>Acertados: <strong>{acertados.length}</strong></span>
        </div>

        <div className="silueta-frame">
          <img src={personajeActual.silueta_url} alt="Silueta" className="adivinar-silueta" />
        </div>

        <div className="adivinar-input-container">
          <input
            type="text"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Escribe el nombre del personaje"
            className="adivinar-input"
            disabled={juegoBloqueado}
          />
          <button onClick={() => comprobarNombre()} className="adivinar-button" disabled={juegoBloqueado}>Comprobar</button>

          {sugerencias.length > 0 && !juegoBloqueado && (
            <div className="sugerencias-list">
              {sugerencias.map(p => (
                <div key={p.id} className="sugerencia-item" onClick={() => handleSeleccion(p)}>
                  <img src={p.sprite_url} alt={p.nombre} />
                  <span>{p.nombre}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {feedback && <p className="feedback-msg">{feedback}</p>}

        <div className="pistas-box">
          <h4>Pistas desbloqueadas</h4>
          {pistas.length === 0 && (
            <p className="pistas-placeholder">Sin pistas por ahora. Se desbloquean al fallar intentos.</p>
          )}
          {pistas.map((pista) => (
            <div className="pista-item" key={pista.key}>
              <span className="pista-titulo">{pista.titulo}</span>
              <div className="pista-iconos">
                {pista.iconos?.map((icono, idx) => (
                  <div key={`${pista.key}-${idx}`} className="pista-icono-item">
                    <PistaIcono
                      fuentes={icono.fuentes || unico([normalizarRutaImagen(icono.src)])}
                      alt={icono.alt}
                    />
                    {icono.texto && <span className="pista-icono-label">{icono.texto}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {historial.length > 0 && (
          <div className="historial">
            <h4>Intentos fallidos</h4>
            <div className="historial-list">
              {historial.map((h, i) => (
                <div key={`${h.nombre}-${i}`} className="historial-item">
                  {h.sprite_url ? (
                    <img src={h.sprite_url} alt={h.nombre} className="historial-sprite" />
                  ) : (
                    <span className="historial-fallback">?</span>
                  )}
                  <span>{h.nombre}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
