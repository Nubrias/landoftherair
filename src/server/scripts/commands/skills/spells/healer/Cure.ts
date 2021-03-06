
import { Skill } from '../../../../../base/Skill';
import { Character } from '../../../../../../shared/models/character';
import { Cure as CastEffect } from '../../../../../effects/cures/Cure';

export class Cure extends Skill {

  static macroMetadata = {
    name: 'Cure',
    macro: 'cast cure',
    icon: 'tentacle-heart',
    color: '#080',
    mode: 'clickToTarget',
    tooltipDesc: 'Heal a single target. Cost: 5 MP',
    skillTPCost: 1
  };

  public targetsFriendly = true;

  public name = ['cure', 'cast cure'];
  public format = 'Target';

  canUse(user: Character, target: Character) {
    return super.canUse(user, target) && target.hp.ltePercent(75);
  }

  mpCost() { return 5; }
  range(attacker: Character) { return 5; }

  execute(user: Character, { args, effect }) {

    const target = this.getTarget(user, args, true);
    if(!target) return;

    if(!this.isValidBuffTarget(user, target)) return user.sendClientMessage('You cannot target that person with this spell.');

    if(!this.tryToConsumeMP(user, effect)) return;

    this.use(user, target, effect);
  }

  use(user: Character, target: Character, baseEffect = {}) {
    const effect = new CastEffect(baseEffect);
    effect.cast(user, target, this);
  }

}
