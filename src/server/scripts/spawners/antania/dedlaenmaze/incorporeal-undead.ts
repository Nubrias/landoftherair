
import { Spawner } from '../../../../base/Spawner';

const npcIds = [
  'Dedlaen Spectre'
];

export class IncorporealUndeadSpawner extends Spawner {

  constructor(room, opts) {
    super(room, opts, {
      respawnRate: 30,
      initialSpawn: 2,
      maxCreatures: 4,
      spawnRadius: 0,
      randomWalkRadius: 45,
      leashRadius: 65,
      npcIds
    });
  }

}