import {Ability} from "./Ability";
import {Item} from "./Item";
import {effect_type_stat, main_stats, permanent_status, Player, temporary_status} from "./Player";
import {variation, elements} from "./utils";
import * as _ from "lodash";

export enum effect_types {
    MAX_HP = "max_hp",
    MAX_PP = "max_pp",
    ATTACK = "attack",
    DEFENSE = "defense",
    AGILITY = "agility",
    LUCK = "luck",
    POWER = "power",
    RESIST = "resist",
    CURRENT_HP = "current_hp",
    CURRENT_PP = "current_pp",
    HP_RECOVERY = "hp_recovery",
    PP_RECOVERY = "pp_recovery",
    CRITICALS = "criticals",
    COUNTER_STRIKE = "counter_strike",
    TEMPORARY_STATUS = "temporary_status",
    PERMANENT_STATUS = "permanent_status",
    TURNS = "turns",
    ENCOUNTERS = "encounters",
    FLEE = "flee",
    END_THE_ROUND = "end_the_round",
    ABILITY_POWER = "ability_power",
    SET_DJINN = "set_djinn",
    DAMAGE_MODIFIER = "damage_modifier",
    DAMAGE_INPUT = "damage_input",
}

export const effect_names: {[effect_type in effect_types]?: string} = {
    [effect_types.MAX_HP]: "HP",
    [effect_types.MAX_PP]: "PP",
    [effect_types.ATTACK]: "Attack",
    [effect_types.DEFENSE]: "Defense",
    [effect_types.AGILITY]: "Agility",
    [effect_types.LUCK]: "Luck",
    [effect_types.POWER]: "Power",
    [effect_types.RESIST]: "Resist",
};

export enum effect_operators {
    PLUS = "plus",
    MINUS = "minus",
    TIMES = "times",
    DIVIDE = "divide",
}

export enum effect_usages {
    NOT_APPLY = "not_apply",
    ON_USE = "on_use",
    ON_TAKE = "on_take",
    BATTLE_ROUND_START = "battle_round_start",
    BATTLE_ROUND_END = "battle_round_end",
    PLAYER_TURN_START = "player_turn_start",
    PLAYER_TURN_END = "player_turn_end",
}

export const effect_msg = {
    aura: target => `A protective aura encircles ${target.name}!`,
    double: () => `And it got doubled!`,
};

export class Effect {
    public type: effect_types;
    public quantity: number;
    public operator: effect_operators;
    public effect_owner_instance: Ability | Item;
    public quantity_is_absolute: boolean;
    public rate: number;
    public chance: number;
    public attribute: elements;
    public add_status: boolean;
    public status_key_name: permanent_status | temporary_status;
    public turns_quantity: number;
    public turn_count: number;
    public variation_on_final_result: boolean;
    public damage_formula_key_name: string;
    public usage: string;
    public on_caster: boolean;
    public relative_to_property: string;
    public effect_msg: string;
    public show_msg: boolean;
    public char: Player;
    public sub_effect: {
        type: effect_types;
        quantity_is_absolute: boolean;
        rate: number;
        chance: number;
        attribute: elements;
        variation_on_final_result: boolean;
        usage: string;
        on_caster: boolean;
        operator: effect_operators;
    };

    constructor(
        type,
        quantity,
        operator,
        effect_owner_instance,
        quantity_is_absolute, //default: false
        rate, //default: 1.0
        chance, //default: 1.0
        attribute, //default: no_element
        add_status, //boolean. If false, remove status
        status_key_name,
        turns_quantity,
        variation_on_final_result,
        damage_formula_key_name, //instead of using the operator, uses a damage formula. Return value is not used.
        usage,
        on_caster, //boolean. default false. If true, the caster will take the effect.
        relative_to_property, //make the calculation based on a player property
        sub_effect,
        effect_msg,
        show_msg,
        char
    ) {
        this.type = type;
        this.quantity = quantity;
        this.operator = operator;
        this.effect_owner_instance = effect_owner_instance;
        this.quantity_is_absolute = quantity_is_absolute === undefined ? false : quantity_is_absolute;
        this.rate = rate === undefined ? 1.0 : rate;
        this.chance = chance === undefined ? 1.0 : chance;
        this.attribute = attribute === undefined ? elements.NO_ELEMENT : attribute;
        this.add_status = add_status;
        this.status_key_name = status_key_name;
        this.turns_quantity = turns_quantity;
        this.turn_count = turns_quantity;
        this.variation_on_final_result = variation_on_final_result === undefined ? false : variation_on_final_result;
        this.damage_formula_key_name = damage_formula_key_name;
        this.usage = usage === undefined ? effect_usages.NOT_APPLY : usage;
        this.on_caster = on_caster === undefined ? false : on_caster;
        this.relative_to_property = relative_to_property;
        this.effect_msg = effect_msg;
        this.show_msg = show_msg === undefined ? true : show_msg;
        this.char = char;
        this.sub_effect = sub_effect;
        if (this.sub_effect !== undefined) {
            this.init_sub_effect();
        }
    }

    static apply_operator(a: number, b: number, operator: effect_operators) {
        switch (operator) {
            case effect_operators.PLUS:
                return a + b;
            case effect_operators.MINUS:
                return a - b;
            case effect_operators.TIMES:
                return a * b;
            case effect_operators.DIVIDE:
                return a / b;
        }
    }

