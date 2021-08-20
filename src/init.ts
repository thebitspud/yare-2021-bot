import * as Utils from "./utils";
import * as pkg from "../package.json";

export const BOT_VERSION = pkg.name + " " + pkg.version;

if (memory.init !== BOT_VERSION) {
	memory = {
		init: BOT_VERSION,
		settings: {
			debug: false,
			attackSupply: 51,
			attackGroupSize: 0.7, // in [0, 1]
			haulRelayRatio: 2.6,
			maxMergeSize: 4,
		},
		config: {
			energizeRange: 200,
			sightRange: 400,
			mergeRange: 10,
			explodeRange: 160,
			explodeDamage: 10,
		},
		strategy: "economic",
		allCenter: false,
		myStar: Utils.nearest(base, Object.values(stars)),
		enemyStar: Utils.nearest(enemy_base, Object.values(stars)),
		mySize: my_spirits[0].size,
		enemySize: Object.values(spirits).filter((s) => !my_spirits.includes(s))[0].size,
		centerStar: star_p89,
		loci: {},
	};

	memory.loci = {
		baseToStar: Utils.nextPosition(base, memory.myStar),
		baseToCenter: Utils.nextPosition(base, memory.centerStar),
		starToBase: Utils.nextPosition(memory.myStar, base),
		centerToBase: Utils.nextPosition(memory.centerStar, base),
		centerToOutpost: Utils.midpoint(memory.centerStar, outpost),
		outpostAntipode: Utils.nextPosition(memory.centerStar, outpost, -198),
	};
}
