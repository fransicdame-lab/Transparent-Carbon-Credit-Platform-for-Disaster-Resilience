import { describe, it, expect, beforeEach } from "vitest";
import { ClarityValue, stringUtf8CV, uintCV, principalCV, booleanCV, optionalCV, someCV, noneCV, tupleCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_AMOUNT = 101;
const ERR_NOT_VERIFIED = 102;
const ERR_INSUFFICIENT_BALANCE = 104;
const ERR_MINT_PAUSED = 107;
const ERR_BURN_PAUSED = 108;
const ERR_INVALID_RECIPIENT = 109;
const ERR_MAX_SUPPLY_EXCEEDED = 105;
const ERR_INVALID_METADATA = 103;
const ERR_INVALID_PROJECT_TYPE = 115;
const ERR_INVALID_LOCATION = 114;
const ERR_INVALID_FEE = 121;
const ERR_ALREADY_ISSUED = 111;
const ERR_MAX_ISSUERS_EXCEEDED = 120;
const ERR_INVALID_ISSUER = 110;
const ERR_INVALID_GRACE_PERIOD = 123;
const ERR_INVALID_RETIREMENT_REASON = 124;

type Result<T> = { ok: boolean; value: T };

interface CreditMetadata {
  offsetAmount: number;
  timestamp: number;
  location: string;
  projectType: string;
  verifier: string;
  status: boolean;
}

interface CreditRetirement {
  reason: string;
  timestamp: number;
  retiree: string;
}

class CarbonCreditTokenMock {
  state: {
    totalSupply: number;
    mintPaused: boolean;
    burnPaused: boolean;
    admin: string;
    issuanceFee: number;
    maxIssuers: number;
    issuerCount: number;
    gracePeriod: number;
    tokenUri: string;
    balances: Map<string, number>;
    allowances: Map<string, number>;
    issuers: Map<string, boolean>;
    creditMetadata: Map<number, CreditMetadata>;
    creditRetirements: Map<number, CreditRetirement>;
  } = this.resetState();
  blockHeight: number = 0;
  caller: string = "ST1ADMIN";
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];
  maxSupply: number = 1000000000;

  private resetState() {
    return {
      totalSupply: 0,
      mintPaused: false,
      burnPaused: false,
      admin: "ST1ADMIN",
      issuanceFee: 1000,
      maxIssuers: 100,
      issuerCount: 0,
      gracePeriod: 144,
      tokenUri: "https://example.com/carbon-credit-metadata.json",
      balances: new Map<string, number>(),
      allowances: new Map<string, number>(),
      issuers: new Map<string, boolean>(),
      creditMetadata: new Map<number, CreditMetadata>(),
      creditRetirements: new Map<number, CreditRetirement>(),
    };
  }

  reset() {
    this.state = this.resetState();
    this.blockHeight = 0;
    this.caller = "ST1ADMIN";
    this.stxTransfers = [];
  }

  getBalance(account: string): number {
    return this.state.balances.get(account) ?? 0;
  }

  getTotalSupply(): Result<number> {
    return { ok: true, value: this.state.totalSupply };
  }

  getName(): Result<string> {
    return { ok: true, value: "Carbon Credit" };
  }

  getSymbol(): Result<string> {
    return { ok: true, value: "CCREDIT" };
  }

  getDecimals(): Result<number> {
    return { ok: true, value: 6 };
  }

  getTokenUri(): Result<string | null> {
    return { ok: true, value: this.state.tokenUri };
  }

  getAllowance(owner: string, spender: string): number {
    const key = `${owner}-${spender}`;
    return this.state.allowances.get(key) ?? 0;
  }

  getCreditMetadata(creditId: number): CreditMetadata | null {
    return this.state.creditMetadata.get(creditId) ?? null;
  }

  getCreditRetirement(creditId: number): CreditRetirement | null {
    return this.state.creditRetirements.get(creditId) ?? null;
  }

  isIssuer(account: string): boolean {
    return this.state.issuers.get(account) ?? false;
  }

  transfer(amount: number, sender: string, recipient: string): Result<boolean> {
    if (this.caller !== sender) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (amount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    if (recipient === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_RECIPIENT };
    if (this.getBalance(sender) < amount) return { ok: false, value: ERR_INSUFFICIENT_BALANCE };
    this.state.balances.set(sender, this.getBalance(sender) - amount);
    this.state.balances.set(recipient, this.getBalance(recipient) + amount);
    return { ok: true, value: true };
  }

  approve(spender: string, amount: number): Result<boolean> {
    if (amount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    const key = `${this.caller}-${spender}`;
    this.state.allowances.set(key, amount);
    return { ok: true, value: true };
  }

  transferFrom(owner: string, recipient: string, amount: number): Result<boolean> {
    const allowanceKey = `${owner}-${this.caller}`;
    const allowance = this.getAllowance(owner, this.caller);
    if (amount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    if (recipient === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_RECIPIENT };
    if (allowance < amount) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.getBalance(owner) < amount) return { ok: false, value: ERR_INSUFFICIENT_BALANCE };
    this.state.balances.set(owner, this.getBalance(owner) - amount);
    this.state.balances.set(recipient, this.getBalance(recipient) + amount);
    this.state.allowances.set(allowanceKey, allowance - amount);
    return { ok: true, value: true };
  }

  mint(amount: number, recipient: string, offsetAmount: number, location: string, projectType: string, verifier: string): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.state.mintPaused) return { ok: false, value: ERR_MINT_PAUSED };
    if (amount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    if (recipient === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_RECIPIENT };
    if (offsetAmount <= 0 || location.length === 0 || projectType.length === 0) return { ok: false, value: ERR_INVALID_METADATA };
    if (!["forest", "renewable", "soil"].includes(projectType)) return { ok: false, value: ERR_INVALID_PROJECT_TYPE };
    if (location.length === 0 || location.length > 100) return { ok: false, value: ERR_INVALID_LOCATION };
    if (this.state.totalSupply + amount > this.maxSupply) return { ok: false, value: ERR_MAX_SUPPLY_EXCEEDED };
    this.state.balances.set(recipient, this.getBalance(recipient) + amount);
    this.state.totalSupply += amount;
    const creditId = this.state.totalSupply;
    this.state.creditMetadata.set(creditId, { offsetAmount, timestamp: this.blockHeight, location, projectType, verifier, status: true });
    this.stxTransfers.push({ amount: this.state.issuanceFee, from: this.caller, to: this.state.admin });
    return { ok: true, value: true };
  }

  burn(amount: number, reason: string): Result<boolean> {
    if (this.state.burnPaused) return { ok: false, value: ERR_BURN_PAUSED };
    if (amount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    if (reason.length === 0) return { ok: false, value: ERR_INVALID_RETIREMENT_REASON };
    if (this.getBalance(this.caller) < amount) return { ok: false, value: ERR_INSUFFICIENT_BALANCE };
    this.state.balances.set(this.caller, this.getBalance(this.caller) - amount);
    this.state.totalSupply -= amount;
    const creditId = this.state.totalSupply;
    this.state.creditRetirements.set(creditId, { reason, timestamp: this.blockHeight, retiree: this.caller });
    return { ok: true, value: true };
  }

  addIssuer(newIssuer: string): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newIssuer === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_RECIPIENT };
    if (this.isIssuer(newIssuer)) return { ok: false, value: ERR_ALREADY_ISSUED };
    if (this.state.issuerCount >= this.state.maxIssuers) return { ok: false, value: ERR_MAX_ISSUERS_EXCEEDED };
    this.state.issuers.set(newIssuer, true);
    this.state.issuerCount += 1;
    return { ok: true, value: true };
  }

  removeIssuer(issuer: string): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!this.isIssuer(issuer)) return { ok: false, value: ERR_INVALID_ISSUER };
    this.state.issuers.delete(issuer);
    this.state.issuerCount -= 1;
    return { ok: true, value: true };
  }

  setIssuanceFee(newFee: number): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newFee <= 0) return { ok: false, value: ERR_INVALID_FEE };
    this.state.issuanceFee = newFee;
    return { ok: true, value: true };
  }

  pauseMint(): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.mintPaused = true;
    return { ok: true, value: true };
  }

  unpauseMint(): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.mintPaused = false;
    return { ok: true, value: true };
  }

  pauseBurn(): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.burnPaused = true;
    return { ok: true, value: true };
  }

  unpauseBurn(): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.burnPaused = false;
    return { ok: true, value: true };
  }

  setTokenUri(newUri: string): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.tokenUri = newUri;
    return { ok: true, value: true };
  }

  setGracePeriod(newPeriod: number): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newPeriod > 1440) return { ok: false, value: ERR_INVALID_GRACE_PERIOD };
    this.state.gracePeriod = newPeriod;
    return { ok: true, value: true };
  }
}

