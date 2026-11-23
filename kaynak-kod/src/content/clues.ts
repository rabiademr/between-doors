// Content: things the courier can inspect (spot kind `clue` in content/world/*.geo.json). `read` is what
// the thing says whenever it is inspected; `found` is added when it matters to the delivery in hand (the
// quest's `clueFound` call), and `panelLine` then stays in the task panel (Tab) for the rest of the attempt.
import type { LocalizedText } from '../i18n';

export interface ClueDef {
  read: LocalizedText;
  found: LocalizedText;
  panelLine: LocalizedText;
}

export const CLUES = {
  // Chapter 3: the sign in Sylvie's old photo of the Postmark Mews entrance.
  old_post_sign: {
    read: { en: 'A faded enamel sign: “Bellwick Post — Receiving Office”.', tr: 'Solmuş emaye bir tabela: “Bellwick Post — Receiving Office”.' },
    found: {
      en: 'The sign, the broken wall, the leaning tree… This is the entrance in Sylvie’s photo.',
      tr: 'Tabela, kırık duvar, eğik ağaç… Sylvie’nin fotoğrafındaki giriş burası.',
    },
    panelLine: { en: 'Entrance found: the old post sign by the brass gate.', tr: 'Giriş bulundu: pirinç kapının yanındaki eski posta tabelası.' },
  },
  // Chapter 5: the plate on the end of the north row, facing the canal.
  old_nameplate: {
    read: {
      en: 'An old enamel plate: “LOCK HOUSE · 1898 — Keeper’s door on the north side, the last before the water.”',
      tr: 'Eski bir emaye plaka: “LOCK HOUSE · 1898 — Bekçinin kapısı kuzey tarafta, sudan önceki son kapı.”',
    },
    found: {
      en: 'So the Lockkeeper’s House is the last door on the north side of Lock Street.',
      tr: 'Demek ki Lockkeeper’s House, Lock Street’in kuzey tarafındaki son kapı.',
    },
    panelLine: {
      en: 'Lockkeeper’s House: the last door on the north side of Lock Street, by the canal.',
      tr: 'Lockkeeper’s House: Lock Street’in kuzey tarafındaki son kapı, kanalın yanında.',
    },
  },
  // Chapter 6: the Magpies' den gives Swift Parcel away.
  den_returns_sign: {
    read: { en: 'An orange board on the fence: “SWIFT PARCEL · RETURNS”.', tr: 'Çitte turuncu bir pano: “SWIFT PARCEL · RETURNS”.' },
    found: {
      en: 'The “returns” desk is in the thieves’ den. Swift Parcel sells back what the Magpies take.',
      tr: '“İade” masası hırsızların ininde. Swift Parcel, Magpies’in kaptığını geri satıyor.',
    },
    panelLine: { en: 'Evidence: Swift Parcel’s “returns” board in the den.', tr: 'Kanıt: indeki Swift Parcel “iade” panosu.' },
  },
  den_labels: {
    read: {
      en: 'Relay parcels, stacked by the crate. Orange Swift Parcel stickers are pasted over the Relay labels.',
      tr: 'Sandığın yanında Relay paketleri yığılmış. Relay etiketlerinin üstüne turuncu Swift Parcel etiketleri yapıştırılmış.',
    },
    found: { en: 'You peel one sticker off. The Relay label underneath is plain to see.', tr: 'Bir etiketi söküyorsun. Altındaki Relay etiketi apaçık görünüyor.' },
    panelLine: { en: 'Evidence: a Swift Parcel sticker peeled off a Relay parcel.', tr: 'Kanıt: bir Relay paketinden sökülen Swift Parcel etiketi.' },
  },
} as const satisfies Record<string, ClueDef>;

export type ClueId = keyof typeof CLUES;

export const isClueId = (id: string): id is ClueId => id in CLUES;
