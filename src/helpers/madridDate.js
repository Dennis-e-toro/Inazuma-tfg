export function obtenerFechaMadrid(fecha = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(fecha).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});

  const fechaIso = `${parts.year}-${parts.month}-${parts.day}`;
  const hora = Number(parts.hour || 0);
  if (Number.isNaN(hora)) return fechaIso;
  if (hora < 9) {
    const base = new Date(`${fechaIso}T00:00:00.000Z`);
    base.setUTCDate(base.getUTCDate() - 1);
    return base.toISOString().slice(0, 10);
  }
  return fechaIso;
}
