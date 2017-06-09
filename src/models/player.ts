
import { omitBy, merge, find, includes, compact, pull } from 'lodash';
import * as RestrictedNumber from 'restricted-number';
import {
  Item, EquippableItemClasses, HeadClasses, NeckClasses, WaistClasses, WristsClasses,
  RingClasses, FeetClasses, HandsClasses
} from './item';

export type Allegiance =
  'None'
| 'Pirates'
| 'Townsfolk'
| 'Royalty'
| 'Adventurers'
| 'Wilderness'
| 'Underground'

export type Sex = 'Male' | 'Female';

export type Direction = 'N' | 'S' | 'E' | 'W' | 'C';

export type CharacterClass =
  'Undecided';

export class Stats {
  str = 0;
  dex = 0;
  agi = 0;

  int = 0;
  wis = 0;
  wil = 0;

  luk = 0;
  cha = 0;
  con = 0;

  move = 3;
  hpregen = 1;
  mpregen = 0;
}

export class Character {

  _id?: any;

  username: string;
  charSlot: number;
  isGM: boolean;

  name: string;

  hp: RestrictedNumber = new RestrictedNumber(0, 100, 100);
  mp: RestrictedNumber = new RestrictedNumber(0, 0, 0);
  xp: number = 1000;

  gold: number = 0;

  stats: Stats = new Stats();

  allegiance: Allegiance = 'None';
  sex: Sex = 'Male';
  dir: Direction = 'S';

  x: number = 0;
  y: number = 0;
  map: string;

  baseClass: CharacterClass = 'Undecided';

  sack: Item[] = [];
  belt: Item[] = [];

  gear: any = {};
  leftHand: Item;
  rightHand: Item;

  $fov: any;
  $doNotSave: boolean;
  swimLevel: number;

  get ageString() {
    return 'extremely young';
  }

  get level() {
    return Math.floor(this.xp / 1000);
  }

  getTotalStat(stat) {
    return this.stats[stat];
  }

  constructor(opts) {
    merge(this, opts);
    this.hp = new RestrictedNumber(this.hp.minimum, this.hp.maximum, this.hp.__current);
    this.mp = new RestrictedNumber(this.mp.minimum, this.mp.maximum, this.mp.__current);

    this.sack = this.sack.map(item => new Item(item));
    this.belt = this.belt.map(item => new Item(item));

    if(this.leftHand) this.leftHand = new Item(this.leftHand);
    if(this.rightHand) this.rightHand = new Item(this.rightHand);

    Object.keys(this.gear).forEach(slot => {
      if(!this.gear[slot]) return;
      this.gear[slot] = new Item(this.gear[slot]);
    });
  }

  toJSON() {
    return omitBy(this, (value, key) => {
      if(!Object.getOwnPropertyDescriptor(this, key)) return true;
      if(key === '_id') return true;
      return false;
    });
  }

  hasEmptyHand() {
    return !this.leftHand || !this.rightHand;
  }

  determineItemType(itemClass) {
    if(includes(HeadClasses, itemClass))   return 'Head';
    if(includes(NeckClasses, itemClass))   return 'Neck';
    if(includes(WaistClasses, itemClass))  return 'Waist';
    if(includes(WristsClasses, itemClass)) return 'Wrists';
    if(includes(RingClasses, itemClass))   return 'Ring';
    if(includes(FeetClasses, itemClass))   return 'Feet';
    if(includes(HandsClasses, itemClass))  return 'Hands';
    return itemClass;
  }

  private getItemSlotToEquipIn(item: Item) {

    let slot = item.itemClass;

    if(item.isRobe()) {
      const armor = this.gear.Armor;
      const robe1 = this.gear.Robe1;
      const robe2 = this.gear.Robe2;

      if(armor && robe1 && robe2) return false;

      if(!armor) {
        slot = 'Armor';
      } else if(!robe1) {
        slot = 'Robe1';
      } else if(!robe2) {
        slot = 'Robe2';
      }

    } else if(item.isArmor()) {
      const armor = this.gear.Armor;
      if(armor) return false;

      slot = 'Armor';

    } else if(item.itemClass === 'Ring') {
      const ring1 = this.gear.Ring1;
      const ring2 = this.gear.Ring2;

      if(ring1 && ring2) return false;

      if(!ring1) {
        slot = 'Ring1';
      } else if(!ring2) {
        slot = 'Ring2';
      }
    } else {
      const realSlot = this.determineItemType(item.itemClass);
      if(!includes(['Head', 'Neck', 'Waist', 'Wrists', 'Hands', 'Feet'], realSlot)) return false;
      if(this.gear[realSlot]) return false;

      slot = realSlot;
    }

    return slot;
  }

  equip(item: Item) {
    const slot = this.getItemSlotToEquipIn(item);
    if(!slot) return false;

    this.gear[slot] = item;
    return true;
  }

  canEquip(item: Item) {
    if(!includes(EquippableItemClasses, item.itemClass)) return false;
    if(item.requirements) {
      if(item.requirements.level && this.level < item.requirements.level) return false;
      if(item.requirements.class && !includes(item.requirements.class, this.baseClass)) return false;
    }

    const slot = this.getItemSlotToEquipIn(item);
    if(!slot || this.gear[slot]) return false;
    return true;
  }

  unequip(slot: string) {
    this.gear[slot] = null;
  }

  private fixSack() {
    this.sack = compact(this.sack);
  }

  fullSack() {
    return this.sack.length >= 25;
  }

  addItemToSack(item: Item) {
    this.sack.push(item);
  }

  takeItemFromSack(slot: number) {
    const item = this.sack[slot];
    pull(this.sack, item);
    this.fixSack();
    return item;
  }

  private fixBelt() {
    this.belt = compact(this.belt);
  }

  fullBelt() {
    return this.belt.length >= 5;
  }

  addItemToBelt(item: Item) {
    this.belt.push(item);
    this.fixBelt();
  }

  takeItemFromBelt(slot: number) {
    const item = this.belt[slot];
    pull(this.belt, item);
    this.fixBelt();
    return item;
  }

  tick() {
    const hpRegen = this.getTotalStat('hpregen');
    const mpRegen = this.getTotalStat('mpregen');

    this.hp.add(hpRegen);
    this.mp.add(mpRegen);

    if(this.swimLevel > 0) {
      const hpPercentLost = this.swimLevel * 4;
      const hpLost = Math.floor(this.hp.maximum * (hpPercentLost/100));
      this.hp.sub(hpLost);
    }
  }
}

export class Player extends Character {
}
