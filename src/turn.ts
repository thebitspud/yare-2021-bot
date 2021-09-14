import { BOT_VERSION, settings } from "./init";
import * as Utils from "./utils";

export const enemy_spirits = Object.values(spirits).filter(
	(s) => !my_spirits.includes(s)
);

/* ALLY UNITS */

// Sort spirits by ascending size -> descending energy
export const myUnits = my_spirits
	.filter((s) => s.hp > 0)
	.sort((s1, s2) => s2.energy - s1.energy)
	.sort((s1, s2) => s1.size - s2.size);
export const blockerScout =
	Utils.nearest(memory.loci.enemyBaseAntipode, myUnits) ?? my_spirits[0];

export let myEnergy = 0;
export let myCapacity = 0;
export let mySupply = 0;

for (const s of myUnits) {
	if (!s.mark) s.mark = "idle";
	myEnergy += s.energy;
	myCapacity += s.energy_capacity;
	mySupply += s.size;
}

/* ENEMY UNITS */

export const enemyUnits = enemy_spirits.filter((e) => e.hp > 0);
export const targetEnemy =
	Utils.nearest(memory.loci.baseToStar, enemyUnits) ?? enemy_spirits[0];

export const vsSquares = enemy_base.shape === "squares";
export const vsTriangles = enemy_base.shape === "triangles";
export const enemyShapePower = vsSquares ? 0.7 : vsTriangles ? 0.85 : 1;

/**
 * NOTE: All units in <near> are also in <med> and <far>
 * All units in <med> are also in <far>
 */
export const invaders = {
	near: [] as Spirit[],
	med: [] as Spirit[],
	far: [] as Spirit[],
	threat: 0,
	supply: 0,
};

let enemySupply = 0;
export let outpostEnemyPower = 0;
export let enemyRetakePower = 0;
export let enemyEnergy = 0;
export let enemyCapacity = 0;
export let enemyBaseDefense = 0;
export let enemyScoutPower = 0;
export let enemyScouts: Spirit[] = [];

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
		if (baseDist > 600) baseDistFactor *= vsSquares ? 0.5 : 0.33;
		invaders.threat += Math.max(e.size, e.energy) * baseDistFactor;
	}

	// Computing variables to determine enemy strength near the outpost
	const outpostDist = Utils.dist(e, outpost);
	if (outpostDist <= 600) {
		if (outpostDist < 400) enemyRetakePower += e.energy;
		const outpostDistFactor = (900 - Math.max(outpostDist, 200)) / 600;
		outpostEnemyPower += e.energy * outpostDistFactor;
	}

	// Checking how much enemy units can heal the enemy base for
	if (Utils.inRange(e, enemy_base)) {
		enemyBaseDefense += Math.min(e.size, e.energy);
	}

	// Checking if the enemy is headed towards my side of the map
	if (Utils.inRange(e, base, 1100) || Utils.inRange(e, memory.myStar, 1200)) {
		enemyScouts.push(e);
		enemyScoutPower += e.energy * enemyShapePower;
	}

	enemyEnergy += e.energy;
	enemyCapacity += e.energy_capacity;
	enemySupply += e.size;
}

/* MACRO STRATEGY */

export const allyOutpost = outpost.control === this_player_id;
export const enemyOutpost = outpost.control !== this_player_id && outpost.energy > 0;
export const enemyAllIn = enemyScouts.length > 0.75 * enemyUnits.length;
export const fastSqrRush = enemyAllIn && vsSquares && tick < 100;
export let isAttacking = ["rally", "retake", "all-in"].includes(memory.strategy);
export const refuelAtCenter = canRefuelCenter();

export const maxWorkers = getMaxWorkers();
export let idealDefenders = getIdealDefenders();
export let idealScouts = getIdealScouts();
export let mustMerge: CircleSpirit[] = [];

