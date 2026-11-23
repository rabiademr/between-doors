// Content: story scenes (domain/scene) — who says what, with which gesture and camera shot. Played by
// app/ScenePlayer: from a quest (`{ call: 'scene.play', id }`) or at the start of a day (MORNING_SCENES).
import type { SceneDef } from '../domain/scene/scene';
import type { LocalizedText } from '../i18n';
import type { CameraShot } from '../player/CameraRig';
import { STORY_ACTORS, type ActorId } from './actors';
import type { TuneId } from './melody';

export interface SpeakerDef {
  /** Shown as the dialogue's title (proper names are the same in every language). */
  name: LocalizedText;
  /** The standing NPC who talks (map `npc` layer id), if any. */
  npc?: string;
  /** Or the story actor who talks (content/actors.ts). */
  actor?: ActorId;
}

const speakers = {
  mara: { name: { en: 'Mara', tr: 'Mara' }, npc: 'npc_mara' },
  stallholder: { name: { en: 'Stallholder', tr: 'Tezgâhtar' }, npc: 'npc_vendor' },
  arthur: { name: STORY_ACTORS.arthur.name, actor: 'arthur' },
  finn: { name: STORY_ACTORS.finn.name, actor: 'finn' },
  june: { name: STORY_ACTORS.june.name, actor: 'june' },
  crane: { name: STORY_ACTORS.swift_manager.name, actor: 'swift_manager' },
} satisfies Record<string, SpeakerDef>;
export type SpeakerId = keyof typeof speakers;
export const SPEAKERS: Record<SpeakerId, SpeakerDef> = speakers;

/** Fixed camera shots (world metres; the map's [x, z] with a height). */
const shots = {
  // Outside Relay from the street, three-quarters on: Mara at her door (faces east) and the courier facing her.
  relay_mara: { from: { x: -0.4, y: 1.95, z: -9.4 }, to: { x: -3.6, y: 1.3, z: -13 } },
  // The market stall from the east, across the counter: the stallholder behind it, the courier in front.
  stall: { from: { x: 11.2, y: 2.3, z: 75.2 }, to: { x: 6.0, y: 1.3, z: 72.9 } },
  // Lock Street from the road: Arthur on the pavement, the courier beside him.
  lock_street: { from: { x: 53.6, y: 2.0, z: 5.8 }, to: { x: 53.7, y: 1.3, z: 1.3 } },
  // The Lockkeeper's blue door, from across the street.
  lockhouse: { from: { x: 73.4, y: 2.2, z: 3.6 }, to: { x: 76.5, y: 1.5, z: 8.7 } },
  // The top of Yard Road: Finn on the west paving.
  yard_road: { from: { x: -3.2, y: 2.0, z: -28.6 }, to: { x: -3.2, y: 1.3, z: -33 } },
  // June outside her blue door in Indigo Row.
  june_door: { from: { x: 0.3, y: 2.0, z: 9.6 }, to: { x: 2.8, y: 1.3, z: 6 } },
  // The Market Cross gathering, from the south-west.
  cross: { from: { x: -3.6, y: 2.6, z: 71.4 }, to: { x: 0.4, y: 1.4, z: 78.4 } },
} satisfies Record<string, CameraShot>;
export type ShotId = keyof typeof shots;
export const SHOTS: Record<ShotId, CameraShot> = shots;

export type SceneGesture = 'wave' | 'nod';
export interface StoryLine {
  speaker?: SpeakerId;
  text: LocalizedText;
  gesture?: SceneGesture;
  shot?: ShotId;
}
export interface StoryScene extends SceneDef<StoryLine> {
  /** Where the courier stands for the scene (feet, facing; 0 = north/+z), so the shots frame both speakers. */
  playerAt?: { x: number; z: number; heading: number };
  /** Music when the scene starts (content/melody TUNES; Web Audio). */
  music?: { tune: TuneId; voice: 'musicbox' | 'hum'; bars?: number };
}

/** Facing Mara at Relay's door, a step out on the pavement. */
const AT_MARA = { x: -2.8, z: -13, heading: -Math.PI / 2 };
/** In front of the market stall, facing the stallholder. */
const AT_STALL = { x: 6.4, z: 74.6, heading: Math.PI };
const AT_ARTHUR_LOCK = { x: 52.8, z: 1.3, heading: Math.PI / 2 };
const AT_LOCKHOUSE = { x: 76.5, z: 7.6, heading: 0 };
const AT_FINN_YARD = { x: -2.5, z: -33, heading: -Math.PI / 2 };
const AT_JUNE = { x: 1.9, z: 6, heading: Math.PI / 2 };
const AT_CROSS = { x: 0, z: 75.5, heading: 0 };

