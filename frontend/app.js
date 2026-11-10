import { requestJSON } from "./http.js";

const workspace = document.querySelector("#workspace");
const accountPanel = document.querySelector("#account-panel");
const accountForm = document.querySelector("#account-form");
const saveBlock = document.querySelector("#save-block");
const cancelEdit = document.querySelector("#cancel-edit");
let editingBlock = null;
let weekVisible = false;
let weekData;
let dailyBlocks = [];
const dailyView = document.querySelector("#daily-view");
const weeklyView = document.querySelector("#weekly-view");
const dailyPanel = document.querySelector("#daily-panel");
const weekPanel = document.querySelector("#week-panel");
const weekMode = document.querySelector("#week-mode");
const weekDays = document.querySelector("#week-days");
const weekSummary = document.querySelector("#week-summary");
const filter = document.querySelector("#category-filter");
const categories = {
  personal: "Personal", trabajo: "Trabajo", estudio: "Estudio",
  salud: "Salud", descanso: "Descanso",
};
for (const [key, label] of Object.entries(categories)) {
  document.querySelector("#block-category").add(new Option(label, key));
  filter.add(new Option(label, key));
}

function switchView(showWeek) {
  weekVisible = showWeek;
  dailyPanel.hidden = showWeek;
  weekPanel.hidden = !showWeek;
  dailyView.setAttribute("aria-pressed", String(!showWeek));
  weeklyView.setAttribute("aria-pressed", String(showWeek));
  previous.setAttribute("aria-label", showWeek ? "Semana anterior" : "Día anterior");
  next.setAttribute("aria-label", showWeek ? "Semana siguiente" : "Día siguiente");
  run();
}

function renderWeek(data) {
  const cards = [];
  const counts = new Map(data.checks.map(({day, completed}) => [day, completed]));
  const totalChecks = data.checks.reduce((total, row) => total + row.completed, 0);
  weekSummary.textContent = `${data.blocks.length} bloques · ${totalChecks} hábitos completados`;
  weekDays.classList.toggle("week-list", weekMode.value === "list");
  const date = new Date(data.start + "T12:00:00");
  for (let offset = 0; offset < 7; offset++) {
    const key = localDay(date);
    if (key > data.end || date.getFullYear() > 9999) break;
    const card = element("article", "week-day");
    const open = element("button", "week-date", dateFormat.format(date));
    open.type = "button";
    if (key === day.value) open.setAttribute("aria-current", "date");
    open.addEventListener("click", () => {
      resetBlock();
      day.value = key;
      switchView(false);
    });
    const list = element("ul", "items");
    for (const block of data.blocks.filter((block) => block.day === key)) {
      const item = element("li", "week-block", block.starts_at.slice(0, 5) + " · " + block.title);
      item.append(element("small", "tag " + block.category, categories[block.category]));
      list.append(item);
    }
    if (!list.children.length) list.append(element("li", "empty", "Sin bloques"));
    card.append(open, element("small", "muted", (counts.get(key) || 0) + " hábitos completados"), list);
    cards.push(card);
    date.setDate(date.getDate() + 1);
  }
  weekDays.replaceChildren(...cards);
}

dailyView.addEventListener("click", () => switchView(false));
weeklyView.addEventListener("click", () => switchView(true));
weekMode.addEventListener("change", () => { if (weekData) renderWeek(weekData); });
filter.addEventListener("change", renderBlocks);

function showWorkspace(signedIn) {
  workspace.hidden = !signedIn;
  accountPanel.hidden = signedIn;
  if (!signedIn) {
    weekDays.replaceChildren();
    weekSummary.textContent = "";
    weekData = undefined;
    dailyBlocks = [];
    habits.replaceChildren();
    blocks.replaceChildren();
    habitForm.reset();
    resetBlock();
  }
}

function resetBlock() {
  editingBlock = null;
  blockForm.reset();
  saveBlock.textContent = "Añadir bloque";
  cancelEdit.hidden = true;
}

const day = document.querySelector("#day");
const dateLabel = document.querySelector("#date-label");
const habits = document.querySelector("#habits");
const blocks = document.querySelector("#blocks");
const progress = document.querySelector("#progress");
const progressLabel = document.querySelector("#progress-label");
const errorBox = document.querySelector("#error");
const habitForm = document.querySelector("#habit-form");
const blockForm = document.querySelector("#block-form");
const previous = document.querySelector("#previous");
const next = document.querySelector("#next");
const today = document.querySelector("#today");
const dateFormat = new Intl.DateTimeFormat("es-MX", { dateStyle: "full" });

function localDay(date = new Date()) {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const number = String(date.getDate()).padStart(2, "0");
  return [year, month, number].join("-");
}

