import * as Utils from "./utils";
import * as pkg from "../package.json";

export const BOT_VERSION = pkg.name + " " + pkg.version;

if (memory.init !== BOT_VERSION) {
	memory = {
		init: BOT_VERSION,
		config: {
			energizeRange: 200,
			sightRange: 400,
			mergeRange: 10,
			explodeRange: 160,
			explodeDamage: 10,
		},
		strategy: "economic",
		refuelCenter: false,
		retakeActive: false,
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
		centerToOutpost: Utils.nextPosition(memory.centerStar, outpost),
		outpostAntipode: Utils.nextPosition(memory.centerStar, outpost, -198),
		enemyBaseAntipode: Utils.nextPosition(enemy_base, memory.enemyStar, -398),
	};
}

export const settings = {
	debug: false,
	allInSupply: 51,
	doRetakes: true,
	retakeSupply: 51,
	attackGroupSize: 0.7, // float in [0, 1]
	haulRelayRatio: 2.6,
	maxMergeSize: 4, // 1 to never merge
	attackGuards: 3,
	minScouts: 1,
	extraScouts: true,
};
