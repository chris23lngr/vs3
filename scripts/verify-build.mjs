import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const PACKAGE_DIR = path.resolve(process.cwd(), "packages/vs3");
const PACKAGE_JSON_PATH = path.join(PACKAGE_DIR, "package.json");
const MAX_SINGLE_JS_BYTES = 750_000;
const MAX_TOTAL_JS_BYTES = 2_000_000;

const readPackageJson = async () => {
	const raw = await readFile(PACKAGE_JSON_PATH, "utf-8");
	return JSON.parse(raw);
};

const resolveExportTargets = (exportsField) => {
	if (typeof exportsField === "string") {
		return [exportsField];
	}

	if (exportsField && typeof exportsField === "object") {
		return Object.values(exportsField).flatMap((value) =>
			resolveExportTargets(value),
		);
	}

	return [];
};

const verifyExportTargets = async (packageJson) => {
	const exportTargets = resolveExportTargets(packageJson.exports);
	const uniqueTargets = [...new Set(exportTargets)];

	if (uniqueTargets.length === 0) {
		throw new Error("No export targets found in package.json.");
	}

	const stats = await Promise.all(
		uniqueTargets.map(async (target) => {
			const normalizedTarget = target.replace(/^\.\//, "");
			const targetPath = path.join(PACKAGE_DIR, normalizedTarget);
			const fileStats = await stat(targetPath);
			return { target, targetPath, size: fileStats.size };
		}),
	);

	return stats;
};

const verifyBundleSize = (stats) => {
	const jsStats = stats.filter((entry) => entry.target.endsWith(".js"));
	const totalJsBytes = jsStats.reduce((sum, entry) => sum + entry.size, 0);

	for (const entry of jsStats) {
		if (entry.size > MAX_SINGLE_JS_BYTES) {
			throw new Error(
				`Bundle size exceeded for ${entry.target}: ${entry.size} bytes (max ${MAX_SINGLE_JS_BYTES}).`,
			);
		}
	}

	if (totalJsBytes > MAX_TOTAL_JS_BYTES) {
		throw new Error(
			`Total JS bundle size exceeded: ${totalJsBytes} bytes (max ${MAX_TOTAL_JS_BYTES}).`,
		);
	}
};

const verifyExportsResolve = (packageJson) => {
	const requireFromPackage = createRequire(PACKAGE_JSON_PATH);

	for (const exportKey of Object.keys(packageJson.exports ?? {})) {
		const specifier =
			exportKey === "."
				? packageJson.name
				: `${packageJson.name}${exportKey.slice(1)}`;
		requireFromPackage(specifier);
	}
};

const main = async () => {
	const packageJson = await readPackageJson();
	const stats = await verifyExportTargets(packageJson);
	verifyBundleSize(stats);
	verifyExportsResolve(packageJson);
};

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
