import { z } from "zod";

/** Shared validation primitives. Real domain schemas belong to the owning service/story, not here. */

export const paginationSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(200),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

export * from "./return-url";
