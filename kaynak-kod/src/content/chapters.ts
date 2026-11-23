// Model data: chapter definitions (content, not logic). Proper names stay in English (design doc);
// player-facing text is localized here, next to the content it belongs to.
import type { LocalizedText } from '../i18n';
import type { ChapterId } from './catalog';
import type { ClueId } from './clues';
import type { Profile } from '../domain/Profile';
import { storyChapterId } from '../domain/story';

/**
 * 'door': find the right door. 'meeting': agree a spot with a moving NPC and hand over there.
 * 'photo': find a hidden entrance by comparing an old photo with the street, then deliver behind it.
 */
export type ChapterKind = 'door' | 'meeting' | 'photo';

export interface ChapterDefinition {
  id: ChapterId;
  title: string;
  kind: ChapterKind;
  /** Day of the courier's week (1..5) the chapter is played on (CEO, 2026-11-16: day 1 = ch1–3, then one a day). */
  day: number;
  /** NPC who hands over the parcel. */
  giverId: string;
  /** The single correct delivery target (door id or NPC id). */
  targetId: string;
  /** Who/what the parcel is for, shown when it is handed over. */
  pickupLine: LocalizedText;
  /** Delivery note / message shown on pickup and in the task panel (Tab). */
  note: LocalizedText;
  /** What the giver says if you come back before delivering. */
  giverBusy: LocalizedText;
  handoverTitle: LocalizedText;
  handoverBody: LocalizedText;
  /** Label of the hand-over button when it is a line of dialogue rather than “Deliver”. */
  handoverAnswer?: LocalizedText;
  /** Reference time R for the time bonus; tuned by playtesting, not a time limit. */
  referenceSeconds: number;
  /** Clues (content/clues.ts) that must all be inspected with the parcel in hand (ch3: before the key opens the entrance). */
  requiredClueIds?: readonly ClueId[];
  /** Extra line from the giver when handing over (e.g. the key). */
  giverExtra?: LocalizedText;
  /** Caption under the old photo (task panel + pickup). */
  photoCaption?: LocalizedText;
  /** Help 1 (−50): a plainer reading of the clue. */
  hintText: LocalizedText;
  /** Help 2 (−100): a small ring on the ground right in front of the answer (CEO decision: on the door). */
  hintArea: { x: number; z: number; radius: number };
}

export const CH1: ChapterDefinition = {
  id: 'ch1',
  title: 'First Impressions',
  kind: 'door',
  day: 1,
  giverId: 'npc_mara',
  targetId: 'door_june',
  pickupLine: { en: 'From Mara at Relay — parcel for June.', tr: 'Relay’den Mara — June için paket.' },
  note: {
    en: 'Blue door, directly opposite Ember Bakery. Look for the chilli plants.',
    tr: 'Mavi kapı, Ember Bakery’nin tam karşısında. Biber saksılarına bak.',
  },
  giverBusy: { en: 'Mara: “Go on — June is waiting!”', tr: 'Mara: “Hadi bakalım — June bekliyor!”' },
  handoverTitle: { en: 'June’s door', tr: 'June’un kapısı' },
  handoverBody: {
    en: 'The name on the bell says “June”. This is the right door.',
    tr: 'Zilin üstünde “June” yazıyor. Doğru kapı burası.',
  },
  referenceSeconds: 60,
  hintText: {
    en: 'Ember Bakery is the orange shop on the left side of the street. June’s door faces it from the right side.',
    tr: 'Ember Bakery sokağın sol tarafındaki turuncu dükkân. June’un kapısı sağ tarafta, tam karşısında.',
  },
  hintArea: { x: 4.1, z: 6, radius: 1.3 }, // in front of June's door
};

export const CH2: ChapterDefinition = {
  id: 'ch2',
  title: 'Crossing Paths',
  kind: 'meeting',
  day: 1,
  giverId: 'npc_mara',
  targetId: 'npc_finn',
  pickupLine: {
    en: 'From Mara at Relay — table decorations for Finn. He’s already on the move.',
    tr: 'Relay’den Mara — Finn için masa süsleri. Kendisi çoktan yola çıkmış.',
  },
  note: {
    en: 'Walking towards Dial Square. Red jacket, green bag. Where should we meet?',
    tr: 'Dial Square’e doğru yürüyorum. Kırmızı mont, yeşil çanta. Nerede buluşalım?',
  },
  giverBusy: { en: 'Mara: “Off you go — Finn’s expecting you.”', tr: 'Mara: “Hadi — Finn seni bekliyor.”' },
  handoverTitle: { en: 'Finn', tr: 'Finn' },
  handoverBody: {
    en: 'A card is tucked into the parcel: “Forty years. Thousands of doors.” Finn: “Arthur brought half this neighbourhood its good news. Our turn.”',
    tr: 'Paketin arasında bir kart var: “Kırk yıl. Binlerce kapı.” Finn: “Arthur bu mahallenin yarısına iyi haberlerini getirdi. Sıra bizde.”',
  },
  referenceSeconds: 75,
  hintText: {
    en: 'Both spots work. The yard is closer: the gate under the “Crossing Yard” sign on the right side of the street opens once you agree to meet there.',
    tr: 'İki yer de olur. Avlu daha yakın: sokağın sağındaki “Crossing Yard” tabelasının altındaki kapı, orada buluşmaya karar verince açılır.',
  },
  // Overridden at runtime by the agreed meeting point once one is chosen.
  hintArea: { x: 4.4, z: 1.5, radius: 1.3 }, // in front of the yard gate
};

