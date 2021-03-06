import { Injectable } from '@angular/core';
import { ClientGameState } from './clientgamestate';
import * as swal from 'sweetalert2';
import * as fileSaver from 'file-saver';

import { Subject } from 'rxjs';

import { find, includes, findIndex, extend, startsWith, capitalize, isNumber, isUndefined, sortBy } from 'lodash';
import { Player } from '../../shared/models/player';
import { Item } from '../../shared/models/item';
import { Locker } from '../../shared/models/container/locker';
import { LocalStorageService } from 'ngx-webstorage';
import { VALID_TRADESKILLS } from '../../shared/helpers/tradeskill-helper';
import { SkillTree } from '../../shared/models/skill-tree';
import { AlertService } from './alert.service';
import { Macro } from './macros.service';
import { ICharacter, INPC } from '../../shared/interfaces/character';

@Injectable()
export class ColyseusGameService {

  client: any;
  colyseus: any;
  clientGameState: ClientGameState = new ClientGameState({});

  worldRoom: any;

  _inGame: boolean;
  _joiningGame: boolean;

  showGround: boolean;
  showTrainer: any = {};
  showShop: any = {};
  showBank: any = {};
  showMarketBoard: any = {};

  showAlchemy: any = {};
  showSpellforging: any = {};
  showMetalworking: any = {};

  showLocker: Locker[] = [];
  activeLockerNumber: number;

  currentTarget: string;

  private changingMap: boolean;
  private currentMap: string;
  private isQuitting: boolean;

  public lastCommands: string[];

  public currentCommand = '';

  public gameCommand$ = new Subject();
  public inGame$ = new Subject();
  public bgm$ = new Subject();
  public sfx$ = new Subject(); // sound
  public vfx$ = new Subject(); // spell effects
  public cfx$ = new Subject(); // combat effects
  public myLoc$ = new Subject();
  public tour$ = new Subject();
  public marketboardRemove$ = new Subject();

  public currentItemDescription$ = new Subject<string>();
  public currentlySelectedMacro$ = new Subject<Macro>();

  public macroCommand = new Subject<string>();

  public debugFOVHide: boolean;

  private cancelNextAutoAction: boolean;

  public get skillTree$() {
    return this.clientGameState.skillTree$;
  }

  private overrideNoBgm: boolean;
  private overrideNoSfx: boolean;
  private nostalgicBgm: boolean;
  private suppressZero: boolean;
  private suppressOutgoingDot: boolean;
  private autoAttack: boolean;
  private bgmVolume: number;
  private sfxVolume: number;

  public currentViewTarget: any;

  get character() {
    return this.clientGameState.currentPlayer;
  }

  public isLoggingCombat: boolean;
  public combatLogMax: number;
  public combatLogs: any[] = [];

  private loadedCharacterSlot: number;

  public suppressAnimations: boolean;

  private syncedNPCs: boolean;
  private syncedGround: boolean;

  public get isRenderReady(): boolean {
    return this.syncedNPCs && this.syncedGround;
  }

  get isChangingMap() {
    return this.changingMap;
  }

  get inGame() {
    return this._inGame && this.worldRoom && this.clientGameState.map.type;
  }

  constructor(
    private localStorage: LocalStorageService,
    private alert: AlertService
  ) {
    this.overrideNoBgm = !this.localStorage.retrieve('playBackgroundMusic');
    this.overrideNoSfx = !this.localStorage.retrieve('playSoundEffects');
    this.nostalgicBgm = this.localStorage.retrieve('nostalgicBackgroundMusic');
    this.suppressZero = this.localStorage.retrieve('suppressZeroDamage');
    this.suppressAnimations = this.localStorage.retrieve('suppressAnimations');
    this.suppressOutgoingDot = this.localStorage.retrieve('suppressOutgoingDot');
    this.autoAttack = this.localStorage.retrieve('autoAttack');
    this.bgmVolume = this.localStorage.retrieve('bgmVolume');
    this.sfxVolume = this.localStorage.retrieve('sfxVolume');

    this.localStorage.observe('playBackgroundMusic')
      .subscribe(shouldPlayBgm => {
        this.overrideNoBgm = !shouldPlayBgm;
      });

    this.localStorage.observe('nostalgicBackgroundMusic')
      .subscribe(nostalgicBackgroundMusic => {
        this.nostalgicBgm = nostalgicBackgroundMusic;
      });

    this.localStorage.observe('playSoundEffects')
      .subscribe(shouldPlaySfx => {
        this.overrideNoSfx = !shouldPlaySfx;
      });

    this.localStorage.observe('suppressZeroDamage')
      .subscribe(suppressZeroDamage => {
        this.suppressZero = suppressZeroDamage;
      });

    this.localStorage.observe('suppressOutgoingDot')
      .subscribe(suppressOutgoingDot => {
        this.suppressOutgoingDot = suppressOutgoingDot;
      });

    this.localStorage.observe('suppressAnimations')
      .subscribe(suppressAnimations => {
        this.suppressAnimations = suppressAnimations;
      });

    this.localStorage.observe('autoAttack')
      .subscribe(autoAttack => {
        this.autoAttack = autoAttack;
      });

    this.localStorage.observe('bgmVolume')
      .subscribe(bgmVolume => {
        this.bgmVolume = bgmVolume;
      });

    this.localStorage.observe('sfxVolume')
      .subscribe(sfxVolume => {
        this.sfxVolume = sfxVolume;
      });

    this.lastCommands = this.localStorage.retrieve('lastCommands') || [];

    (<any>window).sendCommand = this.sendCommandString.bind(this);

    document.addEventListener('contextmenu', (event) => {
      if(!this._inGame) return;
      event.preventDefault();
      return false;
    });

    this.addAutoAttackLoop();
  }

