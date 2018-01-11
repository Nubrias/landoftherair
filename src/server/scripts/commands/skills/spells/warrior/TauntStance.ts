
import { startsWith } from 'lodash';

import { Skill } from '../../../../../base/Skill';
import { Character } from '../../../../../../shared/models/character';
import { TauntStance as CastEffect } from '../../../../../effects/TauntStance';

export class TauntStance extends Skill {

  static macroMetadata = {
    name: 'Taunt Stance',
    macro: 'stance taunt',
    icon: 'enrage',
    color: '#000000',
    mode: 'autoActivate',
    tooltipDesc: 'Become more boisterous, taunting foes but losing offense and defense. Requires weapon skill 15 (Warrior).',
    requiresBaseClass: 'Warrior'
  };

  public name = 'stance taunt';

  requiresLearn = false;

  execute(user: Character, { gameState, args }) {

    const item = user.rightHand;
    if(!item) return user.sendClientMessage('You need a weapon to taunt!');
    if(!CastEffect.isValid(user, item.itemClass, CastEffect.skillRequired)) return user.sendClientMessage('You cannot taunt with that weapon.');

    this.use(user);
  }

  use(user: Character) {
    const stance = new CastEffect({});
    stance.cast(user, user, this);
  }

}