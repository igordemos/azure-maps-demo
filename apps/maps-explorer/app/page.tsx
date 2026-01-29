import EndpointForm from "./(components)/EndpointForm";
import ReferenceValues from "./(components)/ReferenceValues";

export default function Home() {
  return (
    <main className="min-h-screen px-6 py-10 lg:px-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
        <header className="flex flex-col gap-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/60 bg-white/70 px-4 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-500 shadow-sm">
            Azure Maps Demo
          </div>
          <div className="flex flex-col gap-3">
            <h1 className="text-4xl font-semibold text-slate-900 md:text-5xl">
              Azure Maps API Explorer
            </h1>
            <p className="max-w-2xl text-base text-slate-600 md:text-lg">
              A secure playground for geocoding, reverse geocoding, autocomplete, routing, weather,
              and IP geolocation scenarios.
            </p>
          </div>
        </header>
        <EndpointForm />
        <ReferenceValues />
      </div>
    </main>
  );
}
