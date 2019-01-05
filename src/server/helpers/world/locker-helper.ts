
import { startsWith } from 'lodash';

import { DB } from '../../database';
import { Player } from '../../../shared/models/player';
import { Locker } from '../../../shared/models/container/locker';
import { MaterialLocker } from '../../../shared/models/container/material-locker';

const MATERIAL_STORAGE_LOCKER_ID = -500;
const MATERIAL_STORAGE_LOCKER_REGION = 'Material';
const MATERIAL_STORAGE_LOCKER_ID_NAME = 'materials';

export class LockerHelper {

  private numLockersToSlotArray(maxLockerSlots: number): number[] {
    return Array(maxLockerSlots).fill(null).map((v, i) => -(i + 1));
  }

  private async createLockerIfNotExist(player, regionId, lockerName, lockerId, forceSlot: number = null) {
    return DB.$characterLockers.update(
      { username: player.username, charSlot: forceSlot || player.charSlot, regionId, lockerId },
      { $setOnInsert: { items: [] }, $set: { lockerName } },
      { upsert: true }
    );
  }

  private async createSharedLockersIfNotExists(player: Player): Promise<any> {
    const maxLockerSlots = player.$$room.subscriptionHelper.getSilverPurchase(player.$$account, 'SharedLockers');
    if(maxLockerSlots === 0) return new Promise(resolve => resolve([]));

    const allLockerSlots = this.numLockersToSlotArray(maxLockerSlots);

    return Promise.all(allLockerSlots.map(slotNumber => {
      return this.createLockerIfNotExist(player, 'Shared', `Shared Locker #${Math.abs(slotNumber)}`, `shared${slotNumber}`, slotNumber);
    }));
  }

  private async createMaterialStorageIfNotExists(player: Player): Promise<any> {
    return this.createLockerIfNotExist(player, MATERIAL_STORAGE_LOCKER_REGION, `Material Storage`, `materials`, MATERIAL_STORAGE_LOCKER_ID);
  }

  async openLocker(player: Player, lockerName, lockerId) {
    const regionId = player.$$room.mapRegion;

    if(lockerId !== 'global') {
      await this.createLockerIfNotExist(player, regionId, lockerName, lockerId);
    }

    const sharedLockers = await this.createSharedLockersIfNotExists(player);
    const numSharedLockers = sharedLockers.length;

    await this.createMaterialStorageIfNotExists(player);

    const baseLockerSlots = this.numLockersToSlotArray(numSharedLockers);
    baseLockerSlots.push(MATERIAL_STORAGE_LOCKER_ID);
    baseLockerSlots.push(player.charSlot);

    const findOpts: any = {
      username: player.username,
      charSlot: { $in: baseLockerSlots }
    };

    if(lockerId !== 'global') findOpts.regionId = { $in: [regionId, 'Shared', MATERIAL_STORAGE_LOCKER_REGION] };

    const lockers = await DB.$characterLockers.find(findOpts).toArray();

    const activeLockerId = lockerId === 'global' ? lockers[0].lockerId : lockerId;
    player.$$room.showLockerWindow(player, lockers, activeLockerId);
  }

  async saveLocker(player: Player, locker: Locker) {
    return DB.$characterLockers.update(
      { username: player.username, charSlot: locker.charSlot, regionId: locker.regionId, lockerId: locker.lockerId },
      { $set: { lockerName: locker.lockerName, items: locker.allItems } }
    );
  }

  async loadLocker(player: Player, regionId, lockerId, isGlobal = false): Promise<Locker> {
    const currentRegionId = player.$$room.mapRegion;
    if(!isGlobal && regionId !== 'Material' && regionId !== 'Shared' && currentRegionId !== regionId) return null;

    if(player.$$locker) {
      const locker = await player.$$locker;
      if(player.$$locker.lockerId === lockerId) return locker;
    }

    let charSlot = player.charSlot;

    if(startsWith(lockerId, 'shared')) {
      regionId = 'Shared';
      charSlot = +lockerId.substring(lockerId.indexOf('-'));
    }

    if(startsWith(lockerId, 'material')) {
      regionId = MATERIAL_STORAGE_LOCKER_REGION;
      charSlot = MATERIAL_STORAGE_LOCKER_ID;
      lockerId = MATERIAL_STORAGE_LOCKER_ID_NAME;
    }

    player.$$locker = await DB.$characterLockers.findOne({ username: player.username, charSlot, regionId, lockerId })
      .then(lock => {
        if(!lock || !lock.lockerId) return null;

        if(lock.regionId === MATERIAL_STORAGE_LOCKER_REGION) {
          return new MaterialLocker(lock);
        }

        return new Locker(lock);
      });

    return player.$$locker;
  }
}
