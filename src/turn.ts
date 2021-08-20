import { BOT_VERSION } from "./init";
import * as Utils from "./utils";

/* FRIENDLY UNITS */

// Sort spirits by ascending size -> descending energy
export const myUnits = my_spirits
	.filter((s) => s.hp > 0)
	.sort((s1, s2) => s2.energy - s1.energy)
	.sort((s1, s2) => s1.size - s2.size);
export const nearestScout = Utils.nearest(enemy_base, myUnits) ?? my_spirits[0];

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
export const nearestEnemy =
	Utils.nearest(base, enemyUnits) ??
	Object.values(spirits).filter((s) => !my_spirits.includes(s))[0];

export const vsSquares = enemy_base.shape === "squares";
export const vsTriangles = enemy_base.shape === "triangles";
export const enemyShapePower = vsSquares ? 0.7 : vsTriangles ? 0.85 : 1;

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

let enemySupply = 0;
export let outpostEnemyPower = 0;
export let enemyEnergy = 0;
export let enemyCapacity = 0;
export let enemyBaseDefense = 0;

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
		let baseDistFactor = (1100 - Math.max(Math.min(starDist, baseDist), 200)) / 600;
		if (baseDist > 600) baseDistFactor *= vsSquares ? 0.67 : 0.33;
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
		enemyBaseDefense += Math.min(e.size, e.energy);
	}

	enemyEnergy += e.energy;
	enemyCapacity += e.energy_capacity;
	enemySupply += e.size;
}

/* MACRO STRATEGY */

export const enemyScouts = enemyUnits.filter((e) => {
	return Utils.inRange(e, base, 1000) || Utils.inRange(e, memory.myStar, 1000);
});
export const enemyAllIn = enemyScouts.length > 0.75 * enemyUnits.length;

export const isAttacking = ["rally", "all-in"].includes(memory.strategy);
export const refuelAtCenter =
	memory.centerStar.active_in < 25 && (!enemyOutpost || outpost.energy < 300);

export const maxWorkers = getMaxWorkers();
export let idealDefenders = Math.ceil(invaders.threat / (memory.mySize * 10));
if (isAttacking) idealDefenders += vsSquares ? 5 : 3;
idealDefenders = Math.min(idealDefenders, Math.floor(enemySupply * enemyShapePower));
// From experience, a 3 scout start is optimal
// Any lower and you either have idle units or an over-harvesting problem
// Any higher and you hit the 51 supply threshold late
export let idealScouts = 0;
if (!vsSquares || (tick >= 50 && !enemyAllIn)) {
	idealScouts = Math.ceil(
		Math.max(1 + myUnits.length / 8, (myUnits.length - maxWorkers - idealDefenders) / 2)
	);
}

const canBeatAll = myCapacity > enemy_base.energy + enemyCapacity * enemyShapePower * 2.5;
const readyToAttack = mySupply >= memory.settings.attackSupply || canBeatAll;

// Starting an attack on the enemy base
if (!isAttacking && readyToAttack) memory.strategy = "rally";

export const rallyStar = memory.allCenter ? memory.centerStar : memory.myStar;
export const rallyPosition = allyOutpost
	? memory.loci.centerToOutpost
	: Utils.nextPosition(
			outpost,
			Utils.midpoint(base, memory.loci.outpostAntipode),
			outpost.energy > 350 ? 625 : 450
	  );

if (memory.strategy === "rally") {
	let groupedSupply = 0;
	for (const s of myUnits) {
		if (Utils.inRange(s, rallyPosition, 40)) {
			groupedSupply += s.size;
		}
	}

	if (!memory.allCenter) {
		const centerHasEnergy =
			memory.centerStar.energy > (myCapacity - myEnergy) * (allyOutpost ? 0.5 : 1);
		memory.allCenter = refuelAtCenter && centerHasEnergy;
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
const shouldRetreat = mySupply < memory.settings.attackSupply / 2 && powerRatio < 0.8;

// Retreating if bot cannot win fight
if (memory.strategy === "all-in" && shouldRetreat) {
	memory.strategy = "economic";
	memory.allCenter = false;
}

// Maintaining an optimal number of workers at all times
function getMaxWorkers(): number {
	// If being all-inned, harvest as much as possible before defending
	if (enemyAllIn) return memory.settings.attackSupply;

	// If very close to being able to attack, worker limit is removed
	let supplyRatio = mySupply / memory.settings.attackSupply;
	if (supplyRatio >= 0.75) return memory.settings.attackSupply;

	// Can over-harvest if star is near energy cap
	// Or after hitting certain supply thresholds
	let energyRegenCap = Utils.energyPerTick(memory.myStar);
	if (memory.myStar.energy > 975) energyRegenCap++;
	if (supplyRatio >= 0.5) energyRegenCap++;

	// Calculate ideal worker count
	const workerEfficiency = 1 / (memory.settings.haulRelayRatio + 1);
	return Math.floor(energyRegenCap / workerEfficiency);
}

/** Logs turn data once per tick */
export function log() {
	console.log(`${this_player_id} // ${BOT_VERSION} // Turn ${tick}`);
	console.log(`Strategy:  ${memory.strategy}`);
	console.log(`Attacking: ${isAttacking} // Enemy All-in: ${enemyAllIn}`);
	const myUnitText = `${myUnits.length} (${mySupply}) ${base.shape}`;
	const enemyUnitText = `${enemyUnits.length} (${enemySupply}) ${enemy_base.shape}`;
	console.log(`${myUnitText} vs. ${enemyUnitText}`);
	const energyText = `Energy: ${myEnergy}/${myCapacity} vs. ${enemyEnergy}/${enemyCapacity}`;
	console.log(energyText + ` // Power Ratio: ${powerRatio.toFixed(2)}`);
	const invaderCountText = `[${invaders.near.length}/${invaders.med.length}/${invaders.far.length}]`;
	console.log(`Threat: ${invaders.threat.toFixed(2)} from ${invaderCountText} enemies`);
}
