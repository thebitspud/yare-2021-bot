import "./init";
import * as Turn from "./turn";
import * as Roles from "./roles";
import { findMove } from "./movement";
import { pickTarget } from "./energize";

const start = Date.now();

/* MARK -> ENERGIZE -> MOVE */
// It is better to select energize targets before making movement decisions
// because the engine processes energize() commands before move() commands.

Roles.update();
for (const s of Turn.myUnits) pickTarget(s);
for (const s of Turn.myUnits) findMove(s);

/* LOGGING */

Turn.log();
Roles.log();
console.log("Computation Time: " + (Date.now() - start) + "ms");
