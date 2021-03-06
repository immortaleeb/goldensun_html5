import * as _ from "lodash";
import {Gamepad} from "../Gamepad";

const DEFAULT_LOOP_TIME = Phaser.Timer.QUARTER >> 1;

export type ControlObj = {
    key: number;
    on_down?: Function;
    on_up?: Function;
    pressed?: boolean;
    loop?: boolean;
    loop_time?: number;
    reset?: boolean;
};

export class ControlManager {
    public game: Phaser.Game;
    public gamepad: Gamepad;

    public disabled: boolean;
    public busy: boolean;

    public keys_list: number[];
    public keys: {[key: number]: ControlObj};

    public signal_bindings: Phaser.SignalBinding[];
    public signal_bindings_key: number;

    public loop_start_timer: Phaser.Timer;
    public loop_repeat_timer: Phaser.Timer;

    public control_queue: {controls: any[]; configs?: any}[];
    public global_bindings: {[key: number]: Phaser.SignalBinding[]};

    constructor(game: Phaser.Game, gamepad: Gamepad) {
        this.game = game;
        this.gamepad = gamepad;

        this.disabled = false;
        this.busy = false;

        this.keys_list = this.gamepad.keys;

        let keys_to_map = [];
        for (let i = 0; i < this.keys_list.length; i++) {
            keys_to_map.push({
                key: this.keys_list[i],
                on_down: null,
                on_up: null,
                pressed: false,
                loop: false,
                loop_time: DEFAULT_LOOP_TIME,
                reset: false,
            });
        }

        this.keys = _.mapKeys(keys_to_map, k => k.key) as {[key: number]: ControlObj};

        this.signal_bindings = [];
        this.signal_bindings_key = null;

        this.control_queue = [];
        this.global_bindings = {};

        this.loop_start_timer = this.game.time.create(false);
        this.loop_repeat_timer = this.game.time.create(false);
    }

    get initialized() {
        return this.signal_bindings.length !== 0;
    }

    get has_next() {
        return this.control_queue.length !== 0;
    }

    simple_input(
        callback: Function,
        params?: {reset_on_press?: boolean; confirm_only?: boolean; persist?: boolean; no_initial_reset?: boolean}
    ) {
        let controls = [
            {key: this.gamepad.A, on_down: callback, reset_control: params ? params.reset_on_press : undefined},
        ];

        if (params) {
            if (!params.confirm_only)
                controls.push({
                    key: this.gamepad.B,
                    on_down: callback,
                    reset_control: params ? params.reset_on_press : undefined,
                });
            return this.set_control(controls, {persist: params.persist, no_reset: params.no_initial_reset});
        } else {
            controls.push({
                key: this.gamepad.B,
                on_down: callback,
                reset_control: params ? params.reset_on_press : undefined,
            });
            return this.set_control(controls);
        }
    }

    set_control(
        controls: {key: number; on_down?: Function; on_up?: Function; params?: {reset_control?: boolean}}[],
        configs?: {
            loop_configs?: {
                vertical?: boolean;
                vertical_time?: number;
                horizontal?: boolean;
                horizontal_time?: number;
                shoulder?: boolean;
                shoulder_time?: number;
            };
            persist?: boolean;
            no_reset?: boolean;
            global_key?: number;
        }
    ) {
        if (this.busy) {
            console.log("ControlManager is busy. Request queued.");
            let global_key = this.make_global_key();

            let new_configs = configs;
            new_configs.global_key = global_key;

            this.control_queue.push({controls: controls, configs: new_configs});
            return global_key;
        } else {
            let disable_reset: boolean = configs ? (configs.no_reset ? configs.no_reset : false) : false;
            if (this.initialized && !disable_reset) this.reset();

            this.busy = true;

            for (let i = 0; i < controls.length; i++) {
                if (controls[i].on_down) this.keys[controls[i].key].on_down = controls[i].on_down;
                if (controls[i].on_up) this.keys[controls[i].key].on_up = controls[i].on_up;
                if (controls[i].params)
                    this.keys[controls[i].key].reset = controls[i].params.reset_control
                        ? controls[i].params.reset_control
                        : false;
            }

            if (configs) {
                this.set_configs(configs);

                let global_key = !configs.global_key ? this.make_global_key() : configs.global_key;
                return this.enable_keys(global_key, configs.persist);
            } else {
                let global_key = this.make_global_key();
                return this.enable_keys(global_key);
            }
        }
    }

    set_configs(configs: any) {
        if (configs.loop_configs) {
            let options = configs.loop_configs;
            let controls = [];

            if (options.vertical) {
                controls.push({key: this.gamepad.UP, loop_time: options.vertical_time});
                controls.push({key: this.gamepad.DOWN, loop_time: options.vertical_time});
            }
            if (options.horizontal) {
                controls.push({key: this.gamepad.LEFT, loop_time: options.horizontal_time});
                controls.push({key: this.gamepad.RIGHT, loop_time: options.horizontal_time});
            }
            if (options.shoulder) {
                controls.push({key: this.gamepad.L, loop_time: options.shoulder_time});
                controls.push({key: this.gamepad.R, loop_time: options.shoulder_time});
            }

            this.enable_loop(controls);
        }
    }

