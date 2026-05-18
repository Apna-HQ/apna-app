import AppList from "@/components/organisms/AppList";
import SubmitApp from "@/components/organisms/SubmitApp";
import { useProfile } from "@/lib/hooks/useProfile";

export default function HomeLauncherComponent() {
    const { loading, error } = useProfile();

    if (loading) {
        return (
            <div className="flex min-h-[calc(100dvh-3rem)] items-center justify-center bg-shell">
                <p className="text-ink-3">Initializing profile...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex min-h-[calc(100dvh-3rem)] items-center justify-center bg-shell">
                <p className="text-danger">Failed to initialize profile: {error}</p>
            </div>
        );
    }

    return (
        <div className="min-h-[calc(100dvh-3rem)] overflow-x-hidden bg-shell text-ink">
            <div className="mx-auto w-full max-w-5xl px-4 py-6 pb-8 md:px-8">
                <header className="mb-6 border-b border-ink/10 pb-5">
                    <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
                        Store
                    </p>
                    <div className="mt-1 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                        <div>
                            <h1 className="text-3xl font-semibold tracking-normal text-ink">
                                Explore Mini-Apps
                            </h1>
                            <p className="mt-2 max-w-xl text-sm text-ink-3">
                                Find mini-apps that run inside Apna with shell-owned identity and permissions.
                            </p>
                        </div>
                    </div>
                </header>
                <SubmitApp />
                <AppList />
            </div>
        </div>
    );
}
