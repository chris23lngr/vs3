import type z from "zod";
import type { fileInfoSchema } from "../schemas/file";

export type FileInfo = z.infer<typeof fileInfoSchema>;
