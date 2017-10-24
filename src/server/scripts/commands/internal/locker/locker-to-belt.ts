
import { find, isUndefined } from 'lodash';

import { Command } from '../../../../base/Command';
import { Player } from '../../../../../shared/models/player';

export class LockerToBelt extends Command {

  public name = '~WtB';
  public format = 'ItemSlot LockerID';

  async execute(player: Player, { room, gameState, args }) {
    const [slotId, lockerId] = args.split(' ');

    const slot = +slotId;

    if(!this.checkPlayerEmptyHand(player)) return;
    if(!this.findLocker(player)) return;

    const locker = await room.loadLocker(player, lockerId);
    if(!locker) return false;

    const isLockerUnlocked = await room.lockLocker(player, lockerId);
    if(!isLockerUnlocked) return false;

    const item = locker.takeItemFromSlot(slot);
    if(!item) {
      room.unlockLocker(player, lockerId);
      return;
    }

    if(!player.addItemToBelt(item)) {
      room.unlockLocker(player, lockerId);
      return;
    }
    room.updateLocker(player, locker);
    room.unlockLocker(player, lockerId);
  }

}
