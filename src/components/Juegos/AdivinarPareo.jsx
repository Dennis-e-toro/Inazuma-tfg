import { useEffect, useState } from "react";
import "./AdivinarPareo.css";
import { API_BASE } from "../../config";
import { assetUrl } from "../../helpers/assetUrl";

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

function formatearNombreAtributo(attr) {
  const nombres = {
    club: "Club",
    posicion: "Posición",
    elemento: "Elemento",
    saga: "Saga",
    genero: "Género",
    tiene_espiritu: "Espíritu",
    tiene_miximax: "MixiMax",
  };
  return nombres[attr] || attr;
}

function obtenerIconoAtributo(attr, valor, personaje) {
  if (attr === "saga") {
    return iconoSagaPorCodigo(valor);
  }
  if (attr === "elemento") {
    return personaje.icono_elemento_url;
  }
  if (attr === "posicion") {
    return personaje.icono_posicion_url;
  }
  if (attr === "club") {
    return personaje.icono_club_url;
  }
  if (attr === "genero") {
    return personaje.genero_url;
  }
  return null;
}

function esAtributoConIcono(attr) {
  return ["saga", "elemento", "posicion", "club", "genero"].includes(attr);
}

function formatearValor(_attr, valor) {
  if (typeof valor === "boolean") {
    return valor ? "Sí" : "No";
  }
  return String(valor || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AdivinarPareo({ onDailyComplete }) {
  const [personajes, setPersonajes] = useState([]);
  const [pareo, setPareo] = useState(null);
  const [aciertos, setAciertos] = useState(0);
  const [intentoActual, setIntentoActual] = useState(0);
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
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
      });
  }, []);

  const generarPareo = (listaPersonajes) => {
    if (listaPersonajes.length < 4) return null;

    const atributos = [
      "club",
      "posicion",
      "elemento",
      "saga",
      "genero",
      "tiene_espiritu",
      "tiene_miximax",
    ];

    // Seleccionar objetivo
    const objetivo = listaPersonajes[Math.floor(Math.random() * listaPersonajes.length)];

    // Seleccionar 2 atributos distintos
    let attr1 = atributos[Math.floor(Math.random() * atributos.length)];
    let attr2 = atributos[Math.floor(Math.random() * atributos.length)];
    while (attr2 === attr1) {
      attr2 = atributos[Math.floor(Math.random() * atributos.length)];
    }

    // Generar opciones: 1 correcta + 2 incorrectas
    const opciones = [objetivo];
    let intentos = 0;

    while (opciones.length < 3 && intentos < 50) {
      intentos += 1;
      const random = listaPersonajes[Math.floor(Math.random() * listaPersonajes.length)];

      // Evitar duplicados
      if (opciones.some((p) => p.id === random.id)) continue;

      // Asegurar que NO tenga ambos atributos
      const tieneAttr1 = random[attr1] === objetivo[attr1];
      const tieneAttr2 = random[attr2] === objetivo[attr2];

      if (!(tieneAttr1 && tieneAttr2)) {
        opciones.push(random);
      }
    }

    // Fallback para asegurar 3 opciones incluso en combinaciones raras
    if (opciones.length < 3) {
      for (const p of listaPersonajes) {
        if (opciones.length >= 3) break;
        if (!opciones.some((o) => o.id === p.id)) {
          opciones.push(p);
        }
      }
    }

    // Shuffle opciones
    const opcionesShuffled = [...opciones].sort(() => Math.random() - 0.5);

    return {
      objetivo,
      attr1,
      attr2,
      val1: objetivo[attr1],
      val2: objetivo[attr2],
      opciones: opcionesShuffled,
      correcta: objetivo.id,
    };
  };

  useEffect(() => {
    if (personajes.length > 0 && !pareo) {
      setPareo(generarPareo(personajes));
    }
  }, [personajes, pareo]);

  const handleSeleccionar = (personajeId) => {
    if (!pareo) return;

    const esCorrect = personajeId === pareo.correcta;

    if (esCorrect) {
      setAciertos((prev) => prev + 1);
      setMensaje("¡Correcto!");
      onDailyComplete?.("adivinarPareo");
      setTimeout(() => {
        setMensaje("");
        setPareo(null);
        setIntentoActual(0);
      }, 600);
    } else {
      const siguienteIntento = intentoActual + 1;
      setIntentoActual(siguienteIntento);
      if (siguienteIntento >= 3) {
        setMensaje("Fin del intento");
        setTimeout(() => {
          setMensaje("");
          setPareo(null);
          setIntentoActual(0);
        }, 800);
      } else {
        setMensaje("Incorrecto, intenta de nuevo");
        setTimeout(() => setMensaje(""), 500);
      }
    }
  };

  if (!pareo || personajes.length === 0) {
    return <p className="ap-loading">Cargando pareo...</p>;
  }

  return (
    <div className="apareo-wrap">
      <div className="apareo-panel">
        <h2>Pareo de Atributos</h2>
        <p className="apareo-subtitle">Encuentra al personaje que comparta AMBOS atributos</p>

        <div className="apareo-score">
          <span className="apareo-aciertos">Aciertos: {aciertos}</span>
          <span className="apareo-intentos">Intentos: {intentoActual}/3</span>
        </div>

        <div className="apareo-pista">
          <div className="apareo-atributo">
            {esAtributoConIcono(pareo.attr1) ? (
              <img src={obtenerIconoAtributo(pareo.attr1, pareo.val1, pareo.objetivo)} alt={pareo.attr1} />
            ) : (
              <div className="apareo-valor">{formatearValor(pareo.attr1, pareo.val1)}</div>
            )}
            <span>{formatearNombreAtributo(pareo.attr1)}</span>
          </div>
          <div className="apareo-y">Y</div>
          <div className="apareo-atributo">
            {esAtributoConIcono(pareo.attr2) ? (
              <img src={obtenerIconoAtributo(pareo.attr2, pareo.val2, pareo.objetivo)} alt={pareo.attr2} />
            ) : (
              <div className="apareo-valor">{formatearValor(pareo.attr2, pareo.val2)}</div>
            )}
            <span>{formatearNombreAtributo(pareo.attr2)}</span>
          </div>
        </div>

        <div className="apareo-opciones">
          {pareo.opciones.map((p) => (
            <button
              key={p.id}
              className="apareo-opcion"
              onClick={() => handleSeleccionar(p.id)}
            >
              <img src={p.sprite_url} alt={p.nombre} className="apareo-sprite" />
              <span className="apareo-nombre">{p.nombre}</span>
            </button>
          ))}
        </div>

        {mensaje && <div className="apareo-mensaje">{mensaje}</div>}
      </div>
    </div>
  );
}
