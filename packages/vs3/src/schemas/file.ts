import z from "zod";

export const fileInfoSchema = z.object({
	name: z.string(),
	size: z.number(),
	contentType: z.string(),
});
