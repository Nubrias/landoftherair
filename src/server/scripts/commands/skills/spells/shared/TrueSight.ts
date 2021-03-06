
import { Skill } from '../../../../../base/Skill';
import { Character } from '../../../../../../shared/models/character';
import { TrueSight as CastEffect } from '../../../../../effects/buffs/TrueSight';

export class TrueSight extends Skill {

  static macroMetadata = {
    name: 'TrueSight',
    macro: 'cast truesight',
    icon: 'all-seeing-eye',
    color: '#00a',
    mode: 'clickToTarget',
    tooltipDesc: 'See hidden walls and other hidden features. Cost: 25 MP'
  };

  public targetsFriendly = true;

  public name = ['truesight', 'cast truesight'];

  canUse(user: Character, target: Character) {
    return super.canUse(user, target) && !target.hasEffect('TrueSight');
  }

  mpCost() { return 25; }
  range(attacker: Character) { return 5; }

  execute(user: Character, { args, effect }) {

    const target = this.getTarget(user, args, true);
    if(!target) return;

    if(!this.isValidBuffTarget(user, target)) return user.sendClientMessage('You cannot target that person with this spell.');

    if(!this.tryToConsumeMP(user, effect)) return;

    this.use(user, target, effect);
  }

  use(user: Character, target: Character, baseEffect = {}) {
    const effect = new CastEffect({});
    effect.cast(user, target, this);
  }

}
