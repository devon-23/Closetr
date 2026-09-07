import { LoginForm } from "@/components/auth/LoginForm";
import { Panel } from "@/components/ui/Panel";

export const metadata = { title: "My Closet — Sign In" };

/**
 * Reads `next` and `error` on the server and passes them down, rather
 * than calling useSearchParams in the form — that would force the page
 * into a client-side bailout and need a Suspense boundary.
 */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <div className="mx-auto max-w-sm py-10">
      <p className="display mb-4 text-center text-sm text-[var(--color-accent)]">
        <span className="twinkle">★</span> hello!!!{" "}
        <span className="twinkle">★</span>
      </p>

      <Panel title="Sign In">
        <p className="mb-3 text-[var(--color-ink-soft)]">
          pop in your email and we&apos;ll send you a magic link. no password
          to remember.
        </p>

        {error && (
          <p role="alert" className="mb-3 text-[11px] text-[#a03050]">
            ✗ {error}
          </p>
        )}

        <LoginForm next={next} />
      </Panel>

      <p className="microcopy mt-4 text-center">
        your closet is private. only you can see it.
      </p>
    </div>
  );
}
