import SiteHeader from "@/components/SiteHeader";
import ParallaxHero from "@/components/ParallaxHero";
import ScrollSequence from "@/components/ScrollSequence";
import HowItWorks from "@/components/HowItWorks";
import CategoriesIntro from "@/components/CategoriesIntro";
import Finish from "@/components/Finish";
import Stance from "@/components/Stance";
import Power from "@/components/Power";
import ClosingCTA from "@/components/ClosingCTA";

export default function Home() {
  return (
    <main>
      <SiteHeader />
      <ParallaxHero />
      {/* The "AutoMod AI / See the mod..." statement that used to live in
          its own section right here now appears as the closing beat of the
          rotation sequence itself (see ScrollSequence's RevealClosingCopy) —
          no need to repeat it immediately after. */}
      <ScrollSequence />
      <HowItWorks />
      <CategoriesIntro />
      <Finish />
      <Stance />
      <Power />
      <ClosingCTA />
    </main>
  );
}
