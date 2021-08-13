import * as Cfg from "./config";
import * as Utils from "./utils";

/* MEMORY INITIALIZATION */

if (!(memory?.init === Cfg.BOT_VERSION)) {
	memory = {
		init: Cfg.BOT_VERSION,
		strategy: "economic",
		allCenter: false,
		myStar: Utils.nearest(base, Object.values(stars)),
		enemyStar: Utils.nearest(enemy_base, Object.values(stars)),
		loci: {},
	};

	memory.loci = {
		baseToStar: Utils.nextPosition(base, memory.myStar),
		baseToCenter: Utils.nextPosition(base, Cfg.CENTER_STAR),
		starToBase: Utils.nextPosition(memory.myStar, base),
		centerToBase: Utils.nextPosition(Cfg.CENTER_STAR, base),
		centerToOutpost: Utils.midpoint(Cfg.CENTER_STAR, outpost),
		outpostAntipode: Utils.add(Utils.vectorTo(outpost, Cfg.CENTER_STAR), Cfg.CENTER_STAR.position),
	};
}

/* FRIENDLY UNITS */

export const myUnits = my_spirits.filter((s) => s.hp > 0);

export let myEnergy = 0;
export let myCapacity = 0;

for (const s of myUnits) {
	myEnergy += s.energy;
	myCapacity += s.energy_capacity;
}

/* ENEMY UNITS */

export const enemyUnits = Object.values(spirits).filter((s) => !my_spirits.includes(s) && s.hp > 0);

export const sqrEnemy = enemy_base.shape === "squares";
export const triEnemy = enemy_base.shape === "triangles";
export const enemyShapePower = sqrEnemy ? 0.6 : triEnemy ? 0.85 : 1;

export let outpostEnemyPower = 0;
export let enemyEnergy = 0;
export let enemyCapacity = 0;

/**
 * NOTE: there is no overlap between <near>, <mid>, and <far>
 * Use [...invaders.near, ...invaders.mid, ...invaders.far] for combined list
 */
export const invaders: { near: Spirit[]; med: Spirit[]; far: Spirit[]; threat: number } = {
	near: [],
	med: [],
	far: [],
	threat: 0,
};

for (const e of enemyUnits) {
	const baseDist = Utils.dist(e, base);
	if (baseDist <= 800) {
		if (baseDist <= 600) {
			if (baseDist <= 400) {
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

	enemyEnergy += e.energy;
	enemyCapacity += e.energy_capacity;
}

/* ROLE COUNT */

export const idealDefenders = Math.ceil(invaders.threat / (my_spirits[0].energy_capacity ?? 10));
export const idealScouts = Math.ceil(2 / my_spirits[0].size) + Math.ceil(myUnits.length / 8);
export const maxMainHarvesters = Utils.energyPerTick(memory.myStar) * 4;
export const canHarvestCenter = Cfg.CENTER_STAR.energy > 0 && outpost.control === this_player_id;

/* MACRO STRATEGY */

export const isAttacking = ["rally", "all-in"].includes(memory.strategy);
const powerRatio = myEnergy / (enemyEnergy * enemyShapePower);
const canBeatBase = myEnergy * 2 > enemy_base.energy;
const canBeatAll = myCapacity > enemy_base.energy + enemyCapacity * enemyShapePower * 2;
const readyToAttack = myUnits.length > Cfg.MAX_SUPPLY || canBeatAll;

// Starting an all-in attack
if (!isAttacking && readyToAttack && canBeatBase) {
	memory.strategy = "rally";
	memory.allCenter = Cfg.CENTER_STAR.energy * 1.2 >= myCapacity - myEnergy;
}

// Retreating if bot cannot win fight
if (!canBeatBase && powerRatio <= 1) {
	memory.strategy = "economic";
	memory.allCenter = false;
}

export const rallyStar = memory.allCenter ? Cfg.CENTER_STAR : memory.myStar;
export const rallyPosition = memory.allCenter
	? memory.loci.centerToOutpost
	: Utils.nextPosition(base, memory.loci.outpostAntipode);

if (memory.strategy === "rally") {
	let groupedSpirits = 0;
	for (const spirit of my_spirits) {
		if (Utils.dist(spirit, rallyPosition) <= 50) {
			groupedSpirits++;
		}
	}

	if (groupedSpirits >= (myUnits.length - idealDefenders) * 0.9) {
		memory.strategy = "all-in";
	}
}

/* LOGGING TURN DATA */

console.log(`${this_player_id} // ${Cfg.BOT_VERSION} // Turn ${tick}`);
console.log(`Macro:  ${memory.strategy} // Attacking: ${isAttacking}`);
console.log(`${myUnits.length} ${base.shape} vs. ${enemyUnits.length} ${enemy_base.shape}`);
const energyString = `Energy: ${myEnergy}/${myCapacity} vs. ${enemyEnergy}/${enemyCapacity}`;
console.log(energyString + ` // Power Ratio: ${powerRatio.toFixed(2)}`);
const invaderCountString = `[${invaders.near.length}/${invaders.med.length}/${invaders.far.length}]`;
console.log(`Threat: ${invaders.threat.toFixed(2)} from ${invaderCountString} enemies`);
console.log("Defenders: " + idealDefenders + " // Scouts: " + idealScouts);
console.log("Harvesters: " + maxMainHarvesters + " // Harvest Center: " + canHarvestCenter);
