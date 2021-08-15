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
	retreat: [],
};

for (const role in register) {
	register[<MarkState>role] = Turn.myUnits.filter((s) => s.mark === role);
}

const workerRatio = memory.settings.haulRelayRatio;

/** Sets the role of a spirit and updates the current role register to match */
function setRole(s: Spirit, role: MarkState) {
	if (s.mark === role) return;

	const index = register[s.mark].indexOf(s);
	if (index != -1) register[s.mark].splice(index);

	s.set_mark(role);
	register[role].push(s);
}

/** Updates the roles of all spirits according to current turn state */
export function update(): void {
	removeExtras();
	assignRoles();
	optimizeWorkers();
}

/** Removes units from over-saturated roles and sets them to idle */
function removeExtras() {
	const retreatable: MarkState[] = ["defend", "attack", "scout", "idle"];

	// RETREAT
	// This must be called before the other extra-removing methods
	for (const s of Turn.myUnits) {
		const energyRatio = Utils.energyRatio(s);
		// Non-worker units with low energy should always retreat and refill
		if (energyRatio < 0.2 && retreatable.includes(s.mark)) {
			setRole(s, "retreat");
		}

		if (energyRatio >= 0.9 && s.mark === "retreat") {
			setRole(s, "idle");
		}
	}

	// ATTACKERS
	if (!Turn.isAttacking && register.attack.length > 0) {
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
	while ([...register.haul, ...register.relay].length > Math.max(Turn.maxWorkers, 0)) {
		const removeHauler = register.haul.length > (register.relay.length - 1) * workerRatio;
		const list = removeHauler ? register.haul : register.relay;
		if (list.length > 0) setRole(Utils.nearest(memory.myStar, list), "idle");
		else break;
	}
}

function assignRoles() {
	// ATTACKERS
	if (Turn.isAttacking) {
		for (const s of Turn.myUnits) {
			// When attacking, only other valid role is defense
			if (s.mark !== "defend") setRole(s, "attack");
		}
	}

	// DEFENDERS
	while (register.defend.length < Turn.idealDefenders) {
		// Try to fill with idle units first
		const validIdle = register.idle.filter((s) => Utils.energyRatio(s) >= 0.5);
		if (validIdle.length) {
			setRole(Utils.nearest(base, validIdle), "defend");
			continue;
		}

		// If no idle units, try to fill with valid workers
		const workers = [...register.haul, ...register.relay];
		const validWorkers = workers.filter((s) => Utils.energyRatio(s) > 0.5);
		if (validWorkers.length) {
			setRole(Utils.nearest(base, validWorkers), "defend");
			continue;
		}

		// If attacking, can fill with attackers
		const validAttackers = register.attack.filter(
			(s) => Utils.energyRatio(s) === 1 && Utils.dist(s, base) < 800 && s.size === 1
		);
		if (validAttackers.length) {
			setRole(Utils.nearest(base, validAttackers), "defend");
		} else break; // If cannot fill, break to prevent infinite loop
	}

	// If attacking, return because we do not need other roles
	if (Turn.isAttacking) return;

	// SCOUTS
	while (register.scout.length + register.retreat.length < Turn.idealScouts) {
		// Fill with idle units when possible
		if (register.idle.length) {
			setRole(Utils.nearest(memory.centerStar, register.idle), "scout");
		} else break; // If cannot fill, break to prevent infinite loop
	}

	// WORKERS
	while (register.relay.length + register.haul.length < Turn.maxWorkers) {
		const addHauler = register.haul.length + 1 <= register.relay.length * workerRatio;
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
	while (register.haul.length - 1 > (register.relay.length + 1) * workerRatio) {
		if (!register.haul.length) break;
		setRole(Utils.nearest(memory.loci.baseToStar, register.haul), "relay");
	}
}

/** Logs role data once per tick */
export function log() {
	const defendString = `Defenders: ${register.defend.length}/${Turn.idealDefenders}`;
	const scoutString = `Scouts: ${register.scout.length}/${Turn.idealScouts}`;
	const workerCount = register.haul.length + register.relay.length;
	const workerString = `Workers: ${workerCount}/${Turn.maxWorkers}`;

	console.log(defendString + " // " + scoutString);
	console.log(workerString + " // " + `Attackers: ${register.attack.length}`);
	console.log(`Retreating: ${register.attack.length} // Idle: ${register.idle.length}`);
}
