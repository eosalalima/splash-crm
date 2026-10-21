/* M0 offline design sketch. No application imports, requests or persistence. */
(() => {
  "use strict";
  const byId = (id) => document.getElementById(id);
  const original = [
    {
      id: "lead",
      name: "Lead",
      probability: 10,
      hours: 48,
      role: "representative",
      close: false,
      call: false,
    },
    {
      id: "qualified",
      name: "Qualified",
      probability: 30,
      hours: 72,
      role: "representative",
      close: false,
      call: false,
    },
    {
      id: "proposal",
      name: "Proposal",
      probability: 60,
      hours: 120,
      role: "manager",
      close: true,
      call: true,
    },
    {
      id: "won",
      name: "Won",
      probability: 100,
      hours: 0,
      role: "representative",
      terminal: "successful",
      close: false,
      call: false,
    },
    {
      id: "lost",
      name: "Lost",
      probability: 0,
      hours: 0,
      role: "representative",
      terminal: "unsuccessful",
      close: false,
      call: false,
    },
  ];
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const money = (minor) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
    }).format(minor / 100);
  const state = {
    draft: clone(original),
    selected: "proposal",
    published: { number: 1, stages: clone(original) },
    instance: null,
    expected: 1,
    history: [],
  };
  function node(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function message(id, text, error = false) {
    byId(id).textContent = text;
    byId(id).classList.toggle("error", error);
  }
  function record(text) {
    state.history.unshift(text);
    renderHistory();
  }
  function renderHistory() {
    byId("history-list").replaceChildren(
      ...state.history.map((text) => node("li", text)),
    );
  }
  function loadEditor() {
    const stage = state.draft.find((s) => s.id === state.selected);
    byId("stage-title").textContent = `${stage.name} settings`;
    byId("stage-name").value = stage.name;
    byId("stage-probability").value = stage.probability;
    byId("stage-hours").value = stage.hours;
    byId("stage-role").value = stage.role;
    byId("requires-close").checked = stage.close;
    byId("requires-call").checked = stage.call;
  }
  function renderStages() {
    byId("stages").replaceChildren(
      ...state.draft.map((stage, index) => {
        const li = node(
          "li",
          undefined,
          stage.id === state.selected ? "selected" : "",
        );
        const row = node("div", undefined, "stage-row");
        const select = node(
          "button",
          `${stage.name} · ${stage.probability}%`,
          "stage-select",
        );
        select.type = "button";
        select.setAttribute(
          "aria-pressed",
          String(stage.id === state.selected),
        );
        select.onclick = () => {
          state.selected = stage.id;
          renderStages();
          loadEditor();
        };
        row.append(select);
        if (!stage.terminal && stage.id !== "lead")
          for (const [label, offset] of [
            ["Up", -1],
            ["Down", 1],
          ]) {
            const button = node("button", label, "order-button");
            button.type = "button";
            button.setAttribute(
              "aria-label",
              `Move ${stage.name} ${label.toLowerCase()}`,
            );
            const target = state.draft[index + offset];
            button.disabled =
              byId("role").value !== "administrator" ||
              !target ||
              target.id === "lead" ||
              Boolean(target.terminal);
            button.onclick = () => {
              [state.draft[index], state.draft[index + offset]] = [
                state.draft[index + offset],
                state.draft[index],
              ];
              renderStages();
              message(
                "design-message",
                "Execution order changed in the draft. The active sample journey is unchanged.",
              );
              byId("draft-status").textContent =
                "Draft has unpublished changes";
            };
            row.append(button);
          }
        li.append(row);
        return li;
      }),
    );
  }
  function renderBoard() {
    const instance = state.instance;
    const stages = instance.version.stages;
    const current = stages.find((s) => s.id === instance.stage);
    byId("version-note").textContent =
      `Sample journey uses v${instance.version.number}. Latest publication is v${state.published.number}. Revision ${instance.revision}; your view expects ${state.expected}.`;
    byId("board").replaceChildren(
      ...stages.map((stage) => {
        const column = node("article", undefined, "column");
        column.append(
          node("h3", stage.name),
          node(
            "small",
            stage.terminal
              ? `Terminal · ${stage.terminal}`
              : `${stage.probability}% · target ${stage.hours ? `${stage.hours}h` : "none"}`,
          ),
        );
        if (stage.id === instance.stage) {
          const card = node("div", undefined, "opportunity-card");
          card.append(
            node("strong", "Northstar · annual renewal"),
            node("p", money(instance.value)),
            node(
              "p",
              `Journey ${instance.outcome || "active"} · opportunity open`,
            ),
            node("p", `Stage probability ${stage.probability}%`),
          );
          column.append(card);
        }
        return column;
      }),
    );
    const active = stages.filter((s) => !s.terminal);
    const next =
      active[active.findIndex((s) => s.id === instance.stage) + 1] ??
      stages.find((s) => s.terminal === "successful");
    const choices = current.terminal
      ? []
      : [next, stages.find((s) => s.terminal === "unsuccessful")];
    byId("target-stage").replaceChildren(
      ...choices.map((s) => {
        const option = node("option", s.name);
        option.value = s.id;
        return option;
      }),
    );
    const readonly = byId("role").value === "read_only";
    byId("move-settings").disabled =
      readonly ||
      Boolean(current.terminal) ||
      byId("preview-state").value !== "ready";
    byId("stage-settings").disabled = byId("role").value !== "administrator";
    byId("publish").disabled = byId("role").value !== "administrator";
  }
  function previewState() {
    const preview = byId("preview-state").value;
    byId("board").hidden = preview !== "ready";
    byId("movement-panel").hidden = preview !== "ready";
    byId("board-state").textContent = {
      ready: "",
      loading: "Loading your pipeline…",
      empty: "No sample opportunities. Add or enroll an opportunity to begin.",
      error:
        "Unable to load the sample pipeline. Retry to return to the ready preview.",
    }[preview];
    if (preview === "error") {
      const retry = node("button", "Retry", "button secondary");
      retry.type = "button";
      retry.onclick = () => {
        byId("preview-state").value = "ready";
        previewState();
      };
      byId("board-state").append(node("p", "No sample data changed."), retry);
    }
    renderBoard();
  }
  function startJourney() {
    state.instance = {
      version: clone(state.published),
      stage: "qualified",
      revision: 1,
      value: 2500000,
      outcome: null,
    };
    state.expected = 1;
    byId("sample-value").value = "25000";
    byId("sample-close").value = "";
    byId("sample-call").checked = false;
    byId("sample-reason").value = "";
    byId("preview-state").value = "ready";
    message("move-message", "");
    record(
      `Fictional sample starts in Qualified on v${state.instance.version.number}; this is not migrated business history.`,
    );
    previewState();
  }
  byId("stage-form").onsubmit = (event) => {
    event.preventDefault();
    if (byId("role").value !== "administrator") return;
    const stage = state.draft.find((s) => s.id === state.selected);
    const name = byId("stage-name").value.trim();
    if (!name) {
      message("design-message", "Enter a stage name.", true);
      return;
    }
    Object.assign(stage, {
      name,
      probability: Number(byId("stage-probability").value),
      hours: Number(byId("stage-hours").value),
      role: byId("stage-role").value,
      close: byId("requires-close").checked,
      call: byId("requires-call").checked,
    });
    renderStages();
    byId("draft-status").textContent = "Draft has unpublished changes";
    message(
      "design-message",
      "Draft saved in memory. The active journey still uses its original published rules.",
    );
  };
  byId("publish").onclick = () => {
    if (byId("role").value !== "administrator") return;
    const names = state.draft.map((s) => s.name.toLowerCase());
    if (new Set(names).size !== names.length) {
      message(
        "design-message",
        "Use unique stage names before publishing.",
        true,
      );
      return;
    }
    if (
      state.draft.some(
        (s) =>
          !Number.isInteger(s.probability) ||
          s.probability < 0 ||
          s.probability > 100 ||
          !Number.isInteger(s.hours) ||
          s.hours < 0 ||
          s.hours > 8760,
      )
    ) {
      message(
        "design-message",
        "Probability must be 0–100 and duration 0–8760 whole hours.",
        true,
      );
      return;
    }
    if (
      state.draft.find((s) => s.id === "won").probability !== 100 ||
      state.draft.find((s) => s.id === "lost").probability !== 0
    ) {
      message(
        "design-message",
        "This standard template requires Won at 100% and Lost at 0%.",
        true,
      );
      return;
    }
    state.published = {
      number: state.published.number + 1,
      stages: clone(state.draft),
    };
    byId("draft-status").textContent =
      `Draft based on v${state.published.number}`;
    message(
      "design-message",
      `Preview v${state.published.number} published in memory. Existing sample stays on v${state.instance.version.number}.`,
    );
    record(
      `Preview publication v${state.published.number}; active sample remains on v${state.instance.version.number}.`,
    );
    renderBoard();
  };
  byId("move-form").onsubmit = (event) => {
    event.preventDefault();
    const instance = state.instance;
    if (byId("role").value === "read_only" || instance.outcome) return;
    if (state.expected !== instance.revision) {
      message(
        "move-message",
        "This journey changed in another view. Refresh journey, review it, then try again. No movement was recorded.",
        true,
      );
      return;
    }
    const target = instance.version.stages.find(
      (s) => s.id === byId("target-stage").value,
    );
    const errors = [];
    if (target.close && !byId("sample-close").value)
      errors.push("Add an expected close date.");
    if (target.call && !byId("sample-call").checked)
      errors.push("Complete a call activity.");
    if (
      target.terminal === "unsuccessful" &&
      !byId("sample-reason").value.trim()
    )
      errors.push("Add an outcome reason.");
    if (errors.length) {
      message(
        "move-message",
        errors.join(" ") + " No movement was recorded.",
        true,
      );
      return;
    }
    const source = instance.version.stages.find((s) => s.id === instance.stage);
    instance.stage = target.id;
    instance.revision += 1;
    state.expected = instance.revision;
    instance.value = Math.round(Number(byId("sample-value").value) * 100);
    instance.outcome = target.terminal ?? null;
    record(
      `${new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" })} Asia/Manila · sample ${source.name} → ${target.name}, v${instance.version.number}, revision ${instance.revision}${instance.outcome ? `, ${instance.outcome}` : ""}.`,
    );
    message(
      "move-message",
      `Moved to ${target.name} in this preview.${instance.outcome ? " Journey is terminal; opportunity status remains open." : ""}`,
    );
    renderBoard();
  };
  byId("concurrent-update").onclick = () => {
    state.instance.revision += 1;
    message(
      "move-message",
      "Another sample view updated the journey. Your view is now stale; attempt movement to inspect the conflict.",
    );
    renderBoard();
  };
  byId("refresh-journey").onclick = () => {
    state.expected = state.instance.revision;
    message(
      "move-message",
      "Journey refreshed. Review the current state before moving.",
    );
    renderBoard();
  };
  byId("new-journey").onclick = startJourney;
  byId("preview-state").onchange = previewState;
  byId("role").onchange = () => {
    renderStages();
    renderBoard();
    message(
      "move-message",
      byId("role").value === "read_only"
        ? "Read-only preview: you can inspect the board but cannot move opportunities."
        : "",
    );
  };
  byId("reset").onclick = () => {
    state.draft = clone(original);
    state.selected = "proposal";
    state.published = { number: 1, stages: clone(original) };
    state.history = [];
    byId("role").value = "administrator";
    byId("draft-status").textContent = "Draft based on v1";
    message("design-message", "");
    renderStages();
    loadEditor();
    startJourney();
  };
  renderStages();
  loadEditor();
  startJourney();
})();
