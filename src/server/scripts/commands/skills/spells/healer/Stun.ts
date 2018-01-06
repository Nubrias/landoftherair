
import { startsWith } from 'lodash';

import { Skill } from '../../../../../base/Skill';
import { Character, SkillClassNames } from '../../../../../../shared/models/character';
import { Stunned as CastEffect } from '../../../../../effects/Stunned';

export class Stun extends Skill {

  static macroMetadata = {
    name: 'Stun',
    macro: 'cast stun',
    icon: 'knockout',
    color: '#990',
    mode: 'clickToTarget',
    tooltipDesc: 'Attempt to stun a single target. Cost: 40 MP'
  };

  public name = ['stun', 'cast stun'];
  public format = 'Target';

  mpCost = () => 40;
  range = () => 5;

  execute(user: Character, { gameState, args, effect }) {

    const target = this.getTarget(user, args);
    if(!target) return;

    if(target === user) return;

    if(!this.tryToConsumeMP(user, effect)) return;

    this.use(user, target, effect);
  }

  use(user: Character, target: Character, baseEffect = {}) {
    const effect = new CastEffect(baseEffect);
    effect.cast(user, target, this);
  }

}
