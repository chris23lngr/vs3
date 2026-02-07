import { promises as fs } from "node:fs";
import path from "node:path";
import { cn } from "@/lib/utils";

export default async function AsciiBucket({
	className,
	...props
}: React.ComponentProps<"pre">) {
	const filePath = path.join(process.cwd(), "public", "bucket.txt");
	const asciiArt = await fs.readFile(filePath, "utf8");

	return (
		<pre
			className={cn("select-none whitespace-pre font-mono", className)}
			{...props}
		>
			{asciiArt}
		</pre>
	);
}
