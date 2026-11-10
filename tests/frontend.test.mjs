import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const httpSource = await readFile(new URL("../frontend/http.js", import.meta.url), "utf8");
const { requestJSON, httpMessage } = await import("data:text/javascript;base64," + Buffer.from(httpSource).toString("base64"));
const appSource = (await readFile(new URL("../frontend/app.js", import.meta.url), "utf8"))
  .replace(/^import \{ requestJSON \} from "\.\/http.js";\n/m, "");

test("HTTP: JSON, cookie implícita del mismo origen y respuesta 204", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (...args) => {
    calls.push(args);
    return new Response(null, { status: 204 });
  });
  assert.equal(await requestJSON("/blocks/1", "DELETE"), undefined);
  assert.equal(calls[0][0], "/api/blocks/1");
  assert.equal(calls[0][1].method, "DELETE");
  assert.ok(calls[0][1].signal instanceof AbortSignal);
});

test("HTTP: lee JSON y serializa el formulario", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(options.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(options.body), { name: "Leer" });
    return Response.json({ id: 1 }, { status: 201 });
  });
  assert.deepEqual(await requestJSON("/habits", "POST", { name: "Leer" }), { id: 1 });
});

test("HTTP: timeout cancela fetch y advierte sobre escrituras inciertas", async (t) => {
  let aborted = false;
  t.mock.method(globalThis, "fetch", (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => {
      aborted = true;
      reject(new DOMException("Aborted", "AbortError"));
    });
  }));
  await assert.rejects(requestJSON("/blocks", "POST", {}, 10), /pudo haberse guardado/);
  assert.equal(aborted, true);
});

test("HTTP: timeout también cubre la lectura del cuerpo", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, { signal }) => ({
    ok: true, status: 200,
    json: () => new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))),
  }));
  await assert.rejects(requestJSON("/days/2026-11-09", "GET", undefined, 10), /tardó demasiado/);
});

test("HTTP: error de red legible", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(requestJSON("/habits"), /Revisa tu conexión/);
});

test("HTTP: conserva status y mensajes, admite errores HTML del proxy", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ detail: "Hábito no encontrado." }, { status: 404 }));
  await assert.rejects(requestJSON("/habits/1"), (error) => error.status === 404 && error.message === "Hábito no encontrado.");
  globalThis.fetch = async () => new Response("<html>Internal details</html>", { status: 502 });
  await assert.rejects(requestJSON("/habits"), (error) => error.status === 502 && !error.message.includes("Internal details"));
});

test("HTTP: validaciones traducidas sin mostrar input sensible", () => {
  const text = httpMessage(422, { detail: [
    { loc: ["body", "password"], type: "string_too_short", ctx: { min_length: 10 }, input: "SECRET" },
    { loc: ["body", "day"], type: "date_from_datetime_parsing" },
    { loc: ["body", "category"], type: "literal_error" },
    { loc: ["body"], type: "value_error", msg: "Value error, La hora de fin debe ser posterior a la de inicio." },
  ] });
  assert.match(text, /Contraseña: usa al menos 10/);
  assert.match(text, /fecha válida/);
  assert.match(text, /Personal, Trabajo/);
  assert.match(text, /posterior/);
  assert.ok(!text.includes("SECRET"));
  assert.ok(!httpMessage(500, { detail: "SECRET" }).includes("SECRET"));
  for (const status of [401, 403, 404, 409, 413, 422, 429]) assert.ok(httpMessage(status).length > 10);
});

class Node {
  constructor() {
    this.children = []; this.listeners = {}; this.value = ""; this.hidden = false;
    this.classList = { toggle() {} }; this.validity = { valid: true };
    this.elements = {};
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute() {}
  add() {}
  focus() {}
  reset() { this.resets = (this.resets || 0) + 1; }
  reportValidity() { return true; }
  querySelectorAll() { return []; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
}

async function appHarness(request) {
  const nodes = new Map();
  const document = {
    querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, new Node()); return nodes.get(selector); },
    createElement() { return new Node(); },
  };
  const context = vm.createContext({ document, Option: class {}, window: { confirm: () => true }, requestJSON: request });
  vm.runInContext(appSource, context);
  await new Promise(setImmediate); // Completa la consulta inicial del script real.
  vm.runInContext(`editingBlock = 7; dailyBlocks = [
    {id: 7, title: 'Editar', category: 'personal', starts_at: '09:00', ends_at: '10:00'},
    {id: 8, title: 'Otro', category: 'personal', starts_at: '10:00', ends_at: '11:00'}
  ]; renderBlocks();`, context);
  return { context, nodes, remove: (index) => nodes.get("#blocks").children[index].children[1].children[1].listeners.click() };
}

test("editor: borrar el bloque editado reinicia el formulario después del DELETE", async () => {
  const app = await appHarness(async () => ({ habits: [], blocks: [] }));
  await app.remove(0);
  assert.equal(vm.runInContext("editingBlock", app.context), null);
  assert.equal(app.nodes.get("#save-block").textContent, "Añadir bloque");
  assert.equal(app.nodes.get("#cancel-edit").hidden, true);
});

test("editor: borrar otro bloque conserva la edición", async () => {
  const app = await appHarness(async () => ({ habits: [], blocks: [] }));
  await app.remove(1);
  assert.equal(vm.runInContext("editingBlock", app.context), 7);
});

test("editor: fallo al borrar conserva la edición y libera controles", async () => {
  const app = await appHarness(async (path, method) => {
    if (method === "DELETE") throw new Error("No se pudo eliminar.");
    return { habits: [], blocks: [] };
  });
  await app.remove(0);
  assert.equal(vm.runInContext("editingBlock", app.context), 7);
  assert.match(app.nodes.get("#error").textContent, /No se pudo eliminar/);
  assert.equal(app.nodes.get("#previous").disabled, false);
});

test("editor: borrado confirmado y recarga fallida no invitan a repetir la escritura", async () => {
  let deleted = false;
  const app = await appHarness(async (path, method) => {
    if (method === "DELETE") { deleted = true; return; }
    if (deleted) throw new Error("Sin conexión.");
    return { habits: [], blocks: [] };
  });
  await app.remove(0);
  assert.equal(vm.runInContext("editingBlock", app.context), null);
  assert.match(app.nodes.get("#error").textContent, /El cambio se guardó/);
});

test("sesión: un 401 limpia los datos privados y muestra el motivo", async () => {
  const app = await appHarness(async (path, method) => {
    if (method === "DELETE") throw Object.assign(new Error("Inicia sesión para continuar."), { status: 401 });
    return { habits: [], blocks: [] };
  });
  await app.remove(0);
  assert.equal(app.nodes.get("#workspace").hidden, true);
  assert.equal(app.nodes.get("#account-panel").hidden, false);
  assert.equal(app.nodes.get("#blocks").children.length, 0);
  assert.equal(vm.runInContext("editingBlock", app.context), null);
  assert.equal(app.nodes.get("#error").hidden, false);
  assert.match(app.nodes.get("#error").textContent, /Inicia sesión/);
});
