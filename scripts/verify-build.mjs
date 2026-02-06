import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const PACKAGE_DIR = path.resolve(process.cwd(), "packages/vs3");
const PACKAGE_JSON_PATH = path.join(PACKAGE_DIR, "package.json");
const MAX_SINGLE_JS_BYTES = 750_000;
const MAX_FORMAT_TOTAL_JS_BYTES = 2_000_000;

const RESOLUTION_ERROR_CODES = new Set([
	"ERR_MODULE_NOT_FOUND",
	"ERR_PACKAGE_PATH_NOT_EXPORTED",
	"ERR_PACKAGE_IMPORT_NOT_DEFINED",
	"ERR_UNSUPPORTED_DIR_IMPORT",
]);

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
	const esmStats = stats.filter((entry) => entry.target.endsWith(".js"));
	const cjsStats = stats.filter((entry) => entry.target.endsWith(".cjs"));

	for (const entry of [...esmStats, ...cjsStats]) {
		if (entry.size > MAX_SINGLE_JS_BYTES) {
			throw new Error(
				`Bundle size exceeded for ${entry.target}: ${entry.size} bytes (max ${MAX_SINGLE_JS_BYTES}).`,
			);
		}
	}

	const esmTotal = esmStats.reduce((sum, entry) => sum + entry.size, 0);
	const cjsTotal = cjsStats.reduce((sum, entry) => sum + entry.size, 0);

	if (esmTotal > MAX_FORMAT_TOTAL_JS_BYTES) {
		throw new Error(
			`ESM total bundle size exceeded: ${esmTotal} bytes (max ${MAX_FORMAT_TOTAL_JS_BYTES}).`,
		);
	}

	if (cjsTotal > MAX_FORMAT_TOTAL_JS_BYTES) {
		throw new Error(
			`CJS total bundle size exceeded: ${cjsTotal} bytes (max ${MAX_FORMAT_TOTAL_JS_BYTES}).`,
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

const verifyDualFormat = async (packageJson) => {
	for (const [exportKey, conditions] of Object.entries(
		packageJson.exports ?? {},
	)) {
		const importCondition = conditions?.import;
		const requireCondition = conditions?.require;

		if (!importCondition?.default) {
			throw new Error(`Missing import condition for export "${exportKey}".`);
		}
		if (!requireCondition?.default) {
			throw new Error(`Missing require condition for export "${exportKey}".`);
		}
		if (!importCondition?.types) {
			throw new Error(`Missing import types condition for export "${exportKey}".`);
		}
		if (!requireCondition?.types) {
			throw new Error(
				`Missing require types condition for export "${exportKey}".`,
			);
		}

		const esmPath = path.join(
			PACKAGE_DIR,
			importCondition.default.replace(/^\.\//, ""),
		);
		const cjsPath = path.join(
			PACKAGE_DIR,
			requireCondition.default.replace(/^\.\//, ""),
		);
		const esmTypesPath = path.join(
			PACKAGE_DIR,
			importCondition.types.replace(/^\.\//, ""),
		);
		const cjsTypesPath = path.join(
			PACKAGE_DIR,
			requireCondition.types.replace(/^\.\//, ""),
		);

		await stat(esmPath);
		await stat(cjsPath);
		await stat(esmTypesPath);
		await stat(cjsTypesPath);
	}
};

const verifyEsmImports = async (packageJson) => {
	for (const exportKey of Object.keys(packageJson.exports ?? {})) {
		const specifier =
			exportKey === "."
				? packageJson.name
				: `${packageJson.name}${exportKey.slice(1)}`;

		try {
			await import(specifier);
		} catch (error) {
			if (RESOLUTION_ERROR_CODES.has(error.code)) {
				throw new Error(`ESM import failed for "${specifier}": ${error.message}`);
			}
			// Runtime evaluation errors (e.g. missing optional peer deps) are
			// expected in CI — resolution succeeded, so the export is valid.
		}
	}
};

const main = async () => {
	const packageJson = await readPackageJson();
	const stats = await verifyExportTargets(packageJson);
	verifyBundleSize(stats);
	verifyExportsResolve(packageJson);
	await verifyDualFormat(packageJson);
	await verifyEsmImports(packageJson);
};

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
