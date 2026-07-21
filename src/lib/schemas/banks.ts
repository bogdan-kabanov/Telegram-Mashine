import { z } from "zod";

export const bankSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  shortName: z.string().min(1),
  country: z.string().length(2),
  clabePrefix: z.string().optional(),
  supportsTransfer: z.boolean().default(true),
});

export const banksConfigSchema = z.object({
  payoutBanks: z.array(bankSchema).min(1),
  depositBanks: z.array(bankSchema).min(1),
});

export type Bank = z.infer<typeof bankSchema>;
export type BanksConfig = z.infer<typeof banksConfigSchema>;