    enable_loop(controls: {key: number; loop_time?: number}[]) {
        controls.forEach(obj => {
            this.keys[obj.key].loop = true;
            if (obj.loop_time) this.keys[obj.key].loop_time = obj.loop_time;
        });
    }

    enable_keys(global_key: number, persist?: boolean) {
        let bindings: Phaser.SignalBinding[] = [];

        for (let i = 0; i < this.keys_list.length; i++) {
            let key_on_down = this.keys[this.keys_list[i]].on_down;
            let key_on_up = this.keys[this.keys_list[i]].on_up;

            if (this.keys[this.keys_list[i]].on_up) {
                let b = this.game.input.keyboard.addKey(this.keys[this.keys_list[i]].key).onUp.add(() => {
                    if (this.disabled) return;
                    key_on_up();
                });
                if (!persist) this.signal_bindings.push(b);
                bindings.push(b);
            }

            if (this.keys[this.keys_list[i]].on_down) {
                let loop_time = this.keys[this.keys_list[i]].loop_time;
                let trigger_reset = this.keys[this.keys_list[i]].reset;

                if (this.keys[this.keys_list[i]].loop) {
                    let b1 = this.game.input.keyboard.addKey(this.keys[this.keys_list[i]].key).onDown.add(() => {
                        if (this.keys[this.gamepad.opposite_key(this.keys_list[i])].pressed) {
                            if (this.disabled) return;

                            this.keys[this.gamepad.opposite_key(this.keys_list[i])].pressed = false;
                            this.stop_timers();
                        }

                        this.keys[this.keys_list[i]].pressed = true;
                        this.set_loop_timers(key_on_down, loop_time);
                    });

                    let b2 = this.game.input.keyboard.addKey(this.keys[this.keys_list[i]].key).onUp.add(() => {
                        if (this.disabled) return;

                        this.keys[this.keys_list[i]].pressed = false;
                        this.stop_timers();
                    });

                    if (!persist) this.signal_bindings.push(b1, b2);
                    bindings.push(b1, b2);
                } else {
                    let b = this.game.input.keyboard.addKey(this.keys[this.keys_list[i]].key).onDown.add(() => {
                        if (this.disabled) return;

                        if (trigger_reset) this.reset();
                        key_on_down();
                    });

                    if (!persist) this.signal_bindings.push(b);
                    bindings.push(b);
                }
            }
        }
        this.reset(false);
        this.busy = false;

        this.global_bindings[global_key] = bindings;
        if (!persist) this.signal_bindings_key = global_key;

        if (this.has_next) {
            console.log("Executing next ControlManager request...");
            let args = this.control_queue.shift();
            this.set_control(args.controls, args.configs);
        } else return global_key;
    }

    set_loop_timers(callback: Function, loop_time: number) {
        callback();

        this.loop_start_timer.add(Phaser.Timer.QUARTER, () => {
            this.loop_repeat_timer.loop(loop_time, callback);
            this.loop_repeat_timer.start();
        });
        this.loop_start_timer.start();
    }

    stop_timers() {
        this.loop_start_timer.stop();
        this.loop_repeat_timer.stop();
    }

    make_global_key() {
        let finished = false;
        let i = 0;

        do {
            if (this.global_bindings[i]) {
                i++;
                continue;
            } else {
                finished = true;
                break;
            }
        } while (!finished);

        this.global_bindings[i] = [new Phaser.SignalBinding(new Phaser.Signal(), () => {}, false)];

        return i;
    }

    detach_bindings(key: number) {
        if (!this.global_bindings[key]) return;

        let bindings = this.global_bindings[key];
        bindings.forEach(bind => bind.detach());

        this.global_bindings[key] = null;
    }

    reset(detach: boolean = true) {
        this.loop_start_timer.stop();
        this.loop_repeat_timer.stop();

        for (let i = 0; i < this.keys_list.length; i++) {
            this.keys[this.keys_list[i]].pressed = false;
            this.keys[this.keys_list[i]].on_down = null;
            this.keys[this.keys_list[i]].on_up = null;
            this.keys[this.keys_list[i]].loop = false;
            this.keys[this.keys_list[i]].loop_time = DEFAULT_LOOP_TIME;
            this.keys[this.keys_list[i]].reset = false;
        }

        if (detach) {
            this.signal_bindings.forEach(signal_binding => {
                signal_binding.detach();
            });
            if (this.signal_bindings_key) this.detach_bindings(this.signal_bindings_key);

            this.signal_bindings_key = null;
            this.signal_bindings = [];
        }
    }
}
