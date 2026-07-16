import { describe, it, expect } from "vitest";
import { fetchAll } from "./data";

describe("fetchAll (PostgREST pagination)", () => {
  it("returns empty array when first page is empty", async () => {
    const page = async () => ({ data: [] as number[] });
    expect(await fetchAll(page)).toEqual([]);
  });

  it("returns empty array when data is null", async () => {
    const page = async () => ({ data: null as number[] | null });
    expect(await fetchAll(page)).toEqual([]);
  });

  it("fetches single page under 1000 rows", async () => {
    const rows = Array.from({ length: 500 }, (_, i) => i);
    const page = async (from: number, to: number) => ({
      data: rows.slice(from, Math.min(to + 1, rows.length)),
    });
    const result = await fetchAll(page);
    expect(result).toHaveLength(500);
    expect(result[0]).toBe(0);
    expect(result[499]).toBe(499);
  });

  it("fetches exactly 1000 rows — must try a second page to confirm done (known bug: silent truncation)", async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => i);
    let callCount = 0;
    const page = async (from: number, to: number) => {
      callCount++;
      return { data: rows.slice(from, Math.min(to + 1, rows.length)) };
    };
    const result = await fetchAll(page);
    expect(result).toHaveLength(1000);
    expect(callCount).toBe(2);
  });

  it("fetches 1001 rows across two pages", async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => i);
    const page = async (from: number, to: number) => ({
      data: rows.slice(from, Math.min(to + 1, rows.length)),
    });
    const result = await fetchAll(page);
    expect(result).toHaveLength(1001);
  });

  it("fetches 2500 rows across three pages", async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => i);
    let callCount = 0;
    const page = async (from: number, to: number) => {
      callCount++;
      return { data: rows.slice(from, Math.min(to + 1, rows.length)) };
    };
    const result = await fetchAll(page);
    expect(result).toHaveLength(2500);
    expect(callCount).toBe(3);
  });

  it("returns 0 rows without error", async () => {
    const page = async () => ({ data: [] as string[] });
    const result = await fetchAll(page);
    expect(result).toEqual([]);
  });
});
