
import { Skill } from '../../../../../base/Skill';
import { Character } from '../../../../../../shared/models/character';
import { Boost as CastEffect } from '../../../../../effects/arts/Boost';

export class Boost extends Skill {

  static macroMetadata = {
    name: 'Boost',
    macro: 'art boost',
    icon: 'strong',
    color: '#a00',
    mode: 'clickToTarget',
    tooltipDesc: 'Increase your STR, DEX, and AGI.'
  };

  public targetsFriendly = true;

  public name = ['boost', 'art boost'];

  canUse(user: Character, target: Character) {
    return user === target && !user.hasEffect('Boost');
  }

  execute(user: Character, { effect }) {
    this.use(user, user, effect);
  }

  use(user: Character, target: Character, baseEffect = {}) {
    const art = new CastEffect(baseEffect);
    art.cast(user, target, this);
  }

}
