/**
 * tsl-social-conflict | i18n.js
 *
 * The module speaks English or Ukrainian — a per-user setting ("Language";
 * "auto" follows Foundry's own language). English text is the key:
 *   _t("Pick on the map")              → "Обрати на карті"
 *   _t("{who} says no.", { who })      → "{who} каже «ні»."
 * The dictionary is TSL_UK (i18n-uk.js); anything missing stays English.
 * Data texts (natures, techniques, emotions, bonds…) are translated in place
 * by TSLi18n.apply(), so the rest of the code reads them as usual; the
 * reactions pool goes through _t when picked. The Codex is _t per paragraph.
 */

console.log("TSL | Loading i18n.js...");

const TSL_I18N = { lang: "en", missing: null };   // missing: a Set to collect untranslated keys (tests)

/** Translate a line of English (the key) and fill its {placeholders}. */
function _t(text, data) {
  if (text === null || text === undefined) return "";
  let s = String(text);
  if (TSL_I18N.lang === "uk" && typeof TSL_UK !== "undefined") {
    const u = TSL_UK[s];
    if (typeof u === "string") s = u;
    else if (TSL_I18N.missing && s.trim()) TSL_I18N.missing.add(s);
  }
  if (data) s = s.replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(data, k) ? String(data[k]) : m));
  return s;
}

class TSLi18n {
  static get lang() { return TSL_I18N.lang; }

  /** The language in force for a setting value: "auto" follows Foundry. */
  static resolve(pick = "auto") {
    if (pick === "en" || pick === "uk") return pick;
    const core = String(globalThis.game?.i18n?.lang ?? "en").toLowerCase();
    return core.startsWith("uk") ? "uk" : "en";
  }

  /** Switch the language and re-translate the data texts. */
  static setLanguage(pick = "auto") {
    TSL_I18N.lang = TSLi18n.resolve(pick);
    TSLi18n.apply();
    return TSL_I18N.lang;
  }

  /** Every data text, translated in place; the English original is kept aside. */
  static apply() {
    const tr = (obj, fields) => {
      if (!obj || typeof obj !== "object") return;
      if (!obj.__en) Object.defineProperty(obj, "__en", { value: {}, enumerable: false, writable: true });
      for (const f of fields) {
        if (!(f in obj.__en)) {
          if (typeof obj[f] !== "string") continue;
          obj.__en[f] = obj[f];
        }
        obj[f] = _t(obj.__en[f]);
      }
    };
    const trMap = (map) => tr(map, [...new Set([...Object.keys(map).filter(k => typeof map[k] === "string"), ...Object.keys(map.__en ?? {})])]);
    const vals = (o) => (o ? Object.values(o) : []);

    if (typeof APPROACHES !== "undefined") vals(APPROACHES).forEach(a => tr(a, ["label", "gist", "short", "examples", "cost"]));
    if (typeof SOCIAL_TRIADS !== "undefined") vals(SOCIAL_TRIADS).forEach(t => tr(t, ["label", "horney", "hint"]));
    if (typeof SOCIAL_ARCHETYPES !== "undefined") for (const a of SOCIAL_ARCHETYPES) {
      tr(a, ["label", "keyText", "wallText", "press", "pressedWhy", "audienceWhy", "description", "psych", "craves", "dreads"]);
      tr(a.price, ["text"]);
    }
    if (typeof TECHNIQUES !== "undefined") vals(TECHNIQUES).forEach(t => tr(t, ["label", "line", "win", "miss", "rule"]));
    if (typeof TECH_JOBS !== "undefined") vals(TECH_JOBS).forEach(j => tr(j, ["label", "hint"]));
    if (typeof ASK_SIZES !== "undefined") vals(ASK_SIZES).forEach(s => tr(s, ["label", "short", "hint"]));
    if (typeof READ_QUESTIONS !== "undefined") vals(READ_QUESTIONS).forEach(q => tr(q, ["label", "short"]));
    if (typeof TALK_GRADES !== "undefined") vals(TALK_GRADES).forEach(g => tr(g, ["label"]));
    if (typeof JOB_GRADES !== "undefined") vals(JOB_GRADES).forEach(trMap);
    if (typeof SKILL_LABELS !== "undefined") trMap(SKILL_LABELS);
    if (typeof EMOTIONS !== "undefined") vals(EMOTIONS).forEach(e => tr(e, ["label", "spoilsText", "opensText", "clear"]));
    if (typeof SCARS !== "undefined") vals(SCARS).forEach(s => tr(s, ["label", "text"]));
    if (typeof PROFILE_POINTS !== "undefined") PROFILE_POINTS.forEach(p => tr(p, ["label", "hint", "placeholder"]));
    if (typeof BOND_TYPES !== "undefined") BOND_TYPES.forEach(b => tr(b, ["label", "hint"]));
  }

  /** Re-render whatever is open, so a change of language shows at once. */
  static rerender() {
    try { for (const app of SocialFencingDialog?._instances?.values?.() ?? []) app.render(false); } catch { /* not loaded */ }
    try { for (const app of Object.values(TSLSceneVisualizer?._instances ?? {})) if (app?.rendered) app.render(false); } catch { /* not loaded */ }
  }
}
