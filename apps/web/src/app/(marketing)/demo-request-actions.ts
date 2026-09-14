"use server";

import { VeroXMApp } from "@veroxm/sdk";

export interface DemoRequestInput {
  fullname: string;
  businessemail: string;
  phoneno: string;
  "company-name": string;
  "job-title"?: string;
  industry?: string;
  "organization-size"?: string;
  "interested-in"?: string;
  demopreference?: string;
  "demo-time"?: string;
  "demo-date": string;
  country?: string;
  "current-challenge"?: string;
  consent: boolean;
}

export interface DemoRequestResult {
  ok: boolean;
  error?: string;
}

// Server Action: keeps the project's static API key (Create+Read only,
// never Update/Delete) entirely server-side. The client form never sees
// it -- see apps/web/src/lib/veroxm-marketing.ts for the read-side
// equivalent of this same project connection.
export async function submitDemoRequest(input: DemoRequestInput): Promise<DemoRequestResult> {
  const projectId = process.env.VEROXM_MARKETING_PROJECT_ID ?? "";
  const apiKey = process.env.VEROXM_MARKETING_API_KEY ?? "";
  if (!projectId || !apiKey) {
    return { ok: false, error: "Demo request is not configured on this deployment." };
  }

  if (!input.fullname || input.fullname.trim().length < 2) {
    return { ok: false, error: "Please enter your full name." };
  }
  if (!input.businessemail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.businessemail)) {
    return { ok: false, error: "Please enter a valid work email." };
  }
  if (!input.phoneno) {
    return { ok: false, error: "Please enter a phone number." };
  }
  if (!input["company-name"]) {
    return { ok: false, error: "Please enter your company name." };
  }
  if (!input["demo-date"]) {
    return { ok: false, error: "Please pick a preferred demo date." };
  }
  if (!input.consent) {
    return { ok: false, error: "Please confirm consent to be contacted." };
  }

  try {
    const app = VeroXMApp.initializeApp({
      baseUrl: process.env.API_URL ?? "http://api:4000",
      projectId,
    });
    app.auth.signInWithApiKey(apiKey);
    await app.content("submit-demo-request").create({
      fullname: input.fullname.trim(),
      businessemail: input.businessemail.trim(),
      phoneno: input.phoneno.trim(),
      "company-name": input["company-name"].trim(),
      "job-title": input["job-title"]?.trim() || undefined,
      industry: input.industry || undefined,
      "organization-size": input["organization-size"] || undefined,
      "interested-in": input["interested-in"]?.trim() || undefined,
      demopreference: input.demopreference?.trim() || undefined,
      "demo-time": input["demo-time"] || undefined,
      "demo-date": input["demo-date"],
      country: input.country?.trim() || undefined,
      "current-challenge": input["current-challenge"]?.trim() || undefined,
      consent: input.consent,
    });
    return { ok: true };
  } catch (e) {
    console.error("submitDemoRequest failed", e);
    return { ok: false, error: "Something went wrong submitting your request. Please try again." };
  }
}
