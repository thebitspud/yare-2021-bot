import * as Cfg from "./config";
import * as Turn from "./turn";
import * as Utils from "./utils";

const loci = memory.loci;

export function moveUnit(s: Spirit, i: number): void {
	const energyRatio = s.energy / s.energy_capacity;

	const enemies = s.sight.enemies;
	const friends = s.sight.friends;

	let dangerRating = 0;
	for (const enemy of enemies) {
		if (Utils.dist(spirits[enemy], s) <= 220) {
			dangerRating += spirits[enemy].energy;
		}
	}

	let groupPower = s.energy;
	for (const friend of friends) {
		if (Utils.dist(spirits[friend], s) <= 50) {
			groupPower += spirits[friend].energy;
		}
	}

	const onEnemySide = Utils.dist(s, base) * 1.1 > Utils.dist(s, enemy_base);

	const closeInvaders = [...Turn.invaders.near, ...Turn.invaders.med];

	switch (<MarkState>s.mark) {
		case "attack":
			if (energyRatio < 1.0 && Turn.rallyStar.energy > 10 && memory.strategy !== "all-in") {
				s.move(Utils.nextPosition(Turn.rallyStar, Turn.rallyPosition));
				s.energize(s);
			} else if (
				memory.strategy === "all-in" &&
				energyRatio >= dangerRating / groupPower &&
				energyRatio > 0
			) {
				if (!onEnemySide && outpost.control !== this_player_id) s.move(loci.outpostAntipode);
				else moveIntoRange(s, enemy_base);
				s.energize(s);
			} else if (
				(Cfg.CENTER_STAR.energy >= Turn.myCapacity - Turn.myEnergy ||
					outpost.control !== this_player_id) &&
				energyRatio > 0 &&
				Turn.rallyStar === Cfg.CENTER_STAR &&
				Utils.inRange(s, outpost)
			) {
				s.move(loci.centerToOutpost);
				s.energize(outpost);
			} else {
				s.move(Turn.rallyPosition);
				s.energize(s);
			}
			break;
		case "defend":
			if (energyRatio === 1.0 || (closeInvaders.length && energyRatio > 0.5)) {
				if (closeInvaders.length && groupPower > dangerRating)
					s.move(Utils.nextPosition(base, Utils.nearest(s, closeInvaders)));
				else s.move(loci.baseToStar);
			} else {
				s.move(loci.starToBase);
				s.energize(s);
			}
			break;
		case "scout":
			if (
				dangerRating >= groupPower ||
				((s.sight.enemies_beamable.length || Turn.outpostEnemyPower > 0) && energyRatio === 0) ||
				(Utils.inRange(s, memory.myStar) && energyRatio < 1.0)
			) {
				s.move(Utils.nextPosition(memory.myStar, outpost));
				s.energize(s);
			} else if (
				energyRatio > 0 &&
				(energyRatio >= 0.5 || Utils.inRange(s, outpost)) &&
				(outpost.energy < Math.max(25, Turn.outpostEnemyPower) ||
					outpost.control !== this_player_id)
			) {
				s.move(
					Cfg.CENTER_STAR.active_in < 25
						? loci.centerToOutpost
						: Utils.nextPosition(outpost, memory.myStar)
				);
				s.energize(outpost);
			} else if (
				energyRatio >= 0.5 &&
				(energyRatio === 1.0 || !Utils.inRange(s, Cfg.CENTER_STAR) || Cfg.CENTER_STAR.active_in > 0)
			) {
				if (Math.max(dangerRating, Turn.outpostEnemyPower) < groupPower) {
					s.move(Utils.nextPosition(enemy_base, outpost, 400));
				} else s.move(loci.centerToOutpost);
			} else {
				if (
					((Cfg.CENTER_STAR.active_in > 25 ||
						Utils.dist(s, Cfg.CENTER_STAR) > Utils.dist(s, memory.myStar)) &&
						energyRatio <= 0.25) ||
					(Utils.inRange(s, memory.myStar) && energyRatio < 1.0)
				) {
					s.move(Utils.nextPosition(memory.myStar, Cfg.CENTER_STAR));
				} else s.move(loci.centerToOutpost);

				s.energize(s);
			}
			break;
		case "deposit":
			if (i < Turn.idealScouts + Turn.maxMainHarvesters || outpost.control !== this_player_id) {
				s.move(loci.baseToStar);
			} else if (Turn.canHarvestCenter) {
				s.move(loci.baseToCenter);
			} else {
				s.move(Utils.nextPosition(base, Utils.nearest(s, Object.values(stars))));
			}

			s.energize(base);
			break;
		case "harvest":
			if (i < Turn.idealScouts && outpost.control === this_player_id) {
				if (
					Cfg.CENTER_STAR.active_in > 25 ||
					Utils.dist(s, Cfg.CENTER_STAR) > Utils.dist(s, memory.myStar)
				) {
					s.move(Utils.nextPosition(memory.myStar, Cfg.CENTER_STAR));
				} else s.move(loci.centerToOutpost);
			} else if (
				i < Turn.idealScouts + Turn.maxMainHarvesters ||
				s.sight.structures.includes(memory.myStar.id) ||
				outpost.control !== this_player_id
			) {
				s.move(loci.starToBase);
			} else if (Turn.canHarvestCenter || s.sight.structures.includes(Cfg.CENTER_STAR.id)) {
				s.move(loci.centerToBase);
			} else {
				s.move(Utils.nextPosition(Utils.nearest(s, Object.values(stars)), base));
			}

			s.energize(s);
			break;
	}
}

/**
 * Moves the given spirit into range of a target and no further
 * @param spirit player unit to receive move command
 * @param target position or entity to move towards
 */
function moveIntoRange(spirit: Spirit, target: Position | Entity) {
	if ("position" in target) target = target.position;
	if (!Utils.inRange(spirit, target)) {
		spirit.move(target);
	}
}
