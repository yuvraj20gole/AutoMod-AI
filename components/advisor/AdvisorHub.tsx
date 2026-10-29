"use client";

import Image from "next/image";
import { useState } from "react";
import AddCarButton from "@/components/dashboard/cars/AddCarButton";
import AdvisorClient from "@/components/advisor/AdvisorClient";

export type AdvisorHubCar = {
  id: string;
  make: string;
  model: string;
  year: number | null;
  photoUrl: string | null;
};

type Session =
  | { kind: "car"; car: AdvisorHubCar; key: string }
  | { kind: "general"; key: string };

const card =
  "rounded-2xl border border-neutral-200 bg-white p-5 transition-colors";

/**
 * Advisor landing + chat host.
 *  - Choices: chat about one of my cars / add a new car / just chat.
 *  - Picking a *different* car or switching to general remounts the chat
 *    (fresh conversation, via `key`). "Change car" only hides the chat and
 *    shows the choices again, so choosing the same option resumes it.
 */
export default function AdvisorHub({
  cars,
  initialCarId,
}: {
  cars: AdvisorHubCar[];
  initialCarId: string | null;
}) {
  const initialCar = initialCarId ? cars.find((c) => c.id === initialCarId) ?? null : null;
  const [session, setSession] = useState<Session | null>(
    initialCar ? { kind: "car", car: initialCar, key: `car-${initialCar.id}-0` } : null
  );
  const [showChoices, setShowChoices] = useState(!initialCar);
  const [counter, setCounter] = useState(1);

  function chooseCar(car: AdvisorHubCar) {
    if (session?.kind === "car" && session.car.id === car.id) {
      // Same car: resume the existing chat.
      setShowChoices(false);
      return;
    }
    setSession({ kind: "car", car, key: `car-${car.id}-${counter}` });
    setCounter((n) => n + 1);
    setShowChoices(false);
  }

  function chooseGeneral() {
    if (session?.kind === "general") {
      setShowChoices(false);
      return;
    }
    setSession({ kind: "general", key: `general-${counter}` });
    setCounter((n) => n + 1);
    setShowChoices(false);
  }

  return (
    <div>
      {showChoices && (
        <div className="space-y-6">
          {session && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-3">
              <p className="text-sm text-neutral-700">
                You have a chat in progress
                {session.kind === "car"
                  ? ` for your ${session.car.year ? `${session.car.year} ` : ""}${session.car.make} ${session.car.model}`
                  : " (general)"}
                .
              </p>
              <button
                type="button"
                onClick={() => setShowChoices(false)}
                className="rounded-full border border-neutral-300 px-4 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:border-amber-500 hover:bg-amber-50"
              >
                Back to chat
              </button>
            </div>
          )}

          <section>
            <h2 className="font-display text-lg font-semibold tracking-tight text-neutral-900">
              Chat about one of my cars
            </h2>
            {cars.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-600">
                You haven&apos;t added a car yet — add one below, or just chat in general.
              </p>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {cars.map((car) => {
                  const active = session?.kind === "car" && session.car.id === car.id;
                  return (
                    <button
                      key={car.id}
                      type="button"
                      onClick={() => chooseCar(car)}
                      className={`overflow-hidden rounded-2xl border bg-white text-left transition-colors hover:border-amber-500 ${
                        active ? "border-amber-500" : "border-neutral-200"
                      }`}
                    >
                      <div className="relative aspect-[4/3] w-full bg-neutral-100">
                        {car.photoUrl ? (
                          <Image
                            src={car.photoUrl}
                            alt={`${car.make} ${car.model}`}
                            fill
                            className="object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-sm text-neutral-400">
                            No photo
                          </div>
                        )}
                      </div>
                      <div className="p-4">
                        <p className="text-sm font-semibold text-neutral-900">
                          {car.year ? `${car.year} ` : ""}
                          {car.make} {car.model}
                        </p>
                        <p className="mt-0.5 text-xs text-neutral-500">
                          {active ? "Resume chat" : "Chat about this car"}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <section className={card}>
              <h2 className="font-display text-base font-semibold tracking-tight text-neutral-900">
                Add a new car and chat
              </h2>
              <p className="mt-1 text-sm text-neutral-600">
                Upload a photo and details, then jump straight into the advisor for it.
              </p>
              <div className="mt-4">
                <AddCarButton
                  redirectTo={(id) => `/dashboard/advisor?carId=${id}`}
                  label="+ Add a car"
                />
              </div>
            </section>

            <section className={card}>
              <h2 className="font-display text-base font-semibold tracking-tight text-neutral-900">
                Just chat in general
              </h2>
              <p className="mt-1 text-sm text-neutral-600">
                No car needed — tell the advisor what you drive, or get general guidance.
              </p>
              <button
                type="button"
                onClick={chooseGeneral}
                className="mt-4 rounded-full border border-amber-500 px-5 py-2 text-sm font-semibold text-neutral-900 transition-colors hover:bg-amber-50"
              >
                {session?.kind === "general" ? "Resume general chat" : "Start chatting"}
              </button>
            </section>
          </div>
        </div>
      )}

      {session && (
        <div className={showChoices ? "hidden" : undefined}>
          <AdvisorClient
            key={session.key}
            car={
              session.kind === "car"
                ? {
                    id: session.car.id,
                    make: session.car.make,
                    model: session.car.model,
                    year: session.car.year,
                  }
                : null
            }
            generalMode={session.kind === "general"}
            onChangeCar={() => setShowChoices(true)}
          />
        </div>
      )}
    </div>
  );
}
