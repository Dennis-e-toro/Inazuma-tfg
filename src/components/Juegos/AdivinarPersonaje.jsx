import { useEffect, useMemo, useRef, useState } from "react";
import "./AdivinarPersonaje.css";
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

function texto(v) {
  return String(v || "").trim().toLowerCase();
}

function iconoSagaPorCodigo(saga) {
  const code = texto(saga);
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

function coincideFiltro(personaje, query) {
  const q = texto(query);
  if (!q) return false;
  return (
    texto(personaje.nombre).includes(q) ||
    texto(personaje.alias).includes(q) ||
    texto(personaje.club).includes(q)
  );
}

function formatearClub(v) {
  return String(v || "-")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function claseComparacion(a, b) {
  if ((a ?? null) === null && (b ?? null) === null) return "hint-unknown";
  return texto(a) === texto(b) ? "hint-ok" : "hint-bad";
}

function claseComparacionBool(a, b) {
  if (typeof a !== "boolean" || typeof b !== "boolean") return "hint-unknown";
  return a === b ? "hint-ok" : "hint-bad";
}

function indiceDiario(total) {
  if (!Number.isFinite(total) || total <= 0) return 0;
  const hoy = new Date().toISOString().slice(0, 10);
  let hash = 0;
  for (let i = 0; i < hoy.length; i += 1) {
    hash = (hash * 31 + hoy.charCodeAt(i)) % 2147483647;
  }
  return hash % total;
}

function boolLabel(v) {
  return v ? "Si" : "No";
}

function cargarSesionLocal() {
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.token) return null;
    return { token: String(data.token), username: String(data.username || "") };
  } catch {
    return null;
  }
}

function calcularPuntuacion(intentosUsados, pistasUsadas, tiempoMs) {
  const base = 1000;
  const penalizacionIntentos = Math.max(0, (Number(intentosUsados) || 0) - 1) * 120;
  const penalizacionPistas = Math.max(0, Number(pistasUsadas) || 0) * 80;
  const penalizacionTiempo = Math.max(0, Math.floor((Number(tiempoMs) || 0) / 1000));
  return Math.max(0, base - penalizacionIntentos - penalizacionPistas - penalizacionTiempo);
}

