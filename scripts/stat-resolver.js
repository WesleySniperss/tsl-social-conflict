/**
 * tsl-social-conflict | stat-resolver.js
 *
 * Resolves TSL stats (Passion, Grace, Wit, Nerve, Spirit) from any actor.
 */

console.log("TSL | Loading stat-resolver.js...");

/**
 * tsl-social-conflict | stat-resolver.js (continued)
 *
 * Resolves TSL stats (Passion, Grace, Wit, Nerve, Spirit) from any actor.
 *
 * Priority:
 *   1. Known system handler (dnd5e, dnd5e 2024, a5e-for-dnd5e, pbta)
 *   2. Generic numeric discovery (up to 2 levels deep in actor.system)
 *   3. All-zero fallback
 *
 * Each resolved stat: { name, value, source, path }
 *   - name:   TSL stat label ("Passion" etc.)
 *   - value:  numeric modifier to add to 2d6
 *   - source: human-readable origin ("cha.mod (5e)")
 *   - path:   dotted system path for debugging
 */

class TSLStatResolver {

  // ─── TSL stat order ──────────────────────────────────────────────────────────

  static TSL_STATS = ["Passion", "Grace", "Wit", "Nerve", "Spirit"];

  // ─── Public API ──────────────────────────────────────────────────────────────

  /**
   * Resolve stats for an actor.
   * Returns exactly 5 entries, one per TSL stat.
   * @param {Actor} actor
   * @returns {{ name: string, value: number, source: string, path: string }[]}
   */
  static resolve(actor) {
    const id = game.system.id;

    try {
      if (id === "dnd5e")         return TSLStatResolver._dnd5e(actor);
      if (id === "a5e-for-dnd5e") return TSLStatResolver._a5e(actor);
      if (id === "pbta")          return TSLStatResolver._pbta(actor);
    } catch (err) {
      console.warn(`TSL | stat-resolver failed for system "${id}":`, err);
    }

    return TSLStatResolver._generic(actor);
  }

  // ─── dnd5e — v3 (5e) AND v4+ (5.5e 2024) ────────────────────────────────────
  //
  // Uses full skill totals (ability mod + proficiency + bonuses) so that
  // a trained Persuasion character rolls better than an untrained one.
  //
  // TSL → skill mapping:
  //   Passion → Persuasion  (CHA — emotional appeal, charm)
  //   Grace   → Performance (CHA — expression, elegance, stage presence)
  //   Wit     → Insight     (WIS — reading people, emotional intelligence)
  //   Nerve   → Intimidation(CHA — pressure, dominance, provocation)
  //   Spirit  → Survival    (WIS — resilience, stubbornness, endurance)
  //
  // Skill totals live at: actor.system.skills.<key>.total
  // Keys: per=Persuasion, prf=Performance, ins=Insight, itm=Intimidation, sur=Survival
  //
  // ⚠ D&D skill totals (+0..+11) sit on a d20 curve; TSL moves roll 2d6 where
  //   10+ is a Strong Hit. Raw totals would make Strong Hits automatic at
  //   mid levels (+8 → 97%) and kill the Weak Hit economy that feeds
  //   Conditions and Strings. We halve and clamp to the 2d6-native −1..+4:
  //   +11 master → +4 (~72% strong), +4 dabbler → +2, −1 oaf → −1.

  static _to2d6(total) {
    return Math.max(-1, Math.min(4, Math.round(total / 2)));
  }

  static _dnd5e(actor) {
    const skills = actor.system?.skills ?? {};
    const label  = parseInt((game.system.version ?? "0").split(".")[0]) >= 4 ? "5.5e" : "5e";

    const sk = (key, name) => {
      const total = skills[key]?.total ?? skills[key]?.mod ?? 0;
      return {
        name,
        value:  TSLStatResolver._to2d6(total),
        source: `${key} ${total >= 0 ? "+" : ""}${total} ÷2 (${label})`,
        path:   `skills.${key}.total`,
      };
    };

    return [
      sk("per", "Passion"),
      sk("prf", "Grace"),
      sk("ins", "Wit"),
      sk("itm", "Nerve"),
      sk("sur", "Spirit"),
    ];
  }

  // ─── A5E (Level Up: Advanced 5th Edition) ────────────────────────────────────
  //
  // A5E stores skills under actor.system.skills with full skill names as keys.
  // Each skill has: { value, proficient, expertise, ... }
  // Total = ability mod + (proficiency × multiplier).
  // We try full names first, then dnd5e short codes as fallback.

