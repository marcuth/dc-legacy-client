/**
 * Buttons of the map menu (`MenuItemInfo`, libdc.so). `MenuItemInfo::create` @0x5c988c switches on the type and sets a
 * title and an icon; each building state builds its own list (`getMenuButtons`, `getDefaultMenuItems`...).
 */
export enum MenuItemType {
    Move = 0,
    Info = 1,
    SpeedUpBreeding = 2,
    TakeEgg = 3,
    SpeedUpObstacle = 4,
    SpeedUpGrowFood = 5,
    Combat = 6,
    Recruit = 7,
    Train = 8,
    GrowFood = 9,
    Breed = 10,
    BuyEgg = 12,
    Clear = 16,
    Shop = 17,
    DragonMarket = 18,
    Goals = 21,
    Upgrade = 22,
    CollectGold = 23,
    CollectFood = 24,
    Ok = 25,
    Cancel = 26,
    Menu = 27,
    Battle = 28,
    Back = 30,
    SpeedUpTraining = 31,
}

export type MenuItem = { title: string; icon: string }

/** Title (an English key of the locale tables) and icon of each type, as `MenuItemInfo::create` sets them. */
export const MENU_ITEMS: Record<MenuItemType, MenuItem> = {
    [MenuItemType.Move]: { title: "MOVE", icon: "Icons/MapButtons/ic-move.png" },
    [MenuItemType.Info]: { title: "INFO", icon: "Icons/MapButtons/ic-info.png" },
    [MenuItemType.SpeedUpBreeding]: { title: "SPEED UP", icon: "Icons/MapButtons/ic-breed-speedup.png" },
    [MenuItemType.TakeEgg]: { title: "TAKE EGG", icon: "Icons/MapButtons/ic-breed-finish.png" },
    [MenuItemType.SpeedUpObstacle]: { title: "SPEED UP", icon: "Icons/MapButtons/ic-obstacle-speedup.png" },
    [MenuItemType.SpeedUpGrowFood]: { title: "SPEED UP", icon: "Icons/MapButtons/ic-speedup-growfood.png" },
    [MenuItemType.Combat]: { title: "COMBAT", icon: "Icons/MapButtons/ic-tournament.png" },
    [MenuItemType.Recruit]: { title: "RECRUIT", icon: "Icons/MapButtons/ic-recruitment.png" },
    [MenuItemType.Train]: { title: "TRAIN", icon: "Icons/MapButtons/ic-train.png" },
    [MenuItemType.GrowFood]: { title: "GROW FOOD", icon: "Icons/MapButtons/ic-grow-food.png" },
    [MenuItemType.Breed]: { title: "BREED", icon: "Icons/MapButtons/ic-heart-breed.png" },
    [MenuItemType.BuyEgg]: { title: "BUY EGG", icon: "Icons/MapButtons/ic-buyegg.png" },
    [MenuItemType.Clear]: { title: "CLEAR", icon: "Icons/MapButtons/ic-shovel.png" },
    [MenuItemType.Shop]: { title: "SHOP", icon: "Icons/MapButtons/ic-market.png" },
    [MenuItemType.DragonMarket]: { title: "DRAGON MARKET", icon: "Icons/MapButtons/ic-dragon-market.png" },
    [MenuItemType.Goals]: { title: "GOALS", icon: "Icons/MapButtons/ic-goals.png" },
    [MenuItemType.Upgrade]: { title: "UPGRADE", icon: "Icons/MapButtons/ic-upgrade.png" },
    [MenuItemType.CollectGold]: { title: "COLLECT", icon: "Icons/MapButtons/ic-collect-gold.png" },
    [MenuItemType.CollectFood]: { title: "COLLECT", icon: "Icons/MapButtons/ic-grow-food.png" },
    [MenuItemType.Ok]: { title: "OK", icon: "Icons/MapButtons/ic-ok.png" },
    [MenuItemType.Cancel]: { title: "CANCEL", icon: "Icons/MapButtons/ic-cancel.png" },
    [MenuItemType.Menu]: { title: "MENU", icon: "Icons/MapButtons/ic-menu.png" },
    [MenuItemType.Battle]: { title: "BATTLE", icon: "Icons/MapButtons/ic-versus.png" },
    [MenuItemType.Back]: { title: "BACK", icon: "Icons/MapButtons/ic-gohome.png" },
    [MenuItemType.SpeedUpTraining]: { title: "SPEED UP", icon: "Icons/MapButtons/ic-train-speedup.png" },
}

/** What the player is doing with a building, which decides its buttons. */
export type BuildingState = "idle" | "finished" | "working"

/**
 * The buttons of a building, in the order the original builds them (`*States::getDefaultMenuItems` and
 * `getMenuButtons`): every building gets MOVE and INFO; farms, habitats and the hatchery add UPGRADE; the state adds
 * its own action (BREED, TRAIN, GROW FOOD, COLLECT...). Habitats add BUY EGG when a dragon type can be bought [?].
 */
export const menuItemsFor = (group: string | undefined, state: BuildingState = "idle"): MenuItemType[] => {
    const items = [MenuItemType.Move, MenuItemType.Info]
    switch (group) {
        case "farm":
            items.push(MenuItemType.Upgrade)
            if (state === "idle") items.push(MenuItemType.GrowFood)
            if (state === "finished") items.push(MenuItemType.CollectFood)
            break
        case "habitat":
            items.push(MenuItemType.Upgrade, MenuItemType.BuyEgg)
            break
        case "incubator":
            items.push(MenuItemType.Upgrade)
            break
        case "breeding":
            if (state === "idle") items.push(MenuItemType.Breed)
            if (state === "finished") items.push(MenuItemType.TakeEgg)
            break
        case "training":
            if (state === "idle") items.push(MenuItemType.Train)
            break
        case "dragon_market":
            items.push(MenuItemType.DragonMarket)
            break
        default:
            break
    }
    return items
}
