import { describe, expect, it } from 'vitest';
import { VENDOR_ITEMS } from '../content/catalog';
import { priceFor, purchaseItem, purchaseVehicle, stallCard, vehicleStock, vendorStock } from './Economy';
import { STORY_DAYS, emptyProfile } from './Profile';

describe('vendorStock', () => {
  it('day 1: compass, Steady Pace and the bag, all new today; GPS not yet', () => {
    const stock = vendorStock(1);
    expect(stock.map((i) => i.id)).toEqual(['compass', 'steady_pace', 'bag']);
    expect(stock.every((i) => i.isNewToday)).toBe(true);
  });

  it('later days keep older stock (not new) and add that day’s items (new)', () => {
    const stock = vendorStock(2);
    expect(stock.map((i) => [i.id, i.isNewToday])).toEqual([
      ['compass', false],
      ['steady_pace', false],
      ['bag', false],
      ['gps', true],
      ['haggling', true],
    ]);
    // The last day sells everything; only items introduced that day are flagged new.
    const last = vendorStock(STORY_DAYS);
    expect(last.length).toBe(VENDOR_ITEMS.length);
    for (const i of last) expect(i.isNewToday).toBe(i.availableFromDay === STORY_DAYS);
  });

  it('every catalogue item is sellable within the week and has a sane price', () => {
    for (const i of VENDOR_ITEMS) {
      expect(i.availableFromDay).toBeGreaterThanOrEqual(1);
      expect(i.availableFromDay).toBeLessThanOrEqual(STORY_DAYS);
      expect(Number.isInteger(i.price) && i.price > 0).toBe(true);
    }
    expect(new Set(VENDOR_ITEMS.map((i) => i.id)).size).toBe(VENDOR_ITEMS.length);
  });

  it('returns copies: changing the result does not change the catalogue', () => {
    const [first] = vendorStock(1);
    if (!first) throw new Error('setup');
    first.price = 0;
    first.description.en = 'x';
    expect(vendorStock(1)[0]?.price).toBe(100);
    expect(vendorStock(1)[0]?.description.en).not.toBe('x');
  });
});

describe('purchaseItem', () => {
  const rich = { ...emptyProfile(), credits: 150 };

  it('buys at the catalogue price and records the id; the input profile is untouched', () => {
    const r = purchaseItem(rich, 'steady_pace', 1);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.profile.credits).toBe(50);
      expect(r.profile.ownedItemIds).toEqual(['steady_pace']);
    }
    expect(rich.credits).toBe(150);
    expect(rich.ownedItemIds).toEqual([]);
  });

  it('GPS costs 150 and is sold from day 2', () => {
    expect(purchaseItem(rich, 'gps', 1)).toEqual({ ok: false, reason: 'not-in-stock' });
    const r = purchaseItem(rich, 'gps', 2);
    expect(r.ok && r.profile.credits).toBe(0);
  });

  it('refuses: unknown item, not in stock, already owned, insufficient credits', () => {
    expect(purchaseItem(rich, 'jetpack', 5)).toEqual({ ok: false, reason: 'unknown-item' });
    expect(purchaseItem(rich, 'gps', 1)).toEqual({ ok: false, reason: 'not-in-stock' });
    expect(purchaseItem(emptyProfile(), 'compass', 1)).toEqual({ ok: false, reason: 'insufficient-credits' });
    const bought = purchaseItem(rich, 'compass', 1);
    if (!bought.ok) throw new Error('setup');
    expect(purchaseItem({ ...bought.profile, credits: 500 }, 'compass', 1)).toEqual({ ok: false, reason: 'already-owned' });
  });

  it('exact balance is enough', () => {
    const r = purchaseItem({ ...emptyProfile(), credits: 100 }, 'compass', 1);
    expect(r.ok && r.profile.credits).toBe(0);
  });
});

describe('haggling and vehicles', () => {
  const rich = { ...emptyProfile(), credits: 2000 };

  it('makes everything bought afterwards 15% cheaper (to the nearest 5), but not itself', () => {
    expect(priceFor(rich, 100)).toBe(100);
    const learnt = purchaseItem(rich, 'haggling', 2);
    if (!learnt.ok) throw new Error('haggling should be buyable on day 2');
    expect(learnt.profile.credits).toBe(2000 - 150); // list price
    expect(priceFor(learnt.profile, 100)).toBe(85);
    expect(priceFor(learnt.profile, 120)).toBe(100);
    const gps = purchaseItem(learnt.profile, 'gps', 2);
    expect(gps.ok && gps.profile.credits).toBe(2000 - 150 - 130);
  });

  it('sells vehicles by day, once each, at the haggled price', () => {
    expect(vehicleStock(1).map((v) => v.id)).toEqual(['bike', 'scooter']);
    expect(vehicleStock(3).map((v) => v.id)).toEqual(['bike', 'scooter', 'motorcycle', 'van']);
    expect(purchaseVehicle(rich, 'van', 1)).toEqual({ ok: false, reason: 'not-in-stock' });
    expect(purchaseVehicle(rich, 'hovercraft', 5)).toEqual({ ok: false, reason: 'unknown-item' });
    expect(purchaseVehicle(emptyProfile(), 'bike', 1)).toEqual({ ok: false, reason: 'insufficient-credits' });
    const bike = purchaseVehicle(rich, 'bike', 1);
    if (!bike.ok) throw new Error('bike should be buyable');
    expect(bike.profile.ownedVehicleIds).toEqual(['bike']);
    expect(bike.profile.credits).toBe(2000 - 120);
    expect(rich.ownedVehicleIds).toEqual([]); // input untouched
    expect(purchaseVehicle(bike.profile, 'bike', 1)).toEqual({ ok: false, reason: 'already-owned' });
    const haggler = { ...rich, ownedItemIds: ['haggling'] };
    const scooter = purchaseVehicle(haggler, 'scooter', 1);
    expect(scooter.ok && scooter.profile.credits).toBe(2000 - 255);
  });
});

describe('stallCard', () => {
  it('owned, unaffordable or available — at the price the courier pays (same rule as buying)', () => {
    const p = { ...emptyProfile(), credits: 100, ownedItemIds: ['haggling'], ownedVehicleIds: ['bike'] };
    expect(stallCard(p, { id: 'bike', price: 120 }, 'ownedVehicleIds')).toEqual({ price: 100, state: 'owned' });
    expect(stallCard(p, { id: 'bike', price: 120 }, 'ownedItemIds')).toEqual({ price: 100, state: 'available' });
    expect(stallCard(p, { id: 'van', price: 600 }, 'ownedVehicleIds')).toEqual({ price: 510, state: 'unaffordable' });
    // Exactly what buying says.
    expect(stallCard({ ...emptyProfile(), credits: 120 }, { id: 'bike', price: 120 }, 'ownedVehicleIds').state).toBe('available');
    expect(purchaseVehicle({ ...emptyProfile(), credits: 120 }, 'bike', 1).ok).toBe(true);
  });
});