export const CH3: ChapterDefinition = {
  id: 'ch3',
  title: 'Between Doors',
  kind: 'photo',
  day: 1,
  giverId: 'npc_mara',
  targetId: 'door_arthur',
  requiredClueIds: ['old_post_sign'],
  pickupLine: {
    en: 'Mara: “It’s Arthur’s anniversary — forty years since his first round. The whole street made him an album. Last parcel of the day.”',
    tr: 'Mara: “Bugün Arthur’un yıl dönümü — ilk turunun üzerinden kırk yıl geçti. Bütün sokak ona bir albüm hazırladı. Günün son paketi.”',
  },
  note: {
    en: 'Arthur Reed, Postmark Mews, last house. (Phone: Address not found.)',
    tr: 'Arthur Reed, Postmark Mews, son ev. (Telefon: Adres bulunamadı.)',
  },
  giverExtra: {
    en: 'Mara hands you a heavy key: “Old brass gate. This opens it. Finding it is your part.”',
    tr: 'Mara eline ağır bir anahtar verir: “Eski pirinç kapı. Bu açar. Bulmak senin işin.”',
  },
  photoCaption: {
    en: 'Sylvie’s old photo of the Postmark Mews entrance: a faded post sign, a broken wall, a leaning tree.',
    tr: 'Sylvie’nin Postmark Mews girişinin eski fotoğrafı: solmuş posta tabelası, kırık duvar, eğik ağaç.',
  },
  giverBusy: {
    en: 'Mara: “Compare the photo with the street. The gate is still there, I promise.”',
    tr: 'Mara: “Fotoğrafı sokakla karşılaştır. Kapı hâlâ orada, söz.”',
  },
  handoverTitle: { en: 'Arthur Reed', tr: 'Arthur Reed' },
  handoverBody: {
    en: 'The door opens. Arthur looks at the album, then past you at the lane. “Who told you the way?”',
    tr: 'Kapı açılır. Arthur albüme, sonra senin arkandaki sokağa bakar. “Yolu sana kim tarif etti?”',
  },
  handoverAnswer: { en: '“The neighbourhood did.”', tr: '“Mahalle tarif etti.”' },
  referenceSeconds: 90,
  hintText: {
    en: 'The photo was taken in Dial Square, looking west. Find the old post sign on a wall there.',
    tr: 'Fotoğraf Dial Square’de, batıya bakarak çekilmiş. Oradaki bir duvarda eski posta tabelasını bul.',
  },
  hintArea: { x: -18.9, z: 31.5, radius: 1.4 }, // in front of the brass gate
};

/** Day 2: a rival courier in town. (A1 skeleton: Mara → the market stall; the Magpie ambush comes with A5.) */
export const CH4: ChapterDefinition = {
  id: 'ch4',
  title: 'Swift Parcel',
  kind: 'door',
  day: 2,
  giverId: 'npc_mara',
  targetId: 'npc_vendor',
  pickupLine: {
    en: 'Mara: “Spices for the market stall. And keep your eyes open — parcels have been going missing.”',
    tr: 'Mara: “Pazar tezgâhına baharat. Gözünü dört aç — paketler kayboluyor.”',
  },
  note: {
    en: 'The stall at the top of Market Hill. Straight there, no detours.',
    tr: 'Market Hill’in tepesindeki tezgâh. Doğruca oraya, oyalanmak yok.',
  },
  giverBusy: { en: 'Mara: “The stall’s waiting — up Market Hill.”', tr: 'Mara: “Tezgâh bekliyor — Market Hill’e çık.”' },
  handoverTitle: { en: 'The market stall', tr: 'Pazar tezgâhı' },
  handoverBody: {
    en: '“From Relay? It actually got here!” The stallholder lowers her voice. “Half my orders went missing this week.”',
    tr: '“Relay’den mi? Gerçekten gelmiş!” Tezgâhtar sesini alçaltır. “Bu hafta siparişlerimin yarısı kayboldu.”',
  },
  referenceSeconds: 120,
  hintText: {
    en: 'Market Hill is north of Dial Square. The stall is in the middle of the market.',
    tr: 'Market Hill, Dial Square’in kuzeyinde. Tezgâh pazarın ortasında.',
  },
  hintArea: { x: 6.2, z: 75.5, radius: 1.4 }, // in front of the stall
};

