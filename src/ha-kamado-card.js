const CARD_VERSION = "0.1.0";
const CARD_TAG = "ha-kamado-card";
const DEFAULT_COLOR = "#557a46";

const LABELS = {
  title: "Title",
  kamado_color: "Kamado color",
  pit_entity: "Pit temperature",
  pit_target_entity: "Pit target",
  fan_entity: "Fan output",
  fan_switch_entity: "Fan on/off",
  probe_1_entity: "Probe 1 temperature",
  probe_1_target_entity: "Probe 1 target",
  probe_1_name: "Probe 1 name",
  probe_2_entity: "Probe 2 temperature",
  probe_2_target_entity: "Probe 2 target",
  probe_2_name: "Probe 2 name",
  probe_3_entity: "Probe 3 temperature",
  probe_3_target_entity: "Probe 3 target",
  probe_3_name: "Probe 3 name",
  probe_4_entity: "Probe 4 temperature",
  probe_4_target_entity: "Probe 4 target",
  probe_4_name: "Probe 4 name",
};

const HELPERS = {
  kamado_color: "Any valid CSS color, for example #557a46, darkred or rgb(85 122 70).",
  pit_entity: "Temperature sensor used as the fixed pit reading in the kamado.",
  pit_target_entity: "Optional number or sensor entity that exposes the pit target.",
  fan_entity: "Optional percentage sensor for actual fan output.",
  fan_switch_entity: "Optional switch entity used to turn the fan control on or off.",
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const escapeAttr = escapeHtml;

const domainOf = (entityId) => (entityId || "").split(".", 1)[0];

class HaKamadoCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
  }

  static getStubConfig() {
    return {
      title: "Kamado",
      kamado_color: DEFAULT_COLOR,
    };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        { name: "kamado_color", selector: { text: {} } },
        { type: "grid", name: "", schema: [
          { name: "pit_entity", selector: { entity: {} } },
          { name: "pit_target_entity", selector: { entity: {} } },
        ] },
        { type: "grid", name: "", schema: [
          { name: "fan_entity", selector: { entity: {} } },
          { name: "fan_switch_entity", selector: { entity: {} } },
        ] },
        ...[1, 2, 3, 4].flatMap((slot) => [
          { name: `probe_${slot}_name`, selector: { text: {} } },
          { type: "grid", name: "", schema: [
            { name: `probe_${slot}_entity`, selector: { entity: {} } },
            { name: `probe_${slot}_target_entity`, selector: { entity: {} } },
          ] },
        ]),
      ],
      computeLabel: (schema) => LABELS[schema.name] || schema.name || "",
      computeHelper: (schema) => HELPERS[schema.name],
    };
  }

  setConfig(config) {
    if (!config || typeof config !== "object") {
      throw new Error("Invalid configuration");
    }

    this._config = {
      title: "Kamado",
      kamado_color: DEFAULT_COLOR,
      ...config,
    };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 7;
  }

  getGridOptions() {
    return {
      rows: 6,
      min_rows: 5,
      columns: 12,
      min_columns: 6,
    };
  }

  _state(entityId) {
    return entityId && this._hass ? this._hass.states?.[entityId] : undefined;
  }

  _isUnavailable(entityId) {
    const state = this._state(entityId);
    return !state || state.state === "unknown" || state.state === "unavailable";
  }

  _formatValue(entityId, fallback = "--") {
    const state = this._state(entityId);
    if (!state || this._isUnavailable(entityId)) return fallback;

    const numeric = Number(state.state);
    const unit = state.attributes?.unit_of_measurement || "";
    const value = Number.isFinite(numeric)
      ? numeric.toLocaleString(undefined, { maximumFractionDigits: 1 })
      : state.state;

    return `${value}${unit ? ` ${unit}` : ""}`;
  }

  _friendlyName(entityId, fallback) {
    return this._state(entityId)?.attributes?.friendly_name || fallback || entityId || "";
  }

  _numberMeta(entityId) {
    const state = this._state(entityId);
    if (!state || domainOf(entityId) !== "number") return null;

    const value = Number(state.state);
    if (!Number.isFinite(value)) return null;

    return {
      value,
      min: Number.isFinite(Number(state.attributes?.min)) ? Number(state.attributes.min) : -Infinity,
      max: Number.isFinite(Number(state.attributes?.max)) ? Number(state.attributes.max) : Infinity,
      step: Number.isFinite(Number(state.attributes?.step)) ? Number(state.attributes.step) : 1,
    };
  }

  _probeSlots() {
    return [1, 2, 3, 4]
      .map((slot) => ({
        slot,
        entity: this._config[`probe_${slot}_entity`],
        targetEntity: this._config[`probe_${slot}_target_entity`],
        name: this._config[`probe_${slot}_name`] || `Probe ${slot}`,
      }))
      .filter((probe) => probe.entity || probe.targetEntity || this._config[`probe_${probe.slot}_name`]);
  }

  _validatedColor() {
    const color = String(this._config.kamado_color || DEFAULT_COLOR).trim();
    if (globalThis.CSS?.supports?.("color", color)) return color;
    return DEFAULT_COLOR;
  }

  _renderTarget(entityId, label = "Target") {
    if (!entityId) {
      return `<div class="target target-empty"><span>${escapeHtml(label)}</span><strong>--</strong></div>`;
    }

    const numberMeta = this._numberMeta(entityId);
    const unavailable = this._isUnavailable(entityId);
    const classes = `target entity-link${unavailable ? " unavailable" : ""}`;

    if (!numberMeta) {
      return `
        <button class="${classes}" data-more-info="${escapeAttr(entityId)}" title="${escapeAttr(this._friendlyName(entityId, label))}">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(this._formatValue(entityId))}</strong>
        </button>`;
    }

    return `
      <div class="target number-target${unavailable ? " unavailable" : ""}">
        <button class="adjust" data-adjust="${escapeAttr(entityId)}" data-delta="-${numberMeta.step}" aria-label="Lower ${escapeAttr(label)}">−</button>
        <button class="target-value entity-link" data-more-info="${escapeAttr(entityId)}" title="${escapeAttr(this._friendlyName(entityId, label))}">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(this._formatValue(entityId))}</strong>
        </button>
        <button class="adjust" data-adjust="${escapeAttr(entityId)}" data-delta="${numberMeta.step}" aria-label="Raise ${escapeAttr(label)}">+</button>
      </div>`;
  }

  _renderProbe(probe) {
    const unavailable = probe.entity ? this._isUnavailable(probe.entity) : true;
    const current = probe.entity ? this._formatValue(probe.entity) : "--";
    const name = probe.name || this._friendlyName(probe.entity, `Probe ${probe.slot}`);

    return `
      <section class="probe-slot${unavailable ? " unavailable" : ""}">
        <button class="probe-reading entity-link" ${probe.entity ? `data-more-info="${escapeAttr(probe.entity)}"` : "disabled"}>
          <span class="probe-index">P${probe.slot}</span>
          <span class="probe-name">${escapeHtml(name)}</span>
          <strong>${escapeHtml(current)}</strong>
        </button>
        ${this._renderTarget(probe.targetEntity, "Target")}
      </section>`;
  }

  _render() {
    if (!this.shadowRoot || !this._config) return;

    const color = this._validatedColor();
    this.style.setProperty("--kamado-color", color);

    const title = this._config.title || "Kamado";
    const pitEntity = this._config.pit_entity;
    const pitTargetEntity = this._config.pit_target_entity;
    const fanEntity = this._config.fan_entity;
    const fanSwitchEntity = this._config.fan_switch_entity;
    const pitValue = pitEntity ? this._formatValue(pitEntity) : "--";
    const fanValue = fanEntity ? this._formatValue(fanEntity) : "--";
    const fanState = this._state(fanSwitchEntity);
    const fanOn = fanState?.state === "on";
    const fanAvailable = fanSwitchEntity ? !this._isUnavailable(fanSwitchEntity) : Boolean(fanEntity && !this._isUnavailable(fanEntity));
    const probes = this._probeSlots();

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          --kamado-color: ${DEFAULT_COLOR};
          --kamado-dark: color-mix(in srgb, var(--kamado-color) 72%, black);
          --kamado-light: color-mix(in srgb, var(--kamado-color) 70%, white);
          --muted: var(--secondary-text-color, #727272);
          --surface: color-mix(in srgb, var(--card-background-color, #fff) 94%, var(--primary-text-color, #111));
        }
        * { box-sizing: border-box; }
        ha-card {
          overflow: hidden;
          padding: 16px;
          background: var(--ha-card-background, var(--card-background-color, #fff));
        }
        .header {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 10px;
        }
        .title {
          margin: 0;
          font-size: 20px;
          font-weight: 600;
          color: var(--primary-text-color);
        }
        .version {
          font-size: 11px;
          color: var(--muted);
          opacity: .75;
        }
        .layout {
          display: grid;
          grid-template-columns: minmax(235px, .9fr) minmax(270px, 1.1fr);
          gap: 16px;
          align-items: stretch;
        }
        .kamado-panel {
          min-height: 330px;
          position: relative;
          display: grid;
          grid-template-rows: 1fr auto;
          border-radius: 18px;
          background: linear-gradient(145deg, color-mix(in srgb, var(--kamado-color) 7%, transparent), transparent 60%);
          border: 1px solid var(--divider-color, rgba(127,127,127,.2));
          padding: 10px;
        }
        .kamado-wrap {
          position: relative;
          width: min(100%, 320px);
          margin: 0 auto;
          aspect-ratio: 1 / 1;
        }
        svg { width: 100%; height: 100%; display: block; overflow: visible; }
        .ceramic { fill: var(--kamado-color); stroke: var(--kamado-dark); stroke-width: 5; }
        .ceramic-highlight { fill: none; stroke: var(--kamado-light); stroke-width: 4; opacity: .6; }
        .metal { fill: var(--secondary-text-color, #707070); }
        .metal-dark { fill: color-mix(in srgb, var(--secondary-text-color, #707070) 65%, black); }
        .stand { stroke: var(--secondary-text-color, #707070); stroke-width: 9; stroke-linecap: round; fill: none; }
        .wheel { fill: var(--secondary-text-color, #707070); }
        .pit-display {
          position: absolute;
          left: 50%;
          top: 34%;
          transform: translate(-50%, -50%);
          width: 132px;
          border-radius: 999px;
          border: 1px solid color-mix(in srgb, var(--primary-text-color) 15%, transparent);
          background: color-mix(in srgb, var(--card-background-color, #fff) 88%, transparent);
          backdrop-filter: blur(4px);
          text-align: center;
          padding: 10px 12px;
          box-shadow: 0 6px 24px rgba(0,0,0,.12);
        }
        .pit-display span, .fan-card span, .target span { display: block; color: var(--muted); font-size: 11px; }
        .pit-display strong { display: block; font-size: 28px; line-height: 1.05; color: var(--primary-text-color); }
        button { font: inherit; color: inherit; }
        .entity-link { cursor: pointer; }
        .pit-button {
          border: 0;
          width: 100%;
          background: none;
          padding: 0;
        }
        .fan-card {
          position: absolute;
          left: 22px;
          bottom: 28px;
          min-width: 88px;
          border: 1px solid var(--divider-color, rgba(127,127,127,.25));
          border-radius: 12px;
          background: color-mix(in srgb, var(--card-background-color, #fff) 92%, transparent);
          padding: 8px 10px;
          box-shadow: 0 4px 14px rgba(0,0,0,.1);
        }
        .fan-line { display: flex; align-items: center; gap: 7px; }
        .fan-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: var(--disabled-text-color, #9e9e9e);
          box-shadow: none;
        }
        .fan-dot.on {
          background: var(--success-color, #43a047);
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--success-color, #43a047) 18%, transparent);
        }
        .fan-card strong { font-size: 17px; }
        .fan-toggle {
          width: 100%;
          margin-top: 6px;
          border: 0;
          border-radius: 9px;
          min-height: 32px;
          background: var(--secondary-background-color, rgba(127,127,127,.12));
          cursor: pointer;
        }
        .fan-toggle.on { background: color-mix(in srgb, var(--success-color, #43a047) 18%, transparent); }
        .fan-toggle:disabled { cursor: default; opacity: .55; }
        .pit-target { margin-top: 2px; }
        .probes {
          display: grid;
          gap: 10px;
          align-content: start;
        }
        .probe-slot {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(135px, auto);
          align-items: stretch;
          gap: 8px;
          padding: 10px;
          border: 1px solid var(--divider-color, rgba(127,127,127,.22));
          border-radius: 14px;
          background: var(--surface);
        }
        .probe-slot.unavailable { opacity: .65; }
        .probe-reading {
          border: 0;
          background: transparent;
          min-width: 0;
          text-align: left;
          display: grid;
          grid-template-columns: auto 1fr auto;
          grid-template-rows: auto auto;
          column-gap: 9px;
          align-items: center;
          padding: 2px;
        }
        .probe-reading:disabled { cursor: default; }
        .probe-index {
          grid-row: 1 / span 2;
          display: inline-grid;
          place-items: center;
          width: 34px;
          height: 34px;
          border-radius: 50%;
          font-size: 12px;
          font-weight: 700;
          color: var(--text-primary-color, #fff);
          background: var(--kamado-color);
          border: 1px solid var(--kamado-dark);
        }
        .probe-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--muted);
          font-size: 12px;
        }
        .probe-reading strong { font-size: 21px; line-height: 1.05; }
        .target {
          border: 0;
          border-radius: 10px;
          min-width: 116px;
          background: var(--secondary-background-color, rgba(127,127,127,.1));
          padding: 7px 10px;
          text-align: center;
        }
        .target strong { font-size: 15px; }
        .number-target {
          display: grid;
          grid-template-columns: 30px 1fr 30px;
          gap: 3px;
          padding: 3px;
          min-width: 158px;
        }
        .target-value {
          border: 0;
          background: transparent;
          border-radius: 8px;
          padding: 2px 4px;
        }
        .adjust {
          border: 0;
          border-radius: 8px;
          background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
          cursor: pointer;
          font-size: 20px;
          line-height: 1;
        }
        .adjust:hover, .fan-toggle:hover, .entity-link:hover { filter: brightness(.96); }
        .unavailable { opacity: .52; }
        .empty {
          min-height: 150px;
          display: grid;
          place-items: center;
          text-align: center;
          color: var(--muted);
          border: 1px dashed var(--divider-color, rgba(127,127,127,.35));
          border-radius: 14px;
          padding: 20px;
        }
        @media (max-width: 640px) {
          .layout { grid-template-columns: 1fr; }
          .kamado-panel { min-height: 300px; }
          .kamado-wrap { max-width: 300px; }
          .probe-slot { grid-template-columns: 1fr; }
          .target, .number-target { width: 100%; }
        }
      </style>
      <ha-card>
        <header class="header">
          <h2 class="title">${escapeHtml(title)}</h2>
          <span class="version">v${CARD_VERSION}</span>
        </header>
        <div class="layout">
          <section class="kamado-panel">
            <div class="kamado-wrap">
              <svg viewBox="0 0 320 320" role="img" aria-label="Kamado grill">
                <path class="stand" d="M104 238 L77 292 M216 238 L243 292 M91 268 H229" />
                <circle class="wheel" cx="76" cy="296" r="10" />
                <circle class="wheel" cx="244" cy="296" r="10" />
                <rect class="metal-dark" x="145" y="17" width="30" height="19" rx="4" />
                <path class="metal" d="M140 12h40l-6 10h-28z" />
                <path class="ceramic" d="M70 131 C78 73 112 43 160 43 C208 43 242 73 250 131 Z" />
                <path class="ceramic-highlight" d="M96 112 C107 72 130 56 160 55" />
                <rect class="metal-dark" x="59" y="126" width="202" height="13" rx="5" />\n                <path d="M91 145 H229 M101 151 H219" stroke="color-mix(in srgb, var(--primary-text-color) 35%, transparent)" stroke-width="2" stroke-linecap="round" />
                <path class="ceramic" d="M73 140 H247 C243 205 214 249 160 249 C106 249 77 205 73 140 Z" />
                <path class="ceramic-highlight" d="M96 151 C100 200 118 226 145 237" />
                <rect class="metal-dark" x="131" y="225" width="58" height="28" rx="7" />
                <rect class="metal" x="139" y="232" width="42" height="8" rx="3" />
                <path class="metal-dark" d="M86 83 C61 84 47 94 43 105 H87 Z" />
                <rect class="metal" x="26" y="104" width="63" height="10" rx="5" />
                <rect class="metal-dark" x="247" y="121" width="18" height="46" rx="7" />
                <path class="metal" d="M264 133 Q286 139 286 158 Q286 177 264 183 L264 171 Q275 166 275 158 Q275 150 264 145 Z" />
              </svg>
              <div class="pit-display">
                <button class="pit-button entity-link" ${pitEntity ? `data-more-info="${escapeAttr(pitEntity)}"` : "disabled"}>
                  <span>Pit</span>
                  <strong>${escapeHtml(pitValue)}</strong>
                </button>
              </div>
              <div class="fan-card${fanAvailable ? "" : " unavailable"}">
                <div class="fan-line">
                  <span class="fan-dot${fanOn ? " on" : ""}"></span>
                  <div>
                    <span>Fan</span>
                    <strong>${escapeHtml(fanValue)}</strong>
                  </div>
                </div>
                <button class="fan-toggle${fanOn ? " on" : ""}" ${fanSwitchEntity && fanAvailable ? `data-fan-toggle="${escapeAttr(fanSwitchEntity)}"` : "disabled"}>
                  ${fanSwitchEntity ? (fanOn ? "On" : "Off") : "Monitor"}
                </button>
              </div>
            </div>
            <div class="pit-target">${this._renderTarget(pitTargetEntity, "Pit target")}</div>
          </section>
          <section class="probes">
            ${probes.length ? probes.map((probe) => this._renderProbe(probe)).join("") : `
              <div class="empty">
                <div><strong>No probes assigned</strong><br><span>Add up to four probe entities in the card editor.</span></div>
              </div>`}
          </section>
        </div>
      </ha-card>`;

    this._bindActions();
  }

  _bindActions() {
    this.shadowRoot.querySelectorAll("[data-more-info]").forEach((element) => {
      element.addEventListener("click", (event) => {
        const entityId = event.currentTarget.dataset.moreInfo;
        if (!entityId) return;
        this.dispatchEvent(new CustomEvent("hass-more-info", {
          bubbles: true,
          composed: true,
          detail: { entityId },
        }));
      });
    });

    this.shadowRoot.querySelectorAll("[data-adjust]").forEach((element) => {
      element.addEventListener("click", async (event) => {
        event.stopPropagation();
        const entityId = event.currentTarget.dataset.adjust;
        const delta = Number(event.currentTarget.dataset.delta || 0);
        await this._adjustNumber(entityId, delta);
      });
    });

    const fanToggle = this.shadowRoot.querySelector("[data-fan-toggle]");
    if (fanToggle) {
      fanToggle.addEventListener("click", async (event) => {
        const entityId = event.currentTarget.dataset.fanToggle;
        if (!entityId || !this._hass) return;
        await this._hass.callService("homeassistant", "toggle", { entity_id: entityId });
      });
    }
  }

  async _adjustNumber(entityId, delta) {
    if (!entityId || !this._hass || domainOf(entityId) !== "number") return;
    const meta = this._numberMeta(entityId);
    if (!meta) return;

    const nextValue = Math.min(meta.max, Math.max(meta.min, meta.value + delta));
    await this._hass.callService("number", "set_value", {
      entity_id: entityId,
      value: Number(nextValue.toFixed(3)),
    });
  }
}

if (!customElements.get(CARD_TAG)) {
  customElements.define(CARD_TAG, HaKamadoCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === CARD_TAG)) {
  window.customCards.push({
    type: CARD_TAG,
    name: "Kamado Card",
    preview: true,
    description: "Kamado BBQ card with fixed pit/fan layout and assignable probe slots.",
    documentationURL: "https://github.com/bjedelijn/ha-kamado-card",
  });
}

console.info(`%c KAMADO-CARD %c v${CARD_VERSION} `, "color:white;background:#557a46;font-weight:700", "color:#557a46;background:white");
