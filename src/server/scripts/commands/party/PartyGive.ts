
import { Command } from '../../../base/Command';
import { Player } from '../../../../shared/models/player';
import { MessageHelper } from '../../../helpers/world/message-helper';

export class PartyGive extends Command {

  public name = 'party give';

  execute(player: Player, { room, args }) {
    if(!player.party) return player.sendClientMessage('You are not in a party!');
    if(!args) return player.sendClientMessage('You need to specify a person to give leadership to!');

    const party = player.party;

    if(!party.isLeader(player.username)) return player.sendClientMessage('You aren\'t the party leader!');

    const possTargets = MessageHelper.getPossibleMessageTargets(player, args);
    const target = possTargets[0];
    if(!target) return player.youDontSeeThatPerson(args);

    if((<Player>target).partyName !== player.partyName) return player.sendClientMessage(`${target.name} is not in your party!`);

    room.partyManager.changeLeader(player, target);
  }

}
