import { z } from "zod";

// ── warframe.market v2: GET /items ──

export const WfmItemSchema = z.object({
  id: z.string(),
  slug: z.string(),
  i18n: z
    .object({
      en: z.object({ name: z.string() }).optional(),
    })
    .optional(),
  tags: z.array(z.string()).default([]),
  ducats: z.number().nullable().optional(),
  maxRank: z.number().nullable().optional(),
});

export type WfmItem = z.infer<typeof WfmItemSchema>;

export const WfmItemsResponseSchema = z.object({
  data: z.array(WfmItemSchema),
});

export type WfmItemsResponse = z.infer<typeof WfmItemsResponseSchema>;

// ── warframe.market v1: GET /items/{url_name}/statistics ──

export const WfmStatRowSchema = z.object({
  datetime: z.string(),
  mod_rank: z.number().optional(),
  volume: z.number(),
  median: z.number(),
  avg_price: z.number(),
  min_price: z.number(),
  max_price: z.number(),
});

export type WfmStatRow = z.infer<typeof WfmStatRowSchema>;

export const WfmStatisticsResponseSchema = z.object({
  payload: z.object({
    statistics_closed: z.object({
      "90days": z.array(WfmStatRowSchema).default([]),
    }),
  }),
});

export type WfmStatisticsResponse = z.infer<typeof WfmStatisticsResponseSchema>;

// ── warframe.market v2: GET /orders/item/{url_name} ──

export const WfmOrderSchema = z.object({
  type: z.string(),
  user: z.object({
    status: z.string(),
    ingameName: z.string(),
  }),
  platinum: z.number(),
  quantity: z.number().default(1),
  modRank: z.number().nullable().optional(),
});

export type WfmOrder = z.infer<typeof WfmOrderSchema>;

export const WfmOrdersResponseSchema = z.object({
  data: z.array(WfmOrderSchema),
});

export type WfmOrdersResponse = z.infer<typeof WfmOrdersResponseSchema>;

// ── warframestat.us: GET /pc/voidTrader ──

export const VoidTraderInventoryItemSchema = z.object({
  item: z.string(),
  ducats: z.number(),
  credits: z.number(),
});

export type VoidTraderInventoryItem = z.infer<
  typeof VoidTraderInventoryItemSchema
>;

export const VoidTraderResponseSchema = z.object({
  activation: z.string(),
  expiry: z.string(),
  location: z.string().nullable().optional(),
  active: z.boolean().optional(),
  inventory: z.array(VoidTraderInventoryItemSchema).default([]),
});

export type VoidTraderResponse = z.infer<typeof VoidTraderResponseSchema>;