  init(colyseus, client, character) {
    this.colyseus = colyseus;
    this.client = client;
    this.loadedCharacterSlot = character.charSlot;
    this.setCharacter(character);

    if(!this.clientGameState.currentPlayer) {
      this.alert.alert({
        title: 'Init Error',
        text: 'Your character was not sent by the server in an adequate amount of time. If you see this error, refresh the page and try again.',
        type: 'error'
      });
      return;
    }

    this.initGame();
  }

  private initGame() {
    if(!this.client) throw new Error('Client not intialized; cannot initialize game connection.');

    this.unshowWindows();

    if(!this.character) {
      this.alert.alert({
        title: 'Init Error',
        text: 'Your character is not available when doing init game. If you see this error, refresh the page and try again.',
        type: 'error'
      });
      return;
    }

    this.joinRoom(this.character.map);
  }

  private async joinRoom(room, party?: string) {
    this._joiningGame = true;
    this.currentMap = room;

    this.resetRoom();

    const joinOpts: any = {
      userAgent: navigator.userAgent,
      charSlot: this.character.charSlot,
      username: this.colyseus.username
    };

    if(party) joinOpts.party = party;

    let joinRoom = room;

    if(!party) {
      const promise = new Promise((resolve, reject) => {
        this.client.getAvailableRooms(room, (rooms, err) => {
          if(err) return reject(err);

          let roomId = room;
          if(rooms && rooms.length > 0) roomId = (<any>sortBy(rooms, ['clients', 'maxClients'])).reverse()[0].roomId;

          if(!roomId) roomId = room;

          console.warn(`World room id list`, rooms, '; joining', roomId);
          resolve(roomId);

        });
      });

      try {
        joinRoom = await promise;
      } catch(e) {
        throw new Error('Unable to await joinRoom promise')
      }
    }

    this.worldRoom = this.client.join(joinRoom, joinOpts);

    this.worldRoom.onStateChange.addOnce((state) => {
      this.colyseus.debugGameLogMessage({ CLIENT_INFO: 'INITIAL_STATE_CHANGE' }, 'incoming');
      this.clientGameState.mapName = state.mapName;
      this.clientGameState.grabOldUpdates(state.mapData);

      this.changingMap = false;
    });

    this.worldRoom.onStateChange.add((state) => {
      this.colyseus.debugGameLogMessage({ CLIENT_INFO: 'STATE_CHANGE' }, 'incoming');
      this.clientGameState.setMapData(state.mapData || {});
      this.clientGameState.setPlayers(state.playerHash);
      this.clientGameState.setEnvironmentalObjects(state.environmentalObjects || []);
      this.clientGameState.setDarkness(state.darkness || {});
      this.clientGameState.setNPCVolatile(state.npcVolatile || {});
      this.setCharacter(state.playerHash[this.colyseus.username]);
    });

    this.worldRoom.onMessage.add((data) => {
      this.interceptGameCommand(data);
    });

    const updateSpecificAttr = (attr, change) => {
      this.clientGameState.updatePlayer(change.path.id, attr, change.value);
    };

    const updateAgro = (change) => {
      this.clientGameState.updatePlayerAgro(change.path.id, change.path.player, change.value);
    };

    const updateHP = (change) => {
      this.clientGameState.updatePlayerHP(change.path.id, change.path.key, change.value);
    };

    const updateHand = (hand, change) => {
      this.clientGameState.updatePlayerHand(change.path.id, hand, change.value);
    };

    const updateHandItem = (hand, change) => {
      this.clientGameState.updatePlayerHandItem(change.path.id, hand, change.path.attr, change.value);
    };

    const updateGearItem = (slot, change) => {
      this.clientGameState.updatePlayerGearItem(change.path.id, slot, change.value);
    };

    this.worldRoom.listen('playerHash/:id/x', updateSpecificAttr.bind(this, 'x'));
    this.worldRoom.listen('playerHash/:id/y', updateSpecificAttr.bind(this, 'y'));
    this.worldRoom.listen('playerHash/:id/dir', updateSpecificAttr.bind(this, 'dir'));
    this.worldRoom.listen('playerHash/:id/swimLevel', updateSpecificAttr.bind(this, 'swimLevel'));
    this.worldRoom.listen('playerHash/:id/partyName', updateSpecificAttr.bind(this, 'partyName'));

    this.worldRoom.listen('playerHash/:id/agro/:player', updateAgro);

    this.worldRoom.listen('playerHash/:id/effects/:effect', (change) => {
      this.clientGameState.updatePlayerEffect(change);
    });

    this.worldRoom.listen('playerHash/:id/effects/:effect/:attr', (change) => {
      this.clientGameState.updatePlayerEffect(change);
    });

    this.worldRoom.listen('playerHash/:id/hp/:key', updateHP);

    this.worldRoom.listen('playerHash/:id/leftHand', updateHand.bind(this, 'leftHand'));
    this.worldRoom.listen('playerHash/:id/rightHand', updateHand.bind(this, 'rightHand'));

    this.worldRoom.listen('playerHash/:id/gear/Armor', updateGearItem.bind(this, 'Armor'));
    this.worldRoom.listen('playerHash/:id/gear/Robe1', updateGearItem.bind(this, 'Robe1'));
    this.worldRoom.listen('playerHash/:id/gear/Robe2', updateGearItem.bind(this, 'Robe2'));

    this.worldRoom.listen('playerHash/:id/leftHand/:attr', updateHandItem.bind(this, 'leftHand'));
    this.worldRoom.listen('playerHash/:id/rightHand/:attr', updateHandItem.bind(this, 'rightHand'));

    this.worldRoom.listen('playerHash/:id/leftHand/:attr', updateHandItem.bind(this, 'leftHand'));
    this.worldRoom.listen('playerHash/:id/rightHand/:attr', updateHandItem.bind(this, 'rightHand'));

    this.worldRoom.listen('playerHash/:id/totalStats/stealth', (change) => {
      this.clientGameState.updatePlayerStealth(change.path.id, change.value);
    });

    this.worldRoom.listen('playerHash/:id/totalStats/perception', (change) => {
      this.clientGameState.updatePlayerPerception(change.path.id, change.value);
    });

    const updateDoor = (change) => {
      this.clientGameState.modifyDoor(change);
    };

    this.worldRoom.listen('mapData/openDoors/:id', updateDoor);
    this.worldRoom.listen('mapData/openDoors/:id/isOpen', updateDoor);

    this.worldRoom.onJoin.add(() => {
      this.colyseus.debugGameLogMessage({ CLIENT_INFO: 'JOIN_ROOM', map: room }, 'incoming');
      this.inGame$.next(true);
      this._inGame = true;
      this.clientGameState.hasLoadedInGame = false;

      this.syncedNPCs = false;
      this.syncedGround = false;
      this.clientGameState.hasLoadedInGame = false;
      this.clientGameState.removeAllPlayers();
    });

    this.worldRoom.onLeave.add(() => {
      this.colyseus.debugGameLogMessage({ CLIENT_INFO: 'LEAVE_ROOM', map: room }, 'incoming');
      if(this.changingMap || this.currentMap !== room) return;

      this.inGame$.next(false);
      this._inGame = false;
      this._joiningGame = false;
    });

    this.worldRoom.onError.add((e) => {
      this.colyseus.debugGameLogMessage({ CLIENT_INFO: 'ROOM_ERROR' }, 'incoming');
      this.alert.alert({
        title: 'World Room Error',
        text: JSON.stringify(e),
        type: 'error'
      });

      console.error(e);
      this.clientGameState.hasLoadedInGame = false;
      this.inGame$.next(false);
      this._inGame = false;
      this._joiningGame = false;

    });
  }

