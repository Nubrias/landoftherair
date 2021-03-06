
import { Command } from '../../../../base/Command';
import { Player } from '../../../../../shared/models/player';

export class RightToBelt extends Command {

  public name = '~RtB';
  public format = '';

  execute(player: Player) {
    if(this.isBusy(player)) return;
    const item = player.rightHand;
    if(!item) return;

    if(!player.addItemToBelt(item)) return;
    player.setRightHand(null);
  }

}
