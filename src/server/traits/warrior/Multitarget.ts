
import { Trait } from '../../../shared/models/trait';

export class Multitarget extends Trait {

  static baseClass = 'Warrior';
  static traitName = 'Multitarget';
  static description = 'Increase the number of enemies you can strike with Multistrike by $3|9$.';
  static icon = 'sword-spin';

  static upgrades = [
    { cost: 20, capstone: true }
  ];

  static usageModifier(level: number): number {
    return level * 3;
  }

}