  static _a5e(actor) {
    const skills = actor.system?.skills ?? {};

    const sk = (longKey, shortKey, tslName) => {
      const entry = skills[longKey] ?? skills[shortKey];
      // A5E exposes .total on the skill object (computed by the system)
      const total = entry?.total ?? entry?.mod ?? entry?.value ?? 0;
      const key   = skills[longKey] ? longKey : shortKey;
      return {
        name: tslName,
        value: TSLStatResolver._to2d6(total),
        source: `${key} ${total >= 0 ? "+" : ""}${total} ÷2 (A5E)`,
        path: `skills.${key}`,
      };
    };

    return [
      sk("persuasion",  "per", "Passion"),
      sk("performance", "prf", "Grace"),
      sk("insight",     "ins", "Wit"),
      sk("intimidation","itm", "Nerve"),
      sk("survival",    "sur", "Spirit"),
    ];
  }

  // ─── PbtA (asacolips' Powered by the Apocalypse system) ──────────────────────
  //
  // Stat values live at: actor.system.stats.<key>.value  (-1 to +3)
  // Stat keys vary by game loaded via the TOML config.
  //
  // TSL → PbtA mapping (tries multiple key names per stat):
  //   Passion → hot, passion, heart, charm
  //   Grace   → cool, grace, style
  //   Wit     → sharp, wit, clever
  //   Nerve   → hard, nerve, daring, bold
  //   Spirit  → weird, spirit, strange

  static _pbta(actor) {
    const stats = actor.system?.stats ?? {};

    const pick = (...keys) => {
      for (const k of keys) {
        const v = stats[k]?.value;
        if (typeof v === "number") return { value: v, key: k };
      }
      return { value: 0, key: "—" };
    };

    const passion = pick("hot", "passion", "heart", "charm");
    const grace   = pick("cool", "grace", "style");
    const wit     = pick("sharp", "wit", "clever");
    const nerve   = pick("hard", "nerve", "daring", "bold");
    const spirit  = pick("weird", "spirit", "strange");

    return [
      { name: "Passion", value: passion.value, source: `${passion.key} (PbtA)`, path: `stats.${passion.key}.value` },
      { name: "Grace",   value: grace.value,   source: `${grace.key} (PbtA)`,   path: `stats.${grace.key}.value`   },
      { name: "Wit",     value: wit.value,     source: `${wit.key} (PbtA)`,     path: `stats.${wit.key}.value`     },
      { name: "Nerve",   value: nerve.value,   source: `${nerve.key} (PbtA)`,   path: `stats.${nerve.key}.value`   },
      { name: "Spirit",  value: spirit.value,  source: `${spirit.key} (PbtA)`,  path: `stats.${spirit.key}.value`  },
    ];
  }

  // ─── Generic fallback ─────────────────────────────────────────────────────────
  //
  // Walks actor.system up to 2 levels deep and collects numeric values
  // that look like modifiers (abs <= 10).
  // Assigns them in discovery order to TSL stats.
  // Logs what it found so developers can debug mappings.

  static _generic(actor) {
    const discovered = TSLStatResolver._discover(actor.system);

    console.log(
      `TSL | stat-resolver: no handler for system "${game.system.id}". ` +
      `Using generic discovery (${discovered.length} values found).`,
      discovered
    );

    return TSLStatResolver.TSL_STATS.map((name, i) => {
      const found = discovered[i];
      if (found) return { name, value: found.value, source: found.key, path: found.key };
      return { name, value: 0, source: "not found", path: "" };
    });
  }

  /**
   * Walk a system data object and collect modifier-like numbers.
   * Looks for:
   *   - Direct numeric leaf (abs <= 10)
   *   - Objects with .mod or .value that are in modifier range
   *
   * @param {object} obj
   * @param {string} prefix
   * @param {number} depth
   * @returns {{ key: string, value: number }[]}
   */
  static _discover(obj, prefix = "", depth = 0) {
    if (!obj || typeof obj !== "object" || depth > 2) return [];
    const results = [];

    for (const [key, val] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;

      if (typeof val === "number" && Number.isFinite(val) && Math.abs(val) <= 10) {
        results.push({ key: path, value: val });
      } else if (val && typeof val === "object") {
        // Prefer .mod over .value (mod = derived modifier, value = raw score)
        const sub = val.mod ?? val.value ?? null;
        if (typeof sub === "number" && Number.isFinite(sub) && Math.abs(sub) <= 10) {
          results.push({ key: path, value: sub });
        } else if (depth < 2) {
          results.push(...TSLStatResolver._discover(val, path, depth + 1));
        }
      }
    }

    // Cap at 10 to avoid noise from large data objects
    return results.slice(0, 10);
  }
}