export default function AdivinarPersonaje({ onDailyComplete, bloqueadoDiario = false }) {
  const [personajes, setPersonajes] = useState([]);
  const [objetivo, setObjetivo] = useState(null);
  const [input, setInput] = useState("");
  const [sugerencias, setSugerencias] = useState([]);
  const [intentos, setIntentos] = useState([]);
  const [acertado, setAcertado] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [mensajeIntento, setMensajeIntento] = useState("");
  const [bloqueadoHoy, setBloqueadoHoy] = useState(false);
  const inicioRef = useRef(0);
  const resultadoNotificadoRef = useRef(false);

  const sesion = cargarSesionLocal();
  const hoyIso = new Date().toISOString().slice(0, 10);

  const guardarResultado = async ({ intentosGanadores, objetivoDiario, completado = false, acertado = false }) => {
    if (!objetivoDiario) return;

    const tiempoMs = Date.now() - inicioRef.current;
    const payload = {
      modoClave: "normal",
      dia: hoyIso,
      intentosUsados: intentosGanadores.length,
      pistasUsadas: 0,
      completado,
      acertado,
      inicio: new Date(inicioRef.current).toISOString(),
      fin: new Date().toISOString(),
      tiempoMs,
      puntuacion: calcularPuntuacion(intentosGanadores.length, 0, tiempoMs),
      adivinanzas: intentosGanadores.map((item) => ({
        personajeId: item.id,
        esCorrecta: texto(item.nombre) === texto(objetivoDiario.nombre),
      })),
    };

    console.log('INTENTO_PAYLOAD (normal):', payload);

    if (!sesion?.token) {
      console.warn('No hay sesión activa: el intento no se enviará al backend');
      setMensajeIntento('Inicia sesión para guardar tu intento.');
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

      if (!res.ok) {
        let detalle = `HTTP ${res.status}`;
        try {
          const data = await res.json();
          if (data?.error) detalle = data.error;
        } catch {
          // noop
        }
        console.warn('Error guardando intento (normal):', detalle);
        setMensajeIntento(`No se pudo guardar el intento: ${detalle}`);
        return;
      }

      if (res.ok && completado && acertado) {
        // el cierre final ya se persistió; no hacemos nada extra
      }
    } catch (e) {
      console.warn('Error enviando intento al backend:', e);
      setMensajeIntento('Error enviando el intento al servidor. Intenta de nuevo.');
    }
  };

  useEffect(() => {
    setCargando(true);
    setErrorCarga("");

    Promise.all([
      fetch(`${API_BASE}/api/personajes`).then((res) => {
        if (!res.ok) {
          throw new Error("No se pudieron cargar los personajes.");
        }
        return res.json();
      }),
      fetch(`${API_BASE}/api/diarios/estado?modo=normal`)
        .then((res) => res.ok ? res.json() : null)
        .catch(() => null),
    ])
      .then(([data, diario]) => {
        const limpia = data.map((p) => ({
          ...p,
          sprite_url: normalizarRutaImagen(p.sprite_url),
          icono_club_url: normalizarRutaImagen(p.icono_club_url),
          icono_posicion_url: normalizarRutaImagen(p.icono_posicion_url),
          icono_elemento_url: normalizarRutaImagen(p.icono_elemento_url),
          icono_saga_url: iconoSagaPorCodigo(p.saga),
          genero_url: normalizarRutaImagen(p.genero_url),
        }));

        if (!limpia.length) {
          throw new Error("No hay personajes disponibles.");
        }

        setPersonajes(limpia);

        const objetivoId = diario?.personaje?.personaje_id ?? diario?.personaje?.id;
        const diarioEncontrado =
          limpia.find((p) => String(p.id) === String(objetivoId)) ||
          limpia[indiceDiario(limpia.length)] ||
          null;

        console.log("[AdivinarPersonaje] Personaje diario de hoy:", {
          modo: "normal",
          dia: hoyIso,
          objetivoId,
          personaje: diarioEncontrado
            ? {
                id: diarioEncontrado.id,
                nombre: diarioEncontrado.nombre,
                alias: diarioEncontrado.alias,
                saga: diarioEncontrado.saga,
                club: diarioEncontrado.club,
              }
            : null,
        });

        const completadoHoy = Boolean(diario?.intento?.completado || diario?.intento?.acertado || bloqueadoDiario);

        setObjetivo(diarioEncontrado);
        setBloqueadoHoy(completadoHoy);
        if (completadoHoy) {
          setAcertado(true);
          setMensajeIntento("Ya completaste el personaje diario de hoy. Vuelve mañana.");
        }
        inicioRef.current = Date.now();
      })
      .catch((err) => {
        setErrorCarga(err?.message || "Error al cargar el panel.");
      })
      .finally(() => {
        setCargando(false);
      });
  }, [hoyIso]);

  useEffect(() => {
    if (!bloqueadoDiario) return;
    setBloqueadoHoy(true);
    setAcertado(true);
    setMensajeIntento("Ya completaste el personaje diario de hoy. Vuelve mañana.");
  }, [bloqueadoDiario]);

  const nombresIntentados = useMemo(
    () => new Set(intentos.map((i) => texto(i.nombre))),
    [intentos]
  );

  const actualizarSugerencias = (valor) => {
    if (bloqueadoHoy || !valor.trim()) {
      setSugerencias([]);
      return;
    }

    const unicos = new Set();
    const lista = personajes
      .filter((p) => !nombresIntentados.has(texto(p.nombre)))
      .filter((p) => coincideFiltro(p, valor))
      .filter((p) => {
        const k = texto(p.nombre);
        if (unicos.has(k)) return false;
        unicos.add(k);
        return true;
      })
      .slice(0, 12);

    setSugerencias(lista);
  };

  const handleInput = (e) => {
    const valor = e.target.value;
    if (bloqueadoHoy) return;
    setInput(valor);
    setMensajeIntento("");
    actualizarSugerencias(valor);
  };

  const procesarIntento = (seleccionado) => {
    if (!seleccionado || !objetivo || acertado || bloqueadoHoy) return;

    const nombreSeleccionado = texto(seleccionado.nombre);
    if (!nombreSeleccionado) {
      setMensajeIntento("Ese personaje no tiene nombre valido para intentar.");
      return;
    }

    if (nombresIntentados.has(nombreSeleccionado)) {
      setMensajeIntento("Ese personaje ya fue intentado.");
      return;
    }

    const nuevosIntentos = [seleccionado, ...intentos];
    setIntentos(nuevosIntentos);
    setInput("");
    setSugerencias([]);
    setMensajeIntento("");

    void guardarResultado({
      intentosGanadores: nuevosIntentos,
      objetivoDiario: objetivo,
      completado: false,
      acertado: false,
    });

    if (nombreSeleccionado === texto(objetivo.nombre)) {
      setAcertado(true);
      void guardarResultado({
        intentosGanadores: nuevosIntentos,
        objetivoDiario: objetivo,
        completado: true,
        acertado: true,
      });
    }
  };

  const comprobarManual = () => {
    if (bloqueadoHoy) {
      setMensajeIntento("Ya completaste el personaje diario de hoy. Vuelve mañana.");
      return;
    }

    const query = texto(input);
    if (!query) {
      setSugerencias([]);
      setMensajeIntento("Escribe un nombre o alias antes de comprobar.");
      return;
    }

    const encontrado = personajes.find(
      (p) => texto(p.nombre) === query || texto(p.alias) === query
    );
    if (!encontrado) {
      setMensajeIntento("No se encontro ese personaje en la lista.");
      return;
    }

    procesarIntento(encontrado);
  };

  useEffect(() => {
    if (!acertado || resultadoNotificadoRef.current) return;
    resultadoNotificadoRef.current = true;
    const tiempoMs = Date.now() - inicioRef.current;
    onDailyComplete?.({
      modoId: "adivinarPersonaje",
      personajeNombre: objetivo?.nombre || "",
      personajeSprite: objetivo?.sprite_url || null,
      tiempoMs,
      intentosUsados: intentos.length,
      puntuacion: calcularPuntuacion(intentos.length, 0, tiempoMs),
    });
  }, [acertado, onDailyComplete, objetivo, intentos.length]);

  if (cargando) {
    return <p className="ap-loading">Cargando personajes...</p>;
  }

  if (errorCarga) {
    return <p className="ap-loading">{errorCarga}</p>;
  }

  if (!objetivo) {
    return <p className="ap-loading">No se pudo inicializar la ronda.</p>;
  }

  const juegoBloqueado = bloqueadoHoy || acertado;

  return (
    <div className="ap-wrap">
      <div className="ap-panel">
        <h2>Adivina el Personaje</h2>
        <p className="ap-subtitle">Encuentra al personaje oculto comparando pistas por intento</p>

        {juegoBloqueado && (
          <p className="ap-feedback">Ya completaste el personaje diario de hoy. Vuelve mañana.</p>
        )}

        <div className="ap-search">
          <input
            type="text"
            value={input}
            onChange={handleInput}
            aria-label="Buscar personaje"
            aria-autocomplete="list"
            aria-expanded={sugerencias.length > 0 && !juegoBloqueado}
            disabled={juegoBloqueado}
            onKeyDown={(e) => {
              if (juegoBloqueado) {
                e.preventDefault();
                return;
              }
              if (e.key === "Enter") {
                e.preventDefault();
                if (!texto(input)) {
                  setSugerencias([]);
                  setMensajeIntento("Escribe un nombre o alias antes de comprobar.");
                  return;
                }
                if (sugerencias[0]) procesarIntento(sugerencias[0]);
                else comprobarManual();
              }
            }}
            placeholder="Nombre, alias o equipo..."
          />
          <button onClick={comprobarManual} disabled={juegoBloqueado}>Comprobar</button>

          {sugerencias.length > 0 && !juegoBloqueado && (
            <div className="ap-suggestions" role="listbox" aria-label="Sugerencias de personaje">
              {sugerencias.map((p) => (
                <button key={p.id} className="ap-suggestion" role="option" onClick={() => procesarIntento(p)}>
                  <img src={p.sprite_url} alt={p.nombre} />
                  <span>{p.nombre}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {mensajeIntento && <p className="ap-feedback">{mensajeIntento}</p>}

        <div className="ap-table-wrap">
          <table className="ap-table">
            <thead>
              <tr>
                <th>Jugador</th>
                <th>Club</th>
                <th>Posicion</th>
                <th>Afinidad</th>
                <th>Saga</th>
                <th>Genero</th>
                <th>EG / MIX</th>
              </tr>
            </thead>
            <tbody>
              {intentos.length === 0 && (
                <tr>
                  <td colSpan="7" className="ap-empty">Haz tu primer intento.</td>
                </tr>
              )}
              {intentos.map((p, idx) => (
                <tr
                  key={`${p.nombre}-${idx}`}
                  className={idx === 0 ? "ap-row-new" : ""}
                >
                  <td className={claseComparacion(p.nombre, objetivo.nombre)}>
                    <div className="ap-jugador">
                      <img src={p.sprite_url} alt={p.nombre} />
                      <span>{p.nombre}</span>
                    </div>
                  </td>
                  <td className={claseComparacion(p.club, objetivo.club)}>
                    <div className="ap-icon-text">
                      <img src={p.icono_club_url} alt={p.club} />
                      <span>{formatearClub(p.club)}</span>
                    </div>
                  </td>
                  <td className={claseComparacion(p.posicion, objetivo.posicion)}>
                    <img className="ap-inline-icon" src={p.icono_posicion_url} alt={p.posicion} />
                  </td>
                  <td className={claseComparacion(p.elemento, objetivo.elemento)}>
                    <img className="ap-inline-icon" src={p.icono_elemento_url} alt={p.elemento} />
                  </td>
                  <td className={claseComparacion(p.saga, objetivo.saga)}>
                    <img
                      className="ap-inline-icon ap-saga-icon"
                      src={p.icono_saga_url}
                      alt={p.saga}
                      onError={(e) => {
                        e.currentTarget.src = iconoSagaPorCodigo(p.saga);
                      }}
                    />
                  </td>
                  <td className={claseComparacion(p.genero, objetivo.genero)}>
                    <img className="ap-inline-icon" src={p.genero_url} alt={p.genero} />
                  </td>
                  <td>
                    <div className="ap-esp-mixi">
                      <span className={`ap-chip ${claseComparacionBool(p.tiene_espiritu, objetivo.tiene_espiritu)}`}>
                        EG: {boolLabel(p.tiene_espiritu)}
                      </span>
                      <span className={`ap-chip ${claseComparacionBool(p.tiene_miximax, objetivo.tiene_miximax)}`}>
                        MIX: {boolLabel(p.tiene_miximax)}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
