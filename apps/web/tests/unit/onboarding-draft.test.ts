import { afterEach, describe, expect, it, vi } from "vitest";
import { readOnboardingDraft, writeOnboardingDraft } from "@/lib/onboarding-draft";
afterEach(() => vi.unstubAllGlobals());
describe("onboarding drafts", () => {
  function storage() { const data = new Map<string,string>(); vi.stubGlobal("window",{localStorage:{getItem:(k:string)=>data.get(k),setItem:(k:string,v:string)=>data.set(k,v)}}); return data; }
  it("preserves the idea, audience and desired result across reloads without sharing accounts", () => {
    storage(); const draft = {...readOnboardingDraft("alice"),step:5,showIntro:false,useCase:"An agent idea",audience:"My team",outcome:"A report",goal:"time"};
    writeOnboardingDraft("alice",draft); expect(readOnboardingDraft("alice")).toEqual(draft); expect(readOnboardingDraft("bob").useCase).toBe("");
  });
  it("retains old answers but restarts new questions for legacy drafts", () => {
    const data=storage();data.set("stack32.onboardingDraft.alice",JSON.stringify({step:4,useCase:"Keep my idea",firstName:"Ada"}));
    expect(readOnboardingDraft("alice")).toMatchObject({step:1,useCase:"Keep my idea",firstName:"Ada",version:2});
  });
  it("survives unavailable browser storage", () => {
    vi.stubGlobal("window",{localStorage:{getItem:()=>{throw new Error("blocked")},setItem:()=>{throw new Error("blocked")}}});
    expect(readOnboardingDraft("alice").step).toBe(1);expect(()=>writeOnboardingDraft("alice",readOnboardingDraft("alice"))).not.toThrow();
  });
});
