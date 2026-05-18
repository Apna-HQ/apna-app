"use client"
import HomeLauncher from "@/components/templates/HomeLauncher";
import BottomNav from "@/components/organisms/BottomNav";

export default function ExplorePage() {
  return (
    <>
      <div className="min-h-[100dvh] overflow-x-hidden bg-shell text-ink">
        <HomeLauncher />
      </div>
      <BottomNav />
    </>
  );
}
