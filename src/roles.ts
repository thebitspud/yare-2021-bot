import * as Utils from "./utils";
import * as Turn from "./turn";

/** An up-to-date list of spirits, sorted by role marking */
export const register: { [key in MarkState]: Spirit[] } = {
	idle: [],
	haul: [],
	relay: [],
	attack: [],
	defend: [],
	scout: [],
	refuel: [],
};

for (const s of Turn.myUnits) register[s.mark].push(s);
const workerRatio = memory.settings.haulRelayRatio;

/** Sets the role of a spirit and updates the current role register to match */
function setRole(s: Spirit, role: MarkState) {
	if (s.mark === role) return;

	const index = register[s.mark].indexOf(s);
	if (index < 0) return;

	register[s.mark].splice(index, 1);
	register[role].push(s);
	s.set_mark(role);
	if (memory.settings.debug) s.shout(s.mark);
}

/** Updates the roles of all spirits according to current turn state */
export function update(): void {
	removeExtras();
	assignRoles();
	optimizeWorkers();
}

/** Removes units from over-saturated roles and sets them to idle */
function removeExtras() {
	const refuelable: MarkState[] = ["defend", "attack", "scout", "idle"];

	// REFUEL
	// This must be called before the other extra-removing methods
	for (const s of Turn.myUnits) {
		const energyRatio = Utils.energyRatio(s);
		// Size 1 units can be more aggressive vs squares and triangles
		const retreatThreshold =
			(Turn.vsSquares || Turn.vsTriangles) && s.size <= 1 ? 0 : 0.15;
		// Non-worker units with low energy should always retreat and refuel
		if (energyRatio <= retreatThreshold && refuelable.includes(s.mark)) {
			setRole(s, "refuel");
			continue;
		}

		// Scouts may attempt to refuel at a higher cutoff
		// Except the first one which should always be attempting to block
		if (s.mark === "scout" && s !== Turn.nearestScout) {
			if (energyRatio < 0.5 && memory.centerStar.energy > 0) {
				setRole(s, "refuel");
				continue;
			}
		}

		// Defenders can refuel if there are no potential invaders
		if (s.mark === "defend" && energyRatio < 1 && !Turn.invaders.far.length) {
			setRole(s, "refuel");
			continue;
		}

		if (energyRatio >= 0.9 && s.mark === "refuel") setRole(s, "idle");
	}

	// ATTACKERS
	if (!Turn.isAttacking && register.attack.length) {
		register.attack.forEach((s) => setRole(s, "idle"));
	}

	// DEFENDERS
	while (register.defend.length > Math.max(Turn.idealDefenders, 0)) {
		setRole(Utils.farthest(base, register.defend), "idle");
	}

	// SCOUTS
	while (register.scout.length > Math.max(Turn.idealScouts, 0)) {
		setRole(Utils.nearest(base, register.scout), "idle");
	}

	// WORKERS
	// Should generally avoid shuffling around worker roles
	if ([...register.relay, ...register.haul].length > Math.max(Turn.maxWorkers, 0) + 3) {
		const removeHauler = register.haul.length > (register.relay.length - 1) * workerRatio;
		const list = removeHauler ? register.haul : register.relay;
		if (list.length) setRole(Utils.nearest(memory.myStar, list), "idle");
	}
}

