
import { Skill } from '../../../../../base/Skill';
import { Character } from '../../../../../../shared/models/character';
import { Sweep as CastEffect } from '../../../../../effects/arts/Sweep';

export class Sweep extends Skill {

  static macroMetadata = {
    name: 'Sweep',
    macro: 'art sweep',
    icon: 'foot-trip',
    color: '#a00',
    mode: 'autoActivate',
    tooltipDesc: 'Attack multiple creatures on your tile with a kick attack.',
    requireSkillLevel: 13
  };

  public name = ['sweep', 'art sweep'];
  public unableToLearnFromStealing = true;

  execute(user: Character, { effect }) {
    this.use(user, user, effect);
  }

  use(user: Character, target: Character, baseEffect = {}) {
    const art = new CastEffect(baseEffect);
    art.cast(user, target, this);
  }

}