  private syncCharacterAttributes(x, y, dir, swimLevel) {
    if(!this.character) return;

    if(dir === 'C') {
      dir = this.character.hp.__current === 0 ? 'C' : 'S';
    }

    this.character.x = x;
    this.character.y = y;
    this.character.dir = dir;
    this.character.swimLevel = swimLevel;

    this.clientGameState.updatePlayer(this.character.username, 'x', x);
    this.clientGameState.updatePlayer(this.character.username, 'y', y);
    this.clientGameState.updatePlayer(this.character.username, 'dir', dir);
    this.clientGameState.updatePlayer(this.character.username, 'swimLevel', swimLevel);

    this.myLoc$.next({ x, y, dir, swimLevel });
  }

  private setCharacter(character) {
    if(this.isQuitting) return;
    if(!character) return;
    if(character.charSlot !== this.loadedCharacterSlot) return;

    const hasOldCharacter = this.character;

    const char = new Player(character);
    char.init();
    this.clientGameState.setPlayer(char);

    if(hasOldCharacter) {
      const { x, y, dir, swimLevel } = hasOldCharacter;
      this.syncCharacterAttributes(x, y, dir, swimLevel);
    } else {
      this.myLoc$.next({ x: this.character.x, y: this.character.y, dir: this.character.dir });
    }

    // set bgm for the game (considering options)
    if(this.overrideNoBgm) {
      this.bgm$.next({ bgm: '', vol: this.bgmVolume });

    } else {
      let bgm = this.character.combatTicks > 0 ? 'combat' : this.character.bgmSetting;
      if(this.nostalgicBgm) {
        bgm = `${bgm}-nostalgia`;
      }

      this.bgm$.next({ bgm: (bgm || '').trim(), volume: this.bgmVolume });
    }

    // update hp/xp/etc for floating boxes
    this.clientGameState.playerBoxes$.next({ newPlayer: this.character, oldPlayer: hasOldCharacter });
  }