function assignRoles() {
	// ATTACKERS
	// Turn.isAttacking is delayed by 1 turn so I'm using this instead
	if (Turn.isAttacking) {
		for (const s of Turn.myUnits) {
			// When attacking, only other valid roles are defend and refuel
			const canBeAttacker =
				!["defend", "refuel"].includes(s.mark) &&
				(s !== Turn.nearestScout || memory.strategy === "all-in");
			if (canBeAttacker) setRole(s, "attack");
		}
	}

	// DEFENDERS
	while (register.defend.length < Turn.idealDefenders) {
		// Try to fill with idle units first
		const validIdle = register.idle.filter((s) => Utils.energyRatio(s) >= 0.5);
		if (validIdle.length) {
			setRole(Utils.nearest(Turn.nearestEnemy, validIdle), "defend");
			continue;
		}

		// If no idle units, try to fill with valid workers
		const validWorkers = [...register.relay, ...register.haul].filter(
			(s) => Utils.energyRatio(s) > 0.5
		);
		if (validWorkers.length) {
			setRole(Utils.nearest(Turn.nearestEnemy, validWorkers), "defend");
			continue;
		}

		// Otherwise, can fill with attackers/scouts if necessary
		const validAttackers = [...register.attack, ...register.scout].filter(
			(s) =>
				Utils.energyRatio(s) >= 0.8 &&
				Utils.inRange(base, s, 800) &&
				s.size === memory.mySize
		);
		if (validAttackers.length) {
			setRole(Utils.nearest(Turn.nearestEnemy, validAttackers), "defend");
		} else break; // If cannot fill, break to prevent infinite loop
	}

	// Case handler for preparing to defend when being all-inned
	if (Turn.enemyAllIn) {
		const mustDefend = Turn.invaders.far.length >= Turn.enemyUnits.length / 2;
		const mustGroup =
			Turn.enemyUnits.filter(
				(e) => Utils.inRange(e, base, 750) || Utils.inRange(e, memory.myStar, 650)
			).length >=
			Turn.enemyUnits.length / 2;

		if (mustDefend) {
			for (const s of Turn.myUnits) {
				if (!["defend", "refuel"].includes(s.mark)) {
					setRole(s, Utils.energyRatio(s) <= 0.5 ? "refuel" : "defend");
				}

				if (mustGroup && s.mark === "refuel" && Utils.energyRatio(s) >= 0.5) {
					setRole(s, "defend");
				}
			}
		}
	}

	// If attacking, return because we do not need other roles
	if (Turn.isAttacking) return;

	// SCOUTS
	while (register.scout.length + register.refuel.length < Turn.idealScouts) {
		// Fill with idle units when possible
		if (register.idle.length) {
			setRole(Utils.nearest(memory.centerStar, register.idle), "scout");
		} else break; // If cannot fill, break to prevent infinite loop
	}

	// WORKERS
	while (register.relay.length + register.haul.length < Turn.maxWorkers) {
		const relayRatio = workerRatio * tick < 30 ? 2 : 1;
		const addHauler = register.haul.length + 1 <= register.relay.length * relayRatio;
		const bestRole: MarkState = addHauler ? "haul" : "relay";
		const bestLocation = bestRole === "haul" ? memory.myStar : base;
		if (register.idle.length) {
			setRole(Utils.nearest(bestLocation, register.idle), bestRole);
		} else break; // If cannot fill, break to prevent infinite loop
	}
}

function optimizeWorkers() {
	// relay -> haul
	while (register.haul.length + 1 <= (register.relay.length - 1) * workerRatio) {
		if (!register.relay.length) break;
		setRole(Utils.nearest(memory.myStar, register.relay), "haul");
	}

	// haul -> relay
	if (tick >= 40) {
		while (register.haul.length - 1 > (register.relay.length + 1) * workerRatio) {
			if (!register.haul.length) break;
			setRole(Utils.nearest(base, register.haul), "relay");
		}
	}
}

/** Logs role data once per tick */
export function log() {
	const defendText = `Defenders: ${register.defend.length}/${Turn.idealDefenders}`;
	const scoutText = `Scouts: ${register.scout.length}/${Turn.idealScouts}`;
	const workerCount = register.haul.length + register.relay.length;
	const workerText = `Workers: ${workerCount}/${Turn.maxWorkers}`;

	console.log(defendText + " // " + scoutText);
	console.log(workerText + " // " + `Attackers: ${register.attack.length}`);
	console.log(`Refueling: ${register.refuel.length} // Idle: ${register.idle.length}`);
}