const sendScout = settings.extraScouts || settings.minScouts;
if (tick > (vsSquares ? 50 : 30) && !enemyOutpost && sendScout) idealScouts++;
const powerRatio = myEnergy / (enemyEnergy * enemyShapePower);
const shouldRetake = shouldRetakeOutpost() && mySupply >= settings.retakeSupply;
const shouldAllIn =
	mySupply >= settings.allInSupply ||
	myCapacity > enemy_base.energy * 0.75 + enemyCapacity * enemyShapePower * 2.5;
const readyToAttack = shouldRetake || shouldAllIn;
if (isAttacking) updateAttackStatus();

// Starting an attack on the enemy base or outpost
if (!isAttacking && readyToAttack) {
	memory.strategy = "rally";
	memory.retakeActive = shouldRetake;
}

// If rallying, find best star to refuel from
if (memory.strategy === "rally") {
	const centerHasEnergy =
		memory.centerStar.energy > (myCapacity - myEnergy) * (allyOutpost ? 0.5 : 0.75);
	memory.refuelCenter =
		centerHasEnergy && (memory.refuelCenter ? refuelAtCenter : !enemyOutpost);
}

export const rallyStar = memory.refuelCenter ? memory.centerStar : memory.myStar;
export let rallyPoint = enemyOutpost
	? memory.retakeActive
		? Utils.lerp(Utils.lerp(memory.myStar, base), outpost)
		: Utils.nextPosition(outpost, memory.loci.outpostAntipode, 425)
	: memory.loci.centerToOutpost;
updateRallyPoint();

export let doConverge = false;

// Determining whether the bot is ready to attack
if (memory.strategy === "rally") {
	const attackers = myUnits.filter((s) => ["attack", "refuel"].includes(s.mark));
	if (attackers.length && rallyPoint !== memory.loci.centerToOutpost) {
		rallyPoint = Utils.lerp(rallyPoint, Utils.midpoint(...attackers));
		updateRallyPoint();
	}

	// Computing aggregate attacker stats
	let groupedSupply = 0;
	let attackSupply = 0;
	let attackEnergy = 0;
	let attackCapacity = 0;
	for (const s of attackers) {
		attackSupply += s.size;
		attackEnergy += s.energy;
		attackCapacity += s.energy_capacity;
		if (Utils.inRange(s, rallyPoint, 20)) {
			groupedSupply += s.size;
		}
	}

	if (attackEnergy / attackCapacity < 0.5) {
		// Never force group if attackers low on energy
		memory.forceGroup = false;
	} else {
		memory.forceGroup = memory.forceGroup
			? // If already grouping, return if star now has enough energy for all
			  rallyStar.energy < attackCapacity - attackEnergy
			: // Otherwise, force group if star is drained
			  rallyStar.energy < 10;
	}

	const groupSize = shouldRetake ? settings.retakeGroupSize : settings.allInGroupSize;
	const groupReq = groupedSupply > attackSupply * groupSize;
	const rallyInRange = Utils.inRange(rallyStar, rallyPoint);
	const starReq =
		attackEnergy / attackCapacity > 0.9 || rallyStar.energy < 10 || !rallyInRange;

	// Waiting until units are grouped and ready before issuing the final attack order
	if (starReq && groupReq) {
		memory.retakeActive = shouldRetake;
		memory.strategy = memory.retakeActive ? "retake" : "all-in";
		// Do one final grouping action when ready
		rallyPoint = Utils.midpoint(...attackers);
		doConverge = true;
	}
}

isAttacking = ["rally", "retake", "all-in"].includes(memory.strategy);

/* HELPER FUNCTIONS */

