import { describe, expect, it } from "vitest";
import { parseRequest } from "./parse";

describe("parseRequest — goals, budgets and engines from free text", () => {
  it("'I want more horsepower under 50k'", () => {
    expect(parseRequest("I want more horsepower under 50k")).toEqual({
      goal: "power",
      budgetMax: 50_000,
    });
  });

  it("'more power below Rs 50000'", () => {
    expect(parseRequest("more power below Rs 50000")).toEqual({
      goal: "power",
      budgetMax: 50_000,
    });
  });

  it("'Need a louder exhaust under 30 thousand'", () => {
    expect(parseRequest("Need a louder exhaust under 30 thousand")).toEqual({
      goal: "exhaust",
      budgetMax: 30_000,
    });
  });

  it("'I have 1 lakh for better brakes'", () => {
    expect(parseRequest("I have 1 lakh for better brakes")).toEqual({
      goal: "brakes",
      budgetMax: 100_000,
    });
  });

  it("'Suspension feels soft, want coilovers for 1.5 lakh'", () => {
    expect(parseRequest("Suspension feels soft, want coilovers for 1.5 lakh")).toEqual({
      goal: "suspension",
      budgetMax: 150_000,
    });
  });

  it("'new rims and tyres below 80000'", () => {
    expect(parseRequest("new rims and tyres below 80000")).toEqual({
      goal: "wheels",
      budgetMax: 80_000,
    });
  });

  it("'LED headlights under 20k'", () => {
    expect(parseRequest("LED headlights under 20k")).toEqual({
      goal: "looks",
      budgetMax: 20_000,
    });
  });

  it("'remap my diesel under 40k'", () => {
    expect(parseRequest("remap my diesel under 40k")).toEqual({
      goal: "power",
      budgetMax: 40_000,
      engine: "diesel",
    });
  });

  it("'turbo petrol tune up to 1 lakh'", () => {
    expect(parseRequest("turbo petrol tune up to 1 lakh")).toEqual({
      goal: "power",
      budgetMax: 100_000,
      engine: "petrol_turbo",
    });
  });

  it("earliest keyword wins: 'better stopping power in 25,000' is brakes", () => {
    expect(parseRequest("better stopping power in 25,000")).toEqual({
      goal: "brakes",
      budgetMax: 25_000,
    });
  });

  it("'naturally aspirated petrol, want it faster under 60k'", () => {
    expect(parseRequest("naturally aspirated petrol, want it faster under 60k")).toEqual({
      goal: "power",
      budgetMax: 60_000,
      engine: "petrol_na",
    });
  });

  it("'NA engine, exhaust sound for Rs. 15,000'", () => {
    expect(parseRequest("NA engine, exhaust sound for Rs. 15,000")).toEqual({
      goal: "exhaust",
      budgetMax: 15_000,
      engine: "petrol_na",
    });
  });

  it("'want to lower the car and stiffen the handling, budget 45k'", () => {
    expect(parseRequest("want to lower the car and stiffen the handling, budget 45k")).toEqual({
      goal: "suspension",
      budgetMax: 45_000,
    });
  });

  it("'petrol car needs better lights, 10k max'", () => {
    expect(parseRequest("petrol car needs better lights, 10k max")).toEqual({
      goal: "looks",
      budgetMax: 10_000,
      engine: "petrol_na",
    });
  });

  it("'1.5 lakh for alloy wheels'", () => {
    expect(parseRequest("1.5 lakh for alloy wheels")).toEqual({
      goal: "wheels",
      budgetMax: 150_000,
    });
  });

  it("'diesel, more power, under 2 lakh'", () => {
    expect(parseRequest("diesel, more power, under 2 lakh")).toEqual({
      goal: "power",
      budgetMax: 200_000,
      engine: "diesel",
    });
  });

  it("'50,000 budget for brakes'", () => {
    expect(parseRequest("50,000 budget for brakes")).toEqual({
      goal: "brakes",
      budgetMax: 50_000,
    });
  });

  it("Indian comma format: 'show me some style under 1,00,000'", () => {
    expect(parseRequest("show me some style under 1,00,000")).toEqual({
      goal: "looks",
      budgetMax: 100_000,
    });
  });

  it("'₹75,000 for a loud exhaust'", () => {
    expect(parseRequest("₹75,000 for a loud exhaust")).toEqual({
      goal: "exhaust",
      budgetMax: 75_000,
    });
  });

  it("a model year is not a budget: 'my 2018 car needs brakes'", () => {
    expect(parseRequest("my 2018 car needs brakes")).toEqual({ goal: "brakes" });
  });

  it("understands nothing in 'hello there' or an empty string", () => {
    expect(parseRequest("hello there")).toEqual({});
    expect(parseRequest("")).toEqual({});
    expect(parseRequest("   ")).toEqual({});
  });

  it("budget-only and engine-only sentences fill just those fields", () => {
    expect(parseRequest("under 50k")).toEqual({ budgetMax: 50_000 });
    expect(parseRequest("it is a diesel")).toEqual({ engine: "diesel" });
  });
});
