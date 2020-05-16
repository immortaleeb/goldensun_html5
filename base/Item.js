export const item_types = {
    WEAPONS: "weapons",
    ARMOR: "armor",
    CHEST_PROTECTOR: "chest_protector",
    HEAD_PROTECTOR: "head_protector",
    LEG_PROTECTOR: "leg_protector",
    ABILITY_GRANTOR: "ability_grantor",
    LUCKY_CHARM: "lucky_charm",
    RING: "ring",
    UNDERWEAR: "underwear",
    GENERAL_ITEM: "general_item",
    SHIRT: "shirt"
};

export const use_types = {
    MULTIPLE_USES: "multiple_uses",
    SINGLE_USE: "single_use",
    BREAKS_WHEN_USE: "breaks_when_use",
    NO_USE: "no_use"
}

export class Item {
    constructor(
        name,
        type,
        description,
        use_type,
        curses_when_equipped,
        cant_be_removed,
        rare_item,
        imporant_item,
        carry_up_to_30,
        effects_keys,
        attribute,
        unleash_ability,
        unleash_rate,
        use_ability,
        equipable_chars
    ) {
        this.name = name;
        this.type = type;
        this.description = description;
        this.use_type = use_type;
        this.curses_when_equipped = curses_when_equipped;
        this.cant_be_removed = cant_be_removed;
        this.rare_item = rare_item;
        this.imporant_item = imporant_item;
        this.carry_up_to_30 = carry_up_to_30;
        this.effects_keys = effects_keys;
        this.attribute = attribute;
        this.unleash_ability = unleash_ability;
        this.unleash_rate = unleash_rate;
        this.use_ability = use_ability;
        this.equipable_chars = equipable_chars;
    }
}