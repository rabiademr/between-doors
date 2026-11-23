// Model: the market stall economy (F4). Pure functions: what the vendor sells on a given day of the
// courier's week, and buying it. Prices come ONLY from the catalogue (never from the UI); the input
// profile is never mutated.
import { HAGGLING_FACTOR, VENDOR_ITEMS, findItem, type VendorItem } from '../content/catalog';
import { VEHICLE_OFFERS, findVehicle, type VehicleOffer } from '../content/vehicles';
import { ownsItem, type Profile } from './Profile';

export interface StockItem extends VendorItem {
  /** True on the day the item first appears at the stall. */
  isNewToday: boolean;
}

export type PurchaseFailure = 'unknown-item' | 'not-in-stock' | 'already-owned' | 'insufficient-credits';
export type PurchaseResult = { ok: true; profile: Profile } | { ok: false; reason: PurchaseFailure };

const inStock = (item: VendorItem, day: number): boolean => item.availableFromDay <= day;

/** Items on the stall on `day`: oldest stock first, then cheapest, then by id (stable for the UI). */
export function vendorStock(day: number): StockItem[] {
  return VENDOR_ITEMS.filter((i) => inStock(i, day))
    .map((i) => ({ ...i, description: { ...i.description }, isNewToday: i.availableFromDay === day }))
    .sort((a, b) => a.availableFromDay - b.availableFromDay || a.price - b.price || a.id.localeCompare(b.id));
}

/**
 * What this courier pays for something with the given list price: a courier who has learnt Haggling pays
 * less (rounded to 5 credits, never below 5).
 */
export function priceFor(profile: Profile, listPrice: number): number {
  if (!ownsItem(profile, 'haggling')) return listPrice;
  return Math.max(5, Math.round((listPrice * HAGGLING_FACTOR) / 5) * 5);
}

/** Anything the stall sells: an item or a vehicle. */
interface Offer {
  id: string;
  price: number;
  availableFromDay: number;
}
/** Where a bought offer is recorded in the profile. */
export type Shelf = 'ownedItemIds' | 'ownedVehicleIds';

/** The one buying rule for items and vehicles. */
function purchase(profile: Profile, offer: Offer | undefined, shelf: Shelf, day: number): PurchaseResult {
  if (!offer) return { ok: false, reason: 'unknown-item' };
  if (offer.availableFromDay > day) return { ok: false, reason: 'not-in-stock' };
  if (profile[shelf].includes(offer.id)) return { ok: false, reason: 'already-owned' };
  const price = priceFor(profile, offer.price);
  if (profile.credits < price) return { ok: false, reason: 'insufficient-credits' };
  const p = structuredClone(profile);
  p.credits -= price;
  p[shelf].push(offer.id);
  return { ok: true, profile: p };
}

/** A card at the stall: what this courier pays and whether they can buy it (the same rule as `purchase`). */
export interface StallCard {
  price: number;
  state: 'owned' | 'unaffordable' | 'available';
}

export function stallCard(profile: Profile, offer: { id: string; price: number }, shelf: Shelf): StallCard {
  const price = priceFor(profile, offer.price);
  const state = profile[shelf].includes(offer.id) ? 'owned' : profile.credits < price ? 'unaffordable' : 'available';
  return { price, state };
}

export function purchaseItem(profile: Profile, itemId: string, day: number): PurchaseResult {
  return purchase(profile, findItem(itemId), 'ownedItemIds', day);
}

/** Vehicles the stall sells on `day`, cheapest first. */
export function vehicleStock(day: number): (VehicleOffer & { isNewToday: boolean })[] {
  return VEHICLE_OFFERS.filter((v) => v.availableFromDay <= day)
    .map((v) => ({ ...v, description: { ...v.description }, isNewToday: v.availableFromDay === day }))
    .sort((a, b) => a.price - b.price);
}

/** Buying a vehicle: same rules as an item; it is delivered to the rack outside Relay. */
export function purchaseVehicle(profile: Profile, vehicleId: string, day: number): PurchaseResult {
  return purchase(profile, findVehicle(vehicleId), 'ownedVehicleIds', day);
}
