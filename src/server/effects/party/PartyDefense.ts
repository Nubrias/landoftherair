
import { Effect } from '../../base/Effect';
import { Character } from '../../../shared/models/character';
import { Skill } from '../../base/Skill';
import { PartyHelper } from '../../helpers/party/party-helper';
import { Player } from '../../../shared/models/player';

export class PartyDefense extends Effect {

  iconData = {
    name: 'armor-vest',
    bgColor: '#0aa',
    color: '#000',
    tooltipDesc: 'Party: Passive defense boost.'
  };

  private internalTicks = 0;

  cast(caster: Character, target: Character, skillRef?: Skill) {

    // cast on member
    if(!this.duration) {
      this.flagPermanent(target.uuid);
    }

    target.applyEffect(this);
  }

  effectStart(char: Character) {
    this.gainStat(char, 'defense', this.potency);
  }

  effectTick(char: Character) {
    this.internalTicks++;

    if((<any>char).party) {
      if(this.effectInfo.isPermanent && this.internalTicks % 9 === 0) {

        // check for other players, apply
        PartyHelper.getPartyMembersInRange(<Player>char).forEach(p => {
          if(p.baseClass === char.baseClass) return;

          const partyEffect = new PartyDefense({ duration: 10 });
          partyEffect.cast(char, p);
        });

        this.internalTicks = 0;
      }

      return;
    }

    this.effectEnd(char);
    char.unapplyEffect(this);
  }
}
