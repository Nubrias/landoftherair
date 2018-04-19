import { NPC } from '../../../../../shared/models/npc';
import { VendorResponses } from '../../common-responses';

export const setup = async (npc: NPC) => {
  npc.hostility = 'Never';

  const vendorItems = [
    'Mend Bottle',
    'Mend Bottle (5oz)',
    'Instant Heal Bottle',
    'Instant Heal Bottle (5oz)',
    'Scribe Scroll',
    'Ink Vial',
    'Antanian Slice of Bread',
    'Antanian Loaf of Bread',
    'Antanian Bottle of Water',
    'Antanian Pint of Water',
    { name: 'EtherFire Potion', valueMult: 25 },
  ];

  npc.$$room.npcLoader.loadVendorItems(npc, vendorItems);

  npc.rightHand = await npc.$$room.npcLoader.loadItem('Instant Heal Bottle');
  npc.gear.Armor = await npc.$$room.npcLoader.loadItem('Antanian Tunic');
  npc.recalculateStats();
};

export const responses = (npc: NPC) => {
  VendorResponses(npc);
};