  private logMessageBatch(messages: any[]) {
    messages.forEach(msg => this.logMessage(msg));
  }

  private logMessage({ name, message, subClass, grouping, dirFrom, extraData, target, sfx }: any) {
    if(this.suppressOutgoingDot && includes(subClass, 'out-overtime')) return;

    if(!isUndefined(target)) this.setTarget(target);

    const isZero = (includes(message, '[0') && includes(message, 'damage]'))
                || (includes(message, 'misses!'))
                || (includes(message, 'blocked by your'));

    if(isZero && this.suppressZero) return;

    if(!grouping || grouping === 'spell') grouping = 'always';
    this.clientGameState.addLogMessage({ name, message, subClass, grouping, dirFrom });

    if(this.isLoggingCombat && extraData) {
      const { uuid, weapon, damage, monsterName, type } = extraData;
      this.combatLogs.push([uuid, monsterName, weapon, type, damage]);

      if(this.combatLogs.length > this.combatLogMax) {
        this.combatLogs.unshift();
      }
    }

    if(extraData && extraData.skillName) {
      this.gameCommand$.next({ action: 'new_skill_learned', skillName: extraData.skillName, autoLearn: extraData.autoLearn });
    }

    if(!this.overrideNoSfx && sfx) {

      if(this.nostalgicBgm) {
        sfx = `${sfx}-nostalgia`;
      }

      this.sfx$.next({ sfx: (sfx || '').trim(), volume: this.sfxVolume });
    }
  }

  private setTarget(target: string) {
    this.currentTarget = target;
  }

  private interceptGameCommand({ action, error, ...other }) {

    this.colyseus.debugGameLogMessage({ action, error, ...other }, 'incoming');

    if(error) {
      this.alert.alert({ title: other.prettyErrorName, text: other.prettyErrorDesc, type: 'error' });
      return;
    }

    this.gameCommand$.next({ action, ...other });

    if(!isUndefined(other.target))  this.setTarget(other.target);
    if(action === 'draw_effect_r')  return this.drawEffectRadius(other);
    if(action === 'draw_effect_c')  return this.drawCombatEffect(other);
    if(action === 'set_map')        return this.setMap(other.map);
    if(action === 'update_locker')  return this.updateLocker(other.locker);
    if(action === 'show_lockers')   return this.showLockerWindow(other.lockers, other.lockerId);
    if(action === 'show_bank')      return this.showBankWindow(other.uuid, other.bankId, other.banks);
    if(action === 'show_mb')        return this.showMarketBoardWindow(other.uuid, other.mapRegion);
    if(action === 'mb_bought')      return this.resyncMarketboardItems(other.listingId);
    if(action === 'show_shop')      return this.showShopWindow(other.vendorItems, other.uuid, other.vendorCurrency);
    if(action === 'show_trainer')   return this.showTrainerWindow(other.classTrain, other.trainSkills, other.uuid);
    if(action === 'show_ts')        return this.showTradeskillWindow(other.tradeskill, other.uuid);
    if(action === 'show_ground')    return this.showGroundWindow();
    if(action === 'change_map')     return this.changeMap(other.map, other.party);
    if(action === 'log_message')    return this.logMessage(other);
    if(action === 'log_message_b')  return this.logMessageBatch(other.messages);
    if(action === 'set_character')  return this.setCharacter(other.character);
    if(action === 'update_pos')     return this.updatePos(other.x, other.y, other.dir, other.swimLevel, other.fov);
    if(action === 'update_fov')     return this.updateFOV(other.fov);
    if(action === 'toggle_fov')     return this.toggleFOV();
    if(action === 'add_npc')        return this.addNPC(other.npc);
    if(action === 'remove_npc')     return this.removeNPC(other.npcUUID);
    if(action === 'sync_npcs')      return this.syncNPCs(other.npcs);
    if(action === 'add_gitem')      return this.addGroundItem(other.x, other.y, other.item);
    if(action === 'update_gitem')   return this.updateGroundItem(other.x, other.y, other.item);
    if(action === 'remove_gitem')   return this.removeGroundItem(other.x, other.y, other.item);
    if(action === 'sync_ground')    return this.syncGroundItems(other.ground);
    if(action === 'take_tour')      return this.takeTour();
    if(action === 'combat_log')     return this.updateCombatLogRecordingSettings(other);
    if(action === 'skill_tree')     return this.updateSkillTree(other.skillTree);
  }

