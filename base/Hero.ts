import {ControllableChar} from "./ControllableChar";
import * as numbers from "./magic_numbers";
import {TileEvent, event_types} from "./tile_events/TileEvent";
import {get_transition_directions, range_360, directions, base_actions} from "./utils";
import {normal_push} from "./interactable_objects/push";
import {Map} from "./Map";
import {ClimbEvent} from "./tile_events/ClimbEvent";
import {Collision} from "./Collision";

export class Hero extends ControllableChar {
    private static readonly SPEED_LIMIT_TO_STOP = 13;
    private static readonly SPEED_LIMIT_TO_STOP_WORLD_MAP = 9;
    private static readonly MINIMAL_SLOPE = 0.1;

    //ROTATION_KEY can convert from pressed_keys to the corresponding in-game rotation
    private static readonly ROTATION_KEY = [
        null, //no keys pressed
        directions.right, //right
        directions.left, //left
        null, //right and left
        directions.up, //up
        directions.up_right, //up and right
        directions.up_left, //up and left
        null, //up, left, and right
        directions.down, //down
        directions.down_right, //down and right
        directions.down_left, //down and left
        null, //down, left, and right
        null, //down and up
        null, //down, up, and right
        null, //down, up, and left
        null, //down, up, left, and right
    ];

    //ROTATION_NORMAL converts from normal_angle region (floor((angle-15)/30)) to in-game rotation
    private static readonly ROTATION_NORMAL = [
        directions.right, //345-15 degrees
        directions.up_right, //15-45 degrees
        directions.up_right, //45-75 degrees
        directions.up, //75-105 degrees
        directions.up_left, //105-135 degrees
        directions.up_left, //135-165 degrees
        directions.left, //165-195 degrees
        directions.down_left, //195-225 degrees
        directions.down_left, //225-255 degrees
        directions.down, //255-285 degrees
        directions.down_right, //285-315 degrees
        directions.down_right, //315-345 degrees
    ];

    private static readonly SPEEDS = {
        [directions.right]: {x: 1, y: 0},
        [directions.left]: {x: -1, y: 0},
        [directions.up]: {x: 0, y: -1},
        [directions.up_right]: {x: numbers.INV_SQRT2, y: -numbers.INV_SQRT2},
        [directions.up_left]: {x: -numbers.INV_SQRT2, y: -numbers.INV_SQRT2},
        [directions.down]: {x: 0, y: 1},
        [directions.down_right]: {x: numbers.INV_SQRT2, y: numbers.INV_SQRT2},
        [directions.down_left]: {x: -numbers.INV_SQRT2, y: numbers.INV_SQRT2},
    };

    private arrow_inputs: number;
    private force_diagonal_speed: {x: number; y: number} = {x: 0, y: 0};

    constructor(
        game,
        data,
        key_name,
        initial_x,
        initial_y,
        initial_action,
        initial_direction,
        walk_speed,
        dash_speed,
        climb_speed
    ) {
        super(
            game,
            data,
            key_name,
            initial_x,
            initial_y,
            initial_action,
            initial_direction,
            true,
            walk_speed,
            dash_speed,
            climb_speed
        );
        this.arrow_inputs = null;
    }

    check_control_inputs() {
        this.arrow_inputs =
            (1 * +this.game.input.keyboard.isDown(this.data.gamepad.RIGHT)) |
            (2 * +this.game.input.keyboard.isDown(this.data.gamepad.LEFT)) |
            (4 * +this.game.input.keyboard.isDown(this.data.gamepad.UP)) |
            (8 * +this.game.input.keyboard.isDown(this.data.gamepad.DOWN));
        this.required_direction = Hero.ROTATION_KEY[this.arrow_inputs];

        this.dashing = this.game.input.keyboard.isDown(this.data.gamepad.B);
    }

