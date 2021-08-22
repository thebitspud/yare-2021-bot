import { BOT_VERSION, settings } from "./init";
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
	Utils.nearest(memory.loci.baseToStar, enemyUnits) ??
	Object.values(spirits).filter((s) => !my_spirits.includes(s))[0];

export const vsSquares = enemy_base.shape === "squares";
export const vsTriangles = enemy_base.shape === "triangles";
export const vsCircles = enemy_base.shape === "circles";
export const enemyShapePower = vsSquares ? 0.66 : vsTriangles ? 0.85 : 1;

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

export const enemyScouts = enemyUnits.filter((e) => {
	return Utils.inRange(e, base, 1100) || Utils.inRange(e, memory.myStar, 1200);
});

/* MACRO STRATEGY */

export const enemyAllIn = enemyScouts.length > 0.75 * enemyUnits.length;

export const isAttacking = ["rally", "all-in"].includes(memory.strategy);
export const refuelAtCenter = canRefuelCenter();

export const maxWorkers = getMaxWorkers();
export let idealDefenders = Math.ceil(invaders.threat / (memory.mySize * 10));
if (isAttacking) {
	const allyDist = Utils.dist(nearestScout, enemy_base);
	const enemyDist = Utils.dist(nearestEnemy, base);
	if (allyDist + (vsSquares ? 500 : 250) > enemyDist && enemySupply > 0) {
		idealDefenders += settings.allInGuards * (vsSquares ? 2 : 1);
	}
}
// From experience, a 3 scout start is optimal
// Any lower and you either have idle units or an over-harvesting problem
// Any higher and you hit the 51 supply threshold late
export let idealScouts = 0;
if (mySupply > 51 || !settings.extraScouts) idealScouts = settings.minScouts;
else if (!vsSquares || (tick >= 35 && !enemyAllIn)) {
	idealScouts = Math.ceil(
		Math.max(
			settings.minScouts + myUnits.length / 8,
			(myUnits.length - maxWorkers - idealDefenders) * 0.5
		)
	);
}

const canBeatAll = myCapacity > enemy_base.energy + enemyCapacity * enemyShapePower * 2.5;
const readyToAttack = mySupply >= settings.allInSupply || canBeatAll;

// Starting an attack on the enemy base
if (!isAttacking && readyToAttack) memory.strategy = "rally";

export const rallyStar = memory.allCenter ? memory.centerStar : memory.myStar;
export let rallyPosition = memory.loci.centerToOutpost;
if (enemyOutpost) {
	const range = outpost.energy > 350 ? 625 : 450;
	const towards = Utils.midpoint(base, memory.loci.outpostAntipode);
	rallyPosition = Utils.nextPosition(outpost, towards, range);
}

if (memory.strategy === "rally") {
	const attackers = myUnits.filter((s) => s.mark === "attack");
	if (attackers.length) {
		rallyPosition = Utils.lerp(rallyPosition, Utils.midpoint(...attackers), 0.67);
	}

	let groupedSupply = 0;
	for (const s of myUnits) {
		if (Utils.inRange(s, rallyPosition, 50)) {
			groupedSupply += s.size;
		}
	}

	const centerHasEnergy =
		memory.centerStar.energy > (myCapacity - myEnergy) * (allyOutpost ? 0.5 : 1);
	memory.allCenter =
		centerHasEnergy && (memory.allCenter ? canRefuelCenter() : !enemyOutpost);

	const groupReq =
		groupedSupply >= (mySupply - idealDefenders) * settings.attackGroupSize;
	const starReq = myEnergy / myCapacity >= 0.9 || rallyStar.energy < mySupply / 2;

	// Waiting until enough units have arrived before all-inning
	if (groupReq && starReq) {
		memory.strategy = "all-in";
	}
}

const powerRatio = myEnergy / (enemyEnergy * enemyShapePower);
const shouldRetreat = mySupply < settings.allInSupply / 2 && powerRatio < 0.8;

// Retreating if bot cannot win fight
if (memory.strategy === "all-in" && shouldRetreat) {
	memory.strategy = "economic";
	memory.allCenter = false;
}

// Maintaining an optimal number of workers at all times
function getMaxWorkers(): number {
	const supplyCap = settings.allInSupply;
	// If being all-inned, harvest as much as possible before defending
	if (enemyAllIn || (tick < 30 && vsSquares)) return supplyCap;

	let energyRegenCap = Utils.energyPerTick(memory.myStar);
	const canHarvestCenter = refuelAtCenter && memory.centerStar.energy >= mySupply;

	// Can over-harvest if star has sufficient energy and nearing attack supply
	if (mySupply >= supplyCap - 25 && memory.myStar.energy > 250) energyRegenCap++;
	// Can over-harvest if star is near energy cap and center not available
	if (!canHarvestCenter && mySupply >= supplyCap - 12) return supplyCap;

	if (mySupply < supplyCap - 50) energyRegenCap -= 0.5;

	// Calculate ideal worker count
	const workerEfficiency = 1 / (settings.haulRelayRatio + 1);
	return Math.floor(energyRegenCap / workerEfficiency);
}

function canRefuelCenter() {
	if (memory.centerStar.active_in >= 25) return false;
	if (!enemyOutpost) return true;
	if (outpost.energy > 300) return false;
	const centerThreat =
		enemyShapePower *
		enemyUnits
			.filter((e) => Utils.inRange(e, memory.loci.outpostAntipode))
			.map((e) => e.energy)
			.reduce((acc, n) => acc + n, 0);

	if (!isAttacking) return centerThreat === 0;
	return centerThreat <= (300 - outpost.energy) / 10 + myEnergy * 0.25;
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
