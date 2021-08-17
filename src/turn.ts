import { BOT_VERSION } from "./init";
import * as Utils from "./utils";

/* FRIENDLY UNITS */

export const myUnits = my_spirits.filter((s) => s.hp > 0);

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
export const enemyShapePower = sqrEnemy ? 0.6 : triEnemy ? 0.85 : 1;

/**
 * NOTE: there is no overlap between <near>, <mid>, and <far>
 * Use [...invaders.near, ...invaders.mid, ...invaders.far] for combined list
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
			if (baseDist <= 400 || starDist <= 300) {
				if (baseDist <= 200) {
					// Amount of energy invaders can unload onto base this turn
					// Multiply by 2 for max potential damage
					invaders.supply += Math.min(e.size, e.energy);
				}
				invaders.near.push(e);
			} else invaders.med.push(e);
		} else invaders.far.push(e);

		// Computing an overall invader threat level
		// Scales piecewise from 1.5 at dist <= 200 to 0.833 at dist < 600
		// Then from 0.333 at dist = 600 to 0 at dist = 800
		let baseDistFactor = (1100 - Math.max(Math.min(starDist, baseDist), 200)) / 600;
		if (baseDist > 600) baseDistFactor -= 0.5; // Reducing threat of star-side attackers
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

export const idealDefenders = Math.ceil(invaders.threat / (memory.mySize * 10));
// From experience, a 3 scout start is optimal
// Any lower and you either have idle units or an over-harvesting problem
// Any higher and you hit the 51 supply threshold late
export const idealScouts = 1 + Math.ceil(myUnits.length / 8);
// No need to constrain worker count on a 3 scout start since over-harvesting
// will never become extreme enough to prevent refueling
export const maxWorkers = memory.settings.attackSupply;

export const isAttacking = ["rally", "all-in"].includes(memory.strategy);
const canBeatBase = myEnergy * 2 > enemy_base.energy + enemyBaseSupply;
//const canBeatAll = myCapacity > enemy_base.energy + enemyCapacity * enemyShapePower * 2;
const readyToAttack = mySupply >= memory.settings.attackSupply; // || canBeatAll

export const canHarvestCenter = memory.centerStar.active_in < 25 && !enemyOutpost;

// Starting an attack on the enemy base
if (!isAttacking && readyToAttack && canBeatBase) {
	memory.strategy = "rally";
	const centerHasEnergy = memory.centerStar.energy >= myCapacity - myEnergy;
	memory.allCenter = canHarvestCenter && centerHasEnergy;
}

export const rallyStar = memory.allCenter ? memory.centerStar : memory.myStar;
export const rallyPosition = allyOutpost
	? memory.loci.centerToOutpost
	: Utils.nextPosition(base, memory.loci.outpostAntipode);

if (memory.strategy === "rally") {
	let groupedSupply = 0;
	for (const s of myUnits) {
		if (Utils.dist(s, rallyPosition) <= 100) {
			groupedSupply += s.size;
		}
	}

	// Waiting until enough units have arrived before all-inning
	if (groupedSupply >= (mySupply - idealDefenders) * memory.settings.attackGroupSize) {
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
	console.log(`Strategy:  ${memory.strategy} // Attacking: ${isAttacking}`);
	console.log(
		`${myUnits.length} ${base.shape} vs. ${enemyUnits.length} ${enemy_base.shape}`
	);
	const energyString = `Energy: ${myEnergy}/${myCapacity} vs. ${enemyEnergy}/${enemyCapacity}`;
	console.log(energyString + ` // Power Ratio: ${powerRatio.toFixed(2)}`);
	const invaderCountString = `[${invaders.near.length}/${invaders.med.length}/${invaders.far.length}]`;
	console.log(`Threat: ${invaders.threat.toFixed(2)} from ${invaderCountString} enemies`);
}