/** Day 3: Arthur's last undelivered letter, to a house that lost its name forty years ago. */
export const CH5: ChapterDefinition = {
  id: 'ch5',
  title: 'Arthur’s Round',
  kind: 'door',
  day: 3,
  giverId: 'npc_mara',
  targetId: 'door_lockkeeper',
  pickupLine: {
    en: 'Mara: “Arthur asked for you by name. He’s on Lock Street in Canal Side — something he won’t trust to anyone else.”',
    tr: 'Mara: “Arthur seni adınla sordu. Canal Side’da, Lock Street’te — başkasına emanet etmeyeceği bir şey var.”',
  },
  note: {
    en: 'Meet Arthur on Lock Street, Canal Side. Then: “The Lockkeeper’s House” — no number.',
    tr: 'Arthur’la Canal Side’da, Lock Street’te buluş. Sonra: “The Lockkeeper’s House” — numara yok.',
  },
  giverBusy: { en: 'Mara: “Arthur’s waiting on Lock Street.”', tr: 'Mara: “Arthur, Lock Street’te bekliyor.”' },
  handoverTitle: { en: 'The Lockkeeper’s House', tr: 'The Lockkeeper’s House' },
  handoverBody: {
    en: 'An old woman opens the blue door and turns the envelope over twice. “Arthur’s handwriting on the back. Forty years!”',
    tr: 'Yaşlı bir kadın mavi kapıyı açar, zarfı iki kez çevirir. “Arkasında Arthur’un el yazısı. Kırk yıl!”',
  },
  referenceSeconds: 150,
  requiredClueIds: ['old_nameplate'],
  hintText: {
    en: 'Look for an old plate on the end wall of the north row, facing the canal. It says which door was the keeper’s.',
    tr: 'Kuzey sıranın kanala bakan uç duvarında eski bir plaka ara. Hangi kapının bekçinin olduğunu yazar.',
  },
  hintArea: { x: 76.5, z: 7.7, radius: 1.3 }, // in front of the Lockkeeper's door
};

/** Day 4: Finn's plan — let a Magpie take a decoy, follow him home, bring June the proof. */
export const CH6: ChapterDefinition = {
  id: 'ch6',
  title: 'Stakeout',
  kind: 'door',
  day: 4,
  giverId: 'npc_mara',
  targetId: 'actor_june',
  pickupLine: {
    en: 'Mara: “A box of nothing, wrapped like the real thing. Finn’s idea. He’s waiting at the top of Yard Road.”',
    tr: 'Mara: “İçi boş, gerçeği gibi sarılmış bir kutu. Finn’in fikri. Yard Road’un başında bekliyor.”',
  },
  note: {
    en: 'Finn, top of Yard Road. Carry the decoy, let them take it, follow. Bring proof to June.',
    tr: 'Finn, Yard Road’un başı. Sahte paketi taşı, kapmalarına izin ver, takip et. Kanıtı June’a götür.',
  },
  giverBusy: { en: 'Mara: “Finn’s at the top of Yard Road. Be careful.”', tr: 'Mara: “Finn, Yard Road’un başında. Dikkatli ol.”' },
  handoverTitle: { en: 'June', tr: 'June' },
  handoverBody: {
    en: 'June turns the peeled sticker to the light and lifts her camera. “Stay still, Relay. This one’s going in the paper.”',
    tr: 'June sökülmüş etiketi ışığa tutar ve fotoğraf makinesini kaldırır. “Kıpırdama, Relay. Bu gazeteye girecek.”',
  },
  handoverAnswer: { en: 'Hand over the proof', tr: 'Kanıtı ver' },
  referenceSeconds: 200,
  requiredClueIds: ['den_returns_sign', 'den_labels'],
  hintText: {
    en: 'Follow the Magpie down Yard Road into the fenced den. Look at the orange board on the fence and the parcels by the crate.',
    tr: 'Magpie’yi Yard Road boyunca çitli ine kadar takip et. Çitteki turuncu panoya ve sandığın yanındaki paketlere bak.',
  },
  hintArea: { x: 3.3, z: 6, radius: 1.3 }, // June, outside her door
};

