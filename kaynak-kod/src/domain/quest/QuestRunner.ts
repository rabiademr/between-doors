// Model: a data-driven quest as a small rule machine. Pure — no Babylon, no DOM, no strings.
//
// A quest is a list of steps; each step has rules "on <event> [if <flags>] do <effects>". When an event
// arrives, the current step's rules are tried first, then the quest-wide rules, then the shared default
// rules (e.g. "a locked gate says it is locked"); the FIRST matching rule wins. The runner applies its
// own effects (flags, step changes) and returns every effect in order, so the game can run the rest
// (toasts, dialogs, named scripts) — QuestRunner.handle(event) → Effect[].

/** Something the player did or the game reports: E on a spot, or a named story event. */
export type QuestEvent = { interact: string } | { event: string };

/** Effects the runner applies itself; the game ignores them (they are returned for logging/tests). */
export type CoreEffect = { setFlag: string } | { clearFlag: string } | { goto: string };

export interface Rule<E> {
  on: QuestEvent;
  /** All must hold: `flag` set, `!flag` not set. */
  if?: readonly string[];
  do: readonly (E | CoreEffect)[];
}

export interface StepDef<E> {
  id: string;
  rules: readonly Rule<E>[];
}

export interface QuestDef<E> {
  id: string;
  steps: readonly StepDef<E>[];
  /** Tried after the current step's rules, in every step. */
  rules?: readonly Rule<E>[];
  /** Run when the quest (re)starts, before the first step. */
  onStart?: readonly (E | CoreEffect)[];
}

export class QuestRunner<E> {
  readonly quest: QuestDef<E>;
  private readonly fallback: readonly Rule<E>[];
  private stepIndex = 0;
  private readonly flags = new Set<string>();

  constructor(quest: QuestDef<E>, fallback: readonly Rule<E>[] = []) {
    if (quest.steps.length === 0) throw new Error(`Quest ${quest.id} has no steps`);
    this.quest = quest;
    this.fallback = fallback;
  }

  get stepId(): string {
    return this.quest.steps[this.stepIndex]?.id ?? '';
  }

  hasFlag(flag: string): boolean {
    return this.flags.has(flag);
  }

  /** Effects to run when the quest starts. */
  start(): (E | CoreEffect)[] {
    return this.apply(this.quest.onStart ?? []);
  }

  handle(event: QuestEvent): (E | CoreEffect)[] {
    const step = this.quest.steps[this.stepIndex];
    const rule = [...(step?.rules ?? []), ...(this.quest.rules ?? []), ...this.fallback].find(
      (r) => matches(r.on, event) && (r.if ?? []).every((c) => this.check(c)),
    );
    return rule ? this.apply(rule.do) : [];
  }

  private check(condition: string): boolean {
    return condition.startsWith('!') ? !this.flags.has(condition.slice(1)) : this.flags.has(condition);
  }

  private apply(effects: readonly (E | CoreEffect)[]): (E | CoreEffect)[] {
    for (const e of effects) {
      if (isCore(e, 'setFlag')) this.flags.add(e.setFlag);
      else if (isCore(e, 'clearFlag')) this.flags.delete(e.clearFlag);
      else if (isCore(e, 'goto')) {
        const i = this.quest.steps.findIndex((s) => s.id === e.goto);
        if (i < 0) throw new Error(`Quest ${this.quest.id}: unknown step "${e.goto}"`);
        this.stepIndex = i;
      }
    }
    return [...effects];
  }
}

function matches(on: QuestEvent, ev: QuestEvent): boolean {
  if ('interact' in on) return 'interact' in ev && ev.interact === on.interact;
  return 'event' in ev && ev.event === on.event;
}

function isCore<K extends 'setFlag' | 'clearFlag' | 'goto'>(e: unknown, key: K): e is Extract<CoreEffect, Record<K, string>> {
  return typeof e === 'object' && e !== null && key in e;
}

/** Content check: every goto names a step, no step id is repeated. Returns problems (empty = fine). */
export function validateQuest<E>(quest: QuestDef<E>): string[] {
  const problems: string[] = [];
  const ids = quest.steps.map((s) => s.id);
  for (const id of new Set(ids)) if (ids.filter((x) => x === id).length > 1) problems.push(`${quest.id}: duplicate step "${id}"`);
  const rules = [...quest.steps.flatMap((s) => s.rules), ...(quest.rules ?? [])];
  const effects = [...rules.flatMap((r) => r.do), ...(quest.onStart ?? [])];
  for (const e of effects) {
    if (isCore(e, 'goto') && !ids.includes(e.goto)) problems.push(`${quest.id}: goto unknown step "${e.goto}"`);
  }
  // A condition on a flag nothing sets is almost always a typo ("!meeting_sett" would always be true).
  const setFlags = new Set(effects.flatMap((e) => (isCore(e, 'setFlag') ? [e.setFlag] : [])));
  for (const r of rules) {
    for (const c of r.if ?? []) {
      const flag = c.startsWith('!') ? c.slice(1) : c;
      if (!setFlags.has(flag)) problems.push(`${quest.id}: condition on flag "${flag}" that is never set`);
    }
  }
  return problems;
}
