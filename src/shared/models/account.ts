import { nonenumerable } from 'nonenumerable';
import { merge, pick } from 'lodash';
import { Status, SubscriptionTier, IAccount } from '../interfaces/account';

export class Account implements IAccount {
  @nonenumerable
  _id?: any;

  // internal stuff
  @nonenumerable
  colyseusId?: string;

  @nonenumerable
  createdAt: number;

  @nonenumerable
  userId: string;

  @nonenumerable
  email: string;

  @nonenumerable
  emailVerified: boolean;

  // lobby display stuff
  username: string;

  isTester = false;

  @nonenumerable
  isGM = false;

  isMuted = false;

  @nonenumerable
  spamMessages = 0;

  @nonenumerable
  lastMessage: number;

  @nonenumerable
  inGame = -1;

  @nonenumerable
  status: Status = 'Available';

  @nonenumerable
  characterNames: string[] = [];

  @nonenumerable
  maxCharacters = 4;

  // subscription
  @nonenumerable
  subscriptionTier: SubscriptionTier = SubscriptionTier.NO_SUBSCRIPTION;

  @nonenumerable
  trialEnds: number;

  @nonenumerable
  hasDoneTrial: boolean;

  @nonenumerable
  silver: number;

  @nonenumerable
  silverPurchases: { [key: string]: number } = {
    MorePotions: 0,
    MoreCharacters: 0,
    BiggerBelt: 0,
    MagicPouch: 0,
    BiggerSack: 0,
    SharedLockers: 0,
    ExpandedStorage: 0
  };

  discordTag: string;
  discordOnline: boolean;

  constructor(opts) {
    merge(this, opts);
  }

  public toSaveObject(): any {
    const baseObj: any = pick(this, [
      'colyseusId', 'createdAt', 'userId', 'email',
      'emailVerified', 'username', 'isGM', 'status', 'isTester',
      'characterNames', 'maxCharacters', 'subscriptionTier', 'trialEnds', 'hasDoneTrial',
      'silver', 'silverPurchases',
      'discordTag', 'discordOnline',
      'isMuted'
    ]);

    // ???
    baseObj.silverPurchases = this.silverPurchases;
    return baseObj;
  }
}
