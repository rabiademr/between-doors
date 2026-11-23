// Content: what E does anywhere in Bellwick when the chapter's own step has no rule for it — the fallback
// rules every chapter's QuestRunner is built with (GameApp.setupChapter). One list, so the tests replay the
// chapters against exactly what the game uses.
import type { GameRule } from './quests';
import { DEFAULT_RULES } from './quests';
import { JOB_RULES } from './jobs';
import { MAGPIE_RULES } from './magpies';
import { VEHICLE_RULES } from './vehicles';

export const WORLD_RULES: readonly GameRule[] = [...DEFAULT_RULES, ...JOB_RULES, ...MAGPIE_RULES, ...VEHICLE_RULES];
