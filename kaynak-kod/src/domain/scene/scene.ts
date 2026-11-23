// Model: a story scene — a short run of dialogue lines, each said by someone, optionally with a gesture
// and a fixed camera shot. Pure: content/scenes.ts has the lines, app/ScenePlayer shows them. Generic over
// the line type (LocalizedText lines with typed ids in the game, plain strings in tests).

export interface SceneLine<T> {
  /** Who says it (a speaker id, content/scenes.ts SPEAKERS); none = narration. */
  speaker?: string;
  text: T;
  /** A gesture the speaker makes while saying it (talk is automatic). */
  gesture?: string;
  /** A fixed camera shot for this line (content/scenes.ts SHOTS); none = the usual follow camera. */
  shot?: string;
}

export interface SceneDef<L> {
  id: string;
  lines: readonly L[];
}

/** Steps through a scene's lines; `next()` past the last one (or `skip()`) ends it. */
export class SceneCursor<L> {
  private index = 0;
  private ended: boolean;
  private readonly def: SceneDef<L>;

  constructor(def: SceneDef<L>) {
    this.def = def;
    this.ended = def.lines.length === 0;
  }

  /** The line on screen, or null once the scene is over. */
  get line(): L | null {
    return this.ended ? null : (this.def.lines[this.index] ?? null);
  }

  get isLast(): boolean {
    return !this.ended && this.index === this.def.lines.length - 1;
  }

  get done(): boolean {
    return this.ended;
  }

  /** On to the next line; false when the scene has ended. */
  next(): boolean {
    if (this.ended) return false;
    this.index++;
    if (this.index >= this.def.lines.length) this.ended = true;
    return !this.ended;
  }

  skip(): void {
    this.ended = true;
  }
}

/** Problems in a scene: no lines, unknown speakers, gestures or shots. Empty when fine. */
export function validateScene<T>(
  def: SceneDef<SceneLine<T>>,
  known: { speakers: readonly string[]; gestures: readonly string[]; shots: readonly string[] },
): string[] {
  const problems: string[] = [];
  if (def.lines.length === 0) problems.push(`${def.id}: no lines`);
  def.lines.forEach((l, i) => {
    if (l.speaker !== undefined && !known.speakers.includes(l.speaker)) problems.push(`${def.id}[${i}]: unknown speaker ${l.speaker}`);
    if (l.gesture !== undefined && !known.gestures.includes(l.gesture)) problems.push(`${def.id}[${i}]: unknown gesture ${l.gesture}`);
    if (l.gesture !== undefined && l.speaker === undefined) problems.push(`${def.id}[${i}]: a gesture needs a speaker`);
    if (l.shot !== undefined && !known.shots.includes(l.shot)) problems.push(`${def.id}[${i}]: unknown shot ${l.shot}`);
  });
  return problems;
}
