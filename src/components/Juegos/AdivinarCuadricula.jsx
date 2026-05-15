import { useEffect, useMemo, useRef, useState } from "react";
import "./AdivinarCuadricula.css";
import { API_BASE } from "../../config";
import { assetUrl } from "../../helpers/assetUrl";

const AUTH_SESSION_KEY = "inazudle.auth.session.v1";
const CUADRICULA_CACHE_KEY = "inazudle.daily.cuadricula.v1";
const GRID_SIZE = 3;
const ATRIBUTOS_TABLERO = ["club", "elemento", "posicion", "saga"];

function normalizarRutaImagen(url) {
  if (!url) return url;
  const normalized = String(url)
    .replace(/^\/Personajes\//i, "/personajes/")
    .replace(/^\/Siluetas\//i, "/siluetas/")
    .replace(/^\/Clubes\//i, "/clubes/")
    .replace(/^\/saga\//i, "/Saga/");
  return assetUrl(normalized);
}

function texto(v) {
  return String(v || "").trim().toLowerCase();
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

function hashSemilla(textoSemilla) {
  let hash = 2166136261;
  for (let i = 0; i < textoSemilla.length; i += 1) {
    hash ^= textoSemilla.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function crearRng(textoSemilla) {
  let estado = hashSemilla(textoSemilla) || 1;
  return () => {
    estado = (1664525 * estado + 1013904223) >>> 0;
    return estado / 4294967296;
  };
}

function normalizarCodigoSaga(v) {
  return texto(v)
    .replace(/\s+/g, "_")
    .replace(/-/g, "_")
    .replace(/chrono\s*stones?/g, "chrono_storm");
}

function iconoSagaPorCodigo(saga) {
  const code = normalizarCodigoSaga(saga);
  const map = {
    ie1: "/Saga/Ie1.webp",
    ie2: "/Saga/IE2.webp",
    ie3: "/Saga/IE3.webp",
    iego: "/Saga/IE-GO.webp",
    iego_chrono_storm: "/Saga/IE-GO-Chronostones.webp",
    iego_galaxy: "/Saga/IE-GO-Galaxy.png",
  };
  return assetUrl(map[code] || "/Saga/Ie1.webp");
}

function formatearEtiqueta(v) {
  const normalizado = String(v || "-").replace(/_/g, " ");
  return normalizado.charAt(0).toUpperCase() + normalizado.slice(1).toLowerCase();
}

function coincideFiltro(personaje, query) {
  const q = texto(query);
  if (!q) return false;
  return (
    texto(personaje.nombre).includes(q) ||
    texto(personaje.alias).includes(q) ||
    texto(personaje.club).includes(q)
  );
}

function barajar(lista, rng = Math.random) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function obtenerIconoAtributo(attr, personaje) {
  if (!personaje) return null;
  if (attr === "club") return personaje.icono_club_url;
  if (attr === "elemento") return personaje.icono_elemento_url;
  if (attr === "posicion") return personaje.icono_posicion_url;
  if (attr === "saga") return iconoSagaPorCodigo(personaje.saga);
  return null;
}

function clavePista(attr, value) {
  return `${attr}:${texto(value)}`;
}

function construirPistas(personajes) {
  const pistas = [];

  for (const attr of ATRIBUTOS_TABLERO) {
    const valores = [...new Set(personajes.map((p) => texto(p[attr])).filter(Boolean))];
    for (const value of valores) {
      const ejemplo = personajes.find((p) => texto(p[attr]) === value) || null;
      pistas.push({
        attr,
        value,
        label: formatearEtiqueta(value),
        icon: attr === "saga" ? iconoSagaPorCodigo(value) : obtenerIconoAtributo(attr, ejemplo),
      });
    }
  }

  return pistas;
}

function pistaDesdeDefinicion(definicion, personajes) {
  const ejemplo = personajes.find((p) => texto(p[definicion.attr]) === texto(definicion.value)) || null;
  return {
    attr: definicion.attr,
    value: definicion.value,
    label: formatearEtiqueta(definicion.value),
    icon:
      definicion.attr === "saga"
        ? iconoSagaPorCodigo(definicion.value)
        : obtenerIconoAtributo(definicion.attr, ejemplo),
  };
}

function reconstruirTablero(personajes, tableroGuardado) {
  if (!tableroGuardado?.filas?.length || !tableroGuardado?.columnas?.length) return null;

  const filas = tableroGuardado.filas.map((def) => pistaDesdeDefinicion(def, personajes));
  const columnas = tableroGuardado.columnas.map((def) => pistaDesdeDefinicion(def, personajes));
  const mapaCruces = new Map();

  for (let rowIdx = 0; rowIdx < GRID_SIZE; rowIdx += 1) {
    for (let colIdx = 0; colIdx < GRID_SIZE; colIdx += 1) {
      const fila = filas[rowIdx];
      const columna = columnas[colIdx];
      mapaCruces.set(`${rowIdx}-${colIdx}`, candidatosDeCruce(personajes, fila, columna));
    }
  }

  return { filas, columnas, mapaCruces };
}

function guardarTableroCache(dia, tablero) {
  try {
    localStorage.setItem(
      CUADRICULA_CACHE_KEY,
      JSON.stringify({
        dia,
        filas: tablero.filas.map((p) => ({ attr: p.attr, value: p.value })),
        columnas: tablero.columnas.map((p) => ({ attr: p.attr, value: p.value })),
      })
    );
  } catch {
    // cache opcional
  }
}

function cargarTableroCache(dia) {
  try {
    const raw = localStorage.getItem(CUADRICULA_CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.dia !== dia) return null;
    return data;
  } catch {
    return null;
  }
}

function candidatosDeCruce(personajes, fila, columna) {
  return personajes.filter(
    (p) => texto(p[fila.attr]) === texto(fila.value) && texto(p[columna.attr]) === texto(columna.value)
  );
}

function generarTablero(personajes, semilla = "cuadricula") {
  const rng = crearRng(semilla);
  const pistas = construirPistas(personajes);
  if (pistas.length < GRID_SIZE * 2) return null;

  // Intentar generar tableros con pistas completamente aleatorias (mix de atributos)
  for (let intento = 0; intento < 400; intento += 1) {
    const pistasMezcladas = barajar(pistas, rng);
    
    // Tomar 3 pistas aleatorias para filas (pueden ser de atributos diferentes)
    const filas = pistasMezcladas.slice(0, GRID_SIZE);
    
    // Garantizar que las columnas sean diferentes a las filas (sin repetir pista)
    const pistasDisponibles = pistas.filter((p) => 
      !filas.some((f) => clavePista(f.attr, f.value) === clavePista(p.attr, p.value))
    );
    
    if (pistasDisponibles.length < GRID_SIZE) continue;
    
    const columnasDisponibles = pistasDisponibles.filter((columna) =>
      filas.every((fila) => candidatosDeCruce(personajes, fila, columna).length > 0)
    );

    if (columnasDisponibles.length < GRID_SIZE) continue;

    const columnas = barajar(columnasDisponibles, rng).slice(0, GRID_SIZE);

    const mapaCruces = new Map();

    for (let rowIdx = 0; rowIdx < GRID_SIZE; rowIdx++) {
      for (let colIdx = 0; colIdx < GRID_SIZE; colIdx++) {
        const fila = filas[rowIdx];
        const columna = columnas[colIdx];
        const candidatos = candidatosDeCruce(personajes, fila, columna);
        mapaCruces.set(`${rowIdx}-${colIdx}`, candidatos);
      }
    }

    if (!esEstadoResolubleSinRepetir({ mapaCruces }, {})) {
      continue;
    }

    return { filas, columnas, mapaCruces };
  }

  return null;
}

function keyCelda(row, col) {
  return `${row}-${col}`;
}

function keyPersonaje(p) {
  if (!p) return "";
  if (p.id !== undefined && p.id !== null) return String(p.id);
  return `${texto(p.nombre)}|${texto(p.club)}|${texto(p.saga)}`;
}

function backtrackingAsignacion(celdasPendientes, mapaCruces, usadosIniciales) {
  const usados = new Set(usadosIniciales);

  const resolver = (restantes) => {
    if (!restantes.length) return true;

    const ordenadas = [...restantes].sort((a, b) => {
      const ca = (mapaCruces.get(a) || []).filter((p) => !usados.has(keyPersonaje(p))).length;
      const cb = (mapaCruces.get(b) || []).filter((p) => !usados.has(keyPersonaje(p))).length;
      return ca - cb;
    });

    const celda = ordenadas[0];
    const candidatos = (mapaCruces.get(celda) || []).filter((p) => !usados.has(keyPersonaje(p)));
    if (!candidatos.length) return false;

    const siguientes = ordenadas.slice(1);
    for (const candidato of candidatos) {
      const k = keyPersonaje(candidato);
      usados.add(k);
      if (resolver(siguientes)) return true;
      usados.delete(k);
    }

    return false;
  };

  return resolver(celdasPendientes);
}

function esEstadoResolubleSinRepetir(tablero, celdas, intentoExtra = null) {
  if (!tablero?.mapaCruces) return false;

  const usados = new Set();
  const resueltas = new Set();

  for (const [k, celda] of Object.entries(celdas || {})) {
    if (celda?.estado === "ok" && celda?.personaje) {
      usados.add(keyPersonaje(celda.personaje));
      resueltas.add(k);
    }
  }

  if (intentoExtra?.key && intentoExtra?.personaje) {
    usados.add(keyPersonaje(intentoExtra.personaje));
    resueltas.add(intentoExtra.key);
  }

  const pendientes = [];
  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      const k = keyCelda(row, col);
      if (!resueltas.has(k)) pendientes.push(k);
    }
  }

  return backtrackingAsignacion(pendientes, tablero.mapaCruces, usados);
}

export default function AdivinarCuadricula({ onDailyComplete, bloqueadoDiario = false }) {
  const [personajes, setPersonajes] = useState([]);
  const [tablero, setTablero] = useState(null);
  const [celdas, setCeldas] = useState({});
  const [activa, setActiva] = useState(null);
  const [input, setInput] = useState("");
  const [sugerencias, setSugerencias] = useState([]);
  const [aciertos, setAciertos] = useState(0);
  const [fallos, setFallos] = useState(0);
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const inicioRef = useRef(Date.now());
  const resultadoNotificadoRef = useRef(false);

  const sesion = cargarSesionLocal();
  const hoyIso = new Date().toISOString().slice(0, 10);
  const semillaDiaria = `${hoyIso}:cuadricula`;

  const prepararTablero = (listaPersonajes) => {
    const nuevo = generarTablero(listaPersonajes, semillaDiaria);
    setTablero(nuevo);
    if (!nuevo) {
      setErrorCarga("No se pudo generar una cuadricula valida. Pulsa en Reintentar.");
    } else {
      setErrorCarga("");
    }
  };

  const guardarResultado = async ({ adivinanzasFinales, completado = false, acertado = false, intentosUsados }) => {

    const tiempoMs = Date.now() - inicioRef.current;

    const payload = {
      modoClave: "cuadricula",
      dia: hoyIso,
      intentosUsados: intentosUsados ?? (aciertos + fallos),
      pistasUsadas: 0,
      completado,
      acertado,
      inicio: new Date(inicioRef.current).toISOString(),
      fin: new Date().toISOString(),
      tiempoMs,
      puntuacion: Math.max(0, 1000 - fallos * 40 - Math.floor(tiempoMs / 1000)),
      adivinanzas: adivinanzasFinales,
    };

    console.log('INTENTO_PAYLOAD (cuadricula):', payload);

    if (!sesion?.token) {
      console.warn('No hay sesión activa: el intento no se enviará al backend');
      setMensaje('Inicia sesión para guardar tu intento.');
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

      if (res.ok && completado && acertado) {
        // cierre final persistido
      }
    } catch (e) {
      console.warn('Error enviando intento al backend:', e);
      setMensaje('Error enviando el intento al servidor. Intenta de nuevo.');
    }
  };

  // Removed localStorage pending attempts logic — attempts require session and are sent directly to backend.

  useEffect(() => {
    setCargando(true);
    setErrorCarga("");

    fetch(`${API_BASE}/api/personajes`)
      .then((res) => res.json())
      .then((data) => {
        const limpia = data.map((p) => ({
          ...p,
          sprite_url: normalizarRutaImagen(p.sprite_url),
          icono_club_url: normalizarRutaImagen(p.icono_club_url),
          icono_posicion_url: normalizarRutaImagen(p.icono_posicion_url),
          icono_elemento_url: normalizarRutaImagen(p.icono_elemento_url),
          icono_saga_url: iconoSagaPorCodigo(p.saga),
        }));

        setPersonajes(limpia);

        const cache = cargarTableroCache(hoyIso);
        const tableroCacheado = cache ? reconstruirTablero(limpia, cache) : null;

        if (tableroCacheado) {
          setTablero(tableroCacheado);
          setErrorCarga("");
        } else {
          const nuevo = generarTablero(limpia, semillaDiaria);
          setTablero(nuevo);
          if (nuevo) {
            guardarTableroCache(hoyIso, nuevo);
            setErrorCarga("");
          } else {
            setErrorCarga("No se pudo generar una cuadricula valida. Pulsa en Reintentar.");
          }
        }

        inicioRef.current = Date.now();
      })
      .catch(() => {
        setErrorCarga("No se pudieron cargar los personajes. Intenta de nuevo.");
      })
      .finally(() => {
        setCargando(false);
      });
  }, [hoyIso]);

  useEffect(() => {
    if (!bloqueadoDiario) return;
    setMensaje("Ya completaste la cuadricula diaria de hoy. Vuelve mañana.");
  }, [bloqueadoDiario]);

  const usados = useMemo(
    () =>
      new Set(
        Object.values(celdas)
          .filter((c) => c?.estado === "ok" && c?.personaje)
          .map((c) => keyPersonaje(c.personaje))
      ),
    [celdas]
  );

  const actualizarSugerencias = (valor) => {
    if (!tablero || !activa || !valor.trim()) {
      setSugerencias([]);
      return;
    }

    const lista = [];
    const nombres = new Set();

    for (const p of personajes) {
      if (!coincideFiltro(p, valor)) continue;
      const keyNombre = texto(p.nombre);
      if (nombres.has(keyNombre)) continue;
      nombres.add(keyNombre);
      lista.push(p);
      if (lista.length >= 12) break;
    }

    setSugerencias(lista);
  };

  const marcarFallo = (row, col, nombreIntentado) => {
    const k = keyCelda(row, col);
    setCeldas((prev) => ({
      ...prev,
      [k]: {
        ...(prev[k] || {}),
        estado: "fail",
        intento: nombreIntentado,
      },
    }));
    setFallos((prev) => prev + 1);

    void guardarResultado({
      adivinanzasFinales: Object.values(celdas)
        .filter((celda) => celda?.personaje?.id)
        .map((celda) => ({
          personajeId: celda.personaje.id,
          esCorrecta: celda.estado === "ok",
        }))
        .concat([{ personajeId: null, esCorrecta: false }]),
      completado: false,
      acertado: false,
      intentosUsados: aciertos + fallos + 1,
    });
  };

  const comprobarEnCasilla = (personaje) => {
    if (!tablero || !activa || !personaje) return;

    const row = activa.row;
    const col = activa.col;
    const k = keyCelda(row, col);

    if (celdas[k]?.estado === "ok") return;
    const personajeKey = keyPersonaje(personaje);
    if (usados.has(personajeKey)) {
      setMensaje("Ese personaje ya fue usado en otra casilla.");
      marcarFallo(row, col, personaje.nombre);
      return;
    }

    const fila = tablero.filas[row];
    const columna = tablero.columnas[col];
    const esCorrecto =
      texto(personaje[fila.attr]) === texto(fila.value) &&
      texto(personaje[columna.attr]) === texto(columna.value);

    if (esCorrecto) {
      const estadoSigueResoluble = esEstadoResolubleSinRepetir(tablero, celdas, {
        key: k,
        personaje,
      });

      if (!estadoSigueResoluble) {
        setMensaje("Ese acierto bloquearia el tablero. Prueba otro jugador para esta casilla.");
        marcarFallo(row, col, personaje.nombre);
        setInput("");
        setSugerencias([]);
        return;
      }

      setCeldas((prev) => ({
        ...prev,
        [k]: {
          estado: "ok",
          personaje,
        },
      }));
      setAciertos((prev) => prev + 1);
      setMensaje(`Acierto: ${personaje.nombre}`);

      void guardarResultado({
        adivinanzasFinales: Object.values(celdas)
          .filter((celda) => celda?.personaje?.id)
          .map((celda) => ({
            personajeId: celda.personaje.id,
            esCorrecta: celda.estado === "ok",
          }))
          .concat([{ personajeId: personaje.id, esCorrecta: true }]),
        completado: false,
        acertado: false,
        intentosUsados: aciertos + fallos + 1,
      });
    } else {
      marcarFallo(row, col, personaje.nombre);
      setMensaje(`Fallo: ${personaje.nombre}`);
    }

    setInput("");
    setSugerencias([]);
  };

  const comprobarManual = () => {
    if (!activa) return;

    const valor = texto(input);
    if (!valor) return;

    const encontrado = personajes.find(
      (p) => texto(p.nombre) === valor || texto(p.alias) === valor
    );

    if (!encontrado) {
      marcarFallo(activa.row, activa.col, input);
      setMensaje(`Fallo: ${input}`);
      setInput("");
      setSugerencias([]);
      return;
    }

    comprobarEnCasilla(encontrado);
  };

  const seleccionarCasilla = (row, col) => {
    setActiva({ row, col });
    setInput("");
    setSugerencias([]);
  };

  const nuevaCuadricula = () => {
    if (!personajes.length) return;
    const nuevo = generarTablero(personajes, semillaDiaria);
    setTablero(nuevo);
    if (nuevo) {
      guardarTableroCache(hoyIso, nuevo);
      setErrorCarga("");
    } else {
      setErrorCarga("No se pudo generar una cuadricula valida. Pulsa en Reintentar.");
    }
    setCeldas({});
    setActiva(null);
    setInput("");
    setSugerencias([]);
    setAciertos(0);
    setFallos(0);
    setMensaje("");
  };

  const ganado = aciertos >= GRID_SIZE * GRID_SIZE;
  const juegoBloqueado = bloqueadoDiario || ganado;

  useEffect(() => {
    if (!ganado || resultadoNotificadoRef.current) return;
    resultadoNotificadoRef.current = true;
    const adivinanzasFinales = Object.values(celdas)
      .filter((celda) => celda?.personaje?.id)
      .map((celda) => ({
        personajeId: celda.personaje.id,
        esCorrecta: true,
      }));

    void guardarResultado({
      adivinanzasFinales,
      completado: true,
      acertado: true,
      intentosUsados: aciertos + fallos,
    });
    onDailyComplete?.({
      modoId: "adivinarCuadricula",
      victoriaTitulo: "VICTORIA",
      victoriaMensaje: "Has completado la cuadricula 3x3.",
      hideCharacter: true,
    });
  }, [ganado, onDailyComplete, celdas]);

  if (cargando) {
    return <p className="acg-loading">Preparando tablero 3x3...</p>;
  }

  if (!tablero) {
    return (
      <div className="acg-wrap">
        <div className="acg-panel">
          <h2>Cuadricula 3x3</h2>
          <p className="acg-message">{errorCarga || "No hay tablero disponible."}</p>
          <div className="acg-score">
            <button onClick={nuevaCuadricula} disabled={!personajes.length}>Reintentar</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="acg-wrap">
      <div className="acg-panel">
        <h2>Cuadricula 3x3</h2>
        <p className="acg-subtitle">Pulsa una casilla y adivina el jugador correcto.</p>

        {bloqueadoDiario && !ganado && (
          <p className="acg-message">Ya completaste la cuadricula diaria de hoy. Vuelve mañana.</p>
        )}

        <div className="acg-score">
          <span>Aciertos: {aciertos}/9</span>
          <span>Fallos: {fallos}</span>
          <button onClick={nuevaCuadricula} disabled={juegoBloqueado}>Nuevo tablero</button>
        </div>

        <div className="acg-grid" role="grid" aria-label="Cuadricula de adivinanza">
          <div className="acg-corner" />
          {tablero.columnas.map((col, idx) => (
            <div key={`col-${idx}`} className="acg-header acg-header-col">
              {col.icon && (
                <img
                  src={col.icon}
                  alt={col.label}
                  onError={(e) => {
                    if (col.attr === "saga") {
                      e.currentTarget.src = iconoSagaPorCodigo(col.value);
                    }
                  }}
                />
              )}
              <span>{col.label}</span>
            </div>
          ))}

          {tablero.filas.map((fila, rowIdx) => (
            <div className="acg-row" key={`row-${rowIdx}`}>
              <div className="acg-header acg-header-row">
                {fila.icon && (
                  <img
                    src={fila.icon}
                    alt={fila.label}
                    onError={(e) => {
                      if (fila.attr === "saga") {
                        e.currentTarget.src = iconoSagaPorCodigo(fila.value);
                      }
                    }}
                  />
                )}
                <span>{fila.label}</span>
              </div>

              {tablero.columnas.map((_, colIdx) => {
                const k = keyCelda(rowIdx, colIdx);
                const estado = celdas[k]?.estado || "empty";
                const esActiva = activa?.row === rowIdx && activa?.col === colIdx;
                const textoIntento = celdas[k]?.intento;
                const personaje = celdas[k]?.personaje;

                return (
                  <button
                    key={k}
                    className={`acg-cell acg-${estado} ${esActiva ? "acg-active" : ""}`}
                    onClick={() => seleccionarCasilla(rowIdx, colIdx)}
                      disabled={juegoBloqueado}
                  >
                    {estado === "ok" && personaje ? (
                      <>
                        <img src={personaje.sprite_url} alt={personaje.nombre} />
                        <span>{personaje.nombre}</span>
                      </>
                    ) : estado === "fail" ? (
                      <span className="acg-fail-label">✖ {textoIntento}</span>
                    ) : (
                      <span className="acg-plus">+</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="acg-input-area">
          {activa ? (
            <p className="acg-active-hint">
              Casilla activa: <strong>{tablero.filas[activa.row].label}</strong> + <strong>{tablero.columnas[activa.col].label}</strong>
            </p>
          ) : (
            <p className="acg-active-hint">Selecciona una casilla para empezar.</p>
          )}

          <div className="acg-search">
            <input
              type="text"
              placeholder="Escribe nombre o alias"
              value={input}
              onChange={(e) => {
                const valor = e.target.value;
                setInput(valor);
                actualizarSugerencias(valor);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (sugerencias[0]) comprobarEnCasilla(sugerencias[0]);
                  else comprobarManual();
                }
              }}
              disabled={!activa || juegoBloqueado}
            />
            <button onClick={comprobarManual} disabled={!activa || juegoBloqueado || !input.trim()}>
              Comprobar
            </button>
          </div>

          {sugerencias.length > 0 && (
            <div className="acg-suggestions">
              {sugerencias.map((p) => (
                <button key={p.id} className="acg-suggestion" onClick={() => comprobarEnCasilla(p)}>
                  <img src={p.sprite_url} alt={p.nombre} />
                  <span>{p.nombre}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {mensaje && <p className="acg-message">{mensaje}</p>}

      </div>
    </div>
  );
}