  private toggleFOV() {
    this.debugFOVHide = !this.debugFOVHide;
  }

  private resyncMarketboardItems(removeListingId: string) {
    this.marketboardRemove$.next(removeListingId);
  }

  private updateSkillTree(skillTree) {
    this.skillTree$.next(new SkillTree(skillTree));
  }

  private updateCombatLogRecordingSettings({ start, logCount, stop, download }: any = {}) {
    if(start) {
      this.combatLogMax = logCount;
      this.combatLogs = [];
      this.isLoggingCombat = true;
    }

    if(stop) {
      this.isLoggingCombat = false;
    }

    if(download) {
      const csv = this.combatLogs.join('\n');
      const csvBlob = new Blob([csv], { type: 'text/plain;charset=utf-8' });
      fileSaver.saveAs(csvBlob, `combat-log-${Date.now()}.csv`);
    }
  }

  private takeTour() {
    this.tour$.next();
  }

  private syncGroundItems(groundItems: any) {
    this.clientGameState.setGroundItems(groundItems);
    this.syncedGround = true;
  }

  private removeGroundItem(x: number, y: number, item: Item) {
    this.clientGameState.removeGroundItem(x, y, item);
  }

  private updateGroundItem(x: number, y: number, item: Item) {
    this.clientGameState.updateGroundItem(x, y, item);
  }

  private addGroundItem(x: number, y: number, item: Item) {
    this.clientGameState.addGroundItem(x, y, item);
  }

  private syncNPCs(npcs) {
    this.clientGameState.setMapNPCs(npcs);
    this.syncedNPCs = true;
  }

  private addNPC(npc) {
    this.clientGameState.addNPC(npc);
  }

  private removeNPC(npcUUID: string) {
    this.clientGameState.removeNPC(npcUUID);
  }

  private drawCombatEffect(data) {
    this.cfx$.next(data);
  }

  private updateFOV(fov) {
    this.clientGameState.setFOV(fov);
  }

  private updatePos(x: number, y: number, dir, swimLevel: number, fov) {
    this.clientGameState.setFOV(fov);
    this.syncCharacterAttributes(x, y, dir, swimLevel);
  }

  private drawEffect(effect: number, tiles: any[]) {
    this.vfx$.next({ effect, tiles });
  }

  private drawEffectRadius({ effect, center, radius }: any) {
    const tiles = [];

    for(let x = center.x - radius; x <= center.x + radius; x++) {
      for(let y = center.y - radius; y <= center.y + radius; y++) {
        tiles.push({ x, y });
      }
    }

    this.drawEffect(effect, tiles);
  }

  private setMap(map: any) {
    this.clientGameState.setMap(map);
  }

  public updateActiveWindowForGameWindow(window: string) {
    setTimeout(() => {
      this.localStorage.store('activeWindow', window);
    });
  }

  private updateLocker(updateLocker: Locker) {
    const locker = find(this.showLocker, { lockerId: updateLocker.lockerId });
    extend(locker, updateLocker);
  }

  private showLockerWindow(lockers, lockerId) {
    this.showLocker = lockers;
    this.updateActiveWindowForGameWindow('locker');
    this.activeLockerNumber = findIndex(lockers, { lockerId });
  }

  private showMarketBoardWindow(uuid, mapRegion) {
    this.showMarketBoard = { uuid, mapRegion };
    this.updateActiveWindowForGameWindow('marketboard');
  }

  private showBankWindow(uuid, bankId, banks) {
    if(!uuid && !bankId && banks) {
      this.showBank.banks = banks;
    } else {
      this.showBank = { uuid, bankId, banks };
    }
    this.updateActiveWindowForGameWindow('bank');
  }

  private showShopWindow(vendorItems, uuid, vendorCurrency) {
    this.showShop = { vendorItems, uuid, vendorCurrency };
    this.updateActiveWindowForGameWindow('shop');
  }

  private showTrainerWindow(classTrain, trainSkills, uuid) {
    this.showTrainer = { classTrain, trainSkills, uuid };
    this.updateActiveWindowForGameWindow('trainer');
  }

  private showTradeskillWindow(tradeskill, uuid) {
    if(!this[`show${tradeskill}`]) return;

    this[`show${tradeskill}`] = { uuid };
    this.updateActiveWindowForGameWindow(`tradeskill${tradeskill}`);
  }

  public assessSkill(skill) {
    if(!skill || !this.showTrainer.uuid) return;
    this.sendCommandString(`${this.showTrainer.uuid}, assess ${skill}`);
  }

