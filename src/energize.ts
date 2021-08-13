import * as Utils from "./utils";
import * as Turn from "./turn";

export function energize(s: Spirit): void {
	const energyRatio = s.energy / s.energy_capacity;

	// if owned by enemy, shoot at outpost
	if (Utils.inRange(s, outpost) && outpost.control !== this_player_id && !Turn.isAttacking) {
		s.energize(outpost);
	}

	// if possible, energize enemy base
	let beamingBase = false;
	if (
		Utils.inRange(s, enemy_base) &&
		enemy_base.energy >= -enemy_base.sight.enemies_beamable.length
	) {
		s.energize(enemy_base);
		beamingBase = true;
	}

	// always attack enemies in range, overriding other energize commands
	if (s.sight.enemies_beamable.length > 0 && energyRatio > 0.0) {
		for (const enemy of s.sight.enemies_beamable) {
			if (spirits[enemy].energy >= 0) {
				s.energize(spirits[enemy]);
				spirits[enemy].energy -= s.size * 2;
				beamingBase = false;
				break;
			}
		}
	}

	if (beamingBase) enemy_base.energy -= s.size * 2;
}
