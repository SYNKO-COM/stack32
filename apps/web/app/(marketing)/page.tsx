import { Hero } from "@/components/marketing/hero";
import {
  Benefits,
  ExampleAgents,
  FaqPreview,
  FinalCta,
  HowItWorks,
  PricingPreview,
} from "@/components/marketing/sections";

export default function HomePage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <ExampleAgents />
      <Benefits />
      <FaqPreview />
      <PricingPreview />
      <FinalCta />
    </>
  );
}