  public tryEffectUnapply(effect) {
    this.sendCommandString(`~unapply ${effect.name}`);
  }

  public requestSkillTree() {
    this.sendCommandString(`~skilltree`);
  }

  public train() {
    if(!this.showTrainer.uuid) return;
    this.sendCommandString(`${this.showTrainer.uuid}, train`);
  }

  public ancient() {
    if(!this.showTrainer.uuid) return;
    this.sendCommandString(`${this.showTrainer.uuid}, ancient`);
  }

  public learn() {
    if(!this.showTrainer.uuid) return;
    this.sendCommandString(`${this.showTrainer.uuid}, learn`);
  }

  public join() {
    if(!this.showTrainer.uuid) return;
    this.sendCommandString(`${this.showTrainer.uuid}, join`);
  }

  public withdraw(amount: number) {
    if(!this.showBank.uuid) return;
    this.sendCommandString(`${this.showBank.uuid}, withdraw ${amount}`);
  }

  public deposit(amount: number) {
    if(!this.showBank.uuid) return;
    this.sendCommandString(`${this.showBank.uuid}, deposit ${amount}`);
  }

  private changeMap(map, party) {
    this.changingMap = true;
    this.joinRoom(map, party);
  }

  private showGroundWindow() {
    this.showGround = true;
  }

  private sendAction(data) {
    data.t = Date.now();

    this.colyseus.debugGameLogMessage(data, 'outgoing');

    this.worldRoom.send(data);
  }

  public sendReadyFlag() {
    this.worldRoom.send({ ready: true });
  }

  public sendRawCommand(command: string, args: string) {
    this.sendAction({ command, args });
  }

  private parseCommand(cmd: string) {

    const arr = cmd.split(' ');
    const multiPrefixes = ['party', 'look', 'show', 'climb', 'cast', 'stance', 'powerword', 'art'];

    let argsIndex = 1;

    let command = arr[0];

    if(includes(multiPrefixes, command)) {
      command = `${arr[0]} ${arr[1]}`;
      argsIndex = 2;
    }

    // factor in the space because otherwise indexOf can do funky things.
    const args = arr.length > argsIndex ? cmd.substring(cmd.indexOf(' ' + arr[argsIndex])).trim() : '';

    return [command, args];
  }

  public doCommand(command) {
    if(command === '.') return;
    if(startsWith(command, '~')) return;
    if(this.lastCommands[0] === command) return;

    this.lastCommands.unshift(command);
    if(this.lastCommands.length > 20) this.lastCommands.length = 20;

    // trigger ngx-webstorage writes
    this.localStorage.store('lastCommands', this.lastCommands);
  }

  public sendCommandString(str: string, target?: string, isManual = true) {

    if(isManual) this.cancelNextAutoAction = true;

    // strip the leading # if it exists
    if(str.startsWith('#')) str = str.substring(1);

    str.split(';').forEach(cmd => {
      cmd = cmd.trim();

      let command = '';
      let args = '';

      if(includes(cmd, ',')) {
        command = '~talk';
        args = cmd;
      } else {
        [command, args] = this.parseCommand(cmd);
      }

      if(target) {
        args = `${args} ${target}`;
      }

      const lastCmd = this.lastCommands[0];
      if(cmd === '.' && lastCmd) {
        command = lastCmd.substring(0, lastCmd.indexOf(' '));
        args = lastCmd.substring(lastCmd.indexOf(' ') + 1);
      } else if(!includes(cmd, ', hello')) {
        this.doCommand(`${command.trim()} ${args.trim()}`.trim());
      }

      // format $ outgoing for easier macroing
      if(includes(args, '$')) {
        const splargs = args.trim().split(' ');
        args = splargs.map(x => {
          if(!startsWith(x, '$')) return x;

          const key = `show${capitalize(x.substring(1))}`;
          if(!this[key] || !this[key].uuid) return x;

          return this[key].uuid;
        }).join(' ');
      }

      this.sendAction({ command, args });
    });
  }

  private unshowWindows() {
    this.showTrainer = {};
    this.showShop = {};
    this.showBank = {};
    this.showMarketBoard = {};
    this.showLocker = [];

    VALID_TRADESKILLS.forEach(tradeskill => {
      this[`show${tradeskill}`] = {};
    });
  }

  public doMove(x, y) {
    this.sendAction({ command: '~move', x, y });
    this.unshowWindows();
  }

  public doInteract(x, y) {
    this.sendAction({ command: '~interact', x, y });
  }

  private resetRoom() {
    if(!this.worldRoom) return;

    this.colyseus.debugGameLogMessage({ CLIENT_INFO: 'ROOM_LEAVE_RESET' }, 'incoming');

    try {
      this.worldRoom.leave();

      this.clientGameState.mapchangeReset();
    } catch(e) {}
  }

