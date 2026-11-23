// Fixed catalogues (content, not logic). Prices are read ONLY from here, never from the UI.
// Names are proper names (same in every language); descriptions are localized.
import type { LocalizedText } from '../i18n';

/** Story order (the same as content/chapters PLAYABLE_CHAPTERS, tested). Saves keep only these ids. */
export const CHAPTER_IDS = ['ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7'] as const;
export type ChapterId = (typeof CHAPTER_IDS)[number];

/** A skill changes how the courier works; a tool is something carried. */
export type VendorItemKind = 'skill' | 'tool';

/** Something the market stall sells (F4). Owned items live in the profile (`ownedItemIds`). */
export interface VendorItem {
  id: string;
  kind: VendorItemKind;
  /** Proper name (same in every language). */
  name: string;
  price: number;
  /** First day of the courier's week (1..5) the stall has it; it stays in stock from then on. */
  availableFromDay: number;
  description: LocalizedText;
}

/** Haggling: every later purchase at the stall costs this share of the list price. */
export const HAGGLING_FACTOR = 0.85;

export const VENDOR_ITEMS: readonly VendorItem[] = [
  {
    id: 'bag',
    kind: 'tool',
    name: 'Courier Bag',
    price: 200,
    availableFromDay: 1,
    description: { en: 'Carry two board jobs at once.', tr: 'Panodan aynı anda iki iş taşı.' },
  },
  {
    id: 'haggling',
    kind: 'skill',
    name: 'Haggling',
    price: 150,
    availableFromDay: 2,
    description: { en: 'Everything else at the stall costs 15% less.', tr: 'Tezgâhtaki diğer her şey %15 ucuzlar.' },
  },
  {
    id: 'compass',
    kind: 'tool',
    name: 'Compass',
    price: 100,
    availableFromDay: 1,
    description: { en: 'Shows which way you are facing (N/E/S/W).', tr: 'Hangi yöne baktığını gösterir (K/D/G/B).' },
  },
  {
    id: 'steady_pace',
    kind: 'skill',
    name: 'Steady Pace',
    price: 100,
    availableFromDay: 1,
    description: { en: 'Run 10% faster. Walking is unchanged.', tr: 'Koşu hızın %10 artar. Yürüme değişmez.' },
  },
  {
    id: 'gps',
    kind: 'tool',
    name: 'GPS',
    price: 150,
    availableFromDay: 2,
    description: {
      en: 'Shows where you are on the minimap and the map (M).',
      tr: 'Mini haritada ve haritada (M) nerede olduğunu gösterir.',
    },
  },
];

export interface AchievementDefinition {
  id: string;
  name: string;
  description: LocalizedText;
}

export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  {
    id: 'first_delivery',
    name: 'First Delivery',
    description: { en: 'Complete First Impressions.', tr: 'First Impressions’ı tamamla.' },
  },
  {
    id: 'clean_shift',
    name: 'Clean Shift',
    description: { en: 'Finish a delivery without knocking on a wrong door.', tr: 'Yanlış kapı çalmadan bir teslimat bitir.' },
  },
  {
    id: 'meet_me_halfway',
    name: 'Meet Me Halfway',
    description: { en: 'Meet Finn at an agreed spot and hand over his order.', tr: 'Finn ile anlaşılan yerde buluş ve siparişini teslim et.' },
  },
  {
    id: 'special_delivery',
    name: 'Special Delivery',
    description: { en: 'Deliver the album to Arthur.', tr: 'Albümü Arthur’a teslim et.' },
  },
  {
    id: 'first_week',
    name: 'First Week',
    description: { en: 'Finish the courier’s first week.', tr: 'Kuryenin ilk haftasını bitir.' },
  },
];

/** The achievement a chapter's first delivery unlocks (ch2 can only be delivered after an agreed meeting). */
export const CHAPTER_ACHIEVEMENTS: Partial<Record<ChapterId, string>> = {
  ch1: 'first_delivery',
  ch2: 'meet_me_halfway',
  ch3: 'special_delivery', // shown after the final picture (GameApp order)
  ch7: 'first_week',
};

export const CHAPTER_REWARD_CREDITS = 100;
/** Steady Pace run-speed multiplier. */
export const STEADY_PACE_MULTIPLIER = 1.1;

export const findItem = (id: string): VendorItem | undefined => VENDOR_ITEMS.find((i) => i.id === id);
export const findAchievement = (id: string): AchievementDefinition | undefined => ACHIEVEMENTS.find((a) => a.id === id);
export const isChapterId = (id: string): id is ChapterId => (CHAPTER_IDS as readonly string[]).includes(id);
