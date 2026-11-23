// View: the market stall's goods (F4). Pure DOM building; the controller decides what happens on "Buy"
// (prices, stock and ownership come from domain/Economy — this only shows them).
import type { VendorItemKind } from '../content/catalog';
import { STRINGS } from '../i18n';

export interface VendorItemView {
  id: string;
  kind: VendorItemKind | 'vehicle';
  name: string;
  description: string;
  price: number;
  state: 'available' | 'owned' | 'unaffordable';
  /** First day on the stall → "New today" badge. */
  isNew: boolean;
}

export function buildVendor(credits: number, items: readonly VendorItemView[], onBuy: (id: string) => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'shop vendor';
  const greeting = document.createElement('p');
  greeting.className = 'vendor-greeting';
  greeting.textContent = STRINGS.vendorGreeting;
  const balance = document.createElement('p');
  balance.className = 'shop-credits';
  balance.textContent = STRINGS.credits(credits);
  wrap.append(greeting, balance);

  if (items.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = STRINGS.vendorEmpty;
    wrap.append(empty);
  }

  for (const item of items) {
    const card = document.createElement('div');
    card.className = `card vendor-card ${item.state}`;
    const h = document.createElement('h3');
    h.textContent = item.name;
    const kind = document.createElement('span');
    kind.className = 'vendor-kind';
    kind.textContent = STRINGS.vendorKind[item.kind];
    h.append(' ', kind);
    if (item.isNew) {
      const badge = document.createElement('span');
      badge.className = 'vendor-new';
      badge.textContent = STRINGS.newToday;
      h.append(' ', badge);
    }
    const p = document.createElement('p');
    p.textContent = item.description;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent =
      item.state === 'owned' ? STRINGS.owned : item.state === 'unaffordable' ? STRINGS.needCredits(item.price) : STRINGS.buy(item.price);
    btn.disabled = item.state !== 'available';
    btn.setAttribute('aria-label', `${item.name}: ${btn.textContent}`);
    btn.addEventListener('click', () => {
      btn.disabled = true; // one purchase per click; domain/Economy also refuses duplicates
      onBuy(item.id);
    });
    card.append(h, p, btn);
    wrap.append(card);
  }
  return wrap;
}