  public quit() {
    this.clientGameState.currentPlayer = null;
    this.isQuitting = true;

    setTimeout(() => {
      this.unshowWindows();
      this.clientGameState.reset();

      if(this.colyseus) {
        this.colyseus.debugGameLogMessage({ CLIENT_INFO: 'ROOM_LEAVE_QUIT' }, 'incoming');
      }

      this.resetRoom();

      if(this.colyseus && this.colyseus.lobby) {
        this.colyseus.lobby.quit();
        this.isQuitting = false;
      }
    });
  }

  private canMoveBetweenContainers(context: string, choice: string): boolean {
    const contextStr = context.substring(0, 1);
    const choiceStr = choice.substring(0, 1);
    if(contextStr === choiceStr && contextStr !== 'T') return false;

    return true;
  }

  public buildDropAction({ dragData }, choice) {
    const { context, contextSlot, containerUUID, item, isStackableMaterial } = dragData;

    this.buildAction(item, { context, contextSlot, containerUUID, isStackableMaterial }, choice);
  }

  public async buildAction(item, { context, contextSlot, containerUUID, isStackableMaterial }, choice) {
    if(!context) return;

    const contextStr = context.substring(0, 1);
    const choiceStr = choice.substring(0, 1);
    const cmd = `~${contextStr}t${choiceStr}`;

    // tradeskill containers can be dragged around amongst themselves
    if(!this.canMoveBetweenContainers(context, choice)) return;

    let args = '';
    let postargs = '';

    const splitpostargs = choice.split(':');

    // TO a tradeskill container
    if(splitpostargs.length === 3) {
      const [, skill, slot] = splitpostargs;
      if(!this['show' + skill]) return;
      postargs = `${skill.toLowerCase()} ${slot} ${this['show' + skill].uuid}`.trim();
    }

    const splitcontextargs = context.split(':');

    // FROM a tradeskill container
    if(splitcontextargs.length === 2) {
      const [, skill] = splitcontextargs;
      if(!this['show' + skill]) return;
      postargs = `${skill.toLowerCase()} ${contextSlot} ${this['show' + skill].uuid}`.trim();
    }

    // INSIDE a tradeskill container
    if(splitpostargs.length === 3 && splitcontextargs.length === 2) {
      const [, skill1] = splitcontextargs;
      const [, , slot2] = splitpostargs;

      postargs = `${skill1.toLowerCase()} ${contextSlot} ${this['show' + skill1].uuid} ${slot2}`.trim();
    }

    if(context === 'Ground') {
      args = `${item.itemClass} ${item.uuid}`;

    } else if(context === 'GroundGroup') {
      args = `${item.itemClass}`;

    } else if(includes(['Sack', 'Belt', 'Equipment', 'DemiMagicPouch'], context)) {
      args = `${contextSlot}`;

    } else if(context === 'Coin') {

      const result = await (<any>swal)({
        titleText: 'Take Gold From Stash',
        input: 'number',
        inputValue: 1,
        inputAttributes: {
          min: 0,
          max: this.character.currentGold
        },
        showCancelButton: true,
        cancelButtonText: 'Max',
        cancelButtonColor: '#3085d6',
        useRejections: false,
        preConfirm: (val) => {
          return new Promise((resolve, reject) => {
            if(val < 0) return reject('You do not have that much gold!');
            resolve();
          });
        }
      });

      if(result.dismiss) {
        if(result.dismiss === 'cancel') {
          args = '' + this.character.currentGold;
          this.sendRawCommand(cmd, args);
        }
      } else {
        args = '' + Math.round(Math.min(this.character.currentGold, result));
        this.sendRawCommand(cmd, args);
      }

      return;

    } else if(context === 'Merchant') {
      if(choiceStr === 'S' || choiceStr === 'B') {
        const result = await (<any>swal)({
          titleText: 'How Many Items?',
          input: 'number',
          inputValue: 1,
          inputAttributes: {
            min: 0
          },
          showCancelButton: true,
          cancelButtonText: 'Max',
          cancelButtonColor: '#3085d6',
          useRejections: false,
          preConfirm: (val) => {
            return new Promise((resolve, reject) => {
              if(val < 0) return reject('Invalid amount');
              resolve();
            });
          }
        });

        if(result.dismiss) {
          if(result.dismiss === 'cancel') {
            args = `${containerUUID} ${item.uuid} 500`;
            this.sendRawCommand(cmd, args);
          }
        } else {
          args = `${containerUUID} ${item.uuid} ${result}`;
          this.sendRawCommand(cmd, args);
        }

      } else {
        args = `${containerUUID} ${item.uuid} 1`;
        this.sendRawCommand(cmd, args);
      }
      return;
    }

    if(choiceStr === 'M' && this.showShop && includes(['Sack', 'Belt', 'DemiMagicPouch', 'Left', 'Right', 'Potion'], context)) {
      if(!args) {
        args = this.showShop.uuid;
      } else {
        args = `${args} ${this.showShop.uuid}`;
      }
    }

    if(context === 'Obtainagain') {
      args = `${this.showShop.uuid} ${contextSlot}`;
    }

    if(choiceStr === 'W') {
      args = `${args} ${this.showLocker[this.activeLockerNumber].regionId} ${this.showLocker[this.activeLockerNumber].lockerId}`;
    }

    if(context === 'Wardrobe') {
      args = `${contextSlot} ${this.showLocker[this.activeLockerNumber].regionId} ${this.showLocker[this.activeLockerNumber].lockerId}`;
    }

    if(context === 'WardrobeMaterial') {

      if(isStackableMaterial) {
        const result = await (<any>swal)({
          titleText: 'Withdraw How Many?',
          input: 'number',
          inputValue: 1,
          inputAttributes: {
            min: 0
          },
          showCancelButton: true,
          useRejections: false,
          preConfirm: (val) => {
            return new Promise((resolve, reject) => {
              if(val < 0) return reject('Invalid amount');
              resolve();
            });
          }
        });

        if(result <= 0 || result.dismiss) return;

        args = `${contextSlot} ${this.showLocker[this.activeLockerNumber].regionId} ${this.showLocker[this.activeLockerNumber].lockerId} ${result}`;

      } else {
        args = `${contextSlot} ${this.showLocker[this.activeLockerNumber].regionId} ${this.showLocker[this.activeLockerNumber].lockerId} 1`;
      }
    }

    this.sendRawCommand(cmd, `${args.trim()} ${postargs}`.trim());
  }

