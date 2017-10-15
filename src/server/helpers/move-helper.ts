
import { Character, SkillClassNames } from '../../shared/models/character';
import { MapLayer } from '../../shared/models/maplayer';
import { find } from 'lodash';

export class MoveHelper {

  static tryToOpenDoor(player: Character, door, { gameState }): boolean {
    door.properties = door.properties || {};
    const { requireLockpick, skillRequired, requireHeld } = door.properties;

    if(!door.isOpen
      && (requireLockpick || requireHeld)) {

      let shouldOpen = false;

      if(requireHeld
        && player.hasHeldItem(door.properties.requireHeld)) shouldOpen = true;

      if(requireLockpick
        && skillRequired
        && player.baseClass === 'Thief'
        && player.hasHeldItem('Lockpick', 'right')) {

        const playerSkill = player.calcSkillLevel(SkillClassNames.Thievery);

        if(playerSkill < skillRequired) {
          player.sendClientMessage('You are not skilled enough to pick this lock.');
          return false;
        }

        player.sendClientMessage('You successfully picked the lock!');
        player.setRightHand(null);

        shouldOpen = true;
      }

      if(!shouldOpen) {
        player.sendClientMessage('The door is locked.');
        return false;
      }
    }

    player.sendClientMessage(door.isOpen ? 'You close the door.' : 'You open the door.');
    gameState.toggleDoor(door);

    let { x, y } = door;

    x /= 64;
    y /= 64;

    gameState.getPlayersInRange({ x, y }, 3).forEach(p => gameState.calculateFOV(p));
    return true;
  }

  static move(player: Character, { room, gameState, x, y }) {

    const moveRate = player.getBaseStat('move');
    x = Math.max(Math.min(x, moveRate), -moveRate);
    y = Math.max(Math.min(y, moveRate), -moveRate);

    const checkX = Math.abs(x);
    const checkY = Math.abs(y);

    const denseTiles = gameState.map.layers[MapLayer.Walls].data;
    const maxTilesMoved = Math.max(checkX, checkY);
    const steps = Array(maxTilesMoved).fill(null);

    let tempX = x;
    let tempY = y;

    for(let curStep = 0; curStep < maxTilesMoved; curStep++) {

      const step = { x: 0, y: 0 };

      if(tempX < 0) {
        step.x = -1;
        tempX++;
      } else if(tempX > 0) {
        step.x = 1;
        tempX--;
      }

      if(tempY < 0) {
        step.y = -1;
        tempY++;
      } else if(tempY > 0) {
        step.y = 1;
        tempY--;
      }

      steps[curStep] = step;
    }

    const reverseSteps = steps.reverse();
    const denseObjects: any[] = gameState.map.layers[MapLayer.DenseDecor].objects;
    const interactables = gameState.map.layers[MapLayer.Interactables].objects;

    const denseCheck = denseObjects.concat(interactables);

    const getNumStepsSuccessful = (trySteps) => {
      let i = 0;

      for(i; i < trySteps.length; i++) {
        const step = trySteps[i];
        const nextTileLoc = ((player.y + step.y) * gameState.map.width) + (player.x + step.x);
        const nextTile = denseTiles[nextTileLoc];

        if(nextTile === 0) {
          const object = find(denseCheck, { x: (player.x + step.x) * 64, y: (player.y + step.y + 1) * 64 });
          if(object && object.density) {
            if(object.type === 'Door') {
              if(!this.tryToOpenDoor(player, object, { gameState })) break;
            } else {
              break;
            }
          }
        } else {
          break;
        }
      }

      return i;
    };

    const normalStepsTaken = getNumStepsSuccessful(steps);
    const reverseStepsTaken = getNumStepsSuccessful(reverseSteps);

    const finalSteps = normalStepsTaken > reverseStepsTaken ? steps : reverseSteps;

    player.takeSequenceOfSteps(finalSteps);
    player.setDirBasedOnXYDiff(x, y);

    gameState.resetPlayerStatus(player);

    const interactable = room.state.getInteractable(player.x, player.y);

    if(interactable) {
      this.handleInteractable(room, player, interactable);
    }
  }

  private static handleInteractable(room, player, obj) {
    switch(obj.type) {
      case 'Teleport': return this.handleTeleport(room, player, obj);
      case 'Locker':   return this.handleLocker(room, player, obj);
      case 'Trap':     return this.handleTrap(room, player, obj);
    }
  }

  private static handleTeleport(room, player, obj) {
    const { teleportX, teleportY, teleportMap, requireHeld } = obj.properties;
    if(requireHeld && !player.hasHeldItem(requireHeld)) return;
    room.teleport(player, { x: teleportX, y: teleportY, newMap: teleportMap });
    player.sendClientMessage('Your surroundings shift.');
  }

  private static handleLocker(room, player, obj) {
    const { lockerId } = obj.properties;
    room.openLocker(player, obj.name, lockerId);
  }

  private static handleTrap(room, player, obj) {
    room.state.removeInteractable(obj);
    room.castEffectFromTrap(player, obj);
    player.sendClientMessage('You\'ve activated a trap!');
  }
}