async function api(path, method = "GET", body) {
  try {
    return await requestJSON(path, method, body);
  } catch (error) {
    if (error.status === 401 && !path.startsWith("/account/")) showWorkspace(false);
    throw error;
  }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function removeButton(name, path, confirmation, onRemoved) {
  const button = element("button", "remove", "Eliminar");
  button.type = "button";
  button.setAttribute("aria-label", "Eliminar " + name);
  button.addEventListener("click", () => {
    if (window.confirm(confirmation)) return run(async () => {
      await api(path, "DELETE");
      onRemoved?.();
    });
  });
  return button;
}

function render(data) {
  const checked = data.habits.filter((habit) => habit.done).length;
  progress.max = Math.max(1, data.habits.length);
  progress.value = checked;
  progressLabel.textContent = checked + " de " + data.habits.length + " completados";
  habits.replaceChildren(...data.habits.map((habit) => {
    const item = element("li", "item");
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = habit.done;
    checkbox.addEventListener("change", () => {
      const done = checkbox.checked;
      run(() => api("/habits/" + habit.id + "/checks/" + day.value, "PUT", { done }), () => {
        checkbox.checked = habit.done;
      });
    });
    label.append(checkbox, habit.name);
    item.append(label, removeButton(habit.name, "/habits/" + habit.id,
      "¿Eliminar este hábito y su historial?"));
    return item;
  }));
  if (!data.habits.length) habits.append(element("li", "empty", "Añade tu primer hábito diario."));

  dailyBlocks = data.blocks;
  renderBlocks();
}

function renderBlocks() {
  const visible = dailyBlocks.filter((block) => !filter.value || block.category === filter.value);
  blocks.replaceChildren(...visible.map((block) => {
    const item = element("li", "item");
    const description = element("div", "");
    description.append(
      element("strong", "", block.title),
      element("small", "tag " + block.category, categories[block.category]),
      element("small", "", block.starts_at.slice(0, 5) + "–" + block.ends_at.slice(0, 5)),
    );
    const edit = element("button", "", "Editar");
    edit.type = "button";
    edit.setAttribute("aria-label", "Editar " + block.title);
    edit.addEventListener("click", () => {
      editingBlock = block.id;
      blockForm.elements.category.value = block.category;
      blockForm.elements.title.value = block.title;
      blockForm.elements.starts_at.value = block.starts_at.slice(0, 5);
      blockForm.elements.ends_at.value = block.ends_at.slice(0, 5);
      saveBlock.textContent = "Guardar cambios";
      cancelEdit.hidden = false;
      blockForm.elements.title.focus();
    });
    const actions = element("div", "controls");
    actions.append(edit, removeButton(block.title, "/blocks/" + block.id, "¿Eliminar este bloque?", () => {
      if (editingBlock === block.id) resetBlock();
    }));
    item.append(description, actions);
    return item;
  }));
  if (!visible.length) blocks.append(element("li", "empty", filter.value ? "Sin bloques en esta categoría." : "Tu agenda está libre para esta fecha."));
}

function setBusy(busy) {
  workspace.querySelectorAll("input, button, select").forEach((control) => {
    control.disabled = busy;
  });
  previous.disabled = busy || day.value === day.min;
  next.disabled = busy || day.value === day.max;
}

async function run(mutation, onFailure) {
  if (!day.reportValidity()) return;
  errorBox.hidden = true;
  setBusy(true);
  dateLabel.textContent = dateFormat.format(new Date(day.value + "T12:00:00"));
  let mutationCompleted = false;
  try {
    if (mutation) {
      try {
        await mutation();
        mutationCompleted = true;
      } catch (error) {
        onFailure?.();
        throw error;
      }
    }
    habits.replaceChildren();
    blocks.replaceChildren();
    progress.value = 0;
    progressLabel.textContent = "Cargando hábitos…";
    if (weekVisible) {
      weekData = undefined;
      weekDays.replaceChildren();
      weekSummary.textContent = "Cargando semana…";
      weekData = await api("/weeks/" + day.value);
      renderWeek(weekData);
    } else {
      dailyBlocks = [];
      render(await api("/days/" + day.value));
    }
    showWorkspace(true);
  } catch (error) {
    if (weekVisible && !weekData) weekSummary.textContent = "Semana no disponible";
    if (!habits.children.length) progressLabel.textContent = "Hábitos no disponibles";
    errorBox.textContent = mutationCompleted
      ? "El cambio se guardó, pero no se pudo actualizar la vista. Recarga antes de repetir la operación. " + error.message
      : error.message;
    errorBox.hidden = false;
    if (workspace.hidden) showWorkspace(false);
  } finally {
    setBusy(false);
  }
}

function moveDay(offset) {
  if (!day.reportValidity()) return;
  const date = new Date(day.value + "T12:00:00");
  resetBlock();
  date.setDate(date.getDate() + offset * (weekVisible ? 7 : 1));
  day.value = date.getFullYear() < 1 ? day.min : date.getFullYear() > 9999 ? day.max : localDay(date);
  run();
}

day.value = localDay();
day.addEventListener("change", () => {
  resetBlock();
  if (!day.validity.valid) day.value = localDay();
  run();
});
previous.addEventListener("click", () => moveDay(-1));
next.addEventListener("click", () => moveDay(1));
today.addEventListener("click", () => {
  resetBlock();
  day.value = localDay();
  run();
});

habitForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = habitForm.elements.name.value.trim();
  run(async () => {
    await api("/habits", "POST", { name });
    habitForm.reset();
  });
});

blockForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const { title, starts_at, ends_at, category } = blockForm.elements;
  run(async () => {
    if (ends_at.value <= starts_at.value) {
      throw new Error("La hora de fin debe ser posterior a la de inicio.");
    }
    const path = editingBlock ? "/blocks/" + editingBlock : "/blocks";
    await api(path, editingBlock ? "PUT" : "POST", {
      title: title.value.trim(), day: day.value, starts_at: starts_at.value, ends_at: ends_at.value, category: category.value,
    });
    resetBlock();
  });
});

cancelEdit.addEventListener("click", resetBlock);

accountForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const action = event.submitter.value;
  const credentials = Object.fromEntries(new FormData(accountForm));
  const buttons = accountForm.querySelectorAll("button");
  buttons.forEach((button) => { button.disabled = true; });
  errorBox.hidden = true;
  try {
    await api("/account/" + action, "POST", credentials);
    accountForm.reset();
    await run();
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
});

document.querySelector("#logout").addEventListener("click", async () => {
  setBusy(true);
  try {
    await api("/account/logout", "POST");
    showWorkspace(false);
    errorBox.hidden = true;
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
  } finally {
    setBusy(false);
  }
});

run();
