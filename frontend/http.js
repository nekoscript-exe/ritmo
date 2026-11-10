const fields = {
  username: "Usuario", password: "Contraseña", name: "Nombre del hábito",
  title: "Título", day: "Fecha", starts_at: "Hora de inicio",
  ends_at: "Hora de fin", category: "Categoría", done: "Estado del hábito",
  habit_id: "Identificador del hábito", block_id: "Identificador del bloque",
  task_id: "Identificador de la tarea", description: "Descripción", due_date: "Fecha límite",
  priority: "Prioridad", completed: "Estado de la tarea", status: "Filtro de estado",
};

function validationMessage(error) {
  const field = fields[error.loc?.at(-1)] || "Datos";
  const type = error.type || "";
  let message = "revisa el valor indicado.";
  if (type === "missing") message = "este campo es obligatorio.";
  else if (type === "string_too_short") message = `usa al menos ${error.ctx?.min_length} caracteres.`;
  else if (type === "string_too_long") message = `usa como máximo ${error.ctx?.max_length} caracteres.`;
  else if (type === "string_pattern_mismatch") message = "usa de 3 a 32 letras, números, puntos, guiones o guiones bajos.";
  else if (type.startsWith("date")) message = "introduce una fecha válida (AAAA-MM-DD).";
  else if (type.startsWith("time")) message = "introduce una hora local válida (HH:MM), sin zona horaria.";
  else if (type === "literal_error") message = error.loc?.at(-1) === "priority"
    ? "elige baja, media o alta."
    : error.loc?.at(-1) === "status" ? "elige pendientes o completadas."
    : "elige Personal, Trabajo, Estudio, Salud o Descanso.";
  else if (type === "bool_parsing" || type === "bool_type") message = "indica si está completado o pendiente.";
  else if (type === "value_error") {
    // Solo mensajes conocidos: nunca mostrar input, contraseñas ni detalles internos.
    if (error.msg?.includes("La hora de fin debe ser posterior")) return "La hora de fin debe ser posterior a la de inicio.";
    if (error.msg?.includes("Usa horas locales")) return "Usa horas locales sin zona horaria.";
  }
  return `${field}: ${message}`;
}

export function httpMessage(status, result = {}) {
  if (status >= 500) return "El servidor no está disponible. Intenta de nuevo en unos momentos.";
  if (status === 422 && Array.isArray(result.detail)) {
    return [...new Set(result.detail.map(validationMessage))].join(" ") || "Revisa los datos del formulario.";
  }
  if (typeof result.detail === "string") return result.detail;
  return ({
    401: "Tu sesión terminó. Inicia sesión para continuar.",
    403: "No tienes permiso para realizar esta operación.",
    404: "El elemento ya no existe o no está disponible para tu cuenta.",
    409: "Los datos entran en conflicto con un registro existente.",
    413: "La petición es demasiado grande. Reduce los datos enviados.",
    422: "Revisa los datos del formulario.",
    429: "Demasiados intentos. Espera un momento antes de volver a intentar.",
  })[status] || `No se pudo completar la operación (HTTP ${status}).`;
}

export async function requestJSON(path, method = "GET", body, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("/api" + path, {
      method, signal: controller.signal,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      let result = {};
      try { result = await response.json(); } catch (error) {
        if (controller.signal.aborted) throw error;
      }
      throw Object.assign(new Error(httpMessage(response.status, result || {})), { status: response.status });
    }
    if (response.status !== 204) return await response.json();
  } catch (error) {
    if (controller.signal.aborted) {
      const advice = method === "GET" ? "Vuelve a intentar." : "Comprueba el resultado antes de repetir: la operación pudo haberse guardado.";
      throw new Error(`La petición tardó demasiado. ${advice}`);
    }
    if (error instanceof TypeError) {
      const advice = method === "GET" ? "Revisa tu conexión." : "Comprueba el resultado antes de repetir la operación.";
      throw new Error(`No se pudo conectar con la aplicación. ${advice}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