  public buildUseAction(item: Item, context: string, contextSlot?: string|number) {
    this.sendRawCommand('~use', `${context} ${isNumber(contextSlot) ? contextSlot : -1} ${item.itemClass} ${item.uuid}`);
  }

  public hostilityLevelFor(compare: ICharacter): 'hostile'|'neutral'|'friendly' {
    const me = this.character;
    if(!me) return 'neutral';

    if(me.allegiance === 'GM') return 'neutral';
    if(compare.isNaturalResource) return 'neutral';

    if(me.partyName && me.partyName === (<Player>compare).partyName) return 'neutral';

    if(compare.agro[me.uuid] || me.agro[compare.uuid]) return 'hostile';

    if(me.hasEffect('Disguise') && me.getTotalStat('cha') > compare.getTotalStat('wil')) return 'neutral';

    const hostility = (<INPC>compare).hostility;

    if(!hostility) return 'neutral';

    if(hostility === 'Never') return 'friendly';

    if(hostility === 'Faction') {
      if(me.isHostileTo(compare.allegiance)
      || compare.isHostileTo(me.allegiance)) return 'hostile';
    }

    if(me.allegiance === compare.allegiance) return 'neutral';

    if(hostility === 'Always') return 'hostile';

    if(me.alignment === 'Evil' && compare.alignment === 'Good') return 'hostile';

    return 'neutral';
  }

  public directionTo(char: ICharacter) {
    if(!char) return '';

    const me = this.character;
    if(!me) return '';

    const diffX = char.x - me.x;
    const diffY = char.y - me.y;

    if(diffX < 0 && diffY > 0) return '↙';
    if(diffX > 0 && diffY < 0) return '↗';
    if(diffX > 0 && diffY > 0) return '↘';
    if(diffX < 0 && diffY < 0) return '↖';

    if(diffX > 0)              return '→';
    if(diffY > 0)              return '↓';

    if(diffX < 0)              return '←';
    if(diffY < 0)              return '↑';

    return '✧';
  }

  public distanceTo(char: ICharacter): number {
    const me = this.character;
    return Math.floor(
      Math.sqrt(
        Math.pow(char.x - me.x, 2) +
        Math.pow(char.y - me.y, 2)
      )
    );
  }

  public updateCurrentItemDesc(str: string) {
    this.currentItemDescription$.next(str);
  }

  private addAutoAttackLoop() {
    let currentMacro: any = {};
    this.currentlySelectedMacro$.subscribe(mac => currentMacro = mac);

    this.gameCommand$.subscribe(({ action }) => {
      if(action !== 'tick') return;

      // if no macro, not in game, no target - bail
      if(!currentMacro
      || !this.character
      || !currentMacro.macro
      || !this.inGame
      || !this.currentTarget
      || !this.autoAttack
      || currentMacro.ignoreAutoattackOption) return;

      // allow for interrupting auto attack
      if(this.cancelNextAutoAction) {
        this.cancelNextAutoAction = false;
        return;
      }

      // auto-X based on action speed
      const actSpeed = this.character.getTotalStat('actionSpeed');
      for(let i = 0; i < actSpeed; i++) {
        this.sendCommandString(currentMacro.macro, this.currentTarget, false);
      }
    });
  }
}
