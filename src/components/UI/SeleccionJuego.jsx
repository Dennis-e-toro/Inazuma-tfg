import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./SeleccionJuego.css";

import AdivinarPersonaje from "../Juegos/AdivinarPersonaje";
import AdivinarSilueta from "../Juegos/AdivinarSilueta";
import AdivinarCuadricula from "../Juegos/AdivinarCuadricula";
import { API_BASE } from "../../config";
import { assetUrl } from "../../helpers/assetUrl";

const AUTH_SESSION_KEY = "inazudle.auth.session.v1";
const AUTH_PROFILE_KEY = "inazudle.profile.v2";
const DEFAULT_SOBRE_PORTADA = assetUrl("/cartas/aiden_y_shawn.png");

function cargarSesionLocal() {
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.token || !data?.username) return null;
    return {
      token: String(data.token),
      username: String(data.username),
      monedas: Number(data.monedas) || 0,
    };
  } catch {
    return null;
  }
}

function guardarSesionLocal(sesion) {
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(sesion));
}

function limpiarSesionLocal() {
  localStorage.removeItem(AUTH_SESSION_KEY);
}

function cargarPerfilesLocal() {
  try {
    const raw = localStorage.getItem(AUTH_PROFILE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return typeof data === "object" && data ? data : {};
  } catch {
    return {};
  }
}

function guardarPerfilesLocal(perfiles) {
  localStorage.setItem(AUTH_PROFILE_KEY, JSON.stringify(perfiles));
}

function normalizarRutaImagen(url) {
  if (!url) return url;
  return String(url)
    .replace(/^\/Personajes\//i, "/personajes/")
    .replace(/^\/Siluetas\//i, "/siluetas/")
    .replace(/^\/Clubes\//i, "/clubes/")
    .replace(/^\/saga\//i, "/Saga/");
}

function formatearTiempo(segundos) {
  const s = Math.max(0, Math.floor(segundos));
  const min = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function calcularRecompensa(segundos) {
  if (segundos <= 60) return 50;
  if (segundos <= 120) return 35;
  if (segundos <= 300) return 20;
  return 10;
}

function formatearClub(v) {
  return String(v || "-")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function crearPerfilBase() {
  return {
    ownedAvatarIds: ["starter"],
    equippedAvatarId: "starter",
    dailyCompletions: {},
  };
}

function normalizarImagenCarta(carta) {
  const url = String(carta?.imagen_url || "").trim();
  if (!url) return "";
  if (/^data:image\//i.test(url) || /^blob:/i.test(url)) return url;
  if (url.startsWith("/")) return assetUrl(url);
  return url;
}

function isoConDesplazamiento(baseIso, dias) {
  const [y, m, d] = String(baseIso || "").split("-").map(Number);
  if (!y || !m || !d) return "";
  const fecha = new Date(Date.UTC(y, m - 1, d));
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

function calcularRachaDias(dailyCompletions, hoyIso) {
  let racha = 0;
  for (let i = 0; i < 365; i += 1) {
    const dia = isoConDesplazamiento(hoyIso, -i);
    const completadosDia = dailyCompletions?.[dia] || null;
    if (!completadosDia || !Object.values(completadosDia).some(Boolean)) {
      break;
    }
    racha += 1;
  }
  return racha;
}

export default function SeleccionJuego() {
  const [juegoSeleccionado, setJuegoSeleccionado] = useState("adivinarPersonaje");
  const [infoAbierta, setInfoAbierta] = useState(false);
  const [sesion, setSesion] = useState(() => cargarSesionLocal());
  const [perfiles, setPerfiles] = useState(() => cargarPerfilesLocal());
  const [avatarCatalogo, setAvatarCatalogo] = useState([
    {
      id: "starter",
      nombre: "Avatar Inicial",
      src: null,
      precio: 0,
      saga: "base",
      club: "general",
    },
  ]);
  const [authAbierto, setAuthAbierto] = useState(false);
  const [authModo, setAuthModo] = useState("login");
  const [authForm, setAuthForm] = useState({ username: "", email: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [partidaInicioTs, setPartidaInicioTs] = useState(() => Date.now());
  const [tiendaSaga, setTiendaSaga] = useState("all");
  const [tiendaClub, setTiendaClub] = useState("all");
  const [tiendaSeccion, setTiendaSeccion] = useState("avatares");
  const [inventarioSeccion, setInventarioSeccion] = useState("cartas");
  const [sobresCatalogo, setSobresCatalogo] = useState([]);
  const [sobresCargando, setSobresCargando] = useState(false);
  const [inventarioCartas, setInventarioCartas] = useState([]);
  const [inventarioCargando, setInventarioCargando] = useState(false);
  const [inventarioError, setInventarioError] = useState("");
  const [abrirSobreState, setAbrirSobreState] = useState({ abierto: false, sobre: null, cartas: [], animando: false });
  const [toastMonedas, setToastMonedas] = useState("");
  const [panelVictoriaPorModo, setPanelVictoriaPorModo] = useState({});
  const [rankingDiario, setRankingDiario] = useState([]);
  const [rankingCargando, setRankingCargando] = useState(false);
  const [rankingError, setRankingError] = useState("");
  const [instanciaJuego, setInstanciaJuego] = useState(0);
  const toastTimerRef = useRef(null);

  const hoy = new Date().toISOString().slice(0, 10);

  const juegos = useMemo(() => ([
    { id: "adivinarPersonaje", nombre: "Adivina Personaje", descripcion: "Modo clasico diario", componente: AdivinarPersonaje },
    { id: "adivinarSilueta", nombre: "Adivina Silueta", descripcion: "Reconoce la silueta", componente: AdivinarSilueta },
    { id: "adivinarCuadricula", nombre: "Cuadricula 3x3", descripcion: "Cruces y estrategia", componente: AdivinarCuadricula },
  ]), []);

  const juegoActivo = useMemo(() => juegos.find((j) => j.id === juegoSeleccionado) || juegos[0], [juegos, juegoSeleccionado]);
  const panelVictoriaActiva = useMemo(() => panelVictoriaPorModo[juegoActivo.id] || null, [panelVictoriaPorModo, juegoActivo.id]);
  const usuarioLabel = sesion?.username || "Invitado";
  const monedasActuales = Number(sesion?.monedas) || 0;
  const rankingClavePorModo = useMemo(() => ({
    adivinarPersonaje: "normal",
    adivinarSilueta: "silueta",
    adivinarCuadricula: "cuadricula",
  }), []);
  const rankingModoClave = panelVictoriaActiva ? rankingClavePorModo[panelVictoriaActiva.modoId] || null : null;

  const perfilActual = sesion?.username
    ? perfiles[sesion.username] || crearPerfilBase()
    : null;

  const completadosHoy = perfilActual?.dailyCompletions?.[hoy] || {};
  const totalCompletadosHoy = Object.values(completadosHoy).filter(Boolean).length;

  const avatarSeleccionado = perfilActual
    ? avatarCatalogo.find((a) => a.id === perfilActual.equippedAvatarId) || avatarCatalogo[0]
    : null;

  const inventarioCartasFiltradas = useMemo(
    () => inventarioCartas.filter((item) => item.item_tipo === "carta"),
    [inventarioCartas],
  );

  const inventarioIconosFiltrados = useMemo(
    () => inventarioCartas.filter((item) => item.item_tipo === "avatar"),
    [inventarioCartas],
  );

  const opcionesSaga = useMemo(() => {
    const sagas = [...new Set(avatarCatalogo.map((a) => a.saga).filter(Boolean))];
    return ["all", ...sagas];
  }, [avatarCatalogo]);

  const opcionesClub = useMemo(() => {
    const lista = avatarCatalogo.filter((a) => tiendaSaga === "all" || a.saga === tiendaSaga);
    const clubs = [...new Set(lista.map((a) => a.club).filter(Boolean))];
    return ["all", ...clubs];
  }, [avatarCatalogo, tiendaSaga]);

  const avataresFiltrados = useMemo(() => {
    return avatarCatalogo.filter((a) => (tiendaSaga === "all" || a.saga === tiendaSaga) && (tiendaClub === "all" || a.club === tiendaClub));
  }, [avatarCatalogo, tiendaSaga, tiendaClub]);

  useEffect(() => {
    if (tiendaClub !== "all" && !opcionesClub.includes(tiendaClub)) {
      setTiendaClub("all");
    }
  }, [opcionesClub, tiendaClub]);

  useEffect(() => {
    const verificarSesion = async () => {
      if (!sesion?.token) return;
      try {
        const res = await fetch(`${API_BASE}/api/auth/me`, {
          headers: { Authorization: `Bearer ${sesion.token}` },
        });
        const data = await res.json();
        if (!res.ok) {
          setSesion(null);
          limpiarSesionLocal();
          return;
        }
        if (data?.ok && data?.user?.username) {
          const refrescada = {
            token: sesion.token,
            username: String(data.user.username),
            monedas: Number(data.user.monedas) || 0,
          };
          setSesion(refrescada);
          guardarSesionLocal(refrescada);
        }
      } catch {
        // offline tolerado
      }
    };

    verificarSesion();
  }, [sesion?.token]);

  useEffect(() => {
    guardarPerfilesLocal(perfiles);
  }, [perfiles]);

  useEffect(() => {
    setPartidaInicioTs(Date.now());
  }, [juegoSeleccionado]);

  useEffect(() => {
    const cargarAvatares = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/personajes`);
        if (!res.ok) return;
        const data = await res.json();

        const lista = [];
        const vistas = new Set(["starter"]);

        for (const p of data) {
          const raw = normalizarRutaImagen(p?.sprite_url);
          const src = raw ? assetUrl(raw) : raw;
          if (!raw || vistas.has(raw)) continue;
          vistas.add(raw);

          const saga = String(p?.saga || "base").toLowerCase();
          const club = String(p?.club || "general").toLowerCase();

          lista.push({
            id: `avatar-${p.id}`,
            nombre: p.nombre || `Avatar ${p.id}`,
            src,
            precio: 80 + lista.length * 25,
            saga,
            club,
          });
        }

        setAvatarCatalogo([
          {
            id: "starter",
            nombre: "Avatar Inicial",
            src: null,
            precio: 0,
            saga: "base",
            club: "general",
          },
          ...lista,
        ]);
      } catch {
        // mantener básico
      }
    };

    cargarAvatares();
    // Cargar sobres para la tienda
    (async function cargarSobres() {
      try {
        setSobresCargando(true);
        const res = await fetch(`${API_BASE}/api/shop/sobres`);
        const data = await res.json();
        if (res.ok && data?.ok) {
          const lista = (data.sobres || []).map((s) => ({
            ...s,
            portada_src: s.portada_url && String(s.portada_url).startsWith('/') ? assetUrl(s.portada_url) : s.portada_url,
          }));
          console.log('📦 Sobres cargados:', lista);
          setSobresCatalogo(lista);
        }
      } catch (e) {
        console.error('❌ Error cargando sobres:', e);
      } finally {
        setSobresCargando(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!sesion?.username) return;
    setPerfiles((prev) => {
      if (prev[sesion.username]) return prev;
      return {
        ...prev,
        [sesion.username]: crearPerfilBase(),
      };
    });
  }, [sesion?.username]);

  useEffect(() => {
    if (!rankingModoClave) {
      setRankingDiario([]);
      setRankingError("");
      setRankingCargando(false);
      return;
    }

    const controller = new AbortController();
    let activo = true;

    const cargarRanking = async () => {
      setRankingCargando(true);
      setRankingError("");
      setRankingDiario([]);

      try {
        const res = await fetch(`${API_BASE}/api/diarios/ranking?modo=${rankingModoClave}&limite=10`, {
          signal: controller.signal,
        });
        const data = await res.json();

        if (!activo) return;
        if (!res.ok || !data?.ok) {
          setRankingError(data?.error || "No se pudo cargar el ranking diario.");
          return;
        }

        let fetched = Array.isArray(data.ranking) ? data.ranking.slice() : [];

        // Si hay un intento propio en el panel de victoria, añadirlo si no aparece
        try {
          const panel = panelVictoriaActiva;
          const own = panel?.lastAttempt;
          const maximo = Math.min(Math.max(parseNumero(10, 10), 1), 10);
          if (own && sesion?.username) {
            const existe = fetched.some((r) => String(r.username) === String(own.username));
            if (!existe && Number.isFinite(own.tiempoMs)) {
              fetched.push({ posicion: null, username: own.username, tiempoMs: Number(own.tiempoMs), puntuacion: Number(own.puntuacion || 0), fin: new Date().toISOString() });
              fetched.sort((a, b) => (Number(a.tiempoMs) || Infinity) - (Number(b.tiempoMs) || Infinity));
              fetched = fetched.slice(0, maximo).map((r, i) => ({ ...r, posicion: i + 1 }));
            }
          }
        } catch (e) {
          // noop
        }

        setRankingDiario(fetched);
      } catch {
        if (!activo || controller.signal.aborted) return;
        setRankingError("No se pudo cargar el ranking diario.");
      } finally {
        if (activo) setRankingCargando(false);
      }
    };

    cargarRanking();
    const intervalo = setInterval(cargarRanking, 15000);

    return () => {
      activo = false;
      controller.abort();
      clearInterval(intervalo);
    };
  }, [rankingModoClave]);

  const actualizarPerfilActual = (updater) => {
    if (!sesion?.username) return;
    setPerfiles((prev) => {
      const base = prev[sesion.username] || crearPerfilBase();
      return {
        ...prev,
        [sesion.username]: updater(base),
      };
    });
  };

  const actualizarMonedasSesion = useCallback((monedas) => {
    const valor = Number(monedas);
    if (!Number.isFinite(valor)) return;
    setSesion((prev) => {
      if (!prev) return prev;
      const next = { ...prev, monedas: valor };
      guardarSesionLocal(next);
      return next;
    });
  }, []);

  const lanzarToast = (mensaje) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToastMonedas(mensaje);
    toastTimerRef.current = setTimeout(() => {
      setToastMonedas("");
      toastTimerRef.current = null;
    }, 2500);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const abrirAuth = (modo) => {
    setAuthModo(modo);
    setAuthError("");
    setAuthForm({ username: "", email: "", password: "" });
    setAuthAbierto(true);
  };

  const procesarAuth = async (e) => {
    e.preventDefault();
    const username = authForm.username.trim().toLowerCase();
    const password = authForm.password;

    if (!username || !password) {
      setAuthError("Introduce usuario y contraseña.");
      return;
    }

    if (authModo === "registro") {
      const email = authForm.email.trim().toLowerCase();
      if (!email) {
        setAuthError("Introduce un email para registrarte.");
        return;
      }
    }

    setAuthLoading(true);
    setAuthError("");
    try {
      const endpoint = authModo === "registro" ? "/api/auth/register" : "/api/auth/login";
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          email: authModo === "registro" ? authForm.email.trim().toLowerCase() : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setAuthError(data?.error || "No se pudo completar la autenticación.");
        return;
      }

      const nuevaSesion = {
        username: String(data.user.username),
        token: String(data.token),
        monedas: Number(data.user.monedas) || 0,
      };
      setSesion(nuevaSesion);
      guardarSesionLocal(nuevaSesion);
      setAuthModo("cuenta");
      setAuthAbierto(false);
    } catch {
      setAuthError("No hay conexión con el backend de autenticación.");
    } finally {
      setAuthLoading(false);
    }
  };

  const cerrarSesion = async () => {
    try {
      if (sesion?.token) {
        await fetch(`${API_BASE}/api/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${sesion.token}` },
        });
      }
    } catch {
      // cierre local igualmente
    }
    setSesion(null);
    limpiarSesionLocal();
    setAuthAbierto(false);
  };

  const registrarCompletadoDiario = useCallback(async (payload) => {
    const evento = typeof payload === "string" ? { modoId: payload } : payload || {};
    const modoId = evento.modoId || evento.id || juegoSeleccionado;
    const modoNombre = juegos.find((j) => j.id === modoId)?.nombre || "Modo";
    const modoClave = rankingClavePorModo[modoId] || "normal";
    const personajeNombre = String(evento.personajeNombre || evento.nombre || "");
    const personajeSprite = evento.personajeSprite || evento.sprite || null;
    const hideCharacter = Boolean(evento.hideCharacter);
    const victoriaTitulo = String(evento.victoriaTitulo || "VICTORIA");
    const victoriaMensajeEvento = String(evento.victoriaMensaje || "");

    if (!sesion?.username) {
      lanzarToast("Inicia sesion para recibir monedas");
      setPanelVictoriaPorModo((prev) => ({
        ...prev,
        [modoId]: {
          titulo: victoriaTitulo,
          modoId,
          modoNombre,
          personajeNombre,
          personajeSprite,
          hideCharacter,
          bloqueadoDiario: true,
          premio: 0,
          progreso: 0,
          progresoTotal: juegos.length,
          racha: 0,
          mensaje: victoriaMensajeEvento || "Has acertado. Inicia sesion para guardar progreso diario y recibir monedas.",
          monedasTotales: monedasActuales,
          lastAttempt: evento?.tiempoMs ? { username: sesion?.username || null, tiempoMs: evento.tiempoMs, puntuacion: evento.puntuacion || 0 } : null,
        },
      }));
      return;
    }

    let premioOtorgado = 0;
    let progresoDespues = 0;
    let rachaDespues = 0;
    let monedasDespues = monedasActuales;
    let bloqueadoDiario = false;
    let mensajePanel = victoriaMensajeEvento || "Sigue jugando para completar el reto diario.";

    const dailyActual = { ...(perfilActual?.dailyCompletions || {}) };
    const hoyMapActual = { ...(dailyActual[hoy] || {}) };

    if (hoyMapActual[modoId]) {
      progresoDespues = Object.values(hoyMapActual).filter(Boolean).length;
      rachaDespues = calcularRachaDias(dailyActual, hoy);
      lanzarToast("Este modo ya se completo hoy");
      setPanelVictoriaPorModo((prev) => ({
        ...prev,
        [modoId]: {
          titulo: victoriaTitulo,
          modoId,
          modoNombre,
          personajeNombre,
          personajeSprite,
          hideCharacter,
          bloqueadoDiario: true,
          premio: 0,
          progreso: progresoDespues,
          progresoTotal: juegos.length,
          racha: rachaDespues,
          monedasTotales: monedasDespues,
          mensaje: victoriaMensajeEvento || "Este modo ya estaba completado hoy. Puedes seguir probando para practicar.",
        },
      }));
      return;
    }

    const segundos = Math.floor((Date.now() - partidaInicioTs) / 1000);
    premioOtorgado = calcularRecompensa(segundos);

    if (premioOtorgado <= 0) {
      lanzarToast("No se pudo calcular una recompensa valida");
      setPanelVictoriaPorModo((prev) => ({
        ...prev,
        [modoId]: {
          titulo: victoriaTitulo,
          modoId,
          modoNombre,
          personajeNombre,
          personajeSprite,
          hideCharacter,
          bloqueadoDiario: false,
          premio: 0,
          progreso: Object.values(hoyMapActual).filter(Boolean).length,
          progresoTotal: juegos.length,
          racha: calcularRachaDias(dailyActual, hoy),
          monedasTotales: monedasDespues,
          mensaje: "No se pudo calcular la recompensa. Vuelve a intentarlo.",
          lastAttempt: evento?.tiempoMs ? { username: sesion?.username || null, tiempoMs: evento.tiempoMs, puntuacion: evento.puntuacion || 0 } : null,
        },
      }));
      return;
    }

    const hoyMapDespues = { ...hoyMapActual, [modoId]: true };
    const dailyDespues = { ...dailyActual, [hoy]: hoyMapDespues };
    progresoDespues = Object.values(hoyMapDespues).filter(Boolean).length;
    rachaDespues = calcularRachaDias(dailyDespues, hoy);

    try {
      const res = await fetch(`${API_BASE}/api/coins/recompensa-diaria`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sesion.token}`,
        },
        body: JSON.stringify({ modoClave, dia: hoy, premio: premioOtorgado }),
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok || !data?.ok) {
        premioOtorgado = 0;
        lanzarToast(data?.error || "No se pudo guardar la recompensa");
        mensajePanel = "No se pudo guardar la recompensa. Puedes reintentarlo.";
      } else {
        bloqueadoDiario = true;
        monedasDespues = Number(data.monedas) || 0;
        actualizarMonedasSesion(monedasDespues);
        actualizarPerfilActual((base) => {
          const daily = { ...(base.dailyCompletions || {}) };
          const hoyMap = { ...(daily[hoy] || {}) };
          hoyMap[modoId] = true;
          daily[hoy] = hoyMap;
          return {
            ...base,
            dailyCompletions: daily,
          };
        });

        mensajePanel = victoriaMensajeEvento || (
          progresoDespues >= juegos.length
            ? "Completaste todos los modos diarios. Gran jornada."
            : "Sigue jugando para completar el reto diario."
        );

        if (!data.otorgado) {
          premioOtorgado = 0;
          lanzarToast("Este modo ya se recompenso hoy");
        }
      }
    } catch {
      premioOtorgado = 0;
      lanzarToast("No se pudo guardar la recompensa");
      mensajePanel = "No se pudo guardar la recompensa. Puedes reintentarlo.";
    }

    if (premioOtorgado > 0) {
      lanzarToast(`Has obtenido ${premioOtorgado} monedas`);
    }

    setPanelVictoriaPorModo((prev) => ({
      ...prev,
      [modoId]: {
        titulo: victoriaTitulo,
        modoId,
        modoNombre,
        personajeNombre,
        personajeSprite,
        hideCharacter,
        bloqueadoDiario,
        premio: premioOtorgado,
        progreso: progresoDespues,
        progresoTotal: juegos.length,
        racha: rachaDespues,
        monedasTotales: monedasDespues,
        mensaje: mensajePanel,
        lastAttempt: evento?.tiempoMs ? { username: sesion?.username || null, tiempoMs: evento.tiempoMs, puntuacion: evento.puntuacion || 0 } : null,
      },
    }));
  }, [juegoSeleccionado, juegos, hoy, monedasActuales, partidaInicioTs, perfilActual, rankingClavePorModo, sesion?.token, sesion?.username, lanzarToast, actualizarMonedasSesion]);

  const reiniciarModoActual = () => {
    if (panelVictoriaActiva?.bloqueadoDiario) {
      setPanelVictoriaPorModo((prev) => {
        if (!prev[juegoActivo.id]) return prev;
        const next = { ...prev };
        delete next[juegoActivo.id];
        return next;
      });
      return;
    }

    setPanelVictoriaPorModo((prev) => {
      if (!prev[juegoActivo.id]) return prev;
      const next = { ...prev };
      delete next[juegoActivo.id];
      return next;
    });
    setInstanciaJuego((prev) => prev + 1);
    setPartidaInicioTs(Date.now());
  };

  const comprarAvatar = async (avatar) => {
    if (!perfilActual) return;
    if (!sesion?.token) return lanzarToast('Necesitas iniciar sesión');
    if (perfilActual.ownedAvatarIds.includes(avatar.id)) return;
    if (monedasActuales < avatar.precio) return lanzarToast('Monedas insuficientes');

    try {
      const res = await fetch(`${API_BASE}/api/coins/spend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sesion.token}`,
        },
        body: JSON.stringify({
          amount: avatar.precio,
          reason: 'compra_avatar',
          metadata: {
            avatarId: avatar.id,
            nombre: avatar.nombre,
            imagenUrl: avatar.src,
            src: avatar.src,
            rareza: 'avatar',
            saga: avatar.saga,
            club: avatar.club,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        return lanzarToast(data?.error || 'No se pudo comprar el avatar');
      }

      actualizarMonedasSesion(data.monedas);
      void cargarInventarioCartas();
    } catch {
      return lanzarToast('Error de red al comprar avatar');
    }

    actualizarPerfilActual((base) => ({
      ...base,
      ownedAvatarIds: [...new Set([...(base.ownedAvatarIds || ["starter"]), avatar.id])],
    }));
  };

  const cargarInventarioCartas = useCallback(async () => {
    if (!sesion?.token) {
      setInventarioCartas([]);
      setInventarioError("");
      setInventarioCargando(false);
      return;
    }

    setInventarioCargando(true);
    setInventarioError("");

    try {
      const res = await fetch(`${API_BASE}/api/inventario`, {
        headers: { Authorization: `Bearer ${sesion.token}` },
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setInventarioError(data?.error || "No se pudo cargar tu inventario");
        setInventarioCartas([]);
        return;
      }

      const lista = (data.inventario || []).map((c) => ({
        ...c,
        cantidad: Math.max(0, Number(c.cantidad) || 0),
        imagen_src: normalizarImagenCarta({ imagen_url: c.imagen_url || c.metadata?.imagenUrl || c.metadata?.src }),
      }));

      setInventarioCartas(lista);
    } catch {
      setInventarioError("No se pudo cargar tu inventario");
      setInventarioCartas([]);
    } finally {
      setInventarioCargando(false);
    }
  }, [sesion?.token]);

  const comprarSobre = async (sobre) => {
    if (!perfilActual) return;
    if (!sesion?.token) return lanzarToast('Necesitas iniciar sesión');
    if (monedasActuales < (sobre.precio_monedas || 0)) return lanzarToast('Monedas insuficientes');

    setAbrirSobreState({ abierto: true, sobre, cartas: [], animando: true });

    try {
      const res = await fetch(`${API_BASE}/api/shop/abrir-sobre`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sesion.token}` },
        body: JSON.stringify({ sobreId: sobre.id }),
      });
      const data = await res.json();
      if (res.ok && data?.ok) {
        console.log(`[COMPRAR-SOBRE] Respuesta del servidor:`, data);
        actualizarMonedasSesion(data.monedas_restantes);
        const cartas = (data.cartas || []).map((c) => {
          const imagen_src = normalizarImagenCarta(c);
          console.log(`[COMPRAR-SOBRE] Mapeando carta ${c.nombre}:`, {
            imagen_url_original: String(c.imagen_url).substring(0, 50) + '...',
            imagen_src_final: String(imagen_src).substring(0, 50) + '...',
          });
          return { ...c, imagen_src };
        });
        setAbrirSobreState({ abierto: true, sobre, cartas, animando: false });
        void cargarInventarioCartas();
      } else {
        lanzarToast(data?.error || 'Error abriendo sobre');
        setAbrirSobreState({ abierto: false, sobre: null, cartas: [], animando: false });
      }
    } catch (e) {
      lanzarToast('Error de red');
      setAbrirSobreState({ abierto: false, sobre: null, cartas: [], animando: false });
    }
  };

  const equiparAvatar = (avatarId) => {
    if (!perfilActual) return;
    actualizarPerfilActual((base) => {
      const owned = new Set(base.ownedAvatarIds || ["starter"]);
      const disponibleEnInventario = inventarioIconosFiltrados.some((item) => item.item_key === avatarId);
      if (!owned.has(avatarId) && !disponibleEnInventario) return base;
      owned.add(avatarId);
      return {
        ...base,
        ownedAvatarIds: [...owned],
        equippedAvatarId: avatarId,
      };
    });
  };

  const ComponenteJuego = juegoActivo.componente;

  useEffect(() => {
    if (!panelVictoriaActiva?.bloqueadoDiario) return;
    const modoId = panelVictoriaActiva.modoId || juegoActivo.id;
    const timer = setTimeout(() => {
      setPanelVictoriaPorModo((prev) => {
        if (!prev[modoId]) return prev;
        const next = { ...prev };
        delete next[modoId];
        return next;
      });
    }, 2000);

    return () => clearTimeout(timer);
  }, [panelVictoriaActiva, juegoActivo.id]);

  useEffect(() => {
    if (!authAbierto || authModo !== "inventario") return;
    void cargarInventarioCartas();
  }, [authAbierto, authModo, cargarInventarioCartas]);

  return (
    <div className="seleccion-container">
      <header className="home-header">
        <button
          className="auth-icon-btn"
          aria-label={sesion ? "Cuenta" : "Iniciar sesion"}
          title={sesion ? "Cuenta" : "Iniciar sesion"}
          onClick={() => {
            if (sesion) {
              setAuthModo("cuenta");
              setAuthAbierto(true);
            } else {
              abrirAuth("login");
            }
          }}
        >
          {sesion && avatarSeleccionado?.src ? (
            <img src={avatarSeleccionado.src} alt={usuarioLabel} className="auth-icon-avatar" />
          ) : sesion ? (
            usuarioLabel.slice(0, 1).toUpperCase()
          ) : (
            "👤"
          )}
        </button>

        <section className="brand-block">
          <img src={assetUrl("/Saga/titulo.png")} alt="INAZUMA ELEVENDLE" className="titulo-seleccion" />
          <p className="hero-copy">Elige un modo, juega tu desafio diario y desbloquea nuevos avatares.</p>
        </section>

        <section className="status-grid">
          <article className="status-card">
            <span>Modo cargado</span>
            <strong>{juegoActivo.nombre}</strong>
          </article>
          <article className="status-card">
            <span>Cuenta</span>
            <strong>{usuarioLabel}</strong>
            {!sesion && <button className="perfil-open-btn" onClick={() => abrirAuth("login")}>Entrar</button>}
            {sesion && (
              <button
                className="perfil-open-btn"
                onClick={() => {
                  setAuthModo("cuenta");
                  setAuthAbierto(true);
                }}
              >
                Perfil
              </button>
            )}
          </article>
        </section>

        <section className="modos-strip" aria-label="Selector de modos">
          {juegos.map((j) => (
            <button
              key={j.id}
              className={`modo-pill ${j.id === juegoActivo.id ? "modo-pill-activo" : ""}`}
              aria-pressed={j.id === juegoActivo.id}
              onClick={() => setJuegoSeleccionado(j.id)}
            >
              <span>{j.nombre}</span>
              <small>{j.descripcion}</small>
            </button>
          ))}
        </section>
      </header>

      <div className="contenido-principal">
        {panelVictoriaActiva && (
          <div className="victory-inline">
            <div className={`victory-modal ${panelVictoriaActiva.modoId === "adivinarCuadricula" ? "victory-modal-cuadricula" : ""}`}>
              <div className="victory-body">
                <div className="victory-main">
                  <p className="victory-kicker">{panelVictoriaActiva.titulo}</p>
                  <h3>{panelVictoriaActiva.modoNombre}</h3>

                  {!panelVictoriaActiva.hideCharacter && panelVictoriaActiva.personajeSprite && (
                    <div className="victory-character-frame">
                      <img src={panelVictoriaActiva.personajeSprite} alt={panelVictoriaActiva.personajeNombre || "Personaje"} className="victory-character" />
                    </div>
                  )}

                  {!panelVictoriaActiva.hideCharacter && panelVictoriaActiva.personajeNombre && (
                    <p className="victory-name">{panelVictoriaActiva.personajeNombre}</p>
                  )}

                  <p className="victory-copy">{panelVictoriaActiva.mensaje}</p>

                  <div className="victory-stats">
                    <article>
                      <span>Monedas</span>
                      <strong>{panelVictoriaActiva.premio > 0 ? `+${panelVictoriaActiva.premio}` : "+0"}</strong>
                    </article>
                    <article>
                      <span>Racha</span>
                      <strong>{panelVictoriaActiva.racha} dias</strong>
                    </article>
                    <article>
                      <span>Progreso diario</span>
                      <strong>{panelVictoriaActiva.progreso}/{panelVictoriaActiva.progresoTotal}</strong>
                    </article>
                  </div>

                  {!panelVictoriaActiva.requiereLogin && (
                    <p className="victory-total">Monedas totales: <strong>{panelVictoriaActiva.monedasTotales ?? 0}</strong></p>
                  )}

                  <div className="victory-actions">
                    {panelVictoriaActiva?.modoId !== "adivinarSilueta" && panelVictoriaActiva?.modoId !== "adivinarCuadricula" && (
                      <button type="button" onClick={reiniciarModoActual}>
                        {panelVictoriaActiva?.bloqueadoDiario ? "Volver mañana" : "Jugar de nuevo"}
                      </button>
                    )}
                  </div>
                </div>

                <aside className="victory-ranking">
                  <div className="victory-ranking-head">
                    <p className="victory-ranking-kicker">Ranking del día</p>
                    <h4>Top {rankingDiario.length || 10}</h4>
                    <span>{panelVictoriaActiva.modoNombre}</span>
                  </div>

                  {rankingCargando && <p className="victory-ranking-empty">Cargando tiempos...</p>}
                  {!rankingCargando && rankingError && <p className="victory-ranking-empty">{rankingError}</p>}
                  {!rankingCargando && !rankingError && rankingDiario.length === 0 && (
                    <p className="victory-ranking-empty">Aún no hay tiempos registrados hoy.</p>
                  )}

                  {!rankingCargando && !rankingError && rankingDiario.length > 0 && (
                    <ol className="victory-ranking-list">
                      {rankingDiario.map((item) => (
                        <li key={`${item.username}-${item.posicion}`} className="victory-ranking-item">
                          <span className="victory-ranking-pos">#{item.posicion}</span>
                          <span className="victory-ranking-user">{item.username}</span>
                          <strong className="victory-ranking-time">{formatearTiempo(Math.floor((Number(item.tiempoMs) || 0) / 1000))}</strong>
                        </li>
                      ))}
                    </ol>
                  )}
                </aside>
              </div>
            </div>
          </div>
        )}

        <div className="juego-contenedor">
          <ComponenteJuego
            key={`${juegoActivo.id}-${instanciaJuego}`}
            onDailyComplete={registrarCompletadoDiario}
            bloqueadoDiario={Boolean(completadosHoy[juegoActivo.id])}
          />
        </div>

        <div className="info-container">
          <button className="info-toggle" aria-expanded={infoAbierta} onClick={() => setInfoAbierta(!infoAbierta)}>
            Informacion del proyecto {infoAbierta ? "▲" : "▼"}
          </button>
          {infoAbierta && (
            <div className="info-content">
              <p>
                <strong>Inazudle</strong> es un desafio diario inspirado en Wordle y centrado en el universo Inazuma Eleven.
              </p>
              <p>
                Completa modos para conseguir monedas, desbloquear avatares y construir tu coleccion.
              </p>
            </div>
          )}
        </div>
      </div>

      {authAbierto && (
        <div className="perfil-backdrop" onClick={() => setAuthAbierto(false)}>
          <div className="perfil-modal" onClick={(e) => e.stopPropagation()}>
            {authModo === "cuenta" && sesion ? (
              <div className="cuenta-panel">
                <div className="perfil-hero">
                  <div className="perfil-hero-copy">
                    <span className="perfil-kicker">Perfil</span>
                    <h3>{sesion.username}</h3>
                    <p>Resumen de progreso, monedas y modos diarios.</p>
                  </div>
                  <div className="perfil-avatar-badge">
                    {avatarSeleccionado?.src ? (
                      <img src={avatarSeleccionado.src} alt={usuarioLabel} />
                    ) : (
                      <span>{usuarioLabel.slice(0, 1).toUpperCase()}</span>
                    )}
                  </div>
                </div>

                <div className="perfil-metrics">
                  <article>
                    <span>Monedas</span>
                    <strong>{monedasActuales}</strong>
                  </article>
                  <article>
                    <span>Racha</span>
                    <strong>{calcularRachaDias(perfilActual?.dailyCompletions || {}, hoy)} dias</strong>
                  </article>
                  <article>
                    <span>Hoy</span>
                    <strong>{totalCompletadosHoy}/{juegos.length}</strong>
                  </article>
                </div>

                <div className="perfil-section">
                  <div className="perfil-section-head">
                    <h4>Progreso diario</h4>
                    <p>Modos completados hoy.</p>
                  </div>
                  <ul className="daily-list">
                    {juegos.map((j) => (
                      <li key={j.id}>
                        <span className={completadosHoy[j.id] ? "daily-dot daily-dot-ok" : "daily-dot"} />
                        {j.nombre}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="perfil-actions">
                  <button type="button" onClick={() => setAuthModo("tienda")}>Tienda</button>
                  <button type="button" onClick={() => setAuthModo("inventario")}>Inventario</button>
                  <button type="button" onClick={() => setAuthAbierto(false)}>Cerrar</button>
                  <button type="button" onClick={cerrarSesion}>Cerrar sesión</button>
                </div>
              </div>
            ) : authModo === "inventario" && sesion ? (
              <div className="cuenta-panel">
                <div className="perfil-hero perfil-hero-shop">
                  <div className="perfil-hero-copy">
                    <span className="perfil-kicker">Inventario</span>
                    <h3>Tus cartas e iconos</h3>
                  </div>
                  <div className="perfil-hero-chip">
                    <span>Piezas</span>
                    <strong>{inventarioCartas.reduce((acc, item) => acc + (Number(item.cantidad) || 0), 0)}</strong>
                  </div>
                </div>

                <div className="shop-tabs" role="tablist" aria-label="Secciones del inventario">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={inventarioSeccion === "cartas"}
                    className={inventarioSeccion === "cartas" ? "shop-tab shop-tab-active" : "shop-tab"}
                    onClick={() => setInventarioSeccion("cartas")}
                  >
                    Cartas
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={inventarioSeccion === "iconos"}
                    className={inventarioSeccion === "iconos" ? "shop-tab shop-tab-active" : "shop-tab"}
                    onClick={() => setInventarioSeccion("iconos")}
                  >
                    Iconos
                  </button>
                </div>

                <div className="perfil-section perfil-section-shop-grid">
                  <div className="perfil-section-head">
                    <h4>{inventarioSeccion === "cartas" ? "Colección de cartas" : "Iconos en propiedad"}</h4>
                    <p>
                      {inventarioSeccion === "cartas"
                        ? "Las cartas aparecen una sola vez y muestran su cantidad total."
                        : "Los iconos comprados aparecen aquí y puedes equiparlos directamente."}
                    </p>
                  </div>

                  {inventarioCargando ? (
                    <div>Cargando inventario...</div>
                  ) : inventarioError ? (
                    <div>{inventarioError}</div>
                  ) : inventarioSeccion === "cartas" ? (
                    inventarioCartasFiltradas.length === 0 ? (
                      <div>Aún no tienes cartas en el inventario.</div>
                    ) : (
                      <div className="inventario-grid">
                        {inventarioCartasFiltradas.map((item) => (
                          <article key={`${item.item_tipo}-${item.item_key}`} className="inventario-card">
                            <div className="inventario-preview">
                              {item.imagen_src ? <img src={item.imagen_src} alt={item.nombre} /> : <span>🃏</span>}
                              <span className="inventario-count inventario-count-card">x{Math.max(1, Number(item.cantidad) || 0)}</span>
                            </div>
                            <strong>{item.nombre}</strong>
                            <small>{String(item.rareza || "common").toUpperCase()}</small>
                          </article>
                        ))}
                      </div>
                    )
                  ) : (
                    <div className="inventario-grid">
                      {inventarioIconosFiltrados.length === 0 ? (
                        <div>Aún no tienes iconos en el inventario.</div>
                      ) : inventarioIconosFiltrados.map((item) => {
                        const equipado = perfilActual?.equippedAvatarId === item.item_key;
                        const avatarCatalogoIcono = avatarCatalogo.find((avatar) => avatar.id === item.item_key);
                        const iconoSrc = item.imagen_src || item.metadata?.imagenUrl || item.metadata?.src || avatarCatalogoIcono?.src || null;
                        return (
                        <article key={`${item.item_tipo}-${item.item_key}`} className="inventario-card inventario-card-icon">
                          <div className="inventario-preview inventario-preview-icon">
                            {iconoSrc ? <img src={iconoSrc} alt={item.nombre} /> : <span>👤</span>}
                          </div>
                          <strong>{item.nombre}</strong>
                          <small>ICONO</small>
                          {equipado ? (
                            <span className="avatar-equipped">Equipado</span>
                          ) : (
                            <button type="button" className="inventario-equip-btn" onClick={() => equiparAvatar(item.item_key)}>
                              Equipar
                            </button>
                          )}
                        </article>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="perfil-actions">
                  <button type="button" onClick={() => setAuthModo("cuenta")}>Volver</button>
                  <button type="button" onClick={() => setAuthAbierto(false)}>Cerrar</button>
                </div>
              </div>
            ) : authModo === "tienda" && sesion ? (
              <div className="cuenta-panel">
                <div className="perfil-hero perfil-hero-shop">
                  <div className="perfil-hero-copy">
                    <span className="perfil-kicker">Tienda</span>
                    <h3>Avatares</h3>
                    <p>Separa la tienda en avatares y sobres para que quede más clara.</p>
                  </div>
                  <div className="perfil-hero-chip">
                    <span>Monedas</span>
                    <strong>{monedasActuales}</strong>
                  </div>
                </div>

                <div className="shop-tabs" role="tablist" aria-label="Secciones de la tienda">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tiendaSeccion === "avatares"}
                    className={tiendaSeccion === "avatares" ? "shop-tab shop-tab-active" : "shop-tab"}
                    onClick={() => setTiendaSeccion("avatares")}
                  >
                    Avatares
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tiendaSeccion === "sobres"}
                    className={tiendaSeccion === "sobres" ? "shop-tab shop-tab-active" : "shop-tab"}
                    onClick={() => setTiendaSeccion("sobres")}
                  >
                    Sobres
                  </button>
                </div>

                {tiendaSeccion === "avatares" && (
                  <div className="perfil-section">
                    <div className="perfil-section-head">
                      <h4>Filtros de avatares</h4>
                      <p>Úsalos solo para el catálogo de avatares.</p>
                    </div>
                    <div className="shop-filters">
                      <label>
                        Saga
                        <select value={tiendaSaga} onChange={(e) => setTiendaSaga(e.target.value)}>
                          {opcionesSaga.map((s) => (
                            <option key={s} value={s}>
                              {s === "all" ? "Todas" : s.toUpperCase()}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        Equipo
                        <select value={tiendaClub} onChange={(e) => setTiendaClub(e.target.value)}>
                          {opcionesClub.map((c) => (
                            <option key={c} value={c}>
                              {c === "all" ? "Todos" : formatearClub(c)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                )}

                {tiendaSeccion === "avatares" ? (
                  <div className="perfil-section perfil-section-shop-grid">
                    <div className="perfil-section-head">
                      <h4>Catálogo de avatares</h4>
                      <p>Compra y equipa avatares.</p>
                    </div>
                    <div className="avatar-grid">
                      {avataresFiltrados.map((avatar) => {
                        const comprado = !!perfilActual?.ownedAvatarIds?.includes(avatar.id);
                        const equipado = perfilActual?.equippedAvatarId === avatar.id;
                        const puedeComprar = monedasActuales >= avatar.precio;

                        return (
                          <div key={avatar.id} className="avatar-card">
                            <div className="avatar-preview">
                              {avatar.src ? <img src={avatar.src} alt={avatar.nombre} /> : <span>👤</span>}
                            </div>
                            <strong>{avatar.nombre}</strong>
                            <small>{avatar.precio === 0 ? "Gratis" : `${avatar.precio} monedas`}</small>
                            <small>{avatar.saga.toUpperCase()} - {formatearClub(avatar.club)}</small>

                            {!comprado && (
                              <button type="button" onClick={() => comprarAvatar(avatar)} disabled={!puedeComprar}>
                                Comprar
                              </button>
                            )}
                            {comprado && !equipado && (
                              <button type="button" onClick={() => equiparAvatar(avatar.id)}>
                                Equipar
                              </button>
                            )}
                            {equipado && <span className="avatar-equipped">Equipado</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : tiendaSeccion === "sobres" ? (
                  <div className="perfil-section perfil-section-shop-grid">
                    <div className="perfil-section-head">
                      <h4>Sobres de prueba</h4>
                      <p>Ahora mismo son gratis y cada sobre entrega 1 carta.</p>
                    </div>
                    <div className="sobre-grid">
                      {sobresCargando ? (
                        <div>Cargando sobres...</div>
                      ) : sobresCatalogo.length === 0 ? (
                        <div>No hay sobres disponibles.</div>
                      ) : (
                        sobresCatalogo.map((s) => (
                          <div key={s.id} className="sobre-card">
                            <div className="sobre-preview">
                              <img 
                                src={s.portada_src || DEFAULT_SOBRE_PORTADA} 
                                  alt={s.nombre} 
                                  className="sobre-img"
                                  onError={(e) => {
                                    console.error(`❌ Error loading portada for ${s.nombre}:`, e);
                                    e.target.src = DEFAULT_SOBRE_PORTADA;
                                  }}
                                  onLoad={() => console.log(`✓ Portada loaded: ${s.nombre}`)}
                              />
                            </div>
                            <strong>{s.nombre}</strong>
                            <small>{(s.precio_monedas || 0) === 0 ? 'Gratis' : `${s.precio_monedas || 0} monedas`}</small>
                            <button type="button" onClick={() => comprarSobre(s)}>
                              Comprar y abrir
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="perfil-section perfil-section-shop-grid">
                    <div className="perfil-section-head">
                      <h4>Tu inventario</h4>
                      <p>Copias totales: {inventarioCartas.reduce((acc, c) => acc + (Number(c.cantidad) || 0), 0)}</p>
                    </div>

                    {inventarioCargando ? (
                      <div>Cargando inventario...</div>
                    ) : inventarioError ? (
                      <div>{inventarioError}</div>
                    ) : inventarioCartas.length === 0 ? (
                      <div>Aún no tienes cartas. Abre un sobre para empezar.</div>
                    ) : (
                      <div className="inventario-grid">
                        {inventarioCartas.map((c) => (
                          <article key={c.carta_id || c.id} className="inventario-card">
                            <div className="inventario-preview">
                              {c.imagen_src ? (
                                <img src={c.imagen_src} alt={c.nombre || "Carta"} />
                              ) : (
                                <span>🃏</span>
                              )}
                              <span className="inventario-count">x{Math.max(1, Number(c.cantidad) || 0)}</span>
                            </div>
                            <strong>{c.nombre || `Carta ${c.carta_id || "?"}`}</strong>
                            <small>{String(c.rareza || "common").toUpperCase()}</small>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="perfil-actions">
                  <button type="button" onClick={() => setAuthModo("cuenta")}>Volver</button>
                  <button type="button" onClick={() => setAuthAbierto(false)}>Cerrar</button>
                </div>
              </div>
            ) : (
              <>
                <div className="perfil-hero perfil-hero-auth">
                  <div className="perfil-hero-copy">
                    <span className="perfil-kicker">Cuenta</span>
                    <h3>{authModo === "login" ? "Iniciar sesion" : "Crear cuenta"}</h3>
                    <p>Guarda tu progreso diario y desbloquea avatares.</p>
                  </div>
                </div>
                <form onSubmit={procesarAuth} className="perfil-form">
                  <label>
                    Usuario (o email en login)
                    <input
                      type="text"
                      value={authForm.username}
                      onChange={(e) => setAuthForm((prev) => ({ ...prev, username: e.target.value }))}
                      maxLength={24}
                      disabled={authLoading}
                    />
                  </label>

                  {authModo === "registro" && (
                    <label>
                      Email
                      <input
                        type="email"
                        value={authForm.email}
                        onChange={(e) => setAuthForm((prev) => ({ ...prev, email: e.target.value }))}
                        maxLength={100}
                        disabled={authLoading}
                      />
                    </label>
                  )}

                  <label>
                    Contraseña
                    <input
                      type="password"
                      value={authForm.password}
                      onChange={(e) => setAuthForm((prev) => ({ ...prev, password: e.target.value }))}
                      maxLength={64}
                      disabled={authLoading}
                    />
                  </label>

                  {authError && <p className="auth-error">{authError}</p>}

                  <div className="perfil-actions">
                    <button
                      type="button"
                      onClick={() => setAuthModo((prev) => (prev === "login" ? "registro" : "login"))}
                      disabled={authLoading}
                    >
                      {authModo === "login" ? "Ir a registro" : "Ir a login"}
                    </button>
                    <button type="submit" disabled={authLoading}>
                      {authLoading ? "Cargando..." : authModo === "login" ? "Entrar" : "Crear cuenta"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {abrirSobreState.abierto && (
        <div className="sobre-modal">
          <div className={`sobre-modal-backdrop ${abrirSobreState.animando ? 'animando' : ''}`} onClick={() => { if (!abrirSobreState.animando) setAbrirSobreState({ abierto: false, sobre: null, cartas: [], animando: false }); }} />
          <div className="sobre-modal-body">
            {abrirSobreState.animando ? (
              <div className="sobre-opening">
                <img
                  className="sobre-box-image"
                  src={DEFAULT_SOBRE_PORTADA}
                  alt="Sobre"
                  aria-hidden="true"
                />
              </div>
            ) : (
              <div className="sobre-result">
                {abrirSobreState.cartas.length > 0 && (
                  <div className="cartas-list">
                    {abrirSobreState.cartas.map((c) => (
                      <div key={c.id} className="carta-card">
                        <img 
                          src={c.imagen_src || DEFAULT_SOBRE_PORTADA} 
                          alt="Carta obtenida"
                          onError={(e) => {
                            console.error(`❌ Error loading carta image for ${c.nombre}:`, e);
                            e.currentTarget.src = DEFAULT_SOBRE_PORTADA;
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}
                <div className="perfil-actions">
                  <button type="button" aria-label="Cerrar" onClick={() => setAbrirSobreState({ abierto: false, sobre: null, cartas: [], animando: false })}>×</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {toastMonedas && <div className="coin-toast">{toastMonedas}</div>}
    </div>
  );
}