/** Day 5: the market gathering — the photographs, Mr Crane, Arthur's tune. */
export const CH7: ChapterDefinition = {
  id: 'ch7',
  title: 'The Neighbourhood Did',
  kind: 'door',
  day: 5,
  giverId: 'npc_mara',
  targetId: 'actor_arthur',
  pickupLine: {
    en: 'Mara: “June’s photographs. Every one came out. Take them to Arthur at the Market Cross — the whole street’s there.”',
    tr: 'Mara: “June’un fotoğrafları. Hepsi çıkmış. Market Cross’taki Arthur’a götür — bütün sokak orada.”',
  },
  note: {
    en: 'Arthur, Market Cross, noon. Mr Crane will be there too.',
    tr: 'Arthur, Market Cross, öğlen. Mr Crane de orada olacak.',
  },
  giverBusy: { en: 'Mara: “Go on — they won’t start without you.”', tr: 'Mara: “Hadi — sensiz başlamazlar.”' },
  handoverTitle: { en: 'Arthur', tr: 'Arthur' },
  handoverBody: {
    en: 'Arthur takes the envelope, looks at the first photograph, and smiles the way he did on your first day.',
    tr: 'Arthur zarfı alır, ilk fotoğrafa bakar ve ilk gününde gülümsediği gibi gülümser.',
  },
  handoverAnswer: { en: '“For the man who knew every door.”', tr: '“Her kapıyı bilen adama.”' },
  referenceSeconds: 120,
  hintText: {
    en: 'Market Hill is north of Dial Square, up Market Street. The cross stands in the middle of the market.',
    tr: 'Market Hill, Dial Square’in kuzeyinde, Market Street’in yukarısında. Haç pazarın ortasında.',
  },
  hintArea: { x: 0, z: 76, radius: 1.4 }, // in front of Arthur at the cross
};

/** Chapter 5–7 lines for quest `say` effects. */
export const STORY_LINES = {
  arthurHasLetter: { en: 'Arthur has the letter — talk to him first.', tr: 'Mektup Arthur’da — önce onunla konuş.' },
  arthurHint: {
    en: 'Arthur: “There was a plate by the canal, on the end of the row. Lock House, it said.”',
    tr: 'Arthur: “Kanal tarafında, sıranın ucunda bir plaka vardı. Lock House yazardı.”',
  },
  whichDoor: {
    en: 'A blue door… but which house was the Lockkeeper’s? Arthur mentioned a plate by the canal.',
    tr: 'Mavi bir kapı… ama hangisi Lockkeeper’ın eviydi? Arthur kanal tarafında bir plakadan söz etmişti.',
  },
  finnFirst: { en: 'Finn has a plan — find him at the top of Yard Road first.', tr: 'Finn’in bir planı var — önce onu Yard Road’un başında bul.' },
  decoyGo: {
    en: 'Walk down Yard Road with the decoy. When a Magpie takes it, don’t grab — follow him home.',
    tr: 'Sahte paketle Yard Road’dan aşağı yürü. Bir Magpie kaparsa yakalama — evine kadar takip et.',
  },
  decoyTaken: { en: 'He took the bait! Follow him — don’t let him out of sight.', tr: 'Yemi yuttu! Takip et — gözünden kaçırma.' },
  decoyLost: {
    en: 'You lost him. Finn: “He’ll be back at his corner. Try again — keep closer.”',
    tr: 'Kaybettin. Finn: “Köşesine döner. Bir daha dene — daha yakından.”',
  },
  inDen: {
    en: 'The Magpies’ den. Look around quietly — the board on the fence, the parcels by the crate.',
    tr: 'Magpies’in ini. Sessizce etrafa bak — çitteki pano, sandığın yanındaki paketler.',
  },
  needProof: { en: 'June: “Proof first. What did you find in the den?”', tr: 'June: “Önce kanıt. İnde ne buldun?”' },
  proofEnough: {
    en: 'That’s enough proof. Take it to June in Indigo Row — she’ll photograph it.',
    tr: 'Bu kadar kanıt yeter. Indigo Row’daki June’a götür — fotoğrafını çeker.',
  },
  craneIdle: { en: 'Mr Crane: “Nothing to see here.”', tr: 'Mr Crane: “Burada görülecek bir şey yok.”' },
} as const;

