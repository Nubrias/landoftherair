
import { Trait } from '../../../shared/models/trait';

export class ShadowSwap extends Trait {

  static baseClass = 'Thief';
  static traitName = 'ShadowSwap';
  static description = 'Swap places with your shadow in combat $2|6$% more frequently.';
  static icon = 'shadow-follower';

  static upgrades = [
    { }, { }, { }, { }, { }, { }, { }, { capstone: true }
  ];

  static usageModifier(level: number): number {
    return Math.min(100, level * 2);
  }

}
