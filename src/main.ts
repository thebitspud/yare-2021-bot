import * as Turn from "./turn";
import { updateRole } from "./roles";
import { moveUnit } from "./movement";
import { energize } from "./energize";

const start = Date.now();

/* MARK, MOVE, ENERGIZE */

let index = 0;
for (const s of Turn.myUnits) {
	updateRole(s, index);
	moveUnit(s, index);
	energize(s);

	index++;
}

console.log("Computation Time: " + (Date.now() - start) + "ms");