    set_speed_factors(check_on_event: boolean = false) {
        if (check_on_event && this.data.tile_event_manager.on_event) return;
        let desired_direction = Hero.ROTATION_KEY[this.arrow_inputs];
        if (this.climbing) {
            if (desired_direction === null) {
                this.x_speed = this.y_speed = 0;
                this.idle_climbing = true;
            } else {
                if ((desired_direction & 1) === 1) {
                    //transforms diagonal movements in non-diagonal
                    --desired_direction;
                }
                this.set_direction(desired_direction);
                this.idle_climbing = false;
                this.x_speed = Hero.SPEEDS[desired_direction].x;
                this.y_speed = Hero.SPEEDS[desired_direction].y;
            }
        } else {
            //when force_direction is true, it means that the hero is going to face a different direction from the one specified in the keyboard arrows
            if (desired_direction !== null || this.force_direction) {
                if (!this.force_direction) {
                    this.current_direction = desired_direction;
                    if (this.game.time.frames & 1) {
                        //char turn time frame rate
                        this.desired_direction = get_transition_directions(this.desired_direction, desired_direction);
                    }
                } else {
                    desired_direction = this.current_direction;
                }
                if (this.force_direction && (this.current_direction & 1) === 1) {
                    this.x_speed = this.force_diagonal_speed.x;
                    this.y_speed = this.force_diagonal_speed.y;
                } else {
                    this.x_speed = Hero.SPEEDS[desired_direction].x;
                    this.y_speed = Hero.SPEEDS[desired_direction].y;
                }
            } else {
                this.x_speed = this.y_speed = 0;
            }
        }
    }

    check_interactable_objects(map: Map, contact: p2.ContactEquation) {
        let j = 0;
        for (j = 0; j < map.interactable_objects.length; ++j) {
            //check if hero is colliding with any interactable object
            const interactable_object_body = map.interactable_objects[j].sprite.body;
            if (!interactable_object_body) continue;
            if (contact.bodyA === interactable_object_body.data || contact.bodyB === interactable_object_body.data) {
                if (contact.bodyA === this.sprite.body.data || contact.bodyB === this.sprite.body.data) {
                    const interactable_object = map.interactable_objects[j];
                    if (
                        [base_actions.WALK, base_actions.DASH].includes(this.current_action as base_actions) &&
                        this.data.map.collision_layer === interactable_object.base_collision_layer
                    ) {
                        this.trying_to_push = true;
                        if (this.push_timer === null) {
                            this.trying_to_push_direction = this.current_direction;
                            const events_in_pos =
                                map.events[TileEvent.get_location_key(this.tile_x_pos, this.tile_y_pos)];
                            let has_stair = false;
                            if (events_in_pos) {
                                events_in_pos.forEach(event => {
                                    if (
                                        event.type === event_types.CLIMB &&
                                        (event as ClimbEvent).is_set &&
                                        event.activation_directions.includes(this.trying_to_push_direction)
                                    ) {
                                        has_stair = true;
                                        return;
                                    }
                                });
                            }
                            if (!has_stair) {
                                let item_position = interactable_object.get_current_position(map);
                                switch (this.trying_to_push_direction) {
                                    case directions.up:
                                        item_position.y -= 1;
                                        break;
                                    case directions.down:
                                        item_position.y += 1;
                                        break;
                                    case directions.left:
                                        item_position.x -= 1;
                                        break;
                                    case directions.right:
                                        item_position.x += 1;
                                        break;
                                }
                                if (interactable_object.position_allowed(item_position.x, item_position.y)) {
                                    this.push_timer = this.game.time.events.add(
                                        Phaser.Timer.QUARTER,
                                        normal_push.bind(this, this.game, this.data, interactable_object)
                                    );
                                }
                            }
                        }
                        break;
                    }
                }
            }
        }
        if (j === map.interactable_objects.length) {
            this.trying_to_push = false;
        }
    }

