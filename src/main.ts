import "./init";
import * as Turn from "./turn";
import * as Roles from "./roles";
import { findMove } from "./movement";
import { useEnergize } from "./energize";
import { useMerge } from "./abilities";

const start = Date.now();

/* MARK -> ENERGIZE -> MOVE */
// It is better to select energize targets before making movement decisions
// because the engine processes energize() commands before move() commands.

Roles.update();
for (const s of Turn.myUnits.sort((s1, s2) => s2.size - s1.size)) useEnergize(s);
for (const s of Turn.myUnits) findMove(s);
if (base.shape === "circles") {
	for (const s of Turn.myUnits) useMerge(<CircleSpirit>s);
}

/* LOGGING */

Turn.log();
Roles.log();
console.log("Computation Time: " + (Date.now() - start) + "ms");
