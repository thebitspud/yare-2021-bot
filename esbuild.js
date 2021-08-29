const fs = require("fs");
const os = require("os");
const path = require("path");
const sync = require("yare-sync");
const esbuild = require("esbuild");
const watch = require("node-watch");

require("colors");

function input() {
	return new Promise((r) => {
		process.stdin.once("data", (d) => {
			r(d);
		});
	});
}

const flags = process.argv.splice(2);

const shouldWatch = flags.includes("-w") || flags.includes("--watch");
const shouldSync = flags.includes("-s") || flags.includes("--sync");
const switchAcc = flags.includes("-a") || flags.includes("--switch-acc");
const autoUpload = flags.includes("-u") || flags.includes("--auto-upload");

const usingTs = fs.existsSync(path.join(__dirname, "src/main.ts"));
const usingJs = fs.existsSync(path.join(__dirname, "src/main.js"));

if (!usingJs && !usingTs) {
	console.log("You don't have a main file smh my head");
	process.exit(0);
}

let mainFile = usingJs ? "src/main.js" : "src/main.ts";

const esbuildConfig = {
	entryPoints: [mainFile],
	bundle: true,
	minify: false,
	outfile: "dist/bundle.js",
	treeShaking: true,
	target: "es2020",
};

let acc = null;

async function build() {
	let result = esbuild.buildSync(esbuildConfig);

	if (result.errors.length > 0) return console.error("Build failed :(".red.bold);
	else console.log("Built successfully".green.bold);

	if (autoUpload) console.log("Auto-upload enabled".green.bold);
	if (shouldSync) await upload();
}

/** @type {string[]} */
const uploadedGames = [];
let uploadTimer;

async function upload() {
	let code = fs.readFileSync(esbuildConfig.outfile, "utf-8");
	let games = await sync.getGames(acc.user_id);
	games = games.filter((g) => !uploadedGames.includes(g.id));
	let successful = await sync.sendCode(code, games, acc);
	if (successful) {
		if (games.length > 0) {
			console.log(
				"Uploaded your code to these games:".green.bold,
				games.map((g) => (g ? `${g.server}/${g.id}` : g))
			);
			uploadedGames.push(...games.map((g) => g.id));
		}
	} else {
		console.error("Upload to yare failed.".red.bold);
	}

	uploadTimer = setTimeout(() => upload(), 15000);
}

function login() {
	return new Promise(async (resolve) => {
		console.log("Log in to yare to enable yare-sync".bold);
		console.log("Username:");
		let username = ((await input()) + "").split("\n")[0].split("\r")[0];
		console.log("Password (SHOWN):");
		let password = ((await input()) + "").split("\n")[0].split("\r")[0];
		console.log("Trying to log in as".yellow, username);
		let acc = sync.login(username, password).catch(async () => {
			console.log("Invalid username or password, try again".red.bold);
			resolve(await login());
		});
		if (acc) resolve(acc);
	});
}

async function main() {
	if (shouldSync) {
		let savedSessionFilePath = path.join(os.tmpdir(), "yare-sync-last-session.json");
		if (fs.existsSync(savedSessionFilePath) && !switchAcc) {
			let savedSessionFile = JSON.parse(fs.readFileSync(savedSessionFilePath, "utf-8"));
			console.log("Found previous session".blue);
			if (sync.verifySession(savedSessionFile)) {
				console.log("Session was valid! Using that".green);
				acc = savedSessionFile;
			} else {
				console.log("Invalid session".red);
			}
		}
		if (acc === null) {
			acc = await login();
		}
		console.log("Logged in as".green.bold, acc.user_id, "\n");
		fs.writeFileSync(savedSessionFilePath, JSON.stringify(acc), "utf-8");
	}

	await build();

	if (shouldWatch) {
		watch(
			path.dirname(mainFile),
			{
				recursive: true,
			},
			(_, file) => {
				console.log("File change".yellow, file);
				uploadedGames.splice(0, uploadedGames.length);
				clearTimeout(uploadTimer);
				build();
			}
		);
	}
}

main();