    init_sub_effect() {
        this.sub_effect.quantity_is_absolute =
            this.sub_effect.quantity_is_absolute === undefined ? false : this.sub_effect.quantity_is_absolute;
        this.sub_effect.rate = this.sub_effect.rate === undefined ? 1.0 : this.sub_effect.rate;
        this.sub_effect.chance = this.sub_effect.chance === undefined ? 1.0 : this.sub_effect.chance;
        this.sub_effect.attribute =
            this.sub_effect.attribute === undefined ? elements.NO_ELEMENT : this.sub_effect.attribute;
        this.sub_effect.variation_on_final_result =
            this.sub_effect.variation_on_final_result === undefined ? false : this.sub_effect.variation_on_final_result;
        this.sub_effect.usage = this.sub_effect.usage === undefined ? effect_usages.NOT_APPLY : this.sub_effect.usage;
        this.sub_effect.on_caster = this.sub_effect.on_caster === undefined ? false : this.sub_effect.on_caster;
    }

    apply_general_value(property: string, direct_value?: number, element?: elements) {
        let char = this.char;
        if (element !== undefined) {
            char = this.char[this.relative_to_property !== undefined ? this.relative_to_property : property];
            property = element;
        }
        const before_value = property !== undefined ? char[property] : direct_value;
        if (Math.random() >= this.chance) {
            return {
                before: before_value,
                after: before_value,
            };
        }
        let after_value;
        const quantity = Array.isArray(this.quantity) ? _.random(this.quantity[0], this.quantity[1]) : this.quantity;
        if (this.quantity_is_absolute) {
            if (property !== undefined) {
                char[property] = quantity;
            }
            after_value = quantity;
        } else {
            let value = quantity;
            value *= this.rate;
            if (this.variation_on_final_result) {
                value += variation();
            }
            let value_to_use;
            if (property !== undefined) {
                value_to_use = char[property];
            } else {
                value_to_use = direct_value;
            }
            const result = Effect.apply_operator(value_to_use, value, this.operator) | 0;
            if (property !== undefined) {
                char[property] = result;
            }
            after_value = result;
        }
        return {
            before: before_value,
            after: after_value,
        };
    }

    apply_subeffect(property: string, value: number) {
        if (Math.random() < this.sub_effect.chance) {
            if (this.sub_effect.quantity_is_absolute) {
                this.char[property] = value;
            } else {
                value *= this.sub_effect.rate;
                if (this.sub_effect.variation_on_final_result) {
                    value += variation();
                }
                this.char[property] = Effect.apply_operator(this.char[property], value, this.sub_effect.operator) | 0;
            }
        }
        return this.char[property];
    }

    static preview_value_applied(effect_obj, base_value) {
        if (effect_obj.quantity_is_absolute) {
            return effect_obj.quantity;
        } else {
            let value = effect_obj.quantity;
            if (!effect_obj.rate) {
                effect_obj.rate = 1.0;
            }
            value *= effect_obj.rate;
            value = value | 0;
            return Effect.apply_operator(base_value, value, effect_obj.operator);
        }
    }

    check_caps(current_prop, max_prop, min_value, result_obj) {
        if (this.char[current_prop] > this.char[max_prop]) {
            if (result_obj) {
                result_obj.after = this.char[max_prop];
            }
            this.char[current_prop] = this.char[max_prop];
        } else if (this.char[current_prop] < min_value) {
            if (result_obj) {
                result_obj.after = min_value;
            }
            this.char[current_prop] = min_value;
        }
    }

    apply_effect(direct_value?) {
        switch (this.type) {
            case effect_types.MAX_HP:
            case effect_types.MAX_PP:
            case effect_types.ATTACK:
            case effect_types.DEFENSE:
            case effect_types.AGILITY:
            case effect_types.LUCK:
                return this.apply_general_value(effect_type_stat[this.type]);
            case effect_types.HP_RECOVERY:
                return this.apply_general_value("hp_recovery");
            case effect_types.PP_RECOVERY:
                return this.apply_general_value("pp_recovery");
            case effect_types.CURRENT_HP:
                const result_current_hp = this.apply_general_value(main_stats.CURRENT_HP);
                this.check_caps(main_stats.CURRENT_HP, main_stats.MAX_HP, 0, result_current_hp);
                return result_current_hp;
            case effect_types.CURRENT_PP:
                const result_current_pp = this.apply_general_value(main_stats.CURRENT_PP);
                this.check_caps(main_stats.CURRENT_PP, main_stats.MAX_PP, 0, result_current_pp);
                return result_current_pp;
            case effect_types.POWER:
                return this.apply_general_value("current_power", undefined, this.attribute);
            case effect_types.RESIST:
                return this.apply_general_value("current_resist", undefined, this.attribute);
            case effect_types.TURNS:
                this.turn_count = 1;
                return this.apply_general_value("turns");
            case effect_types.PERMANENT_STATUS:
                if (this.add_status) {
                    this.char.add_permanent_status(this.status_key_name as permanent_status);
                } else {
                    this.char.remove_permanent_status(this.status_key_name as permanent_status);
                }
                return;
            case effect_types.TEMPORARY_STATUS:
                if (this.add_status) {
                    this.char.add_temporary_status(this.status_key_name as temporary_status);
                } else {
                    this.char.remove_temporary_status(this.status_key_name as temporary_status);
                }
                return;
            case effect_types.DAMAGE_MODIFIER:
                return this.apply_general_value(undefined, direct_value);
            case effect_types.DAMAGE_INPUT:
                let result = this.apply_general_value(undefined, direct_value);
                const stat = effect_type_stat[this.sub_effect.type];
                result.before = this.char[stat];
                result.after = this.apply_subeffect(stat, result.after);
                switch (this.sub_effect.type) {
                    case effect_types.CURRENT_HP:
                        this.check_caps(main_stats.CURRENT_HP, main_stats.MAX_HP, 0, result);
                        break;
                    case effect_types.CURRENT_PP:
                        this.check_caps(main_stats.CURRENT_PP, main_stats.MAX_PP, 0, result);
                        break;
                }
                return result;
        }
    }
}