/** Returns the optimal number of workers based on the current game state */
function getMaxWorkers(): number {
	const supplyCap = shouldRetakeOutpost() ? settings.retakeSupply : settings.allInSupply;
	// If being all-inned, harvest as much as possible before defending
	if (enemyAllIn || (tick < 30 && vsSquares)) return supplyCap;

	let energyRegenCap = Utils.energyPerTick(memory.myStar);
	const canHarvestCenter = refuelAtCenter && memory.centerStar.energy >= mySupply;

	const newUnitCost =
		(supplyCap - mySupply) * (base.current_spirit_cost - memory.mySize * 10);
	const vacantCapacity = myCapacity - myEnergy;
	const canHarvestAll = memory.myStar.energy > (newUnitCost + vacantCapacity) * 0.67;
	// Harvesting restriction is completely removed if star can fully energize all units
	if (canHarvestAll && !canHarvestCenter) return supplyCap;

	// If far away from being able to attack, let star grow a bit
	if (mySupply < supplyCap - 25 && memory.myStar.energy < 900) energyRegenCap -= 1;

	// Can over-harvest if star has sufficient energy and nearing attack supply
	if (memory.myStar.energy > (supplyCap - mySupply) * 10) energyRegenCap += 1;
	if (memory.myStar.energy > (supplyCap - mySupply) * 20) energyRegenCap += 1;
	if (mySupply >= supplyCap - 12 && !canHarvestCenter) energyRegenCap += 2;

	// Calculate ideal worker count
	const workerEfficiency = 1 / (settings.haulRelayRatio + 1);
	return Math.floor(energyRegenCap / workerEfficiency);
}

/** Returns the optimal number of defenders based on current game state */
function getIdealDefenders(): number {
	let defenders = invaders.threat / (memory.mySize * 10);

	// Assigning additional defenders when attacking to prevent counter-attacks
	if (isAttacking && enemySupply > 0) {
		const distBuffer = (allyOutpost ? 100 : 250) + (vsSquares ? 250 : 0);
		const allyDist = Utils.dist(Utils.midpoint(...myUnits), enemy_base);
		const enemyDist = Utils.dist(Utils.nearest(base, enemyUnits), base);
		if (allyDist + distBuffer > enemyDist) defenders += settings.minAttackGuards;
	}

	return Math.ceil(defenders);
}

/** Returns the optimal number of scouts based on current game state */
function getIdealScouts(): number {
	if (vsSquares) {
		if (enemyAllIn || tick < 30) return 0;
		if (enemyOutpost) return settings.minScouts;
	}
	if (!settings.extraScouts) return settings.minScouts;

	// Using various methods to compute a good scout count
	const fromTotalUnits = Math.max(settings.minScouts, mySupply / 8 - 2);

	const idleCount = myUnits.length - maxWorkers - idealDefenders;
	const allScouts = !enemyOutpost && enemyRetakePower > outpost.energy / 2;
	const fromIdleUnits = idleCount * (allScouts ? 1 : 0.5);

	const enemyThreat = (outpostEnemyPower - outpost.energy / 2) * enemyShapePower;
	let fromEnemyPower = enemyThreat / (memory.mySize * 10);
	if (enemyOutpost || fromEnemyPower >= mySupply * settings.maxContestRatio)
		fromEnemyPower = 0;

	// Returning the calculation that results in the best scout count
	return Math.ceil(Math.max(fromTotalUnits, fromIdleUnits, fromEnemyPower));
}

/** Returns whether the bot should attempt to retake an enemy outpost */
function shouldRetakeOutpost(): boolean {
	if (!enemyOutpost) return false;
	if (!settings.doRetakes) return false;

	// Don't attempt retake if it is likely to fail
	const enemyDefendPower =
		((enemyCapacity + outpostEnemyPower * 1.25) / 2) * enemyShapePower;
	const enemyDefense = 20 + outpost.energy / 2 + enemyDefendPower;
	if (myCapacity <= enemyDefense) return false;

	// Attempt retake if center star has enough energy to be worth contesting
	return memory.centerStar.energy > 25 + enemyDefense / 4;
}

