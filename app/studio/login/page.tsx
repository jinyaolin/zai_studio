import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="font-serif text-4xl">zai</h1>
          <p className="text-stone-500 text-sm mt-1">創作端登入</p>
        </div>
        <LoginForm next={searchParams.next} />
      </div>
    </div>
  );
}