describe("CarbonCreditToken", () => {
  let contract: CarbonCreditTokenMock;

  beforeEach(() => {
    contract = new CarbonCreditTokenMock();
    contract.reset();
  });

  it("mints tokens successfully", () => {
    const result = contract.mint(1000, "ST1USER", 1000, "ForestA", "forest", "ST1VERIFIER");
    expect(result.ok).toBe(true);
    expect(contract.getBalance("ST1USER")).toBe(1000);
    expect(contract.state.totalSupply).toBe(1000);
    expect(contract.stxTransfers).toEqual([{ amount: 1000, from: "ST1ADMIN", to: "ST1ADMIN" }]);
    const metadata = contract.getCreditMetadata(1000);
    expect(metadata?.offsetAmount).toBe(1000);
    expect(metadata?.projectType).toBe("forest");
  });

  it("rejects mint when paused", () => {
    contract.pauseMint();
    const result = contract.mint(1000, "ST1USER", 1000, "ForestA", "forest", "ST1VERIFIER");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MINT_PAUSED);
  });

  it("transfers tokens successfully", () => {
    contract.mint(1000, "ST1USER", 1000, "ForestA", "forest", "ST1VERIFIER");
    contract.caller = "ST1USER";
    const result = contract.transfer(500, "ST1USER", "ST2USER");
    expect(result.ok).toBe(true);
    expect(contract.getBalance("ST1USER")).toBe(500);
    expect(contract.getBalance("ST2USER")).toBe(500);
  });

  it("rejects transfer with insufficient balance", () => {
    contract.mint(1000, "ST1USER", 1000, "ForestA", "forest", "ST1VERIFIER");
    contract.caller = "ST1USER";
    const result = contract.transfer(1500, "ST1USER", "ST2USER");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INSUFFICIENT_BALANCE);
  });

  it("approves and transfers from successfully", () => {
    contract.mint(1000, "ST1OWNER", 1000, "ForestA", "forest", "ST1VERIFIER");
    contract.caller = "ST1OWNER";
    contract.approve("ST1SPENDER", 600);
    contract.caller = "ST1SPENDER";
    const result = contract.transferFrom("ST1OWNER", "ST2RECIPIENT", 500);
    expect(result.ok).toBe(true);
    expect(contract.getBalance("ST1OWNER")).toBe(500);
    expect(contract.getBalance("ST2RECIPIENT")).toBe(500);
    expect(contract.getAllowance("ST1OWNER", "ST1SPENDER")).toBe(100);
  });

  it("burns tokens successfully", () => {
    contract.mint(1000, "ST1USER", 1000, "ForestA", "forest", "ST1VERIFIER");
    contract.caller = "ST1USER";
    const result = contract.burn(500, "Offset emissions");
    expect(result.ok).toBe(true);
    expect(contract.getBalance("ST1USER")).toBe(500);
    expect(contract.state.totalSupply).toBe(500);
    const retirement = contract.getCreditRetirement(500);
    expect(retirement?.reason).toBe("Offset emissions");
  });

  it("rejects burn when paused", () => {
    contract.mint(1000, "ST1USER", 1000, "ForestA", "forest", "ST1VERIFIER");
    contract.pauseBurn();
    contract.caller = "ST1USER";
    const result = contract.burn(500, "Offset emissions");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_BURN_PAUSED);
  });

  it("adds and removes issuer successfully", () => {
    const addResult = contract.addIssuer("ST1ISSUER");
    expect(addResult.ok).toBe(true);
    expect(contract.isIssuer("ST1ISSUER")).toBe(true);
    expect(contract.state.issuerCount).toBe(1);
    const removeResult = contract.removeIssuer("ST1ISSUER");
    expect(removeResult.ok).toBe(true);
    expect(contract.isIssuer("ST1ISSUER")).toBe(false);
    expect(contract.state.issuerCount).toBe(0);
  });

  it("sets issuance fee successfully", () => {
    const result = contract.setIssuanceFee(2000);
    expect(result.ok).toBe(true);
    expect(contract.state.issuanceFee).toBe(2000);
  });

  it("sets grace period successfully", () => {
    const result = contract.setGracePeriod(288);
    expect(result.ok).toBe(true);
    expect(contract.state.gracePeriod).toBe(288);
  });

  it("rejects invalid grace period", () => {
    const result = contract.setGracePeriod(1441);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_GRACE_PERIOD);
  });

  it("rejects mint with invalid project type", () => {
    const result = contract.mint(1000, "ST1USER", 1000, "ForestA", "invalid", "ST1VERIFIER");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PROJECT_TYPE);
  });

  it("rejects mint exceeding max supply", () => {
    contract.maxSupply = 1000;
    contract.mint(1000, "ST1USER", 1000, "ForestA", "forest", "ST1VERIFIER");
    const result = contract.mint(1, "ST1USER", 1, "ForestB", "forest", "ST1VERIFIER");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_SUPPLY_EXCEEDED);
  });

  it("rejects add issuer when max exceeded", () => {
    contract.state.maxIssuers = 0;
    const result = contract.addIssuer("ST1ISSUER");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_ISSUERS_EXCEEDED);
  });
});