/** Returns whether idle and refueling units can energize from the center star */
function canRefuelCenter(): boolean {
	if (memory.centerStar.active_in >= 25) return false;
	if (memory.centerStar.energy < 5) return false;
	if (!enemyOutpost) return true;
	if (outpost.energy > 300) return false;

	// Computing the power of enemy units that may attempt to stop harvesters
	const centerThreat =
		enemyShapePower *
		enemyUnits
			.filter((e) => {
				const checkPoint = Utils.nextPosition(memory.loci.outpostAntipode, base);
				return (
					Utils.inRange(e, memory.loci.outpostAntipode, 220) ||
					Utils.inRange(e, checkPoint, 240)
				);
			})
			.map((e) => e.energy)
			.reduce((acc, n) => acc + n, 0);

	if (!isAttacking) return centerThreat === 0;
	let energyThreshold = (300 - outpost.energy) / 10;
	if (memory.strategy === "all-in") energyThreshold += myEnergy * 0.25;
	return centerThreat <= energyThreshold;
}

/** Keep rallyPoint outside of hostile outpost */
function updateRallyPoint() {
	if (enemyOutpost) {
		const range = outpost.energy >= 400 ? 620 : 420;
		if (Utils.inRange(rallyPoint, outpost, range))
			rallyPoint = Utils.nextPosition(outpost, rallyPoint, range);
	}
}

/** Ends attacks or swaps objectives according to the game's macro state */
function updateAttackStatus(): void {
	if (memory.strategy === "all-in") {
		const capacityRatio = myCapacity / (enemyCapacity * enemyShapePower);
		// Retreat if bot can no longer win
		if (powerRatio < 0.5 && capacityRatio < 1) return retreat();
	} else if (memory.strategy === "retake") {
		// End retake if outpost has been secured
		if (allyOutpost && outpost.energy > memory.centerStar.energy / 2) return endRetake();
		// End retake if star is drained
		if (allyOutpost && memory.centerStar.energy < mySupply / 2) return endRetake();
		// Retreat if enemy can locally overwhelm friendly units
		if (enemyRetakePower * enemyShapePower * 0.75 > myEnergy) return retreat();
	}
}

/** Recall all units if the current battle cannot be won */
function retreat(): void {
	memory.retakeActive = false;
	memory.strategy = "economic";
	memory.refuelCenter = false;
	memory.forceGroup = false;
}

/** Finish the outpost retake and attacking if friendly units still have advantage */
function endRetake(): void {
	const powerReq =
		myCapacity > enemy_base.energy / 2 + enemyCapacity * enemyShapePower * 1.2;
	const starReq = memory.centerStar.energy * 0.8 >= myCapacity - myEnergy;
	const supplyReq = mySupply >= settings.allInSupply * 0.8 || shouldAllIn;
	const keepAttacking = powerReq && starReq && supplyReq;

	memory.retakeActive = false;
	memory.strategy = keepAttacking ? "rally" : "economic";
	memory.refuelCenter = keepAttacking;
	memory.forceGroup = keepAttacking;
}

/** Logs turn data once per tick */
export function log(): void {
	console.log(`${this_player_id} // ${BOT_VERSION} // Turn ${tick}`);
	console.log(`Strategy:  ${memory.strategy} // Enemy All-in: ${enemyAllIn}`);
	console.log(`Attacking: ${isAttacking} // Force Group: ${memory.forceGroup}`);
	const myUnitText = `${myUnits.length} (${mySupply}) ${base.shape}`;
	const enemyUnitText = `${enemyUnits.length} (${enemySupply}) ${enemy_base.shape}`;
	console.log(`${myUnitText} vs. ${enemyUnitText}`);
	const energyText = `Energy: ${myEnergy}/${myCapacity} vs. ${enemyEnergy}/${enemyCapacity}`;
	console.log(energyText + ` // Power Ratio: ${powerRatio.toFixed(2)}`);
	const invaderCountText = `[${invaders.near.length}/${invaders.med.length}/${invaders.far.length}]`;
	console.log(`Threat: ${invaders.threat.toFixed(2)} from ${invaderCountText} enemies`);
}
