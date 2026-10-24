/**
 * Command builders for `POST /packet/execution`.
 *
 * Each command is `{ cmd, args }`; `args` is a positional array (hydra::AttrList), so argument order is
 * what matters. Orders come from the `AttrList::addChild` sequence in each `Command*` constructor of
 * libdc.so. Parameter names are inferred from the C++ signatures and are marked [?] where unsure.
 */

export interface Command {
  readonly cmd: string
  readonly args: readonly unknown[]
}

/** Escape hatch for commands without a typed builder (attack_player, end_attack, set_attack_team...). */
export const rawCommand = (cmd: string, args: readonly unknown[] = []): Command => ({ cmd, args })

const command = (cmd: string, ...args: unknown[]): Command => ({ cmd, args })

export const commands = {
  // Buildings and decorations
  /** `extra` is the 4th int of CommandBuy [?]. */
  buy: (itemId: number, x: number, y: number, extra = 0) => command("buy", itemId, x, y, extra),
  sell: (isoId: number) => command("sell", isoId),
  move: (isoId: number, x: number, y: number, flip: number) => command("move", isoId, x, y, flip),
  upgrade: (isoId: number) => command("upgrade", isoId),
  finishBuilding: (isoId: number) => command("finish_building", isoId),
  collect: (isoId: number, extra?: number) => (extra === undefined ? command("collect", isoId) : command("collect", isoId, extra)),
  speedCollect: (isoId: number) => command("speed_collect", isoId),
  activate: (isoId: number, value: number) => command("activate", isoId, value),
  storeItem: (isoId: number) => command("store_item", isoId),
  /** Eight ints plus a trailing flag, order as in CommandPlaceStoredItem [?: semantics]. */
  placeStoredItem: (p1: number, p2: number, p3: number, p4: number, p5: number, p6: number, p7: number, p8: number, flag = true) =>
    command("place_stored_item", p1, p2, p3, p4, p5, p6, p7, p8, flag),
  sellStoredItem: (p1: number, flag = true) => command("sell_stored_item", p1, flag),
  expandIsland: (p1: number, p2: number) => command("expand_island", p1, p2),
  expand: (currency: "gold" | "cash", p1: number) => command(currency === "gold" ? "expand_gold" : "expand_cash", p1),

  // Dragons and eggs
  buyEgg: (p1: number, p2: number, p3?: number) => (p3 === undefined ? command("buy_egg", p1, p2) : command("buy_egg", p1, p2, p3)),
  buyTreasure: (id: number, p2?: number) => (p2 === undefined ? command("buy_treasure_new", id) : command("buy_treasure_new", id, p2)),
  /** [?: p1..p4 order is firm, meaning is not: likely habitat, dragon A, dragon B, speedup]. */
  breedDragon: (p1: number, p2: number, p3: number, p4: boolean) => command("breed_dragon_2", p1, p2, p3, p4),
  finishBreeding: (p1: number, p2: number, p3: number) => command("finish_breeding_2", p1, p2, p3),
  speedBreeding: (id: number) => command("speed_breeding", id),
  hatchEgg: (p1: number, p2: number, p3: number, name: string) => command("hatch_egg", p1, p2, p3, name),
  speedHatch: (id: number) => command("speed_hatch", id),
  hatchMysteryEgg: (id: number) => command("mistery_egg_hatch", id),
  feedDragon: (dragonId: number) => command("feed_dragon", dragonId),
  renameDragon: (dragonId: number, name: string) => command("rename_dragon", dragonId, name),
  moveDragon: (dragonId: number, habitatId: number) => command("move_dragon", dragonId, habitatId),
  sellDragon: (dragonId: number) => command("sell_dragon", dragonId),
  sellEgg: (eggId: number) => command("sell_egg", eggId),
  placeStoredDragon: (p1: number, p2: number, name: string, p4: number, p5: number) =>
    command("place_stored_dragon", p1, p2, name, p4, p5, true),
  placeStoredEgg: (p1: number, p2: number) => command("place_stored_egg", p1, p2, true),
  sellStoredDragon: (p1: number, p2: number) => command("sell_stored_dragon", p1, p2, true),

  // Training
  startTraining: (p1: number, p2: number, p3: number, p4: number) => command("start_training", p1, p2, p3, p4),
  finishTraining: (id: number) => command("finish_training", id),
  speedTraining: (id: number) => command("speed_training", id),

  // Progression
  levelUp: (level: number) => command("level_up", level),
  completeTutorial: (step: number) => command("complete_tutorial", step),
  completeGoal: (goalId: number) => command("complete_goal", goalId),
  completeCollection: (id: number) => command("complete_collection", id),
  winDailyBonus: (id: number) => command("win_daily_bonus", id),
  hiddenRewardClaim: () => command("hidden_reward_claim"),
  setLoginRewarded: () => command("set_login_rewarded", 2),

  // Social
  assistNeighbor: (neighborId: string, p2: string) => command("assist_neighbor", neighborId, p2),
  cleanReceivedAssists: (id: string) => command("clean_received_assists", id),
  setResourceAllies: (p1: number, fbId: string) => command("set_resource_allies", fbId, p1),

  // Combat
  beginTournament: () => command("begin_tournament"),
} satisfies Record<string, (...args: never[]) => Command>