/** Chapter 4's lines around the Magpie (quest `say` effects). */
export const CH4_LINES = {
  snatched: {
    en: 'A Magpie snatched Mara’s spices! After him — grab them back (E) before he reaches the Railway Yard.',
    tr: 'Bir Magpie Mara’nın baharatlarını kaptı! Peşinden — Railway Yard’a varmadan geri al (E).',
  },
  recovered: { en: 'Got them back! Up to the stall with them.', tr: 'Geri aldın! Hadi tezgâha.' },
  atDen: {
    en: 'He got away into the Magpies’ den in the Railway Yard. The spices will be in the crate there.',
    tr: 'Railway Yard’daki Magpies inine kaçtı. Baharatlar oradaki sandıkta olmalı.',
  },
  stallWaits: {
    en: 'Stallholder: “Spices? You’re empty-handed, love.”',
    tr: 'Tezgâhtar: “Baharat mı? Elin boş ama canım.”',
  },
  maraStolen: {
    en: 'Mara: “Stolen? Then get them back. The Magpies keep what they take in a crate in the Railway Yard.”',
    tr: 'Mara: “Çalındı mı? O zaman geri al. Magpies kaptıklarını Railway Yard’da bir sandıkta tutar.”',
  },
} as const;

/**
 * After chapter 1's handover, before the result: Arthur passes June's door on his old round and walks
 * off towards Dial Square (where Postmark Mews hides) — sets up chapter 3 and the finale's melody.
 */
export const ARTHUR_CAMEO = {
  title: { en: 'An old postman', tr: 'Yaşlı bir postacı' },
  body: {
    en: 'An old man with a worn postbag stops beside you. “Blue door, opposite the bakery — June’s. Took me a whole week to learn that one.” He tips his cap. “Arthur. Forty years on this round. Welcome to Bellwick.” He walks off towards Dial Square, humming.',
    tr: 'Eskimiş bir posta çantası taşıyan yaşlı bir adam yanında durur. “Mavi kapı, fırının karşısı — June’unki. Onu öğrenmem koca bir hafta sürmüştü.” Şapkasına dokunur. “Ben Arthur. Kırk yıldır bu turu atarım. Bellwick’e hoş geldin.” Mırıldanarak Dial Square’e doğru yürüyüp gider.',
  },
  /** Where he walks after the chat: up the street into Dial Square, towards its west wall. */
  exitRoute: [
    { x: 2.5, z: 14 },
    { x: -2, z: 22 },
    { x: -11, z: 28 },
  ],
} as const;

/** Finale text (design doc: album → table picture → map note → result). */
export const FINALE = {
  albumTitle: { en: 'The Album', tr: 'Albüm' },
  album: {
    en: 'June’s photographs. Finn’s little paper decorations. A note in Sylvie’s handwriting: “For the man who knew every door.” Somewhere outside, a familiar melody starts.',
    tr: 'June’un fotoğrafları. Finn’in küçük kâğıt süsleri. Sylvie’nin el yazısıyla bir not: “Her kapıyı bilen adama.” Dışarıda bir yerde tanıdık bir melodi başlar.',
  },
  pictureTitle: { en: 'Postmark Mews', tr: 'Postmark Mews' },
  picture: {
    en: 'Arthur: “Really your first day? You’ve learnt the way. You’ll learn the people too.”',
    tr: 'Arthur: “Gerçekten ilk günün mü? Yolu öğrenmişsin. İnsanları da zamanla öğrenirsin.”',
  },
  mapNote: { en: 'Postmark Mews added to your map.', tr: 'Postmark Mews haritana eklendi.' },
  endTitle: { en: 'Thanks for playing', tr: 'Oynadığın için teşekkürler' },
  endBody: {
    en: 'One week, one neighbourhood. Replay any chapter to improve your records.',
    tr: 'Bir hafta, tek mahalle. Rekorlarını geliştirmek için istediğin bölümü yeniden oyna.',
  },
} as const;

/** Chapters that exist in this build, in story order (days never go back; same ids as CHAPTER_IDS — tested). */
export const PLAYABLE_CHAPTERS: readonly ChapterDefinition[] = [CH1, CH2, CH3, CH4, CH5, CH6, CH7];

export function chapterById(id: string): ChapterDefinition | undefined {
  return PLAYABLE_CHAPTERS.find((c) => c.id === id);
}

/**
 * Where "Continue" starts: the story's next chapter (domain/story), or — the whole story done — the last
 * one, so the town is there to wander in.
 */
export function storyChapter(profile: Pick<Profile, 'completedChapterIds' | 'storyDay'>): ChapterDefinition {
  const id = storyChapterId(profile, PLAYABLE_CHAPTERS);
  return (id ? chapterById(id) : undefined) ?? PLAYABLE_CHAPTERS[PLAYABLE_CHAPTERS.length - 1] ?? CH1;
}