    collision_dealer(map: Map) {
        let normals = [];
        for (let i = 0; i < this.game.physics.p2.world.narrowphase.contactEquations.length; ++i) {
            const contact = this.game.physics.p2.world.narrowphase.contactEquations[i];
            if (contact.bodyA === this.sprite.body.data) {
                //check if hero collided with something
                normals.push(contact.normalA); //collision normals (one normal for each contact point)
            }
            this.check_interactable_objects(map, contact);
        }
        //normals having length, means that a collision is happening
        if (
            normals.length &&
            [base_actions.WALK, base_actions.DASH, base_actions.CLIMB].includes(this.current_action as base_actions)
        ) {
            const speed_limit = this.data.map.is_world_map
                ? Hero.SPEED_LIMIT_TO_STOP_WORLD_MAP
                : Hero.SPEED_LIMIT_TO_STOP;
            if (
                Math.abs(this.sprite.body.velocity.x) < speed_limit &&
                Math.abs(this.sprite.body.velocity.y) < speed_limit
            ) {
                //speeds below SPEED_LIMIT_TO_STOP are not considered
                let contact_point_directions = new Array(normals.length); // a contact point direction is the opposite direction of the contact normal vector
                normals.forEach((normal, index) => {
                    //slopes outside the MINIMAL_SLOPE range will be desconsidered
                    if (Math.abs(normal[0]) < Hero.MINIMAL_SLOPE) normal[0] = 0;
                    if (Math.abs(normal[1]) < Hero.MINIMAL_SLOPE) normal[1] = 0;
                    if (Math.abs(normal[0]) > 1 - Hero.MINIMAL_SLOPE) normal[0] = Math.sign(normal[0]);
                    if (Math.abs(normal[1]) > 1 - Hero.MINIMAL_SLOPE) normal[1] = Math.sign(normal[1]);
                    contact_point_directions[index] = range_360(Math.atan2(normal[1], -normal[0])); //storing the angle as if it is in the 1st quadrant
                });
                const desired_direction = range_360(
                    Math.atan2(-this.sprite.body.velocity.temp_y, this.sprite.body.velocity.temp_x)
                ); //storing the angle as if it is in the 1st quadrant
                contact_point_directions.forEach(direction => {
                    //check if the desired direction is going towards at least one contact direction with a error margin of 30 degrees
                    if (
                        direction >= desired_direction - numbers.degree15 &&
                        direction <= desired_direction + numbers.degree15
                    ) {
                        //if true, it means that the hero is going the in the direction of the collision obejct, then it must stop
                        this.sprite.body.velocity.temp_x = 0;
                        this.sprite.body.velocity.temp_y = 0;
                        return;
                    }
                });
                this.stop_by_colliding = true;
                this.force_direction = false;
            } else if (this.current_action !== base_actions.CLIMB) {
                this.stop_by_colliding = false;
                if (normals.length === 1) {
                    //everything inside this if is to deal with direction changing when colliding
                    //finds which 30 degree sector the normal angle lies within, and converts to a direction
                    const normal = normals[0];
                    const wall_direction =
                        Hero.ROTATION_NORMAL[
                            (range_360(Math.atan2(normal[1], -normal[0]) + numbers.degree15) / numbers.degree30) | 0
                        ];
                    const relative_direction = (Hero.ROTATION_KEY[this.arrow_inputs] - wall_direction) & 7;
                    //if player's direction is within 1 of wall_direction
                    if (relative_direction === 1 || relative_direction === 7) {
                        this.force_direction = true;
                        const direction = (wall_direction + (relative_direction << 1)) & 7;
                        if ((direction & 1) === 1) {
                            //adapting the velocity to the contact slope
                            const going_up = (direction >> 1) & 2;
                            const is_ccw = going_up ? normal[0] >= 0 : normal[0] < 0;
                            //rotates normal vector 90deg
                            this.force_diagonal_speed.x = is_ccw ? normal[1] : -normal[1];
                            this.force_diagonal_speed.y = is_ccw ? -normal[0] : normal[0];
                        }
                        this.set_direction(direction);
                    } else {
                        this.force_direction = false;
                    }
                } else {
                    this.force_direction = false;
                }
            } else {
                this.stop_by_colliding = false;
            }
        } else {
            this.stop_by_colliding = false;
            this.force_direction = false;
        }
        this.apply_speed();
    }

    update(map: Map) {
        this.check_control_inputs(); //check which arrow keys are being pressed
        this.set_speed_factors(true); //sets the direction of the movement
        this.set_current_action(); //chooses which sprite the hero shall assume
        this.calculate_speed(); //calculates the final speed
        this.collision_dealer(map); //check if the hero is colliding and its consequences
        this.set_action(true); //sets the hero sprite
        this.update_shadow(); //updates the hero's shadow position
        this.update_half_crop(); //halves the hero texture if needed
    }

    config_body(collision_obj: Collision, body_radius: number = numbers.HERO_BODY_RADIUS) {
        this.game.physics.p2.enable(this.sprite, false);
        this.reset_anchor(); //Important to be after the previous command
        this.sprite.body.clearShapes();
        this.body_radius = body_radius;
        this.sprite.body.setCircle(this.body_radius, 0, 0);
        this.sprite.body.setCollisionGroup(collision_obj.hero_collision_group);
        this.sprite.body.mass = 1.0;
        this.sprite.body.damping = 0;
        this.sprite.body.angularDamping = 0;
        this.sprite.body.inertia = 0;
        this.sprite.body.setZeroRotation();
        this.sprite.body.fixedRotation = true;
    }
}
