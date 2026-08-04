import { AuthModal } from "@/components/auth/auth-modal";
import { Footer } from "@/components/marketing/footer";
import { Navbar } from "@/components/marketing/navbar";
import { AnimatedBackground } from "@/components/shared/animated-background";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen">
      <AnimatedBackground variant="marketing" />
      <Navbar />
      <main>{children}</main>
      <Footer />
      <AuthModal />
    </div>
  );
}