const scenes = {
  morning_day2: {
    id: 'morning_day2',
    playerAt: AT_MARA,
    music: { tune: 'morning_day2', voice: 'musicbox', bars: 8 },
    lines: [
      {
        speaker: 'mara',
        gesture: 'wave',
        shot: 'relay_mara',
        text: { en: 'Morning! Day two — you’re practically staff now.', tr: 'Günaydın! İkinci gün — artık neredeyse kadrolusun.' },
      },
      {
        speaker: 'mara',
        shot: 'relay_mara',
        text: {
          en: 'Bad news first: a new courier has opened in the Railway Yard. Swift Parcel. Shiny vans, cheap prices.',
          tr: 'Önce kötü haber: Railway Yard’da yeni bir kurye açılmış. Swift Parcel. Parlak minibüsler, ucuz fiyatlar.',
        },
      },
      {
        speaker: 'mara',
        gesture: 'nod',
        shot: 'relay_mara',
        text: {
          en: 'And parcels have started going missing on the way. Keep yours close today.',
          tr: 'Bir de paketler yolda kaybolmaya başladı. Bugün paketine sıkı sarıl.',
        },
      },
    ],
  },
  // Chapter 4, after the spices are handed over.
  ch4_stall: {
    id: 'ch4_stall',
    playerAt: AT_STALL,
    lines: [
      {
        speaker: 'stallholder',
        shot: 'stall',
        text: {
          en: 'That was a Magpie, wasn’t it? Black and white, quick as you like. They’ve been at it all week.',
          tr: 'Magpie’ydi, değil mi? Siyah beyaz, göz açıp kapayıncaya kadar. Bütün hafta bunu yaptılar.',
        },
      },
      {
        speaker: 'stallholder',
        gesture: 'nod',
        shot: 'stall',
        text: {
          en: 'Here’s the odd bit. Whatever they pinch turns up at Swift Parcel’s counter a day later — “found and returned”. For a fee.',
          tr: 'İşin tuhafı şu: ne kaparlarsa bir gün sonra Swift Parcel’ın tezgâhında çıkıyor — “bulundu, iade edildi”. Ücreti karşılığında.',
        },
      },
      {
        shot: 'stall',
        text: {
          en: 'An orange Swift Parcel van hums past the market. Mara will want to hear about this.',
          tr: 'Turuncu bir Swift Parcel minibüsü pazarın yanından vızıldayarak geçer. Mara bunu duymak isteyecek.',
        },
      },
    ],
  },
  morning_day3: {
    id: 'morning_day3',
    playerAt: AT_MARA,
    music: { tune: 'morning_day3', voice: 'musicbox', bars: 8 },
    lines: [
      {
        speaker: 'mara',
        gesture: 'wave',
        shot: 'relay_mara',
        text: {
          en: 'Morning. Arthur came by at six, asking for you. Forty years, and he’s never asked for anyone.',
          tr: 'Günaydın. Arthur sabah altıda uğradı, seni sordu. Kırk yıldır kimseyi sormamıştı.',
        },
      },
      {
        speaker: 'mara',
        gesture: 'nod',
        shot: 'relay_mara',
        text: {
          en: 'And Mr Crane from Swift Parcel was in yesterday. Offered to buy the building. I told him where to post his offer.',
          tr: 'Bir de Swift Parcel’dan Mr Crane dün uğradı. Binayı satın almayı teklif etti. Teklifini nereye postalayacağını söyledim.',
        },
      },
    ],
  },
  ch5_arthur: {
    id: 'ch5_arthur',
    playerAt: AT_ARTHUR_LOCK,
    lines: [
      {
        speaker: 'arthur',
        gesture: 'wave',
        shot: 'lock_street',
        text: { en: 'There you are. Mara says you’ve good feet and better eyes.', tr: 'Geldin demek. Mara, ayağının çabuk, gözünün keskin olduğunu söylüyor.' },
      },
      {
        speaker: 'arthur',
        shot: 'lock_street',
        text: {
          en: 'Forty years ago I couldn’t deliver this one. “The Lockkeeper’s House” — no number. They renumbered the street the week it came.',
          tr: 'Kırk yıl önce bunu teslim edemedim. “The Lockkeeper’s House” — numara yok. Geldiği hafta sokağın numaralarını değiştirdiler.',
        },
      },
      {
        speaker: 'arthur',
        gesture: 'nod',
        shot: 'lock_street',
        text: {
          en: 'Sylvie always said every letter finds its door in the end. Find this one’s for me — my knees won’t do the canal today.',
          tr: 'Sylvie hep her mektubun sonunda kapısını bulduğunu söylerdi. Bunun kapısını benim için bul — dizlerim bugün kanalı yürüyemez.',
        },
      },
      {
        speaker: 'arthur',
        shot: 'lock_street',
        text: {
          en: 'And mind the man in the orange suit. Crane. He’s been asking for my old round books — who lives behind which door. Says he’ll pay well.',
          tr: 'Bir de turuncu takım elbiseli adama dikkat et. Crane. Eski tur defterlerimi istiyor — hangi kapının ardında kim yaşıyor. İyi para vereceğini söylüyor.',
        },
      },
    ],
  },
  ch5_door: {
    id: 'ch5_door',
    playerAt: AT_LOCKHOUSE,
    lines: [
      {
        shot: 'lockhouse',
        text: {
          en: 'Her name is Edith; she was the lockkeeper’s daughter. The letter is from her brother, posted the year he went to sea.',
          tr: 'Adı Edith; bekçinin kızıymış. Mektup, denize açıldığı yıl postaya verilmiş, ağabeyinden.',
        },
      },
      {
        shot: 'lockhouse',
        text: {
          en: '“Arthur knocked on this door every week for a month,” she says. “I was too shy to answer. Tell him it arrived.”',
          tr: '“Arthur bir ay boyunca her hafta bu kapıyı çaldı,” diyor. “Açmaya utandım. Ona ulaştığını söyle.”',
        },
      },
    ],
  },
  morning_day4: {
    id: 'morning_day4',
    playerAt: AT_MARA,
    music: { tune: 'morning_day4', voice: 'musicbox', bars: 8 },
    lines: [
      {
        speaker: 'mara',
        shot: 'relay_mara',
        text: {
          en: 'Three more parcels gone yesterday. Two customers asked whether they should switch to Swift Parcel.',
          tr: 'Dün üç paket daha kayboldu. İki müşteri Swift Parcel’a geçsek mi diye sordu.',
        },
      },
      {
        speaker: 'mara',
        gesture: 'nod',
        shot: 'relay_mara',
        text: { en: 'Finn has a plan. I don’t like it, which usually means it’s a good one.', tr: 'Finn’in bir planı var. Hoşuma gitmiyor; bu genelde iyi bir plan olduğu anlamına gelir.' },
      },
    ],
  },
  ch6_finn: {
    id: 'ch6_finn',
    playerAt: AT_FINN_YARD,
    lines: [
      {
        speaker: 'finn',
        gesture: 'wave',
        shot: 'yard_road',
        text: { en: 'Right. That box is empty — but they don’t know that.', tr: 'Tamam. O kutu boş — ama onlar bilmiyor.' },
      },
      {
        speaker: 'finn',
        shot: 'yard_road',
        text: {
          en: 'Walk down Yard Road like it’s the crown jewels. When one of them grabs it — let him.',
          tr: 'Yard Road’dan, elinde kraliyet mücevherleri varmış gibi yürü. Biri kaparsa — bırak alsın.',
        },
      },
      {
        speaker: 'finn',
        gesture: 'nod',
        shot: 'yard_road',
        text: {
          en: 'Then follow him home. Don’t catch him, don’t lose him. Whatever’s in that den, June can photograph it.',
          tr: 'Sonra evine kadar takip et. Yakalama, kaybetme. O inde ne varsa June fotoğrafını çeker.',
        },
      },
    ],
  },
  ch6_june: {
    id: 'ch6_june',
    playerAt: AT_JUNE,
    lines: [
      {
        speaker: 'june',
        gesture: 'nod',
        shot: 'june_door',
        text: { en: 'Got it. I’ll print them tonight.', tr: 'Tamam. Bu gece basarım.' },
      },
      {
        speaker: 'june',
        shot: 'june_door',
        text: {
          en: 'Tomorrow the whole street sees what Swift Parcel’s “returns” really are.',
          tr: 'Yarın bütün sokak Swift Parcel’ın “iadeleri”nin aslında ne olduğunu görecek.',
        },
      },
    ],
  },
  morning_day5: {
    id: 'morning_day5',
    playerAt: AT_MARA,
    music: { tune: 'morning_day5', voice: 'musicbox', bars: 8 },
    lines: [
      {
        speaker: 'mara',
        gesture: 'wave',
        shot: 'relay_mara',
        text: { en: 'Last day of your first week. You’ve earned a quiet one. You won’t get it.', tr: 'İlk haftanın son günü. Sakin bir günü hak ettin. Ama olmayacak.' },
      },
      {
        speaker: 'mara',
        shot: 'relay_mara',
        text: {
          en: 'June’s photographs are on the counter. The street is gathering at the Market Cross — and Mr Crane will be there, selling his “returns”.',
          tr: 'June’un fotoğrafları tezgâhta. Sokak Market Cross’ta toplanıyor — Mr Crane de orada, “iadelerini” satıyor olacak.',
        },
      },
    ],
  },
  ch7_final: {
    id: 'ch7_final',
    playerAt: AT_CROSS,
    music: { tune: 'finale_week', voice: 'musicbox' },
    lines: [
      {
        speaker: 'arthur',
        shot: 'cross',
        text: {
          en: 'Forty years I carried this neighbourhood’s post. Let me carry one more thing.',
          tr: 'Kırk yıl bu mahallenin postasını taşıdım. Bir şey daha taşımama izin verin.',
        },
      },
      {
        shot: 'cross',
        text: {
          en: 'Arthur holds up June’s photographs: the den, the orange board, Relay labels under Swift Parcel stickers.',
          tr: 'Arthur, June’un fotoğraflarını kaldırır: in, turuncu pano, Swift Parcel etiketlerinin altındaki Relay etiketleri.',
        },
      },
      {
        speaker: 'crane',
        shot: 'cross',
        text: { en: 'Those could be anyone’s parcels. Anyone’s yard.', tr: 'Onlar herkesin paketi olabilir. Herkesin avlusu.' },
      },
      {
        speaker: 'june',
        gesture: 'nod',
        shot: 'cross',
        text: {
          en: 'That one is mine. I sent it with Relay on Monday — my handwriting is under your sticker.',
          tr: 'O benim. Pazartesi Relay’le gönderdim — senin etiketinin altında benim el yazım var.',
        },
      },
      {
        speaker: 'finn',
        shot: 'cross',
        text: { en: 'And your “returns” desk is in the Magpies’ den, Mr Crane. Funny, that.', tr: 'Bir de “iade” masan Magpies’in ininde, Mr Crane. Ne tuhaf.' },
      },
      {
        speaker: 'crane',
        shot: 'cross',
        text: { en: '…Swift Parcel has no further business in Bellwick.', tr: '…Swift Parcel’ın Bellwick’te başka işi kalmadı.' },
      },
      {
        shot: 'cross',
        text: {
          en: 'Mr Crane walks off down Market Street. Somewhere a music box starts Arthur’s waltz, brighter than you have ever heard it.',
          tr: 'Mr Crane Market Street’ten aşağı yürüyüp gider. Bir yerlerde bir müzik kutusu Arthur’un valsini çalmaya başlar; hiç duymadığın kadar parlak.',
        },
      },
      {
        speaker: 'arthur',
        gesture: 'wave',
        shot: 'cross',
        text: {
          en: 'One week. You’ve learnt the way, and you’ve learnt the people. Welcome to Bellwick — properly, this time.',
          tr: 'Bir hafta. Yolu da öğrendin, insanları da. Bellwick’e hoş geldin — bu sefer gerçekten.',
        },
      },
    ],
  },
} satisfies Record<string, StoryScene>;
export type SceneId = keyof typeof scenes;
export const SCENES: Record<SceneId, StoryScene> = scenes;

/** The scene that opens a day of the week (day 1 opens with the first chapter itself). */
export const MORNING_SCENES: Partial<Record<number, SceneId>> = {
  2: 'morning_day2',
  3: 'morning_day3',
  4: 'morning_day4',
  5: 'morning_day5',
};
