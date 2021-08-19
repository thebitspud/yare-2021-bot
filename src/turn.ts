import { BOT_VERSION } from "./init";
import * as Utils from "./utils";

/* FRIENDLY UNITS */

export const myUnits = my_spirits
	.filter((s) => s.hp > 0)
	.sort((s1, s2) => s2.energy - s1.energy);

export let myEnergy = 0;
export let myCapacity = 0;
export let mySupply = 0;

for (const s of myUnits) {
	if (!s.mark) s.mark = "idle";
	myEnergy += s.energy;
	myCapacity += s.energy_capacity;
	mySupply += s.size;
}

export const allyOutpost = outpost.control === this_player_id;
export const enemyOutpost = outpost.control !== this_player_id && outpost.energy > 0;

/* ENEMY UNITS */

export const enemyUnits = Object.values(spirits).filter(
	(s) => s.hp > 0 && !myUnits.includes(s)
);

export const sqrEnemy = enemy_base.shape === "squares";
export const triEnemy = enemy_base.shape === "triangles";
export const enemyShapePower = sqrEnemy ? 0.7 : triEnemy ? 0.85 : 1;

/**
 * NOTE: All units in <near> are also in <med> and <far>
 * All units in <med> are also in <far>
 */
export const invaders: {
	near: Spirit[];
	med: Spirit[];
	far: Spirit[];
	threat: number;
	supply: number;
} = {
	near: [],
	med: [],
	far: [],
	threat: 0,
	supply: 0,
};

export let outpostEnemyPower = 0;
export let enemyEnergy = 0;
export let enemyCapacity = 0;
export let enemyBaseSupply = 0;

for (const e of enemyUnits) {
	const baseDist = Utils.dist(e, base);
	const starDist = Utils.dist(e, memory.myStar);
	if (baseDist <= 800 || starDist <= 800) {
		if (baseDist <= 600 || starDist <= 600) {
			if (baseDist <= 400 || starDist <= 400) {
				if (baseDist <= 200) {
					// Amount of energy invaders can unload onto base this turn
					// Multiply by 2 for max potential damage
					invaders.supply += Math.min(e.size, e.energy);
				}
				invaders.near.push(e);
			}
			invaders.med.push(e);
		}
		invaders.far.push(e);

		// Computing an overall invader threat level
		let baseDistFactor =
			(1100 - Math.max(Math.min(starDist * 1.25, baseDist), 200)) / 600;
		if (baseDist > 600) baseDistFactor *= sqrEnemy ? 0.75 : 0.5;
		invaders.threat += e.energy * baseDistFactor;
	}

	const outpostDist = Utils.dist(e, outpost);
	if (outpostDist <= 600) {
		// Scales linearly from 1.25 at dist <= 200 to 0.583 at dist = 600
		const outpostDistFactor = (950 - Math.max(outpostDist, 200)) / 600;
		outpostEnemyPower += e.energy * outpostDistFactor;
	}

	// Checking how much enemy units can heal the enemy base for
	if (Utils.inRange(e, enemy_base)) {
		enemyBaseSupply += Math.min(e.size, e.energy);
	}

	enemyEnergy += e.energy;
	enemyCapacity += e.energy_capacity;
}

/* MACRO STRATEGY */

export const enemyScouts = enemyUnits.filter((e) => {
	return Utils.inRange(e, base, 1000) || Utils.inRange(e, memory.myStar, 1000);
});
export const enemyAllIn = enemyScouts.length >= 0.75 * enemyUnits.length;

export const idealDefenders = Math.ceil(invaders.threat / (memory.mySize * 10));
// From experience, a 3 scout start is optimal
// Any lower and you either have idle units or an over-harvesting problem
// Any higher and you hit the 51 supply threshold late
export let idealScouts = 0;
if (!sqrEnemy || (tick >= 50 && !enemyAllIn)) idealScouts = 1 + myUnits.length / 8;
if (sqrEnemy && memory.myStar.energy < 250 && tick >= 50) idealScouts *= 1.25;
idealScouts = Math.ceil(idealScouts);
// No need to constrain worker count on a 3 scout start since over-harvesting
// will never become extreme enough to prevent refueling
export const maxWorkers = memory.settings.attackSupply;

const canBeatBase = myEnergy * 2 > enemy_base.energy + enemyBaseSupply;
const canBeatAll = myCapacity > enemy_base.energy + enemyCapacity * enemyShapePower * 2.5;
const readyToAttack = mySupply >= memory.settings.attackSupply || canBeatAll;

export const canHarvestCenter = memory.centerStar.active_in < 25 && !enemyOutpost;
export const isAttacking = ["rally", "all-in"].includes(memory.strategy);

// Starting an attack on the enemy base
if (!isAttacking && readyToAttack && canBeatBase) memory.strategy = "rally";

export const rallyStar = memory.allCenter ? memory.centerStar : memory.myStar;
export const rallyPosition = allyOutpost
	? memory.loci.centerToOutpost
	: Utils.nextPosition(base, memory.loci.outpostAntipode, 150);

if (memory.strategy === "rally") {
	let groupedSupply = 0;
	for (const s of myUnits) {
		if (Utils.inRange(s, rallyPosition, 20)) {
			groupedSupply += s.size;
		}
	}

	if (!memory.allCenter) {
		const centerHasEnergy = memory.centerStar.energy * 0.75 > myCapacity - myEnergy;
		memory.allCenter = canHarvestCenter && centerHasEnergy;
	}

	const groupReq =
		groupedSupply >= (mySupply - idealDefenders) * memory.settings.attackGroupSize;
	const starReq = myEnergy / myCapacity >= 0.9 || rallyStar.energy < mySupply / 2;

	// Waiting until enough units have arrived before all-inning
	if (groupReq && starReq) {
		memory.strategy = "all-in";
	}
}

const powerRatio = myEnergy / (enemyEnergy * enemyShapePower);

// Retreating if bot cannot win fight
if (memory.strategy === "all-in" && !canBeatBase && powerRatio < 1) {
	memory.strategy = "economic";
	memory.allCenter = false;
}

// Stay away from the outpost
export const idlePosition = Utils.nextPosition(
	outpost,
	Utils.midpoint(base, memory.myStar),
	enemyOutpost && outpost.energy > 450 ? 650 : 500
);

/** Logs turn data once per tick */
export function log() {
	console.log(`${this_player_id} // ${BOT_VERSION} // Turn ${tick}`);
	console.log(`Strategy:  ${memory.strategy} // Harvest Center: ${canHarvestCenter}`);
	console.log(`Attacking: ${isAttacking} // Enemy Attacking: ${enemyAllIn}`);
	console.log(
		`${myUnits.length} ${base.shape} vs. ${enemyUnits.length} ${enemy_base.shape}`
	);
	const energyString = `Energy: ${myEnergy}/${myCapacity} vs. ${enemyEnergy}/${enemyCapacity}`;
	console.log(energyString + ` // Power Ratio: ${powerRatio.toFixed(2)}`);
	const invaderCountString = `[${invaders.near.length}/${invaders.med.length}/${invaders.far.length}]`;
	console.log(`Threat: ${invaders.threat.toFixed(2)} from ${invaderCountString} enemies`);
}
