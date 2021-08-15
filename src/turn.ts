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

// Not sure whether it's a good idea to account for enemy shape power
// when computing invader threat and outpost enemy power
// TODO: test bot with both settings and then decide
export let outpostEnemyPower = 0;
export let enemyEnergy = 0;
export let enemyCapacity = 0;
export let enemyBaseSupply = 0;

for (const e of enemyUnits) {
	const baseDist = Utils.dist(e, base);
	if (baseDist <= 800) {
		if (baseDist <= 600) {
			if (baseDist <= 400) {
				if (baseDist <= 200) {
					// Amount of energy invaders can unload onto base this turn
					// Multiply by 2 for max potential damage
					invaders.supply += Math.min(e.size, e.energy);
				}
				invaders.near.push(e);
			} else invaders.med.push(e);
		} else invaders.far.push(e);

		// Computing an overall invader threat level
		// baseDistFactor scales according to (1/x)-like pattern
		// from 2.0 at dist <= 300 to 0.106 at dist = 800
		const baseDistFactor = 400 / (Math.max(baseDist, 300) - 140) - 0.5;
		invaders.threat += e.energy * baseDistFactor;
	}

	const outpostDist = Utils.dist(e, outpost);
	if (outpostDist <= 600) {
		// outpostDistFactor scales linearly from 1.25 at dist <= 200 to 0.25 at dist = 600
		const outpostDistFactor = (700 - Math.max(outpostDist, 200)) / 400;
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
export const idealScouts = Math.ceil(3 / memory.mySize) + Math.ceil(myUnits.length / 8);
export const maxWorkers = getMaxWorkers();

function getMaxWorkers(): number {
	let energyRegenCap = Utils.energyPerTick(memory.myStar);
	if (memory.myStar.energy < 500) energyRegenCap--;
	else if (memory.myStar.energy > 900) energyRegenCap++;

	const workerEfficiency = 1 / (memory.settings.haulRelayRatio + 1);
	return Math.floor(energyRegenCap / workerEfficiency);
}

export const isAttacking = ["rally", "all-in"].includes(memory.strategy);
const canBeatBase = myEnergy * 2 > enemy_base.energy + enemyBaseSupply;
const canBeatAll = myCapacity > enemy_base.energy + enemyCapacity * enemyShapePower * 2;
const readyToAttack = mySupply >= memory.settings.attackSupply || canBeatAll;

export const canHarvestCenter = memory.centerStar.energy > 0 && allyOutpost;

// Starting an attack on the enemy base
if (!isAttacking && readyToAttack && canBeatBase) {
	memory.strategy = "rally";
	const centerHasEnergy = memory.centerStar.energy >= myCapacity - myEnergy;
	memory.allCenter = canHarvestCenter && centerHasEnergy;
}

export const rallyStar = memory.allCenter ? memory.centerStar : memory.myStar;
export const rallyPosition = memory.allCenter
	? memory.loci.centerToOutpost
	: Utils.nextPosition(base, memory.loci.outpostAntipode);

if (memory.strategy === "rally") {
	let groupedSupply = 0;
	for (const s of my_spirits) {
		if (Utils.dist(s, rallyPosition) <= 50) {
			groupedSupply += s.size;
		}
	}

	// Waiting until enough units have arrived before all-inning
	if (groupedSupply > (mySupply - idealDefenders) * 0.6) {
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
export const idlePosition =
	enemyOutpost && outpost.energy > 450
		? memory.loci.baseToStar
		: Utils.nextPosition(memory.loci.baseToCenter, memory.myStar);

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
